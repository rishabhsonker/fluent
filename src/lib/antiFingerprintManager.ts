/**
 * Anti-Fingerprinting Manager
 * Prevents websites from detecting and blocking the extension
 */

import { logger } from './logger';

interface TimingConfig {
  minDelay: number;
  maxDelay: number;
  variance: number;
}

export class AntiFingerprintManager {
  private static instance: AntiFingerprintManager;
  private isEnabled: boolean = true;
  
  // Timing configurations for different operations
  private readonly timings: Record<string, TimingConfig> = {
    domMutation: { minDelay: 50, maxDelay: 200, variance: 0.3 },
    wordReplacement: { minDelay: 10, maxDelay: 50, variance: 0.5 },
    tooltipShow: { minDelay: 100, maxDelay: 300, variance: 0.4 },
    apiCall: { minDelay: 0, maxDelay: 100, variance: 0.6 },
    initialization: { minDelay: 200, maxDelay: 800, variance: 0.4 }
  };

  private constructor() {}

  static getInstance(): AntiFingerprintManager {
    if (!AntiFingerprintManager.instance) {
      AntiFingerprintManager.instance = new AntiFingerprintManager();
    }
    return AntiFingerprintManager.instance;
  }

  /**
   * Add random delay to operations
   */
  async addRandomDelay(operation: keyof typeof this.timings): Promise<void> {
    if (!this.isEnabled) return;

    const config = this.timings[operation] || this.timings.domMutation;
    const delay = this.calculateDelay(config);
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Calculate delay with variance
   */
  private calculateDelay(config: TimingConfig): number {
    const { minDelay, maxDelay, variance } = config;
    const baseDelay = minDelay + Math.random() * (maxDelay - minDelay);
    
    // Add variance based on time of day and random factors
    const hour = new Date().getHours();
    const timeFactor = Math.sin(hour * Math.PI / 12) * variance;
    const randomFactor = (Math.random() - 0.5) * variance;
    
    const finalDelay = baseDelay * (1 + timeFactor + randomFactor);
    return Math.max(0, Math.round(finalDelay));
  }

  /**
   * Randomize operation order
   */
  shuffleOperations<T>(operations: T[]): T[] {
    if (!this.isEnabled) return operations;
    
    const shuffled = [...operations];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Vary numeric values slightly
   */
  varyNumber(value: number, variance: number = 0.1): number {
    if (!this.isEnabled) return value;
    
    const factor = 1 + (Math.random() - 0.5) * variance * 2;
    return Math.round(value * factor);
  }

  /**
   * Create variable CSS class names
   */
  generateClassName(base: string): string {
    if (!this.isEnabled) return base;
    
    // Add random suffix occasionally
    if (Math.random() < 0.3) {
      const suffix = Math.random().toString(36).substring(2, 5);
      return `${base}-${suffix}`;
    }
    return base;
  }

  /**
   * Randomize attribute names
   */
  randomizeAttributeName(base: string): string {
    if (!this.isEnabled) return base;
    
    const prefixes = ['data-', 'aria-', ''];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    if (Math.random() < 0.2) {
      // Use alternative attribute name occasionally
      const alternatives: Record<string, string[]> = {
        'data-fluent-word': ['data-translation', 'data-lang-word', 'data-translated'],
        'data-fluent-original': ['data-original-text', 'data-source', 'data-orig'],
        'data-fluent-translation': ['data-trans', 'data-target', 'data-result']
      };
      
      const alts = alternatives[base];
      if (alts) {
        return prefix + alts[Math.floor(Math.random() * alts.length)];
      }
    }
    
    return base;
  }

  /**
   * Vary DOM manipulation patterns
   */
  async varyDOMOperation(operation: () => void): Promise<void> {
    if (!this.isEnabled) {
      operation();
      return;
    }

    // Sometimes use requestAnimationFrame
    if (Math.random() < 0.3) {
      await new Promise(resolve => requestAnimationFrame(() => {
        operation();
        resolve(undefined);
      }));
    }
    // Sometimes use setTimeout with 0
    else if (Math.random() < 0.5) {
      await new Promise(resolve => setTimeout(() => {
        operation();
        resolve(undefined);
      }, 0));
    }
    // Sometimes execute immediately
    else {
      operation();
    }
  }

  /**
   * Create decoy elements occasionally
   */
  createDecoyElements(): void {
    if (!this.isEnabled || Math.random() > 0.1) return;

    try {
      // Create invisible decoy elements with similar classes
      const decoy = document.createElement('span');
      decoy.className = this.generateClassName('fluent-decoy');
      decoy.style.cssText = 'position: absolute; left: -9999px; visibility: hidden;';
      decoy.setAttribute('aria-hidden', 'true');
      
      document.body.appendChild(decoy);
      
      // Remove after random delay
      setTimeout(() => {
        decoy.remove();
      }, this.varyNumber(30000, 0.5));
    } catch (error) {
      // Ignore errors in decoy creation
    }
  }

  /**
   * Vary event listener attachment patterns
   */
  attachEventListener(
    element: Element,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.isEnabled) {
      element.addEventListener(event, handler, options);
      return;
    }

    // Vary between different attachment methods
    const method = Math.random();
    
    if (method < 0.7) {
      // Standard addEventListener
      element.addEventListener(event, handler, options);
    } else if (method < 0.9 && event in element) {
      // Direct property assignment (for simple events)
      (element as any)[`on${event}`] = handler;
    } else {
      // Delegated event handling
      const parent = element.parentElement;
      if (parent) {
        parent.addEventListener(event, (e: Event) => {
          if (e.target === element) {
            handler.call(element, e);
          }
        }, options);
      } else {
        element.addEventListener(event, handler, options);
      }
    }
  }

  /**
   * Check if anti-fingerprinting should be active
   */
  shouldActivate(): boolean {
    // Disable on certain trusted sites
    const trustedDomains = [
      'localhost',
      '127.0.0.1',
      'chrome-extension://'
    ];
    
    const hostname = window.location.hostname;
    return !trustedDomains.some(domain => hostname.includes(domain));
  }

  /**
   * Initialize anti-fingerprinting measures
   */
  initialize(): void {
    this.isEnabled = this.shouldActivate();
    
    if (this.isEnabled) {
      logger.info('Anti-fingerprinting measures activated');
      
      // Create some decoys on initialization
      setTimeout(() => {
        this.createDecoyElements();
      }, this.varyNumber(5000, 0.5));
      
      // Periodically create new decoys
      setInterval(() => {
        if (Math.random() < 0.05) {
          this.createDecoyElements();
        }
      }, this.varyNumber(60000, 0.3));
    }
  }

  /**
   * Disable anti-fingerprinting (for debugging)
   */
  disable(): void {
    this.isEnabled = false;
    logger.info('Anti-fingerprinting disabled');
  }

  /**
   * Enable anti-fingerprinting
   */
  enable(): void {
    this.isEnabled = this.shouldActivate();
    if (this.isEnabled) {
      logger.info('Anti-fingerprinting enabled');
    }
  }
}

// Export singleton instance
export const antiFingerprint = AntiFingerprintManager.getInstance();