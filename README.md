# Headline Vibes — EventRegistry MCP Server

Headline Vibes is a Model Context Protocol server that analyzes investor sentiment in US news headlines fetched from EventRegistry (newsapi.ai). It supports daily and monthly analysis modes, produces structured outputs with diagnostics, and runs over stdio or HTTP (Railway-ready).

## Features

- Curated US newsroom coverage with investor relevance filtering
- Dual sentiment scores (general + investor) normalized to a 0–10 scale
- Political-leaning breakdowns, source distributions, and sampling diagnostics
- Natural-language date parsing for daily requests (`"yesterday"`, `"last Friday"`, etc.)
- Structured JSON outputs compatible with MCP `structuredContent`
- Built-in token budgeting and rate-limit telemetry

## Prerequisites

- Node.js v18+ (LTS recommended)
- EventRegistry API key (https://newsapi.ai)

## Setup

1. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
2. Configure environment variables (stdio example):
   ```jsonc
   {
     "mcpServers": {
       "headline-vibes": {
         "command": "node",
         "args": ["/absolute/path/headline-vibes/build/index.mjs"],
         "env": {
           "NEWS_API_KEY": "your-eventregistry-key",
           "TRANSPORT": "stdio"
         }
       }
     }
   }
   ```
3. For HTTP (Railway) deployments, set `TRANSPORT=http`, `HOST=0.0.0.0`, `PORT=<port>`, and optionally `ALLOWED_HOSTS/ALLOWED_ORIGINS`.

## Available Tools

### `analyze_headlines`
Daily sentiment snapshot for a single day. Arguments: `{ "input": string }`.
- Accepts natural language or `YYYY-MM-DD`.
- Returns investor/general scores, synopses, distributions, sample headlines, and diagnostics.

### `analyze_monthly_headlines`
Monthly aggregation between two months. Arguments: `{ "startMonth": "YYYY-MM", "endMonth": "YYYY-MM" }`.
- Outputs per-month political sentiments, headline counts, and token/sampling diagnostics.

JSON schemas powering structured results live in `src/schemas/headlines.ts`.

## Development & Testing

- Watch mode: `npm run watch`
- Stdio run: `NEWS_API_KEY=... npm run start:stdio`
- HTTP run: `TRANSPORT=http HOST=0.0.0.0 PORT=8787 NEWS_API_KEY=... npm run start:http`
- Smoke check EventRegistry connectivity: `node ./build/scripts/smoke.mjs 2025-02-01`
- Unit tests (Vitest): `npm test`

## Railway Deployment

1. Set environment variables (`TRANSPORT`, `HOST`, `PORT`, `NEWS_API_KEY`, optional `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, `LOG_LEVEL`).
2. Build once locally (`npm run build`) or via Railway’s build step.
3. Start with `npm run start`.
4. Health probe: `GET /healthz` returns `200 ok`.

See `docs/railway.md` for the full playbook.

## License

MIT
