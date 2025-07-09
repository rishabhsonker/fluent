// Simple Translation Service - 2-tier caching only
'use strict';

import { API_CONFIG, STORAGE_KEYS, CACHE_LIMITS, SUPPORTED_LANGUAGES } from './constants';
import { storage } from './storage';
import { validator } from './validator';
import { rateLimiter } from './rateLimiter';
import { logger } from './logger';
import { costGuard } from './costGuard';
import { secureCrypto } from './secureCrypto';
import { InstallationAuth } from './installationAuth';
import { offlineManager } from './offlineManager';
import { translationCache } from './memoryCache';
import { fetchWithRetry, NetworkError } from './networkUtils';
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
  private stats: {
    hits: number;
    misses: number;
    apiCalls: number;
  };

  constructor() {
    // Stats for monitoring
    this.stats = {
      hits: 0,
      misses: 0,
      apiCalls: 0
    };
    
    // Initialize by loading from storage
    this.loadStorageCache();
    
    // Set up periodic cleanup
    setInterval(() => {
      translationCache.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
  
  // Load recent translations from storage
  private async loadStorageCache(): Promise<void> {
    try {
      const stored = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) as StorageCache | null;
      if (stored?.translations) {
        // Load recent translations into memory cache
        const entries = Object.entries(stored.translations);
        const recentEntries = entries.slice(-500); // Load last 500
        
        recentEntries.forEach(([key, value]) => {
          const [language, ...wordParts] = key.split(':');
          const word = wordParts.join(':');
          translationCache.setTranslation(word, language, value);
        });
        
        logger.info('Loaded translations from storage', { count: recentEntries.length });
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
    // Parse key to get language and word
    const [language, ...wordParts] = key.split(':');
    const word = wordParts.join(':');
    
    // L1: Memory cache (instant)
    const memCached = translationCache.getTranslation(word, language);
    if (memCached) {
      return memCached;
    }
    
    // L2: Storage cache
    try {
      const stored = await storage.get(STORAGE_KEYS.TRANSLATION_CACHE) as StorageCache | null;
      if (stored?.translations?.[key]) {
        // Add to memory cache for next time
        translationCache.setTranslation(word, language, stored.translations[key]);
        return stored.translations[key];
      }
    } catch (error) {
      logger.error('Cache read error:', error);
    }
    
    return null;
  }
  
  // Update both cache tiers
  private async updateCache(key: string, value: string): Promise<void> {
    // Parse key to get language and word
    const [language, ...wordParts] = key.split(':');
    const word = wordParts.join(':');
    
    // Update memory cache
    translationCache.setTranslation(word, language, value);
    
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
      
      // Use installation-based auth
      let authHeaders;
      try {
        authHeaders = await InstallationAuth.getAuthHeaders();
        logger.info('Installation auth headers generated:', {
          hasAuth: !!authHeaders['Authorization'],
          hasInstallationId: !!authHeaders['X-Installation-Id'],
          hasTimestamp: !!authHeaders['X-Timestamp'],
          hasSignature: !!authHeaders['X-Signature']
        });
      } catch (authError) {
        logger.error('Failed to generate installation auth headers:', authError);
        throw new Error('Authentication failed - please reload the extension');
      }
      
      // Convert language name to code (e.g., 'spanish' -> 'es')
      const langCode = SUPPORTED_LANGUAGES[targetLanguage]?.code || targetLanguage;
      
      // Debug logging
      logger.info('Translation request:', {
        words,
        targetLanguage: langCode,
        originalLanguage: targetLanguage,
        endpoint: `${API_CONFIG.TRANSLATOR_API}/translate`,
        authMethod: 'installation',
        headers: Object.keys(authHeaders)
      });
      
      // Use combined endpoint for better performance
      const endpoint = `${API_CONFIG.TRANSLATOR_API}/translate-with-context`;
      const response = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({ 
            words, 
            targetLanguage: langCode, 
            apiKey,
            enableContext: true // Get context in same request
          })
        },
        {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            logger.warn(`Translation retry attempt ${attempt}`, { error: error.message });
          }
        }
      );
      
      logger.info('Translation API response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
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
          requestBody: JSON.stringify({ words, targetLanguage: langCode, apiKey }),
          authHeaders: {
            hasAuth: !!authHeaders['Authorization'],
            hasInstallationId: !!authHeaders['X-Installation-Id'],
            hasTimestamp: !!authHeaders['X-Timestamp'],
            hasSignature: !!authHeaders['X-Signature']
          }
        });
        throw new Error(error.error || 'Translation failed');
      }
      
      const data = await response.json();
      
      // Ensure we have translations
      if (!data.translations) {
        logger.error('No translations in response!', data);
      }
      
      // Store rate limit info from response headers or metadata
      if (data.metadata?.limits || response.headers.get('X-RateLimit-Remaining-Hourly')) {
        const rateLimitInfo = {
          translationHourlyRemaining: parseInt(response.headers.get('X-RateLimit-Remaining-Hourly') || '100'),
          translationDailyRemaining: parseInt(response.headers.get('X-RateLimit-Remaining-Daily') || '1000'),
          aiHourlyRemaining: parseInt(response.headers.get('X-AI-RateLimit-Remaining-Hourly') || '10'),
          aiDailyRemaining: parseInt(response.headers.get('X-AI-RateLimit-Remaining-Daily') || '100'),
          lastChecked: Date.now()
        };
        
        // Store in local storage for popup to access
        chrome.storage.local.set({ rateLimitInfo }).catch(err => 
          logger.error('Failed to store rate limit info:', err)
        );
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
          const contextResponse = await fetchWithRetry(
            `${API_CONFIG.TRANSLATOR_API}/context`,
            {
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
            },
            {
              maxRetries: 2, // Fewer retries for context since it's optional
              initialDelay: 500 // Start with shorter delay
            }
          );
          
          if (contextResponse.ok) {
            const contextData = await contextResponse.json();
            // Attach context to each translation
            for (const [word, context] of Object.entries(contextData.contexts || {})) {
              if (data.translations[word] && context && typeof context === 'object') {
                // Store context with translation using special format
                data.translations[word] = {
                  translation: data.translations[word],
                  pronunciation: (context as any).pronunciation,
                  meaning: (context as any).meaning,
                  example: (context as any).example
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
    const cacheStats = translationCache.getStats();
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      memoryCacheSize: cacheStats.size,
      memoryCacheHitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
    };
  }
  
  // Clear cache
  async clearCache(): Promise<void> {
    translationCache.clear();
    await storage.remove(STORAGE_KEYS.TRANSLATION_CACHE);
    this.stats = { hits: 0, misses: 0, apiCalls: 0 };
  }
}

// Export singleton
export const translator = new SimpleTranslator();