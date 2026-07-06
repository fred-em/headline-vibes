# Claude Desktop Integration — Headline Vibes

Last updated: 2025-10-21

This guide links the Claude Desktop app to the Headline Vibes MCP server running on Railway.

## 1. Confirm the Railway Service

1. Deploy the latest build (`npm run build`) and trigger a Railway deploy.
2. Locate the public URL shown in the Railway dashboard (for example `https://headline-vibes-production.up.railway.app`).
3. Verify the service is reachable:
   ```bash
   curl -sf https://headline-vibes-production.up.railway.app/healthz
   ```
   A `200 ok` response confirms the MCP server is ready.

> Tip: If you configure `ALLOWED_HOSTS` or `ALLOWED_ORIGINS`, include the Railway subdomain and Claude Desktop origin (`https://desktop.anthropic.com`). Leaving them unset allows all hosts/origins.

## 2. Update Claude Desktop Configuration (macOS)

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json` (create the file if it does not exist).
2. Add or merge the following entry under `mcpServers`, replacing `<your-railway-url>` with the HTTPS endpoint from step 1:
   ```jsonc
   {
     "mcpServers": {
       "headline-vibes-railway": {
         "transport": {
           "type": "http",
           "url": "https://<your-railway-url>"
         },
         "metadata": {
           "description": "Headline Vibes MCP (Railway HTTP)"
         }
       }
     }
   }
   ```
   - Claude merges multiple servers by key. If the file already contains other MCP entries, add the `headline-vibes-railway` block alongside them.
   - No additional headers are required unless you front the service with an auth proxy.

3. Save the file and restart Claude Desktop. Open the MCP sidebar and confirm “Headline Vibes MCP (Railway HTTP)” appears. Trigger `List Tools` to verify connectivity.

## 3. Optional: Local Override

If you need to switch back to the local build:

- Replace the `url` with `http://localhost:8787` (or whichever port you expose) **and** run `TRANSPORT=http HOST=0.0.0.0 PORT=8787 npm run start:http`.
- Alternatively, keep a second entry (e.g., `headline-vibes-local`) so you can toggle between remote and local endpoints.

## 4. Troubleshooting Checklist

- `403 Forbidden host/origin`: Ensure `ALLOWED_HOSTS`/`ALLOWED_ORIGINS` environment variables on Railway include the incoming request’s host (`*.up.railway.app`) and origin (`https://desktop.anthropic.com`).
- `Failed to connect`: Confirm Railway deployment succeeded and the HTTPS URL is correct (Claude requires HTTPS for remote transports).
- `NEWS_API_KEY` missing: The server refuses to start without it; set the variable inside the Railway environment.
- Logs: Use `railway logs` or the dashboard logs to observe MCP traffic and diagnose errors.
