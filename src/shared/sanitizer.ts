/**
 * Sanitizer - Security-focused text and DOM sanitization
 * 
 * Purpose:
 * - Prevents XSS attacks by sanitizing user input and API responses
 * - Ensures safe DOM manipulation
 * - Provides HTML entity escaping
 * 
 * Key Functions:
 * - sanitizeText: Escapes HTML entities for safe display
 * - sanitizeAttribute: Prevents attribute-based XSS
 * - sanitizeTranslation: Cleans API responses
 * - createSafeTextNode: Safe DOM text node creation
 * - setSafeAttribute: Whitelist-based attribute setting
 * 
 * Security Features:
 * - HTML entity escaping
 * - Script injection prevention
 * - Attribute value sanitization
 * - URL validation
 * - CSS value sanitization
 * 
 * Referenced by:
 * - src/features/translation/replacer.ts (word sanitization)
 * - src/features/ui/tooltip/tooltip.ts (safe DOM updates)
 * - src/features/ui/widget/widget.ts (safe UI updates)
 * 
 */

import { logger } from './logger';
import { 
  VALIDATION_LIMITS, 
  VALIDATION_PATTERNS, 
  ENCODING_CHECKS 
} from './validation-constants';

/**
 * Sanitize text content to prevent XSS attacks
 * Removes any HTML tags and dangerous characters
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove any HTML tags
  const textOnly = text.replace(/<[^>]*>/g, '');
  
  // Escape dangerous characters
  return textOnly
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize attribute values to prevent attribute-based XSS
 */
export function sanitizeAttribute(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  // Remove any quotes and escape characters
  return value
    .replace(/['"]/g, '')
    .replace(/[\r\n]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}


/**
 * Sanitize translation response from API
 * Ensures the translation is safe to insert into DOM
 */
export function sanitizeTranslation(translation: unknown): string | null {
  if (!translation || typeof translation !== 'string') {
    return null;
  }
  
  // Check encoding
  if (!ENCODING_CHECKS.isValidUTF8(translation)) {
    return null;
  }
  
  // Normalize and clean
  let normalized = ENCODING_CHECKS.normalizeUnicode(translation);
  normalized = ENCODING_CHECKS.sanitizeInvisibleChars(normalized);
  
  // Sanitize for HTML
  const sanitized = sanitizeText(normalized);
  
  // Additional validation for translations
  if (sanitized.length === 0 || sanitized.length > VALIDATION_LIMITS.TRANSLATION_MAX_LENGTH) {
    return null;
  }
  
  // Check for injection patterns
  if (VALIDATION_PATTERNS.SQL_INJECTION.test(sanitized) || 
      VALIDATION_PATTERNS.SCRIPT_INJECTION.test(sanitized)) {
    return null;
  }
  
  return sanitized;
}

/**
 * Create a safe text node that can be inserted into DOM
 */
export function createSafeTextNode(text: string): Text {
  const sanitized = sanitizeText(text);
  return document.createTextNode(sanitized);
}

/**
 * Safely set element attribute
 */
export function setSafeAttribute(element: Element, name: string, value: string): void {
  // Whitelist of safe attributes
  const safeAttributes = [
    'class', 'id', 'data-fluent-word', 'data-fluent-translation',
    'data-fluent-language', 'data-fluent-original', 'data-fluent-pronunciation',
    'data-fluent-meaning', 'data-fluent-example', 'title',
    'aria-label', 'aria-describedby', 'role', 'tabindex'
  ];
  
  if (!safeAttributes.includes(name.toLowerCase())) {
    logger.warn(`Attempting to set unsafe attribute: ${name}`);
    return;
  }
  
  const sanitizedValue = sanitizeAttribute(value);
  element.setAttribute(name, sanitizedValue);
}

/**
 * Validate URL for safety
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http, https, and chrome-extension protocols
    return ['http:', 'https:', 'chrome-extension:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitize CSS value to prevent style-based attacks
 */
export function sanitizeCssValue(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  // Remove dangerous CSS values
  return value
    .replace(/javascript:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/import\s+/gi, '')
    .replace(/@import/gi, '')
    .replace(/url\s*\(/gi, '')
    .replace(/behavior:/gi, '');
}

/**
 * Create safe innerHTML content
 * Only use for trusted templates, not user content
 */
export function createSafeHTML(template: string, data: Record<string, string>): string {
  let safe = template;
  
  // Replace placeholders with sanitized data
  Object.entries(data).forEach(([key, value]) => {
    const sanitized = sanitizeText(value);
    safe = safe.replace(new RegExp(`{{${key}}}`, 'g'), sanitized);
  });
  
  return safe;
}

/**
 * Validate DOM node for safety before manipulation
 */
export function isNodeSafe(node: Node): boolean {
  // Skip script and style elements
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    if (['script', 'style', 'iframe', 'object', 'embed', 'link'].includes(tagName)) {
      return false;
    }
    
    // Check for event handlers
    const attributes = element.attributes;
    for (let i = 0; i < attributes.length; i++) {
      if (attributes[i].name.startsWith('on')) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Sanitize array of words for batch translation
 */
