/**
 * Utility functions for Cloudflare Workers
 */

import { logError } from './logger.js';

/**
 * Minimal async error wrapper for consistent error handling
 * Mirrors the TypeScript safe() function from src/shared/utils/helpers.ts
 * 
 * @template T
 * @param {() => Promise<T>} fn - The async function to execute
 * @param {string} context - Description of the operation for error logging
 * @param {T} [fallback] - Optional fallback value to return on error
 * @returns {Promise<T>} The result of the function or fallback value
 */
export async function safe(fn, context, fallback) {
  try {
    return await fn();
  } catch (error) {
    // Log error with context
    logError(`${context}:`, error);
    
    // Return fallback if provided, otherwise rethrow
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Sync error wrapper for non-async operations
 * 
 * @template T
 * @param {() => T} fn - The function to execute
 * @param {string} context - Description of the operation for error logging
 * @param {T} [fallback] - Optional fallback value to return on error
 * @returns {T} The result of the function or fallback value
 */
export function safeSync(fn, context, fallback) {
  try {
    return fn();
  } catch (error) {
    // Log error with context
    logError(`${context}:`, error);
    
    // Return fallback if provided, otherwise rethrow
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Parse JSON safely with error handling
 * Common utility needed across workers
 * 
 * @param {string} text - JSON string to parse
 * @param {*} [fallback=null] - Fallback value on parse error
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(text, fallback = null) {
  return safeSync(
    () => JSON.parse(text),
    'JSON parse error',
    fallback
  );
}

/**
 * Create a debounced version of a function
 * Useful for rate limiting operations
 * 
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create cache key with consistent format
 * Mirrors pattern from TypeScript codebase
 * 
 * @param {string} prefix - Cache key prefix
 * @param {...string} parts - Parts to join with colons
 * @returns {string} Formatted cache key
 */
export function cacheKey(prefix, ...parts) {
  return [prefix, ...parts.map(p => String(p).toLowerCase().trim())].join(':');
}

/**
 * Check if error is a network error
 * 
 * @param {Error} error - Error to check
 * @returns {boolean} True if network error
 */
export function isNetworkError(error) {
  return error instanceof TypeError && error.message.includes('fetch');
}

/**
 * Check if error is a timeout error
 * 
 * @param {Error} error - Error to check  
 * @returns {boolean} True if timeout error
 */
export function isTimeoutError(error) {
  return error.name === 'AbortError' || error.message.includes('timeout');
}

/**
 * Format error for logging with consistent structure
 * 
 * @param {Error} error - Error to format
 * @param {string} context - Context where error occurred
 * @returns {Object} Formatted error object
 */
export function formatError(error, context) {
  return {
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    context,
    stack: error.stack,
    timestamp: new Date().toISOString()
  };
}