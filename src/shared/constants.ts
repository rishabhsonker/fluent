/**
 * Shared Constants - Central configuration and constants
 * 
 * Purpose:
 * - Single source of truth for all configuration values
 * - Defines limits, timings, API endpoints, and feature flags
 * - Ensures consistency across extension components
 * 
 * Categories:
 * - API_CONFIG: Endpoint URLs and API settings
 * - STORAGE_KEYS: Chrome storage key names
 * - DEFAULT_SETTINGS: User preference defaults
 * - TIMING: Delays, intervals, and timeouts
 * - LIMITS: Rate limits and size constraints
 * - PERFORMANCE_LIMITS: Memory and processing constraints
 * - CACHE_LIMITS: Cache size and TTL settings
 * - SUPPORTED_LANGUAGES: Language configurations
 * - SKIP_PATTERNS: Elements/selectors to ignore
 * 
 * Referenced by:
 * - All components that need configuration values
 * - src/core/worker.ts (API endpoints, storage keys)
 * - src/features/translation/translator.ts (cache limits)
 * - src/features/ui/tooltip/tooltip.ts (timing values)
 * - src/shared/validator.ts (validation limits)
 * 
 * Maintenance:
 * - Update version numbers here for releases
 * - Adjust rate limits based on API quotas
 * - Tune performance limits based on metrics
 */

// Type definitions
interface LanguageArticles {
  masculine: string;
  feminine: string;
  masculinePlural?: string;
  femininePlural?: string;
  plural?: string;
  vowelStart?: string;
  neuter?: string;
}

interface LanguageSpecialRules {
  capitalizeNouns?: boolean;
}

interface Language {
  code: string;
  name: string;
  flag: string;
  articles: LanguageArticles;
  specialRules?: LanguageSpecialRules;
}

interface SupportedLanguages {
  spanish: Language;
  french: Language;
  german: Language;
}

interface PerformanceLimits {
  MAX_MEMORY_MB: number;
  MAX_PROCESSING_TIME_MS: number;
  MAX_PAGE_LOAD_IMPACT_MS: number;
  MIN_CACHE_HIT_RATE: number;
  MAX_API_TIMEOUT_MS: number;
  PERFORMANCE_GUARD_MS: number;
  FRAME_BUDGET_MS: number;
  IDLE_CALLBACK_TIMEOUT_MS: number;
}

interface WordConfig {
  MIN_WORD_LENGTH: number;
  MAX_WORD_LENGTH: number;
  MIN_WORD_OCCURRENCES: number;
  MAX_WORD_OCCURRENCES: number;
  MAX_WORDS_PER_PAGE: number;
  WORDS_PER_PARAGRAPH: number;
  MIN_PARAGRAPH_LENGTH: number;
}

interface TranslationDictionary {
  [key: string]: string;
}


interface ApiConfig {
  TRANSLATOR_API: string;
}

interface StorageKeys {
  USER_SETTINGS: string;
  SITE_SETTINGS: string;
  WORD_PROGRESS: string;
  TRANSLATION_CACHE: string;
  CONTEXT_CACHE: string;
  DAILY_STATS: string;
  DAILY_USAGE: string;
}

interface DefaultSettings {
  targetLanguage: keyof SupportedLanguages;
  wordCount: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  enabled: boolean;
  enablePronunciation: boolean;
  enableContextHelper: boolean;
  pausedUntil?: number;
}

interface TimingConstants {
  TOOLTIP_SHOW_DELAY_MS: number;
  TOOLTIP_HIDE_DELAY_MS: number;
  SCROLL_DEBOUNCE_MS: number;
  MUTATION_DEBOUNCE_MS: number;
  PAUSE_DURATION_MS: number;
  CONTEXT_CHECK_INTERVAL_MS: number;
  CACHE_CLEANUP_INTERVAL_MS: number;
  ERROR_RESET_TIME_MS: number;
  CIRCUIT_BREAKER_TIMEOUT_MS: number;
}

interface CacheLimits {
  MEMORY_CACHE_MAX_ENTRIES: number;
  STORAGE_CACHE_MAX_ENTRIES: number;
  RECENT_ERRORS_MAX: number;
  BLOOM_FILTER_SIZE: number;
  BLOOM_FILTER_HASHES: number;
}

interface UIConstants {
  REPLACED_WORD_COLOR: string;
  MAX_TOOLTIP_WIDTH: number;
  TOOLTIP_Z_INDEX: number;
  PAGE_CONTROL_Z_INDEX: number;
}

interface SecurityConstants {
  MAX_MESSAGE_SIZE: number;
  MAX_STRING_LENGTH: number;
  MESSAGE_TIMEOUT_MS: number;
  SALT_KEY: string;
  ENCRYPTION_ALGORITHM: string;
  KEY_LENGTH: number;
  PBKDF2_ITERATIONS: number;
}

interface RateLimits {
  DAILY_WORDS: number;
  DAILY_EXPLANATIONS: number;
  API_CALLS_PER_MINUTE: number;
  API_CALLS_PER_HOUR: number;
}

// Base time unit constants - defined FIRST to avoid circular dependencies
const TIME_UNITS = {
  SECONDS_IN_MINUTE: 60,
  MINUTES_IN_HOUR: 60,
  HOURS_IN_DAY: 24,
  DAYS_IN_WEEK: 7,
  DAYS_IN_MONTH: 30,  // approximation
  MS_IN_SECOND: 1000,
} as const;

/**
 * Time Constants
 * Centralized time values to replace magic numbers
 */
interface TimeConstants {
  MS_PER_SECOND: number;
  MS_PER_MINUTE: number;
  MS_PER_HOUR: number;
  MS_PER_DAY: number;
  MS_PER_WEEK: number;
  MS_PER_MONTH: number;  // 30 days approximation
  SECONDS_PER_MINUTE: number;
  MINUTES_PER_HOUR: number;
  HOURS_PER_DAY: number;
  DAYS_PER_WEEK: number;
  DAYS_PER_MONTH: number;  // 30 days approximation
}

export const TIME: TimeConstants = {
  MS_PER_SECOND: TIME_UNITS.MS_IN_SECOND,
  MS_PER_MINUTE: TIME_UNITS.SECONDS_IN_MINUTE * TIME_UNITS.MS_IN_SECOND,
  MS_PER_HOUR: TIME_UNITS.MINUTES_IN_HOUR * TIME_UNITS.SECONDS_IN_MINUTE * TIME_UNITS.MS_IN_SECOND,
  MS_PER_DAY: TIME_UNITS.HOURS_IN_DAY * TIME_UNITS.MINUTES_IN_HOUR * TIME_UNITS.SECONDS_IN_MINUTE * TIME_UNITS.MS_IN_SECOND,
  MS_PER_WEEK: TIME_UNITS.DAYS_IN_WEEK * TIME_UNITS.HOURS_IN_DAY * TIME_UNITS.MINUTES_IN_HOUR * TIME_UNITS.SECONDS_IN_MINUTE * TIME_UNITS.MS_IN_SECOND,
  MS_PER_MONTH: TIME_UNITS.DAYS_IN_MONTH * TIME_UNITS.HOURS_IN_DAY * TIME_UNITS.MINUTES_IN_HOUR * TIME_UNITS.SECONDS_IN_MINUTE * TIME_UNITS.MS_IN_SECOND,
  SECONDS_PER_MINUTE: TIME_UNITS.SECONDS_IN_MINUTE,
  MINUTES_PER_HOUR: TIME_UNITS.MINUTES_IN_HOUR,
  HOURS_PER_DAY: TIME_UNITS.HOURS_IN_DAY,
  DAYS_PER_WEEK: TIME_UNITS.DAYS_IN_WEEK,
  DAYS_PER_MONTH: TIME_UNITS.DAYS_IN_MONTH,
} as const;

/**
 * Array and Collection Constants
 * Common array indices and sizes
 */
interface ArrayConstants {
  FIRST_INDEX: number;
  SECOND_INDEX: number;
  THIRD_INDEX: number;
  FOURTH_INDEX: number;
  EMPTY_LENGTH: number;
  SINGLE_ITEM: number;
  PAIR_SIZE: number;
  TRIPLE_SIZE: number;
}

export const ARRAY: ArrayConstants = {
  FIRST_INDEX: 0,
  SECOND_INDEX: 1,
  THIRD_INDEX: 2,
  FOURTH_INDEX: 3,
  EMPTY_LENGTH: 0,
  SINGLE_ITEM: 1,
  PAIR_SIZE: 2,
  TRIPLE_SIZE: 3,
} as const;

/**
 * Numeric Constants
 * Common numeric values used throughout the codebase
 */
interface NumericConstants {
  PERCENTAGE_MAX: number;
  PERCENTAGE_HALF: number;
  BYTES_PER_KB: number;
  BYTES_PER_MB: number;
  KB_PER_MB: number;
  DECIMAL_PRECISION_2: number;
  DECIMAL_PRECISION_3: number;
  BINARY_BASE: number;
  DECIMAL_BASE: number;
  HEX_BASE: number;
  MINUTES_SHORT: number;
  MINUTES_MEDIUM: number;
}

export const NUMERIC: NumericConstants = {
  PERCENTAGE_MAX: 100,
  PERCENTAGE_HALF: 50,
  BYTES_PER_KB: 1024,
  BYTES_PER_MB: 1024 * 1024,
  KB_PER_MB: 1024,
  DECIMAL_PRECISION_2: 2,
  DECIMAL_PRECISION_3: 3,
  BINARY_BASE: 2,
  DECIMAL_BASE: 10,
  HEX_BASE: 16,
  MINUTES_SHORT: 5,
  MINUTES_MEDIUM: 10,
} as const;

// Constants
export const SUPPORTED_LANGUAGES: SupportedLanguages = {
  spanish: {
    code: 'es',
    name: 'Spanish',
    flag: '🇪🇸',
    articles: {
      masculine: 'el',
      feminine: 'la',
      masculinePlural: 'los',
      femininePlural: 'las'
    }
  },
  french: {
    code: 'fr',
    name: 'French',
    flag: '🇫🇷',
    articles: {
      masculine: 'le',
      feminine: 'la',
      plural: 'les',
      vowelStart: "l'"
    }
  },
  german: {
    code: 'de',
    name: 'German',
    flag: '🇩🇪',
    articles: {
      masculine: 'der',
      feminine: 'die',
      neuter: 'das',
      plural: 'die'
    },
    specialRules: {
      capitalizeNouns: true
    }
  }
} as const;

// Performance limits
export const PERFORMANCE_LIMITS: PerformanceLimits = {
  MAX_MEMORY_MB: 30,
  MAX_PROCESSING_TIME_MS: 50,
  MAX_PAGE_LOAD_IMPACT_MS: 100,
  MIN_CACHE_HIT_RATE: 0.9,
  MAX_API_TIMEOUT_MS: 2000,
  PERFORMANCE_GUARD_MS: 30,
  FRAME_BUDGET_MS: 16,
  IDLE_CALLBACK_TIMEOUT_MS: 100
} as const;

// Word selection configuration
export const WORD_CONFIG: WordConfig = {
  MIN_WORD_LENGTH: 4,
  MAX_WORD_LENGTH: 15,
  MIN_WORD_OCCURRENCES: 2,
  MAX_WORD_OCCURRENCES: 4,
  MAX_WORDS_PER_PAGE: 6,
  WORDS_PER_PARAGRAPH: 1,
  MIN_PARAGRAPH_LENGTH: 100
} as const;

// Note: Mock translations have been moved to development-only files
// and should not be included in production builds

// Import environment config
import { config } from './config';

// API Configuration
export const getApiEndpoint = (): string => {
  // Use injected WORKER_URL from build process
  return config.WORKER_URL;
};

export const API_CONFIG: ApiConfig = {
  // Cloudflare Worker endpoint (will be determined at runtime)
  get TRANSLATOR_API() {
    return getApiEndpoint();
  }
} as const;

// Storage keys
export const STORAGE_KEYS: StorageKeys = {
  USER_SETTINGS: 'fluent_settings',
  SITE_SETTINGS: 'fluent_site_settings',
  WORD_PROGRESS: 'fluent_word_progress',
  TRANSLATION_CACHE: 'fluent_translation_cache',
  CONTEXT_CACHE: 'fluent_context_cache',
  DAILY_STATS: 'fluent_daily_stats',
  DAILY_USAGE: 'fluent_daily_usage'
} as const;

// Default settings
export const DEFAULT_SETTINGS: DefaultSettings = {
  targetLanguage: 'spanish',
  wordCount: 6,
  difficulty: 'intermediate',
  enabled: true,
  enablePronunciation: true,
  enableContextHelper: true,
  pausedUntil: undefined
} as const;

// Timing constants
export const TIMING: TimingConstants = {
  TOOLTIP_SHOW_DELAY_MS: 200,
  TOOLTIP_HIDE_DELAY_MS: 300,
  SCROLL_DEBOUNCE_MS: 150,
  MUTATION_DEBOUNCE_MS: 500,
  PAUSE_DURATION_MS: 21600000, // 6 hours
  CONTEXT_CHECK_INTERVAL_MS: 5000,
  CACHE_CLEANUP_INTERVAL_MS: 300000, // 5 minutes
  ERROR_RESET_TIME_MS: 300000, // 5 minutes
  CIRCUIT_BREAKER_TIMEOUT_MS: 300000 // 5 minutes
} as const;

// Cache limits
export const CACHE_LIMITS: CacheLimits = {
  MEMORY_CACHE_MAX_ENTRIES: 1000,
  STORAGE_CACHE_MAX_ENTRIES: 5000,
  RECENT_ERRORS_MAX: 50,
  BLOOM_FILTER_SIZE: 10000,
  BLOOM_FILTER_HASHES: 4
} as const;

// UI constants
export const UI_CONSTANTS: UIConstants = {
  REPLACED_WORD_COLOR: '#3b82f6',
  MAX_TOOLTIP_WIDTH: 400,
  TOOLTIP_Z_INDEX: 9999,
  PAGE_CONTROL_Z_INDEX: 9998
} as const;

// Security constants
export const SECURITY: SecurityConstants = {
  MAX_MESSAGE_SIZE: 100000,
  MAX_STRING_LENGTH: 10000,
  MESSAGE_TIMEOUT_MS: 300000, // 5 minutes
  SALT_KEY: 'fluent_salt_v1',
  ENCRYPTION_ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  PBKDF2_ITERATIONS: 100000
} as const;

// Rate limits
export const RATE_LIMITS: RateLimits = {
  DAILY_WORDS: 100,
  DAILY_EXPLANATIONS: 100,
  API_CALLS_PER_MINUTE: 20,
  API_CALLS_PER_HOUR: 200
} as const;

interface AuthConstants {
  TOKEN_REFRESH_INTERVAL_MS: number;
  HTTP_STATUS: {
    OK: number;
    UNAUTHORIZED: number;
    FORBIDDEN: number;
    NOT_FOUND: number;
    SERVER_ERROR: number;
  };
  STORAGE_KEY: string;
}

export const AUTH_CONSTANTS: AuthConstants = {
  TOKEN_REFRESH_INTERVAL_MS: TIME.DAYS_PER_WEEK * TIME.MS_PER_DAY, // 7 days
  HTTP_STATUS: {
    OK: 200,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    SERVER_ERROR: 500
  },
  STORAGE_KEY: 'fluent_installation_auth'
} as const;

/**
 * Network and Retry Configuration
 * Controls retry behavior and timeouts for API calls
 */
interface NetworkConfig {
  RETRY_INITIAL_DELAY_MS: number;
  RETRY_MAX_DELAY_MS: number;
  RETRY_BACKOFF_MULTIPLIER: number;
  MAX_RETRY_COUNT: number;
  REQUEST_TIMEOUT_MS: number;
  CONNECTION_TIMEOUT_MS: number;
}

export const NETWORK: NetworkConfig = {
  /**
   * Initial delay before first retry attempt (milliseconds)
   * Lower = faster retry, but may overwhelm server
   * Higher = slower recovery from transient failures
   */
  RETRY_INITIAL_DELAY_MS: 1000,
  
  /**
   * Maximum delay between retries (milliseconds)
   * Prevents infinite backoff in long-running sessions
   */
  RETRY_MAX_DELAY_MS: 30000,
  
  /**
   * Multiplier for exponential backoff
   * Each retry waits previous_delay * multiplier
   */
  RETRY_BACKOFF_MULTIPLIER: 2,
  
  /**
   * Maximum number of retry attempts
   * Balance between reliability and giving up on persistent failures
   * Current: 3 attempts total (initial + 2 retries)
   */
  MAX_RETRY_COUNT: 3,
  
  /**
   * Request timeout (milliseconds)
   * Must be less than Chrome's 60-second extension timeout
   * Should be greater than typical translation API response time (~2s)
   */
  REQUEST_TIMEOUT_MS: 10000,
  
  /**
   * Connection establishment timeout (milliseconds)
   * How long to wait for initial connection
   */
  CONNECTION_TIMEOUT_MS: 5000,
} as const;

/**
 * Monitoring and Lifecycle Configuration
 * Controls health checks, memory monitoring, and component lifecycles
 */
interface MonitoringConfig {
  MEMORY_CHECK_INTERVAL_MS: number;
  MEMORY_WARNING_THRESHOLD_MB: number;
  MEMORY_CRITICAL_THRESHOLD_MB: number;
  STATE_RESTORE_TIMEOUT_MS: number;
  MAX_LIFETIME_MS: number;
  INACTIVITY_TIMEOUT_MS: number;
  CHROME_INACTIVITY_LIMIT_MS: number;
  CHROME_KEEPALIVE_INTERVAL_MS: number;
  CHROME_ALARM_MIN_PERIOD_MINUTES: number;
}

export const MONITORING: MonitoringConfig = {
  /**
   * How often to check memory usage (milliseconds)
   * More frequent = earlier detection, slight performance cost
   */
  MEMORY_CHECK_INTERVAL_MS: 5000,
  
  /**
   * Memory usage warning threshold (MB)
   * Log warning when approaching Chrome's limits
   */
  MEMORY_WARNING_THRESHOLD_MB: 20,
  
  /**
   * Memory usage critical threshold (MB)
   * Start aggressive cleanup to avoid Chrome killing extension
   */
  MEMORY_CRITICAL_THRESHOLD_MB: 28,
  
  /**
   * How long to wait for state restoration (milliseconds)
   * Prevents hanging on corrupted state
   */
  STATE_RESTORE_TIMEOUT_MS: 300000, // 5 minutes
  
  /**
   * Maximum component lifetime before forced restart (milliseconds)
   * Prevents memory leaks from long-running components
   */
  MAX_LIFETIME_MS: 300000, // 5 minutes
  
  /**
   * Inactivity timeout before component cleanup (milliseconds)
   * Frees resources when user is idle
   */
  INACTIVITY_TIMEOUT_MS: 300000, // 5 minutes
  
  /**
   * Chrome's hard limit for service worker inactivity (milliseconds)
   */
  CHROME_INACTIVITY_LIMIT_MS: 30000, // 30 seconds
  
  /**
   * Keepalive interval to prevent Chrome from killing service worker (milliseconds)
   * Must be less than CHROME_INACTIVITY_LIMIT_MS
   */
  CHROME_KEEPALIVE_INTERVAL_MS: 20000, // 20 seconds
  
  /**
   * Chrome's minimum alarm period (minutes)
   */
  CHROME_ALARM_MIN_PERIOD_MINUTES: 1,
} as const;

/**
 * Queue and Batch Processing Configuration
 * Controls how work is batched and processed
 */
interface ProcessingConfig {
  MAX_BATCH_SIZE: number;
  MAX_QUEUE_SIZE: number;
  MAX_CONCURRENT_OPERATIONS: number;
  CHUNK_PROCESSING_SIZE: number;
  CHUNK_TIMEOUT_MS: number;
  IDLE_CALLBACK_TIMEOUT_MS: number;
}

export const PROCESSING: ProcessingConfig = {
  /**
   * Maximum items to process in a single batch
   * Balance between efficiency and memory usage
   */
  MAX_BATCH_SIZE: 100,
  
  /**
   * Maximum items queued before dropping oldest
   * Prevents unbounded memory growth
   */
  MAX_QUEUE_SIZE: 50,
  
  /**
   * Maximum concurrent async operations
   * Prevents overwhelming browser/API
   */
  MAX_CONCURRENT_OPERATIONS: 100,
  
  /**
   * Items to process per animation frame
   * Keeps UI responsive during heavy processing
   */
  CHUNK_PROCESSING_SIZE: 10,
  
  /**
   * Maximum time per processing chunk (milliseconds)
   * Ensures other tasks get CPU time
   */
  CHUNK_TIMEOUT_MS: 50,
  
  /**
   * Timeout for requestIdleCallback (milliseconds)
   * Maximum wait before forcing execution
   */
  IDLE_CALLBACK_TIMEOUT_MS: 50,
} as const;

/**
 * Extended UI Dimensions
 * Additional pixel values for consistent UI sizing
 * Supplements existing UI_CONSTANTS
 */
interface UIDimensionsExtended {
  TOOLTIP_WIDTH_MIN_PX: number;
  TOOLTIP_WIDTH_MAX_PX: number;
  TOOLTIP_PADDING_VERTICAL_PX: number;
  TOOLTIP_PADDING_HORIZONTAL_PX: number;
  ICON_SIZE_SMALL_PX: number;
  ICON_SIZE_MEDIUM_PX: number;
  ICON_SIZE_LARGE_PX: number;
  MODAL_PADDING_PX: number;
  ZINDEX_MODAL: number;
  ZINDEX_NOTIFICATION: number;
  ZINDEX_MAX: number;
}

export const UI_DIMENSIONS_EXTENDED: UIDimensionsExtended = {
  /**
   * Minimum tooltip width (pixels)
   * Ensures readability for short translations
   */
  TOOLTIP_WIDTH_MIN_PX: 280,
  
  /**
   * Maximum tooltip width (pixels)
   * Prevents tooltips from dominating viewport
   */
  TOOLTIP_WIDTH_MAX_PX: 360,
  
  /**
   * Vertical padding for tooltip content (pixels)
   * Provides comfortable reading space
   */
  TOOLTIP_PADDING_VERTICAL_PX: 16,
  
  /**
   * Horizontal padding for tooltip content (pixels)
   * Prevents text from touching edges
   */
  TOOLTIP_PADDING_HORIZONTAL_PX: 24,
  
  /**
   * Small icon size (pixels)
   * Used for inline UI elements
   */
  ICON_SIZE_SMALL_PX: 24,
  
  /**
   * Medium icon size (pixels)
   * Used for buttons and controls
   */
  ICON_SIZE_MEDIUM_PX: 42,
  
  /**
   * Large icon size (pixels)
   * Used for main widget button
   */
  ICON_SIZE_LARGE_PX: 56,
  
  /**
   * Standard modal padding (pixels)
   * Consistent spacing for all modals
   */
  MODAL_PADDING_PX: 16,
  
  /**
   * Z-index for modal overlays
   * Above page content but below tooltips
   */
  ZINDEX_MODAL: 1000,
  
  /**
   * Z-index for notifications
   * Above modals but below critical UI
   */
  ZINDEX_NOTIFICATION: 10000,
  
  /**
   * Maximum possible z-index
   * Chrome's maximum value (2^31 - 1)
   */
  ZINDEX_MAX: 2147483647,
} as const;

/**
 * Spaced Repetition System Configuration
 * Controls the learning algorithm parameters
 */
interface SRSConfig {
  INTERVALS_DAYS: readonly number[];
  EASE_FACTOR_MIN: number;
  EASE_FACTOR_DEFAULT: number;
  QUALITY_THRESHOLD_PASS: number;
  MAX_NEW_WORDS_PER_SESSION: number;
  MAX_REVIEW_WORDS_PER_SESSION: number;
  MASTERY_CALCULATION_WEIGHTS: {
    CORRECT_RATIO: number;
    INTERVAL: number;
    REPETITIONS: number;
  };
}

export const SRS: SRSConfig = {
  /**
   * Review intervals in days
   * Based on SuperMemo 2 algorithm
   */
  INTERVALS_DAYS: [ARRAY.SINGLE_ITEM, ARRAY.TRIPLE_SIZE, TIME_UNITS.DAYS_IN_WEEK, TIME_UNITS.DAYS_IN_WEEK * ARRAY.PAIR_SIZE, TIME_UNITS.DAYS_IN_MONTH] as const,
  
  /**
   * Minimum ease factor
   * Prevents intervals from shrinking too much
   */
  EASE_FACTOR_MIN: 1.3,
  
  /**
   * Default ease factor for new words
   * Starting difficulty assumption
   */
  EASE_FACTOR_DEFAULT: 2.5,
  
  /**
   * Quality rating threshold for passing
   * Ratings >= this value increase interval
   */
  QUALITY_THRESHOLD_PASS: 3,
  
  /**
   * Maximum new words per learning session
   * Prevents cognitive overload
   */
  MAX_NEW_WORDS_PER_SESSION: 3,
  
  /**
   * Maximum review words per session
   * Balances review with new learning
   */
  MAX_REVIEW_WORDS_PER_SESSION: 10,
  
  /**
   * Weights for calculating mastery percentage
   * Must sum to 1.0
   */
  MASTERY_CALCULATION_WEIGHTS: {
    CORRECT_RATIO: 0.4,
    INTERVAL: 0.3,
    REPETITIONS: 0.3,
  },
} as const;

/**
 * Extended Rate Limits
 * Additional rate limiting configurations
 * Supplements existing RATE_LIMITS
 */
interface RateLimitsExtended {
  TRANSLATIONS_PER_SECOND: number;
  TRANSLATIONS_PER_MINUTE: number;
  TRANSLATIONS_PER_HOUR: number;
  TRANSLATIONS_PER_DAY: number;
  EXPLANATIONS_PER_HOUR: number;
  EXPLANATIONS_PER_DAY: number;
}

export const RATE_LIMITS_EXTENDED: RateLimitsExtended = {
  /**
   * Translations per second
   * Prevents burst requests
   */
  TRANSLATIONS_PER_SECOND: 2,
  
  /**
   * Translations per minute
   * Smooths out usage patterns
   */
  TRANSLATIONS_PER_MINUTE: 20,
  
  /**
   * Translations per hour
   * Primary rate limit for free tier
   */
  TRANSLATIONS_PER_HOUR: 100,
  
  /**
   * Translations per day
   * Daily quota for free users
   */
  TRANSLATIONS_PER_DAY: 1000,
  
  /**
   * Context explanations per hour
   * Claude API is more expensive
   */
  EXPLANATIONS_PER_HOUR: 10,
  
  /**
   * Context explanations per day
   * Daily quota for AI features
   */
  EXPLANATIONS_PER_DAY: 100,
} as const;

/**
 * Crypto Constants
 * Cryptographic and security-related constants
 */
interface CryptoConstants {
  IV_LENGTH: number;
  TAG_LENGTH: number;
  SALT_LENGTH: number;
  KEY_DERIVATION_ITERATIONS: number;
}

export const CRYPTO: CryptoConstants = {
  IV_LENGTH: 16,
  TAG_LENGTH: 12,
  SALT_LENGTH: 16,
  KEY_DERIVATION_ITERATIONS: 100000,
} as const;

/**
 * UI Animation Constants
 * Animation and transition timing
 */
interface AnimationConstants {
  FADE_DURATION_MS: number;
  SLIDE_DURATION_MS: number;
  DEBOUNCE_DELAY_MS: number;
  THROTTLE_DELAY_MS: number;
  NOTIFICATION_DURATION_MS: number;
  PROGRESS_UPDATE_INTERVAL_MS: number;
}

export const ANIMATION: AnimationConstants = {
  FADE_DURATION_MS: 200,
  SLIDE_DURATION_MS: 300,
  DEBOUNCE_DELAY_MS: 150,
  THROTTLE_DELAY_MS: 100,
  NOTIFICATION_DURATION_MS: 3000,
  PROGRESS_UPDATE_INTERVAL_MS: 100,
} as const;

/**
 * Quality Rating Constants
 * For SRS and learning algorithms
 */
interface QualityConstants {
  RATING_POOR: number;
  RATING_FAIR: number;
  RATING_GOOD: number;
  RATING_GREAT: number;
  RATING_PERFECT: number;
}

export const QUALITY: QualityConstants = {
  RATING_POOR: 1,
  RATING_FAIR: 2,
  RATING_GOOD: 3,
  RATING_GREAT: 4,
  RATING_PERFECT: 5,
} as const;

/**
 * HTTP Status Constants
 * Common HTTP status codes
 */
interface HttpStatusConstants {
  OK: number;
  BAD_REQUEST: number;
  UNAUTHORIZED: number;
  FORBIDDEN: number;
  NOT_FOUND: number;
  REQUEST_TIMEOUT: number;
  TOO_MANY_REQUESTS: number;
  INTERNAL_SERVER_ERROR: number;
  BAD_GATEWAY: number;
  SERVICE_UNAVAILABLE: number;
  GATEWAY_TIMEOUT: number;
}

export const HTTP_STATUS: HttpStatusConstants = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * Math Constants
 * Mathematical constants and factors
 */
interface MathConstants {
  PERCENTAGE_FACTOR: number;
  EASE_FACTOR_INCREASE: number;
  EASE_FACTOR_DECREASE: number;
  MASTERY_THRESHOLD: number;
  DIFFICULTY_EASY_FACTOR: number;
  DIFFICULTY_HARD_FACTOR: number;
}

export const MATH: MathConstants = {
  PERCENTAGE_FACTOR: 0.01,
  EASE_FACTOR_INCREASE: 0.1,
  EASE_FACTOR_DECREASE: 0.2,
  MASTERY_THRESHOLD: 0.8,
  DIFFICULTY_EASY_FACTOR: 0.08,
  DIFFICULTY_HARD_FACTOR: 0.02,
} as const;

/**
 * Storage Size Constants
 * File and storage size limits
 */
interface StorageSizeConstants {
  MAX_CACHE_SIZE_BYTES: number;
  MAX_FILE_SIZE_BYTES: number;
  CHUNK_SIZE_BYTES: number;
  COMPRESSION_THRESHOLD_BYTES: number;
}

export const STORAGE_SIZE: StorageSizeConstants = {
  MAX_CACHE_SIZE_BYTES: NUMERIC.DECIMAL_BASE * NUMERIC.BYTES_PER_MB,  // 10MB - standard file size
  MAX_FILE_SIZE_BYTES: NUMERIC.MINUTES_SHORT * NUMERIC.BYTES_PER_MB,    // 5MB - standard file size
  CHUNK_SIZE_BYTES: NUMERIC.PERCENTAGE_MAX * NUMERIC.BYTES_PER_KB,            // 100KB - standard chunk size
  COMPRESSION_THRESHOLD_BYTES: NUMERIC.DECIMAL_BASE * NUMERIC.BYTES_PER_KB,   // 10KB - standard threshold
} as const;

/**
 * Threshold Constants
 * Various threshold values
 */
interface ThresholdConstants {
  MIN_CONFIDENCE_SCORE: number;
  MIN_RELEVANCE_SCORE: number;
  MAX_ERROR_COUNT: number;
  WARNING_THRESHOLD: number;
  CRITICAL_THRESHOLD: number;
  LOW_USAGE_THRESHOLD: number;
}

export const THRESHOLD: ThresholdConstants = {
  MIN_CONFIDENCE_SCORE: 0.7,
  MIN_RELEVANCE_SCORE: 0.5,
  MAX_ERROR_COUNT: 10,
  WARNING_THRESHOLD: 80,
  CRITICAL_THRESHOLD: 90,
  LOW_USAGE_THRESHOLD: 20,
} as const;

/**
 * Test Constants
 * Values specifically for test files
 */
interface TestConstants {
  // Timing
  DEFAULT_TIMEOUT_MS: number;
  SHORT_TIMEOUT_MS: number;
  LONG_TIMEOUT_MS: number;
  ANIMATION_WAIT_MS: number;
  DEBOUNCE_WAIT_MS: number;
  
  // Test data sizes
  SMALL_DATASET_SIZE: number;
  MEDIUM_DATASET_SIZE: number;
  LARGE_DATASET_SIZE: number;
  
  // Mock values
  MOCK_USER_ID: number;
  MOCK_DELAY_MS: number;
  MOCK_RETRY_COUNT: number;
  
  // Thresholds
  PERFORMANCE_THRESHOLD_MS: number;
  MEMORY_THRESHOLD_MB: number;
  
  // Array test sizes
  EMPTY_ARRAY_LENGTH: number;
  SINGLE_ITEM_ARRAY: number;
  SMALL_ARRAY_SIZE: number;
  MEDIUM_ARRAY_SIZE: number;
  LARGE_ARRAY_SIZE: number;
  
  // Network simulation
  SLOW_NETWORK_DELAY_MS: number;
  NETWORK_ERROR_RATE: number;
  
  // Loop iterations
  STRESS_TEST_ITERATIONS: number;
  PERFORMANCE_TEST_RUNS: number;
  
  // Magic test values
  TEST_NEGATIVE_VALUE: number;
  TEST_MULTIPLIER: number;
  TEST_DIVISOR: number;
  TEST_PERCENTAGE: number;
}

export const TEST_CONSTANTS: TestConstants = {
  // Timing
  DEFAULT_TIMEOUT_MS: 5000,
  SHORT_TIMEOUT_MS: 1000,
  LONG_TIMEOUT_MS: 10000,
  ANIMATION_WAIT_MS: 300,
  DEBOUNCE_WAIT_MS: 150,
  
  // Test data sizes
  SMALL_DATASET_SIZE: 10,
  MEDIUM_DATASET_SIZE: 100,
  LARGE_DATASET_SIZE: 1000,
  
  // Mock values
  MOCK_USER_ID: 12345,
  MOCK_DELAY_MS: 100,
  MOCK_RETRY_COUNT: 3,
  
  // Thresholds
  PERFORMANCE_THRESHOLD_MS: 50,
  MEMORY_THRESHOLD_MB: 30,
  
  // Array test sizes
  EMPTY_ARRAY_LENGTH: 0,
  SINGLE_ITEM_ARRAY: 1,
  SMALL_ARRAY_SIZE: 5,
  MEDIUM_ARRAY_SIZE: 50,
  LARGE_ARRAY_SIZE: 500,
  
  // Network simulation
  SLOW_NETWORK_DELAY_MS: 2000,
  NETWORK_ERROR_RATE: 0.1,
  
  // Loop iterations
  STRESS_TEST_ITERATIONS: 1000,
  PERFORMANCE_TEST_RUNS: 100,
  
  // Magic test values
  TEST_NEGATIVE_VALUE: -500,
  TEST_MULTIPLIER: 2,
  TEST_DIVISOR: 10,
  TEST_PERCENTAGE: 75,
} as const;

/**
 * Domain-specific Constants
 * Business logic specific values
 */
interface DomainConstants {
  // Days for statistics
  STATS_RETENTION_DAYS: number;
  STATS_WEEK_DAYS: number;
  STATS_MONTH_DAYS: number;
  STATS_CLEANUP_DAYS: number;
  
  // UI Offsets
  TOOLTIP_OFFSET_PX: number;
  SCROLL_OFFSET_PX: number;
  NEGATIVE_SCROLL_OFFSET_PX: number;
  
  // Precision
  FLOAT_PRECISION_PLACES: number;
  PERCENTAGE_PRECISION: number;
  
  // Limits
  MIN_TEXT_LENGTH: number;
  MAX_TEXT_LENGTH: number;
  MIN_ELEMENTS: number;
  MAX_ELEMENTS: number;
  
  // Factors and multipliers
  BACKOFF_FACTOR: number;
  GROWTH_FACTOR: number;
  SHRINK_FACTOR: number;
  HALF_FACTOR: number;
  DOUBLE_FACTOR: number;
  
  // Word processing
  WORD_PADDING_CHARS: number;
  MIN_WORD_SPACING: number;
  MAX_WORD_SPACING: number;
  
  // Error handling
  MAX_CONSECUTIVE_ERRORS: number;
  ERROR_BACKOFF_MS: number;
  
  // DOM processing
  MIN_NODE_LENGTH: number;
  MAX_NODE_DEPTH: number;
  NODE_BATCH_SIZE: number;
}

export const DOMAIN: DomainConstants = {
  // Days for statistics
  STATS_RETENTION_DAYS: 7,
  STATS_WEEK_DAYS: TIME_UNITS.DAYS_IN_WEEK,
  STATS_MONTH_DAYS: TIME_UNITS.DAYS_IN_MONTH,
  STATS_CLEANUP_DAYS: TIME_UNITS.DAYS_IN_MONTH * ARRAY.TRIPLE_SIZE,
  
  // UI Offsets
  TOOLTIP_OFFSET_PX: 10,
  SCROLL_OFFSET_PX: 30,
  NEGATIVE_SCROLL_OFFSET_PX: -30,
  
  // Precision
  FLOAT_PRECISION_PLACES: 2,
  PERCENTAGE_PRECISION: 3,
  
  // Limits
  MIN_TEXT_LENGTH: 3,
  MAX_TEXT_LENGTH: 1000,
  MIN_ELEMENTS: 1,
  MAX_ELEMENTS: 100,
  
  // Factors and multipliers
  BACKOFF_FACTOR: 2,
  GROWTH_FACTOR: 1.5,
  SHRINK_FACTOR: 0.8,
  HALF_FACTOR: 0.5,
  DOUBLE_FACTOR: 2,
  
  // Word processing
  WORD_PADDING_CHARS: 2,
  MIN_WORD_SPACING: 1,
  MAX_WORD_SPACING: 3,
  
  // Error handling
  MAX_CONSECUTIVE_ERRORS: 5,
  ERROR_BACKOFF_MS: TIME_UNITS.MS_IN_SECOND,
  
  // DOM processing
  MIN_NODE_LENGTH: 20,
  MAX_NODE_DEPTH: 10,
  NODE_BATCH_SIZE: 50,
} as const;

/**
 * Sampling and Probability Constants
 * For monitoring, telemetry, and random selection
 */
interface SamplingConstants {
  // Sentry sampling rates
  TRACE_SAMPLE_RATE_LOW: number;
  TRACE_SAMPLE_RATE_MEDIUM: number;
  TRACE_SAMPLE_RATE_HIGH: number;
  TRACE_SAMPLE_RATE_CRITICAL: number;
  TRACE_SAMPLE_RATE_BACKGROUND: number;
  
  // Network and timing
  JITTER_FACTOR: number;
  
  // UI shadow alphas
  SHADOW_ALPHA_SUBTLE: number;
  SHADOW_ALPHA_LIGHT: number;
  SHADOW_ALPHA_MEDIUM: number;
  SHADOW_ALPHA_STRONG: number;
}

export const SAMPLING: SamplingConstants = {
  // Sentry sampling rates
  TRACE_SAMPLE_RATE_LOW: 0.05,       // 5% - high volume, low priority
  TRACE_SAMPLE_RATE_MEDIUM: 0.1,     // 10% - medium volume
  TRACE_SAMPLE_RATE_HIGH: 0.2,       // 20% - important operations
  TRACE_SAMPLE_RATE_CRITICAL: 0.5,   // 50% - low volume, user-facing
  TRACE_SAMPLE_RATE_BACKGROUND: 0.1, // 10% - background operations
  
  // Network and timing
  JITTER_FACTOR: 0.1,               // 10% jitter for retry delays
  
  // UI shadow alphas
  SHADOW_ALPHA_SUBTLE: 0.04,
  SHADOW_ALPHA_LIGHT: 0.05,
  SHADOW_ALPHA_MEDIUM: 0.06,
  SHADOW_ALPHA_STRONG: 0.1,
} as const;

/**
 * Data Processing Limits
 * For sanitization, truncation, and memory management
 */
interface ProcessingLimits {
  // String and data limits
  MAX_STRING_LENGTH: number;
  MAX_ARRAY_LENGTH: number;
  MAX_OBJECT_DEPTH: number;
  MAX_BREADCRUMB_COUNT: number;
  BREADCRUMB_SLICE_OFFSET: number;
  
  // Sanitization
  REDACTION_PREFIX_LENGTH: number;
  SANITIZATION_PREFIX_LENGTH: number;
  
  // Memory operations
  LARGE_ARRAY_SIZE: number;
  MAX_PAYLOAD_KB: number;
  
  // Concurrency
  DEFAULT_MAX_CONCURRENT: number;
  
  // Time thresholds
  SLOW_OPERATION_THRESHOLD_MS: number;
  CLEANUP_INTERVAL_MS: number;
}

export const PROCESSING_LIMITS: ProcessingLimits = {
  // String and data limits
  MAX_STRING_LENGTH: 1000,
  MAX_ARRAY_LENGTH: 10,
  MAX_OBJECT_DEPTH: 3,
  MAX_BREADCRUMB_COUNT: 10,
  BREADCRUMB_SLICE_OFFSET: -10,
  
  // Sanitization
  REDACTION_PREFIX_LENGTH: 3,
  SANITIZATION_PREFIX_LENGTH: 3,
  
  // Memory operations
  LARGE_ARRAY_SIZE: 1000000,  // 1 million elements for memory pressure
  MAX_PAYLOAD_KB: 200,         // 200KB limit
  
  // Concurrency
  DEFAULT_MAX_CONCURRENT: 3,
  
  // Time thresholds
  SLOW_OPERATION_THRESHOLD_MS: 1000,
  CLEANUP_INTERVAL_MS: 60000,  // 1 minute
} as const;

/**
 * Cost and Pricing Constants
 * For API usage and billing calculations
 */
interface CostConstants {
  // API costs
  COST_PER_MINUTE_USD: number;
  COST_PER_DAY_USD: number;
}

export const COST: CostConstants = {
  // API costs
  COST_PER_MINUTE_USD: 0.10,
  COST_PER_DAY_USD: 10.00,
} as const;

/**
 * Chrome Extension Specific Constants
 * Chrome API and extension-specific values
 */
interface ChromeConstants {
  // Chrome alarm periods
  ALARM_PERIOD_MIN_MINUTES: number;
  ALARM_PERIOD_KEEPALIVE_MINUTES: number;
  
  // Chrome storage
  STORAGE_QUOTA_BYTES: number;
  STORAGE_WARNING_THRESHOLD: number;
  
  // Chrome messaging
  MESSAGE_PORT_TIMEOUT_MS: number;
  PORT_RECONNECT_DELAY_MS: number;
  
  // Extension lifecycle
  INSTALL_DELAY_MS: number;
  UPDATE_CHECK_INTERVAL_MS: number;
}

export const CHROME: ChromeConstants = {
  // Chrome alarm periods
  ALARM_PERIOD_MIN_MINUTES: 1,
  ALARM_PERIOD_KEEPALIVE_MINUTES: 0.5, // 30 seconds
  
  // Chrome storage
  STORAGE_QUOTA_BYTES: NUMERIC.DECIMAL_BASE * NUMERIC.BYTES_PER_MB, // 10MB
  STORAGE_WARNING_THRESHOLD: 0.9, // 90%
  
  // Chrome messaging
  MESSAGE_PORT_TIMEOUT_MS: 5000,
  PORT_RECONNECT_DELAY_MS: 100,
  
  // Extension lifecycle
  INSTALL_DELAY_MS: 1000,
  UPDATE_CHECK_INTERVAL_MS: TIME.MS_PER_HOUR, // 1 hour
} as const;

// Type exports for use in other files
export type TargetLanguage = keyof typeof SUPPORTED_LANGUAGES;
export type Difficulty = DefaultSettings['difficulty'];
export type { Language, LanguageArticles, LanguageSpecialRules };