# Active Context — Headline Vibes

Last updated: 2025-08-21

## Current Focus

- Initialize the Memory Bank for the Headline Vibes MCP server to ensure stateless continuity across sessions.
- Document system behavior, APIs, patterns, and constraints comprehensively.
- Highlight mismatches and potential improvements discovered during review.

## Recent Changes

- Created Memory Bank directory and core docs:
  - projectbrief.md
  - productContext.md
  - systemPatterns.md
  - techContext.md
- Tailored content to current code and README.

## Next Steps

- Create progress.md to track status, known issues, and upcoming work.
- (Optional) Add memory-bank/apis/newsapi.md to document endpoints, params, and rate-limit considerations.
- Align README with current capabilities:
  - Document analyze_monthly_headlines tool and monthly outputs.
  - Reconcile stated headline limits (README says 100 vs code caps 500/1000).

## Important Patterns and Preferences

- Documentation-first approach: Memory Bank is source of truth for project context.
- Deterministic, explainable outputs:
  - Provide normalized scores and plain-language synopses.
  - Include distributions and filtering stats for transparency.
- Conservative fallbacks:
  - Uncategorized sources default to "center".
  - Clear error messages for invalid dates and API failures.
- Keep runtime stateless (docs only; no DB).

## Active Decisions

- Maintain documentation-only memory (no runtime persistence).
- Keep political mapping and investor lexicon in code for now; consider externalizing later.
- Use stdio transport for MCP; graceful shutdown on SIGINT.

## Open Questions / Considerations

1) NewsAPI /top-headlines parameters:
   - The code currently combines "sources" with "country" and "category". Per NewsAPI docs, "sources" cannot be mixed with "country" or "category". Action: verify and adjust request params to ensure compliance.

2) README parity:
   - README "Features" mentions up to 100 headlines, but code supports pagination with caps up to 500 (daily) and 1000 (monthly). Action: update README or adjust code to match the documented limit.

3) Source categorization:
   - Categorization uses article.source.name normalized to kebab-case, while NewsAPI "sources" param uses source IDs. Ensure mapping consistency between IDs and names for categorization.

4) Caching:
   - Consider lightweight memoization for repeated identical queries to reduce API calls (out of current scope but valuable).

5) Testing:
   - Add tests for date parsing, filtering accuracy, normalization, and political categorization.

## Quick Reference (Tools)

- analyze_headlines(input: string)
  - Accepts natural language or YYYY-MM-DD
  - Returns general/investor scores, synopses, distributions, filtering stats
- analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)
  - Returns per-month political sentiments, headline counts, sample headlines

## Insights & Learnings

- Investor relevance filtering notably improves signal for market-centric analysis.
- Dual sentiment (general vs investor) provides complementary perspectives.
- Transparent distributions help diagnose source bias and coverage gaps.
