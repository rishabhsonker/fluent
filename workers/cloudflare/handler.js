/**
 * Main request handler module for Cloudflare Worker
 * Handles the /translate endpoint logic with combined translation + context
 */

import { logInfo, logError } from './logger.js';
import { checkTranslationsCache, cacheTranslations, storeContextVariations, CACHE_TTL } from './cache.js';
import { applyRateLimit, checkCostLimit, updateCostTracking } from './limiter.js';
import { callTranslatorAPI, getContextForWords } from './api.js';
import { generateBasicContext, generateBasicContextVariations } from './context.js';
import { validateWordList, validatePayloadSize, VALIDATION_LIMITS } from './validator.js';

/**
 * Handle combined translation + context request
 */
export async function handleTranslateWithContext(request, env, ctx) {
  const startTime = Date.now();
  
  // Get installation ID for rate limiting
  const installationId = request.headers.get('X-Installation-Id') || 'anonymous';
  
  try {
    // Check payload size first
    if (!validatePayloadSize(request)) {
      return new Response(JSON.stringify({ 
        error: `Request too large. Maximum size: ${VALIDATION_LIMITS.MAX_REQUEST_SIZE_BYTES} bytes` 
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Parse request body
    const body = await request.json();
    const { words, targetLanguage, apiKey, enableContext = true } = body;

    // Validate target language
    const supportedLanguages = ['es', 'fr', 'de', 'it', 'pt'];
    if (!targetLanguage || !supportedLanguages.includes(targetLanguage)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid target language',
        supported: supportedLanguages 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate word list with enhanced validation
    const validationResult = validateWordList(words, targetLanguage);
    if (!validationResult.valid) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validWords = validationResult.words;
    if (validWords.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No valid words found after validation',
        filtered: validationResult.filtered 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check cache for translations
    const { translations, wordsToTranslate, cacheStats } = await checkTranslationsCache(
      env, 
      validWords, 
      targetLanguage
    );

    // Apply rate limiting with payload size consideration
    const payloadSize = new TextEncoder().encode(JSON.stringify(body)).length;
    const rateLimitKey = `${installationId}:${targetLanguage}:${Math.ceil(payloadSize / 1000)}`;
    const rateLimit = await applyRateLimit(env, rateLimitKey, targetLanguage, wordsToTranslate);
    
    if (rateLimit.limited) {
      return new Response(JSON.stringify({
        translations,  // Return cached translations
        ...rateLimit.response,
        metadata: {
          ...rateLimit.response.metadata,
          cacheHits: cacheStats.hits,
          cacheMisses: cacheStats.misses
        }
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...rateLimit.headers
        }
      });
    }

    const rateLimitStatus = rateLimit.rateLimitStatus;

    // Check cost limits (only if using our API key)
    if (!apiKey && wordsToTranslate.length > 0) {
      const totalChars = wordsToTranslate.join('').length;
      const costResult = await checkCostLimit(totalChars, env);
      if (costResult.blocked) {
        return new Response(JSON.stringify({ 
          translations,  // Return cached translations
          error: costResult.message,
          metadata: {
            cacheHits: cacheStats.hits,
            cacheMisses: cacheStats.misses,
            partial: true
          }
        }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Translate missing words
    if (wordsToTranslate.length > 0) {
      const translationApiKey = apiKey || env.MICROSOFT_TRANSLATOR_KEY;
      
      if (!translationApiKey) {
        return new Response(JSON.stringify({ 
          error: 'Translation API key required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Debug logging for API key
      logInfo('Using translation API', {
        hasApiKey: !!translationApiKey,
        azureRegion: env.AZURE_REGION || 'not-set'
      });

      // Start both translation and context generation in parallel
      const translationPromise = callTranslatorAPI(
        wordsToTranslate,
        targetLanguage,
        translationApiKey,
        env
      );
      
      // Generate basic context immediately
      const basicContext = generateBasicContext(wordsToTranslate, translations, targetLanguage);
      
      // Wait for translations first
      const apiTranslations = await translationPromise;
      
      // Store basic context variations for future use
      ctx.waitUntil((async () => {
        for (const word of wordsToTranslate) {
          const translation = apiTranslations[word] || translations[word] || word;
          const variations = generateBasicContextVariations(word, translation, targetLanguage, 3);
          await storeContextVariations(env, targetLanguage, word, translation, variations);
        }
      })());
      
      // Start enhanced context generation if enabled
      let enhancedContextPromise = null;
      if (enableContext && env.CLAUDE_API_KEY && wordsToTranslate.length > 0) {
        // Use actual translations for context generation
        const translationsForContext = {};
        for (const word of wordsToTranslate) {
          translationsForContext[word] = apiTranslations[word] || translations[word] || word;
        }
        
        enhancedContextPromise = getContextForWords(
          wordsToTranslate,
          translationsForContext,
          targetLanguage,
          env,
          ctx,
          installationId
        );
      }
      
      // Don't wait for enhanced context - let it complete in background
      let enhancedContext = {};
      if (enhancedContextPromise) {
        // Use Promise.race with a timeout to avoid waiting too long
        enhancedContext = await Promise.race([
          enhancedContextPromise,
          new Promise(resolve => setTimeout(() => resolve({}), 1000)) // 1 second timeout
        ]) || {};
        
        // Continue fetching enhanced context in background
        if (Object.keys(enhancedContext).length === 0) {
          ctx.waitUntil(
            enhancedContextPromise.then(async (fullContext) => {
              // Cache the enhanced context for future requests
              const cachePromises = [];
              for (const word of Object.keys(fullContext)) {
                const translation = apiTranslations[word] || translations[word];
                if (translation && fullContext[word]) {
                  const combined = {
                    translation: typeof translation === 'string' ? translation : translation.translation || translation,
                    pronunciation: fullContext[word].pronunciation,
                    meaning: fullContext[word].meaning,
                    example: fullContext[word].example
                  };
                  
                  const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
                  cachePromises.push(
                    env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
                      cacheKey,
                      JSON.stringify(combined),
                      { expirationTtl: CACHE_TTL.TRANSLATION }
                    )
                  );
                }
              }
              await Promise.all(cachePromises);
            })
          );
        }
      }
      
      // Update translations with context and cache them
      const cachePromises = [];
      for (const word of wordsToTranslate) {
        const translation = apiTranslations[word] || translations[word];
        const context = enhancedContext[word] || basicContext[word];
        
        if (translation) {
          const combined = {
            translation: typeof translation === 'string' ? translation : translation.translation || translation,
            pronunciation: context?.pronunciation || basicContext[word]?.pronunciation,
            meaning: context?.meaning || basicContext[word]?.meaning,
            example: context?.example || basicContext[word]?.example
          };
          
          translations[word] = combined;
          
          // Only cache if we have enhanced context
          if (enhancedContext[word]) {
            const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
            cachePromises.push(
              env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
                cacheKey, 
                JSON.stringify(combined), 
                { expirationTtl: CACHE_TTL.TRANSLATION }
              )
            );
          }
        }
      }

      ctx.waitUntil(Promise.all(cachePromises));

      // Update cost tracking
      if (!apiKey) {
        const charCount = wordsToTranslate.join('').length;
        ctx.waitUntil(updateCostTracking(charCount, env));
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    logInfo('Translation request completed', {
      installationId,
      wordsRequested: words.length,
      validWords: validWords.length,
      filteredWords: validationResult.filtered,
      newTranslations: wordsToTranslate.length,
      cachedTranslations: cacheStats.hits,
      targetLanguage,
      processingTimeMs: processingTime,
      wallTimeMs: processingTime,
      responseStatus: 200
    });
    
    return new Response(JSON.stringify({ 
      translations,
      metadata: {
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        preloadedHits: cacheStats.preloadedHits,
        wordsProcessed: validWords.length,
        wordsFiltered: validationResult.filtered,
        newTranslations: wordsToTranslate.length,
        limits: rateLimitStatus
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining-Hourly': (rateLimitStatus.hourlyRemaining || 100).toString(),
        'X-RateLimit-Remaining-Daily': (rateLimitStatus.dailyRemaining || 1000).toString(),
        'X-Processing-Time-Ms': processingTime.toString(),
        'X-Cache-Hit-Rate': (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1),
        'X-Preloaded-Hit-Rate': (cacheStats.preloadedHits / validWords.length * 100).toFixed(1),
      },
    });

  } catch (error) {
    logError('Translation handler error', error, {
      installationId,
      wordCount: words?.length || 0,
      validWords: validWords?.length || 0
    });
    return new Response(JSON.stringify({ 
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}