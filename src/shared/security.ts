// Security manager for service worker context (no window/document access)
import { logger } from './logger';
import { SECURITY, TIMING, NUMERIC, ARRAY, TIME, DOMAIN } from './constants';

interface SecurityConfig {
  maxMessageSize: number;
  maxStringLength: number;
  trustedOrigins: Set<string>;
  blockedProtocols: string[];
  suspiciousPatterns: RegExp[];
}

class ServiceWorkerSecurityManager {
  private config: SecurityConfig;

  constructor() {
    this.config = {
      maxMessageSize: SECURITY.MAX_MESSAGE_SIZE,
      maxStringLength: SECURITY.MAX_STRING_LENGTH,
      trustedOrigins: new Set([
        chrome.runtime.getURL(''),
        'https://api.cognitive.microsofttranslator.com',
        // Worker URL should be added dynamically
      ]),
      blockedProtocols: ['javascript:', 'data:', 'vbscript:', 'file:'],
      suspiciousPatterns: [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /eval\s*\(/i,
        /new\s+Function/i
      ]
    };
    
    this.initializeIntegrityChecks();
  }

  private initializeIntegrityChecks(): void {
    // Freeze critical objects available in service worker
    this.freezeCriticalObjects();
    
    // Monitor for tampering
    this.monitorTampering();
  }

  // Freeze critical browser APIs to prevent tampering
  private freezeCriticalObjects(): void {
    try {
      // Freeze chrome APIs
      Object.freeze(chrome.runtime.sendMessage);
      Object.freeze(chrome.storage);
      
      // Freeze security-critical functions
      Object.freeze(Object.prototype);
      Object.freeze(Array.prototype);  
      Object.freeze(Function.prototype);
    } catch (error) {
      logger.error('Failed to freeze critical objects:', error);
    }
  }

  // Monitor for tampering attempts
  private monitorTampering(): void {
    // Check for prototype pollution
    setInterval(() => {
      const violations: string[] = [];
      
      // Check Object prototype
      const objProto = Object.getOwnPropertyNames(Object.prototype);
      const expectedObjProto = ['constructor', 'hasOwnProperty', 'isPrototypeOf', 
                               'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf'];
      
      for (const prop of objProto) {
        if (!expectedObjProto.includes(prop) && prop !== '__proto__') {
          violations.push(`Unexpected Object.prototype.${prop}`);
        }
      }
      
      if (violations.length > 0) {
        logger.warn('Potential prototype pollution detected:', violations);
        // Don't throw error in production - just log warning
        // Some extensions or browser features may add properties
      }
    }, TIME.DAYS_PER_MONTH * TIME.MS_PER_SECOND); // Check every 30 seconds
  }

  // Validate incoming messages
  validateMessage(message: any, sender: chrome.runtime.MessageSender): boolean {
    // Check message size
    const messageStr = JSON.stringify(message);
    if (messageStr.length > this.config.maxMessageSize) {
      throw new Error('Message too large');
    }
    
    // Validate sender
    if (sender && sender.id !== chrome.runtime.id) {
      throw new Error('Invalid sender');
    }
    
    // Check for suspicious content
    this.checkSuspiciousContent(messageStr);
    
    // Validate message structure
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message format');
    }
    
    if (!message.type || typeof message.type !== 'string') {
      throw new Error('Missing message type');
    }
    
    return true;
  }

  // Check for suspicious content
  private checkSuspiciousContent(content: string): void {
    if (typeof content === 'string') {
      // Check for suspicious patterns
      for (const pattern of this.config.suspiciousPatterns) {
        if (pattern.test(content)) {
          throw new Error('Suspicious content detected');
        }
      }
      
      // Check for blocked protocols
      for (const protocol of this.config.blockedProtocols) {
        if (content.includes(protocol)) {
          throw new Error('Blocked protocol detected');
        }
      }
    }
  }

  // Sanitize URLs
  sanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return null;
      }
      
      // Check for blocked protocols in the URL
      for (const protocol of this.config.blockedProtocols) {
        if (url.includes(protocol)) {
          return null;
        }
      }
      
      return urlObj.toString();
    } catch {
      return null;
    }
  }

  // Verify content integrity using SHA-256
  async verifyContentIntegrity(content: string, expectedHash: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(NUMERIC.HEX_BASE).padStart(DOMAIN.WORD_PADDING_CHARS, '0')).join('');
    return hashHex === expectedHash;
  }

  // Generate content hash
  async generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(NUMERIC.HEX_BASE).padStart(DOMAIN.WORD_PADDING_CHARS, '0')).join('');
  }

  // Create secure message with integrity check
  async createSecureMessage(type: string, data: any): Promise<any> {
    const message: any = {
      type,
      data,
      timestamp: Date.now(),
      nonce: crypto.getRandomValues(new Uint32Array(ARRAY.SINGLE_ITEM))[ARRAY.FIRST_INDEX]
    };
    
    const messageStr = JSON.stringify(message);
    message.hash = await this.generateContentHash(messageStr);
    
    return message;
  }

  // Verify secure message
  async verifySecureMessage(message: any): Promise<boolean> {
    if (!message || !message.hash) {
      throw new Error('Invalid secure message');
    }
    
    // Check timestamp (5 minute validity)
    if (Date.now() - message.timestamp > TIMING.ERROR_RESET_TIME_MS) {
      throw new Error('Message too old');
    }
    
    // Verify hash
    const { hash, ...messageWithoutHash } = message;
    const messageStr = JSON.stringify(messageWithoutHash);
    const expectedHash = await this.generateContentHash(messageStr);
    
    if (hash !== expectedHash) {
      throw new Error('Message integrity check failed');
    }
    
    return true;
  }
}

// Export singleton instance for service worker
export const serviceWorkerSecurityManager = new ServiceWorkerSecurityManager();