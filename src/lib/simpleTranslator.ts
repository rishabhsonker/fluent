// Simple Translation Service - 2-tier caching only
'use strict';

import { API_CONFIG, STORAGE_KEYS, CACHE_LIMITS, SUPPORTED_LANGUAGES } from './constants';
import { storage } from './storage';
import { validator } from './validator';
import { rateLimiter } from './rateLimiter';
import { logger } from './logger';
import { costGuard } from './costGuard';
import { secureCrypto } from './secureCrypto';
import { ExtensionAuthenticator } from './auth';
import { offlineManager } from './offlineManager';
import type { 
  Translation, 
  TranslationResult, 
  TranslationStats,
  LanguageCode,
  StorageCache
} from '../types';

interface TranslatorOptions {
  apiKey?: string;
}

export class SimpleTranslator {
  private memoryCache: Map<string, string>;
  private maxMemoryCacheSize: number;
  private stats: {
    hits: number;
    misses: number;
    apiCalls: number;
  };

  constructor() {
    // Simple 2-tier cache
    this.memoryCache = new Map();
    this.maxMemoryCacheSize = CACHE_LIMITS.MEMORY_CACHE_MAX_ENTRIES;
    
    // Stats for monitoring
    this.stats = {
      hits: 0,
      misses: 0,
      apiCalls: 0
    };
    
    // Initialize
    this.loadStorageCache();
  }
  
  // Load recent translations from storage
  private async loadStorageCache(): Promise<void> {
    try {
      const stored = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) as StorageCache | null;
      if (stored?.translations) {
        // Load most recent 100 into memory
        Object.entries(stored.translations)
          .slice(-100)
          .forEach(([key, value]) => {
            this.memoryCache.set(key, value);
          });
      }
    } catch (error) {
      logger.error('Failed to load cache:', error);
    }
  }
  
  // Main translation method
  async translate(
    words: string[], 
    targetLanguage: string, 
    options: TranslatorOptions = {}
  ): Promise<TranslationResult> {
    // Validate inputs
    const validLanguage = validator.validateLanguage(targetLanguage) as LanguageCode;
    const validWords = validator.validateWordList(words);
    
    if (validWords.length === 0) {
      return { translations: {} };
    }
    
    const translations: Translation = {};
    const uncachedWords: string[] = [];
    
    // Check cache
    for (const word of validWords) {
      const cacheKey = `${validLanguage}:${word.toLowerCase()}`;
      const cached = await this.getFromCache(cacheKey);
      
      if (cached) {
        translations[word] = cached;
        this.stats.hits++;
      } else {
        // Check offline cache
        const offline = await offlineManager.getTranslation(word, validLanguage);
        if (offline) {
          translations[word] = offline;
          this.stats.hits++;
          // Cache offline translation
          await this.updateCache(cacheKey, offline);
        } else {
          uncachedWords.push(word);
          this.stats.misses++;
        }
      }
    }
    
    // Fetch uncached words
    if (uncachedWords.length > 0) {
      try {
        const apiTranslations = await this.fetchTranslations(
          uncachedWords,
          validLanguage,
          options.apiKey
        );
        
        // Update cache and results
        for (const [word, translation] of Object.entries(apiTranslations)) {
          translations[word] = translation;
          const cacheKey = `${validLanguage}:${word.toLowerCase()}`;
          await this.updateCache(cacheKey, translation);
        }
      } catch (error) {
        logger.error('Translation failed:', error);
        // Return partial results on error
        return {
          translations,
          error: error instanceof Error ? error.message : 'Translation failed'
        };
      }
    }
    
    return { translations };
  }
  
  // Get from 2-tier cache
  private async getFromCache(key: string): Promise<string | null> {
    // L1: Memory cache
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    
    // L2: Storage cache
    try {
      const stored = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) as StorageCache | null;
      if (stored?.translations?.[key]) {
        // Add to memory cache
        this.updateMemoryCache(key, stored.translations[key]);
        return stored.translations[key];
      }
    } catch (error) {
      logger.error('Cache read error:', error);
    }
    
    return null;
  }
  
  // Update both cache tiers
  private async updateCache(key: string, value: string): Promise<void> {
    // Update memory cache
    this.updateMemoryCache(key, value);
    
    // Update storage cache
    try {
      const stored = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) as StorageCache || 
        { translations: {}, lastUpdated: Date.now() };
      
      stored.translations[key] = value;
      stored.lastUpdated = Date.now();
      
      // Limit storage size
      const keys = Object.keys(stored.translations);
      if (keys.length > CACHE_LIMITS.STORAGE_CACHE_MAX_ENTRIES) {
        // Keep only recent entries
        const newTranslations: Translation = {};
        keys.slice(-4000).forEach(k => {
          newTranslations[k] = stored.translations[k];
        });
        stored.translations = newTranslations;
      }
      
      await storage.set(STORAGE_KEYS.TRANSLATION_CACHE, stored);
    } catch (error) {
      logger.error('Cache write error:', error);
    }
  }
  
  // Update memory cache with LRU eviction
  private updateMemoryCache(key: string, value: string): void {
    // Delete and re-add to move to end (LRU)
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }
    
    // Evict oldest if at capacity
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryCache.delete(firstKey);
      }
    }
    
    this.memoryCache.set(key, value);
  }
  
  // Fetch from API
  private async fetchTranslations(
    words: string[], 
    targetLanguage: LanguageCode, 
    apiKey?: string
  ): Promise<Translation> {
    // Check cost limits
    const estimatedChars = words.join(' ').length * 2;
    if (!apiKey) {
      await costGuard.checkCost('translation', estimatedChars);
    }
    
    // Apply rate limiting
    const identifier = apiKey ? `byok:${apiKey.substring(0, 8)}` : 'free';
    
    return await rateLimiter.withRateLimit('translation', identifier, async () => {
      // No mock mode in production
      
      // Get authentication headers
      const authHeaders = await ExtensionAuthenticator.generateAuthHeaders();
      
      // Convert language name to code (e.g., 'spanish' -> 'es')
      const langCode = SUPPORTED_LANGUAGES[targetLanguage]?.code || targetLanguage;
      
      // Debug logging
      logger.info('Translation request:', {
        words,
        targetLanguage: langCode,
        originalLanguage: targetLanguage
      });
      
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/translate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ words, targetLanguage: langCode, apiKey })
      });
      
      if (!response.ok) {
        let error;
        try {
          error = await response.json();
        } catch (e) {
          error = { error: 'Failed to parse error response' };
        }
        logger.error('Translation API error:', {
          status: response.status,
          error: error,
          request: { words, targetLanguage: langCode, originalTargetLanguage: targetLanguage },
          requestBody: JSON.stringify({ words, targetLanguage: langCode, apiKey })
        });
        throw new Error(error.error || 'Translation failed');
      }
      
      const data = await response.json();
      
      // Ensure we have translations
      if (!data.translations) {
        logger.error('No translations in response!', data);
      }
      
      // Record cost
      if (!apiKey && data.translations) {
        const actualChars = JSON.stringify(data.translations).length;
        costGuard.recordUsage('translation', actualChars);
      }
      
      this.stats.apiCalls++;
      
      // After getting translations, also get context (pronunciation, meaning, example)
      if (data.translations && Object.keys(data.translations).length > 0) {
        try {
          const contextResponse = await fetch(`${API_CONFIG.TRANSLATOR_API}/context`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify({ 
              words: Object.keys(data.translations), 
              translations: data.translations,
              targetLanguage: langCode 
            })
          });
          
          if (contextResponse.ok) {
            const contextData = await contextResponse.json();
            // Attach context to each translation
            for (const [word, context] of Object.entries(contextData.contexts || {})) {
              if (data.translations[word] && context) {
                // Store context with translation using special format
                data.translations[word] = {
                  translation: data.translations[word],
                  pronunciation: context.pronunciation,
                  meaning: context.meaning,
                  example: context.example
                };
              }
            }
          }
        } catch (error) {
          // Log but don't fail if context fetch fails
          logger.warn('Failed to fetch context:', error);
        }
      }
      
      return data.translations || {};
    });
  }
  
  // Get stats
  getStats(): TranslationStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      memoryCacheSize: this.memoryCache.size
    };
  }
  
  // Clear cache
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await storage.remove(STORAGE_KEYS.TRANSLATION_CACHE);
    this.stats = { hits: 0, misses: 0, apiCalls: 0 };
  }
}

// Export singleton
export const translator = new SimpleTranslator();