/**
 * Centralized configuration loader for Headline Vibes.
 * Reads environment variables, parses types, and exposes a typed config object.
 *
 * Environment variables expected (see .env.example to be added later):
 * - NEWS_API_KEY (required for NewsAPI requests)
 * - TRANSPORT=stdio|http (default: stdio)
 * - PORT (default: 3000 for http transport)
 * - PG_URI (optional)
 * - REDIS_URL (optional)
 * - PINECONE_ENABLED=1|0 (optional)
 * - PINECONE_API_KEY (optional)
 * - PINECONE_ENVIRONMENT (optional)
 * - PINECONE_INDEX (optional)
 * - RATE_LIMIT_DAILY_REQUESTS (optional)
 * - RATE_LIMIT_PER_SECOND (optional)
 * - BACKFILL_PAGE_CAP_PER_DAY (default: 2)
 * - BACKFILL_MODE=full|sampled (default: full)
 */

export type Transport = 'stdio' | 'http';

export interface AppConfig {
  transport: Transport;
  port: number;
  newsApiKey: string;
  pgUri?: string;
  redisUrl?: string;
  pinecone: {
    enabled: boolean;
    apiKey?: string;
    environment?: string;
    index?: string;
  };
  rateLimits: {
    dailyRequestsCap?: number;
    perSecondCap?: number;
  };
  backfill: {
    pageCapPerDay: number;
    mode: 'full' | 'sampled';
  };
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function getConfig(): AppConfig {
  const transport: Transport = process.env.TRANSPORT === 'http' ? 'http' : 'stdio';
  const port = Number(process.env.PORT || 3000);
  const newsApiKey = process.env.NEWS_API_KEY || '';

  const pgUri = process.env.PG_URI;
  const redisUrl = process.env.REDIS_URL;

  const pinecone = {
    enabled:
      process.env.PINECONE_ENABLED === '1' ||
      process.env.PINECONE_ENABLED?.toLowerCase() === 'true' ||
      false,
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
    index: process.env.PINECONE_INDEX,
  };

  const rateLimits = {
    dailyRequestsCap: parseNumber(process.env.RATE_LIMIT_DAILY_REQUESTS),
    perSecondCap: parseNumber(process.env.RATE_LIMIT_PER_SECOND),
  };

  const backfill = {
    pageCapPerDay: Number(process.env.BACKFILL_PAGE_CAP_PER_DAY || 2),
    mode: (process.env.BACKFILL_MODE === 'sampled' ? 'sampled' : 'full') as 'full' | 'sampled',
  };

  return {
    transport,
    port,
    newsApiKey,
    pgUri,
    redisUrl,
    pinecone,
    rateLimits,
    backfill,
  };
}

/**
 * Optional guard to assert required vars for specific runtime modes.
 * Currently we only require NEWS_API_KEY; future phases may assert PG/REDIS when those features are enabled.
 */
export function assertRequiredConfig(cfg: AppConfig) {
  if (!cfg.newsApiKey) {
    throw new Error('NEWS_API_KEY environment variable is required');
  }
}
