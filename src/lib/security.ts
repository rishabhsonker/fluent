// Security Module - Runtime protection and integrity checks
'use strict';

import { logger } from './logger.js';

// Type definitions
interface SecurityConfig {
  maxMessageSize: number;
  maxStringLength: number;
  trustedOrigins: Set<string>;
  blockedProtocols: string[];
  suspiciousPatterns: RegExp[];
}

interface SecureMessage {
  type: string;
  data: any;
  timestamp: number;
  nonce: number;
  hash?: string;
}

interface MessageSender {
  id?: string;
  url?: string;
  tab?: chrome.tabs.Tab;
  frameId?: number;
  documentId?: string;
  documentLifecycle?: string;
  origin?: string;
}

interface CSPViolationEvent extends Event {
  blockedURI: string;
  violatedDirective: string;
  originalPolicy: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export class SecurityManager {
  private config: SecurityConfig;

  constructor() {
    // Security configuration
    this.config = {
      maxMessageSize: 100000, // 100KB max message size
      maxStringLength: 10000, // Max length for any string
      trustedOrigins: new Set([
        chrome.runtime.getURL(''),
        'https://api.cognitive.microsofttranslator.com',
        // Worker URL should be added dynamically
      ]),
      blockedProtocols: ['javascript:', 'data:', 'vbscript:', 'file:'],
      suspiciousPatterns: [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i, // Event handlers
        /eval\s*\(/i,
        /new\s+Function/i
      ]
    };
    
    // Initialize integrity checks
    this.initializeIntegrityChecks();
  }

  // Initialize runtime integrity checks
  private initializeIntegrityChecks(): void {
    // Freeze critical objects
    this.freezeCriticalObjects();
    
    // Monitor for tampering
    this.monitorTampering();
    
    // Set up CSP violation reporting
    this.setupCSPReporting();
  }

  // Freeze critical browser APIs to prevent tampering
  private freezeCriticalObjects(): void {
    try {
      // Freeze fetch to prevent MITM
      Object.freeze(window.fetch);
      Object.freeze(XMLHttpRequest.prototype);
      
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
    const checkPrototypes = (): void => {
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
        logger.error('Prototype pollution detected:', violations);
        throw new Error('Security violation: Prototype pollution detected');
      }
    };
    
    // Run checks periodically
    setInterval(checkPrototypes, 30000); // Every 30 seconds
  }

  // Set up CSP violation reporting
  private setupCSPReporting(): void {
    if ('SecurityPolicyViolationEvent' in window) {
      document.addEventListener('securitypolicyviolation', (e: Event) => {
        const cspEvent = e as CSPViolationEvent;
        logger.error('CSP Violation:', {
          blockedURI: cspEvent.blockedURI,
          violatedDirective: cspEvent.violatedDirective,
          originalPolicy: cspEvent.originalPolicy
        });
      });
    }
  }

  // Validate message for secure message passing
  validateMessage(message: any, sender?: MessageSender): boolean {
    // Check message size
    const messageStr = JSON.stringify(message);
    if (messageStr.length > this.config.maxMessageSize) {
      throw new Error('Message too large');
    }
    
    // Validate sender
    if (sender && sender.id !== chrome.runtime.id) {
      throw new Error('Invalid sender');
    }
    
    // Check for suspicious patterns
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
    if (typeof content !== 'string') return;
    
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

  // Sanitize URL
  sanitizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      
      // Check against blocked patterns
      for (const protocol of this.config.blockedProtocols) {
        if (url.includes(protocol)) {
          return null;
        }
      }
      
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // Verify content integrity
  async verifyContentIntegrity(content: string, expectedHash: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex === expectedHash;
  }

  // Generate content hash
  async generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Secure message wrapper
  async createSecureMessage(type: string, data: any): Promise<SecureMessage> {
    const message: SecureMessage = {
      type,
      data,
      timestamp: Date.now(),
      nonce: crypto.getRandomValues(new Uint32Array(1))[0]
    };
    
    // Add integrity hash
    const messageStr = JSON.stringify(message);
    message.hash = await this.generateContentHash(messageStr);
    
    return message;
  }

  // Verify secure message
  async verifySecureMessage(message: SecureMessage): Promise<boolean> {
    if (!message || !message.hash) {
      throw new Error('Invalid secure message');
    }
    
    // Check timestamp (prevent replay attacks)
    const age = Date.now() - message.timestamp;
    if (age > 300000) { // 5 minutes
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

  // Create safe DOM element
  createSafeElement(
    tagName: string, 
    attributes: Record<string, string | number> = {}, 
    content: string = ''
  ): HTMLElement {
    const element = document.createElement(tagName);
    
    // Set attributes safely
    for (const [key, value] of Object.entries(attributes)) {
      // Skip event handlers
      if (key.startsWith('on')) continue;
      
      // Sanitize attribute value
      const sanitized = String(value).replace(/[<>'"]/g, '');
      element.setAttribute(key, sanitized);
    }
    
    // Set content safely (text only)
    if (content) {
      element.textContent = content;
    }
    
    return element;
  }
}

// Export singleton instance
export const securityManager = new SecurityManager();