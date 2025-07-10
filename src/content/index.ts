
// Fluent Content Script - Performance-first design
// Target: <50ms processing time, <30MB memory usage


import { logger } from '../lib/logger.js';
import { API_CONFIG } from '../lib/constants.js';
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
      initialized?: boolean;
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
  wordsPerPage?: number;
}

(async function() {
  'use strict';
  
  // Singleton pattern - prevent multiple injections
  if (window.__fluent?.initialized) {
    return; // Already initialized
  }
  
  // Mark as initializing immediately
  window.__fluent = {
    initialized: false,
    processContent: async () => {},
    CONFIG: {} as ContentConfig,
    cleanup: () => {}
  };
  

  // Initialize immediately for better performance

  // Performance monitoring
  const startTime = performance.now();
  
  // Global references for cleanup
  let tooltipInstance: Tooltip | null = null;
  let pageControlInstance: PageControl | null = null;
  let mutationObserver: MutationObserver | null = null;
  let navigationObserver: MutationObserver | null = null;
  let observerTimeout: number | undefined;
  let replacerInstance: WordReplacer | null = null;
  let textProcessorInstance: TextProcessor | null = null;
  
  // Initialization lock to prevent race conditions
  let initializationPromise: Promise<void> | null = null;
  
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

  // Site configuration cache
  let siteConfig: any = null;
  let configLoadTime = 0;
  const CONFIG_CACHE_DURATION = 3600000; // 1 hour

  // Fetch site configuration from worker
  async function fetchSiteConfig(): Promise<any> {
    const now = Date.now();
    
    // Use cached config if fresh
    if (siteConfig && (now - configLoadTime) < CONFIG_CACHE_DURATION) {
      return siteConfig;
    }
    
    try {
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/config`, {
        method: 'GET'
        // Don't send Content-Type header for GET requests
      });
      
      if (response.ok) {
        siteConfig = await response.json();
        configLoadTime = now;
        logger.debug('Site config loaded:', siteConfig);
        return siteConfig;
      }
    } catch (error) {
      logger.error('Failed to fetch site config:', error);
    }
    
    // Fallback to basic blocked patterns
    return {
      blockedSites: [
        'gmail.com', 'mail.google.com', 'outlook.com', 
        'paypal.com', 'chase.com', 'bankofamerica.com'
      ],
      optimizedSites: [],
      globalSkipSelectors: ['script', 'style', 'pre', 'code']
    };
  }

  // Check if site should be processed
  async function shouldProcessSite(): Promise<boolean> {
    const hostname = window.location.hostname;
    const config = await fetchSiteConfig();
    
    // Check if hostname or any parent domain is blocked
    const isBlocked = config.blockedSites.some((blocked: string) => {
      return hostname === blocked || 
             hostname.endsWith('.' + blocked) ||
             hostname.includes(blocked);
    });
    
    if (isBlocked) {
      logger.info(`Site ${hostname} is blocked by configuration`);
    }
    
    return !isBlocked;
  }

  // Get site-specific configuration
  async function getSiteConfig(): Promise<SiteConfig> {
    const hostname = window.location.hostname;
    const config = await fetchSiteConfig();
    
    // Check if this site has optimized settings
    const optimized = config.optimizedSites?.find((site: any) => 
      hostname.includes(site.domain)
    );
    
    if (optimized) {
      logger.debug(`Using optimized config for ${hostname}:`, optimized);
      return {
        contentSelector: optimized.selector || SITE_CONFIGS.default.contentSelector,
        skipSelectors: [
          ...(config.globalSkipSelectors || []),
          ...(optimized.skipSelectors || [])
        ],
        useMutationObserver: optimized.useMutationObserver,
        wordsPerPage: optimized.wordsPerPage
      };
    }
    
    // Check legacy SITE_CONFIGS
    for (const [site, siteConfig] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) {
        return {
          ...siteConfig,
          skipSelectors: [
            ...(config.globalSkipSelectors || []),
            ...(siteConfig.skipSelectors || [])
          ]
        };
      }
    }
    
    // Default config with global skip selectors
    return {
      ...SITE_CONFIGS.default,
      skipSelectors: [
        ...(config.globalSkipSelectors || []),
        ...(SITE_CONFIGS.default.skipSelectors || [])
      ]
    };
  }

  // Check if element should be skipped
  async function shouldSkipElement(element: Element | null, config?: SiteConfig): Promise<boolean> {
    const siteConfig = config || await getSiteConfig();
    const skipSelectors = siteConfig.skipSelectors || [];
    if (!element || !element.parentElement) return true;
    
    // Always skip Fluent extension UI elements
    if (element instanceof Element) {
      if (element.closest('.fluent-control') || 
          element.closest('.fluent-tooltip') ||
          element.closest('[data-fluent-skip]') ||
          element.classList.contains('fluent-control') ||
          element.classList.contains('fluent-tooltip') ||
          element.hasAttribute('data-fluent-skip')) {
        return true;
      }
    }
    
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
  
  // Main processing function with initialization lock
  async function processContent(): Promise<void> {
    if (initializationPromise) {
      return initializationPromise;
    }
    
    initializationPromise = doProcessContent().finally(() => {
      initializationPromise = null;
    });
    
    return initializationPromise;
  }

  // Main processing function (internal implementation)
  async function doProcessContent(): Promise<void> {
    if (!(await shouldProcessSite())) {
      logger.info('Site blocked by configuration');
      return;
    }

    const config = await getSiteConfig();
    
    // Import text processor for batched processing
    if (!textProcessorInstance) {
      try {
        const { TextProcessor } = await import('./textProcessor');
        textProcessorInstance = new TextProcessor(CONFIG);
      } catch (error) {
        logger.error('Failed to load text processor', error);
        return;
      }
    }
    
    // Collect text nodes using optimized processor
    const textNodes = textProcessorInstance.collectTextNodes(document.body, {
      ...config,
      skipSelectors: [
        ...(config.skipSelectors || []), 
        'script', 
        'style', 
        'noscript',
        '.fluent-control',      // Skip page control widget
        '.fluent-control *',    // Skip all children of page control
        '.fluent-tooltip',      // Skip tooltip
        '.fluent-tooltip *',    // Skip all children of tooltip
        '[data-fluent-skip]',   // Skip elements marked to skip
        '[data-fluent-skip] *'  // Skip all children of marked elements
      ],
      shouldSkipElement: async (el: Element) => await shouldSkipElement(el, config)
    });

    // Process collected nodes
    if (textNodes.length > 0) {
      logger.debug(`Processing ${textNodes.length} text nodes`);
      
      // Import and use word replacer with real translations
      Promise.all([
        import('./replacer'),
        import('../lib/storage.js')
      ]).then(async ([replacerModule, storageModule]) => {
        try {
        const { WordReplacer } = replacerModule;
        const { getStorage } = storageModule;
        
        replacerInstance = new WordReplacer(CONFIG);
        const storage = getStorage();
        
        // Get user settings
        const settings = await storage.getSettings();
        logger.debug('Loaded settings in content script:', settings);
        const targetLanguage = (settings.targetLanguage || 'spanish') as LanguageCode;
        logger.debug('Using target language:', targetLanguage);
        
        // Inject storage and language into replacer for spaced repetition
        replacerInstance.storage = storage;
        replacerInstance.currentLanguage = targetLanguage as LanguageCode;
        
        // Set custom word limit if specified in config
        if (config.wordsPerPage) {
          replacerInstance.setMaxWordsPerPage(config.wordsPerPage);
        }
        
        // Check if site is enabled
        const hostname = window.location.hostname;
        const siteSettings = await storage.getSiteSettings(hostname);
        if (!siteSettings.enabled) {
          logger.info('Disabled for this site');
          return;
        }
        
        // Analyze and select words (now async with spaced repetition)
        let wordsToReplace;
        try {
          wordsToReplace = await replacerInstance.analyzeText(textNodes);
        } catch (error) {
          logger.error('Failed to analyze text', error);
          return;
        }
        logger.debug(`Selected ${wordsToReplace.length} words for replacement`);
        
        if (wordsToReplace.length === 0) {
          return;
        }
        
        // Get translations through background script to avoid CORS
        let result;
        try {
          logger.info('Sending translation request for words:', wordsToReplace);
          result = await chrome.runtime.sendMessage({
            type: 'GET_TRANSLATIONS',
            words: wordsToReplace,
            language: targetLanguage
          });
          logger.info('Translation response received:', result);
        } catch (error) {
          logger.error('Translation request failed:', error);
          // Show visible error to user
          showErrorNotification('Translation failed. Please check the extension settings.');
          return;
        }
        
        // Check if response is wrapped in secure message
        let actualResult = result;
        if (result && result.type === 'response' && result.data) {
          actualResult = result.data;
        } else if (result && result.payload) {
          actualResult = result.payload;
        }
        
        if (!actualResult) {
          logger.error('No response data from translation request');
          showErrorNotification('Translation service not responding. Please try again.');
          return;
        }
        
        if (actualResult.error) {
          logger.warn('Translation error:', actualResult.error);
          // Show notification to user if daily limit reached
          if (actualResult.error.includes('daily limit') || actualResult.error.includes('50 words')) {
            showLimitNotification();
          } else if (actualResult.error.includes('not properly initialized')) {
            showErrorNotification('Extension needs to be reinitialized. Please reload the extension.');
          } else {
            showErrorNotification(`Translation failed: ${actualResult.error}`);
          }
        }
        
        const translations = actualResult.translations || {};
        
        // Create translation map and context map for replacer
        const translationMap: Record<string, string> = {};
        const contextMap: Record<string, any> = {};
        
        for (const word of wordsToReplace) {
          const data = translations[word];
          if (data && typeof data === 'object' && data.translation) {
            // New format with context
            translationMap[word.toLowerCase()] = data.translation;
            contextMap[word.toLowerCase()] = {
              pronunciation: data.pronunciation,
              meaning: data.meaning,
              example: data.example
            };
          } else if (data && typeof data === 'string') {
            // Old format, just translation
            translationMap[word.toLowerCase()] = data;
          } else {
            translationMap[word.toLowerCase()] = word;
          }
        }
        
        // Replace words with error handling
        let replacedCount = 0;
        try {
          replacedCount = await replacerInstance.replaceWords(textNodes, wordsToReplace, translationMap, contextMap);
        } catch (error) {
          logger.error('Failed to replace words', error);
          return;
        }
        logger.debug(`Replaced ${replacedCount} words`);
        
        // Update daily stats with error handling
        if (replacedCount > 0) {
          try {
            const stats = await storage.getDailyStats();
            await storage.updateDailyStats({
              wordsLearned: stats.wordsLearned + replacedCount,
              pagesVisited: stats.pagesVisited + 1
            });
          } catch (error) {
            logger.error('Failed to update stats', error);
            // Non-critical - continue
          }
        }
        
        // Cleanup replacer after use
        replacerInstance.cleanup();
        replacerInstance = null;
        } catch (error) {
          logger.error('Error in word replacement process', error);
          // Cleanup on error
          if (replacerInstance) {
            replacerInstance.cleanup();
            replacerInstance = null;
          }
        }
      }).catch(err => {
        logger.error('Critical error loading modules', err);
      });
    }

    // Report performance
    const processingTime = performance.now() - startTime;
    logger.debug(`Processed in ${processingTime.toFixed(2)}ms`);
  }

  // Initialize components and styles
  async function initializeExtension(): Promise<void> {
    logger.debug('Initializing extension');
    
    try {
      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/styles.css');
      
      // Add error handling for CSS loading
      link.onerror = () => {
        logger.warn('Failed to load styles.css, injecting inline styles as fallback');
        // Inject critical styles inline as fallback
        const style = document.createElement('style');
        style.textContent = `
          .fluent-word {
            background-color: rgba(255, 20, 147, 0.25) !important;
            padding: 0.1em 0.2em !important;
            margin: 0 0.1em !important;
            border-radius: 3px !important;
            cursor: help !important;
            color: inherit !important;
            text-decoration: none !important;
            box-shadow: none !important;
          }
          .fluent-word:hover {
            background-color: rgba(255, 20, 147, 0.4) !important;
            box-shadow: none !important;
            transform: scale(1.05) !important;
          }
          .fluent-tooltip {
            position: absolute !important;
            z-index: 2147483647 !important;
            background: #1f2937 !important;
            color: white !important;
            padding: 16px 20px !important;
            border-radius: 12px !important;
            font-size: 14px !important;
            min-width: 280px !important;
            max-width: 360px !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
            left: var(--tooltip-left, 0) !important;
            top: var(--tooltip-top, 0) !important;
          }
          .fluent-tooltip.visible {
            opacity: 1 !important;
          }
          .fluent-hidden {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      };
      
      link.onload = () => {
      };
      
      if (document.head) {
        document.head.appendChild(link);
      }
      
      // Initialize storage with error handling
      let storage;
      try {
        const storageModule = await import('../lib/storage.js');
        storage = storageModule.getStorage();
      } catch (error) {
        logger.error('Failed to load storage module', error);
        return; // Cannot continue without storage
      }
      
      // Get settings with fallback
      let settings;
      try {
        settings = await storage.getSettings();
        logger.info('Content script loaded settings:', settings);
      } catch (error) {
        logger.error('Failed to load settings', error);
        // Try to get settings from background script as fallback
        try {
          const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
          if (response && response.settings) {
            settings = response.settings;
            logger.info('Got settings from background script:', settings);
          } else {
            settings = { targetLanguage: 'spanish', enabled: true }; // Use defaults
          }
        } catch (bgError) {
          logger.error('Failed to get settings from background:', bgError);
          settings = { targetLanguage: 'spanish', enabled: true }; // Use defaults
        }
      }
      
      // Initialize Tooltip with error boundary
      try {
        const tooltipModule = await import('./tooltip');
        tooltipInstance = new tooltipModule.Tooltip();
        tooltipInstance.storage = storage;
        tooltipInstance.currentLanguage = (settings.targetLanguage || 'spanish') as LanguageCode;
      } catch (error) {
        logger.error('Failed to initialize tooltip', error);
        // Continue without tooltip - core functionality can still work
      }
      
      // Initialize PageControl with error boundary
      try {
        const pageControlModule = await import('./PageControl');
        pageControlInstance = new pageControlModule.PageControl({
          ...settings,
          targetLanguage: settings.targetLanguage as LanguageCode
        });
      } catch (error) {
        logger.error('Failed to initialize page control', error);
        // Continue without page control
      }
      
      // Process content with error boundary
      try {
        await processContent();
      } catch (error) {
        logger.error('Failed to process content', error);
      }
    } catch (err) {
      logger.error('Critical initialization error', err);
      // Cleanup on critical failure
      cleanup();
    }
  }
  
  // Initialize when DOM is ready
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

  // Set up MutationObserver for SPAs with protection
  getSiteConfig().then(config => {
    if (config.useMutationObserver) {
    let mutationCount = 0;
    const MAX_MUTATIONS_PER_SECOND = 10;
    let lastMutationTime = Date.now();
    
    mutationObserver = new MutationObserver((mutations) => {
      // Protect against mutation floods
      const now = Date.now();
      if (now - lastMutationTime < 1000) {
        mutationCount++;
        if (mutationCount > MAX_MUTATIONS_PER_SECOND) {
          logger.warn('Too many mutations, throttling observer');
          return;
        }
      } else {
        mutationCount = 0;
        lastMutationTime = now;
      }
      
      clearTimeout(observerTimeout);
      observerTimeout = window.setTimeout(() => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(processContent, { timeout: 100 });
        } else {
          processContent();
        }
      }, CONFIG.DEBOUNCE_DELAY);
    });

    // Ensure document.body exists before observing
    if (document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false,
        attributes: false
      });
    } else {
      // If body doesn't exist yet, wait for it
      const waitForBody = () => {
        if (document.body && mutationObserver) {
          mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: false,
            attributes: false
          });
        } else if (!document.body) {
          requestAnimationFrame(waitForBody);
        }
      };
      waitForBody();
    }
    }
  });

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
    
    // Disconnect navigation observer
    if (navigationObserver) {
      navigationObserver.disconnect();
      navigationObserver = null;
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
  
  // Cleanup when page is hidden (more reliable than deprecated 'unload')
  window.addEventListener('pagehide', cleanup);
  
  // Also cleanup when document visibility changes to hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !chrome.runtime?.id) {
      cleanup();
    }
  });
  
  // Handle SPA navigation
  let lastUrl = location.href;
  const checkNavigation = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      logger.info('SPA navigation detected, reinitializing');
      cleanup();
      // Re-initialize after a short delay
      setTimeout(async () => {
        const settings = await chrome.storage.local.get(['enabled', 'siteSettings']);
        if (settings.enabled) {
          const hostname = window.location.hostname;
          const siteSettings = settings.siteSettings?.[hostname];
          if (!siteSettings || siteSettings.enabled !== false) {
            processContent();
          }
        }
      }, 100);
    }
  };
  
  // Monitor for SPA navigation
  navigationObserver = new MutationObserver(checkNavigation);
  navigationObserver.observe(document, { subtree: true, childList: true });
  
  // Also listen for history changes
  window.addEventListener('popstate', checkNavigation);
  
  // Override pushState and replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    checkNavigation();
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    checkNavigation();
  };

  // Update singleton with actual functions and mark as initialized
  window.__fluent = {
    initialized: true,
    processContent,
    CONFIG,
    cleanup
  };
})();

// Show error notification to user
function showErrorNotification(message: string): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    max-width: 320px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  if (document.body) {
    document.body.appendChild(notification);
  }
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Show notification when daily limit is reached
function showLimitNotification(): void {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'fluent-limit-notification';
  
  // Create notification content safely
  const notificationContent = document.createElement('div');
  notificationContent.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #3b82f6;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    max-width: 320px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  const strong = document.createElement('strong');
  strong.textContent = 'Daily limit reached!';
  notificationContent.appendChild(strong);
  
  const br = document.createElement('br');
  notificationContent.appendChild(br);
  
  const text = document.createTextNode('You\'ve used your 50 free translations today. Add your own API key in settings for unlimited translations.');
  notificationContent.appendChild(text);
  
  const closeButton = document.createElement('button');
  closeButton.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
  `;
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', () => notification.remove());
  notificationContent.appendChild(closeButton);
  
  notification.appendChild(notificationContent);
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  }
  
  // Add to page
  if (document.body) {
    document.body.appendChild(notification);
  }
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    notification.remove();
  }, 10000);
}
