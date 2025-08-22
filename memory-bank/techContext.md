# Tech Context — Headline Vibes

Last updated: 2025-08-21

## Stack and Dependencies

- Language: TypeScript (compiled to ESM JavaScript)
- Runtime: Node.js v16+ (ESM)
- MCP: @modelcontextprotocol/sdk 0.6.0 (stdio transport)
- HTTP: axios
- NLP: chrono-node (natural language date parsing)
- Sentiment: sentiment (lexicon-based)
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

## Project Structure

- src/index.mts
  - Entrypoint, defines MCP server, tools, and analysis logic
- build/
  - Compiled output (index.mjs, .d.ts)
- tsconfig.json
  - TypeScript configuration targeting ESM build
- README.md
  - Usage, setup, and examples

## Environment and Configuration

- Required env:
  - NEWS_API_KEY: NewsAPI API key. Server throws if missing.
- Axios client:
  - baseURL: https://newsapi.org/v2
  - headers: { "X-Api-Key": NEWS_API_KEY }

## MCP Integration

Example MCP client configuration:
{
  "mcpServers": {
    "headline-vibes": {
      "command": "node",
      "args": ["/absolute/path/to/headline-vibes/build/index.mjs"],
      "env": {
        "NEWS_API_KEY": "your-api-key-here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}

Server details:
- Transport: stdio (StdioServerTransport)
- Capabilities: tools
- Handlers:
  - ListTools: returns analyze_headlines, analyze_monthly_headlines
  - CallTool: validates args, calls analysis functions, returns JSON string as text content

## Tools (Schemas)

1) analyze_headlines
- input: { input: string } (natural language or YYYY-MM-DD)
- Errors:
  - InvalidParams if missing or unparseable date
  - InternalError on NewsAPI errors

2) analyze_monthly_headlines
- input: { startMonth: YYYY-MM, endMonth: YYYY-MM }
- Errors:
  - InvalidParams if month format invalid
  - Continues per-month with error embed if a month fails

## External API Usage

- Daily: GET /top-headlines
  - Params: sources, country=us, category=business, from, to, language=en, pageSize, page
- Monthly: GET /everything
  - Params: sources, from, to, language=en, pageSize, page

Pagination:
- pageSize: 100 (max)
- Iterate pages until fewer than pageSize or caps reached
- Caps:
  - Daily: 500 headlines max
  - Monthly: 1000 headlines max

## Key Computation Patterns

- Relevance filter:
  - exclusion terms (skip early if any)
  - inclusion terms with weights; relevant if sum > 0
- General sentiment:
  - sentiment(text).comparative average
  - normalized from [-5, 5] to [0, 10]
- Investor sentiment:
  - Weighted term hits (custom lexicon)
  - normalized from [-4, 4] to [0, 10]
- Political categorization:
  - SOURCE_CATEGORIZATION constant by kebab-case source ids
  - Fallback to center when unknown
- Balanced selection (daily):
  - After filtering, even-ish sampling per source:
    maxPerSource = ceil(maxHeadlines / sourcesWithRelevant.length)

## Development Workflow

- Install: npm install
- Build: npm run build
- Dev (watch): npm run watch
- Run via MCP client pointing to build/index.mjs
- Logging:
  - On startup and errors (console.error)
  - Monthly processing logs per-month errors but continues

## Error Handling

- McpError with ErrorCode:
  - InvalidParams for input validation issues (dates, formats)
  - InternalError for NewsAPI failures or unexpected errors
- Process signals:
  - SIGINT: closes server cleanly
- Server.onerror: logs MCP errors

## Technical Constraints and Considerations

- ESM-only (type: module); imports must include file extensions (.js)
- Requires NEWS_API_KEY at runtime; refuse to start otherwise
- NewsAPI rate limits: pagination and caps help avoid exhaustions
- Article.source.name normalization:
  - name?.toLowerCase().replace(/\s+/g, '-')
  - Mapping best-effort; uncategorized -> center
- No runtime persistence (Memory Bank is documentation only)

## Potential Enhancements

- Caching layer keyed by query inputs with TTL and invalidation
- Externalized configuration (lexicons, mappings) with hot-reload
- CLI flags/env for caps (maxHeadlines) and sources
- Tests for date parsing, filtering, normalization, and categorization
