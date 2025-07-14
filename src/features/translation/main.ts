/**
 * Main Translation Script - Core content script for word replacement
 * 
 * Purpose:
 * - Implements the primary translation functionality on web pages
 * - Finds and replaces English words with translations in target language
 * - Manages the complete translation lifecycle on each page
 * 
 * Key Responsibilities:
 * - Text node discovery and processing (findTextNodes)
 * - Word selection algorithm (5-6 words per page)
 * - DOM manipulation for word replacement
 * - Tooltip initialization and management
 * - Performance monitoring (<50ms target)
 * - Memory management (<30MB limit)
 * - Cleanup on page navigation
 * 
 * Performance Constraints:
 * - Must process page within 50ms
 * - Memory usage must stay under 30MB
 * - Batch processing to avoid blocking main thread
 * 
 * Referenced by:
 * - src/core/injector.ts (dynamically injected after checks)
 * - src/core/worker.ts (provides translation data)
 * - src/features/ui/tooltip/tooltip.ts (creates tooltips)
 * - src/features/translation/processor.ts (handles text processing)
 * 
 * Dependencies:
 * - Chrome runtime API for messaging
 * - MutationObserver for dynamic content
 * - Component managers for tooltips and UI elements
 */


import { logger } from '../../shared/logger';
import { ComponentAsyncManager } from '../../shared/async';
import { rateLimiter } from '../../shared/throttle';
import { safe, sendMessage } from '../../shared/utils/helpers';
import type { UserSettings, LanguageCode } from '../../shared/types';
import { TIME, NUMERIC, RATE_LIMITS, PROCESSING, ANIMATION, ARRAY } from '../../shared/constants';
import { CSS_SHADOWS } from '../../shared/constants/css-variables';
import type { Tooltip } from '../ui/tooltip/tooltip';
import type { PageControl } from '../ui/widget/widget';
import type { WordReplacer } from './replacer';
import type { TextProcessor } from './processor';
import { shouldProcessSite, getSiteConfig, shouldSkipElement, type SiteConfig, SITE_CONFIGS } from './config';
import { showErrorNotification, showLimitNotification } from './notifications';
import { ContentScriptErrorBoundary } from './boundary';


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


(async function() {
  'use strict';
  
  // Skip iframes - improves performance by avoiding unnecessary processing
  if (window.self !== window.top) {
    logger.info('Fluent: Skipping iframe');
    return;
  }
  
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
  let isCleaningUp = false;
  
  // AsyncManager for this content script
  const asyncManager = new ComponentAsyncManager('content-script');
  
  // Throttle state for scroll/resize handlers
  let scrollThrottled = false;
  let resizeThrottled = false;
  
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

  
  // Main processing function with initialization lock
  async function processContent(): Promise<void> {
    // Don't process if we're cleaning up
    if (isCleaningUp) {
      logger.info('Skipping processContent during cleanup');
      return;
    }
    
    if (initializationPromise) {
      return initializationPromise;
    }
    
    // Wrap with error boundary for crash protection
    initializationPromise = ContentScriptErrorBoundary.wrap(
      doProcessContent,
      'processContent',
      {
        maxErrors: 3,
        resetDelay: 60000,
        onError: (error, context) => {
          logger.error(`Error in ${context}:`, error);
          // Additional error handling if needed
        },
        onDisable: () => {
          logger.error('Content script disabled due to excessive errors');
          cleanup();
        }
      }
    ).then(() => {
      // Success case - return void
    }).finally(() => {
      // Only clear if we're not in the middle of cleanup
      if (!isCleaningUp) {
        initializationPromise = null;
      }
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
      const processor = await safe(
        async () => {
          const { TextProcessor } = await import('./processor');
          return new TextProcessor(CONFIG);
        },
        'main.loadTextProcessor',
        null
      );
      
      if (!processor) {
        return; // Cannot continue without processor
      }
      textProcessorInstance = processor;
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
      const [replacerModule, storageModule] = await Promise.all([
        import('./replacer'),
        import('../settings/storage')
      ]);
      
      await safe(async () => {
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
        const wordsToReplace = await safe(
          () => replacerInstance!.analyzeText(textNodes),
          'main.analyzeText',
          []
        );
        logger.debug(`Selected ${wordsToReplace.length} words for replacement`);
        
        if (wordsToReplace.length === 0) {
          return;
        }
        
        // Get translations through background script to avoid CORS - with AsyncManager
        let result = await safe(
          async () => {
            logger.info('Sending translation request for words:', wordsToReplace);
            return await asyncManager.execute(
              'translate-words',
              async (signal) => {
                // Check if we can use AbortSignal with chrome.runtime.sendMessage
                // Chrome doesn't support AbortSignal in sendMessage, so we'll handle cancellation differently
                const messagePromise = chrome.runtime.sendMessage({
                  type: 'GET_TRANSLATIONS',
                  words: wordsToReplace,
                  language: targetLanguage
                });
                
                // Create a race between the message and abort signal
                return await Promise.race([
                  messagePromise,
                  new Promise((_, reject) => {
                    signal.addEventListener('abort', () => reject(new Error('Translation cancelled')));
                  })
                ]);
              },
              { description: 'Translate selected words', preventDuplicates: true }
            );
          },
          'main.translateWords',
          { translations: {} }
        );
        logger.info('Translation response received:', result);
        
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
          if (actualResult.error.includes('daily limit') || actualResult.error.includes(`${RATE_LIMITS.DAILY_WORDS} words`)) {
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
        const replacedCount = await safe(
          () => replacerInstance!.replaceWords(textNodes, wordsToReplace, translationMap, contextMap),
          'main.replaceWords',
          0
        );
        logger.debug(`Replaced ${replacedCount} words`);
        
        // Update daily stats with error handling
        if (replacedCount > 0) {
          await safe(
            async () => {
              const stats = await storage.getDailyStats();
              await storage.updateDailyStats({
                wordsLearned: stats.wordsLearned + replacedCount,
                pagesVisited: stats.pagesVisited + 1
              });
            },
            'main.updateStats'
          );
        }
        
        // Cleanup replacer after use
        replacerInstance?.cleanup();
        replacerInstance = null;
      }, 'main.initializeComponents');
      
      // Report performance
      const processingTime = performance.now() - startTime;
      logger.debug(`Processed in ${processingTime.toFixed(NUMERIC.DECIMAL_PRECISION_2)}ms`);
    }
  }

  // Initialize components and styles with AsyncManager
  async function initializeExtension(): Promise<void> {
    logger.debug('Initializing extension');
    
    return asyncManager.execute(
      'initialize-extension',
      async (signal) => {
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
            box-shadow: ${CSS_SHADOWS.TOOLTIP} !important;
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
            logger.debug('Styles loaded successfully');
          };
          
          if (document.head) {
            document.head.appendChild(link);
          }
          
          // Initialize storage with error handling
          const storage = await safe(
        async () => {
          const storageModule = await import('../settings/storage');
          return storageModule.getStorage();
        },
        'main.loadStorage',
        null
      );
      
      if (!storage) {
        return; // Cannot continue without storage
      }
      
      // Get settings with fallback
      let settings = await safe(
        () => storage.getSettings(),
        'main.loadSettings',
        null
      );
      
      if (settings) {
        logger.info('Content script loaded settings:', settings);
      } else {
        // Try to get settings from background script as fallback
        settings = await safe(
          async () => {
            const response = await sendMessage<{ settings?: UserSettings }>('GET_SETTINGS');
            if (response && response.settings) {
              logger.info('Got settings from background script:', response.settings);
              return response.settings;
            }
            return null;
          },
          'main.getSettingsBackground',
          { targetLanguage: 'spanish', enabled: true } as UserSettings // Use defaults
        );
      }
      
      // Initialize Tooltip with error boundary
      await safe(
        async () => {
          const tooltipModule = await import('../ui/tooltip/tooltip');
          tooltipInstance = new tooltipModule.Tooltip();
          tooltipInstance.storage = storage;
          tooltipInstance.currentLanguage = (settings?.targetLanguage || 'spanish') as LanguageCode;
        },
        'main.initTooltip'
      );
      
      // Initialize PageControl with error boundary
      await safe(
        async () => {
          const pageControlModule = await import('../ui/widget/widget');
          pageControlInstance = new pageControlModule.PageControl({
            ...settings!,
            targetLanguage: settings!.targetLanguage as LanguageCode
          });
        },
        'main.initPageControl'
      );
      
          // Process content with error boundary
          await processContent();
        } catch (err) {
          logger.error('Critical initialization error', err);
          // Cleanup on critical failure
          await cleanup();
        }
      },
      { description: 'Initialize extension components', preventDuplicates: true }
    );
  }
  
  // Initialize when DOM is ready with AsyncManager
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    // Use AsyncManager's delay for better control
    asyncManager.execute(
      'defer-init',
      async (signal) => {
        if ('requestIdleCallback' in window) {
          await new Promise<void>((resolve) => {
            requestIdleCallback(() => resolve(), { timeout: NUMERIC.PERCENTAGE_MAX });
          });
          // Check if cancelled
          if (signal.aborted) return;
        } else {
          await asyncManager.delay(0, signal);
        }
        await initializeExtension();
      },
      { description: 'Defer initialization', preventDuplicates: true }
    );
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
      if (now - lastMutationTime < TIME.MS_PER_SECOND) {
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
      // Use AsyncManager for debounced processing
      asyncManager.execute(
        'debounced-process',
        async (signal) => {
          await asyncManager.delay(CONFIG.DEBOUNCE_DELAY, signal);
          if (signal.aborted) return;
          
          if ('requestIdleCallback' in window) {
            await new Promise<void>((resolve) => {
              requestIdleCallback(() => resolve(), { timeout: NUMERIC.PERCENTAGE_MAX });
            });
            if (signal.aborted) return;
          }
          
          await processContent();
        },
        { description: 'Debounced content processing', preventDuplicates: true }
      );
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
  async function cleanup(): Promise<void> {
    // Set cleanup flag to prevent new operations
    isCleaningUp = true;
    
    // Cancel all pending async operations
    await asyncManager.cleanup();
    
    // Clear timeouts
    if (observerTimeout) {
      clearTimeout(observerTimeout);
      observerTimeout = undefined;
    }
    
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
      navigationTimeout = null;
    }
    
    // Reset error boundary state
    ContentScriptErrorBoundary.reset();
    
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
    
    // Restore original History API methods
    if (typeof originalPushState !== 'undefined') {
      history.pushState = originalPushState;
    }
    if (typeof originalReplaceState !== 'undefined') {
      history.replaceState = originalReplaceState;
    }
    
    // Remove popstate listener
    window.removeEventListener('popstate', checkNavigation);
    
    // Remove global reference
    delete window.__fluent;
    
    // Reset cleanup flag
    isCleaningUp = false;
  }
  
  // Listen for extension context invalidation with AsyncManager
  if (chrome.runtime?.id) {
    // Use AsyncManager for periodic checks
    asyncManager.execute(
      'context-check',
      async (signal) => {
        while (!signal.aborted && chrome.runtime?.id) {
          await asyncManager.delay(NUMERIC.MINUTES_SHORT * TIME.MS_PER_SECOND, signal);
          if (!chrome.runtime?.id) {
            // Extension context invalidated, cleanup
            await cleanup();
            break;
          }
        }
      },
      { description: 'Monitor extension context', cancelOnNavigation: false }
    );
  }
  
  // Cleanup when page is hidden (more reliable than deprecated 'unload')
  window.addEventListener('pagehide', cleanup);
  
  // Also cleanup when document visibility changes to hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !chrome.runtime?.id) {
      cleanup();
    }
  });
  
  // Handle SPA navigation with debouncing
  let lastUrl = location.href;
  let navigationTimeout: number | null = null;
  
  const checkNavigation = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      logger.info('SPA navigation detected, reinitializing');
      
      // Cancel any pending navigation handling
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
      
      // Debounce navigation handling to prevent rapid re-initialization
      navigationTimeout = window.setTimeout(() => {
        navigationTimeout = null;
        
        // Use AsyncManager for coordinated cleanup and reinitialization
        asyncManager.execute(
          'spa-navigation',
          async (signal) => {
            // First cleanup
            await cleanup();
            
            if (signal.aborted) return;
            
            // Wait a bit for DOM to stabilize
            await asyncManager.delay(NUMERIC.PERCENTAGE_MAX, signal);
            
            if (signal.aborted) return;
            
            // Check if we should process this page
            const settings = await chrome.storage.local.get(['enabled', 'siteSettings']);
            if (settings.enabled) {
              const hostname = window.location.hostname;
              const siteSettings = settings.siteSettings?.[hostname];
              if (!siteSettings || siteSettings.enabled !== false) {
                await processContent();
              }
            }
          },
          { 
            description: 'SPA navigation handler', 
            preventDuplicates: true,
            cancelOnNavigation: false // Don't cancel on navigation since we're handling navigation
          }
        );
      }, ANIMATION.FADE_DURATION_MS); // 200ms debounce
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
  // Add throttled scroll handler for performance
  window.addEventListener('scroll', () => {
    if (scrollThrottled) return;
    
    scrollThrottled = true;
    asyncManager.execute(
      'scroll-throttle',
      async (signal) => {
        await asyncManager.delay(ANIMATION.THROTTLE_DELAY_MS, signal); // 100ms throttle
        scrollThrottled = false;
        
        // Could trigger lazy loading or other scroll-based features here
        // For now, just reset the throttle flag
      },
      { description: 'Throttle scroll events', preventDuplicates: true }
    );
  });
  
  // Add throttled resize handler
  window.addEventListener('resize', () => {
    if (resizeThrottled) return;
    
    resizeThrottled = true;
    asyncManager.execute(
      'resize-throttle',
      async (signal) => {
        await asyncManager.delay(TIME.MS_PER_SECOND / NUMERIC.DECIMAL_PRECISION_2 / ARRAY.PAIR_SIZE, signal); // 250ms throttle for resize
        resizeThrottled = false;
        
        // Could reposition tooltips or adjust layout here
        // For now, just reset the throttle flag
      },
      { description: 'Throttle resize events', preventDuplicates: true }
    );
  });

})();
