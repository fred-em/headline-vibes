# Product Context — Headline Vibes

Last updated: 2025-08-21

## Why This Exists

Decision-makers and LLM agents need a fast, standardized snapshot of market-relevant news sentiment. Raw headline feeds are noisy and inconsistent across sources. Headline Vibes provides a consistent interface that:
- Normalizes and interprets sentiment (0–10 scale)
- Filters for investor relevance
- Surfaces political-leaning and source distribution for transparency
- Supports natural language dates and monthly ranges

## Problems Solved

- Fragmented sources: unify major US publishers into one analysis result
- Noisy content: exclude lifestyle/irrelevant topics using relevance filters
- Ambiguous sentiment: dual scoring (general vs investor-specific)
- Lack of transparency: include distributions, filtering stats, and sample headlines
- Friction in date selection: accept natural language (e.g., “yesterday”)

## Users

- LLM agents using MCP to incorporate market sentiment
- Developers integrating headline sentiment signals into analysis or dashboards
- Operators reviewing sentiment trends and coverage balance across political leanings

## How It Should Work (UX/Behavior)

- Discoverability: ListTools returns two tools:
  - analyze_headlines(input: string)
  - analyze_monthly_headlines(startMonth: YYYY-MM, endMonth: YYYY-MM)
- Input:
  - analyze_headlines accepts natural language or ISO date (YYYY-MM-DD)
  - analyze_monthly_headlines accepts ISO months (YYYY-MM)
- Output includes:
  - overall_sentiment.general (score + synopsis)
  - overall_sentiment.investor (score + synopsis + key_terms)
  - political_sentiments (left/center/right) with scores and counts
  - filtering_stats (total vs relevant, relevance_rate)
  - headlines_analyzed, sources_analyzed
  - source_distribution and political_distribution
  - sample_headlines_by_leaning (up to 5 per category)
- Reliability:
  - Clear error messages for invalid dates, unparseable inputs, and NewsAPI errors
  - Conservative fallbacks: uncategorized sources default to “center”
  - Pagination with caps to respect rate limits

## Example Interactions

- Daily analysis (natural language):
  - name: analyze_headlines, arguments: { "input": "yesterday" }
- Daily analysis (specific date):
  - name: analyze_headlines, arguments: { "input": "2025-02-11" }
- Monthly range analysis:
  - name: analyze_monthly_headlines, arguments: { "startMonth": "2024-01", "endMonth": "2024-12" }

## Value Proposition

- Speed: one call to summarize the day’s (or month’s) investment-relevant sentiment
- Clarity: normalized scales and plain-language synopses
- Transparency: distributions and samples reveal coverage patterns
- Consistency: deterministic relevance filters and lexicon-based investor score

## Usage Guidance

- For snapshots of a single day’s headlines, use analyze_headlines
- For trend-like aggregations across months, use analyze_monthly_headlines
- For cost control, avoid repeated calls with identical inputs (future: caching may be added)
- Ensure NEWS_API_KEY is configured in MCP settings

## Out of Scope (Product)

- Topic/entity-level breakdown (per ticker or sector)
- Visualization/graphing (external responsibility)
- Persistent storage or analytics UI (this Memory Bank is documentation-only)
- Real-time streaming or long-polling

## KPIs / Signals of Success

- Low error rate for natural language parsing and API requests
- Stable relevance_rate across typical days (indicates balanced filtering)
- Coverage balance across political leanings (non-zero representation when available)
- Reasonable headlines_analyzed and sources_analyzed counts without rate-limit errors

## Future Opportunities

- Caching/memoization of results for specific dates/months
- Time-series trend comparisons and change explanations
- Expanded or tunable investor lexicon and dynamic weighting
- Source mapping maintenance automation and coverage audits
