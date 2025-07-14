/**
 * Cache module for Cloudflare Worker
 * Handles D1 database operations for translation caching
 */

import { logError } from './logger.js';
import { safe, safeSync } from './utils.js';

export const CACHE_TTL = {
  TRANSLATION: 30 * 24 * 60 * 60, // 30 days (in seconds, but D1 uses timestamps)
  RATE_LIMIT: 24 * 60 * 60, // 24 hours
  COST_TRACKING: 24 * 60 * 60, // 24 hours
};

/**
 * Get rotating context from D1 with automatic rotation
 */
export async function getRotatingContext(env, targetLanguage, word) {
  if (!env.DB) return null;
  
  return await safe(async () => {
    // Get translation with context from D1
    const result = await env.DB.prepare(`
      SELECT translation, pronunciation, context, etymology 
      FROM translations 
      WHERE word = ? AND language = ?
    `).bind(word.toLowerCase(), targetLanguage).first();
    
    if (!result || !result.context) {
      return null;
    }
    
    // Parse context JSON array
    const contexts = safeSync(() => JSON.parse(result.context), 'Parse context JSON', []);
    
    if (!Array.isArray(contexts) || contexts.length === 0) {
      return null;
    }
    
    // Simple rotation: use random context
    const selectedContext = contexts[Math.floor(Math.random() * contexts.length)];
    
    return {
      translation: result.translation,
      pronunciation: result.pronunciation || selectedContext.pronunciation,
      meaning: selectedContext.meaning,
      example: selectedContext.example
    };
  }, 'Error getting rotating context from D1', null);
}

/**
 * Store multiple context variations for rotation
 */
export async function storeContextVariations(env, targetLanguage, word, translation, contexts) {
  if (!env.DB || !contexts || contexts.length === 0) return;
  
  await safe(async () => {
    const wordLower = word.toLowerCase();
    const contextJson = JSON.stringify(contexts);
    const pronunciation = contexts[0]?.pronunciation || '';
    const etymology = `The ${targetLanguage === 'es' ? 'Spanish' : targetLanguage === 'fr' ? 'French' : 'German'} word for "${word}"`;
    
    // Insert or update translation with contexts
    await env.DB.prepare(`
      INSERT INTO translations (word, language, translation, pronunciation, level, context, etymology)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(word, language) DO UPDATE SET
        translation = excluded.translation,
        pronunciation = excluded.pronunciation,
        context = excluded.context,
        etymology = excluded.etymology
    `).bind(
      wordLower,
      targetLanguage,
      translation,
      pronunciation,
      3, // Default level
      contextJson,
      etymology
    ).run();
  }, 'Error storing context variations in D1');
}

/**
 * Check translations in D1 cache
 */
export async function checkTranslationsCache(env, words, targetLanguage) {
  const translations = {};
  const wordsToTranslate = [];
  const cacheStats = { hits: 0, misses: 0, preloadedHits: 0 };

  if (!env.DB) {
    return { translations, wordsToTranslate: words, cacheStats };
  }

  const result = await safe(async () => {
    // Batch query for all words
    const wordList = words.map(w => w.toLowerCase().trim());
    const placeholders = wordList.map(() => '?').join(',');
    
    const results = await env.DB.prepare(`
      SELECT word, translation, pronunciation, context, etymology 
      FROM translations 
      WHERE word IN (${placeholders}) AND language = ?
    `).bind(...wordList, targetLanguage).all();
    
    // Create a map for quick lookup
    const cachedMap = new Map();
    for (const row of results.results || []) {
      cachedMap.set(row.word, row);
    }
    
    // Process each word
    for (const word of words) {
      const wordLower = word.toLowerCase().trim();
      const cached = cachedMap.get(wordLower);
      
      if (cached) {
        // Check if we have full context
        if (cached.pronunciation && cached.context) {
          // Try to get rotating context
          const rotatingContext = await getRotatingContext(env, targetLanguage, wordLower);
          if (rotatingContext) {
            translations[word] = rotatingContext;
            cacheStats.preloadedHits++;
            cacheStats.hits++;
          } else {
            // Fallback to basic translation
            translations[word] = {
              translation: cached.translation,
              pronunciation: cached.pronunciation,
              meaning: cached.etymology,
              example: `"${cached.translation}" means "${word}"`
            };
            cacheStats.hits++;
          }
        } else {
          // Old format - need to get context
          wordsToTranslate.push(word);
          translations[word] = cached.translation;
          cacheStats.misses++; // Count as miss since we need context
        }
      } else {
        wordsToTranslate.push(word);
        cacheStats.misses++;
      }
    }
    
    return { translations, wordsToTranslate, cacheStats };
  }, 'Error checking translations cache in D1');

  // On error, translate all words
  if (!result) {
    return { translations: {}, wordsToTranslate: words, cacheStats };
  }

  return result;
}

/**
 * Cache translations with context in D1
 */
export async function cacheTranslations(env, translations, targetLanguage, ctx) {
  if (!env.DB) return;
  
  const cachePromises = [];
  
  for (const [word, data] of Object.entries(translations)) {
    if (data && typeof data === 'object' && data.pronunciation) {
      // Create context array with the single context we have
      const contexts = [{
        pronunciation: data.pronunciation,
        meaning: data.meaning,
        example: data.example
      }];
      
      cachePromises.push(
        storeContextVariations(env, targetLanguage, word, data.translation, contexts)
      );
    }
  }
  
  if (cachePromises.length > 0) {
    ctx.waitUntil(Promise.all(cachePromises));
  }
}