# Active Context — Headline Vibes

Last updated: 2025-10-21

## Current Focus

- Finalize EventRegistry migration + MCP SDK 1.20 upgrade.
- Ensure structured outputs, diagnostics, and documentation stay in sync.
- Prepare for Railway deployment with HTTP transport and health checks.

## Recent Changes

- Upgraded dependencies (MCP SDK 1.20, TypeScript 5.9, Vitest, Zod, Pino).
- Rebuilt server entrypoint with structuredContent, logging, HTTP allowlists.
- Added analysis service, relevance helpers, synopsis generators.
- Integrated EventRegistry client (article/getArticles) with source URI resolution.
- Added docs/railway.md and refreshed Memory Bank.

## Next Steps

- Expand automated tests (analysis orchestration, source resolver).
- Evaluate caching strategies for repeated queries.
- Prepare deployment checklist (Railway env + smoke tests) before go-live.
- Monitor EventRegistry token usage post-deployment; tune caps if needed.

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
- Keep political mapping + lexicons in code; revisit externalization once stable.
- Support both stdio (local dev) and HTTP (Railway) transports; HTTP protected by host/origin allowlists.
- Structured MCP responses use Zod schemas validated server-side.

## Open Questions / Considerations

1) Testing depth:
   - Need mocked EventRegistry responses for analysis service unit tests.
2) Token budgeting persistence:
   - Current implementation is in-memory; multi-instance deployment could double-count.
3) Source resolver cache:
   - Consider seeding critical URIs or persisting cache for deterministic coverage.
4) Observability:
   - Do we need structured log shipping or metrics for production Railway deployment?
5) Future toolset:
   - Should we expose additional tools (historical comparisons, anomaly scans)?

## Quick Reference (Tools)

- analyze_headlines(input: string)
  - Accepts natural language or YYYY-MM-DD
  - Returns general/investor scores, synopses, distributions, diagnostics (token & sampling)
- analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)
  - Returns per-month political sentiments, headline counts, diagnostics, and optional error fields

## Insights & Learnings

- Investor relevance filtering notably improves signal for market-centric analysis.
- Dual sentiment (general vs investor) provides complementary perspectives.
- Transparent distributions help diagnose source bias and coverage gaps.
