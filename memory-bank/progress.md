# Progress — Headline Vibes

Last updated: 2025-10-21

## Current Status

- MCP server upgraded to MCP SDK 1.20 with stdio + HTTP transports
- EventRegistry (newsapi.ai) client integrated with source URI resolution
- Tools available:
  - analyze_headlines (daily, natural language or YYYY-MM-DD)
  - analyze_monthly_headlines (range of YYYY-MM months)
- Structured outputs returned via MCP `structuredContent` with Zod schemas
- Dual sentiment scores and investor relevance filtering in production
- Token budgeting diagnostics and sampling telemetry included in responses
- Memory Bank refreshed with updated docs

## What Works

- Natural language date parsing (chrono-node) with strict YYYY-MM-DD fallback
- EventRegistry fetching with pagination + source URI resolution cache
- Investor relevance filtering before scoring
- Political categorization (left/center/right) via static source mapping
- Synopsis generation for general market sentiment and investor climate
- Structured text + JSON responses validated via Zod
- Graceful error handling (McpError) and shutdown (SIGINT)

## What’s Left To Build / Improve

- Expand automated test coverage (event resolver mocks, analysis orchestration)
- Evaluate caching/memoization for repeated inputs
- Consider persisting token usage to shared store (Redis/Postgres) when multi-instance
- Explore advanced diagnostics (anomaly detection, trend deltas)
- Optional: integrate structured logging sink for production observability

## Known Issues / Risks

- EventRegistry pricing/token consumption: large ranges still consume tokens quickly
- Source URI resolution relies on suggestSourcesFast; handle API hiccups gracefully
- Relevance lexicon may still over/under-filter edge-case topics
- Vitest coverage limited; more mocks/fixtures needed

## Decision Log (Evolution)

- Migrated from NewsAPI.org to EventRegistry (newsapi.ai) with source resolver caching
- Adopted MCP SDK 1.20 for structured outputs and streamable HTTP transport
- Introduced token budgeting diagnostics to respect EventRegistry allowances
- Standardized synopsis helpers and relevance utilities for reuse
- Added HTTP deployment path (Railway) with health checks and allowlists

## Next Actions

1) Backfill targeted unit tests (analysis orchestration, token budgeting edge cases, source resolver)
2) Evaluate caching/memo strategies for repeated requests
3) Plan deployment hardening: structured logging sink, rate-limit telemetry dashboards
4) Explore anomaly detection / trend comparisons for future product milestones

## References

- Env: NEWS_API_KEY, TRANSPORT, HOST, PORT, LOG_LEVEL, NEWS_API_BASE_URL
- Build: npm run build (outputs to build/index.mjs)
- Run: npm run start (stdio or HTTP via env)
