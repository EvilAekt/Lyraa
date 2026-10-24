/**
 * Multi-Tier Rate Limiter & Anti-Spam Guard
 * Implements PRD SEC-6:
 * - Per-user rate limiting (sliding window, default 6 req/min)
 * - Per-guild rate limiting (sliding window, default 30 req/min)
 * - User cooldown enforcement
 * - Owner bypass
 */

export interface RateLimiterOptions {
  userLimitPerMin?: number;
  guildLimitPerMin?: number;
  cooldownMs?: number;
  ownerUserId?: string;
}

export interface RateCheckResult {
  allowed: boolean;
  reason?: 'cooldown' | 'user_rate_limited' | 'guild_rate_limited';
  retryAfterMs?: number;
}

export class SecurityRateLimiter {
  private userLimitPerMin: number;
  private guildLimitPerMin: number;
  private cooldownMs: number;
  private ownerUserId: string;

  private userTimestamps = new Map<string, number[]>();
  private guildTimestamps = new Map<string, number[]>();
  private lastUserAction = new Map<string, number>();

  constructor(options: RateLimiterOptions = {}) {
    this.userLimitPerMin = options.userLimitPerMin ?? 6;
    this.guildLimitPerMin = options.guildLimitPerMin ?? 30;
    this.cooldownMs = options.cooldownMs ?? 3000;
    this.ownerUserId = options.ownerUserId ?? '';
  }

  /**
   * Check if a user and guild are permitted to execute an action.
   */
  public checkLimit(userId: string, guildId?: string | null, now = Date.now()): RateCheckResult {
    // Owner bypass
    if (this.ownerUserId && userId === this.ownerUserId) {
      return { allowed: true };
    }

    // 1. User Cooldown check
    const lastAction = this.lastUserAction.get(userId) ?? 0;
    const elapsed = now - lastAction;
    if (elapsed < this.cooldownMs) {
      return {
        allowed: false,
        reason: 'cooldown',
        retryAfterMs: this.cooldownMs - elapsed,
      };
    }

    // 2. User sliding 60s window
    const windowStart = now - 60000;
    let uTimestamps = (this.userTimestamps.get(userId) ?? []).filter((t) => t > windowStart);
    if (uTimestamps.length >= this.userLimitPerMin) {
      const oldest = uTimestamps[0];
      return {
        allowed: false,
        reason: 'user_rate_limited',
        retryAfterMs: Math.max(0, 60000 - (now - oldest)),
      };
    }

    // 3. Guild sliding 60s window
    if (guildId) {
      let gTimestamps = (this.guildTimestamps.get(guildId) ?? []).filter((t) => t > windowStart);
      if (gTimestamps.length >= this.guildLimitPerMin) {
        const oldest = gTimestamps[0];
        return {
          allowed: false,
          reason: 'guild_rate_limited',
          retryAfterMs: Math.max(0, 60000 - (now - oldest)),
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Consume one action token for user and guild.
   */
  public recordAction(userId: string, guildId?: string | null, now = Date.now()): void {
    if (this.ownerUserId && userId === this.ownerUserId) {
      return;
    }

    const windowStart = now - 60000;

    // Record user action
    let uTimestamps = (this.userTimestamps.get(userId) ?? []).filter((t) => t > windowStart);
    uTimestamps.push(now);
    this.userTimestamps.set(userId, uTimestamps);
    this.lastUserAction.set(userId, now);

    // Record guild action
    if (guildId) {
      let gTimestamps = (this.guildTimestamps.get(guildId) ?? []).filter((t) => t > windowStart);
      gTimestamps.push(now);
      this.guildTimestamps.set(guildId, gTimestamps);
    }
  }

  /**
   * Reset all rate limit records (for tests).
   */
  public reset(): void {
    this.userTimestamps.clear();
    this.guildTimestamps.clear();
    this.lastUserAction.clear();
  }
}
