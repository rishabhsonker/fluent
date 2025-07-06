// Translation Service with Multi-tier Caching
// Implements L1-L6 caching strategy for optimal performance and cost
'use strict';

import { API_CONFIG, STORAGE_KEYS, PERFORMANCE_LIMITS, MOCK_TRANSLATIONS } from './constants.js';
import { storage } from './storage.js';

export class Translator {
  constructor() {
    // L1: Bloom filter (ultra-fast membership test)
    this.bloomFilter = new BloomFilter(10000, 4); // 10KB for 100k+ words
    
    // L2: In-memory cache (fastest lookup)
    this.memoryCache = new Map();
    this.memoryCacheSize = 0;
    this.maxMemorySize = 5 * 1024 * 1024; // 5MB limit
    
    // Cache stats for monitoring
    this.stats = {
      requests: 0,
      hits: { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 },
      misses: 0,
      apiCalls: 0
    };
    
    // Daily usage tracking
    this.dailyUsage = {
      date: new Date().toDateString(),
      count: 0
    };
    
    // Initialize caches
    this.initializeCaches();
  }
  
  async initializeCaches() {
    // Load bloom filter from storage
    const bloomData = await storage.get('bloomFilter');
    if (bloomData && bloomData.bits) {
      this.bloomFilter.bits = bloomData.bits;
    }
    
    // Load daily usage
    const usage = await storage.get('dailyUsage');
    if (usage && usage.date === new Date().toDateString()) {
      this.dailyUsage = usage;
    }
    
    // Pre-populate memory cache with recent translations
    const recentCache = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE);
    if (recentCache && recentCache.translations) {
      const entries = Object.entries(recentCache.translations).slice(-100);
      for (const [key, value] of entries) {
        this.memoryCache.set(key, value);
      }
    }
  }
  
  // Main translation method with multi-tier caching
  async translate(words, targetLanguage, options = {}) {
    this.stats.requests++;
    
    // Validate input
    if (!words || !Array.isArray(words) || words.length === 0) {
      return {};
    }
    
    const translations = {};
    const uncachedWords = [];
    const startTime = performance.now();
    
    // Process each word through cache tiers
    for (const word of words) {
      const cacheKey = `${targetLanguage}:${word.toLowerCase()}`;
      
      // L1: Bloom filter check (0ms)
      if (!this.bloomFilter.test(cacheKey)) {
        // Definitely not in cache
        uncachedWords.push(word);
        continue;
      }
      
      // L2: Memory cache (1ms)
      if (this.memoryCache.has(cacheKey)) {
        translations[word] = this.memoryCache.get(cacheKey);
        this.stats.hits.L2++;
        continue;
      }
      
      // L3: Chrome storage cache (2ms)
      const storageCache = await this.getFromStorage(cacheKey);
      if (storageCache) {
        translations[word] = storageCache;
        this.memoryCache.set(cacheKey, storageCache);
        this.stats.hits.L3++;
        continue;
      }
      
      // L4: Daily word pool (5ms) - will be implemented with word pools
      const poolWord = await this.getFromWordPool(word, targetLanguage);
      if (poolWord) {
        translations[word] = poolWord;
        this.updateCaches(cacheKey, poolWord);
        this.stats.hits.L4++;
        continue;
      }
      
      // Not in any cache
      uncachedWords.push(word);
    }
    
    // Check API limits before making requests
    if (uncachedWords.length > 0) {
      const canUseAPI = await this.checkAPILimits(uncachedWords.length, options);
      
      if (!canUseAPI) {
        // Return partial translations with error
        return {
          translations,
          error: 'Daily limit exceeded. Please provide your own API key.',
          limitReached: true
        };
      }
      
      // L5: Cloudflare KV cache (50ms) - checked on worker side
      // L6: Microsoft Translator API (200ms)
      const apiTranslations = await this.fetchTranslations(
        uncachedWords, 
        targetLanguage, 
        options.apiKey
      );
      
      // Update all caches with new translations
      for (const [word, translation] of Object.entries(apiTranslations)) {
        const cacheKey = `${targetLanguage}:${word.toLowerCase()}`;
        translations[word] = translation;
        this.updateCaches(cacheKey, translation);
      }
      
      this.stats.apiCalls++;
    }
    
    // Update stats
    const cacheHitRate = this.calculateCacheHitRate();
    if (cacheHitRate < PERFORMANCE_LIMITS.MIN_CACHE_HIT_RATE) {
      console.warn(`Low cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
    }
    
    // Performance check
    const elapsed = performance.now() - startTime;
    if (elapsed > 50) {
      console.warn(`Translation took ${elapsed.toFixed(0)}ms`);
    }
    
    return { translations, stats: this.getStats() };
  }
  
  // Check API usage limits
  async checkAPILimits(wordCount, options) {
    // BYOK users have no limits
    if (options.apiKey) {
      return true;
    }
    
    // Get stored API key
    try {
      const result = await chrome.storage.sync.get('userApiKey');
      if (result.userApiKey) {
        options.apiKey = result.userApiKey;
        return true;
      }
    } catch (error) {
      console.error('Error getting stored API key:', error);
    }
    
    // Check daily limit (50 words/day for free tier)
    if (this.dailyUsage.date !== new Date().toDateString()) {
      // Reset daily counter
      this.dailyUsage = {
        date: new Date().toDateString(),
        count: 0
      };
    }
    
    if (this.dailyUsage.count + wordCount > 50) {
      return false;
    }
    
    return true;
  }
  
  // Fetch translations from API
  async fetchTranslations(words, targetLanguage, apiKey) {
    try {
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          words,
          targetLanguage,
          apiKey
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Translation failed');
      }
      
      const data = await response.json();
      
      // Update daily usage if not using BYOK
      if (!apiKey) {
        this.dailyUsage.count += words.length;
        await storage.set('dailyUsage', this.dailyUsage);
      }
      
      return data.translations || {};
    } catch (error) {
      console.error('Translation API error:', error);
      
      // Fallback to mock translations in development
      if (API_CONFIG.TRANSLATOR_API.includes('localhost')) {
        return this.getMockTranslations(words, targetLanguage);
      }
      
      throw error;
    }
  }
  
  // Get translation from Chrome storage
  async getFromStorage(cacheKey) {
    const cache = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE);
    if (cache && cache.translations && cache.translations[cacheKey]) {
      return cache.translations[cacheKey];
    }
    return null;
  }
  
  // Get translation from daily word pool (to be implemented)
  async getFromWordPool(word, targetLanguage) {
    // TODO: Implement word pool functionality
    // This will store pre-translated common words for all users
    return null;
  }
  
  // Update all cache tiers
  async updateCaches(cacheKey, translation) {
    // Update bloom filter
    this.bloomFilter.add(cacheKey);
    
    // Update memory cache with size limit
    const entrySize = cacheKey.length + translation.length;
    if (this.memoryCacheSize + entrySize > this.maxMemorySize) {
      // Evict oldest entries
      const entriesToRemove = Math.ceil(this.memoryCache.size * 0.2);
      const keys = Array.from(this.memoryCache.keys()).slice(0, entriesToRemove);
      for (const key of keys) {
        this.memoryCache.delete(key);
      }
      this.memoryCacheSize = this.calculateMemoryCacheSize();
    }
    this.memoryCache.set(cacheKey, translation);
    this.memoryCacheSize += entrySize;
    
    // Update Chrome storage
    const cache = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) || { translations: {} };
    cache.translations[cacheKey] = translation;
    cache.lastUpdated = Date.now();
    
    // Limit storage size
    const keys = Object.keys(cache.translations);
    if (keys.length > 1000) {
      // Keep only recent 800 translations
      const sortedKeys = keys.sort((a, b) => 
        (cache.timestamps?.[b] || 0) - (cache.timestamps?.[a] || 0)
      );
      const keysToKeep = new Set(sortedKeys.slice(0, 800));
      cache.translations = Object.fromEntries(
        Object.entries(cache.translations).filter(([k]) => keysToKeep.has(k))
      );
    }
    
    await storage.set(STORAGE_KEYS.TRANSLATION_CACHE, cache);
    
    // Save bloom filter periodically
    if (Math.random() < 0.1) { // 10% chance
      await storage.set('bloomFilter', {
        bits: this.bloomFilter.bits,
        updated: Date.now()
      });
    }
  }
  
  // Get mock translations for development
  getMockTranslations(words, targetLanguage) {
    const langTranslations = MOCK_TRANSLATIONS[targetLanguage] || {};
    
    const translations = {};
    for (const word of words) {
      translations[word] = langTranslations[word.toLowerCase()] || word;
    }
    
    return translations;
  }
  
  // Calculate memory cache size
  calculateMemoryCacheSize() {
    let size = 0;
    for (const [key, value] of this.memoryCache.entries()) {
      size += key.length + value.length;
    }
    return size;
  }
  
  // Calculate cache hit rate
  calculateCacheHitRate() {
    const totalHits = Object.values(this.stats.hits).reduce((a, b) => a + b, 0);
    const total = totalHits + this.stats.misses;
    return total > 0 ? totalHits / total : 0;
  }
  
  // Get statistics
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.calculateCacheHitRate(),
      memoryCacheSize: this.memoryCache.size,
      dailyUsage: this.dailyUsage.count
    };
  }
  
  // Clear all caches
  async clearCache() {
    this.memoryCache.clear();
    this.memoryCacheSize = 0;
    this.bloomFilter = new BloomFilter(10000, 4);
    await storage.remove(STORAGE_KEYS.TRANSLATION_CACHE);
    await storage.remove('bloomFilter');
    this.stats = {
      requests: 0,
      hits: { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 },
      misses: 0,
      apiCalls: 0
    };
  }
}

// Simple Bloom Filter implementation
class BloomFilter {
  constructor(size, hashCount) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }
  
  hash(str, seed) {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % this.size;
  }
  
  add(item) {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      const byte = Math.floor(index / 8);
      const bit = index % 8;
      this.bits[byte] |= (1 << bit);
    }
  }
  
  test(item) {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      const byte = Math.floor(index / 8);
      const bit = index % 8;
      if (!(this.bits[byte] & (1 << bit))) {
        return false;
      }
    }
    return true;
  }
}

// Export singleton instance
export const translator = new Translator();