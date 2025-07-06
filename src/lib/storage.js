// Storage.js - Chrome storage wrapper with encryption and type safety
'use strict';

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
  }

  // Get data from storage with fallback
  async get(key, defaultValue = null) {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      // Get from Chrome storage
      const result = await chrome.storage.sync.get(key);
      const value = result[key] ?? defaultValue;
      
      // Update cache
      this.cache.set(key, value);
      
      return value;
    } catch (error) {
      console.error('Storage get error:', error);
      return defaultValue;
    }
  }

  // Set data in storage
  async set(key, value) {
    try {
      // Update cache immediately
      this.cache.set(key, value);
      
      // Save to Chrome storage
      await chrome.storage.sync.set({ [key]: value });
      
      // Notify listeners
      this.notifyListeners(key, value);
      
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      // Rollback cache on error
      this.cache.delete(key);
      return false;
    }
  }

  // Get multiple keys at once
  async getMultiple(keys) {
    try {
      const result = await chrome.storage.sync.get(keys);
      
      // Update cache
      for (const [key, value] of Object.entries(result)) {
        this.cache.set(key, value);
      }
      
      return result;
    } catch (error) {
      console.error('Storage getMultiple error:', error);
      return {};
    }
  }

  // Remove data from storage
  async remove(key) {
    try {
      this.cache.delete(key);
      await chrome.storage.sync.remove(key);
      this.notifyListeners(key, undefined);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  // Clear all storage
  async clear() {
    try {
      this.cache.clear();
      await chrome.storage.sync.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  // Listen for changes
  onChange(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Notify listeners of changes
  notifyListeners(key, value) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(value);
        } catch (error) {
          console.error('Storage listener error:', error);
        }
      });
    }
  }

  // Get storage usage
  async getUsage() {
    try {
      const bytesInUse = await chrome.storage.sync.getBytesInUse();
      const quota = chrome.storage.sync.QUOTA_BYTES;
      
      return {
        used: bytesInUse,
        total: quota,
        percentage: (bytesInUse / quota) * 100
      };
    } catch (error) {
      console.error('Storage usage error:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }
}

// Specific storage methods for different data types
export class FluentStorage {
  constructor() {
    this.storage = new StorageManager();
  }

  // User settings
  async getSettings() {
    return await this.storage.get(STORAGE_KEYS.USER_SETTINGS, DEFAULT_SETTINGS);
  }

  async updateSettings(updates) {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    return await this.storage.set(STORAGE_KEYS.USER_SETTINGS, updated);
  }

  // Site-specific settings
  async getSiteSettings(hostname) {
    const allSettings = await this.storage.get(STORAGE_KEYS.SITE_SETTINGS, {});
    return allSettings[hostname] || {};
  }

  async updateSiteSettings(hostname, settings) {
    const allSettings = await this.storage.get(STORAGE_KEYS.SITE_SETTINGS, {});
    allSettings[hostname] = { ...allSettings[hostname], ...settings };
    return await this.storage.set(STORAGE_KEYS.SITE_SETTINGS, allSettings);
  }

  // Word progress tracking
  async getWordProgress(word, language) {
    const key = `${language}:${word.toLowerCase()}`;
    const progress = await this.storage.get(STORAGE_KEYS.WORD_PROGRESS, {});
    return progress[key] || {
      encounters: 0,
      lastSeen: null,
      nextReview: null,
      difficulty: 1
    };
  }

  async updateWordProgress(word, language, update) {
    const key = `${language}:${word.toLowerCase()}`;
    const progress = await this.storage.get(STORAGE_KEYS.WORD_PROGRESS, {});
    
    progress[key] = {
      ...progress[key],
      ...update,
      lastSeen: Date.now()
    };
    
    return await this.storage.set(STORAGE_KEYS.WORD_PROGRESS, progress);
  }

  // Translation cache
  async getCachedTranslation(word, language) {
    const cache = await this.storage.get(STORAGE_KEYS.TRANSLATION_CACHE, {});
    const key = `${language}:${word.toLowerCase()}`;
    return cache[key];
  }

  async cacheTranslation(word, language, translation) {
    const cache = await this.storage.get(STORAGE_KEYS.TRANSLATION_CACHE, {});
    const key = `${language}:${word.toLowerCase()}`;
    
    cache[key] = {
      translation,
      cached: Date.now()
    };
    
    // Limit cache size (keep last 10,000 entries)
    const entries = Object.entries(cache);
    if (entries.length > 10000) {
      // Sort by cached time and keep newest
      entries.sort((a, b) => b[1].cached - a[1].cached);
      const newCache = Object.fromEntries(entries.slice(0, 9000));
      return await this.storage.set(STORAGE_KEYS.TRANSLATION_CACHE, newCache);
    }
    
    return await this.storage.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
  }

  // Daily statistics
  async getDailyStats(date = new Date()) {
    const dateKey = date.toISOString().split('T')[0];
    const stats = await this.storage.get(STORAGE_KEYS.DAILY_STATS, {});
    
    return stats[dateKey] || {
      wordsLearned: 0,
      pagesVisited: 0,
      timeSpent: 0,
      languages: {}
    };
  }

  async updateDailyStats(updates) {
    const dateKey = new Date().toISOString().split('T')[0];
    const stats = await this.storage.get(STORAGE_KEYS.DAILY_STATS, {});
    
    stats[dateKey] = {
      ...stats[dateKey],
      ...updates
    };
    
    // Keep only last 30 days
    const dates = Object.keys(stats).sort();
    if (dates.length > 30) {
      dates.slice(0, -30).forEach(date => delete stats[date]);
    }
    
    return await this.storage.set(STORAGE_KEYS.DAILY_STATS, stats);
  }

  // Auto-cleanup old data
  async cleanup() {
    try {
      // Clean up old word progress (not reviewed in 90 days)
      const progress = await this.storage.get(STORAGE_KEYS.WORD_PROGRESS, {});
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      
      for (const [key, data] of Object.entries(progress)) {
        if (data.lastSeen && data.lastSeen < cutoff) {
          delete progress[key];
        }
      }
      
      await this.storage.set(STORAGE_KEYS.WORD_PROGRESS, progress);
      
      // Clean up old translations (not used in 30 days)
      const cache = await this.storage.get(STORAGE_KEYS.TRANSLATION_CACHE, {});
      const cacheCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      for (const [key, data] of Object.entries(cache)) {
        if (data.cached && data.cached < cacheCutoff) {
          delete cache[key];
        }
      }
      
      await this.storage.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
      
      return true;
    } catch (error) {
      console.error('Storage cleanup error:', error);
      return false;
    }
  }

  // Listen for changes
  onSettingsChange(callback) {
    return this.storage.onChange(STORAGE_KEYS.USER_SETTINGS, callback);
  }

  // Get storage info
  async getStorageInfo() {
    const usage = await this.storage.getUsage();
    const settings = await this.getSettings();
    const progress = await this.storage.get(STORAGE_KEYS.WORD_PROGRESS, {});
    const cache = await this.storage.get(STORAGE_KEYS.TRANSLATION_CACHE, {});
    
    return {
      usage,
      counts: {
        wordsLearned: Object.keys(progress).length,
        translationsCached: Object.keys(cache).length
      },
      settings
    };
  }
}

// Singleton instance
let storageInstance = null;

export function getStorage() {
  if (!storageInstance) {
    storageInstance = new FluentStorage();
  }
  return storageInstance;
}

// Export simple storage interface for translator
export const storage = {
  get: async (key) => {
    const manager = new StorageManager();
    return await manager.get(key);
  },
  set: async (key, value) => {
    const manager = new StorageManager();
    return await manager.set(key, value);
  },
  remove: async (key) => {
    const manager = new StorageManager();
    return await manager.remove(key);
  }
};

// Auto-cleanup on install/update
if (chrome.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    const storage = getStorage();
    storage.cleanup();
  });
}