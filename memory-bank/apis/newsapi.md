# NewsAPI Integration — Headline Vibes

Last updated: 2025-08-21

## Overview

Headline Vibes fetches news headlines from NewsAPI (https://newsapi.org) to analyze sentiment. Requests are made via axios with the `X-Api-Key` header using the `NEWS_API_KEY` environment variable.

Base URL:
- https://newsapi.org/v2

Authentication:
- Header: `X-Api-Key: &lt;NEWS_API_KEY&gt;`

## Endpoints Used

1) /top-headlines (Daily snapshot)
- Purpose: Get current top headlines for a date (we constrain by date with from/to filters).
- Current code parameters:
  - sources: comma-separated list of source IDs (e.g., `associated-press,reuters,...`)
  - country: `us`
  - category: `business`
  - from: YYYY-MM-DD
  - to: YYYY-MM-DD
  - language: `en`
  - pageSize: up to 100
  - page: 1..N
- Important constraint (per NewsAPI docs):
  - DO NOT mix `sources` with `country` or `category`.
  - Current code combines `sources` with `country` and `category`, which may be rejected by the API or produce unexpected results.
- Recommended compliant patterns:
  - Pattern A (source-driven): Use `sources` only, remove `country` and `category`.
  - Pattern B (country/category-driven): Remove `sources`, use `country=us` and `category=business`.
  - Keep `language=en` and pagination as needed.

2) /everything (Monthly range aggregation)
- Purpose: Retrieve articles across a month range.
- Parameters used:
  - sources: preferred list (comma-separated)
  - from: YYYY-MM-01
  - to: YYYY-MM-lastDay
  - language: `en`
  - pageSize: up to 100
  - page: 1..N
- Notes:
  - `/everything` supports broader queries and is appropriate for historical/monthly analysis.
  - Ensure date ranges are valid and consider rate limits.

## Pagination Strategy

- pageSize: 100 (maximum allowed by NewsAPI)
- Iterate `page` until:
  - A response contains fewer than pageSize articles, or
  - Local cap is reached (daily: 500, monthly: 1000)
- Local Caps:
  - Daily analysis: up to 500 headlines after filtering
  - Monthly analysis: up to 1000 headlines per month range before aggregation

## Source Identifiers vs Names

- NewsAPI returns `article.source` as:
  - `{ id: string | null, name: string }`
- Our code:
  - Requests with `sources` using source IDs (kebab-case like `associated-press`).
  - For political categorization, it normalizes `article.source.name` to kebab-case:
    - `name?.toLowerCase().replace(/\s+/g, '-')`
- Caveat:
  - Source `name` may not exactly match the ID format. When mapping to political categories, unknown names default to `center`.
  - Consider aligning mappings to use `source.id` when available to reduce mismatches.

## Rate Limits and Considerations

- NewsAPI has rate limits that vary by plan; excessive pagination across multiple months may hit limits.
- Techniques to stay within limits:
  - Keep caps (500/1000) strict.
  - Avoid repeated identical calls; consider caching/memoization in the future.
  - Prefer `sources`-only or `country/category`-only patterns to avoid invalid requests.

## Example Parameter Sets

- Daily (Pattern A - sources only):
  - Endpoint: `/top-headlines`
  - Params:
    - `sources=associated-press,reuters,bloomberg,usa-today,...`
    - `language=en`
    - `pageSize=100`
    - `page=1..N`
    - Optionally constrain by `from` and `to` if supported and desired; verify API behavior.

- Daily (Pattern B - country/category only):
  - Endpoint: `/top-headlines`
  - Params:
    - `country=us`
    - `category=business`
    - `language=en`
    - `pageSize=100`
    - `page=1..N`

- Monthly:
  - Endpoint: `/everything`
  - Params:
    - `sources=associated-press,reuters,bloomberg,usa-today,...`
    - `from=YYYY-MM-01`
    - `to=YYYY-MM-lastDay`
    - `language=en`
    - `pageSize=100`
    - `page=1..N`

## Error Handling

- Network/API errors should surface as `McpError` with `ErrorCode.InternalError`.
- Invalid parameters (e.g., date format) should surface as `McpError` with `ErrorCode.InvalidParams`.
- For monthly processing, handle failures per month and continue aggregation where possible.

## Testing Checklist

- Verify that `/top-headlines` requests do not mix `sources` with `country` or `category`.
- Confirm pagination stops correctly when fewer than 100 results are returned.
- Validate date parsing for:
  - Exact dates (YYYY-MM-DD)
  - Natural language inputs (chrono-node)
- Ensure political mapping works for known sources; unknowns fall back to `center`.
- Monitor `relevance_rate` across typical days to evaluate filter performance.

## Action Item Summary

- Update daily `/top-headlines` requests to use either:
  - `sources` only, or
  - `country` + `category` (no `sources`)
- Consider using `article.source.id` for political categorization when available to reduce mapping drift.
