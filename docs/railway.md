# Railway Deployment — Headline Vibes

Last updated: 2025-10-21

## Environment Variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TRANSPORT` | ✅ | `http` | Must be `http` for Railway |
| `HOST` | ✅ | `0.0.0.0` | Bind to all interfaces |
| `PORT` | ✅ | `3000` | Railway assigns `$PORT`; map accordingly |
| `NEWS_API_KEY` | ✅ | — | EventRegistry API key |
| `NEWS_API_BASE_URL` | ⛔️ | `https://eventregistry.org/api/v1/` | Override only if Region-specific |
| `LOG_LEVEL` | ⛔️ | `info` | Options: `fatal`,`error`,`warn`,`info`,`debug`,`trace` |
| `ALLOWED_HOSTS` | ⛔️ | — | Comma-separated host allowlist (`app.up.railway.app,headlinevibes.com`) |
| `ALLOWED_ORIGINS` | ⛔️ | — | Comma-separated origin allowlist for CORS |
| `RATE_LIMIT_DAILY_REQUESTS` | ⛔️ | — | Optional emergency brake |
| `BUDGET_MONTHLY_TOKENS` | ⛔️ | `50000` | Adjust to align with EventRegistry plan |

## Build & Deploy

1. **Install & Build**
   ```bash
   npm install
   npm run build
   ```
   (Railway can run these during deployment; run locally once to confirm.)

2. **Start Command**
   ```bash
   npm run start
   ```
   Transport is controlled via env (`TRANSPORT=http`).  
   `Railpack` auto-detects the root `index.js` shim, which simply imports `./build/index.mjs`; keep the build artifact available by running `npm run build` during deployment.

3. **Health Check**
   - Endpoint: `GET /healthz`
   - Returns: `200 ok` if MCP server is ready

4. **Smoke Test (Optional)**
   ```bash
   node ./build/scripts/smoke.mjs 2025-02-01
   ```
   Requires `NEWS_API_KEY` to be present in Railway env.

## Operational Checklist

- [ ] Set `TRANSPORT=http`, `HOST=0.0.0.0`, `PORT=$PORT` in Railway.
- [ ] Add `NEWS_API_KEY` securely in Railway variables.
- [ ] (Optional) Configure `ALLOWED_HOSTS` / `ALLOWED_ORIGINS` once custom domain known.
- [ ] Monitor logs for token diagnostics (`diagnostics.token_budget`) during first runs.
- [ ] Confirm MCP client integration by calling `ListTools` + a sample `CallTool`.

## Rollback / Recovery

- Disable the Railway service or set `TRANSPORT=stdio` to prevent HTTP exposure temporarily.
- Review Pino logs for `ResourceExhausted` errors (token budget) and adjust caps if needed.
- If EventRegistry tokens exhausted mid-month, reduce usage or enable `ALLOW_OVERAGE=1` (only if acceptable).
