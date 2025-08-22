/**
 * Shared types for Headline Vibes
 * Mirrors the Implementation Plan [Types] section.
 */

export type SourceId = string; // kebab-case identifier (prefer NewsAPI source.id, fallback to normalized name)

export type PoliticalLeaning = 'left' | 'center' | 'right';

export interface Article {
  id: string | null; // NewsAPI source.id (nullable)
  sourceName: string; // NewsAPI article.source.name
  title: string; // 1..512 chars expected
  publishedAt: string; // ISO-8601 datetime
  url?: string;
}

export interface HeadlineRecord {
  title: string;
  sourceId: SourceId;
  sourceName: string;
  publishedDate: string; // YYYY-MM-DD (UTC normalized)
  leaning: PoliticalLeaning;
}

export interface ScoreDimensions {
  // 0..10 normalized floats; storage should persist with 2 decimal precision
  attention: number;
  investorSentiment: number;
  generalSentiment: number;
  biasIntensity: number;
  novelty: number;
  volShock: number;
}

export interface DailyCounts {
  totalHeadlines: number;
  relevantHeadlines: number;
  sources: number;
}

export type LeaningKey = PoliticalLeaning | 'other';

export interface DailyDistributions {
  bySource: Record<string, number>;
  byLeaning: Record<LeaningKey, number>;
}

export interface DailyScores {
  date: string; // YYYY-MM-DD (UTC)
  grouping: 'aggregate' | PoliticalLeaning;
  counts: DailyCounts;
  distributions: DailyDistributions;
  keyTerms: Record<string, number>; // investor lexicon term frequencies
  sampleHeadlines: string[]; // 0..5
  scores: ScoreDimensions;
  meta: {
    method: 'sourcesOnly' | 'countryCategoryOnly' | 'mixedSafe';
    pageCount: number;
    apiCalls: number;
  };
}

export interface UsageStats {
  date: string; // YYYY-MM-DD
  requests: number;
  articlesFetched: number;
  rateLimitRemaining?: number;
}

export interface Anomaly {
  date: string; // YYYY-MM-DD
  grouping: DailyScores['grouping'];
  metric: keyof ScoreDimensions;
  value: number;
  zScore: number;
  threshold: number;
  direction: 'positive' | 'negative';
}
