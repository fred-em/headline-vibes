import { describe, expect, it } from 'vitest';
import {
  estimateTokensForArticleSearch,
  checkAndRecord,
  recordActual,
} from '../src/services/tokenBudget.js';

describe('token budget estimation', () => {
  it('charges one token per recent page', () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const estimate = estimateTokensForArticleSearch({
      startDate: todayIso,
      endDate: todayIso,
      pagesPlanned: 3,
    });
    expect(estimate).toBe(3);
  });

  it('blocks when exceeding monthly hard cap without overage', () => {
    const status = checkAndRecord(100_000, { allowOverage: false });
    expect(status.allowed).toBe(false);
    expect(status.status).toBe('blocked');
    recordActual(0, 100_000);
  });
});
