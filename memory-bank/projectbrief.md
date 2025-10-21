# Headline Vibes — Project Brief

Last updated: 2025-10-21

## Summary

Headline Vibes is a Model Context Protocol (MCP) server that analyzes sentiment in news headlines from major US publications retrieved via EventRegistry (newsapi.ai). It provides:
- Natural language date parsing ("yesterday", "last Friday", specific YYYY-MM-DD)
- Daily and monthly analysis modes
- Dual sentiment: general (lexicon-based) and investor-focused (custom weighted lexicon)
- Political-leaning breakdown (left/center/right) based on source mapping
- Relevance filtering for investor-centric headlines
- Source and category distribution metrics, filtering stats, and sample headlines
- Structured MCP outputs with token budgeting and sampling diagnostics

Primary entrypoints (MCP tools):
- analyze_headlines(input: string)
- analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)

Tech stack:
- Node.js + TypeScript (ESM)
- MCP SDK 1.20 (stdio + streamable HTTP transports)
- EventRegistry / NewsAPI.ai (https://newsapi.ai)
- axios, chrono-node, sentiment, zod, pino

## Goals

1. Provide repeatable, structured headline sentiment analysis for LLM agents via MCP.
2. Present normalized (0–10) general and investor sentiment scores with clear synopses.
3. Ensure balanced sampling across major US sources and provide transparency metrics:
   - Source distribution
   - Political distribution
   - Filtering statistics (relevance rate)
4. Support natural language dates and monthly range aggregation.
5. Maintain a Memory Bank that allows a stateless assistant to instantly regain project context each session.

## Non-Goals (Current Scope)

- Persisting results to an external database (no runtime DB). Documentation-only memory via Markdown.
- Building a UI or dashboards.
- Streaming outputs or incremental updates.
- Fine-grained per-topic/entity analysis (future possibility).

## Users and Value

- LLM agents (via MCP) and developers integrating market/news sentiment signals.
- Value: fast, consistent snapshot of market-relevant headline sentiment with source/political transparency and investor-focused interpretation.

## Success Criteria

- MCP tools are discoverable via ListTools and callable with valid schemas.
- For analyze_headlines:
  - Returns general and investor normalized scores with coherent synopses.
  - Includes filtering stats, headlines analyzed, sources analyzed, source/political distributions, and sample headlines by leaning.
- For analyze_monthly_headlines:
  - Returns per-month breakdown with political sentiments and headline counts.
- Robust error handling: invalid params, unparseable dates, and EventRegistry failures surfaced via MCP errors.
- Memory Bank stays current and sufficient to fully reconstruct project context.

## Key Requirements

- Natural language date parsing (chrono-node) with fallback to exact YYYY-MM-DD.
- Relevance filtering for investor-centric terms (inclusion/exclusion).
- Investor lexicon weighted scoring; normalized to 0–10 (custom range).
- Political categorization of sources via static mapping.
- Pagination and max limits to manage API usage.
- Environment variable NEWS_API_KEY required.

## Constraints and Dependencies

- EventRegistry rate limits and token budgeting constraints; queries constrained by curated source lists.
- Node.js v18+; TypeScript build to build/index.mjs.
- MCP transports: stdio for local dev, HTTP (Railway) for remote hosting with origin/host allowlists.

## Risks and Mitigations

- API rate limiting or outages:
  - Mitigation: paginate with sane caps; future: add caching (out of current scope).
- Date parsing ambiguity:
  - Mitigation: strict check for YYYY-MM-DD; otherwise chrono-node parse with clear errors.
- Source name normalization mismatch:
  - Mitigation: conservative fallback to center when uncategorized; keep mapping explicit and reviewable.
- Over/under-filtering relevance:
  - Mitigation: track filtering stats; adjust lexicon/relevance lists as needed.

## Milestones

- v0.1.0: MCP server delivers daily and monthly analysis with dual sentiment, filtering, distributions, and synopses.
- Memory Bank initialization: Create and populate core docs for stateless operation (this milestone).
- Future (optional):
  - Result caching to reduce API calls.
  - Trend comparisons across time.
  - Extended lexicon tuning and source mapping maintenance.

## Operational Notes

- Environment:
  - NEWS_API_KEY (EventRegistry) required.
  - Optional: NEWS_API_BASE_URL, HOST, PORT, LOG_LEVEL, ALLOWED_HOSTS, ALLOWED_ORIGINS.
- Build/run:
  - npm install; npm run build; run via MCP config pointing to build/index.mjs.
- MCP integration:
  - Configure under mcpServers in the client, command: node, args: [path/to/build/index.mjs].
  - Structured responses available via `structuredContent`.
