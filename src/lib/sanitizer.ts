/**
 * Sanitization utilities for secure DOM manipulation
 */

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
 * Validate and sanitize word for translation
 * Ensures the word contains only valid characters
 */
export function sanitizeWord(word: string): string | null {
  if (!word || typeof word !== 'string') {
    return null;
  }
  
  // Trim whitespace
  const trimmed = word.trim();
  
  // Check length
  if (trimmed.length === 0 || trimmed.length > 100) {
    return null;
  }
  
  // Allow only letters, numbers, spaces, hyphens, and apostrophes
  // Support international characters with Unicode flag
  const validWordPattern = /^[\p{L}\p{N}\s'-]+$/u;
  
  if (!validWordPattern.test(trimmed)) {
    return null;
  }
  
  return trimmed;
}

/**
 * Sanitize translation response from API
 * Ensures the translation is safe to insert into DOM
 */
export function sanitizeTranslation(translation: unknown): string | null {
  if (!translation || typeof translation !== 'string') {
    return null;
  }
  
  const sanitized = sanitizeText(translation);
  
  // Additional validation for translations
  if (sanitized.length === 0 || sanitized.length > 200) {
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
    'data-fluent-language', 'data-fluent-original', 'title',
    'aria-label', 'aria-describedby', 'role', 'tabindex'
  ];
  
  if (!safeAttributes.includes(name.toLowerCase())) {
    console.warn(`Attempting to set unsafe attribute: ${name}`);
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
export function sanitizeWordArray(words: unknown[]): string[] {
  if (!Array.isArray(words)) {
    return [];
  }
  
  return words
    .map(word => sanitizeWord(String(word)))
    .filter((word): word is string => word !== null);
}