# EventRegistry Integration — Headline Vibes

Last updated: 2025-10-21

## Overview

Headline Vibes fetches news headlines from EventRegistry (https://newsapi.ai) to analyze sentiment. Requests are made via axios with the `apiKey` query parameter derived from the `NEWS_API_KEY` environment variable.

Base URL (configurable via `NEWS_API_BASE_URL`):
- https://eventregistry.org/api/v1/

Authentication:
- Query param: `apiKey=<NEWS_API_KEY>`

## Endpoint Used

### `POST /article/getArticles`
- Purpose: Retrieve articles for a specific date or date range.
- Required body fields:
  - `resultType`: `"articles"`
  - `dateStart`: `YYYY-MM-DD`
  - `dateEnd`: `YYYY-MM-DD`
  - `lang`: `"eng"`
  - `articlesPage`: integer (1-indexed)
  - `articlesCount`: `100` (EventRegistry max)
  - `articlesSortBy`: `"date"`
- Optional body fields:
  - `sourceUri`: array of canonical source URIs (resolved via `suggestSourcesFast`)
  - `articleBodyLen`: typically `0` (omit article body)
- Response envelope:
  ```jsonc
  {
    "articles": {
      "results": [ ... ],
      "totalResults": 123,
      "pages": 2,
      "page": 1
    }
  }
  ```

## Source URI Resolution

- EventRegistry prefers canonical `sourceUri` values (e.g., `washingtonpost.com`).
- `src/services/sourceResolver.ts`:
  - Normalizes friendly source names (kebab-case) to lookup keys.
  - Uses `GET /suggestSourcesFast` with `text=<name>` to retrieve canonical URIs.
  - Caches results in `data/source-uri-cache.json` to reduce repeated lookups.
- Best practices:
  - Resolve URIs once per request and reuse.
  - Keep curated source list lean (top US outlets across political spectrum).

## Pagination Strategy

- `articlesCount` fixed at 100 (max allowed).
- Iterate `articlesPage` from 1..N until:
  - Returned results < 100, **or**
  - Configured `pageCap` reached (env `BACKFILL_PAGE_CAP_PER_DAY`, default 2).
- Each EventRegistry page counts as one API request; track via budgeting diagnostics.

## Token Budgeting & Rate Limits

- EventRegistry bills via tokens:
  - Recent (≤30 days): 1 token per search (per page).
  - Historical (>30 days): 5 × years-in-range tokens per search.
- `services/tokenBudget.ts` estimates tokens and enforces:
  - Monthly budget (`BUDGET_MONTHLY_TOKENS`, default 50k).
  - Soft cap (`BUDGET_SOFT_CAP_PCT`, default 80%).
  - Hard cap (`BUDGET_HARD_CAP_PCT`, default 95%); blocked unless `ALLOW_OVERAGE=1`.
- `services/budgetManager.ts` still tracks per-second/daily request limits.
- Diagnostics returned in tool responses (`diagnostics.token_budget`).

## Common Parameters (Daily vs Monthly)

| Scenario | dateStart/dateEnd | pageCap | sourceUri | Notes |
| --- | --- | --- | --- | --- |
| Daily (`analyze_headlines`) | Same day (parsed from input) | `BACKFILL_PAGE_CAP_PER_DAY` (default 2) | Resolved URIs for curated sources | Token estimate treated as recent |
| Monthly (`analyze_monthly_headlines`) | Month start/end via `monthRange` | Same `pageCap` per month | Resolved URIs | Token estimate may classify as historical (5× years) |

## Error Handling Notes

- API failures bubble up as `McpError` with `ErrorCode.InternalError`.
- Token budget exhaustion triggers `ErrorCode.ResourceExhausted`.
- Source resolution failures are logged but do not abort; server continues without URIs (broader results).
- Monthly aggregation continues across months even if one month errors (error field recorded in result).

## Testing Checklist

- Mock `article/getArticles` to ensure pagination stops correctly when `results.length < 100`.
- Verify token estimation:
  - Recent date uses 1 token per page.
  - Historical range uses `5 × distinct years`.
- Validate source resolver cache read/write behaviour.
- Confirm diagnostics (`requests_made`, `estimate_tokens`, `status`) align with expectations.
- Smoke test with live key: `node build/scripts/smoke.mjs <date>` (pageCap=1).

## Operational Tips

- Keep `BACKFILL_PAGE_CAP_PER_DAY` conservative (2–3) for initial deployments.
- Monitor returned `requests_made`/`mtd_tokens` to tune budgets.
- Seed `data/source-uri-cache.json` with high-value sources if repeated lookups become costly.
- Set `LOG_LEVEL=debug` temporarily to inspect request previews (API key redacted).
