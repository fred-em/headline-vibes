#!/usr/bin/env node
import { NewsApiClient } from '../services/newsapi.js';
import { normalizeDate } from '../utils/date.js';

async function main() {
  const arg = process.argv[2];
  let date: string;

  if (arg) {
    date = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : normalizeDate(new Date(arg));
  } else {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1); // yesterday UTC
    date = normalizeDate(d);
  }

  const client = new NewsApiClient();
  console.log('[SMOKE] Fetching headlines for date:', date);

  try {
    const { articles, pagesFetched } = await client.fetchTopHeadlinesByDate(date, {
      // Keep sources undefined to avoid suggestSourcesFast on smoke
      pageCap: 1
    });
    console.log('[SMOKE] Pages fetched:', pagesFetched);
    console.log('[SMOKE] Articles fetched:', articles.length);
    console.log('[SMOKE] Sample:', articles.slice(0, 3));
    process.exit(0);
  } catch (err: any) {
    const status = err?.response?.status;
    const statusText = err?.response?.statusText;
    console.error('[SMOKE] Error:', err?.message ?? String(err));
    if (status) {
      console.error('[SMOKE] HTTP status:', status, statusText ?? '');
    }
    if (err?.response?.data) {
      try {
        console.error('[SMOKE] Body snippet:', JSON.stringify(err.response.data).slice(0, 500));
      } catch {}
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('[SMOKE] Uncaught error:', e?.message ?? String(e));
  process.exit(1);
});
