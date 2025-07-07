// Error Boundary - Graceful error handling
'use strict';

import { logger } from './logger.js';

interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  errorCount: number;
}

interface ErrorStats {
  name: string;
  errorCount: number;
  isOpen: boolean;
  lastReset: number;
}

interface StorageData {
  recentErrors?: ErrorInfo[];
}

export class ErrorBoundary {
  private name: string;
  private errorCount: number;
  private readonly maxErrors: number;
  private readonly resetTime: number; // milliseconds
  private lastReset: number;

  constructor(name: string) {
    this.name = name;
    this.errorCount = 0;
    this.maxErrors = 5;
    this.resetTime = 300000; // 5 minutes
    this.lastReset = Date.now();
  }
  
  // Wrap async function with error boundary
  async wrap<T>(fn: () => Promise<T>, fallback: T | null = null): Promise<T | null> {
    try {
      // Reset error count if enough time passed
      if (Date.now() - this.lastReset > this.resetTime) {
        this.errorCount = 0;
        this.lastReset = Date.now();
      }
      
      // Circuit breaker - fail fast if too many errors
      if (this.errorCount >= this.maxErrors) {
        logger.warn(`${this.name}: Circuit breaker open, returning fallback`);
        return fallback;
      }
      
      return await fn();
    } catch (error) {
      this.errorCount++;
      logger.error(`${this.name}: Error caught`, error);
      
      // Report to error tracking (if implemented)
      this.reportError(error as Error);
      
      return fallback;
    }
  }
  
  // Wrap sync function
  wrapSync<T>(fn: () => T, fallback: T | null = null): T | null {
    try {
      if (this.errorCount >= this.maxErrors) {
        return fallback;
      }
      
      return fn();
    } catch (error) {
      this.errorCount++;
      logger.error(`${this.name}: Sync error caught`, error);
      return fallback;
    }
  }
  
  // Report error for tracking
  private reportError(error: Error): void {
    // In production, this would send to error tracking service
    // For now, just log details
    const errorInfo: ErrorInfo = {
      name: this.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      errorCount: this.errorCount
    };
    
    // Store recent errors
    this.storeError(errorInfo);
  }
  
  // Store error for debugging
  private async storeError(errorInfo: ErrorInfo): Promise<void> {
    try {
      const storage = await chrome.storage.local.get('recentErrors') as StorageData;
      const recentErrors = storage.recentErrors || [];
      
      recentErrors.push(errorInfo);
      
      // Keep only last 50 errors
      if (recentErrors.length > 50) {
        recentErrors.shift();
      }
      
      await chrome.storage.local.set({ recentErrors });
    } catch {
      // Ignore storage errors
    }
  }
  
  // Get error stats
  getStats(): ErrorStats {
    return {
      name: this.name,
      errorCount: this.errorCount,
      isOpen: this.errorCount >= this.maxErrors,
      lastReset: this.lastReset
    };
  }
  
  // Manual reset
  reset(): void {
    this.errorCount = 0;
    this.lastReset = Date.now();
  }
}

// Create boundaries for different modules
export const boundaries = {
  tooltip: new ErrorBoundary('Tooltip'),
  replacer: new ErrorBoundary('Replacer'),
  translator: new ErrorBoundary('Translator'),
  storage: new ErrorBoundary('Storage'),
  api: new ErrorBoundary('API'),
  initialization: new ErrorBoundary('Initialization')
} as const;

// Global error handler for uncaught errors
export function setupGlobalErrorHandling(): void {
  // Handle uncaught errors
  window.addEventListener('error', (event: ErrorEvent) => {
    logger.error('Uncaught error:', event.error);
    event.preventDefault(); // Prevent default error handling
  });
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    logger.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
  });
}