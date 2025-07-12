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

// Try to import build config (generated at build time)
let BUILD_CONFIG: any = null;
try {
  // This will fail if the file doesn't exist (local dev without build script)
  BUILD_CONFIG = require('../generated/build-config').BUILD_CONFIG;
} catch {
  // Fallback to defaults
}

// API Configuration
export const getApiEndpoint = (): string => {
  // Use build-time config if available (production builds)
  if (BUILD_CONFIG) {
    try {
      const manifest = chrome.runtime.getManifest();
      const version = manifest.version;
      
      if (version.includes('dev') || version.includes('0.0.0')) {
        return BUILD_CONFIG.DEVELOPMENT_API;
      }
      return BUILD_CONFIG.PRODUCTION_API;
    } catch {
      // Fallback to legacy URL for backward compatibility
      return 'https://fluent-translator.hq.workers.dev';
    }
  }
  
  // Fallback to hardcoded values (local development)
  try {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    
    // Development builds (version contains 'dev' or is 0.0.0)
    if (version.includes('dev') || version.includes('0.0.0')) {
      return 'https://translator-dev.hq.workers.dev';
    }
    
    // Production builds
    return 'https://translator.hq.workers.dev';
  } catch {
    // Fallback if chrome.runtime is not available
    // Keep existing URL for backward compatibility
    return 'https://fluent-translator.hq.workers.dev';
  }
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
  TOKEN_REFRESH_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  HTTP_STATUS: {
    OK: 200,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    SERVER_ERROR: 500
  },
  STORAGE_KEY: 'fluent_installation_auth'
} as const;

// Type exports for use in other files
export type TargetLanguage = keyof typeof SUPPORTED_LANGUAGES;
export type Difficulty = DefaultSettings['difficulty'];
export type { Language, LanguageArticles, LanguageSpecialRules };