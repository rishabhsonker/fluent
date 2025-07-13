/**
 * Copyright (c) 2025 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * Lightweight error handling helpers for reduced boilerplate
 * Designed for zero runtime overhead and tree-shaking
 */

import { getErrorHandler } from './error-handler';

/**
 * Lightweight wrapper for Chrome API calls with automatic error handling
 * Optimized for minimal overhead - suitable for hot paths
 */
export async function chromeCall<T>(
  operation: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T> {
  try {
    const result = await operation();
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    return result;
  } catch (error) {
    const errorHandler = getErrorHandler();
    errorHandler.handleError(error, { 
      operation: context,
      component: 'chrome-api'
    });
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

/**
 * Minimal async error wrapper for hot paths
 * Inlinable by V8 for zero overhead
 */
export async function safe<T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorHandler = getErrorHandler();
    errorHandler.handleError(error, { operation: context });
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

/**
 * Sync error wrapper for non-async operations
 */
export function safeSync<T>(
  fn: () => T,
  context: string,
  fallback?: T
): T {
  try {
    return fn();
  } catch (error) {
    const errorHandler = getErrorHandler();
    errorHandler.handleError(error, { operation: context });
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

/**
 * Create a wrapped version of an async function with error handling
 * Good for wrapping frequently called functions
 */
export function wrap<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  component: string,
  fallback?: TReturn
): (...args: TArgs) => Promise<TReturn> {
  const operation = fn.name || 'anonymous';
  const errorHandler = getErrorHandler();
  
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.handleError(error, {
        operation: `${component}.${operation}`,
        component
      });
      if (fallback !== undefined) return fallback;
      throw error;
    }
  };
}

/**
 * Batch multiple operations with individual error handling
 * Useful for initialization sequences
 */
export async function batch<T>(
  operations: Array<{
    fn: () => Promise<T>;
    name: string;
    critical?: boolean;
  }>
): Promise<Array<{ success: boolean; value?: T; error?: unknown }>> {
  const errorHandler = getErrorHandler();
  const results = [];
  
  for (const op of operations) {
    try {
      const value = await op.fn();
      results.push({ success: true, value });
    } catch (error) {
      errorHandler.handleError(error, { operation: op.name });
      results.push({ success: false, error });
      if (op.critical) throw error;
    }
  }
  
  return results;
}

/**
 * Storage-specific helper with automatic Chrome API error handling
 */
export const storage = {
  async get<T>(key: string, fallback: T): Promise<T> {
    return chromeCall(
      async () => {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? fallback;
      },
      `storage.get.${key}`,
      fallback
    );
  },
  
  async set<T>(key: string, value: T): Promise<boolean> {
    return chromeCall(
      async () => {
        await chrome.storage.local.set({ [key]: value });
        return true;
      },
      `storage.set.${key}`,
      false
    );
  },
  
  async remove(key: string): Promise<boolean> {
    return chromeCall(
      async () => {
        await chrome.storage.local.remove(key);
        return true;
      },
      `storage.remove.${key}`,
      false
    );
  }
};

/**
 * Message passing helper with built-in error handling
 */
export async function sendMessage<T>(
  type: string,
  data?: Record<string, any>
): Promise<T> {
  return chromeCall(
    () => chrome.runtime.sendMessage({ type, ...data }),
    `message.${type}`
  );
}

/**
 * Performance-aware wrapper that tracks slow operations
 * Only use for operations where performance monitoring is needed
 */
export async function timed<T>(
  fn: () => Promise<T>,
  context: string,
  slowThreshold = 1000
): Promise<T> {
  const errorHandler = getErrorHandler();
  const start = performance.now();
  
  try {
    const result = await fn();
    const duration = performance.now() - start;
    
    if (duration > slowThreshold) {
      errorHandler.handleError(
        new Error(`Slow operation detected: ${duration}ms`),
        {
          operation: context,
          extra: { duration, threshold: slowThreshold }
        }
      );
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    errorHandler.handleError(error, {
      operation: context,
      extra: { duration }
    });
    throw error;
  }
}