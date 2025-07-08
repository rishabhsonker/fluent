/**
 * Cloudflare Worker - Secure Translation API Proxy
 * Features: Authentication, rate limiting, cost protection, caching, monitoring
 */

// Constants
const RATE_LIMITS = {
  FREE_DAILY_WORDS: 50,
  FREE_HOURLY_WORDS: 20,
  AUTHENTICATED_DAILY_WORDS: 10000,
  AUTHENTICATED_HOURLY_WORDS: 1000,
};

const COST_LIMITS = {
  DAILY_COST_USD: 10,
  HOURLY_COST_USD: 1,
  COST_PER_CHARACTER: 0.00001, // $10 per million characters
};

const CACHE_TTL = {
  TRANSLATION: 30 * 24 * 60 * 60, // 30 days
  RATE_LIMIT: 24 * 60 * 60, // 24 hours
  COST_TRACKING: 24 * 60 * 60, // 24 hours
};

// Structured logging helpers
function logInfo(message, context = {}) {
  console.log(JSON.stringify({
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    ...context
  }));
}

function logError(message, error, context = {}) {
  console.error(JSON.stringify({
    level: 'error',
    message,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    timestamp: new Date().toISOString(),
    ...context
  }));
}

function logMetric(metric, value, context = {}) {
  console.log(JSON.stringify({
    level: 'metric',
    metric,
    value,
    timestamp: new Date().toISOString(),
    ...context
  }));
}

// Request coalescing to prevent duplicate API calls
const pendingRequests = new Map();

async function getTranslationWithCoalescing(words, targetLanguage, apiKey, env) {
  const key = `${targetLanguage}:${words.sort().join(',')}`;
  
  // Check if there's already a pending request for these words
  if (pendingRequests.has(key)) {
    logInfo('Coalescing duplicate request', { key, wordCount: words.length });
    return pendingRequests.get(key);
  }
  
  // Create new request promise
  const promise = callTranslatorAPI(words, targetLanguage, apiKey, env);
  pendingRequests.set(key, promise);
  
  try {
    const result = await promise;
    return result;
  } finally {
    // Clean up after request completes
    pendingRequests.delete(key);
  }
}

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    
    // Enhanced security headers following best practices
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'interest-cohort=()',
    };

    // Enhanced CORS headers with stricter validation
    const origin = request.headers.get('Origin') || '';
    const isValidExtension = origin.startsWith('chrome-extension://') && 
                           origin.length > 19 && 
                           origin.length < 100;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': isValidExtension ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Extension-Id, X-Timestamp, X-Auth-Token, X-Client-Id',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'false',
    };

    const responseHeaders = { ...securityHeaders, ...corsHeaders };

    try {
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: responseHeaders });
      }

      // Only accept POST requests
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { 
          status: 405, 
          headers: responseHeaders 
        });
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Route: /translate
      if (pathname === '/translate') {
        // Verify authentication
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response(authResult.message, { 
            status: authResult.status, 
            headers: responseHeaders 
          });
        }

        // Process translation request
        const response = await handleTranslate(request, env, ctx);
        
        // Add performance header
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // Route: /health (restricted to authenticated requests)
      if (pathname === '/health') {
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response('Unauthorized', { 
            status: 401, 
            headers: responseHeaders 
          });
        }

        const health = await getHealthStatus(env);
        return new Response(JSON.stringify(health), {
          status: 200,
          headers: { ...responseHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { 
        status: 404, 
        headers: responseHeaders 
      });

    } catch (error) {
      // Log error for monitoring
      // Log error with structured format
      logError('Worker error', error, {
        path: request.url,
        method: request.method
      });
      
      // Don't expose internal errors to client
      return new Response('Internal server error', {
        status: 500,
        headers: responseHeaders,
      });
    }
  },
};

/**
 * Verify authentication headers
 */
async function verifyAuthentication(request, env) {
  const extensionId = request.headers.get('X-Extension-Id');
  const timestamp = request.headers.get('X-Timestamp');
  const authToken = request.headers.get('X-Auth-Token');

  // Check required headers
  if (!extensionId || !timestamp || !authToken) {
    return { status: 401, message: 'Missing authentication headers' };
  }

  // Verify timestamp (5-minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
    return { status: 401, message: 'Authentication token expired' };
  }

  // Get shared secret from environment
  const sharedSecret = env.FLUENT_SHARED_SECRET;
  if (!sharedSecret) {
    logError('FLUENT_SHARED_SECRET not configured', new Error('Missing configuration'));
    return { status: 500, message: 'Server configuration error' };
  }

  // Recreate and verify token
  const message = `${extensionId}-${timestamp}-${sharedSecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expectedToken = btoa(hashArray.map(b => String.fromCharCode(b)).join(''));

  if (authToken !== expectedToken) {
    return { status: 401, message: 'Invalid authentication token' };
  }

  // Optional: Verify extension ID allowlist
  const allowedExtensions = (env.ALLOWED_EXTENSION_IDS || '').split(',').filter(id => id);
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extensionId)) {
    return { status: 403, message: 'Extension not authorized' };
  }

  return null; // Authentication successful
}

/**
 * Handle translation requests with all security checks
 */
async function handleTranslate(request, env, ctx) {
  try {
    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { words, targetLanguage, apiKey } = body;

    // Input validation
    if (!words || !Array.isArray(words) || words.length === 0 || words.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid words array (1-100 words required)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate each word
    const validWords = words.filter(word => 
      typeof word === 'string' && 
      word.length > 0 && 
      word.length < 100 &&
      /^[\w\s'-]+$/u.test(word) // Allow letters, spaces, hyphens, apostrophes
    );

    if (validWords.length !== words.length) {
      return new Response(JSON.stringify({ error: 'Invalid word format detected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

    // Get client identifier
    const clientId = request.headers.get('X-Client-Id') || 
                    request.headers.get('CF-Connecting-IP') || 
                    'anonymous';

    // Check rate limits
    const rateLimitResult = await checkRateLimit(clientId, validWords.length, !!apiKey, env);
    if (rateLimitResult.blocked) {
      return new Response(JSON.stringify({ 
        error: rateLimitResult.message,
        retryAfter: rateLimitResult.retryAfter 
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': rateLimitResult.retryAfter.toString(),
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    }

    // Check cost limits (only for our API key usage)
    if (!apiKey) {
      const totalChars = validWords.join('').length;
      const costResult = await checkCostLimit(totalChars, env);
      if (costResult.blocked) {
        return new Response(JSON.stringify({ 
          error: costResult.message,
          dailyLimitUSD: COST_LIMITS.DAILY_COST_USD 
        }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Process translations
    const translations = {};
    const wordsToTranslate = [];
    const cacheStats = { hits: 0, misses: 0 };

    // Check cache first
    for (const word of validWords) {
      const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
      const cached = await env.TRANSLATION_CACHE.get(cacheKey);
      
      if (cached) {
        try {
          translations[word] = JSON.parse(cached);
          cacheStats.hits++;
        } catch {
          wordsToTranslate.push(word);
          cacheStats.misses++;
        }
      } else {
        wordsToTranslate.push(word);
        cacheStats.misses++;
      }
    }

    // Translate missing words
    if (wordsToTranslate.length > 0) {
      const translationApiKey = apiKey || env.MICROSOFT_TRANSLATOR_KEY;
      
      if (!translationApiKey) {
        return new Response(JSON.stringify({ 
          error: 'Translation API key required',
          message: 'Please provide your Microsoft Translator API key or use the free tier (50 words/day)'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        // Call translation API with request coalescing
        const apiTranslations = await getTranslationWithCoalescing(
          wordsToTranslate,
          targetLanguage,
          translationApiKey,
          env
        );

        // Cache successful translations
        const cachePromises = [];
        for (const [word, translation] of Object.entries(apiTranslations)) {
          if (translation && typeof translation === 'string') {
            translations[word] = translation;
            const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
            cachePromises.push(
              env.TRANSLATION_CACHE.put(
                cacheKey, 
                JSON.stringify(translation), 
                { expirationTtl: CACHE_TTL.TRANSLATION }
              )
            );
          }
        }

        // Cache in background
        ctx.waitUntil(Promise.all(cachePromises));

        // Update cost tracking (only for our API key)
        if (!apiKey) {
          const charCount = wordsToTranslate.join('').length;
          ctx.waitUntil(updateCostTracking(charCount, env));
        }

      } catch (error) {
        logError('Translation API error', error, {
          wordCount: words.length,
          targetLanguage
        });
        return new Response(JSON.stringify({ 
          error: 'Translation service error',
          message: 'Unable to translate words at this time'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Update rate limit counters
    ctx.waitUntil(updateRateLimit(clientId, validWords.length, !!apiKey, env));

    // Log successful request metrics
    logInfo('Translation request completed', {
      clientId,
      wordCount: validWords.length,
      targetLanguage,
      cacheHitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses),
      processingTimeMs: Date.now() - startTime,
      environment: env.ENVIRONMENT
    });

    // Return response with metadata
    return new Response(JSON.stringify({ 
      translations,
      metadata: {
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        cacheHitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses),
        wordsProcessed: validWords.length,
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache-Hits': cacheStats.hits.toString(),
        'X-Cache-Misses': cacheStats.misses.toString(),
      },
    });

  } catch (error) {
    logError('Translation handler error', error, {
      clientId,
      wordCount: validWords?.length || 0
    });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Rate limiting implementation
 */
async function checkRateLimit(clientId, wordCount, hasApiKey, env) {
  const now = new Date();
  const hourKey = `rate:${clientId}:${now.toISOString().slice(0, 13)}`;
  const dayKey = `rate:${clientId}:${now.toISOString().slice(0, 10)}`;

  const [hourlyCount, dailyCount] = await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]);

  const currentHourly = parseInt(hourlyCount || '0');
  const currentDaily = parseInt(dailyCount || '0');

  const limits = hasApiKey ? {
    hourly: RATE_LIMITS.AUTHENTICATED_HOURLY_WORDS,
    daily: RATE_LIMITS.AUTHENTICATED_DAILY_WORDS,
  } : {
    hourly: RATE_LIMITS.FREE_HOURLY_WORDS,
    daily: RATE_LIMITS.FREE_DAILY_WORDS,
  };

  // Check hourly limit
  if (currentHourly + wordCount > limits.hourly) {
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return {
      blocked: true,
      message: `Hourly rate limit exceeded (${limits.hourly} words/hour)`,
      retryAfter: Math.ceil((nextHour - now) / 1000),
      limit: limits.hourly,
      remaining: Math.max(0, limits.hourly - currentHourly),
    };
  }

  // Check daily limit
  if (currentDaily + wordCount > limits.daily) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    return {
      blocked: true,
      message: `Daily rate limit exceeded (${limits.daily} words/day). ${hasApiKey ? '' : 'Provide your own API key for higher limits.'}`,
      retryAfter: Math.ceil((nextDay - now) / 1000),
      limit: limits.daily,
      remaining: Math.max(0, limits.daily - currentDaily),
    };
  }

  return {
    blocked: false,
    limit: limits.daily,
    remaining: limits.daily - currentDaily - wordCount,
  };
}

/**
 * Update rate limit counters
 */
async function updateRateLimit(clientId, wordCount, hasApiKey, env) {
  const now = new Date();
  const hourKey = `rate:${clientId}:${now.toISOString().slice(0, 13)}`;
  const dayKey = `rate:${clientId}:${now.toISOString().slice(0, 10)}`;

  const [hourlyCount, dailyCount] = await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]);

  await Promise.all([
    env.TRANSLATION_CACHE.put(
      hourKey,
      String((parseInt(hourlyCount || '0') + wordCount)),
      { expirationTtl: 3600 } // 1 hour
    ),
    env.TRANSLATION_CACHE.put(
      dayKey,
      String((parseInt(dailyCount || '0') + wordCount)),
      { expirationTtl: CACHE_TTL.RATE_LIMIT }
    ),
  ]);
}

/**
 * Cost limiting for our API key usage
 */
async function checkCostLimit(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;

  const [hourlyCost, dailyCost] = await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]);

  const currentHourlyCost = parseFloat(hourlyCost || '0');
  const currentDailyCost = parseFloat(dailyCost || '0');
  const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;

  // Check hourly cost limit
  if (currentHourlyCost + requestCost > COST_LIMITS.HOURLY_COST_USD) {
    return {
      blocked: true,
      message: 'Hourly cost limit exceeded. Please try again later or provide your own API key.',
    };
  }

  // Check daily cost limit
  if (currentDailyCost + requestCost > COST_LIMITS.DAILY_COST_USD) {
    return {
      blocked: true,
      message: 'Daily cost limit exceeded. Service will resume tomorrow or provide your own API key.',
    };
  }

  return { blocked: false };
}

/**
 * Update cost tracking
 */
async function updateCostTracking(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;
  const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;

  const [hourlyCost, dailyCost] = await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]);

  await Promise.all([
    env.TRANSLATION_CACHE.put(
      hourKey,
      String((parseFloat(hourlyCost || '0') + requestCost)),
      { expirationTtl: 3600 } // 1 hour
    ),
    env.TRANSLATION_CACHE.put(
      dayKey,
      String((parseFloat(dailyCost || '0') + requestCost)),
      { expirationTtl: CACHE_TTL.COST_TRACKING }
    ),
  ]);
}

/**
 * Call Microsoft Translator API with batch optimization
 */
async function callTranslatorAPI(words, targetLanguage, apiKey, env) {
  const BATCH_SIZE = 25; // Microsoft Translator optimal batch size
  const endpoint = 'https://api.cognitive.microsofttranslator.com/translate';
  const params = new URLSearchParams({
    'api-version': '3.0',
    'from': 'en',
    'to': targetLanguage,
  });

  // If words exceed batch size, process in batches
  if (words.length > BATCH_SIZE) {
    logInfo('Processing large translation request in batches', {
      totalWords: words.length,
      batchSize: BATCH_SIZE,
      batches: Math.ceil(words.length / BATCH_SIZE)
    });
    
    const results = {};
    const batches = [];
    
    // Create batches
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      batches.push(words.slice(i, i + BATCH_SIZE));
    }
    
    // Process batches in parallel
    const batchPromises = batches.map(async (batch) => {
      const response = await fetch(`${endpoint}?${params}`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Ocp-Apim-Subscription-Region': env.AZURE_REGION || 'global',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch.map(word => ({ text: word }))),
      });
      
      if (!response.ok) {
        throw new Error(`Batch translation failed: ${response.status}`);
      }
      
      return { batch, result: await response.json() };
    });
    
    // Wait for all batches
    const batchResults = await Promise.all(batchPromises);
    
    // Combine results
    for (const { batch, result } of batchResults) {
      for (let i = 0; i < batch.length; i++) {
        if (result[i]?.translations?.[0]?.text) {
          results[batch[i]] = result[i].translations[0].text;
        }
      }
    }
    
    return results;
  }

  // Process single batch
  const response = await fetch(`${endpoint}?${params}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Ocp-Apim-Subscription-Region': env.AZURE_REGION || 'global',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(words.map(word => ({ text: word }))),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logError('Translator API error', new Error(`API returned ${response.status}: ${errorText}`), {
      status: response.status,
      targetLanguage,
      wordCount: words.length
    });
    throw new Error(`Translator API error: ${response.status}`);
  }

  const result = await response.json();
  const translations = {};
  
  for (let i = 0; i < words.length; i++) {
    if (result[i]?.translations?.[0]?.text) {
      translations[words[i]] = result[i].translations[0].text;
    }
  }
  
  return translations;
}

/**
 * Get health status for monitoring
 */
async function getHealthStatus(env) {
  const now = new Date();
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;
  const dailyCost = await env.TRANSLATION_CACHE.get(dayKey);

  return {
    status: 'healthy',
    timestamp: now.toISOString(),
    dailyCostUSD: parseFloat(dailyCost || '0').toFixed(2),
    dailyCostLimit: COST_LIMITS.DAILY_COST_USD,
    environment: {
      hasTranslatorKey: !!env.MICROSOFT_TRANSLATOR_KEY,
      hasSharedSecret: !!env.FLUENT_SHARED_SECRET,
    },
  };
}