/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * Centralized error handling with Sentry integration
 * Eliminates code duplication across the codebase
 */

import { logger } from '../logger';

// Simplified Sentry Hub interface to avoid dependency
interface SentryHub {
  captureException(error: unknown, context?: any): void;
  captureMessage(message: string, level: string, context?: any): void;
}

export interface ErrorContext {
  operation: string;
  component?: string;
  userId?: string;
  extra?: Record<string, any>;
}

export class ErrorHandler {
  constructor(private sentry?: SentryHub) {}

  /**
   * Wraps an async operation with error handling and Sentry reporting
   * @param operation The async operation to execute
   * @param context Context information for error reporting
   * @param defaultValue Optional default value to return on error
   * @returns The operation result or default value
   */
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    defaultValue?: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error, context);
      
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Wraps a sync operation with error handling
   */
  withSyncErrorHandling<T>(
    operation: () => T,
    context: ErrorContext,
    defaultValue?: T
  ): T {
    try {
      return operation();
    } catch (error) {
      this.handleError(error, context);
      
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Handle and report an error
   */
  handleError(error: unknown, context: ErrorContext): void {
    // Always log locally for debugging
    logger.error(`${context.operation} failed:`, error);

    // Report to Sentry if available
    if (this.sentry) {
      this.sentry.captureException(error, {
        tags: {
          component: context.component || 'unknown',
          operation: context.operation
        },
        user: context.userId ? { id: context.userId } : undefined,
        extra: this.sanitizeExtra(context.extra)
      });
    }
  }

  /**
   * Sanitize extra data to avoid logging sensitive information
   * Implements size limits and depth control based on Sentry best practices
   */
  private sanitizeExtra(extra?: Record<string, any>): Record<string, any> {
    if (!extra) return {};
    
    // Size limits based on Sentry best practices
    const MAX_STRING_LENGTH = 1000;
    const MAX_ARRAY_LENGTH = 10;
    const MAX_OBJECT_DEPTH = 3;
    const MAX_OBJECT_KEYS = 20;
    const MAX_TOTAL_SIZE = 200 * 1024; // 200KB limit
    
    let totalSize = 0;
    
    const sanitize = (value: any, depth = 0, key?: string): any => {
      // Track approximate size
      totalSize += JSON.stringify(value || '').length;
      if (totalSize > MAX_TOTAL_SIZE) {
        return '[SIZE_LIMIT_EXCEEDED]';
      }
      
      // Check depth
      if (depth > MAX_OBJECT_DEPTH) {
        return '[MAX_DEPTH_EXCEEDED]';
      }
      
      // Handle null/undefined
      if (value == null) return value;
      
      // Check if sensitive key
      const lowerKey = (key || '').toLowerCase();
      const isSensitive = this.isSensitiveKey(lowerKey);
      
      // Handle strings
      if (typeof value === 'string') {
        if (isSensitive) {
          return value.length > 3 ? value.substring(0, 3) + '***' : '[REDACTED]';
        }
        return value.length > MAX_STRING_LENGTH 
          ? value.substring(0, MAX_STRING_LENGTH) + '...[TRUNCATED]'
          : value;
      }
      
      // Handle numbers and booleans
      if (typeof value === 'number' || typeof value === 'boolean') {
        return isSensitive ? '[REDACTED]' : value;
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        if (isSensitive) {
          return `[${value.length} items redacted]`;
        }
        const truncated = value.slice(0, MAX_ARRAY_LENGTH);
        const sanitized = truncated.map((v, i) => sanitize(v, depth + 1, `${key}[${i}]`));
        if (value.length > MAX_ARRAY_LENGTH) {
          sanitized.push(`[${value.length - MAX_ARRAY_LENGTH} more items...]`);
        }
        return sanitized;
      }
      
      // Handle objects
      if (value && typeof value === 'object') {
        if (isSensitive) {
          return '[OBJECT_REDACTED]';
        }
        
        // Handle special objects
        if (value instanceof Error) {
          return {
            name: value.name,
            message: sanitize(value.message, depth + 1),
            stack: value.stack ? sanitize(value.stack, depth + 1) : undefined
          };
        }
        
        if (value instanceof Date) {
          return value.toISOString();
        }
        
        // Regular objects
        const sanitized: Record<string, any> = {};
        let keyCount = 0;
        
        for (const [k, v] of Object.entries(value)) {
          if (keyCount >= MAX_OBJECT_KEYS) {
            sanitized['...'] = `[${Object.keys(value).length - keyCount} more keys omitted]`;
            break;
          }
          sanitized[k] = sanitize(v, depth + 1, k);
          keyCount++;
        }
        
        return sanitized;
      }
      
      // Handle functions
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      // Default
      return String(value);
    };
    
    return sanitize(extra);
  }

  /**
   * Check if a key contains sensitive information
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      'word', 'translation', 'text', 'content', 'data',
      'token', 'key', 'secret', 'password', 'auth',
      'cookie', 'session', 'user', 'email', 'phone',
      'ssn', 'credit', 'card', 'account', 'private'
    ];
    
    return sensitivePatterns.some(pattern => key.includes(pattern));
  }

  /**
   * Track performance of an operation
   */
  async trackPerformance<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    const start = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - start;
      
      // Log slow operations
      if (duration > 1000) {
        logger.warn(`Slow operation: ${context.operation} took ${duration}ms`);
        
        if (this.sentry) {
          this.sentry.captureMessage('Slow operation detected', 'warning', {
            tags: {
              component: context.component || 'unknown',
              operation: context.operation
            },
            extra: {
              duration,
              ...this.sanitizeExtra(context.extra)
            }
          });
        }
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      // Add duration to error context
      context.extra = { ...context.extra, duration };
      this.handleError(error, context);
      
      throw error;
    }
  }
}

// Singleton instance management
let errorHandler: ErrorHandler | null = null;

export function initErrorHandler(sentry?: SentryHub): ErrorHandler {
  errorHandler = new ErrorHandler(sentry);
  return errorHandler;
}

export function getErrorHandler(): ErrorHandler {
  if (!errorHandler) {
    // Initialize without Sentry if not yet configured
    errorHandler = new ErrorHandler();
  }
  return errorHandler;
}