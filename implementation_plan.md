# Implementation Plan

[Overview]
Transform the current stdio-based Headline Vibes MCP server into a remotely hosted, production-grade intelligence service that ingests, scores, stores, and serves daily headline signals (aggregate and by political affiliation) with efficient historical backfill for 18 months, token-aware NewsAPI usage, anomaly detection, and modern MCP SDK 1.17+ capabilities.

This implementation migrates the server to the latest MCP SDK with HTTP/SSE transport for remote hosting on Railway, introduces a modular architecture (ingestion, scoring, persistence, scheduling, alerts), and adds robust data models and APIs/tools to expose daily scores and history to EquityMultiple’s demand/growth models. The plan fixes NewsAPI request compliance (no mixing of sources with country/category), normalizes source mapping using source.id when available, and implements a token-budget manager to maximize 18-month historical coverage within the current premium plan window. It also adds structured results via MCP output schemas, progress notifications, and optional resource listings for discoverability. The system curates multiple daily scores per grouping (aggregate, left, center, right), including attention-grabbiness, investor sentiment, general sentiment, bias intensity, novelty/surprise, and volatility shock, with anomaly alerts delivered via MCP notifications and pluggable webhooks.

[Types]  
Extend and formalize a typed schema for ingestion, scoring, storage, and tool I/O.

Type definitions and validation:
- Article (from NewsAPI)
  - id: string | null (source.id from NewsAPI)
  - sourceName: string (article.source.name)
  - title: string (1..512 chars)
  - publishedAt: string (ISO-8601)
  - url?: string (optional)
- SourceId
  - type: string (kebab-case identifier if available, derived from id or normalized name)
- PoliticalLeaning
  - type: 'left' | 'center' | 'right'
- HeadlineRecord
  - title: string
  - sourceId: string
  - sourceName: string
  - publishedDate: string (YYYY-MM-DD)
  - leaning: PoliticalLeaning
- ScoreDimensions
  - attention: number (0..10) — “attention-grabbiness” scale
  - investorSentiment: number (0..10) — normalized from weighted lexicon
  - generalSentiment: number (0..10) — normalized from sentiment comparator
  - biasIntensity: number (0..10) — magnitude of leaning divergence (between left and right vs center baseline)
  - novelty: number (0..10) — rarity/surprise vs rolling 30/90-day baselines
  - volShock: number (0..10) — deviation in daily variance vs rolling baselines
- DailyScores
  - date: string (YYYY-MM-DD, UTC)
  - grouping: 'aggregate' | PoliticalLeaning
  - counts:
    - totalHeadlines: number
    - relevantHeadlines: number
    - sources: number
  - distributions:
    - bySource: Record&lt;string, number&gt;
    - byLeaning: Record&lt;PoliticalLeaning | 'other', number&gt;
  - keyTerms: Record&lt;string, number&gt; (investor lexicon term frequencies)
  - sampleHeadlines: string[] (0..5)
  - scores: ScoreDimensions
  - meta:
    - method: 'sourcesOnly' | 'countryCategoryOnly' | 'mixedSafe' (we will use sourcesOnly for compliance)
    - pageCount: number
    - apiCalls: number
- UsageStats
  - date: string (YYYY-MM-DD)
  - requests: number
  - articlesFetched: number
  - rateLimitRemaining?: number
- Anomaly
  - date: string
  - grouping: DailyScores['grouping']
  - metric: keyof ScoreDimensions
  - value: number
  - zScore: number
  - threshold: number
  - direction: 'positive' | 'negative'

Validation rules:
- All scores are 0..10 inclusive floats with 2 decimal rounding for storage.
- Dates must be UTC normalized (YYYY-MM-DD).
- For mapping, prefer article.source.id; fallback to normalized name (lowercase, spaces → '-').

Relational schema (PostgreSQL):
- Table: daily_scores
  - date (date, not null)
  - grouping (text, not null, check in ('aggregate','left','center','right'))
  - scores (jsonb, not null) — ScoreDimensions
  - counts (jsonb, not null)
  - distributions (jsonb, not null)
  - key_terms (jsonb, not null)
  - samples (jsonb, not null)
  - meta (jsonb, not null)
  - created_at (timestamptz default now())
  - updated_at (timestamptz default now())
  - UNIQUE (date, grouping)
- Table: usage_stats
  - date (date not null primary key)
  - requests int not null
  - articles_fetched int not null
  - rate_limit_remaining int null
  - updated_at timestamptz default now()
- Table: ingestion_log
  - id bigserial primary key
  - date date not null
  - page int not null
  - endpoint text not null
  - params jsonb not null
  - articles int not null
  - created_at timestamptz default now()

Redis (caching) keys:
- cache:newsapi:day:{YYYY-MM-DD}:sources:{sha1(params)} → array of Article (TTL configurable)
- cache:scores:day:{YYYY-MM-DD}:{grouping} → DailyScores (TTL configurable)
- lock:backfill:{YYYY-MM} → to avoid duplicate jobs

Pinecone (optional for future):
- Namespace: headline-vibes
- Vector schema: embedding (1536 or model-specific), metadata { date, sourceId, leaning, titleHash }
- Use for future semantic analyses; not required for initial scoring flows.

[Files]
Introduce a modular, testable structure while preserving CLI/stdio dev ergonomics and enabling HTTP/SSE for Railway.

New files:
- src/config.ts — config loader (env vars: NEWS_API_KEY, TRANSPORT, PORT, PG_URI, REDIS_URL, PINECONE_*, RATE_LIMITS, BACKFILL_*).
- src/types.ts — all shared types (from [Types]).
- src/constants/sources.ts — PREFERRED_SOURCES and SOURCE_CATEGORIZATION; now keyed by source.id where possible.
- src/utils/date.ts — parseDate, normalizeDate, monthRange utilities.
- src/utils/normalize.ts — normalization helpers (0..10 mapping), text normalization.
- src/services/newsapi.ts — NewsAPI client (axios) with compliant parameterization and pagination; supports sources-only for top-headlines; everything for historical ranges.
- src/services/budgetManager.ts — token/request budget estimation, throttling policy, rolling counters; supports 18-month backfill plan.
- src/services/scoring.ts — scoring engines: attention, investor/general sentiment, bias intensity, novelty, volShock.
- src/services/categorization.ts — source id/name normalization and leaning mapping; default fallback center.
- src/services/anomaly.ts — rolling baselines, z-score detection, alert event generation.
- src/persistence/postgres.ts — CRUD for daily_scores, usage_stats, ingestion_log; migrations bootstrap.
- src/persistence/redis.ts — cache layer and distributed locks.
- src/persistence/pinecone.ts — optional embeddings storage (scoped off via env feature flag).
- src/jobs/backfill.ts — historical backfill driver (18 months full coverage), chunked by month/day with throttle and retries.
- src/jobs/dailyIngest.ts — scheduled daily ingestion and scoring pipeline.
- src/alerts/notifier.ts — pluggable sinks (console, webhook). MCP notifications for anomalies and run progress.
- src/server/transports/http.ts — StreamableHTTPServerTransport/SSEServerTransport setup for Railway (PORT).
- src/server/transports/stdio.ts — StdioServerTransport for dev.
- src/server/index.ts — server bootstrap choosing transport based on env.
- src/tools/analyzeHeadlines.ts — refactored daily analysis tool.
- src/tools/analyzeMonthly.ts — refactored monthly analysis tool.
- src/tools/getScores.ts — get persisted scores for a date or range.
- src/tools/backfill.ts — trigger and monitor backfill job (admin).
- src/tools/budgetStatus.ts — report current NewsAPI budget usage and forecast.
- src/index.mts — thin entrypoint importing src/server/index.ts (migration shim) or replaced entirely.

Existing files to modify:
- package.json — upgrade dependencies, add new deps and scripts (start:http, start:stdio, migrate, test).
- tsconfig.json — include new dirs and test config.
- README.md — update usage for HTTP transport, Railway deployment, new tools, environment variables.
- src/index.mts — split monolith; keep as shim for compatibility or replace with bootstrap.

Files to delete or move:
- Move current src/index.mts logic into new modular structure; keep existing file as a minimal bootstrap calling server/index.ts for backward compatibility, then deprecate in future.

Configuration updates:
- Add .env.example (not committed secrets) for NEWS_API_KEY, PG_URI, REDIS_URL, PORT, TRANSPORT, etc.
- Railway service config docs: set PORT, TRANSPORT=http, NEWS_API_KEY, PG/REDIS secrets.

[Functions]
Add new functions and refactor existing ones to clear modules with explicit signatures.

New functions:
- src/services/newsapi.ts
  - fetchTopHeadlinesByDate(date: string, opts: { sources: string[], pageCap: number }): Promise&lt;Article[]&gt;
  - fetchEverythingRange(start: string, end: string, opts: { sources: string[], pageCap: number }): Promise&lt;Article[]&gt;
  - note: enforce NewsAPI compliance: if sources provided, omit country/category.
- src/services/budgetManager.ts
  - estimateBackfillCost(days: number, pagesPerDay: number): { requests: number, feasible: boolean }
  - shouldThrottle(): boolean
  - recordRequest(count: number): void
- src/services/scoring.ts
  - scoreAttention(headlines: string[]): number
  - scoreInvestor(headlines: string[]): { score: number, keyTerms: Record&lt;string, number&gt; }
  - scoreGeneral(headlines: string[]): number
  - scoreBiasIntensity(byLeaning: Record&lt;PoliticalLeaning, number&gt;): number
  - scoreNovelty(todayTerms: Record&lt;string, number&gt;, baselineTerms: Record&lt;string, number&gt;): number
  - scoreVolShock(today: number[], baseline: number[]): number
  - normalize(value: number, range: { min: number, max: number }): number
- src/services/categorization.ts
  - sourceToLeaning(id?: string | null, name?: string): PoliticalLeaning
  - normalizeSourceId(name?: string): string
- src/services/anomaly.ts
  - detectAnomalies(date: string, scores: Record&lt;string, ScoreDimensions&gt;, baselines: any): Anomaly[]
- src/persistence/postgres.ts
  - upsertDailyScores(record: DailyScores): Promise&lt;void&gt;
  - getDailyScores(date: string): Promise&lt;DailyScores[]&gt;
  - getScoresRange(start: string, end: string): Promise&lt;DailyScores[]&gt;
  - writeUsageStats(stats: UsageStats): Promise&lt;void&gt;
  - getRollingBaselines(metric: keyof ScoreDimensions, window: number): Promise&lt;any&gt;
- src/jobs/backfill.ts
  - runBackfill(startMonth: string, endMonth: string, mode: 'full' | 'sampled'): Promise&lt;void&gt;
- src/jobs/dailyIngest.ts
  - runDailyIngest(date: string): Promise&lt;DailyScores[]&gt;
- src/alerts/notifier.ts
  - notifyAnomalies(anomalies: Anomaly[]): Promise&lt;void&gt;

Modified functions (moved/refactored from current src/index.mts):
- parseDate(input: string): string — move to src/utils/date.ts
- analyzeHeadlinesForDate(date: string) — split into ingestion, filtering, categorization, scoring, persistence, return DailyScores[]
- analyzeMonthlyHeadlines(startMonth: string, endMonth: string) — refactor to use fetchEverythingRange and pipeline per month with persisted output

Removed functions:
- None strictly removed; monolithic in-class methods are extracted to modules. The class-based server registers tool handlers only.

[Classes]
Streamline server class and encapsulate services where appropriate.

New classes:
- EnhancedHeadlineVibesServer (src/server/index.ts)
  - wraps MCP Server instance
  - registers tools with outputSchema and progress notifications
  - supports Stdio and HTTP transports
- NewsApiClient (src/services/newsapi.ts)
  - encapsulates axios and compliant parameter handling, pagination, retries
- ScoreEngine (src/services/scoring.ts)
  - orchestrates all score dimensions
- BudgetManager (src/services/budgetManager.ts)
  - tracks usage, estimates feasibility, throttles backfill
- AnomalyDetector (src/services/anomaly.ts)
  - computes z-scores vs baselines and triggers alerts

Modified classes:
- HeadlineSentimentServer → replaced by EnhancedHeadlineVibesServer with modular handlers
  - add outputSchema for tool results
  - add progress notifications during long jobs
  - add resource listings (optional) for latest scores or usage stats

Removed classes:
- None; existing class superseded by new EnhancedHeadlineVibesServer

[Dependencies]
Upgrade MCP SDK and add production services and testing.

Dependency changes:
- Upgrade: "@modelcontextprotocol/sdk": "^1.17.4"
- Add runtime:
  - "pino": "^9.x" (structured logging)
  - "axios": "^1.7.x" (already present)
  - "ioredis": "^5.x"
  - "pg": "^8.x"
  - "@pinecone-database/pinecone": "^3.x" (optional feature flag)
  - "date-fns": "^3.x"
  - "node-cron": "^3.x"
  - "zod": "^3.x" (runtime validation)
  - "rate-limiter-flexible": "^5.x" (API call throttling)
- Keep:
  - "chrono-node", "sentiment"
- Dev:
  - "jest": "^29.x", "@types/jest": "^29.x", "ts-jest": "^29.x"
  - "typescript" stays
- Scripts:
  - "start:http": "node ./build/server/http.mjs" (or bootstrap via index with TRANSPORT)
  - "start:stdio": "node ./build/server/stdio.mjs"
  - "migrate": "node ./build/persistence/migrate.mjs"
  - "test": "jest --passWithNoTests"
  - "build": "tsc --pretty &amp;&amp; chmod +x build/index.mjs"

[Testing]
Adopt layered tests to ensure correctness and budget safety.

Testing approach:
- Unit tests:
  - scoring.spec.ts — all score dimensions and normalization boundaries
  - categorization.spec.ts — source id/name mapping and fallbacks
  - date.spec.ts — parseDate and month ranges
  - budget.spec.ts — feasibility estimates and throttling decisions
- Integration tests (mocked axios):
  - newsapi.spec.ts — pagination, param compliance (no mixing sources with country/category), error handling
  - pipeline.spec.ts — daily ingest end-to-end producing DailyScores with fixtures
- Persistence tests (Docker/local services optional):
  - postgres.spec.ts — upsert and range queries
  - redis.spec.ts — cache and lock behavior
- Load/safety tests (optional):
  - backfill.sim.spec.ts — dry-run 18-month backfill, request count estimates, throttle behavior

[Implementation Order]
Implement in an order that de-risks API/budget and enables early deployment and data capture.

1) Upgrade SDK and transports
   - Bump @modelcontextprotocol/sdk to ^1.17.4
   - Implement HTTP/SSE transport for Railway; keep stdio for dev
   - Add outputSchema to tools and progress notifications
2) Modularize codebase
   - Extract types, utils, services, tools per [Files]
   - Ensure NewsAPI compliance (sources-only for top-headlines; everything for history)
3) Implement scoring expansions
   - Add attention, biasIntensity, novelty, volShock in src/services/scoring.ts
   - Reuse existing investor/general sentiment with normalization
4) Persistence and caching
   - Implement postgres/redis modules and simple migrations
   - Wire daily ingest to upsert DailyScores; add caching
5) Budget manager and feasibility
   - Implement budget estimation and throttling hooks
   - Dry-run feasibility for 18 months with configured page caps
6) Backfill pipeline
   - Implement runBackfill with month/day chunking, retries, progress notifications
   - Start with pageCap=2/day (200 articles target), adjust adaptively by month density
7) Anomaly detection and alerts
   - Rolling baselines, z-scores, MCP notifications; optional webhook sink
8) New tools and schemas
   - analyze_headlines, analyze_monthly (refactored)
   - get_scores(date|range), backfill(startMonth,endMonth,mode), budget_status()
9) Docs and ops
   - Update README, add .env.example, Railway deployment notes
   - Add basic dashboards/queries (SQL snippets) for verification
10) Tests and hardening
   - Add/finish unit/integration tests
   - Load test dry-run backfill; tune throttles
   - Ship to Railway, monitor, iterate caps
