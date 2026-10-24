/**
 * Daily Budget Manager & Graceful Degradation Engine
 * Implements PRD §4 (FR-A1, FR-A3), SEC-6, and TC-16:
 * - Tracks daily request count and token consumption
 * - Automatically transitions through degradation levels:
 *   1. 'normal': Full capacity, normal token limit (300 tokens)
 *   2. 'degraded': Threshold reached (>= 80%), downscales to short text replies (70 tokens)
 *   3. 'exhausted': Ceiling reached (100%), halts new LLM requests gracefully
 * - Resets counts daily (UTC)
 */

export type BudgetLevel = 'normal' | 'degraded' | 'exhausted';

export interface BudgetConfig {
  dailyRequestBudget: number;
  dailyTokenBudget: number;
  degradeThresholdRatio?: number; // Default 0.8 (80%)
  normalMaxTokens?: number;      // Default 300
  degradedMaxTokens?: number;    // Default 70
}

export interface BudgetStats {
  date: string;
  level: BudgetLevel;
  dailyRequests: number;
  maxRequests: number;
  requestPercentage: number;
  dailyTokens: number;
  maxTokens: number;
  tokenPercentage: number;
  allowedMaxTokens: number;
}

export class BudgetManager {
  private dailyRequestBudget: number;
  private dailyTokenBudget: number;
  private degradeThresholdRatio: number;
  private normalMaxTokens: number;
  private degradedMaxTokens: number;

  private currentDate: string;
  private dailyRequests = 0;
  private dailyTokens = 0;

  constructor(config: BudgetConfig) {
    this.dailyRequestBudget = config.dailyRequestBudget;
    this.dailyTokenBudget = config.dailyTokenBudget;
    this.degradeThresholdRatio = config.degradeThresholdRatio ?? 0.8;
    this.normalMaxTokens = config.normalMaxTokens ?? 300;
    this.degradedMaxTokens = config.degradedMaxTokens ?? 70;
    this.currentDate = this.getTodayDateString();
  }

  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private checkAndResetDate(): void {
    const today = this.getTodayDateString();
    if (today !== this.currentDate) {
      this.currentDate = today;
      this.dailyRequests = 0;
      this.dailyTokens = 0;
    }
  }

  /**
   * Determine current budget degradation level (FR-A3, TC-16).
   */
  public getLevel(): BudgetLevel {
    this.checkAndResetDate();

    if (
      this.dailyRequests >= this.dailyRequestBudget ||
      this.dailyTokens >= this.dailyTokenBudget
    ) {
      return 'exhausted';
    }

    const requestRatio = this.dailyRequests / this.dailyRequestBudget;
    const tokenRatio = this.dailyTokens / this.dailyTokenBudget;

    if (
      requestRatio >= this.degradeThresholdRatio ||
      tokenRatio >= this.degradeThresholdRatio
    ) {
      return 'degraded';
    }

    return 'normal';
  }

  /**
   * Check if a new request can proceed.
   */
  public canProceed(): { allowed: boolean; level: BudgetLevel; reason?: string } {
    const level = this.getLevel();
    if (level === 'exhausted') {
      return {
        allowed: false,
        level,
        reason:
          'Batas kuota harian bot telah tercapai (FR-A3). Bot beristirahat dan aktif kembali esok hari.',
      };
    }

    return { allowed: true, level };
  }

  /**
   * Get maximum allowed output tokens according to current degradation level.
   */
  public getAllowedMaxOutputTokens(preferredMax = this.normalMaxTokens): number {
    const level = this.getLevel();
    if (level === 'degraded') {
      return Math.min(preferredMax, this.degradedMaxTokens);
    }
    return preferredMax;
  }

  /**
   * Record a completed request and its consumed tokens.
   */
  public recordUsage(consumedTokens: number, requests = 1): void {
    this.checkAndResetDate();
    this.dailyRequests += requests;
    this.dailyTokens += Math.max(0, consumedTokens);
  }

  /**
   * Estimate token count from raw text (approx 1 token ~= 3.5 chars).
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Get formatted statistics for /status command (FR-A1).
   */
  public getStats(): BudgetStats {
    this.checkAndResetDate();
    const level = this.getLevel();
    const reqPct = Math.min(
      100,
      Math.round((this.dailyRequests / this.dailyRequestBudget) * 100)
    );
    const tokPct = Math.min(
      100,
      Math.round((this.dailyTokens / this.dailyTokenBudget) * 100)
    );

    return {
      date: this.currentDate,
      level,
      dailyRequests: this.dailyRequests,
      maxRequests: this.dailyRequestBudget,
      requestPercentage: reqPct,
      dailyTokens: this.dailyTokens,
      maxTokens: this.dailyTokenBudget,
      tokenPercentage: tokPct,
      allowedMaxTokens: this.getAllowedMaxOutputTokens(),
    };
  }

  /**
   * Manually reset daily counters (for tests and admin reset).
   */
  public resetCounters(): void {
    this.currentDate = this.getTodayDateString();
    this.dailyRequests = 0;
    this.dailyTokens = 0;
  }
}
