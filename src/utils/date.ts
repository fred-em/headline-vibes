import * as chrono from 'chrono-node';

/**
 * Normalize a Date or date-like string to YYYY-MM-DD in UTC.
 */
export function normalizeDate(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  // Convert to YYYY-MM-DD in UTC
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a natural language input into YYYY-MM-DD (UTC) using chrono-node.
 * Examples: "yesterday", "last Friday", "2025-02-11"
 */
export function parseDateNL(input: string, now: Date = new Date()): string {
  // First, if it's already YYYY-MM-DD, return as-is
  if (/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(input)) {
    return input;
  }
  const parsed = chrono.parseDate(input, now, { forwardDate: false });
  if (!parsed) {
    throw new Error(
      'Could not understand the date input. Try "yesterday", "last Friday", or a specific date like 2025-02-11.'
    );
  }
  return normalizeDate(parsed);
}

/**
 * Generate a list of month ranges between startMonth and endMonth inclusive.
 * Inputs are YYYY-MM strings. Output ranges are in YYYY-MM-DD (UTC) strings.
 */
export function monthRange(startMonth: string, endMonth: string): { start: string; end: string }[] {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(startMonth)) {
    throw new Error(`Invalid startMonth format: ${startMonth}`);
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(endMonth)) {
    throw new Error(`Invalid endMonth format: ${endMonth}`);
  }

  const start = new Date(`${startMonth}-01T00:00:00.000Z`);
  const end = new Date(`${endMonth}-01T00:00:00.000Z`);
  const ranges: { start: string; end: string }[] = [];

  if (start.getTime() > end.getTime()) {
    return ranges;
  }

  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth(); // 0-based
    // last day of month: day 0 of next month in UTC
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const monthStr = String(m + 1).padStart(2, '0');

    ranges.push({
      start: `${y}-${monthStr}-01`,
      end: `${y}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
    });

    // advance one month
    cur.setUTCMonth(cur.getUTCMonth() + 1);
    // normalize to first of month to avoid date overflow
    cur.setUTCDate(1);
  }

  return ranges;
}
