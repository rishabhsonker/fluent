/**
 * Enhanced Error Boundary System - Comprehensive error handling with recovery
 */

import { logger } from './logger';

interface ErrorInfo {
  component: string;
  message: string;
  stack?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  context?: Record<string, any>;
}

interface ErrorStats {
  totalErrors: number;
  errorsByComponent: Record<string, number>;
  circuitBreakerStatus: Record<string, boolean>;
  lastErrors: ErrorInfo[];
}

interface RecoveryStrategy {
  component: string;
  action: () => Promise<void>;
  retryCount: number;
  maxRetries: number;
}

export class EnhancedErrorBoundary {
  private static instance: EnhancedErrorBoundary;
  private errorStats: ErrorStats;
  private recoveryStrategies: Map<string, RecoveryStrategy>;
  private readonly MAX_STORED_ERRORS = 100;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private circuitBreakerTimers: Map<string, NodeJS.Timeout>;

  private constructor() {
    this.errorStats = {
      totalErrors: 0,
      errorsByComponent: {},
      circuitBreakerStatus: {},
      lastErrors: []
    };
    this.recoveryStrategies = new Map();
    this.circuitBreakerTimers = new Map();
    this.setupGlobalHandlers();
    this.loadPersistedErrors();
  }

  static getInstance(): EnhancedErrorBoundary {
    if (!EnhancedErrorBoundary.instance) {
      EnhancedErrorBoundary.instance = new EnhancedErrorBoundary();
    }
    return EnhancedErrorBoundary.instance;
  }

  /**
   * Wrap a function with comprehensive error handling
   */
  async wrap<T>(
    component: string,
    fn: () => Promise<T>,
    options: {
      fallback?: T;
      retry?: boolean;
      critical?: boolean;
      context?: Record<string, any>;
    } = {}
  ): Promise<T | undefined> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen(component)) {
      logger.warn(`Circuit breaker open for ${component}`);
      return options.fallback;
    }

    try {
      return await fn();
    } catch (error) {
      await this.handleError(component, error as Error, options.context);

      // Attempt recovery if configured
      if (options.retry && this.recoveryStrategies.has(component)) {
        const recovered = await this.attemptRecovery(component);
        if (recovered) {
          try {
            return await fn();
          } catch (retryError) {
            logger.error(`Recovery failed for ${component}:`, retryError);
          }
        }
      }

      // Critical errors should be re-thrown after logging
      if (options.critical) {
        throw error;
      }

      return options.fallback;
    }
  }

  /**
   * Wrap synchronous functions
   */
  wrapSync<T>(
    component: string,
    fn: () => T,
    options: {
      fallback?: T;
      critical?: boolean;
      context?: Record<string, any>;
    } = {}
  ): T | undefined {
    if (this.isCircuitBreakerOpen(component)) {
      return options.fallback;
    }

    try {
      return fn();
    } catch (error) {
      // Use Promise.resolve to handle async error recording
      Promise.resolve(this.handleError(component, error as Error, options.context));
      
      if (options.critical) {
        throw error;
      }
      
      return options.fallback;
    }
  }

  /**
   * Register a recovery strategy for a component
   */
  registerRecoveryStrategy(
    component: string,
    action: () => Promise<void>,
    maxRetries: number = 3
  ): void {
    this.recoveryStrategies.set(component, {
      component,
      action,
      retryCount: 0,
      maxRetries
    });
  }

  /**
   * Handle and record errors
   */
  private async handleError(
    component: string,
    error: Error,
    context?: Record<string, any>
  ): Promise<void> {
    const errorInfo: ErrorInfo = {
      component,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      context
    };

    // Update statistics
    this.errorStats.totalErrors++;
    this.errorStats.errorsByComponent[component] = 
      (this.errorStats.errorsByComponent[component] || 0) + 1;
    
    // Store error
    this.errorStats.lastErrors.push(errorInfo);
    if (this.errorStats.lastErrors.length > this.MAX_STORED_ERRORS) {
      this.errorStats.lastErrors.shift();
    }

    // Check circuit breaker threshold
    if (this.errorStats.errorsByComponent[component] >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.openCircuitBreaker(component);
    }

    // Log error
    logger.error(`[${component}] Error:`, error, context);

    // Persist errors for debugging
    await this.persistErrors();

    // Send telemetry if in production
    if (process.env.NODE_ENV === 'production') {
      this.sendTelemetry(errorInfo);
    }
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(component: string): boolean {
    return this.errorStats.circuitBreakerStatus[component] || false;
  }

  private openCircuitBreaker(component: string): void {
    logger.warn(`Opening circuit breaker for ${component}`);
    this.errorStats.circuitBreakerStatus[component] = true;

    // Clear existing timer
    const existingTimer = this.circuitBreakerTimers.get(component);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer to close breaker
    const timer = setTimeout(() => {
      this.closeCircuitBreaker(component);
    }, this.CIRCUIT_BREAKER_TIMEOUT);

    this.circuitBreakerTimers.set(component, timer);
  }

  private closeCircuitBreaker(component: string): void {
    logger.info(`Closing circuit breaker for ${component}`);
    this.errorStats.circuitBreakerStatus[component] = false;
    this.errorStats.errorsByComponent[component] = 0;
    this.circuitBreakerTimers.delete(component);
  }

  /**
   * Attempt recovery for a component
   */
  private async attemptRecovery(component: string): Promise<boolean> {
    const strategy = this.recoveryStrategies.get(component);
    if (!strategy || strategy.retryCount >= strategy.maxRetries) {
      return false;
    }

    try {
      logger.info(`Attempting recovery for ${component} (attempt ${strategy.retryCount + 1})`);
      strategy.retryCount++;
      await strategy.action();
      
      // Reset retry count on success
      strategy.retryCount = 0;
      return true;
    } catch (error) {
      logger.error(`Recovery failed for ${component}:`, error);
      return false;
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    // Handle uncaught errors
    window.addEventListener('error', (event: ErrorEvent) => {
      this.handleError('global', event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
      event.preventDefault();
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.handleError('promise', new Error(event.reason?.message || 'Unhandled promise rejection'), {
        reason: event.reason
      });
      event.preventDefault();
    });

    // Handle Chrome extension errors
    if (chrome?.runtime?.lastError) {
      this.handleError('chrome', new Error(chrome.runtime.lastError.message));
    }
  }

  /**
   * Persist errors to storage
   */
  private async persistErrors(): Promise<void> {
    try {
      await chrome.storage.local.set({
        errorStats: {
          totalErrors: this.errorStats.totalErrors,
          errorsByComponent: this.errorStats.errorsByComponent,
          lastErrors: this.errorStats.lastErrors.slice(-50) // Keep last 50
        }
      });
    } catch (error) {
      // Don't throw if storage fails
      console.error('Failed to persist errors:', error);
    }
  }

  /**
   * Load persisted errors on startup
   */
  private async loadPersistedErrors(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get('errorStats');
      if (stored.errorStats) {
        this.errorStats = {
          ...this.errorStats,
          ...stored.errorStats,
          circuitBreakerStatus: {} // Don't persist circuit breaker state
        };
      }
    } catch (error) {
      console.error('Failed to load persisted errors:', error);
    }
  }

  /**
   * Send telemetry (placeholder for production)
   */
  private sendTelemetry(errorInfo: ErrorInfo): void {
    // In production, this would send to an error tracking service
    // For now, just log
    logger.debug('Telemetry:', errorInfo);
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    return { ...this.errorStats };
  }

  /**
   * Clear error statistics
   */
  clearStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByComponent: {},
      circuitBreakerStatus: {},
      lastErrors: []
    };
    chrome.storage.local.remove('errorStats');
  }

  /**
   * Export error report for debugging
   */
  exportErrorReport(): string {
    return JSON.stringify(this.errorStats, null, 2);
  }
}

// Export singleton instance
export const errorBoundary = EnhancedErrorBoundary.getInstance();

// Register default recovery strategies
errorBoundary.registerRecoveryStrategy('content-script', async () => {
  // Reload content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    await chrome.tabs.reload(tab.id);
  }
});

errorBoundary.registerRecoveryStrategy('storage', async () => {
  // Clear and reinitialize storage
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ initialized: true });
});

errorBoundary.registerRecoveryStrategy('api', async () => {
  // Wait before retrying API calls
  await new Promise(resolve => setTimeout(resolve, 1000));
});