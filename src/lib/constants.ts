// Shared constants and configuration

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
}

interface DefaultSettings {
  targetLanguage: keyof SupportedLanguages;
  wordCount: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  enabled: boolean;
  enablePronunciation: boolean;
  enableContextHelper: boolean;
  pausedUntil: number | null;
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
  FREE_DAILY_WORDS: number;
  CONTEXT_PER_DAY: number;
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

// API Configuration
export const getApiEndpoint = (): string => {
  // Check if we're in development mode at runtime
  try {
    const manifest = chrome.runtime.getManifest();
    const isDev = manifest.version.includes('dev') || 
                  manifest.version.includes('0.0.0');
    
    return isDev
      ? 'https://fluent-translator.dev.workers.dev'
      : 'https://fluent-translator.hq.workers.dev';
  } catch {
    // Fallback if chrome.runtime is not available
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
  DAILY_STATS: 'fluent_daily_stats'
} as const;

// Default settings
export const DEFAULT_SETTINGS: DefaultSettings = {
  targetLanguage: 'spanish',
  wordCount: 6,
  difficulty: 'intermediate',
  enabled: true,
  enablePronunciation: true,
  enableContextHelper: true,
  pausedUntil: null
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
  FREE_DAILY_WORDS: 50,
  CONTEXT_PER_DAY: 3,
  API_CALLS_PER_MINUTE: 20,
  API_CALLS_PER_HOUR: 200
} as const;

// Type exports for use in other files
export type TargetLanguage = keyof typeof SUPPORTED_LANGUAGES;
export type Difficulty = DefaultSettings['difficulty'];
export type { Language, LanguageArticles, LanguageSpecialRules };