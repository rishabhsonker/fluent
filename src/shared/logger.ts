/**
 * Logger - Production-safe logging with environment awareness
 * 
 * Purpose:
 * - Provides consistent logging across all extension components
 * - Automatically suppresses logs in production builds
 * - Maintains performance history for diagnostics
 * 
 * Key Features:
 * - Environment-aware (dev vs prod)
 * - Structured logging with context
 * - Performance timing integration
 * - Log history for debugging (last 100 entries)
 * - Safe error serialization
 * - No console output in production
 * 
 * Log Levels:
 * - ERROR: Critical errors that need attention
 * - WARN: Warning conditions
 * - INFO: General information (suppressed in prod)
 * - DEBUG: Detailed debugging (suppressed in prod)
 * 
 * Referenced by:
 * - All components for consistent logging
 * - src/core/worker.ts (error tracking)
 * - src/features/translation/main.ts (performance logging)
 * 
 * Production Behavior:
 * - Only ERROR level logs are shown
 * - All other levels suppressed for performance
 * - History still maintained for diagnostics
 */

'use strict';

// Define log level types
type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

// Define log level values
interface LogLevels {
  ERROR: 0;
  WARN: 1;
  INFO: 2;
  DEBUG: 3;
}

// Define log entry structure
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data: any[];
}

class Logger {
  private isDevelopment: boolean;
  private readonly levels: LogLevels;
  private currentLevel: number;
  private history: LogEntry[];
  private readonly maxHistorySize: number;

  constructor() {
    // Chrome Extensions don't support import.meta.env properly
    // For debugging, we'll check if we're in development by looking at the manifest
    try {
      const manifest = chrome?.runtime?.getManifest?.();
      this.isDevelopment = manifest?.version?.includes('dev') || manifest?.version === '0.0.0' || false;
    } catch {
      this.isDevelopment = false;
    }
    
    // Log levels
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    // Set log level based on environment
    // In production, only show errors
    const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
    this.currentLevel = isProduction ? this.levels.ERROR : this.levels.INFO;
    
    // Log history for debugging (limited size)
    this.history = [];
    this.maxHistorySize = 50;
    
    // Don't log initialization in production
  }

  // Set log level
  setLevel(level: LogLevel): void {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  // Core logging method
  private _log(level: LogLevel, message: string, ...args: any[]): void {
    // Add to history regardless of level
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: args
    };
    
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Only output if level is enabled
    if (this.levels[level] <= this.currentLevel) {
      const prefix = `[Fluent ${level}]`;
      
      // In production, suppress all logs except errors
      const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
      if (isProduction && level !== 'ERROR') {
        return;
      }
      
      switch (level) {
        case 'ERROR':
          console.error(prefix, message, ...args);
          break;
        case 'WARN':
          console.warn(prefix, message, ...args);
          break;
        case 'INFO':
          console.info(prefix, message, ...args);
          break;
        case 'DEBUG':
          console['log'](prefix, message, ...args);
          break;
      }
    }
  }

  // Public methods
  error(message: string, ...args: any[]): void {
    this._log('ERROR', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this._log('WARN', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this._log('INFO', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this._log('DEBUG', message, ...args);
  }

  // Performance logging
  time(label: string): void {
    if (this.currentLevel >= this.levels.DEBUG) {
      console.time(`[Fluent PERF] ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.currentLevel >= this.levels.DEBUG) {
      console.timeEnd(`[Fluent PERF] ${label}`);
    }
  }

  // Get log history
  getHistory(): LogEntry[] {
    return [...this.history];
  }

  // Clear history
  clearHistory(): void {
    this.history = [];
  }

  // Export logs for debugging
  exportLogs(): string {
    return JSON.stringify(this.history, null, 2);
  }
}

// Export singleton instance
export const logger = new Logger();

// For production: Override console methods to prevent any accidental logging
(() => {
  // Only override in production
  if (!import.meta.env.DEV && import.meta.env.VITE_FLUENT_DEBUG !== 'true') {
    const noop = (): void => {};
    // Keep error and warn for critical issues only
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.trace = noop;
    console.time = noop;
    console.timeEnd = noop;
    console.timeLog = noop;
    console.group = noop;
    console.groupEnd = noop;
    console.groupCollapsed = noop;
  }
})();