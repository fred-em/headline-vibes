# Implementation Plan

[Overview]
Upgrade and harden the Headline Vibes MCP server to use Event Registry (NewsAPI.ai) for cost-aware headline ingestion, fix the blocking API path bug, clean up legacy NewsAPI.org code, add US-only source mapping with caching, extend tool outputs with budgeting diagnostics, and prepare for HTTP deployment on Railway.

This plan focuses on immediate correctness and deployment readiness while laying the groundwork for token-aware, source-curated sentiment analysis suitable for demand projection. It fixes the incorrect API path causing 426 responses, removes stale references to NewsAPI.org, and adds a source resolution layer for Event Registry that maps curated US outlets to canonical sourceUri values with local caching to minimize token usage. Budget enforcement integrates preflight estimates and soft/hard caps per .clinerules. Tool outputs are extended to include token estimates, throttle status, and sampling diagnostics to validate cost/quality tradeoffs. The plan remains modular so future persistence/caching (Postgres/Redis) and additional tools can be added without rewriting the server.

[Types]  
Refine the shared types to align with Event Registry ingestion and structured tool outputs.

Type definitions and validation:
- Article
  - id: string | null — the source identifier (Event Registry: source.uri) or null
  - sourceName: string — source.title (required, 1..256)
  - title: string — 1..512 chars
  - publishedAt: string — ISO-8601
  - url?: string
- PoliticalLeaning
  - 'left' | 'center' | 'right'
- HeadlineRecord (optional pipeline struct; not required to ship immediately)
  - title: string
  - sourceId: string
  - sourceName: string
  - publishedDate: string (YYYY-MM-DD UTC)
  - leaning: PoliticalLeaning
- ScoreDimensions (normalized 0..10 floats; 2 decimal precision for storage when added)
  - attention: number
  - investorSentiment: number
  - generalSentiment: number
  - biasIntensity: number
  - novelty: number
  - volShock: number
- DailyCounts
  - totalHeadlines: number
  - relevantHeadlines: number
  - sources: number
- LeaningKey
  - PoliticalLeaning | 'other'
- DailyDistributions
  - bySource: Record<string, number>
  - byLeaning: Record<LeaningKey, number>
- DailyScores (future persistence)
  - date: string (YYYY-MM-DD)
  - grouping: 'aggregate' | PoliticalLeaning
  - counts: DailyCounts
  - distributions: DailyDistributions
  - keyTerms: Record<string, number>
  - sampleHeadlines: string[]
  - scores: ScoreDimensions
  - meta: { method: 'sourcesOnly' | 'mixedSafe'; pageCount: number; apiCalls: number }
- Tool diagnostics (new)
  - TokenDiagnostics
    - token_estimate: number
    - requests_made: number
    - throttle_status: 'allowed' | 'throttled' | 'blocked'
  - SamplingDiagnostics
    - sources_targeted: number
    - sources_analyzed: number
    - page_cap: number
    - per_source_quota?: number

Validation rules:
- All 0..10 metrics normalized and clamped.
- Dates UTC-normalized (YYYY-MM-DD).
- Source mapping prefers Event Registry source.uri; fallback to normalized source.title for internal grouping.

[Files]
Modify existing files for correctness and add modular services for source mapping and budgeting diagnostics.

New files to be created:
- src/services/sourceResolver.ts — resolve friendly source names to Event Registry sourceUri using /api/v1/suggestSourcesFast; local cache at data/source-uri-cache.json.
- data/source-uri-cache.json — on-disk cache written/updated by SourceResolver (created at runtime; ensure path exists).
- src/services/tokenBudget.ts — Event Registry token budgeting wrapper built on existing BudgetManager with preflight estimation rules from .clinerules/eventregistry-tokens-budget.md.
- src/types.diagnostics.ts — TokenDiagnostics and SamplingDiagnostics definitions (optional; can be in src/types.ts if preferred).
- README.md (update) — Railway HTTP transport instructions, envs, tooling notes.

Existing files to modify:
- src/services/newsapi.ts
  - Fix endpoint path bug: change axios.get path from '/api/v1/article/getArticles' to '/article/getArticles' (baseURL already includes '/api/v1').
  - Add optional source URI filtering: if opts.sources provided, resolve via SourceResolver and populate params.sourceUri with comma-separated URIs.
  - Emit minimal logging of page/total pages and results per page.
- src/index.mts
  - Remove unused axiosInstance pointing to https://newsapi.org/v2 to avoid confusion.
  - Extend tool handler outputs to include TokenDiagnostics and SamplingDiagnostics.
  - Where calling NewsApiClient, wire through SourceResolver and tokenBudget preflight/recording hooks.
- src/constants/sources.ts
  - Update comment and intent: curated US-only outlets.
  - Optionally evolve list to ER-friendly tokens (domains or canonical labels); SourceResolver will translate to URIs.
- src/services/budgetManager.ts
  - Keep request throttling; expose hooks used by tokenBudget.ts (shouldThrottle, recordRequest).
- .env.example
  - Ensure NEWS_API_KEY, TRANSPORT=http, PORT, RATE_LIMIT_* present.
  - Add ALLOWED_HOSTS, ALLOWED_ORIGINS.
  - Add BUDGET_MONTHLY_TOKENS=50000, BUDGET_SOFT_CAP_PCT=80, BUDGET_HARD_CAP_PCT=95, ALLOW_OVERAGE=0.

Files to delete or move:
- None required; only removal of the stale axios instance in src/index.mts.

Configuration file updates:
- package.json scripts remain; document start:http path and Railway config.
- README.md: deployment steps, smoke test, and tool usage.

[Functions]
Add token-aware wrappers, source resolution helpers, and extend outputs.

New functions:
- src/services/sourceResolver.ts
  - resolveSourceUris(names: string[]): Promise<string[]> — resolves friendly names/domains to canonical sourceUri using suggestSourcesFast with caching.
  - loadCache(): Map<string,string>, saveCache(): void — JSON disk cache helpers.
- src/services/tokenBudget.ts
  - estimateTokens(op: 'articleSearch', params: { recent: boolean; years?: number; pages?: number }): number
  - checkAndRecord(estimate: number, options?: { allowOverage?: boolean }): { allowed: boolean; status: 'allowed'|'throttled'|'blocked' }
  - recordActual(tokens: number): void
- src/services/newsapi.ts (modifications)
  - fetchTopHeadlinesByDate(date, opts) — incorporate SourceResolver and TokenBudget preflight+record
  - fetchEverythingRange(start, end, opts) — same as above
- src/index.mts (tool handlers)
  - analyze_headlines — include TokenDiagnostics & SamplingDiagnostics in result
  - analyze_monthly_headlines — include per-month token/request summaries

Modified functions:
- src/services/newsapi.ts
  - fetchArticlesByDate(...) — correct path; add sourceUri param mapping; optional early exit on budget throttle.

Removed functions:
- None.

[Classes]
Minimize server logic; add small services for mapping and budgeting.

New classes:
- SourceResolver — encapsulates suggestSourcesFast lookups and caching.
- TokenBudget — encapsulates .clinerules-based estimation/threshold logic; delegates request-rate gating to BudgetManager.

Modified classes:
- NewsApiClient — depends on SourceResolver (in callers) and enforces corrected endpoint path.

Removed classes:
- None.

[Dependencies]
Add only what is necessary for this phase; keep footprint light.

- Add:
  - "zod": "^3.x" — optional runtime validation for tool outputs and env.
  - "pino": "^9.x" — optional structured logs in future; non-blocking for this phase.
- Keep:
  - "@modelcontextprotocol/sdk": "^1.17.3" (already installed; ok to keep unless bump needed)
  - "axios", "chrono-node", "dotenv", "sentiment"
- Scripts: unchanged; ensure start:http uses TRANSPORT=http.

[Testing]
Unit and smoke tests to validate correctness and prevent regressions.

- Unit:
  - sourceResolver.spec.ts — cache read/write; mapping happy/edge paths (mock axios).
  - newsapi.spec.ts — verifies '/article/getArticles' path, params, pagination (mock axios).
  - tokenBudget.spec.ts — estimation rules and threshold behavior per .clinerules.
- Smoke:
  - Local run with dummy key (no network) to assert tool listing and JSON structure.
  - With real key: date=yesterday and one month range with pageCap=1 to confirm non-426 responses and mapped outputs.

[Implementation Order]
Apply correctness fixes first, then add source/budget layers, then deployment readiness.

1) Blocking bug fix
   - src/services/newsapi.ts: change GET path to '/article/getArticles' (baseURL already includes '/api/v1').
   - npm run build; smoke test analyze_headlines with "yesterday".
2) Cleanup legacy reference
   - src/index.mts: remove unused axiosInstance created for NewsAPI.org.
3) Source resolution and caching
   - Implement SourceResolver and wire callers to map curated sources to sourceUri; persist cache in data/source-uri-cache.json.
4) Token budgeting diagnostics
   - Implement TokenBudget using .clinerules estimates and caps.
   - Extend tool outputs with TokenDiagnostics and SamplingDiagnostics; preflight before requests; record after.
5) Sampling controls
   - Even per-leaning quotas from curated list; adaptive pageCap until stable aggregate (variance threshold placeholder).
6) Railway deployment readiness
   - Ensure HTTP transport honored; add ALLOWED_HOSTS/ALLOWED_ORIGINS; document deployment steps and smoke test.
7) Optional tests
   - Add unit tests for resolver, token budget, and endpoint path composition.
