import { getConfig } from '../config.js';

/**
 * Budget manager for NewsAPI usage.
 * Tracks request counts in-memory (per-process) and provides conservative feasibility estimates.
 * For distributed throttling and persistent counters, wire this with Redis in a later step.
 */

export interface Estimate {
  requests: number;
  feasible: boolean;
  reason?: string;
}

export interface BudgetOptions {
  // caps are hints; if omitted, we don't block but still count
  dailyRequestsCap?: number;
  perSecondCap?: number;
  // time providers for testing
  now?: () => number; // ms epoch
}

export class BudgetManager {
  private dailyRequestsCap?: number;
  private perSecondCap?: number;

  private now: () => number;

  // in-memory counters
  private dayKey?: string;
  private dayCount = 0;

  private windowStart = 0;
  private windowCount = 0;

  constructor(opts?: BudgetOptions) {
    const cfg = getConfig();
    this.dailyRequestsCap = opts?.dailyRequestsCap ?? cfg.rateLimits.dailyRequestsCap;
    this.perSecondCap = opts?.perSecondCap ?? cfg.rateLimits.perSecondCap;
    this.now = opts?.now ?? (() => Date.now());
  }

  /**
   * Estimate cost for backfill. For NewsAPI, each page is a separate request.
   */
  estimateBackfillCost(days: number, pagesPerDay: number): Estimate {
    if (days <= 0 || pagesPerDay <= 0) {
      return { requests: 0, feasible: true, reason: 'No work required' };
    }
    const requests = days * pagesPerDay;

    if (this.dailyRequestsCap != null && requests > this.dailyRequestsCap) {
      return {
        requests,
        feasible: false,
        reason: `Estimated requests (${requests}) exceed daily cap (${this.dailyRequestsCap})`,
      };
    }
    return { requests, feasible: true };
  }

  /**
   * Whether a new request should be throttled right now given per-second and daily caps.
   * Does not mutate counters (use recordRequest for that).
   */
  shouldThrottle(): boolean {
    const now = this.now();
    const secondWindow = 1000;

    // per-second window
    if (this.perSecondCap != null) {
      if (now - this.windowStart >= secondWindow) {
        // new window would reset; ok to proceed from window perspective
      } else if (this.windowCount >= this.perSecondCap) {
        return true;
      }
    }

    // daily cap
    if (this.dailyRequestsCap != null) {
      const todayKey = this.formatDayKey(now);
      const withinSameDay = this.dayKey === todayKey;
      const todayCount = withinSameDay ? this.dayCount : 0;
      if (todayCount >= this.dailyRequestsCap) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record N requests just made (default 1). Updates per-second and daily windows.
   */
  recordRequest(count = 1): void {
    const now = this.now();
    const secondWindow = 1000;

    // per-second window accounting
    if (now - this.windowStart >= secondWindow) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    this.windowCount += count;

    // daily window accounting
    const todayKey = this.formatDayKey(now);
    if (this.dayKey !== todayKey) {
      this.dayKey = todayKey;
      this.dayCount = 0;
    }
    this.dayCount += count;
  }

  /**
   * Accessors for telemetry/inspection
   */
  getState() {
    return {
      perSecond: {
        cap: this.perSecondCap,
        windowStart: this.windowStart,
        windowCount: this.windowCount,
      },
      daily: {
        cap: this.dailyRequestsCap,
        dayKey: this.dayKey,
        dayCount: this.dayCount,
      },
    };
  }

  private formatDayKey(ms: number): string {
    const d = new Date(ms);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// Convenience functional API mirroring the Implementation Plan signatures
const sharedManager = new BudgetManager();

export function estimateBackfillCost(days: number, pagesPerDay: number): Estimate {
  return sharedManager.estimateBackfillCost(days, pagesPerDay);
}

export function shouldThrottle(): boolean {
  return sharedManager.shouldThrottle();
}

export function recordRequest(count: number): void {
  sharedManager.recordRequest(count);
}
