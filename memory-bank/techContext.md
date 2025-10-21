# Tech Context — Headline Vibes

Last updated: 2025-08-21

## Stack and Dependencies

- Language: TypeScript (compiled to ESM JavaScript)
- Runtime: Node.js v18+ (ESM)
- MCP: @modelcontextprotocol/sdk 1.20 (stdio + HTTP transports)
- HTTP: axios
- NLP: chrono-node (natural language date parsing)
- Sentiment: sentiment (lexicon-based)
- Validation: zod + zod-to-json-schema
- Logging: pino
- Testing: vitest
- Types: @types/node, @types/axios, @types/sentiment
- Build: TypeScript compiler (tsc)

package.json highlights:
- type: "module" (ESM)
- bin: headline-vibes -> build/index.mjs
- scripts:
  - prebuild: mkdir -p build
  - build: tsc --pretty && chmod +x build/index.mjs
  - prepare: npm run build
  - watch: tsc --watch
  - start / start:stdio / start:http: runtime commands (env-driven transport)
  - test: vitest run

## Project Structure

- src/index.mts
  - Entrypoint registering MCP tools, structured output, transports, health check
- src/services/analysis.ts
  - Orchestrates fetching, filtering, scoring, and diagnostics
- src/services/newsapi.ts
  - Configurable EventRegistry client
- src/services/relevance.ts & constants/relevance.ts
  - Investor relevance lexicon helpers
- src/services/summaries.ts
  - Synopsis builders for general/investor sentiment
- src/logger.ts
  - Pino logger
- build/
  - Compiled output (index.mjs, .d.ts)
- tsconfig.json
  - TypeScript configuration targeting ESM build
- README.md
  - Usage, setup, and examples

## Environment and Configuration

- Required env:
  - NEWS_API_KEY: EventRegistry API key (asserted at startup)
- Optional env:
  - NEWS_API_BASE_URL (defaults to https://eventregistry.org/api/v1/)
  - TRANSPORT (stdio|http), HOST, PORT
  - LOG_LEVEL, ALLOWED_HOSTS, ALLOWED_ORIGINS
  - RATE_LIMIT_DAILY_REQUESTS, RATE_LIMIT_PER_SECOND
  - BACKFILL_PAGE_CAP_PER_DAY, BACKFILL_MODE
  - BUDGET_MONTHLY_TOKENS, BUDGET_SOFT_CAP_PCT, BUDGET_HARD_CAP_PCT, ALLOW_OVERAGE
- Axios client:
  - baseURL: NEWS_API_BASE_URL
  - Authentication: `apiKey` query param (EventRegistry requirement)

## MCP Integration

Example MCP client configuration:
```jsonc
{
  "mcpServers": {
    "headline-vibes": {
      "command": "node",
      "args": ["/absolute/path/to/headline-vibes/build/index.mjs"],
      "env": {
        "NEWS_API_KEY": "your-eventregistry-key",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

Server details:
- Transports:
  - stdio via `StdioServerTransport`
  - HTTP via `StreamableHTTPServerTransport` behind Node `createServer` with `/healthz`
- ListTools returns analyze_headlines + analyze_monthly_headlines with schemas
- CallTool responses:
  - `content`: human-readable summary
  - `structuredContent`: JSON matching Zod schemas

## Tools (Schemas)

Schemas defined in `src/schemas/headlines.ts`, exported to JSON via zod-to-json-schema.

1) analyze_headlines
- input: { input: string } (natural language or YYYY-MM-DD)
- structuredContent: AnalyzeHeadlinesSchema (scores, distributions, diagnostics)
- Errors:
  - InvalidParams if missing/unparseable date
  - ResourceExhausted if token budget exceeded
  - InternalError on EventRegistry failures

2) analyze_monthly_headlines
- input: { startMonth: YYYY-MM, endMonth: YYYY-MM }
- structuredContent: AnalyzeMonthlySchema (per-month sentiments + diagnostics)
- Errors:
  - InvalidParams if month format invalid
  - ResourceExhausted per-month when token budget blocks a fetch
  - InternalError when EventRegistry fails for a month (captured per result)

## External API Usage

- Endpoint: POST `https://eventregistry.org/api/v1/article/getArticles`
  - Query params: `apiKey`
  - Body fields: resultType=articles, dateStart/dateEnd, lang, articlesPage, articlesCount=100, articlesSortBy=date
  - Optional: sourceUri[] (resolved via SourceResolver)
- Pagination:
  - pageSize=100 (EventRegistry max)
  - Iterate until < pageSize or configured `pageCap`
  - Request counts recorded for budgeting diagnostics

## Key Computation Patterns

- Relevance filter:
  - exclusion terms short-circuit relevance
  - inclusion weights (>0) mark investor relevance; matched terms saved for diagnostics
- General sentiment:
  - sentiment(text).comparative average
  - normalized from [-1, 1] to [0, 10]
- Investor sentiment:
  - Weighted term hits (custom lexicon)
  - normalized from [-4, 4] to [0, 10]
- Political categorization:
  - SOURCE_CATEGORIZATION constant by kebab-case source ids
  - Fallback to center when unknown
- Balanced selection (daily):
  - After filtering, distribute evenly per source before truncation

## Development Workflow

- Install: `npm install`
- Build: `npm run build`
- Watch: `npm run watch`
- Tests: `npm test` (vitest)
- Local stdio run: `NEWS_API_KEY=... npm run start:stdio`
- Local HTTP run: `TRANSPORT=http HOST=0.0.0.0 PORT=8787 NEWS_API_KEY=... npm run start:http`
- Smoke check: `node ./build/scripts/smoke.mjs <date>`
- Logging via pino; level controlled by `LOG_LEVEL`

## Error Handling

- McpError with ErrorCode:
  - InvalidParams for input validation issues (dates, formats)
  - ResourceExhausted for token budget or rate-limit exhaustion
  - InternalError for EventRegistry failures or unexpected errors
- Process signals:
  - SIGINT: closes server cleanly
- Server.onerror: logs MCP errors

## Technical Constraints and Considerations

- ESM-only (type: module); imports must include file extensions (.js)
- Requires NEWS_API_KEY at runtime (asserted at boot)
- Token budgeting enforced via `services/tokenBudget.ts`
- Source URIs resolved via `sourceResolver` cache; uncategorized defaults to center
- No runtime persistence (documentation-only memory)

## Potential Enhancements

- Caching layer keyed by query inputs with TTL and invalidation
- Externalized configuration (lexicons, mappings) with hot-reload
- CLI flags/env for caps (maxHeadlines) and sources
- Tests for date parsing, filtering, normalization, and categorization
