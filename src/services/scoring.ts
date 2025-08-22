import Sentiment from 'sentiment';
import type { PoliticalLeaning, ScoreDimensions } from '../types.js';
import { clamp, normalizeRange, normalizeHeadline, round2 } from '../utils/normalize.js';

const sentimentAnalyzer = new Sentiment();

/**
 * Score how "attention-grabbing" headlines are on average.
 * Heuristics: presence of !, ?, ALL-CAPS words, strong adjectives and clickbait phrases.
 * Output: 0..10
 */
export function scoreAttention(headlines: string[]): number {
  if (!headlines.length) return 0;

  const CLICKBAIT = [
    'shocking',
    'you won\'t believe',
    'must see',
    'breaking',
    'surprising',
    'revealed',
    'secret',
    'what happened next',
    'unbelievable',
    'jaw-dropping',
  ];

  const scores = headlines.map((h) => {
    const text = normalizeHeadline(h);
    let s = 0;

    // punctuation signals
    const exclam = (text.match(/!/g) || []).length;
    const quest = (text.match(/\?/g) || []).length;
    s += Math.min(2, exclam) * 0.8;
    s += Math.min(2, quest) * 0.5;

    // ALL CAPS tokens (acronyms excluded if 2-4 letters)
    const tokens = h.split(/\s+/);
    const capsTokens = tokens.filter(
      (t) => /[A-Z]{5,}/.test(t.replace(/[^A-Za-z]/g, ''))
    ).length;
    s += Math.min(3, capsTokens) * 0.7;

    // clickbait phrases
    for (const phrase of CLICKBAIT) {
      if (text.includes(phrase)) s += 1.2;
    }

    // clamp per-headline to a bounded raw range roughly 0..10 pre-normalization
    return clamp(s, 0, 10);
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return round2(clamp(avg, 0, 10));
}

/**
 * Investor lexicon for weighted term scoring.
 * Positive terms increase score, negative terms decrease.
 */
const INVESTOR_LEXICON: Record<string, number> = {
  // Strong positive (+2)
  'bull market': 2,
  'bullish': 2,
  'record high': 2,
  'outperform': 2,
  'breakthrough': 2,
  'innovation': 2,
  'growth': 2,
  'expansion': 2,
  'rally': 2,
  'surge': 2,
  'record profit': 2,
  'beat expectations': 2,
  'strong demand': 2,
  'market leader': 2,
  'competitive advantage': 2,

  // Moderate positive (+1)
  'investment': 1,
  'dividend': 1,
  'profit': 1,
  'earnings': 1,
  'partnership': 1,
  'acquisition': 1,
  'opportunity': 1,
  'recovery': 1,
  'stability': 1,
  'stable': 1,
  'guidance': 1,
  'momentum': 1,

  // Strong negative (-2)
  'bear market': -2,
  'bearish': -2,
  'crash': -2,
  'recession': -2,
  'bankruptcy': -2,
  'default': -2,
  'crisis': -2,
  'collapse': -2,
  'investigation': -2,
  'fraud': -2,
  'lawsuit': -2,
  'downgrade': -2,
  'miss expectations': -2,
  'weak demand': -2,
  'market correction': -2,

  // Moderate negative (-1)
  'volatility': -1,
  'volatile': -1,
  'uncertainty': -1,
  'uncertain': -1,
  'risk': -1,
  'concern': -1,
  'warning': -1,
  'caution': -1,
  'slowdown': -1,
  'decline': -1,
  'loss': -1,
  'debt': -1,
  'regulatory': -1,
  'inflation': -1,
};

/**
 * Compute investor sentiment using the weighted lexicon.
 * Returns normalized score 0..10 plus key term frequencies.
 */
export function scoreInvestor(headlines: string[]): { score: number; keyTerms: Record<string, number> } {
  if (!headlines.length) return { score: 5, keyTerms: {} };

  let raw = 0;
  const termFreq: Record<string, number> = {};
  for (const h of headlines) {
    const t = normalizeHeadline(h);
    for (const [term, w] of Object.entries(INVESTOR_LEXICON)) {
      if (t.includes(term)) {
        raw += w;
        termFreq[term] = (termFreq[term] || 0) + 1;
      }
    }
  }
  // average by headlines
  raw = raw / headlines.length;

  // map raw range (heuristic) to 0..10; assume lexicon range approx -4..4
  const norm = normalizeRange(raw, { min: -4, max: 4 }, { min: 0, max: 10 });
  return { score: round2(norm), keyTerms: termFreq };
}

/**
 * General sentiment using "sentiment" comparative scores.
 * Average comparative per headline then normalize from -1..1 to 0..10.
 */
export function scoreGeneral(headlines: string[]): number {
  if (!headlines.length) return 5;
  const comps = headlines.map((h) => sentimentAnalyzer.analyze(h).comparative || 0);
  const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
  const norm = normalizeRange(avg, { min: -1, max: 1 }, { min: 0, max: 10 });
  return round2(norm);
}

/**
 * Bias intensity measures divergence between left/right vs center baseline.
 * Input: map of leaning -> normalized score 0..10 (for some dimension).
 * Output: 0..10 where higher means bigger divergence.
 */
export function scoreBiasIntensity(byLeaning: Record<PoliticalLeaning, number>): number {
  const center = clamp(byLeaning.center ?? 5, 0, 10);
  const left = clamp(byLeaning.left ?? center, 0, 10);
  const right = clamp(byLeaning.right ?? center, 0, 10);

  const devLeft = Math.abs(left - center);
  const devRight = Math.abs(right - center);

  // combine deviations; max possible if both are 10 away from center (not possible simultaneously),
  // so we normalize by a reasonable max of 10 to keep 0..10
  const raw = devLeft + devRight; // 0..20 theoretic
  const norm = normalizeRange(raw, { min: 0, max: 20 }, { min: 0, max: 10 });
  return round2(norm);
}

/**
 * Novelty compares today's key-term distribution vs baseline distribution.
 * Uses a simple normalized L1 distance between frequency distributions.
 * Inputs are term frequency maps.
 * Output: 0..10
 */
export function scoreNovelty(
  todayTerms: Record<string, number>,
  baselineTerms: Record<string, number>
): number {
  const keys = new Set([...Object.keys(todayTerms), ...Object.keys(baselineTerms)]);
  const sumToday = Object.values(todayTerms).reduce((a, b) => a + b, 0) || 1;
  const sumBase = Object.values(baselineTerms).reduce((a, b) => a + b, 0) || 1;

  let l1 = 0;
  for (const k of keys) {
    const p = (todayTerms[k] || 0) / sumToday;
    const q = (baselineTerms[k] || 0) / sumBase;
    l1 += Math.abs(p - q);
  }
  // L1 distance range is 0..2. Map to 0..10.
  const norm = normalizeRange(l1, { min: 0, max: 2 }, { min: 0, max: 10 });
  return round2(norm);
}

/**
 * Volatility shock: compare today's variance vs baseline variance.
 * Compute z-like score of today's variance relative to baseline mean/variance of variances.
 * Inputs: arrays of per-headline numeric signal (e.g., sentiment comps).
 */
export function scoreVolShock(today: number[], baseline: number[]): number {
  if (!today.length || !baseline.length) return 5;

  const variance = (arr: number[]) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
    return v;
    // population variance; small sample correction not needed here
  };

  const vToday = variance(today);
  // Compute baseline distribution of per-day variances if baseline provided as all headline values;
  // as a proxy, use baseline array as samples and approximate baseline variance-of-variance by chunking.
  // If only a single baseline array is given, fallback to using its variance as mean and a fixed std.
  const vBase = variance(baseline);
  const stdProxy = Math.max(1e-6, Math.sqrt(Math.abs(vBase))); // proxy std to avoid div-by-zero

  const z = (vToday - vBase) / stdProxy; // z-like
  // Map a reasonable z-range [-3..3] to 0..10
  const norm = normalizeRange(z, { min: -3, max: 3 }, { min: 0, max: 10 });
  return round2(norm);
}

/**
 * Convenience helper to assemble ScoreDimensions when upstream provides:
 * - relevant headlines (strings)
 * - by-leaning normalized score (for bias intensity)
 * - term frequencies and baselines for novelty
 * - per-headline signal array and baseline for volShock
 */
export function assembleScoreDimensions(params: {
  headlines: string[];
  byLeaningForBias: Record<PoliticalLeaning, number>;
  keyTerms: Record<string, number>;
  baselineKeyTerms: Record<string, number>;
  todaySignalSeries: number[]; // e.g. per-headline general sentiment comps
  baselineSignalSeries: number[];
}): ScoreDimensions {
  const attention = scoreAttention(params.headlines);
  const { score: investorSentiment } = scoreInvestor(params.headlines);
  const generalSentiment = scoreGeneral(params.headlines);
  const biasIntensity = scoreBiasIntensity(params.byLeaningForBias);
  const novelty = scoreNovelty(params.keyTerms, params.baselineKeyTerms);
  const volShock = scoreVolShock(params.todaySignalSeries, params.baselineSignalSeries);

  return {
    attention,
    investorSentiment,
    generalSentiment,
    biasIntensity,
    novelty,
    volShock,
  };
}
