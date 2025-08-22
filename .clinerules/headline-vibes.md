# Headline Vibes Workspace Rules

Purpose: Ensure reliable MCP server development, NewsAPI compliance, transport correctness, budgeting safety, and maintainability for the Headline Vibes project.

Last updated: 2025-08-21

1) Dependencies and Versions
- Before bumping core dependencies (e.g., @modelcontextprotocol/sdk), run:
  - npm view <pkg> versions --json to select an existing version
  - Prefer latest compatible 1.x unless breaking changes require otherwise
- After any dependency change:
  - npm install
  - npm run build to surface type/import errors immediately
- Confirm import paths by inspecting installed package layout:
  - node_modules/@modelcontextprotocol/sdk/dist/** and *.d.ts
  - Do not assume path names; align to dist structure (e.g., server/streamableHttp.js)

2) MCP Transports
- HTTP transport:
  - import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
  - Do NOT pass port to the transport ctor; create node:http server and forward:
    - const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    - createServer((req,res) => transport.handleRequest(req,res))
  - Support DNS rebinding protections when deploying:
    - Use env ALLOWED_HOSTS, ALLOWED_ORIGINS to configure allowed hosts/origins
- Stdio transport:
  - Keep stdio as the local dev default
  - Switch via TRANSPORT=stdio|http environment variable
- Scripts should support both:
  - start:stdio and start:http using TRANSPORT env

3) NewsAPI Compliance and Client
- US-only coverage:
  - Intake must be restricted to US-based outlets only
  - Maintain curated IDs in src/constants/sources.ts; avoid non-US outlets (e.g., reuters)
- Never mix sources with country/category in the same request
- Recent day (today, UTC):
  - Prefer /top-headlines with sources-only (no country/category when sources present)
- Historical day/range:
  - Use /everything with from=to=YYYY-MM-DD (day) or [from,to] for ranges
- All NewsAPI calls MUST go through src/services/newsapi.ts:
  - Centralize pagination (pageSize=100), pageCap, retries, parameter compliance
- Do not call axios directly from tool handlers

4) Configuration and Secrets
- Access environment variables ONLY via src/config.ts (getConfig/assertRequiredConfig)
- Required: NEWS_API_KEY
- Keep .env.example up-to-date; never commit real secrets
- Transport selection via TRANSPORT=http|stdio; PORT must be honored by HTTP server

5) TypeScript Patterns and Utilities
- Treat constant source lists as readonly (as const)
  - When a mutable string[] is required, use Array.from(PREFERRED_SOURCE_IDS)
- For axios instance typing: use ReturnType<typeof axios.create>
- Use shared utilities:
  - Date: src/utils/date.ts (parseDateNL, monthRange, normalizeDate)
  - Normalize: src/utils/normalize.ts (normalizeRange, toKebabId, round2)
- Prefer extracting helpers/services over embedding logic in tool handlers

6) File Editing Discipline
- For changes, prefer small, targeted diffs and modular extraction over growing monoliths
- Use replace_in_file for localized edits and write_to_file for new files or large rewrites
- Avoid direct process.env reads outside src/config.ts

7) Testing and Verification
- After transport or dependency modifications, run npm run build to confirm correctness
- Add/maintain unit tests (names proposed):
  - newsapi.spec.ts — pagination/compliance/error handling (mock axios)
  - scoring.spec.ts — attention, investor/general sentiment, bias intensity, novelty, volShock
  - categorization.spec.ts — source id/name normalization and leaning mapping
  - date.spec.ts — parseDateNL and monthRange
  - budget.spec.ts — feasibility estimates and throttling
- Integration tests (future):
  - pipeline.spec.ts — ingest end-to-end producing DailyScores from fixtures

8) Structured Tool Outputs and Progress
- MCP tool handlers must declare outputSchema and provide structured JSON content
- For long-running jobs (backfill, monthly analysis), send progress notifications at milestones
- Keep server bootstrap minimal; register tools and delegate to services

9) Budget and Backfill Safety
- Use src/services/budgetManager.ts for:
  - estimateBackfillCost(days, pagesPerDay)
  - shouldThrottle() and recordRequest(n) for request accounting
- Enforce caps from env (RATE_LIMIT_DAILY_REQUESTS, RATE_LIMIT_PER_SECOND)
- Default backfill day pageCap conservatively; allow adaptive increase with monitoring

10) Deployment and Operations
- Railway deployment uses HTTP transport:
  - Respect PORT, run createServer + transport.handleRequest
  - Configure NEWS_API_KEY, TRANSPORT=http, and optional PG_URI/REDIS_URL when those features are enabled
- Logging:
  - Prefer structured logs (pino) when added; stderr messaging acceptable until then
- Keep README and .env.example aligned with current behavior and environment variables

11) API Stability and Service Boundaries
- Tool handlers should orchestrate only:
  - Parameter validation, calling services, formatting structured output
- Services own the logic:
  - newsapi.ts, scoring.ts, categorization.ts, budgetManager.ts, anomaly.ts (future)
- Do not bypass services with ad-hoc logic or direct HTTP calls

Appendix: Quick Commands
- Verify SDK versions: npm view @modelcontextprotocol/sdk versions --json
- Build: npm run build
- Run HTTP locally: TRANSPORT=http PORT=8787 NEWS_API_KEY=dummy node ./build/index.mjs
- Run stdio: TRANSPORT=stdio NEWS_API_KEY=dummy node ./build/index.mjs
