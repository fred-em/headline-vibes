/**
 * Centralized configuration loader for Headline Vibes.
 * Reads environment variables, parses types, and exposes a typed config object.
 *
 * Environment variables expected (see .env.example to be added later):
 * - NEWS_API_KEY (required for Event Registry requests)
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

import { config } from 'dotenv';

// Load environment variables from .env file
config();

export type Transport = 'stdio' | 'http';

export interface AppConfig {
  transport: Transport;
  port: number;
  httpHost: string;
  newsApiKey: string;
  newsApiBaseUrl: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  logLevel: string;
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
  tokenBudget?: {
    monthlyTokens: number;
    softCapPct: number;
    hardCapPct: number;
    allowOverage: boolean;
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
  const httpHost = process.env.HOST?.trim() || '0.0.0.0';
  const newsApiKey = process.env.NEWS_API_KEY || '';
  const newsApiBaseUrl =
    process.env.NEWS_API_BASE_URL?.trim() || 'https://eventregistry.org/api/v1/';
  const allowedHosts = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const logLevel = process.env.LOG_LEVEL?.trim() || 'info';

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

  const tokenBudget = {
    monthlyTokens: Number(process.env.BUDGET_MONTHLY_TOKENS || 50000),
    softCapPct: Number(process.env.BUDGET_SOFT_CAP_PCT || 80),
    hardCapPct: Number(process.env.BUDGET_HARD_CAP_PCT || 95),
    allowOverage:
      process.env.ALLOW_OVERAGE === '1' ||
      process.env.ALLOW_OVERAGE?.toLowerCase() === 'true' ||
      false,
  };

  return {
    transport,
    port,
    httpHost,
    newsApiKey,
    newsApiBaseUrl,
    allowedHosts,
    allowedOrigins,
    logLevel,
    pgUri,
    redisUrl,
    pinecone,
    rateLimits,
    backfill,
    tokenBudget,
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
