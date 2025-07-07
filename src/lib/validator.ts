// Validator Module - Input validation and sanitization
'use strict';

import type { LanguageCode, UserSettings, SiteSettings } from '../types';

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
  private readonly urlPattern: RegExp;
  private readonly wordPattern: RegExp;
  private readonly minWordLength: number;
  private readonly maxWordLength: number;
  private readonly apiKeyPattern: RegExp;
  private readonly settingsBounds: SettingsBounds;

  constructor() {
    // Valid language codes
    this.validLanguages = new Set(['spanish', 'french', 'german']);
    
    // URL validation patterns
    this.urlPattern = /^https?:\/\/([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/;
    
    // Word validation
    this.wordPattern = /^[a-zA-Z][a-zA-Z']*$/;
    this.minWordLength = 2;
    this.maxWordLength = 50;
    
    // API key pattern (alphanumeric with dashes)
    this.apiKeyPattern = /^[a-zA-Z0-9\-_]{10,100}$/;
    
    // Settings bounds
    this.settingsBounds = {
      wordsPerPage: { min: 1, max: 20, default: 6 },
      wordDifficulty: { values: ['beginner', 'intermediate', 'advanced'] as const, default: 'intermediate' }
    };
  }

  // Sanitize text content for safe display
  sanitizeText(text: unknown): string {
    if (typeof text !== 'string') return '';
    
    // Remove any HTML tags
    const textOnly = text.replace(/<[^>]*>/g, '');
    
    // Escape HTML entities
    const div = document.createElement('div');
    div.textContent = textOnly;
    
    // Limit length
    const sanitized = div.innerHTML;
    return sanitized.length > 1000 ? sanitized.substring(0, 1000) + '...' : sanitized;
  }

  // Validate language code
  validateLanguage(language: unknown): LanguageCode {
    if (typeof language !== 'string') return 'spanish';
    const lowercased = language.toLowerCase().trim();
    return this.validLanguages.has(lowercased) ? lowercased as LanguageCode : 'spanish';
  }

  // Validate word for translation
  validateWord(word: unknown): string | null {
    if (typeof word !== 'string') return null;
    
    const trimmed = word.trim();
    
    // Check length
    if (trimmed.length < this.minWordLength || trimmed.length > this.maxWordLength) {
      return null;
    }
    
    // Check pattern
    if (!this.wordPattern.test(trimmed)) {
      return null;
    }
    
    // Check for common non-translatable words
    const skipWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'as', 'by', 'with', 'from', 'up', 'down', 'is', 'are', 'was', 'were'
    ]);
    
    if (skipWords.has(trimmed.toLowerCase())) {
      return null;
    }
    
    return trimmed;
  }

  // Validate array of words
  validateWordList(words: unknown): string[] {
    if (!Array.isArray(words)) return [];
    
    const validated = [];
    const seen = new Set();
    
    for (const word of words) {
      const validWord = this.validateWord(word);
      if (validWord && !seen.has(validWord.toLowerCase())) {
        validated.push(validWord);
        seen.add(validWord.toLowerCase());
      }
      
      // Limit to reasonable number
      if (validated.length >= 50) break;
    }
    
    return validated;
  }

  // Validate URL
  validateUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    
    const trimmed = url.trim();
    
    // Basic URL validation
    if (!this.urlPattern.test(trimmed)) {
      return null;
    }
    
    // Parse URL for additional validation
    try {
      const parsed = new URL(trimmed);
      
      // Only allow http and https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      
      // Block local URLs
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return null;
      }
      
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // Validate API key
  validateApiKey(key: unknown): string | null {
    if (typeof key !== 'string') return null;
    
    const trimmed = key.trim();
    
    if (!this.apiKeyPattern.test(trimmed)) {
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
        ? Math.min(Math.max((settings as any).customWordCount, 0), 20) 
        : undefined
    };
  }

  // Validate translation response
  validateTranslation(word: string, translation: unknown): string | null {
    if (typeof translation !== 'string') return null;
    
    const trimmed = translation.trim();
    
    // Check for empty or too long
    if (trimmed.length === 0 || trimmed.length > 100) {
      return null;
    }
    
    // Check for obvious errors (same as input, contains HTML, etc)
    if (trimmed.toLowerCase() === word.toLowerCase()) {
      return null;
    }
    
    if (/<[^>]*>/.test(trimmed)) {
      return null;
    }
    
    return trimmed;
  }

  // Validate domain name
  validateDomain(domain: unknown): string | null {
    if (typeof domain !== 'string') return null;
    
    const trimmed = domain.trim().toLowerCase();
    
    // Basic domain validation
    const domainPattern = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (!domainPattern.test(trimmed)) {
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
      /medical/
    ];
    
    for (const pattern of blockedPatterns) {
      if (pattern.test(trimmed)) {
        return null;
      }
    }
    
    return trimmed;
  }
}

// Export singleton instance
export const validator = new Validator();