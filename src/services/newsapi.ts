import axios from 'axios';
import { getConfig } from '../config.js';
import type { Article } from '../types.js';
import { normalizeDate } from '../utils/date.js';

/**
 * Raw types matching NewsAPI responses
 */
type RawSource = { id: string | null; name: string };
type RawArticle = {
  source: RawSource;
  title: string;
  publishedAt: string;
  url?: string;
};
type RawResponse = {
  status: 'ok' | 'error';
  totalResults: number;
  articles: RawArticle[];
};

/**
 * Options for pagination and filtering
 */
export interface FetchOptions {
  sources?: string[]; // list of source ids
  pageCap?: number; // max number of pages to fetch (pageSize=100)
  language?: string; // defaults to 'en'
}

/**
 * NewsApiClient encapsulates compliant request construction and pagination.
 * Compliance: when 'sources' is provided, do NOT include 'country' or 'category'.
 * - For present-day requests, prefers /top-headlines with sources-only.
 * - For historical day/range, uses /everything with 'from' and 'to' bounds.
 */
export class NewsApiClient {
  private axios: ReturnType<typeof axios.create>;
  private readonly pageSize = 100;

  constructor(private readonly apiKey = getConfig().newsApiKey) {
    if (!apiKey) {
      throw new Error('NEWS_API_KEY is required to initialize NewsApiClient');
    }
    this.axios = axios.create({
      baseURL: 'https://newsapi.org/v2',
      headers: {
        'X-Api-Key': apiKey,
      },
      timeout: 30000,
    });
  }

  /**
   * Fetch top headlines for a specific date.
   * - If the date is today (UTC), uses /top-headlines (sources-only, no country/category).
   * - Otherwise, uses /everything with from=to=date for historical fetch.
   */
  async fetchTopHeadlinesByDate(date: string, opts: FetchOptions = {}): Promise<Article[]> {
    const normalized = normalizeDate(date);
    const todayUTC = normalizeDate(new Date());

    const useTopHeadlines = normalized === todayUTC;

    if (useTopHeadlines) {
      return this.fetchTopHeadlinesRecent(opts);
    } else {
      // Fall back to historical day query via /everything
      return this.fetchEverythingRange(normalized, normalized, opts);
    }
  }

  /**
   * Historical/monthly fetching with explicit range [start, end] (inclusive).
   * Uses /everything with sources-only for compliance.
   */
  async fetchEverythingRange(start: string, end: string, opts: FetchOptions = {}): Promise<Article[]> {
    const sourcesCsv = (opts.sources ?? []).join(',') || undefined;
    const language = opts.language ?? 'en';
    const pageCap = Math.max(1, opts.pageCap ?? 10);
    const results: Article[] = [];

    let page = 1;
    while (page <= pageCap) {
      const { data } = await this.axios.get<RawResponse>('/everything', {
        params: {
          sources: sourcesCsv, // when present, do not mix country/category
          from: start,
          to: end,
          language,
          pageSize: this.pageSize,
          page,
          sortBy: 'publishedAt',
        },
      });

      if (data.status !== 'ok') break;

      const mapped = data.articles.map(this.mapArticle);
      results.push(...mapped);

      if (data.articles.length < this.pageSize) break;
      page++;
    }

    return results;
  }

  /**
   * Helper to fetch most recent top headlines (today) via /top-headlines.
   * Compliance: sources-only if provided; no country/category when sources are set.
   */
  private async fetchTopHeadlinesRecent(opts: FetchOptions = {}): Promise<Article[]> {
    const sourcesCsv = (opts.sources ?? []).join(',') || undefined;
    const language = opts.language ?? 'en';
    const pageCap = Math.max(1, opts.pageCap ?? 3);

    const results: Article[] = [];
    let page = 1;

    while (page <= pageCap) {
      const { data } = await this.axios.get<RawResponse>('/top-headlines', {
        params: {
          // When sources is provided, omit country/category to comply with NewsAPI rules.
          sources: sourcesCsv,
          language,
          pageSize: this.pageSize,
          page,
        },
      });

      if (data.status !== 'ok') break;

      const mapped = data.articles.map(this.mapArticle);
      results.push(...mapped);

      if (data.articles.length < this.pageSize) break;
      page++;
    }

    return results;
  }

  /**
   * Map NewsAPI RawArticle to our internal Article shape.
   * We keep the raw source.id (nullable) and source name; date remains ISO-8601 string.
   */
  private mapArticle(raw: RawArticle): Article {
    return {
      id: raw.source?.id ?? null,
      sourceName: raw.source?.name ?? 'Unknown',
      title: raw.title,
      publishedAt: raw.publishedAt,
      url: raw.url,
    };
  }
}

export default NewsApiClient;
