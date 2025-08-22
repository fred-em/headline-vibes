# System Patterns — Headline Vibes

Last updated: 2025-08-21

## Overview

Headline Vibes is an MCP (Model Context Protocol) stdio server that fetches major US news headlines and computes:
- General sentiment (lexicon-based) normalized to 0–10
- Investor-specific sentiment (custom weighted lexicon) normalized to 0–10
- Political leaning breakdown (left/center/right)
- Source/political distributions and filtering stats

Core tools:
- analyze_headlines(input: string)
- analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)

## Architecture

- Runtime
  - Node.js + TypeScript
  - MCP SDK 0.6.0
  - Stdio transport
- External
  - NewsAPI (REST)
- Key Modules
  - Server: @modelcontextprotocol/sdk/server
  - HTTP: axios
  - NLP: chrono-node (date parsing)
  - Sentiment: sentiment

### Component Relationships

- MCP Server (Server + StdioServerTransport)
  - Registers ListTools and CallTool handlers
  - Delegates to analysis functions
- NewsAPI Client (axios instance)
  - Base URL: https://newsapi.org/v2
  - Default headers include X-Api-Key from env NEWS_API_KEY
- Analysis Pipelines
  - Daily: /top-headlines (with sources + business category)
  - Monthly: /everything (for date ranges per month)
- Scoring & Filters
  - Relevance filter: inclusion/exclusion terms for investor focus
  - General sentiment: sentiment.comparative average
  - Investor sentiment: weighted term hits
  - Normalization: map raw averages to 0–10
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
   - Fetch headlines:
     - Endpoint: /top-headlines
     - Params: sources (preferred list), country=us, category=business, from=to=date, language=en, pagination up to cap
   - Group by source; compute distribution
   - Relevance filtering:
     - Exclusion terms check first; skip if hit
     - Inclusion terms accumulate weights; relevant if sum > 0
   - Balanced sampling:
     - Even-ish distribution: cap per source based on max total
   - Sentiment scoring:
     - general: sentiment.comparative average
     - investor: weighted investment lexicon
     - normalize general: range [-5, 5] -> [0,10]
     - normalize investor: range [-4, 4] -> [0,10]
   - Synopses:
     - General market synopsis with distribution buckets (strong/moderate)
     - Investor synopsis with key term frequency & investment climate thresholds
   - Political categorization:
     - Map source to left/center/right via static list; fallback center
     - Compute per-leaning sentiment & counts
   - Return structured JSON as text content

3) CallTool: analyze_monthly_headlines
   - Validate month formats (^\d{4}-(?:0[1-9]|1[0-2])$)
   - Expand months range into [start, end] per month
   - For each month:
     - Fetch via /everything with pagination up to cap (~1000)
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
  - pageSize=100, iterate pages until < pageSize or reach caps
  - Daily cap: 500; Monthly cap: 1000
- Normalization
  - normalized = ((raw - min) / (max - min)) * 10 clamped to [0,10]
  - General range: [-5, 5]; Investor range: [-4, 4]
- Relevance Filter
  - exclusion: array of lifestyle/irrelevant terms (case-insensitive includes)
  - inclusion: dictionary with weights; relevanceScore sum > 0 -> relevant
- Political Mapping
  - SOURCE_CATEGORIZATION constant: arrays of kebab-case source ids
  - Source id derivation: article.source.name?.toLowerCase().replace(/\s+/g, '-')
  - Fallback to center if unknown
- Balanced Selection (Daily)
  - After filtering, select up to maxHeadlines with a per-source cap
  - maxPerSource = ceil(maxHeadlines / sourcesWithRelevant.length)

## Data Shapes

- NewsAPI Article (subset)
  - { title: string, publishedAt: string, source: { id: string, name: string } }
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
  - { [YYYY-MM]: {
      political_sentiments: { leaning: { general, investor, headlines, sample_headlines } }
      total_headlines: number
      date_range: { start: YYYY-MM-DD, end: YYYY-MM-DD }
      error?: string
    } }

## Error Handling

- Uses McpError with ErrorCode for client-friendly messages:
  - InvalidParams: missing/invalid inputs, unparseable dates
  - InternalError: NewsAPI or unexpected errors
- Server-level:
  - this.server.onerror logs MCP errors
  - SIGINT handler closes server gracefully
- Robustness:
  - Monthly analysis isolates failures per month and continues

## Limits, Defaults, Constants

- pageSize: 100
- Daily maxHeadlines: 500
- Monthly maxHeadlines: 1000
- Preferred sources: curated cross-spectrum US list (kebab-case joined by comma)
- Language: en
- Category (daily): business

## Logging

- Console.error for server start status, failures, and per-month errors
- Avoids verbose per-article logging to keep stdio clean

## Extensibility Patterns

- Adding tools:
  - Extend ListTools and switch in CallTool handler
  - Keep input schemas explicit and validated
- Caching (future):
  - Introduce a memoization layer keyed by input parameters
  - Persist to file/db while respecting rate limits and invalidation policies
- Lexicon tuning:
  - Externalize INVESTOR_LEXICON and relevance lists to config for runtime updates
- Source mapping maintenance:
  - Move SOURCE_CATEGORIZATION to a separate config with tests

## Security and Config

- Requires NEWS_API_KEY env var
- No runtime persistence (documentation-only memory via Markdown)
- Network calls restricted to NewsAPI endpoints configured in code
