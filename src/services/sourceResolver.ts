import axios from 'axios';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';

type CacheEntry = {
  uri: string;
  title: string;
  updatedAt: string; // ISO timestamp
};

type CacheMap = Record<string, CacheEntry>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From build/services to project root at runtime; from src/services during TS execution still resolves equivalently after build
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const CACHE_PATH = path.join(DATA_DIR, 'source-uri-cache.json');

function normalizeKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-');
}

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

async function loadCache(): Promise<CacheMap> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? (data as CacheMap) : {};
  } catch (err: any) {
    // If file not found or invalid, start with empty cache
    return {};
  }
}

async function saveCache(cache: CacheMap): Promise<void> {
  await ensureDir(DATA_DIR);
  const serialized = JSON.stringify(cache, null, 2);
  await fs.writeFile(CACHE_PATH, serialized, 'utf-8');
}

type SuggestResult = {
  uri: string;
  title: string;
};

async function suggestSource(name: string, lang = 'eng'): Promise<SuggestResult | undefined> {
  const apiKey = getConfig().newsApiKey;
  if (!apiKey) throw new Error('NEWS_API_KEY is required for suggestSourcesFast');

  try {
    const { data } = await axios.get('https://eventregistry.org/api/v1/suggestSourcesFast', {
      params: {
        apiKey,
        text: name,
        lang,
      },
      timeout: 15000,
    });

    // Accept several possible shapes defensively
    const payload: any = data as any;
    const candidates: any[] =
      (Array.isArray(payload) ? payload : undefined) ??
      payload?.suggestedSources ??
      payload?.sources ??
      payload?.results ??
      [];

    if (!Array.isArray(candidates) || candidates.length === 0) return undefined;

    // Try to find the best match: exact title match (normalized) or fallback to the first
    const normName = normalizeKey(name);
    const exact = candidates.find((c) => normalizeKey(String(c.title ?? '')) === normName && typeof c.uri === 'string');
    const chosen = exact ?? candidates.find((c) => typeof c.uri === 'string' && typeof c.title === 'string') ?? candidates[0];

    if (chosen && typeof chosen.uri === 'string') {
      return { uri: chosen.uri, title: String(chosen.title ?? chosen.uri) };
    }
    return undefined;
  } catch (err: any) {
    // Swallow errors but log for diagnostics; resolver is best-effort
    console.error('[SourceResolver] suggestSourcesFast error:', err?.message ?? String(err));
    return undefined;
  }
}

/**
 * Resolve friendly source names (or slugs) to Event Registry sourceUri values.
 * - Uses local JSON cache at data/source-uri-cache.json
 * - Performs best-effort lookup via suggestSourcesFast when missing
 * - Returns unique URIs; preserves input order where possible
 */
export async function resolveSourceUris(names: string[], opts: { lang?: string } = {}): Promise<string[]> {
  if (!names || names.length === 0) return [];
  const lang = opts.lang ?? 'eng';

  const cache = await loadCache();
  const uris: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (!name || typeof name !== 'string') continue;

    // If it looks like a domain (contains a dot), assume it's already a URI
    if (name.includes('.')) {
      if (!seen.has(name)) {
        uris.push(name);
        seen.add(name);
      }
      continue;
    }

    const key = normalizeKey(name);
    const cached = cache[key];
    if (cached && cached.uri) {
      if (!seen.has(cached.uri)) {
        uris.push(cached.uri);
        seen.add(cached.uri);
      }
      continue;
    }

    // Not in cache; try to suggest
    const suggestion = await suggestSource(name, lang);
    if (suggestion) {
      cache[key] = {
        uri: suggestion.uri,
        title: suggestion.title,
        updatedAt: new Date().toISOString(),
      };
      if (!seen.has(suggestion.uri)) {
        uris.push(suggestion.uri);
        seen.add(suggestion.uri);
      }
    }
  }

  // Persist any new entries
  await saveCache(cache);
  return uris;
}

// Expose helpers for future unit tests
export const __internal = {
  normalizeKey,
  loadCache,
  saveCache,
  paths: { DATA_DIR, CACHE_PATH },
};
