// Storage.ts - Chrome storage wrapper with type safety
'use strict';

import { STORAGE_KEYS, DEFAULT_SETTINGS, RATE_LIMITS } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { safe, safeSync, chromeCall } from '../../shared/utils/helpers';
import { getErrorHandler } from '../../shared/utils/error-handler';
import type {
  UserSettings,
  SiteSettings,
  WordProgress,
  StorageCache,
  DailyStats,
  LanguageCode,
  Translation
} from '../../shared/types';
import type { SpacedRepetitionWordData } from '../learning/srs';

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

interface DailyUsage {
  date: string;
  wordsTranslated: number;
  explanationsViewed: number;
  lastReset: number;
  isPlus: boolean;
}

class StorageManager {
  private cache: Map<string, any>;
  private listeners: Map<string, Set<StorageListener<any>>>;
  private pendingWrites: Map<string, any>;
  private writeTimer: NodeJS.Timeout | null;
  private retryTimer: NodeJS.Timeout | null;
  private failedWrites: Map<string, { value: any; retries: number; lastAttempt: number }>;
  private readonly BATCH_DELAY = 100; // ms
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
    this.pendingWrites = new Map();
    this.failedWrites = new Map();
    this.writeTimer = null;
    this.retryTimer = null;
  }

  // Cleanup method to prevent memory leaks
  destroy(): void {
    // Flush any pending writes
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.flushWrites().catch(() => {});
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.cache.clear();
    this.listeners.clear();
    this.pendingWrites.clear();
    this.failedWrites.clear();
  }

  // Determine which storage area to use based on key
  private getStorageArea(key: string): chrome.storage.StorageArea {
    // User settings and site settings should use sync storage for cross-device sync
    if (key === STORAGE_KEYS.USER_SETTINGS || key === STORAGE_KEYS.SITE_SETTINGS) {
      return chrome.storage.sync;
    }
    // Everything else uses local storage for larger capacity
    return chrome.storage.local;
  }

  // Get data from storage with fallback
  async get<T = any>(key: string, defaultValue: T | null = null): Promise<T | null> {
    return safe(
      async () => {
        // Check cache first
        if (this.cache.has(key)) {
          return this.cache.get(key);
        }

        // Determine which storage area to use based on key
        const storageArea = this.getStorageArea(key);
        const result = await storageArea.get(key);
        const value = result[key] ?? defaultValue;
        
        // Update cache
        this.cache.set(key, value);
        
        return value;
      },
      `storage.get.${key}`,
      defaultValue
    );
  }

  // Set data in storage with batching
  async set<T = any>(key: string, value: T): Promise<boolean> {
    // Update cache immediately
    this.cache.set(key, value);
    
    // Remove from failed writes if it exists (new write supersedes failed one)
    this.failedWrites.delete(key);
    
    // Add to pending writes
    this.pendingWrites.set(key, value);
    
    // Batch writes
    if (!this.writeTimer) {
      this.writeTimer = setTimeout(() => this.flushWrites(), this.BATCH_DELAY);
    }
    
    // Notify listeners immediately
    this.notifyListeners(key, value);
    
    return true;
  }

  // Force flush all pending writes (useful before critical operations)
  async forceFlush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    
    // Flush pending writes
    if (this.pendingWrites.size > 0) {
      await this.flushWrites();
    }
    
    // Also retry any failed writes immediately
    if (this.failedWrites.size > 0) {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      await this.retryFailedWrites();
    }
  }

  // Flush all pending writes to storage
  private async flushWrites(): Promise<void> {
    if (this.pendingWrites.size === 0) {
      this.writeTimer = null;
      return;
    }
    
    await safe(
      async () => {
        // Group by storage area
        const syncWrites: Record<string, any> = {};
        const localWrites: Record<string, any> = {};
        
        for (const [key, value] of this.pendingWrites) {
          if (key === STORAGE_KEYS.USER_SETTINGS || key === STORAGE_KEYS.SITE_SETTINGS) {
            syncWrites[key] = value;
          } else {
            localWrites[key] = value;
          }
        }
        
        // Execute batch writes
        const promises: Promise<void>[] = [];
        if (Object.keys(syncWrites).length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.sync.set(syncWrites),
            'storage.sync.setBatch'
          ));
        }
        if (Object.keys(localWrites).length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.local.set(localWrites),
            'storage.local.setBatch'
          ));
        }
        
        await Promise.all(promises);
        
        // Clear pending writes on success
        this.pendingWrites.clear();
      },
      `storage.flushWrites[${this.pendingWrites.size}]`
    ).catch((error) => {
      // CRITICAL FIX: Don't delete from cache on failure!
      // Instead, move to failed writes queue for retry
      logger.error('[Storage] Write failed, queuing for retry', error);
      
      for (const [key, value] of this.pendingWrites) {
        this.failedWrites.set(key, {
          value,
          retries: 0,
          lastAttempt: Date.now()
        });
      }
      this.pendingWrites.clear();
      
      // Schedule retry
      this.scheduleRetry();
    });
    
    this.writeTimer = null;
  }

  // Schedule retry for failed writes
  private scheduleRetry(): void {
    if (this.retryTimer || this.failedWrites.size === 0) {
      return;
    }
    
    // Find the next retry time based on exponential backoff
    let nextRetryTime = Infinity;
    const now = Date.now();
    
    for (const [key, failure] of this.failedWrites) {
      const retryDelay = this.RETRY_DELAYS[Math.min(failure.retries, this.RETRY_DELAYS.length - 1)];
      const nextAttempt = failure.lastAttempt + retryDelay;
      nextRetryTime = Math.min(nextRetryTime, nextAttempt);
    }
    
    const delay = Math.max(0, nextRetryTime - now);
    this.retryTimer = setTimeout(() => this.retryFailedWrites(), delay);
  }

  // Retry failed writes with exponential backoff
  private async retryFailedWrites(): Promise<void> {
    this.retryTimer = null;
    
    if (this.failedWrites.size === 0) {
      return;
    }
    
    const toRetry = new Map<string, any>();
    const retryInfo = new Map<string, { retries: number }>();
    
    // Collect writes that are ready to retry
    const now = Date.now();
    for (const [key, failure] of this.failedWrites) {
      const retryDelay = this.RETRY_DELAYS[Math.min(failure.retries, this.RETRY_DELAYS.length - 1)];
      if (now >= failure.lastAttempt + retryDelay) {
        toRetry.set(key, failure.value);
        retryInfo.set(key, { retries: failure.retries });
      }
    }
    
    if (toRetry.size === 0) {
      this.scheduleRetry();
      return;
    }
    
    // Remove from failed queue before retry
    for (const key of toRetry.keys()) {
      this.failedWrites.delete(key);
    }
    
    await safe(
      async () => {
        // Group by storage area
        const syncWrites: Record<string, any> = {};
        const localWrites: Record<string, any> = {};
        
        for (const [key, value] of toRetry) {
          if (key === STORAGE_KEYS.USER_SETTINGS || key === STORAGE_KEYS.SITE_SETTINGS) {
            syncWrites[key] = value;
          } else {
            localWrites[key] = value;
          }
        }
        
        // Execute batch writes
        const promises: Promise<void>[] = [];
        if (Object.keys(syncWrites).length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.sync.set(syncWrites),
            'storage.sync.retryBatch'
          ));
        }
        if (Object.keys(localWrites).length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.local.set(localWrites),
            'storage.local.retryBatch'
          ));
        }
        
        await Promise.all(promises);
        logger.info('[Storage] Successfully retried writes', { count: toRetry.size });
      },
      `storage.retryWrites[${toRetry.size}]`
    ).catch((error) => {
      logger.error('[Storage] Retry failed', error);
      
      // Put back in failed queue with incremented retry count
      for (const [key, value] of toRetry) {
        const info = retryInfo.get(key);
        const originalRetries = info ? info.retries : 0;
        const newRetries = originalRetries + 1;
        
        if (newRetries >= this.MAX_RETRIES) {
          // Max retries reached, notify user
          logger.error('[Storage] Max retries reached for key', { key, retries: newRetries });
          this.notifyWriteFailure(key, value);
          
          // Save to localStorage as last resort backup
          safeSync(() => {
            const backup = JSON.parse(localStorage.getItem('fluent_failed_writes') || '{}');
            backup[key] = { value, timestamp: Date.now() };
            localStorage.setItem('fluent_failed_writes', JSON.stringify(backup));
          }, '[Storage] Failed to backup to localStorage');
        } else {
          // Queue for another retry
          this.failedWrites.set(key, {
            value,
            retries: newRetries,
            lastAttempt: Date.now()
          });
        }
      }
      
      // Schedule next retry
      this.scheduleRetry();
    });
    
    // Schedule next retry if there are more failed writes
    if (this.failedWrites.size > 0) {
      this.scheduleRetry();
    }
  }

  // Notify user of persistent write failure
  private notifyWriteFailure(key: string, value: any): void {
    // Send message to popup/content scripts about sync failure
    chrome.runtime.sendMessage({
      type: 'STORAGE_SYNC_FAILED',
      key,
      message: 'Failed to sync settings. Your changes are saved locally but may not sync across devices.'
    }).catch(() => {
      // Ignore if no listeners
    });
  }

  // Get multiple keys at once
  async getMultiple<T = any>(keys: string[]): Promise<Record<string, T>> {
    return safe(
      async () => {
        // Group keys by storage area
        const syncKeys = keys.filter(key => 
          key === STORAGE_KEYS.USER_SETTINGS || key === STORAGE_KEYS.SITE_SETTINGS
        );
        const localKeys = keys.filter(key => 
          key !== STORAGE_KEYS.USER_SETTINGS && key !== STORAGE_KEYS.SITE_SETTINGS
        );
        
        // Get from both storage areas
        const promises: Promise<any>[] = [];
        if (syncKeys.length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.sync.get(syncKeys),
            'storage.sync.getMultiple'
          ));
        }
        if (localKeys.length > 0) {
          promises.push(chromeCall(
            () => chrome.storage.local.get(localKeys),
            'storage.local.getMultiple'
          ));
        }
        
        const results = await Promise.all(promises);
        const combined = Object.assign({}, ...results);
        
        // Update cache
        for (const [key, value] of Object.entries(combined)) {
          this.cache.set(key, value);
        }
        
        return combined;
      },
      `storage.getMultiple[${keys.length}]`,
      {}
    );
  }

  // Remove data from storage
  async remove(key: string): Promise<boolean> {
    return safe(
      async () => {
        this.cache.delete(key);
        const storageArea = this.getStorageArea(key);
        await chromeCall(
          () => storageArea.remove(key),
          `storage.remove.${key}`
        );
        this.notifyListeners(key, undefined);
        return true;
      },
      `storage.remove.${key}`,
      false
    );
  }

  // Clear all storage
  async clear(): Promise<boolean> {
    return safe(
      async () => {
        this.cache.clear();
        // Clear both storage areas
        await Promise.all([
          chromeCall(() => chrome.storage.local.clear(), 'storage.local.clear'),
          chromeCall(() => chrome.storage.sync.clear(), 'storage.sync.clear')
        ]);
        return true;
      },
      'storage.clear',
      false
    );
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
        safeSync(
          () => callback(value),
          `storage.notifyListener.${key}`
        );
      });
    }
  }

  // Get storage usage
  async getUsage(): Promise<StorageUsage> {
    return safe(
      async () => {
        // Get usage from both storage areas
        const [localBytes, syncBytes] = await Promise.all([
          chromeCall(() => chrome.storage.local.getBytesInUse(), 'storage.local.getBytesInUse'),
          chromeCall(() => chrome.storage.sync.getBytesInUse(), 'storage.sync.getBytesInUse')
        ]);
        
        // Get quotas
        const localQuota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
        const syncQuota = chrome.storage.sync.QUOTA_BYTES || 102400; // 100KB default
        
        const totalUsed = localBytes + syncBytes;
        const totalQuota = localQuota + syncQuota;
        
        return {
          used: totalUsed,
          total: totalQuota,
          percentage: (totalUsed / totalQuota) * 100
        };
      },
      'storage.getUsage',
      { used: 0, total: 0, percentage: 0 }
    );
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
    const { spacedRepetition } = await import('../learning/srs');
    
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
    const { spacedRepetition } = await import('../learning/srs');
    
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
    return safe(
      async () => {
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
      },
      'storage.cleanup',
      false
    );
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

  // Daily usage tracking for free tier
  async getDailyUsage(): Promise<DailyUsage> {
    const today = new Date().toISOString().split('T')[0];
    const usage = await this.storage.get<DailyUsage>(STORAGE_KEYS.DAILY_USAGE, {
      date: today,
      wordsTranslated: 0,
      explanationsViewed: 0,
      lastReset: Date.now(),
      isPlus: false
    });

    // Check if we need to reset for a new day
    if (!usage || usage.date !== today) {
      const newUsage: DailyUsage = {
        date: today,
        wordsTranslated: 0,
        explanationsViewed: 0,
        lastReset: Date.now(),
        isPlus: usage?.isPlus || false
      };
      await this.storage.set(STORAGE_KEYS.DAILY_USAGE, newUsage);
      return newUsage;
    }

    return usage;
  }

  // Check if user can translate more words
  async canTranslateWords(wordCount: number = 1): Promise<{ allowed: boolean; remaining: number; message?: string }> {
    const usage = await this.getDailyUsage();
    
    // Plus users have unlimited translations
    if (usage.isPlus) {
      return { allowed: true, remaining: Infinity };
    }

    const remaining = RATE_LIMITS.DAILY_WORDS - usage.wordsTranslated;
    const allowed = remaining >= wordCount;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      message: allowed ? undefined : `Daily limit reached! You've used ${usage.wordsTranslated}/${RATE_LIMITS.DAILY_WORDS} translations today.`
    };
  }

  // Check if user can view more explanations
  async canViewExplanations(count: number = 1): Promise<{ allowed: boolean; remaining: number; message?: string }> {
    const usage = await this.getDailyUsage();
    
    // Plus users have unlimited explanations
    if (usage.isPlus) {
      return { allowed: true, remaining: Infinity };
    }

    const remaining = RATE_LIMITS.DAILY_EXPLANATIONS - usage.explanationsViewed;
    const allowed = remaining >= count;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      message: allowed ? undefined : `Daily limit reached! You've used ${usage.explanationsViewed}/${RATE_LIMITS.DAILY_EXPLANATIONS} explanations today.`
    };
  }

  // Record word translations
  async recordTranslations(wordCount: number): Promise<{ success: boolean; remaining: number }> {
    const usage = await this.getDailyUsage();
    
    // Update the count
    usage.wordsTranslated += wordCount;
    await this.storage.set(STORAGE_KEYS.DAILY_USAGE, usage);

    const remaining = usage.isPlus ? Infinity : Math.max(0, RATE_LIMITS.DAILY_WORDS - usage.wordsTranslated);
    
    return {
      success: true,
      remaining
    };
  }

  // Record explanation views
  async recordExplanations(count: number): Promise<{ success: boolean; remaining: number }> {
    const usage = await this.getDailyUsage();
    
    // Update the count
    usage.explanationsViewed += count;
    await this.storage.set(STORAGE_KEYS.DAILY_USAGE, usage);

    const remaining = usage.isPlus ? Infinity : Math.max(0, RATE_LIMITS.DAILY_EXPLANATIONS - usage.explanationsViewed);
    
    return {
      success: true,
      remaining
    };
  }

  // Set Plus status
  async setPlusStatus(isPlus: boolean): Promise<boolean> {
    const usage = await this.getDailyUsage();
    usage.isPlus = isPlus;
    return await this.storage.set(STORAGE_KEYS.DAILY_USAGE, usage);
  }

  // Get usage statistics
  async getUsageStats(): Promise<{ 
    wordsToday: number; 
    wordsLimit: number; 
    explanationsToday: number;
    explanationsLimit: number;
    isPlus: boolean; 
    wordsPercentage: number;
    explanationsPercentage: number;
  }> {
    const usage = await this.getDailyUsage();
    const wordsLimit = usage.isPlus ? Infinity : RATE_LIMITS.DAILY_WORDS;
    const explanationsLimit = usage.isPlus ? Infinity : RATE_LIMITS.DAILY_EXPLANATIONS;
    const wordsPercentage = usage.isPlus ? 0 : (usage.wordsTranslated / RATE_LIMITS.DAILY_WORDS) * 100;
    const explanationsPercentage = usage.isPlus ? 0 : (usage.explanationsViewed / RATE_LIMITS.DAILY_EXPLANATIONS) * 100;

    return {
      wordsToday: usage.wordsTranslated,
      wordsLimit,
      explanationsToday: usage.explanationsViewed,
      explanationsLimit,
      isPlus: usage.isPlus,
      wordsPercentage,
      explanationsPercentage
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