// Logger Module - Production-safe logging
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
    // Set based on environment - can be overridden by env variable
    this.isDevelopment = import.meta.env.DEV || 
                        import.meta.env.VITE_FLUENT_DEBUG === 'true';
    
    // Log levels
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    // Set log level based on environment
    this.currentLevel = this.isDevelopment ? this.levels.DEBUG : this.levels.ERROR;
    
    // Log history for debugging (limited size)
    this.history = [];
    this.maxHistorySize = 50; // Reduced for production
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