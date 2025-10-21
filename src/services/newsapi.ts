import axios from 'axios';
import { getConfig } from '../config.js';
import type { Article } from '../types.js';
import { normalizeDate } from '../utils/date.js';
import { resolveSourceUris } from './sourceResolver.js';

/**
 * Raw types matching Event Registry API responses
 */
type RawSource = { uri: string; title: string };
type RawArticle = {
  uri: string;
  title: string;
  dateTime: string;
  url?: string;
  source: RawSource;
};
type RawResponse = {
  articles?: {
    results: RawArticle[];
    totalResults: number;
    pages: number;
    page: number;
  };
};

/**
 * Options for pagination and filtering
 */
export interface FetchOptions {
  sources?: string[]; // list of source names or URIs
  pageCap?: number; // max number of pages to fetch
  language?: string; // defaults to 'eng'
}

/**
 * NewsApiClient for Event Registry API (newsapi.ai)
 * Uses the Event Registry REST API endpoints with proper authentication
 */
export interface FetchResult {
  articles: Article[];
  requestCount: number;
  pagesFetched: number;
}

export class NewsApiClient {
  private axios: ReturnType<typeof axios.create>;
  private readonly pageSize = 100;

  constructor(private readonly apiKey = getConfig().newsApiKey) {
    if (!apiKey) {
      throw new Error('NEWS_API_KEY is required to initialize NewsApiClient');
    }
    const cfg = getConfig();
    this.axios = axios.create({
      baseURL: cfg.newsApiBaseUrl,
      timeout: 30000,
    });
  }

  /**
   * Fetch top headlines for a specific date.
   * Uses Event Registry's article search endpoint
   */
  async fetchTopHeadlinesByDate(date: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const normalized = normalizeDate(date);
    return this.fetchArticlesByDate(normalized, normalized, opts);
  }

  /**
   * Historical/monthly fetching with explicit range [start, end] (inclusive).
   * Uses Event Registry's article search with date range
   */
  async fetchEverythingRange(start: string, end: string, opts: FetchOptions = {}): Promise<FetchResult> {
    return this.fetchArticlesByDate(start, end, opts);
  }

  /**
   * Core method to fetch articles by date range using Event Registry API
   */
  private async fetchArticlesByDate(startDate: string, endDate: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const language = opts.language ?? 'eng';
    const pageCap = Math.max(1, opts.pageCap ?? 10);
    const results: Article[] = [];
    // Resolve curated source names to Event Registry URIs once per request
    let sourceUris: string[] | undefined;
    if (opts.sources && opts.sources.length > 0) {
      try {
        // Temporary safety cap to limit suggestSourcesFast calls during initial runs
        sourceUris = await resolveSourceUris(opts.sources.slice(0, 10));
      } catch (e: any) {
        console.error('[NewsApiClient] source resolve failed:', e?.message ?? String(e));
      }
    }

    let page = 1;
    let pagesFetched = 0;
    while (page <= pageCap) {
      try {
        const body: any = {
          resultType: 'articles',
          dateStart: startDate,
          dateEnd: endDate,
          lang: language,
          articlesPage: page,
          articlesCount: this.pageSize,
          articlesSortBy: 'date',
          articleBodyLen: 0, // Don't need full body
        };
        const query = { apiKey: this.apiKey };

        // Add source filtering if provided (resolved to canonical URIs)
        if (sourceUris && sourceUris.length > 0) {
          body.sourceUri = sourceUris;
        }

        // Build request with safe logging (do not log apiKey)
        const reqPath = 'article/getArticles';
        try {
          const preview = { ...body, sourceUri: Array.isArray(body.sourceUri) ? `uris:${body.sourceUri.length}` : undefined };
          console.log(`[NewsApiClient] POST ${this.axios.defaults.baseURL}${reqPath} body=${JSON.stringify(preview)}`);
        } catch {}
        const { data } = await this.axios.post<RawResponse>(reqPath, body, { params: query });

        if (!data.articles || !data.articles.results) break;

        const mapped = data.articles.results.map(this.mapArticle);
        results.push(...mapped);
        pagesFetched++;

        if (data.articles.results.length < this.pageSize || page >= data.articles.pages) break;
        page++;
      } catch (error: any) {
        const status = error?.response?.status;
        const statusText = error?.response?.statusText;
        console.error(`[NewsApiClient] Error page ${page}: status=${status ?? 'n/a'} ${statusText ?? ''} message=${error?.message ?? String(error)}`);
        const body = error?.response?.data;
        if (body) {
          try {
            console.error('[NewsApiClient] Response body snippet:', JSON.stringify(body).slice(0, 500));
          } catch {}
        }
        break;
      }
    }

    return {
      articles: results,
      requestCount: pagesFetched,
      pagesFetched,
    };
  }

  /**
   * Map Event Registry RawArticle to our internal Article shape.
   */
  private mapArticle(raw: RawArticle): Article {
    return {
      id: raw.source?.uri ?? null,
      sourceName: raw.source?.title ?? 'Unknown',
      title: raw.title,
      publishedAt: raw.dateTime,
      url: raw.url,
    };
  }
}

export default NewsApiClient;
