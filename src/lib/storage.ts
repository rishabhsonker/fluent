// Storage.ts - Chrome storage wrapper with type safety
'use strict';

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { logger } from './logger.js';
import type {
  UserSettings,
  SiteSettings,
  WordProgress,
  StorageCache,
  DailyStats,
  LanguageCode,
  Translation
} from '../types';
import type { SpacedRepetitionWordData } from './spacedRepetition';

type StorageListener<T> = (value: T) => void;

interface StorageUsage {
  used: number;
  total: number;
  percentage: number;
}

interface StorageInfo {
  usage: StorageUsage;
  counts: {
    wordsLearned: number;
    translationsCached: number;
  };
  settings: UserSettings;
}

class StorageManager {
  private cache: Map<string, any>;
  private listeners: Map<string, Set<StorageListener<any>>>;

  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
  }

  // Get data from storage with fallback
  async get<T = any>(key: string, defaultValue: T | null = null): Promise<T | null> {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      // Get from Chrome storage (using local for larger capacity)
      const result = await chrome.storage.local.get(key);
      const value = result[key] ?? defaultValue;
      
      // Update cache
      this.cache.set(key, value);
      
      return value;
    } catch (error) {
      logger.error('Storage get error:', error);
      return defaultValue;
    }
  }

  // Set data in storage
  async set<T = any>(key: string, value: T): Promise<boolean> {
    try {
      // Update cache immediately
      this.cache.set(key, value);
      
      // Save to Chrome storage (using local for larger capacity)
      await chrome.storage.local.set({ [key]: value });
      
      // Notify listeners
      this.notifyListeners(key, value);
      
      return true;
    } catch (error) {
      logger.error('Storage set error:', error);
      // Rollback cache on error
      this.cache.delete(key);
      return false;
    }
  }

  // Get multiple keys at once
  async getMultiple<T = any>(keys: string[]): Promise<Record<string, T>> {
    try {
      const result = await chrome.storage.local.get(keys);
      
      // Update cache
      for (const [key, value] of Object.entries(result)) {
        this.cache.set(key, value);
      }
      
      return result;
    } catch (error) {
      logger.error('Storage getMultiple error:', error);
      return {};
    }
  }

  // Remove data from storage
  async remove(key: string): Promise<boolean> {
    try {
      this.cache.delete(key);
      await chrome.storage.local.remove(key);
      this.notifyListeners(key, undefined);
      return true;
    } catch (error) {
      logger.error('Storage remove error:', error);
      return false;
    }
  }

  // Clear all storage
  async clear(): Promise<boolean> {
    try {
      this.cache.clear();
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      logger.error('Storage clear error:', error);
      return false;
    }
  }

  // Listen for changes
  onChange<T = any>(key: string, callback: StorageListener<T>): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)?.add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Notify listeners of changes
  private notifyListeners<T = any>(key: string, value: T): void {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(value);
        } catch (error) {
          logger.error('Storage listener error:', error);
        }
      });
    }
  }

  // Get storage usage
  async getUsage(): Promise<StorageUsage> {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
      
      return {
        used: bytesInUse,
        total: quota,
        percentage: (bytesInUse / quota) * 100
      };
    } catch (error) {
      logger.error('Storage usage error:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }
}

// Specific storage methods for different data types
export class FluentStorage {
  private storage: StorageManager;

  constructor() {
    this.storage = new StorageManager();
  }

  // User settings
  async getSettings(): Promise<UserSettings> {
    const settings = await this.storage.get<UserSettings>(STORAGE_KEYS.USER_SETTINGS, DEFAULT_SETTINGS as UserSettings);
    // Ensure we merge with defaults to handle missing properties
    return { ...DEFAULT_SETTINGS, ...settings } as UserSettings;
  }

  async updateSettings(updates: Partial<UserSettings>): Promise<boolean> {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    return await this.storage.set(STORAGE_KEYS.USER_SETTINGS, updated);
  }

  // Site-specific settings
  async getSiteSettings(hostname: string): Promise<SiteSettings> {
    const allSettings = await this.storage.get<Record<string, SiteSettings>>(STORAGE_KEYS.SITE_SETTINGS, {});
    return allSettings?.[hostname] || { enabled: true };
  }

  async updateSiteSettings(hostname: string, settings: Partial<SiteSettings>): Promise<boolean> {
    const allSettings = await this.storage.get<Record<string, SiteSettings>>(STORAGE_KEYS.SITE_SETTINGS, {}) || {};
    allSettings[hostname] = { ...allSettings[hostname], ...settings };
    return await this.storage.set(STORAGE_KEYS.SITE_SETTINGS, allSettings);
  }

  // Word progress tracking with spaced repetition
  async getWordProgress(word: string, language: LanguageCode): Promise<WordProgress | null> {
    const key = `${language}:${word.toLowerCase()}`;
    const progress = await this.storage.get<Record<string, WordProgress>>(STORAGE_KEYS.WORD_PROGRESS, {});
    return progress?.[key] || null;
  }

  async updateWordProgress(word: string, language: LanguageCode, update: Partial<WordProgress>): Promise<boolean> {
    const key = `${language}:${word.toLowerCase()}`;
    const progress = await this.storage.get<Record<string, WordProgress>>(STORAGE_KEYS.WORD_PROGRESS, {}) || {};
    
    progress[key] = {
      ...progress[key],
      ...update
    };
    
    return await this.storage.set(STORAGE_KEYS.WORD_PROGRESS, progress);
  }

  // Get all word progress for a language
  async getAllWordProgress(language: LanguageCode): Promise<Record<string, WordProgress>> {
    const progress = await this.storage.get<Record<string, WordProgress>>(STORAGE_KEYS.WORD_PROGRESS, {}) || {};
    const filtered: Record<string, WordProgress> = {};
    
    Object.entries(progress).forEach(([key, data]) => {
      if (key.startsWith(`${language}:`)) {
        const word = key.split(':')[1];
        filtered[word] = data;
      }
    });
    
    return filtered;
  }

  // Record word interaction for spaced repetition
  async recordWordInteraction(word: string, language: LanguageCode, interactionType: string): Promise<WordProgress> {
    const wordData = await this.getWordProgress(word, language);
    
    // Import spaced repetition algorithm
    const { spacedRepetition } = await import('./spacedRepetition');
    
    // Create spaced repetition data structure
    const srData: SpacedRepetitionWordData = {
      word,
      language,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lastSeen: Date.now(),
      nextReview: Date.now(),
      totalSeen: 0,
      correctCount: 0,
      mastery: 0,
      encounters: wordData?.encounters || 0,
      interactions: wordData?.interactions || { hover: 0, pronunciation: 0, context: 0 }
    };
    
    // Calculate quality score based on interaction
    const quality = spacedRepetition.scoreInteraction(srData, interactionType as any);
    
    // Update word data with spaced repetition algorithm
    const updatedData = spacedRepetition.calculateNextReview(srData, quality);
    
    // Convert back to WordProgress format
    const progressUpdate: Partial<WordProgress> = {
      word: updatedData.word,
      language,
      encounters: (updatedData.encounters || 0) + 1,
      lastSeen: updatedData.lastSeen,
      nextReview: updatedData.nextReview,
      mastery: updatedData.mastery,
      interactions: wordData?.interactions || { hover: 0, pronunciation: 0, context: 0 }
    };
    
    // Update interaction count
    if (interactionType in progressUpdate.interactions!) {
      progressUpdate.interactions![interactionType as keyof typeof progressUpdate.interactions]++;
    }
    
    // Save updated data
    await this.updateWordProgress(word, language, progressUpdate);
    
    return { ...wordData, ...progressUpdate } as WordProgress;
  }

  // Get learning statistics
  async getLearningStats(language: LanguageCode): Promise<any> {
    const wordsData = await this.getAllWordProgress(language);
    
    // Import spaced repetition algorithm
    const { spacedRepetition } = await import('./spacedRepetition');
    
    // Convert WordProgress to SpacedRepetitionWordData format
    const srData: Record<string, SpacedRepetitionWordData> = {};
    Object.entries(wordsData).forEach(([word, data]) => {
      srData[word] = {
        word: data.word,
        language: data.language,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        lastSeen: data.lastSeen,
        nextReview: data.nextReview,
        totalSeen: data.encounters,
        correctCount: 0,
        mastery: data.mastery,
        encounters: data.encounters,
        interactions: data.interactions
      };
    });
    
    return spacedRepetition.getStatistics(srData);
  }

  // Translation cache
  async getCachedTranslation(word: string, language: LanguageCode): Promise<string | undefined> {
    const cache = await this.storage.get<StorageCache>(STORAGE_KEYS.TRANSLATION_CACHE, { translations: {}, lastUpdated: Date.now() });
    const key = `${language}:${word.toLowerCase()}`;
    return cache?.translations?.[key];
  }

  async cacheTranslation(word: string, language: LanguageCode, translation: string): Promise<boolean> {
    const cache = await this.storage.get<StorageCache>(STORAGE_KEYS.TRANSLATION_CACHE, { translations: {}, lastUpdated: Date.now() }) || { translations: {}, lastUpdated: Date.now() };
    const key = `${language}:${word.toLowerCase()}`;
    
    cache.translations[key] = translation;
    cache.timestamps = cache.timestamps || {};
    cache.timestamps[key] = Date.now();
    cache.lastUpdated = Date.now();
    
    // Limit cache size (keep last 10,000 entries)
    const entries = Object.entries(cache.translations);
    if (entries.length > 10000) {
      // Sort by timestamp and keep newest
      const sortedKeys = Object.keys(cache.translations).sort((a, b) => 
        (cache.timestamps?.[b] || 0) - (cache.timestamps?.[a] || 0)
      );
      const newTranslations: Translation = {};
      const newTimestamps: { [key: string]: number } = {};
      
      sortedKeys.slice(0, 9000).forEach(key => {
        newTranslations[key] = cache.translations[key];
        if (cache.timestamps?.[key]) {
          newTimestamps[key] = cache.timestamps[key];
        }
      });
      
      cache.translations = newTranslations;
      cache.timestamps = newTimestamps;
    }
    
    return await this.storage.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
  }

  // Daily statistics
  async getDailyStats(date: Date = new Date()): Promise<DailyStats> {
    const dateKey = date.toISOString().split('T')[0];
    const stats = await this.storage.get<Record<string, DailyStats>>(STORAGE_KEYS.DAILY_STATS, {});
    
    return stats?.[dateKey] || {
      wordsLearned: 0,
      pagesVisited: 0,
      timeSpent: 0,
      languages: {}
    };
  }

  async updateDailyStats(updates: Partial<DailyStats>): Promise<boolean> {
    const dateKey = new Date().toISOString().split('T')[0];
    const stats = await this.storage.get<Record<string, DailyStats>>(STORAGE_KEYS.DAILY_STATS, {}) || {};
    
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
  async cleanup(): Promise<boolean> {
    try {
      // Clean up old word progress (not reviewed in 90 days)
      const progress = await this.storage.get<Record<string, WordProgress>>(STORAGE_KEYS.WORD_PROGRESS, {}) || {};
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      
      if (progress) {
        for (const [key, data] of Object.entries(progress)) {
          if (data.lastSeen && data.lastSeen < cutoff) {
            delete progress[key];
          }
        }
      }
      
      await this.storage.set(STORAGE_KEYS.WORD_PROGRESS, progress);
      
      // Clean up old translations (not used in 30 days)
      const cache = await this.storage.get<StorageCache>(STORAGE_KEYS.TRANSLATION_CACHE, { translations: {}, lastUpdated: Date.now() }) || { translations: {}, lastUpdated: Date.now() };
      const cacheCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      if (cache.timestamps) {
        for (const [key, timestamp] of Object.entries(cache.timestamps)) {
          if (timestamp < cacheCutoff) {
            delete cache.translations[key];
            delete cache.timestamps[key];
          }
        }
      }
      
      await this.storage.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
      
      return true;
    } catch (error) {
      logger.error('Storage cleanup error:', error);
      return false;
    }
  }

  // Listen for changes
  onSettingsChange(callback: StorageListener<UserSettings>): () => void {
    return this.storage.onChange(STORAGE_KEYS.USER_SETTINGS, callback);
  }

  // Get storage info
  async getStorageInfo(): Promise<StorageInfo> {
    const usage = await this.storage.getUsage();
    const settings = await this.getSettings();
    const progress = await this.storage.get<Record<string, WordProgress>>(STORAGE_KEYS.WORD_PROGRESS, {}) || {};
    const cache = await this.storage.get<StorageCache>(STORAGE_KEYS.TRANSLATION_CACHE, { translations: {}, lastUpdated: Date.now() }) || { translations: {}, lastUpdated: Date.now() };
    
    return {
      usage,
      counts: {
        wordsLearned: Object.keys(progress).length,
        translationsCached: Object.keys(cache.translations).length
      },
      settings
    };
  }
}

// Singleton instance
let storageInstance: FluentStorage | null = null;

export function getStorage(): FluentStorage {
  if (!storageInstance) {
    storageInstance = new FluentStorage();
  }
  return storageInstance;
}

// Export simple storage interface for translator
export const storage = {
  get: async <T = any>(key: string, defaultValue?: T): Promise<T | null> => {
    const manager = new StorageManager();
    return await manager.get(key, defaultValue || null);
  },
  set: async (key: string, value: any): Promise<boolean> => {
    const manager = new StorageManager();
    return await manager.set(key, value);
  },
  remove: async (key: string): Promise<boolean> => {
    const manager = new StorageManager();
    return await manager.remove(key);
  }
};

// Auto-cleanup on install/update (only in service worker context)
if (chrome?.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => {
    const storage = getStorage();
    storage.cleanup();
  });
}