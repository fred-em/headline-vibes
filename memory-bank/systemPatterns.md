# System Patterns — Headline Vibes

Last updated: 2025-10-21

## Overview

Headline Vibes is an MCP (Model Context Protocol) server that fetches major US news headlines from EventRegistry and computes:
- General sentiment (lexicon-based) normalized to 0–10
- Investor-specific sentiment (custom weighted lexicon) normalized to 0–10
- Political leaning breakdown (left/center/right)
- Source/political distributions and filtering stats

Core tools:
- analyze_headlines(input: string)
- analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)

## Architecture

- Runtime
  - Node.js + TypeScript (ESM)
  - MCP SDK 1.20
  - Transports: stdio (default) and streamable HTTP (Railway)
- External
  - EventRegistry / NewsAPI.ai REST API
- Key Modules
  - Server: @modelcontextprotocol/sdk/server (stdio + streamable HTTP transports)
  - HTTP client: axios (configured with EventRegistry base URL)
  - NLP: chrono-node (date parsing)
  - Sentiment scoring: sentiment
  - Analysis orchestration: `services/analysis.ts`
  - Logging: `src/logger.ts` (pino)

### Component Relationships

- MCP Server (Server + StdioServerTransport)
  - Registers ListTools and CallTool handlers
  - Delegates to analysis functions
- EventRegistry client (axios instance)
  - Base URL: configurable via `NEWS_API_BASE_URL` (defaults to https://eventregistry.org/api/v1/)
  - Authentication: `apiKey` query parameter sourced from `NEWS_API_KEY`
- Analysis Pipelines
  - Daily: EventRegistry `article/getArticles` with dateStart=dateEnd, curated source URIs
  - Monthly: same endpoint across month ranges (historical queries)
- Scoring & Filters
  - Relevance filter: inclusion/exclusion terms via `services/relevance.ts`
  - General sentiment: sentiment.comparative average → normalized [-1,1] to [0,10]
  - Investor sentiment: weighted lexicon → normalized [-4,4] to [0,10]
- Categorization
  - Political leaning (left/center/right) by static source mapping
  - Source normalization: lowercase, spaces -> hyphens

## Request Flow

1) ListTools
   - Returns metadata for both tools and input schemas

2) CallTool: analyze_headlines
   - Validate input (string)
   - Parse date:
     - If YYYY-MM-DD, accept
     - Else chrono-node parse with error if unparseable
   - Token preflight: `estimateTokensForArticleSearch` + `checkAndRecord`
   - Fetch headlines:
     - Endpoint: EventRegistry `article/getArticles`
     - Params: dateStart/dateEnd=date, lang=en, sourceUri resolved via SourceResolver, pagination up to pageCap
   - Group by source; compute distribution
   - Relevance filtering:
     - Exclusion terms check first; skip if hit
     - Inclusion terms accumulate weights; relevant if sum > 0
   - Balanced sampling:
     - Even-ish distribution: cap per source based on max total
   - Sentiment scoring:
     - general: sentiment.comparative average (normalized)
     - investor: weighted investment lexicon (normalized)
   - Synopses:
     - General market synopsis with distribution buckets (strong/moderate)
     - Investor synopsis with key term frequency & investment climate thresholds
   - Political categorization:
     - Map source to left/center/right via static list; fallback center
     - Compute per-leaning sentiment & counts
   - Return MCP CallTool result with summary text plus `structuredContent`

3) CallTool: analyze_monthly_headlines
   - Validate month formats (^\d{4}-(?:0[1-9]|1[0-2])$)
   - Expand months range into [start, end] per month
   - For each month:
     - Token preflight; skip month if blocked
     - Fetch via `article/getArticles` across month range with curated sources
     - Categorize articles by political leaning (by source)
     - Compute per-leaning sentiment (general/investor), counts, sample headlines
     - Normalize scores; aggregate into monthly results
     - Catch/log errors but continue, embedding error info per month
   - Return months keyed by YYYY-MM with sentiments and totals

## Critical Implementation Paths

- Date Parsing
  - Exact match YYYY-MM-DD short-circuit
  - chrono-node parseDate else throw McpError InvalidParams
- HTTP Pagination
  - pageSize=100, iterate pages until < pageSize or pageCap (env-controlled)
  - Request counts recorded for budgeting diagnostics
- Normalization
  - normalized = ((raw - min) / (max - min)) * 10 clamped to [0,10]
  - General range: [-5, 5]; Investor range: [-4, 4]
- Relevance Filter
  - exclusion terms short-circuit to false relevance
  - inclusion weights summed (>0) mark relevance; matched terms captured for diagnostics
- Political Mapping
  - SOURCE_CATEGORIZATION constant: arrays of kebab-case source ids
  - Source id derivation: article.source.name?.toLowerCase().replace(/\s+/g, '-')
  - Fallback to center if unknown
- Balanced Selection (Daily)
  - After filtering, distribute evenly by per-source quota (floor(max / sourcesWithRelevant))
  - Maintains cross-outlet parity before scoring

## Data Shapes

- EventRegistry Article (subset)
  - { id: string | null, sourceName: string, title: string, publishedAt: string, url?: string }
- Daily Result (simplified)
  - political_sentiments: { left|center|right: { general, investor, headlines } }
  - overall_sentiment: {
      general: { score, synopsis },
      investor: { score, synopsis, key_terms }
    }
  - filtering_stats: { total_headlines, relevant_headlines, relevance_rate }
  - headlines_analyzed: number
  - sources_analyzed: number
  - source_distribution: { [sourceName]: count }
  - political_distribution: { left|center|right|other: count }
  - sample_headlines_by_leaning: { left|center|right: string[] }

- Monthly Result (simplified)
  - months: {
      [YYYY-MM]: {
        date_range: { start, end },
        total_headlines,
        political_sentiments: { leaning: { general, investor, headlines, sample_headlines } },
        diagnostics: { token_budget, sampling },
        error?: string
      }
    }

## Error Handling

- Uses McpError with ErrorCode for client-friendly messages:
  - InvalidParams: missing/invalid inputs, unparseable dates
  - ResourceExhausted: token budget or rate-limit exhaustion
  - InternalError: EventRegistry or unexpected errors
- Server-level:
  - this.server.onerror logs MCP errors
  - SIGINT handler closes server gracefully
- Robustness:
  - Monthly analysis isolates failures per month and continues

## Limits, Defaults, Constants

- pageSize: 100
- pageCap defaults: `BACKFILL_PAGE_CAP_PER_DAY` env (default 2)
- Preferred sources: curated cross-spectrum US outlets (`constants/sources.ts`)
- Language: en
- Token budget defaults: monthly 50k tokens, soft cap 80%, hard cap 95% (configurable)

## Logging

- Pino logger (`src/logger.ts`) with configurable `LOG_LEVEL`
- Structured logs for startup, errors, and HTTP transport issues

## Extensibility Patterns

- Adding tools:
  - Extend ListTools metadata and output schemas (Zod + zod-to-json-schema)
  - Delegate heavy lifting to services; keep handlers thin
- Caching (future):
  - Introduce memoization keyed by date/month ranges
  - Persist results alongside token usage to avoid double counting
- Lexicon tuning:
  - Modify `constants/relevance.ts` and scoring heuristics independently
- Observability:
  - Expand diagnostics payloads or integrate structured logging targets

## Security and Config

- Requires NEWS_API_KEY (EventRegistry) env var
- Optional: NEWS_API_BASE_URL, HOST, PORT, LOG_LEVEL, ALLOWED_HOSTS, ALLOWED_ORIGINS
- No runtime persistence (documentation-only memory via Markdown)
- Network calls restricted to EventRegistry endpoints configured in code
