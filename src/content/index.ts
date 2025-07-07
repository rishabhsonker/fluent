// Fluent Content Script - Performance-first design
// Target: <50ms processing time, <30MB memory usage

import { logger } from '../lib/logger.js';
import { errorBoundary } from '../lib/errorBoundaryEnhanced.js';
import { antiFingerprint } from '../lib/antiFingerprintManager.js';
import type { UserSettings, LanguageCode } from '../types';
import type { Tooltip } from './tooltip';
import type { PageControl } from './PageControl';
import type { WordReplacer } from './replacer';
import type { TextProcessor } from './textProcessor';

declare global {
  interface Window {
    __fluent?: {
      processContent: () => Promise<void>;
      CONFIG: ContentConfig;
      cleanup: () => void;
    };
  }
}

interface ContentConfig {
  MAX_PROCESSING_TIME: number;
  MAX_WORDS_PER_PAGE: number;
  MIN_WORD_LENGTH: number;
  MIN_WORD_OCCURRENCES: number;
  MAX_WORD_OCCURRENCES: number;
  DEBOUNCE_DELAY: number;
  PERFORMANCE_GUARD_MS: number;
}

interface SiteConfig {
  contentSelector: string;
  skipSelectors?: string[];
  useMutationObserver?: boolean;
}

(async function() {
  'use strict';

  console.log('Fluent: Content script loaded');

  // Initialize anti-fingerprinting
  antiFingerprint.initialize();
  
  // Add random delay to initialization
  await antiFingerprint.addRandomDelay('initialization');

  // Performance monitoring
  const startTime = performance.now();
  
  // Global references for cleanup
  let tooltipInstance: Tooltip | null = null;
  let pageControlInstance: PageControl | null = null;
  let mutationObserver: MutationObserver | null = null;
  let observerTimeout: number | undefined;
  let replacerInstance: WordReplacer | null = null;
  let textProcessorInstance: TextProcessor | null = null;
  
  // Configuration
  const CONFIG: ContentConfig = {
    MAX_PROCESSING_TIME: 50, // ms
    MAX_WORDS_PER_PAGE: 6,
    MIN_WORD_LENGTH: 4,
    MIN_WORD_OCCURRENCES: 2,
    MAX_WORD_OCCURRENCES: 4,
    DEBOUNCE_DELAY: 500, // ms for mutation observer
    PERFORMANCE_GUARD_MS: 50 // ms
  };

  // Site-specific configurations
  const SITE_CONFIGS: Record<string, SiteConfig> = {
    'wikipedia.org': {
      contentSelector: '.mw-parser-output > p:not(.mw-empty-elt)',
      skipSelectors: ['.mw-editsection', '.reference', '.citation']
    },
    'reddit.com': {
      contentSelector: '[data-testid="comment"], .Post__title, .Comment__body',
      useMutationObserver: true
    },
    'medium.com': {
      contentSelector: 'article p',
      skipSelectors: ['pre', 'code']
    },
    'github.com': {
      contentSelector: '.markdown-body p, .comment-body p',
      skipSelectors: ['pre', 'code', '.blob-code', '.highlight']
    },
    'default': {
      contentSelector: 'p, article, .content, .post, main',
      skipSelectors: ['script', 'style', 'pre', 'code', 'input', 'textarea', 'select']
    }
  };

  // Blocked patterns for sensitive sites
  const BLOCKED_PATTERNS: RegExp[] = [
    /\.gov$/,
    /bank/i,
    /health/i,
    /medical/i,
    /paypal/i,
    /stripe/i
  ];

  // Check if site should be processed
  function shouldProcessSite(): boolean {
    const hostname = window.location.hostname;
    return !BLOCKED_PATTERNS.some(pattern => pattern.test(hostname));
  }

  // Get site-specific configuration
  function getSiteConfig(): SiteConfig {
    const hostname = window.location.hostname;
    for (const [site, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) {
        return config;
      }
    }
    return SITE_CONFIGS.default;
  }

  // Check if element should be skipped
  function shouldSkipElement(element: Element | null): boolean {
    const skipSelectors = getSiteConfig().skipSelectors || [];
    if (!element || !element.parentElement) return true;
    
    // Check if element or any parent matches skip selectors
    for (const selector of skipSelectors) {
      if (element instanceof Element && element.matches(selector)) return true;
      if (element instanceof Element && element.closest(selector)) return true;
    }
    
    // Skip if inside contenteditable
    if (element instanceof HTMLElement && element.isContentEditable || 
        element instanceof Element && element.closest('[contenteditable="true"]')) {
      return true;
    }
    
    return false;
  }

  // Main processing function
  async function processContent(): Promise<void> {
    if (!shouldProcessSite()) {
      logger.info('Site blocked by security policy');
      return;
    }

    const config = getSiteConfig();
    
    // Import text processor for batched processing
    if (!textProcessorInstance) {
      const { TextProcessor } = await import('./textProcessor');
      textProcessorInstance = new TextProcessor(CONFIG);
    }
    
    // Collect text nodes using optimized processor
    const textNodes = textProcessorInstance.collectTextNodes(document.body, {
      ...config,
      skipSelectors: [...(config.skipSelectors || []), 'script', 'style', 'noscript']
    });

    // Process collected nodes
    if (textNodes.length > 0) {
      logger.debug(`Processing ${textNodes.length} text nodes`);
      
      // Import and use word replacer with real translations
      Promise.all([
        import('./replacer'),
        import('../lib/simpleTranslator.js'),
        import('../lib/storage.js')
      ]).then(async ([replacerModule, translatorModule, storageModule]) => {
        const { WordReplacer } = replacerModule;
        const { translator } = translatorModule;
        const { getStorage } = storageModule;
        
        replacerInstance = new WordReplacer(CONFIG);
        const storage = getStorage();
        
        // Get user settings
        const settings = await storage.getSettings();
        const targetLanguage = settings.targetLanguage || 'spanish';
        
        // Inject storage and language into replacer for spaced repetition
        replacerInstance.storage = storage;
        replacerInstance.currentLanguage = targetLanguage as LanguageCode;
        
        // Check if site is enabled
        const hostname = window.location.hostname;
        const siteSettings = await storage.getSiteSettings(hostname);
        if (!siteSettings.enabled) {
          logger.info('Disabled for this site');
          return;
        }
        
        // Analyze and select words (now async with spaced repetition)
        const wordsToReplace = await replacerInstance.analyzeText(textNodes);
        logger.debug(`Selected ${wordsToReplace.length} words for replacement`);
        
        if (wordsToReplace.length === 0) {
          return;
        }
        
        // Get translations
        const result = await translator.translate(
          wordsToReplace,
          targetLanguage
        );
        
        if (result.error) {
          logger.warn(result.error);
          // TODO: Show notification to user about limit reached
        }
        
        const translations = result.translations || {};
        
        // Create translation map for replacer
        const translationMap: Record<string, string> = {};
        for (const word of wordsToReplace) {
          translationMap[word.toLowerCase()] = translations[word] || word;
        }
        
        // Replace words
        const replacedCount = await replacerInstance.replaceWords(textNodes, wordsToReplace, translationMap);
        logger.debug(`Replaced ${replacedCount} words`);
        
        // Update daily stats
        if (replacedCount > 0) {
          const stats = await storage.getDailyStats();
          await storage.updateDailyStats({
            wordsLearned: stats.wordsLearned + replacedCount,
            pagesVisited: stats.pagesVisited + 1
          });
        }
        
        // Cleanup replacer after use
        replacerInstance.cleanup();
        replacerInstance = null;
      }).catch(err => {
        logger.error('Error loading modules', err);
      });
    }

    // Report performance
    const processingTime = performance.now() - startTime;
    logger.debug(`Processed in ${processingTime.toFixed(2)}ms`);
  }

  // Initialize components and styles
  async function initializeExtension(): Promise<void> {
    try {
      console.log('Fluent: Initializing extension...');
      
      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/styles.css');
      document.head.appendChild(link);
      
      // Initialize storage
      const storageModule = await import('../lib/storage.js');
      const storage = storageModule.getStorage();
      const settings = await storage.getSettings();
      console.log('Fluent: Settings loaded:', settings);
      
      // Initialize Tooltip with storage
      const tooltipModule = await import('./tooltip');
      tooltipInstance = new tooltipModule.Tooltip();
      tooltipInstance.storage = storage;
      tooltipInstance.currentLanguage = (settings.targetLanguage || 'spanish') as LanguageCode;
      
      // Initialize PageControl
      const pageControlModule = await import('./PageControl');
      pageControlInstance = new pageControlModule.PageControl(settings);
      
      // Process content
      processContent();
    } catch (err) {
      logger.error('Initialization error', err);
    }
  }
  
  // Initialize when DOM is ready
  console.log('Fluent: Document readyState:', document.readyState);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    // Use requestIdleCallback for better performance
    if ('requestIdleCallback' in window) {
      requestIdleCallback(initializeExtension, { timeout: 100 });
    } else {
      setTimeout(initializeExtension, 0);
    }
  }

  // Set up MutationObserver for SPAs
  const config = getSiteConfig();
  if (config.useMutationObserver) {
    mutationObserver = new MutationObserver(() => {
      clearTimeout(observerTimeout);
      observerTimeout = window.setTimeout(() => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(processContent, { timeout: 100 });
        } else {
          processContent();
        }
      }, CONFIG.DEBOUNCE_DELAY);
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    });
  }

  // Cleanup function for extension unload
  function cleanup(): void {
    // Clear timeouts
    if (observerTimeout) {
      clearTimeout(observerTimeout);
    }
    
    // Disconnect mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    
    // Destroy tooltip
    if (tooltipInstance) {
      tooltipInstance.destroy();
      tooltipInstance = null;
    }
    
    // Destroy page control
    if (pageControlInstance && typeof pageControlInstance.destroy === 'function') {
      pageControlInstance.destroy();
      pageControlInstance = null;
    }
    
    // Cleanup replacer
    if (replacerInstance) {
      replacerInstance.cleanup();
      replacerInstance = null;
    }
    
    // Remove global reference
    delete window.__fluent;
  }
  
  // Listen for extension context invalidation
  if (chrome.runtime?.id) {
    // Check periodically if extension context is still valid
    const contextCheckInterval = setInterval(() => {
      if (!chrome.runtime?.id) {
        // Extension context invalidated, cleanup
        clearInterval(contextCheckInterval);
        cleanup();
      }
    }, 5000);
  }
  
  // Cleanup on page unload
  window.addEventListener('unload', cleanup);
  
  // Expose API for testing
  window.__fluent = {
    processContent,
    CONFIG,
    cleanup
  };
})();