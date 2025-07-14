/**
 * Error Handler for Cloudflare Workers
 * Provides centralized error handling with context and sanitization
 */

import { logError, logInfo } from './logger.js';

/**
 * Error types for categorization
 */
export const ErrorTypes = {
  VALIDATION: 'ValidationError',
  NETWORK: 'NetworkError',
  AUTH: 'AuthenticationError',
  RATE_LIMIT: 'RateLimitError',
  DATABASE: 'DatabaseError',
  EXTERNAL_SERVICE: 'ExternalServiceError',
  CONFIGURATION: 'ConfigurationError',
  UNKNOWN: 'UnknownError'
};

/**
 * HTTP status codes mapped to error types
 */
const STATUS_TO_ERROR_TYPE = {
  400: ErrorTypes.VALIDATION,
  401: ErrorTypes.AUTH,
  403: ErrorTypes.AUTH,
  429: ErrorTypes.RATE_LIMIT,
  500: ErrorTypes.EXTERNAL_SERVICE,
  502: ErrorTypes.EXTERNAL_SERVICE,
  503: ErrorTypes.EXTERNAL_SERVICE,
  504: ErrorTypes.EXTERNAL_SERVICE
};

/**
 * Sensitive patterns to redact from error data
 */
const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b(?:\d{4}[ -]?){3}\d{4}\b/g, // Credit cards
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IP addresses
  /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, // Bearer tokens
  /sk_[a-zA-Z0-9]{32}/g, // API keys
];

/**
 * Sanitize sensitive data from strings
 */
function sanitizeString(str) {
  if (!str || typeof str !== 'string') return str;
  
  let sanitized = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  // Also redact any API keys or tokens
  const sensitiveKeys = ['apikey', 'api_key', 'token', 'secret', 'password', 'auth'];
  for (const key of sensitiveKeys) {
    const regex = new RegExp(`(${key}[\\s:=]+)([^\\s,;]+)`, 'gi');
    sanitized = sanitized.replace(regex, '$1[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Sanitize error context data
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return context;
  
  const sanitized = {};
  const MAX_STRING_LENGTH = 1000;
  const MAX_ARRAY_LENGTH = 10;
  const MAX_OBJECT_DEPTH = 3;
  
  function sanitizeValue(value, depth = 0) {
    if (depth > MAX_OBJECT_DEPTH) {
      return '[MAX_DEPTH_EXCEEDED]';
    }
    
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === 'string') {
      const trimmed = value.length > MAX_STRING_LENGTH 
        ? value.substring(0, MAX_STRING_LENGTH) + '...[truncated]'
        : value;
      return sanitizeString(trimmed);
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    
    if (Array.isArray(value)) {
      const limited = value.slice(0, MAX_ARRAY_LENGTH);
      const sanitizedArray = limited.map(item => sanitizeValue(item, depth + 1));
      if (value.length > MAX_ARRAY_LENGTH) {
        sanitizedArray.push(`[${value.length - MAX_ARRAY_LENGTH} more items]`);
      }
      return sanitizedArray;
    }
    
    if (typeof value === 'object') {
      const result = {};
      const keys = Object.keys(value).slice(0, 20); // Limit object keys
      
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        
        // Redact sensitive fields
        if (lowerKey.includes('word') || 
            lowerKey.includes('translation') ||
            lowerKey.includes('text') ||
            lowerKey.includes('content')) {
          if (typeof value[key] === 'string' && value[key].length > 3) {
            result[key] = value[key].substring(0, 3) + '***';
          } else if (Array.isArray(value[key])) {
            result[key] = `[${value[key].length} items]`;
          } else {
            result[key] = '[REDACTED]';
          }
        } else if (lowerKey.includes('token') || 
                   lowerKey.includes('key') ||
                   lowerKey.includes('secret') ||
                   lowerKey.includes('password') ||
                   lowerKey.includes('auth')) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeValue(value[key], depth + 1);
        }
      }
      
      if (Object.keys(value).length > keys.length) {
        result['...'] = `${Object.keys(value).length - keys.length} more properties`;
      }
      
      return result;
    }
    
    return '[UNKNOWN_TYPE]';
  }
  
  return sanitizeValue(context);
}

/**
 * Determine error type from error object
 */
function getErrorType(error) {
  // Check error name first
  if (error.name && error.name.includes('Validation')) {
    return ErrorTypes.VALIDATION;
  }
  if (error.name && (error.name.includes('Auth') || error.name.includes('Authentication'))) {
    return ErrorTypes.AUTH;
  }
  if (error.name && error.name.includes('Network')) {
    return ErrorTypes.NETWORK;
  }
  if (error.name && error.name.includes('Database')) {
    return ErrorTypes.DATABASE;
  }
  
  // Check by status code
  if (error.status && STATUS_TO_ERROR_TYPE[error.status]) {
    return STATUS_TO_ERROR_TYPE[error.status];
  }
  
  // Check error message patterns
  const message = (error.message || '').toLowerCase();
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorTypes.VALIDATION;
  }
  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('auth')) {
    return ErrorTypes.AUTH;
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return ErrorTypes.RATE_LIMIT;
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return ErrorTypes.NETWORK;
  }
  if (message.includes('database') || message.includes('d1') || message.includes('sql')) {
    return ErrorTypes.DATABASE;
  }
  
  return ErrorTypes.UNKNOWN;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(error, context = {}) {
  const errorType = getErrorType(error);
  const timestamp = new Date().toISOString();
  const requestId = context.requestId || crypto.randomUUID();
  
  // Determine user-friendly message based on error type
  let userMessage = 'An error occurred while processing your request';
  switch (errorType) {
    case ErrorTypes.VALIDATION:
      userMessage = 'Invalid request. Please check your input and try again.';
      break;
    case ErrorTypes.AUTH:
      userMessage = 'Authentication failed. Please check your credentials.';
      break;
    case ErrorTypes.RATE_LIMIT:
      userMessage = 'Too many requests. Please try again later.';
      break;
    case ErrorTypes.NETWORK:
      userMessage = 'Network error. Please check your connection and try again.';
      break;
    case ErrorTypes.DATABASE:
      userMessage = 'Database error. Please try again later.';
      break;
    case ErrorTypes.EXTERNAL_SERVICE:
      userMessage = 'External service unavailable. Please try again later.';
      break;
  }
  
  // Build error response
  const errorResponse = {
    error: {
      type: errorType,
      message: userMessage,
      code: error.code || errorType.toUpperCase().replace('Error', ''),
      details: process.env.NODE_ENV === 'development' ? {
        originalMessage: sanitizeString(error.message),
        stack: sanitizeString(error.stack)
      } : undefined
    },
    timestamp,
    requestId
  };
  
  // Add retry information for rate limits
  if (errorType === ErrorTypes.RATE_LIMIT && context.retryAfter) {
    errorResponse.error.retryAfter = context.retryAfter;
  }
  
  return errorResponse;
}

/**
 * Error handler class for Cloudflare Workers
 */
class CloudflareErrorHandler {
  constructor(env = {}) {
    this.env = env;
    this.errorCounts = new Map();
    this.lastCleanup = Date.now();
  }

  /**
   * Execute a function with error handling
   */
  async withErrorHandling(fn, options = {}) {
    const {
      operation = 'unknown',
      component = 'worker',
      extra = {},
      fallbackValue = null,
      maxRetries = 0,
      retryDelay = 1000
    } = options;

    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logInfo(`Retrying operation`, { operation, attempt, component });
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
        
        const result = await fn();
        
        // Clear error count on success
        const errorKey = `${component}:${operation}`;
        this.errorCounts.delete(errorKey);
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Track error frequency
        const errorKey = `${component}:${operation}`;
        const count = (this.errorCounts.get(errorKey) || 0) + 1;
        this.errorCounts.set(errorKey, count);
        
        // Clean up old error counts periodically
        if (Date.now() - this.lastCleanup > 3600000) { // 1 hour
          this.cleanupErrorCounts();
        }
        
        // Log the error with context
        this.logError(error, {
          operation,
          component,
          attempt: attempt + 1,
          maxRetries,
          errorCount: count,
          ...sanitizeContext(extra)
        });
        
        // Don't retry certain errors
        if (error.name === 'ValidationError' || 
            error.status === 400 ||
            error.status === 401 ||
            error.status === 403) {
          break;
        }
        
        // If this is the last attempt, break
        if (attempt === maxRetries) {
          break;
        }
      }
    }
    
    // All retries failed
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    
    throw lastError;
  }

  /**
   * Execute a synchronous function with error handling
   */
  withSyncErrorHandling(fn, options = {}) {
    const {
      operation = 'unknown',
      component = 'worker',
      extra = {},
      fallbackValue = null
    } = options;

    try {
      return fn();
    } catch (error) {
      this.logError(error, {
        operation,
        component,
        ...sanitizeContext(extra)
      });
      
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      
      throw error;
    }
  }

  /**
   * Log an error with sanitized context
   */
  logError(error, context = {}) {
    const errorType = getErrorType(error);
    const errorInfo = {
      type: errorType,
      name: error.name || 'Error',
      message: sanitizeString(error.message || 'Unknown error'),
      stack: error.stack ? sanitizeString(error.stack) : undefined,
      status: error.status,
      code: error.code
    };
    
    logError(`${context.component || 'worker'}: ${context.operation || 'unknown'}`, errorInfo, {
      ...context,
      errorType,
      timestamp: new Date().toISOString(),
      environment: this.env.ENVIRONMENT || 'production'
    });
  }

  /**
   * Clean up old error counts to prevent memory growth
   */
  cleanupErrorCounts() {
    const now = Date.now();
    const ONE_HOUR = 3600000;
    
    // Keep only recent errors
    const recentErrors = new Map();
    for (const [key, count] of this.errorCounts) {
      if (count > 0) {
        recentErrors.set(key, count);
      }
    }
    
    this.errorCounts = recentErrors;
    this.lastCleanup = now;
  }

  /**
   * Create a child error handler with additional context
   */
  createChildHandler(additionalContext = {}) {
    const child = new CloudflareErrorHandler(this.env);
    child.defaultContext = { ...this.defaultContext, ...additionalContext };
    return child;
  }
}

/**
 * Singleton instance for the worker
 */
let errorHandler = null;

/**
 * Get or create the error handler instance
 */
export function getErrorHandler(env = {}) {
  if (!errorHandler) {
    errorHandler = new CloudflareErrorHandler(env);
  }
  return errorHandler;
}

/**
 * Convenience function to wrap async handlers
 */
export function wrapHandler(handler, component = 'worker') {
  return async (request, env, ctx) => {
    const errorHandler = getErrorHandler(env);
    
    return errorHandler.withErrorHandling(
      async () => handler(request, env, ctx),
      {
        operation: `${request.method} ${new URL(request.url).pathname}`,
        component,
        extra: {
          method: request.method,
          url: request.url,
          headers: Object.fromEntries(request.headers.entries())
        },
        fallbackValue: new Response(
          JSON.stringify(createErrorResponse(
            new Error('Internal server error'),
            { requestId: ctx?.waitUntil ? crypto.randomUUID() : undefined }
          )),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    );
  };
}

/**
 * Export everything
 */
export { CloudflareErrorHandler, sanitizeContext, sanitizeString };