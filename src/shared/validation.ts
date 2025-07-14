/**
 * Centralized validation constants for consistent input validation
 * across extension and worker components
 */

import { NUMERIC, DOMAIN } from './constants';

export const VALIDATION_LIMITS = {
  // Word validation
  WORD_MIN_LENGTH: 2,
  WORD_MAX_LENGTH: 50,
  
  // Language-specific word lengths
  SPANISH_MAX_WORD_LENGTH: 30,
  FRENCH_MAX_WORD_LENGTH: 35,
  GERMAN_MAX_WORD_LENGTH: 50,
  
  // Translation validation  
  TRANSLATION_MAX_LENGTH: 100,
  
  // Array/batch limits
  MAX_WORDS_PER_REQUEST: 50,
  MAX_WORDS_PER_PAGE: 20,
  
  // Text content limits
  TEXT_CONTENT_MAX_LENGTH: 1000,
  CONTEXT_MAX_LENGTH: 500,
  
  // Payload limits
  MAX_REQUEST_SIZE_BYTES: DOMAIN.MAX_CONSECUTIVE_ERRORS * DOMAIN.BACKOFF_FACTOR * NUMERIC.BYTES_PER_KB, // 10KB
  MAX_RESPONSE_SIZE_BYTES: DOMAIN.MAX_ELEMENTS / DOMAIN.BACKOFF_FACTOR * NUMERIC.BYTES_PER_KB, // 50KB
  
  // API key limits
  API_KEY_MIN_LENGTH: 10,
  API_KEY_MAX_LENGTH: 100,
  
  // Domain/URL limits
  DOMAIN_MAX_LENGTH: 253,
  URL_MAX_LENGTH: 2048,
} as const;

export const VALIDATION_PATTERNS = {
  // Basic word pattern - letters, apostrophes, hyphens
  WORD_BASIC: /^[a-zA-Z][a-zA-Z'-]*$/,
  
  // Unicode word pattern - supports international characters
  WORD_UNICODE: /^[\p{L}][\p{L}\p{M}'-]*$/u,
  
  // Extended word pattern - includes numbers for compound words
  WORD_EXTENDED: /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s'-]*$/u,
  
  // API key pattern - alphanumeric with dashes/underscores
  API_KEY: /^[a-zA-Z0-9\-_]+$/,
  
  // Domain pattern
  DOMAIN: /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
  
  // Injection patterns to block
  SQL_INJECTION: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|eval)\b|--|\/\*|\*\/|;|\||\\x|\\u|%[0-9a-f]{2})/i,
  SCRIPT_INJECTION: /<script|<\/script|javascript:|on\w+\s*=|eval\s*\(|expression\s*\(/i,
  
  // Language-specific patterns
  SPANISH_CHARS: /[áéíóúñüÁÉÍÓÚÑÜ]/,
  FRENCH_CHARS: /[àâäæçéèêëïîôùûüÿœÀÂÄÆÇÉÈÊËÏÎÔÙÛÜŸŒ]/,
  GERMAN_CHARS: /[äöüßÄÖÜẞ]/,
  
  // Control characters and zero-width characters to block
  // eslint-disable-next-line no-control-regex
  CONTROL_CHARS: /[\x00-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/,
} as const;

export const ENCODING_CHECKS = {
  // Check for valid UTF-8 sequences
  isValidUTF8: (str: string): boolean => {
    try {
      // Encode and decode to check for malformed sequences
      return str === decodeURIComponent(encodeURIComponent(str));
    } catch {
      return false;
    }
  },
  
  // Normalize Unicode to NFC (Canonical Decomposition, followed by Canonical Composition)
  normalizeUnicode: (str: string): string => {
    return str.normalize('NFC');
  },
  
  // Check for homograph attacks (lookalike characters)
  containsHomographs: (str: string): boolean => {
    // Common homograph patterns
    const homographPatterns = [
      /[\u0430\u0435\u043E\u0440\u0441\u0445]/, // Cyrillic lookalikes for 'aeopx'
      /[\u03BF\u03C1]/, // Greek lookalikes for 'op'
      /[\u13BB\u13E6]/, // Cherokee lookalikes
    ];
    
    return homographPatterns.some(pattern => pattern.test(str));
  },
  
  // Remove zero-width and control characters
  sanitizeInvisibleChars: (str: string): string => {
    return str.replace(VALIDATION_PATTERNS.CONTROL_CHARS, '');
  }
} as const;

export const LANGUAGE_VALIDATORS = {
  spanish: {
    isValidChar: (char: string): boolean => {
      return /^[\p{L}\p{M}'-]$/u.test(char) || VALIDATION_PATTERNS.SPANISH_CHARS.test(char);
    },
    maxWordLength: VALIDATION_LIMITS.SPANISH_MAX_WORD_LENGTH, // Spanish words tend to be shorter
  },
  french: {
    isValidChar: (char: string): boolean => {
      return /^[\p{L}\p{M}'-]$/u.test(char) || VALIDATION_PATTERNS.FRENCH_CHARS.test(char);
    },
    maxWordLength: VALIDATION_LIMITS.FRENCH_MAX_WORD_LENGTH, // French can have longer compound words
  },
  german: {
    isValidChar: (char: string): boolean => {
      return /^[\p{L}\p{M}'-]$/u.test(char) || VALIDATION_PATTERNS.GERMAN_CHARS.test(char);
    },
    maxWordLength: VALIDATION_LIMITS.GERMAN_MAX_WORD_LENGTH, // German allows very long compound words
  },
} as const;

export type LanguageValidator = keyof typeof LANGUAGE_VALIDATORS;