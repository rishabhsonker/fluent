/**
 * Service Worker - Central background service for Fluent Chrome Extension
 * 
 * Purpose:
 * - Acts as the main background process handling all async operations
 * - Manages extension lifecycle, storage, caching, and external API communication
 * - Coordinates between content scripts, popup UI, and remote services
 * 
 * Key Responsibilities:
 * - Installation/update lifecycle (onInstalled, storage migration)
 * - Message routing and handling (GET_TRANSLATIONS, UPDATE_SETTINGS, etc.)
 * - Authentication state management via InstallationAuth
 * - Storage operations (Chrome storage API wrapper)
 * - API communication with Cloudflare Worker endpoints
 * - Cache management for translations
 * - Security validation for all incoming messages
 * 
 * Referenced by:
 * - manifest.json (registered as service_worker)
 * - src/core/injector.ts (sends translation requests)
 * - src/features/ui/popup/App.tsx (settings updates)
 * - src/features/translation/main.ts (receives translations)
 * - All content scripts (via chrome.runtime.sendMessage)
 * 
 * External Dependencies:
 * - Chrome Extension APIs: runtime, storage, tabs
 * - Cloudflare Worker: /config, /translate endpoints
 * - Build-time config from scripts/build-config.js
 */

'use strict';


import { STORAGE_KEYS, DEFAULT_SETTINGS, PERFORMANCE_LIMITS, API_CONFIG } from '../shared/constants';
import { config } from '../shared/config';
import { validator } from '../shared/validator';
import { logger } from '../shared/logger';
import { serviceWorkerSecurityManager as securityManager } from '../shared/security';
import { secureCrypto } from '../features/auth/crypto';
import { InstallationAuth } from '../features/auth/auth';
import { contentScriptManager } from './injector';
import { offlineManager } from '../shared/offline';
import { ComponentAsyncManager } from '../shared/async';
import { rateLimiter } from '../shared/throttle';
import type { UserSettings, SiteSettings, LanguageCode } from '../shared/types';
import { getErrorHandler, type ErrorHandler } from '../shared/utils/error-handler';
import { getMemoryMonitor } from '../shared/monitor';
import { getLifecycleManager } from '../shared/lifecycle';
import { safe } from '../shared/utils/helpers';

// Initialize error handler and lifecycle manager
let errorHandler: ErrorHandler = getErrorHandler();
const lifecycleManager = getLifecycleManager();

// Try to initialize Sentry if available
(async () => {
  await safe(async () => {
    // Check if Sentry packages are available
    if ('@sentry/browser' in (window as any) || config.SENTRY_DSN) {
      const { initSentry } = await import('../shared/utils/sentry');
      errorHandler = await initSentry('background');
      logger.info('[Service Worker] Sentry initialized');
    } else {
      logger.info('[Service Worker] Running without Sentry');
    }
  }, '[Service Worker] Sentry initialization failed, continuing without it');
})();

// Global error handlers
self.addEventListener('error', (event) => {
  logger.error('[Service Worker] Global error:', event.error);
  if (errorHandler) {
    errorHandler.withSyncErrorHandling(
      () => { throw event.error; },
      { operation: 'global-error', component: 'service-worker' }
    );
  }
});

self.addEventListener('unhandledrejection', (event) => {
  logger.error('[Service Worker] Unhandled promise rejection:', event.reason);
  if (errorHandler) {
    errorHandler.withSyncErrorHandling(
      () => { throw event.reason; },
      { operation: 'unhandled-rejection', component: 'service-worker' }
    );
  }
});

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface ServiceWorkerState {
  settings: UserSettings | null;
  siteSettings: Map<string, SiteSettings>;
  translationCache: Map<string, string>;
  cacheStats: CacheStats;
}

interface PerformanceMetrics {
  processingTime?: number;
  wordsReplaced?: number;
  error?: boolean;
}

interface DailyStats {
  pageLoads: number;
  totalProcessingTime: number;
  wordsReplaced: number;
  errors: number;
}

// State management
const state: ServiceWorkerState = {
  settings: null,
  siteSettings: new Map(),
  translationCache: new Map(),
  cacheStats: {
    hits: 0,
    misses: 0,
    size: 0
  }
};

// AsyncManager for service worker
const asyncManager = new ComponentAsyncManager('service-worker');

// Settings loading lock
let settingsLoadPromise: Promise<void> | null = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
  logger.info('[Service Worker] Extension installed/updated', {
    reason: details.reason,
    previousVersion: details.previousVersion
  });
  
  // Initialize lifecycle manager
  await lifecycleManager.initialize();
  
  // Set default settings and initialize installation auth
  if (details.reason === 'install') {
    logger.info('[Service Worker] First installation - setting defaults and initializing auth');
    await chrome.storage.sync.set({
      [STORAGE_KEYS.USER_SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.SITE_SETTINGS]: {}
    });
    
    // Initialize installation authentication with AsyncManager
    await asyncManager.execute(
      'init-installation-auth',
      async () => {
        await safe(async () => {
          logger.info('[Service Worker] Starting installation auth initialization...');
          await InstallationAuth.initialize();
          logger.info('[Service Worker] Installation auth initialized successfully');
        }, 
        '[Service Worker] Failed to initialize installation authentication');
        // Continue without authentication - user can still use their own API key
      },
      { description: 'Initialize installation auth', preventDuplicates: true }
    );
  }
  
  // Migrate API keys from old storage on update
  if (details.reason === 'update') {
    await secureCrypto.migrateFromOldStorage();
    
    // Initialize installation auth if not already done with AsyncManager
    await asyncManager.execute(
      'check-init-auth-update',
      async () => {
        await safe(async () => {
          const installationData = await InstallationAuth.getInstallationData();
          if (!installationData) {
            await InstallationAuth.initialize();
          }
        }, 
        'Failed to initialize authentication on update');
        // Continue without authentication
      },
      { description: 'Check and init auth on update', preventDuplicates: true }
    );
  }
  
  // Load settings
  await loadSettings();
  
});

// Load settings from storage with concurrency protection
async function loadSettings(): Promise<void> {
  // If already loading, return the existing promise
  if (settingsLoadPromise) {
    return settingsLoadPromise;
  }
  
  // Create new loading promise
  settingsLoadPromise = safe(async () => {
    const result = await chrome.storage.sync.get([
      STORAGE_KEYS.USER_SETTINGS,
      STORAGE_KEYS.SITE_SETTINGS
    ]);
    
    // Validate loaded settings
    state.settings = validator.validateSettings(result[STORAGE_KEYS.USER_SETTINGS] || DEFAULT_SETTINGS);
    
    // Validate site settings
    const siteSettings = result[STORAGE_KEYS.SITE_SETTINGS] || {};
    state.siteSettings = new Map();
    for (const [domain, settings] of Object.entries(siteSettings) as [string, any][]) {
      const validDomain = validator.validateDomain(domain);
      if (validDomain) {
        state.siteSettings.set(validDomain, validator.validateSiteSettings(settings));
      }
    }
  }, 
  'Error loading settings'
  ).catch(() => {
    // On error, use defaults
    state.settings = DEFAULT_SETTINGS;
    state.siteSettings = new Map();
  });
  
  // Clear the promise after completion
  try {
    await settingsLoadPromise;
  } finally {
    settingsLoadPromise = null;
  }
}

// Secure message handling
chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  
  
  // Handle async responses
  (async () => {
    const result = await safe(async () => {
      // Validate message security
      securityManager.validateMessage(request, sender);
      
      const response = await handleMessage(request, sender);
      
      // Create secure response
      const secureResponse = await securityManager.createSecureMessage('response', response);
      
      return secureResponse;
    }, 
    'Message handler error',
    { error: 'Message handling failed', secure: false });
    
    sendResponse(result);
  })();
  
  return true; // Keep channel open for async response
});

// Handle different message types
async function handleMessage(request: any, sender: chrome.runtime.MessageSender): Promise<any> {
  
  switch (request.type) {
    case 'GET_SETTINGS':
      return getSettingsForTab(sender.tab);
      
    case 'UPDATE_SETTINGS':
      return updateSettings(request.settings);
      
    case 'UPDATE_SITE_SETTINGS':
      return updateSiteSettings(request.hostname, request.settings);
      
    case 'GET_TRANSLATIONS':
      return getTranslations(request.words, request.language);
      
    case 'LOG_PERFORMANCE':
      return logPerformance(request.metrics);
      
    case 'GET_CACHE_STATS':
      return getCacheStats();
      
    case 'GET_API_KEY':
      return getApiKey();
      
    case 'SET_API_KEY':
      const validKey = validator.validateApiKey(request.apiKey);
      if (!validKey && request.apiKey) {
        throw new Error('Invalid API key format');
      }
      return setApiKey(validKey);
      
    case 'ENABLE_FOR_SITE':
      const enabled = await contentScriptManager.enableForCurrentTab();
      return { success: enabled };
      
    case 'GET_DAILY_USAGE':
      return getDailyUsage();
      
    case 'GET_CONTEXT_EXPLANATION':
      return getContextExplanation(request);
      
    case 'GENERATE_CONTEXT':
      return generateContext(request.prompt);
      
    case 'GET_CONTEXT':
      return getContext(request.word, request.translation, request.language, request.sentence);
      
    case 'GET_LEARNING_STATS':
      return getLearningStats();
      
    case 'GET_RATE_LIMITS':
      return getRateLimits();
      
    case 'SET_PLUS_STATUS':
      return setPlusStatus(request.isPlus);
      
    default:
      throw new Error(`Unknown message type: ${request.type}`);
  }
}

// Get settings for a specific tab
async function getSettingsForTab(tab: chrome.tabs.Tab | undefined): Promise<any> {
  // Ensure settings are loaded
  if (!state.settings) {
    logger.warn('Settings not loaded in state, reloading from storage');
    await loadSettings();
  }
  
  if (!tab || !tab.url) {
    return { settings: state.settings, siteEnabled: true };
  }
  
  const url = new URL(tab.url);
  const hostname = url.hostname;
  
  // Check site-specific settings
  const siteSettings = state.siteSettings.get(hostname) || {} as SiteSettings;
  const siteEnabled = siteSettings.enabled !== false;
  
  // Check if globally paused
  const now = Date.now();
  const globallyPaused = state.settings?.pausedUntil && state.settings.pausedUntil > now;
  
  
  return {
    settings: { ...state.settings, ...siteSettings },
    siteEnabled: siteEnabled && !globallyPaused,
    hostname
  };
}

// Update global settings
async function updateSettings(newSettings: Partial<UserSettings>): Promise<{ success: boolean }> {
  
  // Ensure we have current settings loaded
  if (!state.settings) {
    await loadSettings();
  }
  
  
  // Merge with existing settings
  const mergedSettings = { ...state.settings, ...newSettings };
  
  // Validate settings
  const validated = validator.validateSettings(mergedSettings);
  state.settings = validated;
  
  
  await chrome.storage.sync.set({
    [STORAGE_KEYS.USER_SETTINGS]: state.settings
  });
  
  // Verify save worked
  const saved = await chrome.storage.sync.get(STORAGE_KEYS.USER_SETTINGS);
  
  
  return { success: true };
}

// Update site-specific settings
async function updateSiteSettings(hostname: string, settings: Partial<SiteSettings>): Promise<{ success: boolean }> {
  // Validate domain
  const validDomain = validator.validateDomain(hostname);
  if (!validDomain) {
    throw new Error('Invalid domain');
  }
  
  // Validate settings
  const validatedSettings = validator.validateSiteSettings(settings);
  state.siteSettings.set(validDomain, validatedSettings);
  
  // Convert Map to object for storage
  const siteSettingsObj = Object.fromEntries(state.siteSettings);
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SITE_SETTINGS]: siteSettingsObj
  });
  
  return { success: true };
}

// Get translations (with caching and API calls) with rate limiting
async function getTranslations(words: string[], language: string): Promise<any> {
  // Register this as a critical operation with lifecycle manager
  const cleanup = await lifecycleManager.startOperation({
    id: `translation_${Date.now()}`,
    description: `Translating ${words.length} words to ${language}`,
    critical: true,
    timeout: 30000 // 30 second timeout
  });
  // Apply rate limiting first
  const rateCheck = await rateLimiter.checkLimit('translation', 'global');
  if (!rateCheck.allowed) {
    return {
      translations: {},
      error: `Translation rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetIn || 0) / 1000)} seconds.`,
      rateLimitExceeded: true
    };
  }
  
  // Execute translation with AsyncManager
  return asyncManager.execute(
    'get-translations',
    async () => {
      // Dynamically import the translator module and storage
      const [{ translator }, { getStorage }] = await Promise.all([
        import('../features/translation/translator'),
        import('../features/settings/storage')
      ]);
      
      // Validate inputs
      const validLanguage = validator.validateLanguage(language);
      const validWords = validator.validateWordList(words);
      
      if (validWords.length === 0) {
        return { translations: {}, error: 'No valid words to translate' };
      }
      
      const result = await safe(async () => {
        // Check usage limits
        const storage = getStorage();
        const canTranslate = await storage.canTranslateWords(validWords.length);
        
        if (!canTranslate.allowed) {
          logger.info('Daily limit reached', { 
            requested: validWords.length, 
            remaining: canTranslate.remaining 
          });
          return { 
            translations: {}, 
            error: canTranslate.message || `Daily limit reached! You've used your 100 free translations today.`,
            limitReached: true,
            remaining: canTranslate.remaining
          };
        }
        
        // Use the translator service which handles caching internally
        const result = await translator.translate(validWords, validLanguage as LanguageCode);
        
        // Record successful translations
        if (result.translations && Object.keys(result.translations).length > 0) {
          const translatedCount = Object.keys(result.translations).length;
          await storage.recordTranslations(translatedCount);
          logger.info('Recorded translations', { count: translatedCount });
        }
        
        // Update our background script cache stats
        const cacheInfo = translator.getStats();
        state.cacheStats.hits += cacheInfo.hits;
        state.cacheStats.misses += cacheInfo.misses;
        
        return result;
      }, 
      'Translation error',
      { 
        translations: {}, 
        error: 'Translation failed'
      });
      
      // Always cleanup lifecycle operation
      cleanup();
      
      return result;
    },
    { description: 'Get translations from API', preventDuplicates: false }
  );
}

// Log performance metrics
async function logPerformance(metrics: PerformanceMetrics): Promise<{ success: boolean }> {
  // Store performance data for analysis
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `${STORAGE_KEYS.DAILY_STATS}_${today}`;
  
  await safe(async () => {
    const result = await chrome.storage.local.get(storageKey);
    const stats: DailyStats = result[storageKey] || {
      pageLoads: 0,
      totalProcessingTime: 0,
      wordsReplaced: 0,
      errors: 0
    };
    
    stats.pageLoads++;
    stats.totalProcessingTime += metrics.processingTime || 0;
    stats.wordsReplaced += metrics.wordsReplaced || 0;
    if (metrics.error) stats.errors++;
    
    await chrome.storage.local.set({ [storageKey]: stats });
    
    // Clean up old stats (keep last 7 days)
    cleanupOldStats();
  }, 'Error logging performance');
  
  return { success: true };
}

// Get cache statistics
function getCacheStats(): { cacheSize: number; hitRate: number; hits: number; misses: number } {
  const hitRate = state.cacheStats.hits / 
    (state.cacheStats.hits + state.cacheStats.misses) || 0;
  
  return {
    cacheSize: state.translationCache.size,
    hitRate: hitRate,
    hits: state.cacheStats.hits,
    misses: state.cacheStats.misses
  };
}

// Get context for a word
async function getContext(word: string, translation: string, language: string, sentence?: string): Promise<any> {
  
  return await safe(async () => {
    // Dynamically import modules
    const [{ translator }, { getStorage }] = await Promise.all([
      import('../features/translation/translator'),
      import('../features/settings/storage.js')
    ]);
    
    // Validate inputs
    const validLanguage = validator.validateLanguage(language);
    const validWord = validator.validateWord(word);
    
    if (!validWord) {
      return { context: null, error: 'Invalid word' };
    }
    
    // Check explanation limits
    const storage = getStorage();
    const canView = await storage.canViewExplanations(1);
    
    if (!canView.allowed) {
      logger.info('Daily explanation limit reached', { remaining: canView.remaining });
      return { 
        context: null, 
        error: canView.message || `Daily limit reached! You've used your 100 explanations today.`,
        limitReached: true,
        remaining: canView.remaining
      };
    }
    
    // Get context using the new method
    const context = await translator.getContext(validWord, translation, validLanguage, sentence);
    
    // Record successful explanation view
    if (context) {
      await storage.recordExplanations(1);
      logger.info('Recorded explanation view');
    }
    
    return { context };
  }, 
  'Context fetch error',
  { 
    context: null, 
    error: 'Context fetch failed'
  });
}

// Clean up old statistics
async function cleanupOldStats(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  const keys = await chrome.storage.local.get(null);
  const keysToRemove: string[] = [];
  
  for (const key in keys) {
    if (key.startsWith(STORAGE_KEYS.DAILY_STATS)) {
      const dateStr = key.split('_').pop();
      const keyDate = new Date(dateStr!);
      if (keyDate < cutoffDate) {
        keysToRemove.push(key);
      }
    }
  }
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}


// Listen for storage changes to keep state in sync
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[STORAGE_KEYS.USER_SETTINGS]) {
    const newSettings = changes[STORAGE_KEYS.USER_SETTINGS].newValue;
    if (newSettings) {
      state.settings = validator.validateSettings(newSettings);
    }
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  // Toggle extension for current site
  const url = new URL(tab.url!);
  const hostname = url.hostname;
  const siteSettings = state.siteSettings.get(hostname) || {} as SiteSettings;
  
  siteSettings.enabled = !siteSettings.enabled;
  await updateSiteSettings(hostname, siteSettings);
  
  // Notify content script
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SETTINGS_UPDATED',
      enabled: siteSettings.enabled
    });
  }
});


// Get daily usage count
async function getDailyUsage(): Promise<{ 
  wordsToday: number; 
  wordsLimit: number; 
  explanationsToday: number;
  explanationsLimit: number;
  isPlus: boolean; 
  wordsRemaining: number;
  explanationsRemaining: number;
}> {
  return await safe(async () => {
    const { getStorage } = await import('../features/settings/storage');
    const storage = getStorage();
    const stats = await storage.getUsageStats();
    
    return {
      ...stats,
      wordsRemaining: stats.isPlus ? Infinity : Math.max(0, stats.wordsLimit - stats.wordsToday),
      explanationsRemaining: stats.isPlus ? Infinity : Math.max(0, stats.explanationsLimit - stats.explanationsToday)
    };
  }, 
  'Error getting daily usage',
  { 
    wordsToday: 0, 
    wordsLimit: 100, 
    explanationsToday: 0,
    explanationsLimit: 100,
    isPlus: false, 
    wordsRemaining: 100,
    explanationsRemaining: 100,
    wordsPercentage: 0,
    explanationsPercentage: 0
  });
}


// Get context explanation for a word
async function getContextExplanation(request: { word: string; translation: string; language: string; sentence: string }): Promise<any> {
  return await safe(async () => {
    // Import context helper
    const { contextHelper } = await import('../features/translation/explainer');
    
    const explanation = await contextHelper.getExplanation(
      request.word,
      request.translation,
      request.language,
      request.sentence
    );
    
    return { explanation };
  }, 
  'Error getting context explanation',
  { 
    explanation: {
      error: true,
      explanation: 'Unable to load explanation.'
    }
  });
}

// Generate context using AI (Claude Haiku) with AsyncManager and rate limiting
async function generateContext(prompt: string): Promise<{ text?: string; error?: string }> {
  try {
    // Check if we have the Cloudflare Worker URL
    if (!API_CONFIG.TRANSLATOR_API) {
      return {
        text: JSON.stringify({
          explanation: 'Translation API not configured.',
          tip: 'Please configure the Cloudflare Worker first.'
        })
      };
    }
    
    // Parse the prompt to extract word info (it's in our formatted prompt)
    const wordMatch = prompt.match(/Explain why "([^"]+)" translates to "([^"]+)" in (\w+)/);
    const word = wordMatch?.[1] || '';
    const translation = wordMatch?.[2] || '';
    const language = wordMatch?.[3] || '';
    
    // Call Cloudflare Worker with context request - using AsyncManager and rate limiting
    const result = await safe(async () => {
      return await rateLimiter.withRateLimit(
        'context',
        'global',
        async () => {
          const response = await asyncManager.fetch(
            'generate-context',
            API_CONFIG.TRANSLATOR_API,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                type: 'context',
                prompt,
                word,
                translation,
                language
              })
            },
            { description: 'Generate AI context explanation' }
          );
          
          const result = await response.json();
          
          if (result.error) {
            throw new Error(result.error);
          }
          
          return {
            text: JSON.stringify(result.explanation)
          };
        }
      );
    }, 'Error generating context');
    
    return result;
  } catch (error) {
    // Check if it's a rate limit error
    if (error && typeof error === 'object' && 'rateLimitExceeded' in error) {
      const rlError = error as any;
      return {
        error: `Rate limit exceeded. Try again in ${Math.ceil(rlError.resetIn / 1000)} seconds.`
      };
    }
    
    // Fallback response
    return {
      text: JSON.stringify({
        explanation: 'Unable to generate detailed explanation. The translation is accurate for this context.',
        tip: 'Try again later for detailed explanations.'
      })
    };
  }
}

// Monitor performance with AsyncManager
asyncManager.execute(
  'performance-monitor',
  async (signal) => {
    while (!signal.aborted) {
      // Log cache performance
      const stats = getCacheStats();
      if (stats.hitRate < PERFORMANCE_LIMITS.MIN_CACHE_HIT_RATE) {
        logger.warn('Cache hit rate below threshold', stats.hitRate);
      }
      
      // Check memory usage with proper monitoring
      const memoryMonitor = getMemoryMonitor();
      const memoryStats = await memoryMonitor.checkMemory();
      const action = memoryMonitor.getRecommendedAction(memoryStats);
      
      if (action === 'cleanup' || action === 'reload') {
        logger.warn('[Worker] Memory usage high, clearing caches', {
          stats: memoryMonitor.getFormattedStats(memoryStats),
          action
        });
        
        // Clear translation cache
        state.translationCache.clear();
        state.cacheStats = { hits: 0, misses: 0, size: 0 };
        
        // Clear site settings cache if needed
        if (action === 'reload' && state.siteSettings.size > 100) {
          const essentialDomains = Array.from(state.siteSettings.keys()).slice(0, 20);
          const essentialSettings = new Map();
          essentialDomains.forEach(domain => {
            essentialSettings.set(domain, state.siteSettings.get(domain));
          });
          state.siteSettings = essentialSettings;
        }
        
        // Trigger garbage collection
        await memoryMonitor.forceGarbageCollection();
      }
      
      // Wait for next check interval
      await asyncManager.delay(60000, signal); // Check every minute
    }
  },
  { description: 'Performance monitoring', cancelOnNavigation: false }
);

// Get API key
async function getApiKey(): Promise<{ apiKey: string }> {
  return await safe(async () => {
    const key = await secureCrypto.getApiKey();
    return { apiKey: key || '' };
  }, 'Error getting API key', { apiKey: '' });
}

// Set API key
async function setApiKey(apiKey: string | null): Promise<{ success: boolean; error?: string }> {
  return await safe(async () => {
    await secureCrypto.storeApiKey(apiKey);
    return { success: true };
  }, 'Error setting API key')
    .catch(() => ({ success: false, error: 'Failed to set API key' }));
}

// Get learning statistics
async function getLearningStats(): Promise<{ stats: any }> {
  return await safe(async () => {
    // Get current language from settings
    const settings = state.settings || DEFAULT_SETTINGS;
    const language = settings.targetLanguage || 'spanish';
    
    // Import storage module
    const { getStorage } = await import('../features/settings/storage');
    const storage = getStorage();
    
    // Get learning stats
    const stats = await storage.getLearningStats(language);
    
    return { stats };
  }, 'Error getting learning stats', {
    stats: {
      totalWords: 0,
      masteredWords: 0,
      wordsInProgress: 0,
      wordsDueForReview: 0,
      averageMastery: 0,
      todayReviews: 0
    }
  });
}

// Set Plus status for the user
async function setPlusStatus(isPlus: boolean): Promise<{ success: boolean }> {
  return await safe(async () => {
    const { getStorage } = await import('../features/settings/storage');
    const storage = getStorage();
    const success = await storage.setPlusStatus(isPlus);
    
    logger.info('Plus status updated', { isPlus });
    return { success };
  }, 'Error setting plus status', { success: false });
}

// Get rate limit information from last API response or storage
async function getRateLimits(): Promise<any> {
  return await safe(async () => {
    // Get cached rate limit info
    const result = await chrome.storage.local.get(['rateLimitInfo']);
    const cached = result.rateLimitInfo;
    
    // Calculate time until reset
    const now = Date.now();
    const hourlyResetTime = cached?.lastChecked ? 
      cached.lastChecked + (60 * 60 * 1000) : now + (60 * 60 * 1000);
    const dailyResetTime = cached?.lastChecked ? 
      cached.lastChecked + (24 * 60 * 60 * 1000) : now + (24 * 60 * 60 * 1000);
    
    const limits = {
      translationLimits: {
        hourlyRemaining: cached?.translationHourlyRemaining ?? 100,
        hourlyLimit: 100,
        dailyRemaining: cached?.translationDailyRemaining ?? 1000,
        dailyLimit: 1000
      },
      aiLimits: {
        hourlyRemaining: cached?.aiHourlyRemaining ?? 10,
        hourlyLimit: 10,
        dailyRemaining: cached?.aiDailyRemaining ?? 100,
        dailyLimit: 100
      },
      nextResetIn: {
        hourly: Math.max(0, Math.floor((hourlyResetTime - now) / (60 * 1000))), // minutes
        daily: Math.max(0, Math.floor((dailyResetTime - now) / (60 * 60 * 1000))) // hours
      }
    };
    
    return { limits };
  }, 'Failed to get rate limits', {
    limits: {
      translationLimits: { hourlyRemaining: 100, hourlyLimit: 100, dailyRemaining: 1000, dailyLimit: 1000 },
      aiLimits: { hourlyRemaining: 10, hourlyLimit: 10, dailyRemaining: 100, dailyLimit: 100 },
      nextResetIn: { hourly: 60, daily: 24 }
    }
  });
}

// Initialize settings on service worker startup with AsyncManager
asyncManager.execute(
  'service-worker-init',
  async () => {
    await safe(async () => {
      await loadSettings();
      
      // Ensure InstallationAuth is initialized
      await safe(async () => {
        const installationData = await InstallationAuth.getInstallationData();
        if (!installationData) {
          await InstallationAuth.initialize();
        }
      }, 'Failed to ensure installation auth');
    }, 'Failed to initialize service worker settings');
  },
  { description: 'Initialize service worker', preventDuplicates: true }
);

// Clean up resources on extension suspend to prevent memory leaks
chrome.runtime.onSuspend?.addListener(() => {
  logger.info('[Service Worker] Extension suspending - cleaning up resources');
  
  // Clean up all singleton instances
  asyncManager.cleanup();
  rateLimiter.destroy();
  offlineManager.destroy();
  
  // Clear state maps
  state.siteSettings.clear();
  state.translationCache.clear();
  
  logger.info('[Service Worker] Cleanup complete');
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleMessage,
    getTranslations,
    getCacheStats
  };
}