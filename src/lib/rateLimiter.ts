// Rate Limiter Module - Prevents API abuse and manages quotas
'use strict';

import { logger } from './logger';

// Type definitions for rate limiting
export type RateLimitType = 'api' | 'translation' | 'context';

export interface RateLimitConfig {
  perSecond?: number;
  perMinute?: number;
  perHour?: number;
  perDay?: number;
}

export interface RateLimitConfigs {
  api: RateLimitConfig;
  translation: RateLimitConfig;
  context: RateLimitConfig;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  resetIn?: number;
  limit?: number;
  remaining?: number;
  period?: string;
}

export interface UsageStats {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface PeriodUsageStats {
  second?: UsageStats;
  minute?: UsageStats;
  hour?: UsageStats;
  day?: UsageStats;
}

interface Cutoffs {
  second: number;
  minute: number;
  hour: number;
  day: number;
}

interface Counts {
  second: number;
  minute: number;
  hour: number;
  day: number;
}

type PeriodMs = {
  perSecond: number;
  perMinute: number;
  perHour: number;
  perDay: number;
};

export interface RateLimitError extends Error {
  rateLimitExceeded: boolean;
  resetIn: number;
  period: string;
}

export type RateLimitState = Record<string, number[]>;

export class RateLimiter {
  private readonly limits: RateLimitConfigs;
  private readonly requests: Map<string, number[]>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    // Rate limit configurations
    this.limits = {
      // API calls
      api: {
        perSecond: 2,
        perMinute: 20,
        perHour: 200,
        perDay: 1000
      },
      // Translation requests
      translation: {
        perSecond: 5,
        perMinute: 50,
        perHour: 500,
        perDay: 2000
      },
      // Context explanations (same as translations since they're now fetched together)
      context: {
        perMinute: 50,
        perHour: 500,
        perDay: 2000
      }
    };
    
    // Request tracking
    this.requests = new Map<string, number[]>();
    
    // Cleanup old entries periodically
    this.startCleanupTimer();
  }

  // Check if request is allowed
  async checkLimit(type: RateLimitType, identifier: string = 'global'): Promise<RateLimitCheckResult> {
    const limits = this.limits[type];
    if (!limits) {
      logger.warn(`Unknown rate limit type: ${type}`);
      return { allowed: true };
    }
    
    const key = `${type}:${identifier}`;
    const now = Date.now();
    
    // Get or create request history
    let history = this.requests.get(key);
    if (!history) {
      history = [];
      this.requests.set(key, history);
    }
    
    // Clean old entries
    const cutoffs: Cutoffs = {
      second: now - 1000,
      minute: now - 60000,
      hour: now - 3600000,
      day: now - 86400000
    };
    
    history = history.filter((timestamp: number) => timestamp > cutoffs.day);
    this.requests.set(key, history);
    
    // Check limits
    const counts: Counts = {
      second: history.filter(t => t > cutoffs.second).length,
      minute: history.filter(t => t > cutoffs.minute).length,
      hour: history.filter(t => t > cutoffs.hour).length,
      day: history.length
    };
    
    // Check each limit
    for (const [period, limit] of Object.entries(limits) as [keyof RateLimitConfig, number][]) {
      const periodKey = period.replace('per', '').toLowerCase() as keyof Counts;
      if (counts[periodKey] >= limit) {
        const resetTime = this.getResetTime(period, history, cutoffs[periodKey]);
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${limit} per ${periodKey}`,
          resetIn: resetTime - now,
          limit: limit,
          remaining: 0,
          period: periodKey
        };
      }
    }
    
    // Request is allowed, record it
    history.push(now);
    
    // Calculate remaining quota for most restrictive limit
    let minRemaining = Infinity;
    let limitingPeriod: string | null = null;
    
    for (const [period, limit] of Object.entries(limits) as [keyof RateLimitConfig, number][]) {
      const periodKey = period.replace('per', '').toLowerCase() as keyof Counts;
      const remaining = limit - counts[periodKey] - 1;
      if (remaining < minRemaining) {
        minRemaining = remaining;
        limitingPeriod = periodKey;
      }
    }
    
    return {
      allowed: true,
      remaining: minRemaining,
      period: limitingPeriod || undefined
    };
  }

  // Get reset time for a period
  private getResetTime(period: keyof RateLimitConfig, history: number[], cutoff: number): number {
    const relevantRequests = history.filter(t => t > cutoff);
    if (relevantRequests.length === 0) return Date.now();
    
    const oldestRequest = Math.min(...relevantRequests);
    const periodMs: PeriodMs = {
      perSecond: 1000,
      perMinute: 60000,
      perHour: 3600000,
      perDay: 86400000
    };
    
    return oldestRequest + periodMs[period];
  }

  // Get current usage stats
  getUsageStats(type: RateLimitType, identifier: string = 'global'): PeriodUsageStats | null {
    const limits = this.limits[type];
    if (!limits) return null;
    
    const key = `${type}:${identifier}`;
    const history = this.requests.get(key) || [];
    const now = Date.now();
    
    const cutoffs: Cutoffs = {
      second: now - 1000,
      minute: now - 60000,
      hour: now - 3600000,
      day: now - 86400000
    };
    
    const stats: PeriodUsageStats = {};
    for (const [period, limit] of Object.entries(limits) as [keyof RateLimitConfig, number][]) {
      const periodKey = period.replace('per', '').toLowerCase() as keyof Cutoffs;
      const count = history.filter(t => t > cutoffs[periodKey]).length;
      stats[periodKey] = {
        used: count,
        limit: limit,
        remaining: limit - count,
        percentage: (count / limit) * 100
      };
    }
    
    return stats;
  }

  // Reset limits for a specific type
  reset(type: RateLimitType, identifier: string = 'global'): void {
    const key = `${type}:${identifier}`;
    this.requests.delete(key);
  }

  // Start cleanup timer
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const dayAgo = now - 86400000;
      
      for (const [key, history] of this.requests.entries()) {
        const cleaned = history.filter(t => t > dayAgo);
        if (cleaned.length === 0) {
          this.requests.delete(key);
        } else if (cleaned.length < history.length) {
          this.requests.set(key, cleaned);
        }
      }
    }, 300000); // Clean every 5 minutes
  }

  // Stop cleanup timer (for testing or shutdown)
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // Circuit breaker pattern for API protection
  async withRateLimit<T>(
    type: RateLimitType, 
    identifier: string, 
    fn: () => Promise<T>
  ): Promise<T> {
    const check = await this.checkLimit(type, identifier);
    
    if (!check.allowed) {
      const error = new Error(check.reason) as RateLimitError;
      error.rateLimitExceeded = true;
      error.resetIn = check.resetIn!;
      error.period = check.period!;
      throw error;
    }
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      // If the operation failed, don't count it against the limit
      const key = `${type}:${identifier}`;
      const history = this.requests.get(key);
      if (history && history.length > 0) {
        history.pop();
      }
      throw error;
    }
  }

  // Export/import state for persistence
  exportState(): RateLimitState {
    const state: RateLimitState = {};
    for (const [key, history] of this.requests.entries()) {
      state[key] = history;
    }
    return state;
  }

  importState(state: RateLimitState): void {
    this.requests.clear();
    for (const [key, history] of Object.entries(state)) {
      this.requests.set(key, history);
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();