import type { PoliticalLeaning } from '../types.js';

/**
 * Preferred US-based sources spanning political perspectives.
 * We prefer using NewsAPI's source.id slugs here.
 * Constraint: US-only intake. Do not include non-US outlets.
 */

export const PREFERRED_SOURCE_IDS = [
  // Center/Mainstream
  'associated-press',
  'bloomberg',
  'usa-today',
  'the-wall-street-journal',
  'marketwatch',

  // Center-Left
  'the-washington-post',
  'cnn',
  'nbc-news',
  'abc-news',
  'cbs-news',
  'time',
  'business-insider',
  'politico',

  // Center-Right
  'fox-news',
  'fox-business',
  'the-hill',
  'national-review',
  'washington-examiner',

  // Progressive
  'vice-news',
  'huffpost',
  'vox',
  'the-atlantic',
  'mother-jones',

  // Conservative
  'newsmax',
  'washington-times',
  'breitbart-news',
  'the-american-conservative',

  // Business/Economic Focus
  'fortune',
  'cnbc',
] as const;

export type PreferredSourceId = typeof PREFERRED_SOURCE_IDS[number];

export const PREFERRED_SOURCES_CSV = PREFERRED_SOURCE_IDS.join(',');

/**
 * Static mapping of source ids to political leaning.
 * These are heuristic groupings and can be refined over time.
 * Where a source is ambiguous, prefer 'center'.
 */
export const SOURCE_CATEGORIZATION: Record<PoliticalLeaning, readonly PreferredSourceId[]> = {
  left: [
    'the-washington-post',
    'cnn',
    'nbc-news',
    'abc-news',
    'cbs-news',
    'time',
    'business-insider',
    'politico',
    'vice-news',
    'huffpost',
    'vox',
    'the-atlantic',
    'mother-jones',
  ],
  center: [
    'associated-press',
    'bloomberg',
    'usa-today',
    'the-wall-street-journal',
    'marketwatch',
    'fortune',
    'cnbc',
  ],
  right: [
    'fox-news',
    'fox-business',
    'the-hill',
    'national-review',
    'washington-examiner',
    'newsmax',
    'washington-times',
    'breitbart-news',
    'the-american-conservative',
  ],
} as const;

/**
 * For quick membership checks and categorization lookups.
 */
export const PREFERRED_SOURCE_SET = new Set<string>(PREFERRED_SOURCE_IDS as readonly string[]);

/**
 * Resolve a political leaning given a normalized source id (kebab case).
 * Defaults to 'center' if the source is not explicitly listed.
 */
export function leaningForSourceId(id?: string | null): PoliticalLeaning {
  if (!id) return 'center';
  if ((SOURCE_CATEGORIZATION.left as readonly string[]).includes(id)) return 'left';
  if ((SOURCE_CATEGORIZATION.right as readonly string[]).includes(id)) return 'right';
  // default fallback
  return 'center';
}
