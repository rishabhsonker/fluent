/**
 * Worker-side validation module
 * Implements consistent validation rules with the extension
 */

// Validation constants
export const VALIDATION_LIMITS = {
  WORD_MIN_LENGTH: 2,
  WORD_MAX_LENGTH: 50,
  TRANSLATION_MAX_LENGTH: 100,
  MAX_WORDS_PER_REQUEST: 50,
  MAX_REQUEST_SIZE_BYTES: 10 * 1024, // 10KB
  CONTEXT_MAX_LENGTH: 500,
};

// Validation patterns
export const VALIDATION_PATTERNS = {
  // Unicode word pattern - supports international characters
  WORD_UNICODE: /^[\p{L}][\p{L}\p{M}'-]*$/u,
  
  // Injection patterns to block
  SQL_INJECTION: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|eval)\b|--|\/\*|\*\/|;|\||\\x|\\u|%[0-9a-f]{2})/i,
  SCRIPT_INJECTION: /<script|<\/script|javascript:|on\w+\s*=|eval\s*\(|expression\s*\(/i,
  
  // Control characters and zero-width characters to block
  CONTROL_CHARS: /[\x00-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/,
};

// Language-specific configuration
export const LANGUAGE_CONFIG = {
  es: { maxWordLength: 30, name: 'spanish' },
  fr: { maxWordLength: 35, name: 'french' },
  de: { maxWordLength: 50, name: 'german' },
  it: { maxWordLength: 40, name: 'italian' },
  pt: { maxWordLength: 35, name: 'portuguese' },
};

/**
 * Check if string has valid UTF-8 encoding
 */
function isValidUTF8(str) {
  try {
    // Encode and decode to check for malformed sequences
    return str === decodeURIComponent(encodeURIComponent(str));
  } catch {
    return false;
  }
}

/**
 * Normalize Unicode to NFC
 */
function normalizeUnicode(str) {
  return str.normalize('NFC');
}

/**
 * Remove zero-width and control characters
 */
function sanitizeInvisibleChars(str) {
  return str.replace(VALIDATION_PATTERNS.CONTROL_CHARS, '');
}

/**
 * Check for homograph attacks
 */
function containsHomographs(str) {
  // Common homograph patterns
  const homographPatterns = [
    /[\u0430\u0435\u043E\u0440\u0441\u0445]/, // Cyrillic lookalikes
    /[\u03BF\u03C1]/, // Greek lookalikes
    /[\u13BB\u13E6]/, // Cherokee lookalikes
  ];
  
  return homographPatterns.some(pattern => pattern.test(str));
}

/**
 * Validate a single word
 */
export function validateWord(word, targetLanguage) {
  if (typeof word !== 'string') {
    return null;
  }
  
  // Check encoding
  if (!isValidUTF8(word)) {
    return null;
  }
  
  // Normalize and clean
  let normalized = normalizeUnicode(word.trim());
  normalized = sanitizeInvisibleChars(normalized);
  
  // Check for homograph attacks
  if (containsHomographs(normalized)) {
    return null;
  }
  
  // Check for injection patterns
  if (VALIDATION_PATTERNS.SQL_INJECTION.test(normalized) || 
      VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
    return null;
  }
  
  // Check length
  const langConfig = LANGUAGE_CONFIG[targetLanguage];
  const maxLength = langConfig ? langConfig.maxWordLength : VALIDATION_LIMITS.WORD_MAX_LENGTH;
  
  if (normalized.length < VALIDATION_LIMITS.WORD_MIN_LENGTH || normalized.length > maxLength) {
    return null;
  }
  
  // Check pattern
  if (!VALIDATION_PATTERNS.WORD_UNICODE.test(normalized)) {
    return null;
  }
  
  return normalized;
}

/**
 * Validate an array of words
 */
export function validateWordList(words, targetLanguage) {
  if (!Array.isArray(words)) {
    return { valid: false, error: 'Words must be an array' };
  }
  
  if (words.length === 0) {
    return { valid: false, error: 'Words array cannot be empty' };
  }
  
  if (words.length > VALIDATION_LIMITS.MAX_WORDS_PER_REQUEST) {
    return { valid: false, error: `Maximum ${VALIDATION_LIMITS.MAX_WORDS_PER_REQUEST} words allowed` };
  }
  
  const validWords = [];
  const seen = new Set();
  
  for (const word of words) {
    const validWord = validateWord(word, targetLanguage);
    if (validWord) {
      const key = validWord.toLowerCase();
      if (!seen.has(key)) {
        validWords.push(validWord);
        seen.add(key);
      }
    }
  }
  
  return { 
    valid: true, 
    words: validWords,
    filtered: words.length - validWords.length 
  };
}

/**
 * Validate request payload size
 */
export function validatePayloadSize(request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > VALIDATION_LIMITS.MAX_REQUEST_SIZE_BYTES) {
    return false;
  }
  return true;
}

/**
 * Validate translation response
 */
export function validateTranslation(translation) {
  if (typeof translation !== 'string') {
    return null;
  }
  
  // Check encoding
  if (!isValidUTF8(translation)) {
    return null;
  }
  
  // Normalize and clean
  let normalized = normalizeUnicode(translation.trim());
  normalized = sanitizeInvisibleChars(normalized);
  
  // Check length
  if (normalized.length === 0 || normalized.length > VALIDATION_LIMITS.TRANSLATION_MAX_LENGTH) {
    return null;
  }
  
  // Check for injection patterns
  if (VALIDATION_PATTERNS.SQL_INJECTION.test(normalized) || 
      VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
    return null;
  }
  
  return normalized;
}

/**
 * Validate context response
 */
export function validateContext(context) {
  if (typeof context !== 'string') {
    return null;
  }
  
  // Check encoding
  if (!isValidUTF8(context)) {
    return null;
  }
  
  // Normalize and clean
  let normalized = normalizeUnicode(context.trim());
  normalized = sanitizeInvisibleChars(normalized);
  
  // Check length
  if (normalized.length === 0 || normalized.length > VALIDATION_LIMITS.CONTEXT_MAX_LENGTH) {
    return null;
  }
  
  // Less strict validation for context since it's AI-generated
  if (VALIDATION_PATTERNS.SCRIPT_INJECTION.test(normalized)) {
    return null;
  }
  
  return normalized;
}