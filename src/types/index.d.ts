// Type definitions for Fluent Chrome Extension

export interface SupportedLanguage {
  code: string;
  name: string;
  flag: string;
  articles: {
    masculine?: string;
    feminine?: string;
    neuter?: string;
    plural?: string;
    masculinePlural?: string;
    femininePlural?: string;
    vowelStart?: string;
  };
  specialRules?: {
    capitalizeNouns?: boolean;
  };
}

export type LanguageCode = 'spanish' | 'french' | 'german';

export interface UserSettings {
  targetLanguage: LanguageCode;
  wordCount: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  enabled: boolean;
  enablePronunciation?: boolean;
  enableContextHelper?: boolean;
  pausedUntil?: number;
  apiKey?: string;
}

export interface SiteSettings {
  enabled: boolean;
  customWordCount?: number;
}

export interface Translation {
  [word: string]: string;
}

export interface TranslationResult {
  translations: Translation;
  error?: string;
  limitReached?: boolean;
  stats?: TranslationStats;
}

export interface TranslationStats {
  hits: number;
  misses: number;
  apiCalls: number;
  hitRate: number;
  memoryCacheSize: number;
  dailyUsage?: number;
}

export interface WordProgress {
  word: string;
  language: LanguageCode;
  encounters: number;
  lastSeen: number;
  nextReview: number;
  mastery: number;
  interactions: {
    hover: number;
    pronunciation: number;
    context: number;
  };
}

export interface ReplacementData {
  index: number;
  length: number;
  original: string;
  translation: string;
}

export interface ProcessingContext {
  startTime: number;
  replacementCount: number;
  processedPositions: Set<string>;
}

export interface CostLimits {
  perMinute: { cost: number; calls: number };
  perHour: { cost: number; calls: number };
  perDay: { cost: number; calls: number };
  perMonth: { cost: number; calls: number };
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  resetIn?: number;
  remaining?: number;
  period?: string;
}

export interface ContextExplanation {
  explanation: string;
  example?: string;
  tip?: string;
  alternatives?: string[];
}

export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  errorCount: number;
}

export interface MessageRequest {
  type: string;
  [key: string]: any;
}

export interface MessageResponse {
  data?: any;
  error?: string;
  secure?: boolean;
}

export interface StorageCache {
  translations: Translation;
  lastUpdated: number;
  timestamps?: { [key: string]: number };
}

export interface DailyStats {
  wordsLearned: number;
  pagesVisited: number;
  timeSpent: number;
  languages: Record<string, number>;
}

export interface SiteConfig {
  contentSelector: string;
  skipSelectors: string[];
  useMutationObserver?: boolean;
  wordsPerPage?: number;
}