// Cost Guard Module - Prevents runaway API spending
'use strict';

import { logger } from './logger';

// Type definitions for cost tracking
interface CostLimit {
  cost: number;
  calls: number;
}

interface UsagePeriod {
  cost: number;
  calls: number;
  reset: number;
}

interface UsageTracking {
  minute: UsagePeriod;
  hour: UsagePeriod;
  day: UsagePeriod;
  month: UsagePeriod;
}

interface CostLimits {
  perMinute: CostLimit;
  perHour: CostLimit;
  perDay: CostLimit;
  perMonth: CostLimit;
}

interface ApiCosts {
  translation: number;
  context: number;
  pronunciation: number;
}

interface CostCheckResult {
  allowed: boolean;
  estimatedCost: number;
}

interface UsageStatDetail {
  used: number;
  limit: number;
  percentage: number;
}

interface PeriodStats {
  cost: UsageStatDetail;
  calls: UsageStatDetail;
}

interface UsageStats {
  stats: {
    perMinute: PeriodStats;
    perHour: PeriodStats;
    perDay: PeriodStats;
    perMonth: PeriodStats;
  };
  circuitBreakerOpen: boolean;
  totalDailyCost: number;
}

interface CostGuardState {
  usage: UsageTracking;
  circuitOpen: boolean;
  circuitOpenUntil: number;
  lastSaved: number;
}

type ApiType = 'translation' | 'context' | 'pronunciation';
type PeriodType = 'minute' | 'hour' | 'day' | 'month';

export class CostGuard {
  private limits: CostLimits;
  private apiCosts: ApiCosts;
  private usage: UsageTracking;
  private circuitOpen: boolean;
  private circuitOpenUntil: number;
  private saveInterval: NodeJS.Timeout;

  constructor() {
    // Cost limits to prevent bill explosion
    this.limits = {
      perMinute: { cost: 0.10, calls: 100 },
      perHour: { cost: 1.00, calls: 1000 },
      perDay: { cost: 10.00, calls: 10000 },
      perMonth: { cost: 100.00, calls: 100000 }
    };
    
    // API cost estimates (conservative)
    this.apiCosts = {
      translation: 0.00001, // $10 per million characters
      context: 0.0001,      // Claude Haiku cost per request
      pronunciation: 0       // Free with browser API
    };
    
    // Tracking
    this.usage = {
      minute: { cost: 0, calls: 0, reset: Date.now() + 60000 },
      hour: { cost: 0, calls: 0, reset: Date.now() + 3600000 },
      day: { cost: 0, calls: 0, reset: Date.now() + 86400000 },
      month: { cost: 0, calls: 0, reset: Date.now() + 2592000000 }
    };
    
    // Circuit breaker state
    this.circuitOpen = false;
    this.circuitOpenUntil = 0;
    
    // Load persisted state
    this.loadState();
    
    // Auto-save periodically
    this.saveInterval = setInterval(() => this.saveState(), 60000);
  }
  
  // Check if API call is allowed
  async checkCost(type: ApiType, estimatedCharacters: number = 100): Promise<CostCheckResult> {
    // Reset periods if needed
    this.resetExpiredPeriods();
    
    // Check circuit breaker
    if (this.circuitOpen && Date.now() < this.circuitOpenUntil) {
      const minutesLeft = Math.ceil((this.circuitOpenUntil - Date.now()) / 60000);
      throw new Error(`API disabled due to high costs. Retry in ${minutesLeft} minutes.`);
    }
    
    // Calculate cost
    const costPerChar = this.apiCosts[type] || this.apiCosts.translation;
    const estimatedCost = costPerChar * estimatedCharacters;
    
    // Check all periods
    const violations: string[] = [];
    for (const [period, limit] of Object.entries(this.limits)) {
      const periodKey = period.replace('per', '').toLowerCase() as PeriodType;
      const usage = this.usage[periodKey];
      
      if (usage.cost + estimatedCost > limit.cost) {
        violations.push(`${period} cost limit ($${limit.cost}) would be exceeded`);
      }
      
      if (usage.calls + 1 > limit.calls) {
        violations.push(`${period} call limit (${limit.calls}) would be exceeded`);
      }
    }
    
    if (violations.length > 0) {
      this.openCircuitBreaker();
      throw new Error(`Cost limits exceeded: ${violations.join(', ')}`);
    }
    
    return { allowed: true, estimatedCost };
  }
  
  // Record actual usage
  recordUsage(type: ApiType, actualCharacters: number): void {
    const costPerChar = this.apiCosts[type] || this.apiCosts.translation;
    const actualCost = costPerChar * actualCharacters;
    
    // Update all periods
    const periods: PeriodType[] = ['minute', 'hour', 'day', 'month'];
    for (const period of periods) {
      this.usage[period].cost += actualCost;
      this.usage[period].calls += 1;
    }
    
    // Log if approaching limits
    this.checkWarnings();
    
    // Save state
    this.saveState();
  }
  
  // Reset expired periods
  private resetExpiredPeriods(): void {
    const now = Date.now();
    
    if (now > this.usage.minute.reset) {
      this.usage.minute = { cost: 0, calls: 0, reset: now + 60000 };
    }
    
    if (now > this.usage.hour.reset) {
      this.usage.hour = { cost: 0, calls: 0, reset: now + 3600000 };
    }
    
    if (now > this.usage.day.reset) {
      this.usage.day = { cost: 0, calls: 0, reset: now + 86400000 };
      this.circuitOpen = false; // Reset circuit breaker daily
    }
    
    if (now > this.usage.month.reset) {
      this.usage.month = { cost: 0, calls: 0, reset: now + 2592000000 };
    }
  }
  
  // Check for warning thresholds
  private checkWarnings(): void {
    for (const [period, limit] of Object.entries(this.limits)) {
      const periodKey = period.replace('per', '').toLowerCase() as PeriodType;
      const usage = this.usage[periodKey];
      const costPercent = (usage.cost / limit.cost) * 100;
      
      if (costPercent > 80) {
        logger.warn(`Cost warning: ${costPercent.toFixed(0)}% of ${period} limit used`);
      }
    }
  }
  
  // Open circuit breaker
  private openCircuitBreaker(): void {
    this.circuitOpen = true;
    this.circuitOpenUntil = Date.now() + 300000; // 5 minutes
    logger.error('Circuit breaker opened due to high costs');
  }
  
  // Get current usage stats
  getUsageStats(): UsageStats {
    this.resetExpiredPeriods();
    
    const stats: UsageStats['stats'] = {} as UsageStats['stats'];
    
    for (const [period, limit] of Object.entries(this.limits)) {
      const periodKey = period.replace('per', '').toLowerCase() as PeriodType;
      const usage = this.usage[periodKey];
      
      stats[period as keyof UsageStats['stats']] = {
        cost: {
          used: usage.cost,
          limit: limit.cost,
          percentage: (usage.cost / limit.cost) * 100
        },
        calls: {
          used: usage.calls,
          limit: limit.calls,
          percentage: (usage.calls / limit.calls) * 100
        }
      };
    }
    
    return {
      stats,
      circuitBreakerOpen: this.circuitOpen,
      totalDailyCost: this.usage.day.cost
    };
  }
  
  // Persist state
  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        costGuardState: {
          usage: this.usage,
          circuitOpen: this.circuitOpen,
          circuitOpenUntil: this.circuitOpenUntil,
          lastSaved: Date.now()
        } as CostGuardState
      });
    } catch (error) {
      logger.error('Failed to save cost guard state:', error);
    }
  }
  
  // Load persisted state
  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('costGuardState');
      if (result.costGuardState) {
        const state = result.costGuardState as CostGuardState;
        
        // Only load if recent (within last hour)
        if (Date.now() - state.lastSaved < 3600000) {
          this.usage = state.usage;
          this.circuitOpen = state.circuitOpen;
          this.circuitOpenUntil = state.circuitOpenUntil;
        }
      }
    } catch (error) {
      logger.error('Failed to load cost guard state:', error);
    }
  }
  
  // Emergency stop - disable all API calls
  emergencyStop(): void {
    this.circuitOpen = true;
    this.circuitOpenUntil = Date.now() + 86400000; // 24 hours
    logger.error('Emergency stop activated - all API calls disabled for 24 hours');
    this.saveState();
  }
  
  // Cleanup method to clear interval
  destroy(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
  }
}

// Export singleton
export const costGuard = new CostGuard();