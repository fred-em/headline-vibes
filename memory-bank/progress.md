# Progress — Headline Vibes

Last updated: 2025-08-21

## Current Status

- MCP server implemented in TypeScript (ESM) with MCP SDK 0.6.0
- Tools available:
  - analyze_headlines (daily, natural language or YYYY-MM-DD)
  - analyze_monthly_headlines (range of YYYY-MM months)
- Dual sentiment scores:
  - General (sentiment.comparative) normalized to 0–10
  - Investor (custom weighted lexicon) normalized to 0–10
- Transparency metrics:
  - Filtering stats, source distribution, political distribution, sample headlines
- Memory Bank initialized with core docs

## What Works

- Natural language date parsing (chrono-node) with strict YYYY-MM-DD fallback
- Headline fetching with pagination (axios) and caps (daily: 500, monthly: 1000)
- Investor relevance filtering (inclusion/exclusion) before scoring
- Political categorization (left/center/right) via static source mapping
- Synopses generation for general market sentiment and investor climate
- Graceful error handling (McpError) and shutdown (SIGINT)

## What’s Left To Build / Improve

- README parity:
  - Document analyze_monthly_headlines (missing)
  - Reconcile “up to 100 headlines” vs code caps (500/1000)
- NewsAPI request compliance:
  - Verify that “sources” is not combined with “country” or “category” in /top-headlines
  - Adjust params accordingly
- Testing:
  - Unit tests for date parsing, filtering, normalization, political mapping
- Maintainability:
  - Consider externalizing lexicons and source mapping
- Performance/Cost:
  - Optional caching/memoization layer for repeated identical inputs

## Known Issues / Risks

- NewsAPI param constraints:
  - Potential invalid combination: sources + country/category (to be corrected)
- Source ID vs Name:
  - Categorization uses normalized article.source.name; ensure consistency vs NewsAPI source IDs
- Rate limits:
  - Heavy monthly ranges may approach rate limits; watch pagination caps
- Headline noise:
  - Relevance rules may under/over-filter; stats are included to guide tuning

## Decision Log (Evolution)

- Chosen normalization ranges:
  - General: [-5, 5] -> [0, 10]
  - Investor: [-4, 4] -> [0, 10]
- Conservative fallbacks:
  - Unmapped sources default to “center”
- Stateless by design:
  - No runtime persistence; Memory Bank provides documentation memory
- Transport:
  - stdio transport selected for MCP server

## Next Actions

1) Fix /top-headlines param composition to comply with NewsAPI rules
2) Update README:
   - Add analyze_monthly_headlines usage and response shape
   - Align documented headline limits with implementation, or adjust implementation
3) Add tests for:
   - parseDate logic and exact date acceptance
   - relevance filtering correctness
   - normalization clamping and ranges
   - political mapping outcomes
4) Evaluate simple caching approach (optional/future)

## References

- Env: NEWS_API_KEY required
- Build: npm run build (outputs to build/index.mjs)
- Run via MCP client pointing to build/index.mjs
