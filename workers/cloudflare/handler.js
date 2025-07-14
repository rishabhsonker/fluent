/**
 * Main request handler module for Cloudflare Worker
 * Handles the /translate endpoint logic with combined translation + context
 */

import { logInfo, logError } from './logger.js';
import { getErrorHandler, createErrorResponse, ErrorTypes } from './error-handler.js';
import { checkTranslationsCache, storeContextVariations, cacheTranslations } from './cache.js';
import { applyRateLimit, checkCostLimit, updateCostTracking } from './limiter.js';
import { callTranslatorAPI, getContextForWords } from './api.js';
import { generateBasicContext, generateBasicContextVariations } from './context.js';
import { validateWordList, validatePayloadSize, VALIDATION_LIMITS } from './validator.js';
import { RATE_LIMITS, TIME_PERIODS, CACHE } from './constants.js';

/**
 * Handle combined translation + context request
 */
export async function handleTranslateWithContext(request, env, ctx) {
  const errorHandler = getErrorHandler(env);
  const startTime = Date.now();
  
  // Get installation ID for rate limiting
  const installationId = request.headers.get('X-Installation-Id') || 'anonymous';
  
  return errorHandler.withErrorHandling(async () => {
    let validationResult;
    // Check payload size first
    if (!validatePayloadSize(request)) {
      const error = new Error(`Request too large. Maximum size: ${VALIDATION_LIMITS.MAX_REQUEST_SIZE_BYTES} bytes`);
      error.name = 'ValidationError';
      error.status = 413;
      return new Response(
        JSON.stringify(createErrorResponse(error)),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Parse request body with error handling
    const body = await errorHandler.withErrorHandling(
      () => request.json(),
      {
        operation: 'parse-request-body',
        component: 'handler',
        fallbackValue: null
      }
    );
    
    if (!body) {
      const error = new Error('Invalid JSON in request body');
      error.name = 'ValidationError';
      error.status = 400;
      return new Response(
        JSON.stringify(createErrorResponse(error)),
        {
          status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
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
    validationResult = validateWordList(words, targetLanguage);
    if (!validationResult.valid) {
      const error = new Error(validationResult.error);
      error.name = 'ValidationError';
      error.status = 400;
      return new Response(
        JSON.stringify(createErrorResponse(error)),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const validWords = validationResult.words;
    if (validWords.length === 0) {
      const error = new Error('No valid words found after validation');
      error.name = 'ValidationError';
      error.status = 400;
      const errorResponse = createErrorResponse(error);
      errorResponse.error.details = { filtered: validationResult.filtered };
      return new Response(
        JSON.stringify(errorResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check cache for translations
    const { translations, wordsToTranslate, cacheStats } = await checkTranslationsCache(
      env, 
      validWords, 
      targetLanguage
    );

    // Apply rate limiting with payload size consideration
    const payloadSize = new TextEncoder().encode(JSON.stringify(body)).length;
    const rateLimitKey = `${installationId}:${targetLanguage}:${Math.ceil(payloadSize / CACHE.MAX_STRING_LENGTH)}`;
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
                  
                  // Context will be cached later in bulk
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
          
          // Context will be cached using cacheTranslations function
        }
      }

      // Cache all translations with context
      ctx.waitUntil(cacheTranslations(env, translations, targetLanguage, ctx));

      // Update cost tracking
      if (!apiKey) {
        const charCount = wordsToTranslate.join('').length;
        // Note: Cost tracking is now implicit through usage tracking
        // The trackUsage calls in auth.js handle incrementing counters
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
        'X-RateLimit-Remaining-Hourly': (rateLimitStatus.hourlyRemaining || RATE_LIMITS.TRANSLATIONS_PER_HOUR).toString(),
        'X-RateLimit-Remaining-Daily': (rateLimitStatus.dailyRemaining || RATE_LIMITS.TRANSLATIONS_PER_DAY).toString(),
        'X-Processing-Time-Ms': processingTime.toString(),
        'X-Cache-Hit-Rate': (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1),
        'X-Preloaded-Hit-Rate': (cacheStats.preloadedHits / validWords.length * 100).toFixed(1),
      },
    });

  }, {
    operation: 'handle-translate-request',
    component: 'handler',
    extra: {
      installationId,
      method: request.method,
      url: request.url
    },
    fallbackValue: new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  });
}