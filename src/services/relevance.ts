import { INVESTOR_RELEVANCE } from '../constants/relevance.js';
import { normalizeHeadline } from '../utils/normalize.js';

export interface RelevanceAssessment {
  relevant: boolean;
  score: number;
  matchedTerms: string[];
  excludedTerm?: string;
}

/**
 * Evaluate a headline for investor relevance by checking exclusion first,
 * then summing inclusion weights. Returns details useful for diagnostics.
 */
export function evaluateHeadlineRelevance(headline: string): RelevanceAssessment {
  const normalized = normalizeHeadline(headline);

  for (const exclusion of INVESTOR_RELEVANCE.exclusion) {
    if (normalized.includes(exclusion)) {
      return {
        relevant: false,
        score: 0,
        matchedTerms: [],
        excludedTerm: exclusion,
      };
    }
  }

  let score = 0;
  const matchedTerms: string[] = [];

  for (const [term, weight] of Object.entries(INVESTOR_RELEVANCE.inclusion)) {
    if (normalized.includes(term)) {
      score += weight;
      matchedTerms.push(term);
    }
  }

  return {
    relevant: score > 0,
    score,
    matchedTerms,
  };
}
