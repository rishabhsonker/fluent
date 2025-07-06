// Fluent Service Worker - Handles storage, caching, and API calls
'use strict';

import { STORAGE_KEYS, DEFAULT_SETTINGS, PERFORMANCE_LIMITS } from '../lib/constants.js';

// State management
const state = {
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
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Fluent: Extension installed', details.reason);
  
  // Set default settings
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.USER_SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.SITE_SETTINGS]: {}
    });
  }
  
  // Load settings
  await loadSettings();
});

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([
      STORAGE_KEYS.USER_SETTINGS,
      STORAGE_KEYS.SITE_SETTINGS
    ]);
    
    state.settings = result[STORAGE_KEYS.USER_SETTINGS] || DEFAULT_SETTINGS;
    const siteSettings = result[STORAGE_KEYS.SITE_SETTINGS] || {};
    state.siteSettings = new Map(Object.entries(siteSettings));
    
    console.log('Fluent: Settings loaded', state.settings);
  } catch (error) {
    console.error('Fluent: Error loading settings', error);
  }
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle async responses
  (async () => {
    try {
      const response = await handleMessage(request, sender);
      sendResponse(response);
    } catch (error) {
      console.error('Fluent: Message handler error', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Handle different message types
async function handleMessage(request, sender) {
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
      return setApiKey(request.apiKey);
      
    case 'GET_DAILY_USAGE':
      return getDailyUsage();
      
    case 'GET_CONTEXT_EXPLANATION':
      return getContextExplanation(request);
      
    case 'GENERATE_CONTEXT':
      return generateContext(request.prompt);
      
    default:
      throw new Error(`Unknown message type: ${request.type}`);
  }
}

// Get settings for a specific tab
async function getSettingsForTab(tab) {
  if (!tab || !tab.url) {
    return { settings: state.settings, siteEnabled: true };
  }
  
  const url = new URL(tab.url);
  const hostname = url.hostname;
  
  // Check site-specific settings
  const siteSettings = state.siteSettings.get(hostname) || {};
  const siteEnabled = siteSettings.enabled !== false;
  
  // Check if globally paused
  const now = Date.now();
  const globallyPaused = state.settings.pausedUntil && state.settings.pausedUntil > now;
  
  return {
    settings: { ...state.settings, ...siteSettings },
    siteEnabled: siteEnabled && !globallyPaused,
    hostname
  };
}

// Update global settings
async function updateSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  await chrome.storage.sync.set({
    [STORAGE_KEYS.USER_SETTINGS]: state.settings
  });
  return { success: true };
}

// Update site-specific settings
async function updateSiteSettings(hostname, settings) {
  state.siteSettings.set(hostname, settings);
  
  // Convert Map to object for storage
  const siteSettingsObj = Object.fromEntries(state.siteSettings);
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SITE_SETTINGS]: siteSettingsObj
  });
  
  return { success: true };
}

// Get translations (with caching)
async function getTranslations(words, language) {
  const translations = {};
  const wordsToTranslate = [];
  
  // Check cache first
  for (const word of words) {
    const cacheKey = `${language}:${word.toLowerCase()}`;
    const cached = state.translationCache.get(cacheKey);
    
    if (cached) {
      translations[word] = cached;
      state.cacheStats.hits++;
    } else {
      wordsToTranslate.push(word);
      state.cacheStats.misses++;
    }
  }
  
  // For now, use mock translations
  if (wordsToTranslate.length > 0) {
    // In production, this would call the translation API
    const { MOCK_TRANSLATIONS } = await import('../lib/constants.js');
    const mockData = MOCK_TRANSLATIONS[language] || {};
    
    for (const word of wordsToTranslate) {
      const translation = mockData[word.toLowerCase()] || word;
      translations[word] = translation;
      
      // Cache the translation
      const cacheKey = `${language}:${word.toLowerCase()}`;
      state.translationCache.set(cacheKey, translation);
    }
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
async function logPerformance(metrics) {
  // Store performance data for analysis
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `${STORAGE_KEYS.DAILY_STATS}_${today}`;
  
  try {
    const result = await chrome.storage.local.get(storageKey);
    const stats = result[storageKey] || {
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
    console.error('Fluent: Error logging performance', error);
  }
  
  return { success: true };
}

// Get cache statistics
function getCacheStats() {
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
async function cleanupOldStats() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  const keys = await chrome.storage.local.get(null);
  const keysToRemove = [];
  
  for (const key in keys) {
    if (key.startsWith(STORAGE_KEYS.DAILY_STATS)) {
      const dateStr = key.split('_').pop();
      const keyDate = new Date(dateStr);
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
chrome.action.onClicked.addListener(async (tab) => {
  // Toggle extension for current site
  const url = new URL(tab.url);
  const hostname = url.hostname;
  const siteSettings = state.siteSettings.get(hostname) || {};
  
  siteSettings.enabled = !siteSettings.enabled;
  await updateSiteSettings(hostname, siteSettings);
  
  // Notify content script
  chrome.tabs.sendMessage(tab.id, {
    type: 'SETTINGS_UPDATED',
    enabled: siteSettings.enabled
  });
});

// Get stored API key
async function getApiKey() {
  try {
    const result = await chrome.storage.sync.get('userApiKey');
    return { apiKey: result.userApiKey || '' };
  } catch (error) {
    console.error('Fluent: Error getting API key', error);
    return { apiKey: '' };
  }
}

// Set API key
async function setApiKey(apiKey) {
  try {
    if (apiKey) {
      await chrome.storage.sync.set({ userApiKey: apiKey });
    } else {
      await chrome.storage.sync.remove('userApiKey');
    }
    return { success: true };
  } catch (error) {
    console.error('Fluent: Error setting API key', error);
    return { success: false, error: error.message };
  }
}

// Get daily usage count
async function getDailyUsage() {
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
    console.error('Fluent: Error getting daily usage', error);
    return { count: 0, date: new Date().toDateString() };
  }
}

// Update daily usage count
async function updateDailyUsage(increment) {
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
    console.error('Fluent: Error updating daily usage', error);
    return null;
  }
}

// Get context explanation for a word
async function getContextExplanation(request) {
  try {
    // Import context helper
    const { contextHelper } = await import('../lib/contextHelper.js');
    
    const explanation = await contextHelper.getExplanation(
      request.word,
      request.translation,
      request.language,
      request.sentence
    );
    
    return { explanation };
  } catch (error) {
    console.error('Fluent: Error getting context explanation', error);
    return { 
      explanation: {
        error: true,
        explanation: 'Unable to load explanation.'
      }
    };
  }
}

// Generate context using AI (Claude Haiku)
async function generateContext(prompt) {
  try {
    // Check for API key
    const apiKeyResult = await getApiKey();
    const apiKey = apiKeyResult.apiKey;
    
    if (!apiKey) {
      // For MVP, return a generic explanation
      return {
        text: JSON.stringify({
          explanation: 'This translation is the most common and natural choice in this context.',
          example: 'Usage varies by context.',
          tip: 'Practice with native speakers to understand nuances.'
        })
      };
    }
    
    // In production, this would call Claude API
    // For now, return mock response
    return {
      text: JSON.stringify({
        explanation: 'This word has multiple meanings, and this translation fits best in your sentence.',
        example: 'Common phrases help you remember the usage.',
        tip: 'Pay attention to context clues around the word.'
      })
    };
  } catch (error) {
    console.error('Fluent: Error generating context', error);
    return { error: error.message };
  }
}

// Monitor performance
setInterval(() => {
  // Log cache performance
  const stats = getCacheStats();
  if (stats.hitRate < PERFORMANCE_LIMITS.MIN_CACHE_HIT_RATE) {
    console.warn('Fluent: Cache hit rate below threshold', stats.hitRate);
  }
  
  // Check memory usage
  if (chrome.runtime.getManifest) {
    // This is a simplified check - in production we'd use more sophisticated monitoring
    const estimatedMemory = state.translationCache.size * 100; // ~100 bytes per entry
    if (estimatedMemory > PERFORMANCE_LIMITS.MAX_MEMORY_MB * 1024 * 1024) {
      console.warn('Fluent: Memory usage high, clearing cache');
      state.translationCache.clear();
      state.cacheStats = { hits: 0, misses: 0, size: 0 };
    }
  }
}, 60000); // Check every minute

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleMessage,
    getTranslations,
    getCacheStats
  };
}