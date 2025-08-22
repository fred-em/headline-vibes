import type { PoliticalLeaning } from '../types.js';
import { PREFERRED_SOURCE_SET, leaningForSourceId } from '../constants/sources.js';
import { toKebabId } from '../utils/normalize.js';

/**
 * Normalize a NewsAPI source name into a kebab-case id, used as a fallback
 * when the canonical source.id is missing.
 */
export function normalizeSourceId(name?: string): string {
  return toKebabId(name);
}

/**
 * Resolve a political leaning from an optional canonical source id or source name.
 * - Prefer the canonical NewsAPI source.id when present
 * - Fallback to normalized name (kebab-case)
 * - Default to 'center' if unknown
 */
export function sourceToLeaning(id?: string | null, name?: string): PoliticalLeaning {
  const resolvedId = id ?? normalizeSourceId(name);
  return leaningForSourceId(resolvedId);
}

/**
 * Quick helpers for membership and safe id calculation
 */

/** Returns a canonical-ish id (prefer id, else kebab name). */
export function resolveSourceId(id?: string | null, name?: string): string {
  return (id ?? normalizeSourceId(name)) || '';
}

/** Check if a source (by id/name) is in our preferred set. */
export function isPreferredSource(id?: string | null, name?: string): boolean {
  const resolved = resolveSourceId(id, name);
  return resolved ? PREFERRED_SOURCE_SET.has(resolved) : false;
}
