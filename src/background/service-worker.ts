// Fluent Service Worker - Handles storage, caching, and API calls
'use strict';

import { STORAGE_KEYS, DEFAULT_SETTINGS, PERFORMANCE_LIMITS, API_CONFIG } from '../lib/constants.js';
import { validator } from '../lib/validator.js';
import { logger } from '../lib/logger.js';
import { serviceWorkerSecurityManager as securityManager } from '../lib/securityServiceWorker.js';
import { secureCrypto } from '../lib/secureCrypto.js';
import { ExtensionAuthenticator } from '../lib/auth.js';
import { contentScriptManager } from './contentScriptManager.js';
import { offlineManager } from '../lib/offlineManager.js';
import type { UserSettings, SiteSettings, LanguageCode } from '../types';

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

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
  logger.info('Extension installed', details.reason);
  
  // Set default settings
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.USER_SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.SITE_SETTINGS]: {}
    });
    
    // Initialize authentication
    await ExtensionAuthenticator.initialize();
  }
  
  // Migrate API keys from old storage on update
  if (details.reason === 'update') {
    await secureCrypto.migrateFromOldStorage();
  }
  
  // Load settings
  await loadSettings();
});

// Load settings from storage
async function loadSettings(): Promise<void> {
  try {
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
    
    logger.debug('Settings loaded', state.settings);
  } catch (error) {
    logger.error('Error loading settings', error);
  }
}

// Secure message handling
chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  // Handle async responses
  (async () => {
    try {
      // Validate message security
      securityManager.validateMessage(request, sender);
      
      const response = await handleMessage(request, sender);
      
      // Create secure response
      const secureResponse = await securityManager.createSecureMessage('response', response);
      sendResponse(secureResponse);
    } catch (error) {
      logger.error('Message handler error', error);
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error', secure: false });
    }
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
      
    case 'GET_LEARNING_STATS':
      return getLearningStats();
      
    default:
      throw new Error(`Unknown message type: ${request.type}`);
  }
}

// Get settings for a specific tab
async function getSettingsForTab(tab: chrome.tabs.Tab | undefined): Promise<any> {
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
  // Validate settings
  const validated = validator.validateSettings({ ...state.settings, ...newSettings });
  state.settings = validated;
  
  await chrome.storage.sync.set({
    [STORAGE_KEYS.USER_SETTINGS]: state.settings
  });
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

// Get translations (with caching)
async function getTranslations(words: string[], language: string): Promise<any> {
  // Validate inputs
  const validLanguage = validator.validateLanguage(language);
  const validWords = validator.validateWordList(words);
  
  if (validWords.length === 0) {
    return { translations: {}, error: 'No valid words to translate' };
  }
  
  const translations: Record<string, string> = {};
  const wordsToTranslate: string[] = [];
  
  // Check cache first
  for (const word of validWords) {
    const cacheKey = `${validLanguage}:${word.toLowerCase()}`;
    const cached = state.translationCache.get(cacheKey);
    
    if (cached) {
      translations[word] = cached;
      state.cacheStats.hits++;
    } else {
      wordsToTranslate.push(word);
      state.cacheStats.misses++;
    }
  }
  
  // Return empty translations if we have words to translate (API will be called from content script)
  if (wordsToTranslate.length > 0) {
    // In production, translations are fetched via the translation service
    // This is just a cache lookup - actual translations happen elsewhere
    return { 
      translations, 
      fromCache: false,
      error: 'Translations should be fetched from translation service'
    };
  }
  
  // Implement cache size limit
  if (state.translationCache.size > 10000) {
    // Remove oldest entries (simple FIFO for now)
    const entriesToRemove = state.translationCache.size - 8000;
    const keys = Array.from(state.translationCache.keys());
    for (let i = 0; i < entriesToRemove; i++) {
      state.translationCache.delete(keys[i]);
    }
  }
  
  return { translations, fromCache: wordsToTranslate.length === 0 };
}

// Log performance metrics
async function logPerformance(metrics: PerformanceMetrics): Promise<{ success: boolean }> {
  // Store performance data for analysis
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `${STORAGE_KEYS.DAILY_STATS}_${today}`;
  
  try {
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
  } catch (error) {
    logger.error('Error logging performance', error);
  }
  
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
async function getDailyUsage(): Promise<{ count: number; date: string }> {
  try {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get('dailyUsage');
    const usage = result.dailyUsage || { date: today, count: 0 };
    
    // Reset if new day
    if (usage.date !== today) {
      usage.date = today;
      usage.count = 0;
      await chrome.storage.local.set({ dailyUsage: usage });
    }
    
    return { count: usage.count, date: usage.date };
  } catch (error) {
    logger.error('Error getting daily usage', error);
    return { count: 0, date: new Date().toDateString() };
  }
}

// Update daily usage count (currently unused but kept for future use)
// @ts-ignore - unused function
async function updateDailyUsage(increment: number): Promise<{ count: number; date: string } | null> {
  try {
    const usage = await getDailyUsage();
    usage.count += increment;
    await chrome.storage.local.set({ 
      dailyUsage: { 
        date: usage.date, 
        count: usage.count 
      } 
    });
    return usage;
  } catch (error) {
    logger.error('Error updating daily usage', error);
    return null;
  }
}

// Get context explanation for a word
async function getContextExplanation(request: { word: string; translation: string; language: string; sentence: string }): Promise<any> {
  try {
    // Import context helper
    const { contextHelper } = await import('../lib/contextHelper');
    
    const explanation = await contextHelper.getExplanation(
      request.word,
      request.translation,
      request.language,
      request.sentence
    );
    
    return { explanation };
  } catch (error) {
    logger.error('Error getting context explanation', error);
    return { 
      explanation: {
        error: true,
        explanation: 'Unable to load explanation.'
      }
    };
  }
}

// Generate context using AI (Claude Haiku)
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
    
    // Call Cloudflare Worker with context request
    const response = await fetch(API_CONFIG.TRANSLATOR_API, {
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
    });
    
    if (!response.ok) {
      throw new Error(`Worker error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return {
      text: JSON.stringify(result.explanation)
    };
    
  } catch (error) {
    logger.error('Error generating context', error);
    
    // Fallback response
    return {
      text: JSON.stringify({
        explanation: 'Unable to generate detailed explanation. The translation is accurate for this context.',
        tip: 'Try again later for detailed explanations.'
      })
    };
  }
}

// Monitor performance
setInterval(() => {
  // Log cache performance
  const stats = getCacheStats();
  if (stats.hitRate < PERFORMANCE_LIMITS.MIN_CACHE_HIT_RATE) {
    logger.warn('Cache hit rate below threshold', stats.hitRate);
  }
  
  // Check memory usage
  if (chrome.runtime.getManifest()) {
    // This is a simplified check - in production we'd use more sophisticated monitoring
    const estimatedMemory = state.translationCache.size * 100; // ~100 bytes per entry
    if (estimatedMemory > PERFORMANCE_LIMITS.MAX_MEMORY_MB * 1024 * 1024) {
      logger.warn('Memory usage high, clearing cache');
      state.translationCache.clear();
      state.cacheStats = { hits: 0, misses: 0, size: 0 };
    }
  }
}, 60000); // Check every minute

// Get API key
async function getApiKey(): Promise<{ apiKey: string }> {
  try {
    const key = await secureCrypto.getApiKey();
    return { apiKey: key || '' };
  } catch (error) {
    logger.error('Error getting API key:', error);
    return { apiKey: '' };
  }
}

// Set API key
async function setApiKey(apiKey: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    await secureCrypto.storeApiKey(apiKey);
    return { success: true };
  } catch (error) {
    logger.error('Error setting API key:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get learning statistics
async function getLearningStats(): Promise<{ stats: any }> {
  try {
    // Get current language from settings
    const settings = state.settings || DEFAULT_SETTINGS;
    const language = settings.targetLanguage || 'spanish';
    
    // Import storage module
    const { getStorage } = await import('../lib/storage.js');
    const storage = getStorage();
    
    // Get learning stats
    const stats = await storage.getLearningStats(language);
    
    return { stats };
  } catch (error) {
    logger.error('Error getting learning stats', error);
    return { 
      stats: {
        totalWords: 0,
        masteredWords: 0,
        wordsInProgress: 0,
        wordsDueForReview: 0,
        averageMastery: 0,
        todayReviews: 0
      }
    };
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleMessage,
    getTranslations,
    getCacheStats
  };
}