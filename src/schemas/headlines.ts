import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const PoliticalSentimentSchema = z.object({
  general: z.number(),
  investor: z.number(),
  headlines: z.number(),
  sample_headlines: z.array(z.string()),
});

export const AnalyzeHeadlinesSchema = z.object({
  date: z.string(),
  overall_sentiment: z.object({
    general: z.object({
      score: z.number(),
      synopsis: z.string(),
    }),
    investor: z.object({
      score: z.number(),
      synopsis: z.string(),
      key_terms: z.record(z.number()),
    }),
  }),
  political_sentiments: z.object({
    left: PoliticalSentimentSchema,
    center: PoliticalSentimentSchema,
    right: PoliticalSentimentSchema,
  }),
  filtering_stats: z.object({
    total_headlines: z.number(),
    relevant_headlines: z.number(),
    relevance_rate: z.number(),
  }),
  headlines_analyzed: z.number(),
  sources_analyzed: z.number(),
  source_distribution: z.record(z.number()),
  political_distribution: z.record(z.number()),
  sample_headlines_by_leaning: z.object({
    left: z.array(z.string()),
    center: z.array(z.string()),
    right: z.array(z.string()),
  }),
  diagnostics: z.object({
    token_budget: z.object({
      status: z.enum(['allowed', 'throttled', 'blocked']),
      estimate_tokens: z.number(),
      requests_made: z.number(),
      mtd_tokens: z.number(),
      monthly_tokens: z.number(),
      soft_cap_pct: z.number(),
      hard_cap_pct: z.number(),
    }),
    sampling: z.object({
      sources_targeted: z.number(),
      sources_with_relevant: z.number(),
      page_cap: z.number(),
      pages_fetched: z.number(),
      per_source_quota: z.number(),
    }),
  }),
});

export const AnalyzeMonthlySchema = z.object({
  months: z.record(
    z.object({
      date_range: z.object({
        start: z.string(),
        end: z.string(),
      }),
      total_headlines: z.number(),
      political_sentiments: z.object({
        left: PoliticalSentimentSchema,
        center: PoliticalSentimentSchema,
        right: PoliticalSentimentSchema,
      }),
      diagnostics: z.object({
        token_budget: z.object({
          status: z.enum(['allowed', 'throttled', 'blocked']),
          estimate_tokens: z.number(),
          requests_made: z.number(),
          mtd_tokens: z.number(),
          monthly_tokens: z.number(),
          soft_cap_pct: z.number(),
          hard_cap_pct: z.number(),
        }),
        sampling: z.object({
          sources_targeted: z.number(),
          page_cap: z.number(),
          pages_fetched: z.number(),
        }),
      }),
      error: z.string().optional(),
    }),
  ),
});

export const analyzeHeadlinesJsonSchema = zodToJsonSchema(
  AnalyzeHeadlinesSchema,
  'AnalyzeHeadlinesResult',
);

export const analyzeMonthlyJsonSchema = zodToJsonSchema(
  AnalyzeMonthlySchema,
  'AnalyzeMonthlyResult',
);
