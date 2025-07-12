/**
 * Cache module for Cloudflare Worker
 * Handles KV cache operations and context rotation
 */

export const CACHE_TTL = {
  TRANSLATION: 30 * 24 * 60 * 60, // 30 days
  RATE_LIMIT: 24 * 60 * 60, // 24 hours
  COST_TRACKING: 24 * 60 * 60, // 24 hours
};

/**
 * Get rotating context from cache with automatic rotation
 */
export async function getRotatingContext(env, targetLanguage, word) {
  if (!env.TRANSLATION_CACHE) return null;
  
  const cacheKey = `contexts:${targetLanguage}:${word.toLowerCase()}`;
  const contextData = await env.TRANSLATION_CACHE.get(cacheKey, { type: 'json' });
  
  if (!contextData || !contextData.contexts || contextData.contexts.length === 0) {
    return null;
  }
  
  // Get the last used index and rotate
  const lastIndex = contextData.lastUsedIndex || 0;
  const nextIndex = (lastIndex + 1) % contextData.contexts.length;
  const selectedContext = contextData.contexts[lastIndex];
  
  // Update the last used index
  contextData.lastUsedIndex = nextIndex;
  await env.TRANSLATION_CACHE.put(cacheKey, JSON.stringify(contextData), {
    expirationTtl: CACHE_TTL.TRANSLATION
  });
  
  return {
    translation: contextData.translation,
    ...selectedContext
  };
}

/**
 * Store multiple context variations for rotation
 */
export async function storeContextVariations(env, targetLanguage, word, translation, contexts) {
  if (!env.TRANSLATION_CACHE || !contexts || contexts.length === 0) return;
  
  const cacheKey = `contexts:${targetLanguage}:${word.toLowerCase()}`;
  const contextData = {
    translation: translation,
    contexts: contexts,
    lastUsedIndex: 0,
    createdAt: Date.now()
  };
  
  await env.TRANSLATION_CACHE.put(cacheKey, JSON.stringify(contextData), {
    expirationTtl: CACHE_TTL.TRANSLATION
  });
}

/**
 * Check translations in cache
 */
export async function checkTranslationsCache(env, words, targetLanguage) {
  const translations = {};
  const wordsToTranslate = [];
  const cacheStats = { hits: 0, misses: 0, preloadedHits: 0 };

  for (const word of words) {
    const wordLower = word.toLowerCase().trim();
    
    // First check rotating context cache
    const rotatingContext = await getRotatingContext(env, targetLanguage, wordLower);
    if (rotatingContext) {
      translations[word] = rotatingContext;
      cacheStats.preloadedHits++;
      cacheStats.hits++;
      continue;
    }
    
    // Then check KV cache
    const cacheKey = `trans:${targetLanguage}:${wordLower}`;
    const cached = env.TRANSLATION_CACHE ? await env.TRANSLATION_CACHE.get(cacheKey) : null;
    
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        // Check if cached data has context (new format) or is just a string (old format)
        if (typeof cachedData === 'string' || !cachedData.pronunciation) {
          // Old format - need to get context
          wordsToTranslate.push(word);
          translations[word] = typeof cachedData === 'string' ? cachedData : cachedData.translation;
          cacheStats.misses++; // Count as miss since we need context
        } else {
          // New format with context
          translations[word] = cachedData;
          cacheStats.hits++;
        }
      } catch {
        wordsToTranslate.push(word);
        cacheStats.misses++;
      }
    } else {
      wordsToTranslate.push(word);
      cacheStats.misses++;
    }
  }

  return { translations, wordsToTranslate, cacheStats };
}

/**
 * Cache translations with context
 */
export async function cacheTranslations(env, translations, targetLanguage, ctx) {
  const cachePromises = [];
  
  for (const [word, data] of Object.entries(translations)) {
    if (data && typeof data === 'object' && data.pronunciation) {
      const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
      cachePromises.push(
        env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
          cacheKey, 
          JSON.stringify(data), 
          { expirationTtl: CACHE_TTL.TRANSLATION }
        )
      );
    }
  }
  
  if (cachePromises.length > 0) {
    ctx.waitUntil(Promise.all(cachePromises));
  }
}