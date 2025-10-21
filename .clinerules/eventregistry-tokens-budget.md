## Brief overview
- Scope: Guardrails for using Event Registry (newsapi.ai) with a 50K tokens/month plan, emphasizing predictable spend, preflight token estimation, and safe defaults.
- Goal: Keep monthly usage within included tokens unless explicitly approved; make the cost of each action transparent before execution.

## Plan details (newsapi.ai)
- Subscribed plan: 50,000 tokens/month for $400/month.
- Overage rate: $0.015 per token over the plan limit (equivalently $15 per 1,000 tokens).
- Interpretation: Tokens track action complexity, not request count; every qualifying action consumes tokens.

## Token accounting and thresholds
- Centralize accounting:
  - All Event Registry calls must route through a single service boundary that estimates and records token use before execution.
  - Record actual vs estimated tokens per operation for drift monitoring.
- Preflight requirement:
  - Estimate tokens for any operation prior to execution; attach estimate and rationale to logs/metrics.
- Thresholds (month-to-date):
  - Soft cap 80% (40,000 tokens): allow only essential jobs; batch/defer non-urgent.
  - Hard cap 95% (47,500 tokens): block non-critical; require explicit approval flag to proceed.
  - Over-cap: Never exceed 50,000 tokens without an explicit “allow-overage” flag on the job.
- Unknown-cost actions:
  - If token cost is unspecified by docs, assume conservative upper-bound and require approval unless the estimate remains below 1% of monthly tokens.

## Token costs by operation (from docs)
- Searches (with a single search retrieving up to 100 articles or 50 events):
  - Article search, recent (last 30 days): 1 token per search.
  - Article search, historical (since 2014): 5 tokens per searched year.
  - Event search, recent (last 30 days): 5 tokens per search.
  - Event search, historical (since 2014): 20 tokens per searched year.
- Summaries on search results:
  - Group A (Top concepts, Tag cloud, Locations, Timeline, Top news sources, Concept graph, Categories):
    - Recent: 5 tokens.
    - Historical: 10 tokens per searched year.
  - Group B (Concept trends, date mentions, clustering of events, Similar events):
    - Recent: 10 tokens.
    - Historical: 50 tokens per searched year.
- Text analytics on own docs (semantic annotation, categorization, etc.):
  - Tokens apply per docs; if specific costs are not enumerated, treat as unknown-cost and follow “Unknown-cost actions” above.

## Estimation rules and examples
- Searched year counting:
  - Count distinct calendar years intersecting the time window (inclusive). Example: 2015–2017 = 3 years.
- Search estimates:
  - Recent article query: 1 token each.
  - Historical article query across Y years: 5 × Y tokens.
  - Recent event query: 5 tokens each.
  - Historical event query across Y years: 20 × Y tokens.
- Summary estimates:
  - Group A: recent 5 tokens; historical 10 × Y tokens.
  - Group B: recent 10 tokens; historical 50 × Y tokens.
- Cost intuition (overage pricing reference):
  - 1,000 tokens ≈ $15 overage; 10,000 tokens ≈ $150 overage.
- Worked examples:
  - Articles, historical 2015–2017 (3 years): 5 × 3 = 15 tokens (≈ 0.03% of monthly quota).
  - Events, historical 2015–2017 (3 years): 20 × 3 = 60 tokens (≈ 0.12% of monthly quota).
  - Group B summary, historical 2015–2017 (3 years): 50 × 3 = 150 tokens (≈ 0.3% of monthly quota).

## Operational guardrails
- Prefer recent windows:
  - Use recent queries whenever feasible; they are drastically cheaper.
  - Avoid historical multi-year spans unless the outcome requires it; split by year when possible for better control and monitoring.
- Minimize heavy summaries:
  - Default to Group A; require explicit justification for Group B, especially on historical ranges.
  - Cache and reuse summaries for identical queries/time windows.
- Control result volume:
  - If more than 100 articles or 50 events are needed, treat each additional search/page as a separate token-bearing action in estimation.
- Approval gates:
  - Historical Group B on multi-year ranges requires explicit approval and preflight estimate posted to logs.

## Implementation guidance (Headline Vibes alignment)
- Service boundary:
  - Add/centralize Event Registry usage behind a single service (no direct client calls from tool handlers).
  - Enforce estimation-before-execution inside this service.
- Budget integration:
  - Use/extend the existing budget manager to:
    - estimateTokens(operation, params, window),
    - shouldThrottle() based on monthly token thresholds,
    - recordRequest(tokens) on completion for accounting.
- Configuration:
  - Keep plan parameters (monthly tokens, overage cost) configurable via env and documented in .env.example.
  - Add guardrails to disable overage by default; require an explicit env or runtime flag to allow it.

## Testing and verification
- Unit tests:
  - Year counting (inclusive boundaries, crossing new year).
  - Mapping from operation → token estimate (recent vs historical, Group A/B).
  - Threshold logic (80% soft cap; 95% hard cap; overage flag behavior).
- Drift checks:
  - Periodically reconcile estimated vs observed usage; raise alert if variance > 10% over a week.

## Reporting and observability
- Emit structured logs for each call: operation type, time window, estimated tokens, actual tokens (if available), MTD totals, threshold status.
- Provide daily and weekly rollups of tokens used, remaining quota, and projected run-rate vs month-end target.
