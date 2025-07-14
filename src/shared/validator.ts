// Validator Module - Input validation and sanitization
'use strict';

import type { LanguageCode, UserSettings, SiteSettings } from './types';
import { 
  VALIDATION_LIMITS, 
  VALIDATION_PATTERNS, 
  ENCODING_CHECKS,
  LANGUAGE_VALIDATORS,
  type LanguageValidator 
} from './validation';
import { safeSync } from './utils/helpers';
import { THRESHOLD, QUALITY } from './constants';

interface SettingsBounds {
  wordsPerPage: {
    min: number;
    max: number;
    default: number;
  };
  wordDifficulty: {
    values: readonly ('beginner' | 'intermediate' | 'advanced')[];
    default: 'beginner' | 'intermediate' | 'advanced';
  };
}

export class Validator {
  private readonly validLanguages: Set<string>;
  private readonly settingsBounds: SettingsBounds;

  constructor() {
    // Valid language codes
    this.validLanguages = new Set(['spanish', 'french', 'german']);
    
    // Settings bounds
    this.settingsBounds = {
      wordsPerPage: { min: 1, max: VALIDATION_LIMITS.MAX_WORDS_PER_PAGE, default: 6 },
      wordDifficulty: { values: ['beginner', 'intermediate', 'advanced'] as const, default: 'intermediate' }
    };
  }

  // Sanitize text content for safe display
  sanitizeText(text: unknown): string {
    if (typeof text !== 'string') return '';
    
    // Check encoding
    if (!ENCODING_CHECKS.isValidUTF8(text)) {
      return '';
    }
    
    // Normalize Unicode
    let normalized = ENCODING_CHECKS.normalizeUnicode(text);
    
    // Remove invisible/control characters
    normalized = ENCODING_CHECKS.sanitizeInvisibleChars(normalized);
    
    // Check for injection patterns
    if (VALIDATION_PATTERNS.SQL_INJECTION.test(normalized) || 
        VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
      return '';
    }
    
    // Remove any HTML tags
    const textOnly = normalized.replace(/<[^>]*>/g, '');
    
    // Escape HTML entities without using document (for service worker compatibility)
    const sanitized = textOnly
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    // Limit length
    return sanitized.length > VALIDATION_LIMITS.TEXT_CONTENT_MAX_LENGTH 
      ? sanitized.substring(0, VALIDATION_LIMITS.TEXT_CONTENT_MAX_LENGTH) + '...' 
      : sanitized;
  }

  // Validate language code
  validateLanguage(language: unknown): LanguageCode {
    if (typeof language !== 'string') return 'spanish';
    const lowercased = language.toLowerCase().trim();
    return this.validLanguages.has(lowercased) ? lowercased as LanguageCode : 'spanish';
  }

  // Validate word for translation
  validateWord(word: unknown, targetLanguage?: LanguageCode): string | null {
    if (typeof word !== 'string') return null;
    
    // Check encoding
    if (!ENCODING_CHECKS.isValidUTF8(word)) {
      return null;
    }
    
    // Normalize and clean
    let normalized = ENCODING_CHECKS.normalizeUnicode(word.trim());
    normalized = ENCODING_CHECKS.sanitizeInvisibleChars(normalized);
    
    // Check for homograph attacks
    if (ENCODING_CHECKS.containsHomographs(normalized)) {
      return null;
    }
    
    // Check for injection patterns
    if (VALIDATION_PATTERNS.SQL_INJECTION.test(normalized) || 
        VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
      return null;
    }
    
    // Check length
    const maxLength = targetLanguage && LANGUAGE_VALIDATORS[targetLanguage as LanguageValidator]
      ? LANGUAGE_VALIDATORS[targetLanguage as LanguageValidator].maxWordLength
      : VALIDATION_LIMITS.WORD_MAX_LENGTH;
      
    if (normalized.length < VALIDATION_LIMITS.WORD_MIN_LENGTH || normalized.length > maxLength) {
      return null;
    }
    
    // Check pattern - use Unicode pattern for better international support
    if (!VALIDATION_PATTERNS.WORD_UNICODE.test(normalized)) {
      return null;
    }
    
    // Check for common non-translatable words
    const skipWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'as', 'by', 'with', 'from', 'up', 'down', 'is', 'are', 'was', 'were'
    ]);
    
    if (skipWords.has(normalized.toLowerCase())) {
      return null;
    }
    
    return normalized;
  }

  // Validate array of words
  validateWordList(words: unknown, targetLanguage?: LanguageCode): string[] {
    if (!Array.isArray(words)) return [];
    
    // Check array size first
    if (words.length > VALIDATION_LIMITS.MAX_WORDS_PER_REQUEST) {
      words = words.slice(0, VALIDATION_LIMITS.MAX_WORDS_PER_REQUEST);
    }
    
    const validated = [];
    const seen = new Set();
    
    for (const word of words as any[]) {
      const validWord = this.validateWord(word, targetLanguage);
      if (validWord && !seen.has(validWord.toLowerCase())) {
        validated.push(validWord);
        seen.add(validWord.toLowerCase());
      }
      
      // Limit to reasonable number
      if (validated.length >= VALIDATION_LIMITS.MAX_WORDS_PER_REQUEST) break;
    }
    
    return validated;
  }

  // Validate URL
  validateUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    
    const trimmed = url.trim();
    
    // Check length
    if (trimmed.length > VALIDATION_LIMITS.URL_MAX_LENGTH) {
      return null;
    }
    
    // Parse URL for validation
    return safeSync(() => {
      const parsed = new URL(trimmed);
      
      // Only allow http and https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      
      // Block local URLs and private IPs
      const blockedHosts = [
        'localhost', '127.0.0.1', '0.0.0.0',
        /^192\.168\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^169\.254\./, /^::1$/, /^fe80::/
      ];
      
      if (blockedHosts.some(pattern => 
        typeof pattern === 'string' 
          ? parsed.hostname === pattern 
          : pattern.test(parsed.hostname)
      )) {
        return null;
      }
      
      // Check for homograph attacks in domain
      if (ENCODING_CHECKS.containsHomographs(parsed.hostname)) {
        return null;
      }
      
      return parsed.toString();
    }, 'URL validation', null);
  }

  // Validate API key
  validateApiKey(key: unknown): string | null {
    if (typeof key !== 'string') return null;
    
    const trimmed = key.trim();
    
    // Check length
    if (trimmed.length < VALIDATION_LIMITS.API_KEY_MIN_LENGTH || 
        trimmed.length > VALIDATION_LIMITS.API_KEY_MAX_LENGTH) {
      return null;
    }
    
    // Check pattern
    if (!VALIDATION_PATTERNS.API_KEY.test(trimmed)) {
      return null;
    }
    
    // Check for common test/debug keys
    const blockedKeys = [
      'test', 'demo', 'debug', 'development', 'localhost',
      '12345', '00000', 'aaaaa', 'xxxxx'
    ];
    
    if (blockedKeys.some(blocked => trimmed.toLowerCase().includes(blocked))) {
      return null;
    }
    
    return trimmed;
  }

  // Validate settings object
  validateSettings(settings: unknown): UserSettings {
    if (typeof settings !== 'object' || settings === null) {
      return this.getDefaultSettings();
    }
    
    const validated: UserSettings = {} as UserSettings;
    
    // Validate target language
    validated.targetLanguage = this.validateLanguage((settings as any).targetLanguage);
    
    // Validate words per page
    const settingsObj = settings as any;
    if (typeof settingsObj.wordsPerPage === 'number') {
      const bounds = this.settingsBounds.wordsPerPage;
      validated.wordCount = Math.min(Math.max(settingsObj.wordsPerPage, bounds.min), bounds.max);
    } else {
      validated.wordCount = this.settingsBounds.wordsPerPage.default;
    }
    
    // Validate difficulty
    if (this.settingsBounds.wordDifficulty.values.includes(settingsObj.wordDifficulty)) {
      validated.difficulty = settingsObj.wordDifficulty;
    } else {
      validated.difficulty = this.settingsBounds.wordDifficulty.default;
    }
    
    // Validate enabled state
    validated.enabled = settingsObj.enabled === true;
    
    return validated;
  }

  // Get default settings
  getDefaultSettings(): UserSettings {
    return {
      targetLanguage: 'spanish' as LanguageCode,
      wordCount: this.settingsBounds.wordsPerPage.default,
      difficulty: this.settingsBounds.wordDifficulty.default,
      enabled: true,
      apiKey: undefined,
      pausedUntil: undefined
    };
  }

  // Validate site settings
  validateSiteSettings(settings: unknown): SiteSettings {
    if (typeof settings !== 'object' || settings === null) {
      return { enabled: true };
    }
    
    return {
      enabled: (settings as any).enabled === true,
      customWordCount: typeof (settings as any).customWordCount === 'number' 
        ? Math.min(Math.max((settings as any).customWordCount, 0), THRESHOLD.LOW_USAGE_THRESHOLD) 
        : undefined
    };
  }

  // Validate translation response
  validateTranslation(word: string, translation: unknown, targetLanguage?: LanguageCode): string | null {
    if (typeof translation !== 'string') return null;
    
    // Check encoding
    if (!ENCODING_CHECKS.isValidUTF8(translation)) {
      return null;
    }
    
    // Normalize and clean
    let normalized = ENCODING_CHECKS.normalizeUnicode(translation.trim());
    normalized = ENCODING_CHECKS.sanitizeInvisibleChars(normalized);
    
    // Check for empty or too long
    if (normalized.length === 0 || normalized.length > VALIDATION_LIMITS.TRANSLATION_MAX_LENGTH) {
      return null;
    }
    
    // Check for injection patterns
    if (VALIDATION_PATTERNS.SQL_INJECTION.test(normalized) || 
        VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
      return null;
    }
    
    // Check for obvious errors
    if (normalized.toLowerCase() === word.toLowerCase()) {
      return null;
    }
    
    if (/<[^>]*>/.test(normalized)) {
      return null;
    }
    
    // Validate characters match target language
    if (targetLanguage && LANGUAGE_VALIDATORS[targetLanguage as LanguageValidator]) {
      const validator = LANGUAGE_VALIDATORS[targetLanguage as LanguageValidator];
      // Allow some flexibility for loanwords, but flag if no target language chars found
      const hasTargetLangChars = normalized.split('').some(char => 
        validator.isValidChar(char)
      );
      if (!hasTargetLangChars && normalized.length > QUALITY.RATING_GOOD) {
        return null;
      }
    }
    
    return normalized;
  }

  // Validate domain name
  validateDomain(domain: unknown): string | null {
    if (typeof domain !== 'string') return null;
    
    const trimmed = domain.trim().toLowerCase();
    
    // Check length
    if (trimmed.length > VALIDATION_LIMITS.DOMAIN_MAX_LENGTH) {
      return null;
    }
    
    // Basic domain validation
    if (!VALIDATION_PATTERNS.DOMAIN.test(trimmed)) {
      return null;
    }
    
    // Check for homograph attacks
    if (ENCODING_CHECKS.containsHomographs(trimmed)) {
      return null;
    }
    
    // Block sensitive domains
    const blockedPatterns = [
      /\.gov$/,
      /\.mil$/,
      /bank/,
      /paypal/,
      /stripe/,
      /health/,
      /medical/,
      /\.internal$/,
      /\.local$/,
      /\.test$/
    ];
    
    for (const pattern of blockedPatterns) {
      if (pattern.test(trimmed)) {
        return null;
      }
    }
    
    return trimmed;
  }
  
  // Validate request payload size
  validatePayloadSize(payload: unknown): boolean {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }
    
    return safeSync(() => {
      const jsonString = JSON.stringify(payload);
      const sizeInBytes = new TextEncoder().encode(jsonString).length;
      return sizeInBytes <= VALIDATION_LIMITS.MAX_REQUEST_SIZE_BYTES;
    }, 'Payload size validation', false);
  }
}

// Export singleton instance
export const validator = new Validator();