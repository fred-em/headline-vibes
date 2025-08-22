/**
 * Generic normalization and string helpers.
 * These utilities are used across scoring, categorization, and data shaping.
 */

/**
 * Clamp a numeric value to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize a raw value from an input range to an output range (default 0..10).
 * Example: normalizeRange(0.25, { min: -1, max: 1 }) => 6.25
 */
export function normalizeRange(
  value: number,
  input: { min: number; max: number },
  output: { min: number; max: number } = { min: 0, max: 10 }
): number {
  const spanIn = input.max - input.min;
  if (spanIn === 0) return output.min;
  const spanOut = output.max - output.min;
  const norm = ((value - input.min) / spanIn) * spanOut + output.min;
  return clamp(norm, output.min, output.max);
}

/**
 * Round a number to 2 decimal places. Returns a number (not string).
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convert arbitrary text into a kebab-case identifier.
 * Used as a fallback when NewsAPI's source.id is missing.
 */
export function toKebabId(input?: string | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/['’]/g, '') // drop apostrophes
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric to dashes
    .replace(/^-+|-+$/g, '') // trim dashes
    .replace(/--+/g, '-'); // collapse duplicates
}

/**
 * Normalize a headline for lexicon matching: lowercase + trim.
 */
export function normalizeHeadline(text: string): string {
  return (text || '').toLowerCase().trim();
}
