/**
 * Translation Service - Manages translation API calls and caching
 * 
 * Purpose:
 * - Provides translation functionality with intelligent caching
 * - Minimizes API calls through 2-tier cache system
 * - Handles authentication and rate limiting for translation requests
 * 
 * Key Features:
 * - 2-tier caching: Memory (L1) and Chrome Storage (L2)
 * - Offline translation support via bundled common words
 * - BYOK (Bring Your Own Key) support for custom API keys
 * - Automatic cache cleanup and size management
 * - Cost tracking and limits for free tier
 * 
 * Cache Strategy:
 * - L1 Memory: 1000 translations, instant access
 * - L2 Storage: 5000 translations, persistent across sessions
 * - Offline: Common words bundled with extension
 * 
 * Referenced by:
 * - src/core/worker.ts (handles translation requests)
 * - src/features/translation/processor.ts (gets translations)
 * 
 * External APIs:
 * - Cloudflare Worker /translate endpoint
 * - Microsoft Translator API (via worker proxy)
 * - Claude API for context (via worker proxy)
 * 
 * Performance:
 * - Cache hit rate target: >90%
 * - API response time: <2s with context
 */

'use strict';

import { API_CONFIG, STORAGE_KEYS, CACHE_LIMITS, SUPPORTED_LANGUAGES } from '../../shared/constants';
import { storage } from '../settings/storage';
import { validator } from '../../shared/validator';
import { rateLimiter } from '../../shared/throttle';
import { logger } from '../../shared/logger';
import { costGuard } from '../../shared/cost';
import { secureCrypto } from '../auth/crypto';
import { InstallationAuth } from '../auth/auth';
import { offlineManager } from '../../shared/offline';
import { translationCache } from '../../shared/cache';
import { fetchWithRetry, NetworkError } from '../../shared/network';
import { safe, chromeCall } from '../../shared/utils/helpers';
import { getErrorHandler } from '../../shared/utils/error-handler';
import type { 
  Translation, 
  TranslationResult, 
  TranslationStats,
  LanguageCode,
  StorageCache
} from '../../shared/types';

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
    const stored = await chromeCall(
      () => storage.get(STORAGE_KEYS.TRANSLATION_CACHE),
      'translator.loadStorageCache',
      null
    ) as StorageCache | null;
    
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
        await safe(async () => {
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
        }, 'translator.translate');
      } catch (error) {
        // Return partial results on error
        return {
          translations,
          error: 'Translation failed'
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
    const stored = await chromeCall(
      () => storage.get(STORAGE_KEYS.TRANSLATION_CACHE),
      'translator.getFromCache',
      null
    ) as StorageCache | null;
    
    if (stored?.translations?.[key]) {
      // Add to memory cache for next time
      translationCache.setTranslation(word, language, stored.translations[key]);
      return stored.translations[key];
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
    await chromeCall(async () => {
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
    }, 'translator.updateCache');
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
      
      // Use proper installation-based authentication
      const authHeaders = await (await import('../auth/auth')).InstallationAuth.getAuthHeaders();
      
      // Convert language name to code (e.g., 'spanish' -> 'es')
      const langCode = SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES]?.code || targetLanguage;
      
      
      // Use the combined translate endpoint
      const endpoint = `${API_CONFIG.TRANSLATOR_API}/translate`;
      
        
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
            enableContext: true // Get context with translations proactively
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
        const errorHandler = getErrorHandler();
        let error;
        
        error = await safe(
          () => response.json(),
          'translator.parseErrorResponse',
          { error: 'Failed to parse error response' }
        );
        
        errorHandler.handleError(new Error(error.error || 'Translation failed'), {
          operation: 'translator.fetchTranslations',
          component: 'translator',
          extra: {
            status: response.status,
            error: error,
            request: { words, targetLanguage: langCode, originalTargetLanguage: targetLanguage },
            authHeaders: {
              hasAuth: !!authHeaders['Authorization'],
              hasInstallationId: !!authHeaders['X-Installation-Id'],
              hasTimestamp: !!authHeaders['X-Timestamp'],
              hasSignature: !!authHeaders['X-Signature']
            }
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
        await chromeCall(
          () => chrome.storage.local.set({ rateLimitInfo }),
          'translator.setRateLimitInfo'
        );
      }
      
      // Record cost
      if (!apiKey && data.translations) {
        const actualChars = JSON.stringify(data.translations).length;
        costGuard.recordUsage('translation', actualChars);
      }
      
      this.stats.apiCalls++;
      
      // The new /translate endpoint already includes context data
      // No need for a separate context request
      
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
  
  // Fetch context for a single word-translation pair
  async getContext(
    word: string,
    translation: string,
    targetLanguage: string,
    sentence?: string
  ): Promise<{ pronunciation?: string; meaning?: string; example?: string } | null> {
    
    const validLanguage = validator.validateLanguage(targetLanguage) as LanguageCode;
    
    // Check memory cache first
    const cacheKey = `context:${validLanguage}:${word.toLowerCase()}`;
    const cached = translationCache.getContext(word, validLanguage);
    if (cached) {
      return cached;
    }
    
    // Check storage cache
    const stored = await chromeCall(
      () => storage.get(STORAGE_KEYS.CONTEXT_CACHE),
      'translator.getContextCache',
      null
    ) as any;
    
    if (stored?.contexts?.[cacheKey]) {
      // Add to memory cache
      const context = stored.contexts[cacheKey];
      translationCache.setContext(word, validLanguage, context);
      return context;
    }
    
    
    // Apply rate limiting for context requests
    const identifier = 'free'; // Context is only available for free tier for now
    
    return await rateLimiter.withRateLimit('context', identifier, async () => {
      // Check cost limits for AI context
      await costGuard.checkCost('context', 100); // Estimate 100 chars for context
      
      return await safe(async () => {
        // Use proper installation-based authentication
        const authHeaders = await (await import('../auth/auth')).InstallationAuth.getAuthHeaders();
        
        const langCode = SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES]?.code || targetLanguage;
        
        const requestBody = {
          word,
          translation,
          targetLanguage: langCode,
          sentence
        };
        
        
        const response = await fetchWithRetry(
          `${API_CONFIG.TRANSLATOR_API}/context`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify(requestBody)
          },
          {
            maxRetries: 2,
            onRetry: (attempt, error) => {
              logger.warn(`Context retry attempt ${attempt}`, { error: error.message });
            }
          }
        );
        
        
        if (!response.ok) {
          logger.error('Context API error:', { status: response.status });
          return null;
        }
        
        const data = await response.json();
        
        const context = data.context || null;
        
        if (context) {
          // Record cost
          costGuard.recordUsage('context', 100);
          
          // Cache the context
          translationCache.setContext(word, validLanguage, context);
          
          // Update storage cache
          await chromeCall(async () => {
            const stored = await storage.get(STORAGE_KEYS.CONTEXT_CACHE) || { contexts: {} };
            stored.contexts[cacheKey] = context;
            await storage.set(STORAGE_KEYS.CONTEXT_CACHE, stored);
          }, 'translator.setContextCache');
        }
        
        return context;
      }, 'translator.getContext', null);
    });
  }
}

// Export singleton
export const translator = new SimpleTranslator();