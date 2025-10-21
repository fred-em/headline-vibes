import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { PREFERRED_SOURCE_IDS } from '../constants/sources.js';
import type { LeaningKey, PoliticalLeaning } from '../types.js';
import { evaluateHeadlineRelevance } from './relevance.js';
import { summarizeGeneralSentiment, summarizeInvestorSentiment } from './summaries.js';
import { NewsApiClient, FetchOptions } from './newsapi.js';
import { scoreGeneral, scoreInvestor } from './scoring.js';
import { sourceToLeaning } from './categorization.js';
import { round2 } from '../utils/normalize.js';
import { monthRange } from '../utils/date.js';
import {
  estimateTokensForArticleSearch,
  checkAndRecord,
  recordActual,
  type TokenCheckResult,
} from './tokenBudget.js';
import { shouldThrottle, recordRequest } from './budgetManager.js';
import type { Article } from '../types.js';
import { getConfig } from '../config.js';

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export interface AnalyzeHeadlinesResult {
  date: string;
  overall_sentiment: {
    general: { score: number; synopsis: string };
    investor: { score: number; synopsis: string; key_terms: Record<string, number> };
  };
  political_sentiments: Record<PoliticalLeaning, PoliticalSentiment>;
  filtering_stats: {
    total_headlines: number;
    relevant_headlines: number;
    relevance_rate: number;
  };
  headlines_analyzed: number;
  sources_analyzed: number;
  source_distribution: Record<string, number>;
  political_distribution: Record<LeaningKey, number>;
  sample_headlines_by_leaning: Record<PoliticalLeaning, string[]>;
  diagnostics: {
    token_budget: TokenBudgetDiagnostics;
    sampling: SamplingDiagnostics;
  };
}

export interface AnalyzeMonthlyResult {
  months: Record<
    string,
    {
      date_range: { start: string; end: string };
      total_headlines: number;
      political_sentiments: Record<PoliticalLeaning, PoliticalSentiment>;
      diagnostics: {
        token_budget: TokenBudgetDiagnostics;
        sampling: MonthlySamplingDiagnostics;
      };
      error?: string;
    }
  >;
}

interface PoliticalSentiment {
  general: number;
  investor: number;
  headlines: number;
  sample_headlines: string[];
}

interface TokenBudgetDiagnostics {
  status: TokenCheckResult['status'];
  estimate_tokens: number;
  requests_made: number;
  mtd_tokens: number;
  monthly_tokens: number;
  soft_cap_pct: number;
  hard_cap_pct: number;
}

interface SamplingDiagnostics {
  sources_targeted: number;
  sources_with_relevant: number;
  page_cap: number;
  pages_fetched: number;
  per_source_quota: number;
}

interface MonthlySamplingDiagnostics {
  sources_targeted: number;
  page_cap: number;
  pages_fetched: number;
}

export async function analyzeDailyHeadlines(
  date: string,
  opts: { client?: NewsApiClient; fetch?: FetchOptions; maxHeadlines?: number } = {},
): Promise<AnalyzeHeadlinesResult> {
  if (shouldThrottle()) {
    throw new AnalysisError('Rate limit exceeded. Please retry later.', ErrorCode.InvalidRequest);
  }

  const cfg = getConfig();
  const sources = opts.fetch?.sources ?? Array.from(PREFERRED_SOURCE_IDS);
  const pageCap = opts.fetch?.pageCap ?? cfg.backfill.pageCapPerDay;

  const tokenEstimate = estimateTokensForArticleSearch({
    startDate: date,
    endDate: date,
    pagesPlanned: pageCap,
  });
  const tokenStatus = checkAndRecord(tokenEstimate);
  if (!tokenStatus.allowed) {
    throw new AnalysisError(
      'Token budget exhausted for requested day.',
      ErrorCode.InvalidRequest,
      tokenStatus,
    );
  }

  const client = opts.client ?? new NewsApiClient();
  const { articles, requestCount, pagesFetched } = await client.fetchTopHeadlinesByDate(date, {
    ...opts.fetch,
    sources,
    pageCap,
  });
  recordRequest(requestCount);
  recordActual(requestCount, tokenEstimate);

  const maxHeadlines = opts.maxHeadlines ?? Math.max(100, pageCap * 100);

  const sourceDistribution: Record<string, number> = {};
  const politicalDistribution: Record<LeaningKey, number> = {
    left: 0,
    center: 0,
    right: 0,
    other: 0,
  };

  const relevantBySource = new Map<string, Article[]>();
  const relevantHeadlines: string[] = [];

  for (const article of articles) {
    const sourceName = article.sourceName || 'Unknown';
    sourceDistribution[sourceName] = (sourceDistribution[sourceName] || 0) + 1;

    const leaning = sourceToLeaning(article.id, article.sourceName);
    politicalDistribution[leaning] = (politicalDistribution[leaning] || 0) + 1;

    const relevance = evaluateHeadlineRelevance(article.title);
    if (relevance.relevant) {
      relevantHeadlines.push(article.title);
      const existing = relevantBySource.get(sourceName) ?? [];
      existing.push(article);
      relevantBySource.set(sourceName, existing);
    }
  }

  const sourcesWithRelevant = Array.from(relevantBySource.keys());
  const perSourceQuota = sourcesWithRelevant.length
    ? Math.max(1, Math.floor(maxHeadlines / sourcesWithRelevant.length))
    : maxHeadlines;

  const sampledHeadlines: string[] = [];
  const sampledByLeaning: Record<PoliticalLeaning, string[]> = {
    left: [],
    center: [],
    right: [],
  };

  outer: for (const sourceName of sourcesWithRelevant) {
    const articlesFromSource = relevantBySource.get(sourceName)!;
    const leaning = sourceToLeaning(articlesFromSource[0]?.id, articlesFromSource[0]?.sourceName);
    let used = 0;
    for (const article of articlesFromSource) {
      if (sampledHeadlines.length >= maxHeadlines) break outer;
      if (used >= perSourceQuota) break;
      sampledHeadlines.push(article.title);
      sampledByLeaning[leaning].push(article.title);
      used += 1;
    }
  }

  const filteringStats = {
    total_headlines: articles.length,
    relevant_headlines: relevantHeadlines.length,
    relevance_rate: articles.length ? round2((relevantHeadlines.length / articles.length) * 100) : 0,
  };

  const investorScoreResult = scoreInvestor(sampledHeadlines);
  const generalScore = scoreGeneral(sampledHeadlines);

  const political_sentiments: Record<PoliticalLeaning, PoliticalSentiment> = {
    left: summarizeLeaning(sampledByLeaning.left),
    center: summarizeLeaning(sampledByLeaning.center),
    right: summarizeLeaning(sampledByLeaning.right),
  };

  const diagnostics = {
    token_budget: toTokenDiagnostics(tokenStatus, tokenEstimate, requestCount),
    sampling: {
      sources_targeted: sources.length,
      sources_with_relevant: sourcesWithRelevant.length,
      page_cap: pageCap,
      pages_fetched: pagesFetched,
      per_source_quota: perSourceQuota,
    },
  };

  return {
    date,
    overall_sentiment: {
      general: {
        score: generalScore,
        synopsis: summarizeGeneralSentiment(generalScore, sampledHeadlines),
      },
      investor: {
        score: investorScoreResult.score,
        synopsis: summarizeInvestorSentiment(
          investorScoreResult.score,
          sampledHeadlines,
          investorScoreResult.keyTerms,
        ),
        key_terms: investorScoreResult.keyTerms,
      },
    },
    political_sentiments,
    filtering_stats: filteringStats,
    headlines_analyzed: sampledHeadlines.length,
    sources_analyzed: sourcesWithRelevant.length,
    source_distribution: sourceDistribution,
    political_distribution: politicalDistribution,
    sample_headlines_by_leaning: {
      left: sampledByLeaning.left.slice(0, 5),
      center: sampledByLeaning.center.slice(0, 5),
      right: sampledByLeaning.right.slice(0, 5),
    },
    diagnostics,
  };
}

export async function analyzeMonthlyHeadlines(
  startMonth: string,
  endMonth: string,
  opts: { client?: NewsApiClient; fetch?: FetchOptions } = {},
): Promise<AnalyzeMonthlyResult> {
  const cfg = getConfig();
  const ranges = monthRange(startMonth, endMonth);
  const client = opts.client ?? new NewsApiClient();
  const sources = opts.fetch?.sources ?? Array.from(PREFERRED_SOURCE_IDS);
  const pageCap = opts.fetch?.pageCap ?? cfg.backfill.pageCapPerDay;

  const months: AnalyzeMonthlyResult['months'] = {};

  for (const range of ranges) {
    const monthKey = range.start.slice(0, 7);
    const tokenEstimate = estimateTokensForArticleSearch({
      startDate: range.start,
      endDate: range.end,
      pagesPlanned: pageCap,
    });
    const tokenStatus = checkAndRecord(tokenEstimate);

    if (!tokenStatus.allowed) {
      months[monthKey] = {
        date_range: range,
        total_headlines: 0,
        political_sentiments: emptySentiments(),
        diagnostics: {
          token_budget: toTokenDiagnostics(tokenStatus, tokenEstimate, 0),
          sampling: {
            sources_targeted: sources.length,
            page_cap: pageCap,
            pages_fetched: 0,
          },
        },
        error: 'Token budget exhausted before fetch.',
      };
      continue;
    }

    try {
      const { articles, requestCount, pagesFetched } = await client.fetchEverythingRange(
        range.start,
        range.end,
        {
          ...opts.fetch,
          sources,
          pageCap,
        },
      );
      recordRequest(requestCount);
      recordActual(requestCount, tokenEstimate);

      const byLeaning: Record<PoliticalLeaning, string[]> = {
        left: [],
        center: [],
        right: [],
      };

      for (const article of articles) {
        const leaning = sourceToLeaning(article.id, article.sourceName);
        byLeaning[leaning].push(article.title);
      }

      months[monthKey] = {
        date_range: range,
        total_headlines: articles.length,
        political_sentiments: {
          left: summarizeLeaning(byLeaning.left),
          center: summarizeLeaning(byLeaning.center),
          right: summarizeLeaning(byLeaning.right),
        },
        diagnostics: {
          token_budget: toTokenDiagnostics(tokenStatus, tokenEstimate, requestCount),
          sampling: {
            sources_targeted: sources.length,
            page_cap: pageCap,
            pages_fetched: pagesFetched,
          },
        },
      };
    } catch (err: any) {
      months[monthKey] = {
        date_range: range,
        total_headlines: 0,
        political_sentiments: emptySentiments(),
        diagnostics: {
          token_budget: toTokenDiagnostics(tokenStatus, tokenEstimate, 0),
          sampling: {
            sources_targeted: sources.length,
            page_cap: pageCap,
            pages_fetched: 0,
          },
        },
        error: err?.message ?? 'Unknown error while fetching monthly headlines.',
      };
    }
  }

  return { months };
}

function summarizeLeaning(headlines: string[]): PoliticalSentiment {
  const { score: investorScore } = scoreInvestor(headlines);
  const generalScore = scoreGeneral(headlines);
  return {
    general: generalScore,
    investor: investorScore,
    headlines: headlines.length,
    sample_headlines: headlines.slice(0, 5),
  };
}

function emptySentiments(): Record<PoliticalLeaning, PoliticalSentiment> {
  return {
    left: summarizeLeaning([]),
    center: summarizeLeaning([]),
    right: summarizeLeaning([]),
  };
}

function toTokenDiagnostics(
  status: TokenCheckResult,
  estimate: number,
  requests: number,
): TokenBudgetDiagnostics {
  return {
    status: status.status,
    estimate_tokens: estimate,
    requests_made: requests,
    mtd_tokens: status.mtdTokens,
    monthly_tokens: status.monthlyTokens,
    soft_cap_pct: status.softCapPct,
    hard_cap_pct: status.hardCapPct,
  };
}
