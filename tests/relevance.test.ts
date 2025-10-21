import { describe, expect, it } from 'vitest';
import { evaluateHeadlineRelevance } from '../src/services/relevance.js';

describe('evaluateHeadlineRelevance', () => {
  it('flags exclusion terms', () => {
    const result = evaluateHeadlineRelevance('Celebrity chef shares viral recipe');
    expect(result.relevant).toBe(false);
    expect(result.excludedTerm).toBe('recipe');
  });

  it('scores inclusion terms', () => {
    const result = evaluateHeadlineRelevance('Fed signals interest rate cuts to support markets');
    expect(result.relevant).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.matchedTerms).toContain('interest rate');
  });
});
