import { getConfig } from '../config.js';

/**
 * Token budgeting for Event Registry (newsapi.ai)
 * Implements preflight estimates and threshold enforcement per .clinerules/eventregistry-tokens-budget.md
 */

type BudgetStatus = 'allowed' | 'throttled' | 'blocked';

export interface TokenCheckResult {
  allowed: boolean;
  status: BudgetStatus;
  mtdTokens: number;
  monthlyTokens: number;
  softCapPct: number;
  hardCapPct: number;
}

export interface ArticleSearchParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  pagesPlanned: number; // intended requests (each page = one search request)
}

/**
 * Month-to-date accounting (in-memory). Consider persisting later (e.g., Redis).
 */
class TokenBudget {
  private monthlyTokens: number;
  private softCapPct: number;
  private hardCapPct: number;
  private allowOverage: boolean;

  private monthKey?: string;
  private mtdTokens = 0; // tokens used this month (observed)

  constructor() {
    const cfg = getConfig();
    // Defaults per .clinerules
    this.monthlyTokens = cfg.tokenBudget?.monthlyTokens ?? 50000;
    this.softCapPct = cfg.tokenBudget?.softCapPct ?? 80;
    this.hardCapPct = cfg.tokenBudget?.hardCapPct ?? 95;
    this.allowOverage = cfg.tokenBudget?.allowOverage ?? false;
  }

  private getMonthKey(date = new Date()): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private ensureMonth(date = new Date()) {
    const key = this.getMonthKey(date);
    if (this.monthKey !== key) {
      this.monthKey = key;
      this.mtdTokens = 0;
    }
  }

  getState() {
    this.ensureMonth();
    return {
      monthKey: this.monthKey!,
      mtdTokens: this.mtdTokens,
      monthlyTokens: this.monthlyTokens,
      softCapPct: this.softCapPct,
      hardCapPct: this.hardCapPct,
      allowOverage: this.allowOverage,
    };
  }

  /**
   * Estimate tokens for an article search workload.
   * Per .clinerules:
   * - Recent article query (last 30 days): 1 token per search (per page request)
   * - Historical article query across Y years: 5 × Y tokens per search (per page request)
   */
  estimateArticleSearch(params: ArticleSearchParams): number {
    const { startDate, endDate, pagesPlanned } = params;
    if (pagesPlanned <= 0) return 0;

    const now = new Date();
    const end = new Date(endDate + 'T00:00:00Z');
    const start = new Date(startDate + 'T00:00:00Z');

    // Determine recent vs historical (30-day window)
    const msInDay = 24 * 60 * 60 * 1000;
    const daysFromNow = Math.floor((now.getTime() - end.getTime()) / msInDay);
    const isRecent = daysFromNow <= 30 && (now.getTime() - start.getTime()) / msInDay <= 30;

    let perSearchTokens = 1;
    if (!isRecent) {
      const years = this.countDistinctYears(start, end);
      perSearchTokens = 5 * years;
    }

    return perSearchTokens * pagesPlanned;
  }

  private countDistinctYears(start: Date, end: Date): number {
    const yStart = start.getUTCFullYear();
    const yEnd = end.getUTCFullYear();
    return Math.max(1, yEnd - yStart + 1);
  }

  /**
   * Check threshold gates and tentatively reserve the estimated tokens.
   * If blocked, no reservation occurs.
   * If throttled, reservation still occurs to reflect planned usage.
   */
  checkAndRecord(estimate: number, opts?: { allowOverage?: boolean }): TokenCheckResult {
    this.ensureMonth();

    const monthlyTokens = this.monthlyTokens;
    const softCap = (this.softCapPct / 100) * monthlyTokens;
    const hardCap = (this.hardCapPct / 100) * monthlyTokens;

    const projected = this.mtdTokens + estimate;

    let status: BudgetStatus = 'allowed';
    let allowed = true;

    if (projected > hardCap) {
      // Hard cap: block unless explicitly allowing overage and staying within monthlyTokens OR allowing true overage
      const permitOverage = opts?.allowOverage ?? this.allowOverage;
      if (!permitOverage && projected > monthlyTokens) {
        status = 'blocked';
        allowed = false;
      } else {
        // Allowed, but mark throttled if over hard cap
        status = 'throttled';
      }
    } else if (projected > softCap) {
      status = 'throttled';
    }

    if (allowed) {
      // Tentatively reserve; caller should call recordActual afterwards to reconcile
      this.mtdTokens += estimate;
    }

    return {
      allowed,
      status,
      mtdTokens: this.mtdTokens,
      monthlyTokens,
      softCapPct: this.softCapPct,
      hardCapPct: this.hardCapPct,
    };
  }

  /**
   * Record actual tokens consumed post-operation. This reconciles accounting drift over time.
   * If actual differs from estimate, we adjust the delta.
   */
  recordActual(actual: number, previouslyEstimated: number): void {
    this.ensureMonth();
    const delta = actual - previouslyEstimated;
    this.mtdTokens = Math.max(0, this.mtdTokens + delta);
  }
}

const shared = new TokenBudget();

/**
 * Convenience API
 */
export function estimateTokensForArticleSearch(params: ArticleSearchParams): number {
  return shared.estimateArticleSearch(params);
}

export function checkAndRecord(estimate: number, opts?: { allowOverage?: boolean }): TokenCheckResult {
  return shared.checkAndRecord(estimate, opts);
}

export function recordActual(actual: number, previouslyEstimated: number): void {
  shared.recordActual(actual, previouslyEstimated);
}

export function getBudgetState() {
  return shared.getState();
}
