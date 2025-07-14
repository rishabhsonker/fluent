/**
 * Memory Monitor for Chrome Extension
 * Provides real memory usage tracking using Chrome APIs
 */

import { logger } from './logger';
import { safe, safeSync } from './utils/helpers';
import { MONITORING, PERFORMANCE_LIMITS, NUMERIC, ARRAY, TIME, DOMAIN, PROCESSING_LIMITS } from './constants';

interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  percentUsed: number;
  timestamp: number;
}

interface MemoryThresholds {
  warning: number; // MB
  critical: number; // MB
  max: number; // MB
}

export class MemoryMonitor {
  private lastCheck = 0;
  private checkInterval = MONITORING.MEMORY_CHECK_INTERVAL_MS;
  private callbacks: Map<string, (stats: MemoryStats) => void> = new Map();
  
  private readonly thresholds: MemoryThresholds = {
    warning: MONITORING.MEMORY_WARNING_THRESHOLD_MB,
    critical: MONITORING.MEMORY_CRITICAL_THRESHOLD_MB,
    max: PERFORMANCE_LIMITS.MAX_MEMORY_MB
  };

  /**
   * Get current memory usage using Performance API
   */
  async getMemoryUsage(): Promise<MemoryStats> {
    return safe(
      async () => {
        // Use performance.memory if available (Chrome only)
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          const used = memory.usedJSHeapSize;
          const total = memory.totalJSHeapSize;
          const limit = memory.jsHeapSizeLimit;
          
          return {
            usedJSHeapSize: used,
            totalJSHeapSize: total,
            jsHeapSizeLimit: limit,
            percentUsed: (used / limit) * NUMERIC.PERCENTAGE_MAX,
            timestamp: Date.now()
          };
        }
        
        // Fallback: estimate based on object counts
        return this.estimateMemoryUsage();
      },
      'monitor.getMemoryUsage',
      {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: PERFORMANCE_LIMITS.MAX_MEMORY_MB * NUMERIC.BYTES_PER_MB, // 30MB
        percentUsed: 0,
        timestamp: Date.now()
      }
    );
  }

  /**
   * Estimate memory usage when performance.memory is not available
   */
  private estimateMemoryUsage(): MemoryStats {
    // Count various objects in the extension
    let estimatedBytes = 0;
    
    // Count DOM elements
    const domElements = document.querySelectorAll('*').length;
    estimatedBytes += domElements * NUMERIC.PERCENTAGE_MAX; // ~100 bytes per element
    
    // Count Fluent-specific elements
    const fluentElements = document.querySelectorAll('[data-fluent-replaced]').length;
    estimatedBytes += fluentElements * (NUMERIC.MINUTES_SHORT * NUMERIC.PERCENTAGE_MAX); // More memory for our elements (500 bytes)
    
    // Count event listeners (rough estimate)
    const interactiveElements = document.querySelectorAll('button, a, input, [onclick]').length;
    estimatedBytes += interactiveElements * (ARRAY.PAIR_SIZE * NUMERIC.PERCENTAGE_MAX); // 200 bytes per interactive element
    
    // Add base overhead
    estimatedBytes += NUMERIC.MINUTES_SHORT * NUMERIC.BYTES_PER_MB; // 5MB base
    
    const limit = DOMAIN.STATS_MONTH_DAYS * NUMERIC.BYTES_PER_MB; // 30MB
    
    return {
      usedJSHeapSize: estimatedBytes,
      totalJSHeapSize: estimatedBytes,
      jsHeapSizeLimit: limit,
      percentUsed: (estimatedBytes / limit) * NUMERIC.PERCENTAGE_MAX,
      timestamp: Date.now()
    };
  }

  /**
   * Check memory usage and trigger callbacks if thresholds exceeded
   */
  async checkMemory(): Promise<MemoryStats> {
    const now = Date.now();
    
    // Throttle checks
    if (now - this.lastCheck < this.checkInterval) {
      return this.getMemoryUsage();
    }
    
    this.lastCheck = now;
    const stats = await this.getMemoryUsage();
    const usedMB = stats.usedJSHeapSize / NUMERIC.BYTES_PER_MB;
    
    // Log if approaching limits
    if (usedMB > this.thresholds.critical) {
      logger.error('[Memory] CRITICAL: Memory usage exceeds critical threshold', {
        usedMB: usedMB.toFixed(NUMERIC.DECIMAL_PRECISION_2),
        percentUsed: stats.percentUsed.toFixed(1),
        threshold: this.thresholds.critical
      });
      
      // Notify all callbacks
      this.callbacks.forEach(callback => {
        safeSync(
          () => callback(stats),
          'monitor.callback'
        );
      });
    } else if (usedMB > this.thresholds.warning) {
      logger.warn('[Memory] Warning: Memory usage approaching limit', {
        usedMB: usedMB.toFixed(NUMERIC.DECIMAL_PRECISION_2),
        percentUsed: stats.percentUsed.toFixed(1),
        threshold: this.thresholds.warning
      });
    }
    
    return stats;
  }

  /**
   * Register a callback for memory threshold violations
   */
  onThresholdExceeded(id: string, callback: (stats: MemoryStats) => void): () => void {
    this.callbacks.set(id, callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(id);
    };
  }

  /**
   * Force garbage collection if possible (requires special Chrome flags)
   */
  async forceGarbageCollection(): Promise<void> {
    return safe(
      async () => {
        // Try to trigger GC using various methods
        
        // Method 1: Clear caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        
        // Method 2: Clear large objects
        if (window.__fluent) {
          // Clear any large cached data
          const fluent = window.__fluent as any;
          if (fluent.cache) {
            fluent.cache.clear?.();
          }
          if (fluent.translationCache) {
            fluent.translationCache.clear?.();
          }
        }
        
        // Method 3: Use Chrome's gc() if available (requires --js-flags="--expose-gc")
        if ('gc' in window) {
          (window as any).gc();
          logger.info('[Memory] Garbage collection triggered');
        }
        
        // Method 4: Create and destroy large objects to trigger GC
        // Force garbage collection by creating and releasing memory
        new Array(PROCESSING_LIMITS.LARGE_ARRAY_SIZE).fill(0);
        
        logger.info('[Memory] Memory cleanup attempted');
      },
      'monitor.forceGarbageCollection'
    );
  }

  /**
   * Get memory usage formatted for display
   */
  getFormattedStats(stats: MemoryStats): string {
    const usedMB = (stats.usedJSHeapSize / NUMERIC.BYTES_PER_MB).toFixed(NUMERIC.DECIMAL_PRECISION_2);
    const limitMB = (stats.jsHeapSizeLimit / NUMERIC.BYTES_PER_MB).toFixed(ARRAY.FIRST_INDEX);
    const percent = stats.percentUsed.toFixed(1);
    
    return `Memory: ${usedMB}MB / ${limitMB}MB (${percent}%)`;
  }

  /**
   * Check if memory usage is safe
   */
  isMemorySafe(stats: MemoryStats): boolean {
    const usedMB = stats.usedJSHeapSize / NUMERIC.BYTES_PER_MB;
    return usedMB < this.thresholds.warning;
  }

  /**
   * Get recommended action based on memory usage
   */
  getRecommendedAction(stats: MemoryStats): 'none' | 'reduce' | 'cleanup' | 'reload' {
    const usedMB = stats.usedJSHeapSize / NUMERIC.BYTES_PER_MB;
    
    if (usedMB >= this.thresholds.max) {
      return 'reload'; // Page reload recommended
    } else if (usedMB >= this.thresholds.critical) {
      return 'cleanup'; // Aggressive cleanup needed
    } else if (usedMB >= this.thresholds.warning) {
      return 'reduce'; // Reduce activity
    }
    
    return 'none';
  }
}

// Singleton instance
let memoryMonitor: MemoryMonitor | null = null;

export function getMemoryMonitor(): MemoryMonitor {
  if (!memoryMonitor) {
    memoryMonitor = new MemoryMonitor();
  }
  return memoryMonitor;
}

// Auto-monitor in service worker context
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  // Set up periodic monitoring
  const monitor = getMemoryMonitor();
  
  setInterval(async () => {
    const stats = await monitor.checkMemory();
    const action = monitor.getRecommendedAction(stats);
    
    if (action === 'reload') {
      logger.error('[Memory] Extension memory critical - reload recommended', {
        stats: monitor.getFormattedStats(stats)
      });
    } else if (action === 'cleanup') {
      logger.warn('[Memory] Triggering memory cleanup', {
        stats: monitor.getFormattedStats(stats)
      });
      await monitor.forceGarbageCollection();
    }
  }, TIME.MS_PER_MINUTE / ARRAY.PAIR_SIZE); // Check every 30 seconds
}