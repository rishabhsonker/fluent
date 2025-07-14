/**
 * Cloudflare Worker Constants
 * 
 * Mirrors critical constants from src/shared/constants.ts
 * Workers cannot import from src/ directory due to build constraints
 * 
 * IMPORTANT: Keep these values synchronized with src/shared/constants.ts
 * Any changes here should be reflected in the main constants file
 */

/**
 * Rate Limiting Configuration
 * Defines API usage limits per time period
 */
export const RATE_LIMITS = {
  /**
   * Maximum translations per hour
   * Primary rate limit for free tier users
   */
  TRANSLATIONS_PER_HOUR: 100,
  
  /**
   * Maximum translations per day
   * Daily quota to prevent abuse and control costs
   */
  TRANSLATIONS_PER_DAY: 1000,
  
  /**
   * Maximum context explanations per hour
   * Claude API is more expensive, so lower limit
   */
  EXPLANATIONS_PER_HOUR: 10,
  
  /**
   * Maximum context explanations per day
   * Daily quota for AI-powered features
   */
  EXPLANATIONS_PER_DAY: 100,
  
  /**
   * Maximum API calls per minute
   * Prevents burst usage that could trigger upstream throttling
   */
  API_CALLS_PER_MINUTE: 20,
};

/**
 * Time Period Constants
 * Used for cache TTLs and rate limit windows
 * All values in seconds for Cloudflare KV compatibility
 */
export const TIME_PERIODS = {
  /**
   * One hour in seconds
   * Used for hourly rate limit windows
   */
  ONE_HOUR_SECONDS: 3600,
  
  /**
   * One day in seconds
   * Used for daily rate limit windows and cache TTLs
   */
  ONE_DAY_SECONDS: 86400,
  
  /**
   * One week in seconds
   * Used for longer-term caching
   */
  ONE_WEEK_SECONDS: 604800,
  
  /**
   * Five minutes in seconds
   * Used for short-term caching and timeouts
   */
  FIVE_MINUTES_SECONDS: 300,
};

/**
 * HTTP Configuration
 * Standard HTTP settings and status codes
 */
export const HTTP = {
  /**
   * Request timeout in milliseconds
   * Maximum time to wait for upstream API responses
   */
  TIMEOUT_MS: 30000,
  
  /**
   * CORS max age in seconds
   * How long browsers can cache CORS preflight responses
   */
  CORS_MAX_AGE_SECONDS: 86400,
  
  /**
   * Standard HTTP status codes
   */
  STATUS_OK: 200,
  STATUS_BAD_REQUEST: 400,
  STATUS_UNAUTHORIZED: 401,
  STATUS_FORBIDDEN: 403,
  STATUS_NOT_FOUND: 404,
  STATUS_TOO_MANY_REQUESTS: 429,
  STATUS_INTERNAL_ERROR: 500,
  STATUS_BAD_GATEWAY: 502,
  STATUS_SERVICE_UNAVAILABLE: 503,
};

/**
 * Cache Configuration
 * Settings for Cloudflare KV caching
 */
export const CACHE = {
  /**
   * Default cache TTL in seconds
   * How long to cache successful responses
   */
  DEFAULT_TTL_SECONDS: 3600,
  
  /**
   * Maximum string length for cache values
   * Prevents excessively large cache entries
   */
  MAX_STRING_LENGTH: 1000,
  
  /**
   * Cache key prefixes for different data types
   * Helps with cache organization and bulk operations
   */
  KEY_PREFIX_TRANSLATION: 'tr:',
  KEY_PREFIX_RATE_LIMIT: 'rl:',
  KEY_PREFIX_AUTH: 'auth:',
  KEY_PREFIX_USAGE: 'usage:',
  
  /**
   * Cache hit rate threshold (percentage)
   * Minimum acceptable cache performance
   */
  MIN_HIT_RATE_PERCENT: 90,
};

/**
 * Validation Limits
 * Input validation constraints
 */
export const VALIDATION = {
  /**
   * Maximum word length in characters
   * Prevents processing unreasonably long strings
   */
  MAX_WORD_LENGTH: 100,
  
  /**
   * Minimum word length in characters
   * Filters out particles and punctuation
   */
  MIN_WORD_LENGTH: 4,
  
  /**
   * Maximum words per batch request
   * Balances efficiency with memory/timeout constraints
   */
  MAX_BATCH_SIZE: 100,
  
  /**
   * Maximum request payload size in KB
   * Prevents memory exhaustion from large requests
   */
  MAX_PAYLOAD_SIZE_KB: 10,
  
  /**
   * Maximum response size in KB
   * Ensures responses fit within CF Workers limits
   */
  MAX_RESPONSE_SIZE_KB: 50,
};

/**
 * Retry Configuration
 * Controls retry behavior for failed requests
 */
export const RETRY = {
  /**
   * Initial retry delay in milliseconds
   * First retry happens after this delay
   */
  INITIAL_DELAY_MS: 1000,
  
  /**
   * Maximum retry attempts
   * Gives up after this many failures
   */
  MAX_ATTEMPTS: 3,
  
  /**
   * Retry backoff multiplier
   * Each retry waits previous_delay * multiplier
   */
  BACKOFF_MULTIPLIER: 2,
};

/**
 * Worker Resource Limits
 * Cloudflare Worker platform constraints
 */
export const WORKER_LIMITS = {
  /**
   * Maximum CPU time per request in milliseconds
   * CF Workers are limited to 50ms on free plan, 100ms on paid
   */
  CPU_MS: 100,
  
  /**
   * Maximum memory usage in MB
   * CF Workers have 128MB memory limit
   */
  MEMORY_MB: 128,
  
  /**
   * Maximum subrequest count
   * CF Workers allow 50 subrequests on free plan
   */
  SUBREQUESTS: 50,
};

/**
 * Database Configuration
 * Settings for D1 database operations
 */
export const DATABASE = {
  /**
   * Query timeout in milliseconds
   * Maximum time for database operations
   */
  QUERY_TIMEOUT_MS: 5000,
  
  /**
   * Maximum records per query
   * Prevents excessive memory usage
   */
  MAX_RECORDS_PER_QUERY: 1000,
  
  /**
   * User plan limits
   */
  PLANS: {
    FREE: {
      TRANSLATIONS_PER_DAY: 100,
      EXPLANATIONS_PER_DAY: 20,
    },
    PLUS: {
      TRANSLATIONS_PER_DAY: 1000,
      EXPLANATIONS_PER_DAY: 500,
    },
    PRO: {
      TRANSLATIONS_PER_DAY: 10000,
      EXPLANATIONS_PER_DAY: 2000,
    },
  },
};

/**
 * Security Configuration
 * Security-related constants
 */
export const SECURITY = {
  /**
   * Maximum message size in bytes
   * Prevents DoS from large messages
   */
  MAX_MESSAGE_SIZE: 100000,
  
  /**
   * Token expiry in seconds
   * How long auth tokens remain valid
   */
  TOKEN_EXPIRY_SECONDS: 3600,
  
  /**
   * Maximum login attempts
   * Before temporary lockout
   */
  MAX_LOGIN_ATTEMPTS: 5,
  
  /**
   * Lockout duration in seconds
   * How long to lock account after max attempts
   */
  LOCKOUT_DURATION_SECONDS: 900, // 15 minutes
};