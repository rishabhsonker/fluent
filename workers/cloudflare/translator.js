/**
 * Cloudflare Worker - Simplified Translation API Proxy
 * Two endpoints only:
 * - GET /config - Site configuration (no auth)
 * - POST /translate - Combined translation + context (with auth)
 */

// Constants
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

/**
 * Validate required environment bindings
 */
function validateEnvironment(env) {
  const warnings = [];
  
  if (!env.TRANSLATION_CACHE) {
    warnings.push('TRANSLATION_CACHE KV namespace not bound - caching disabled');
  }
  
  if (!env.MICROSOFT_TRANSLATOR_KEY) {
    warnings.push('MICROSOFT_TRANSLATOR_KEY not set - translations will fail without API key');
  }
  
  if (!env.CLAUDE_API_KEY) {
    warnings.push('CLAUDE_API_KEY not set - context generation disabled');
  }
  
  if (!env.TRANSLATION_RATE_LIMITER) {
    warnings.push('Rate limiters not bound - rate limiting disabled');
  }
  
  if (warnings.length > 0) {
    logInfo('Environment warnings', { warnings });
  }
  
  return warnings;
}

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    
    // Validate environment on first request
    validateEnvironment(env);
    
    // Security headers
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'interest-cohort=()',
    };

    // CORS headers
    const origin = request.headers.get('Origin') || '';
    const isValidExtension = origin.startsWith('chrome-extension://') && 
                           origin.length > 19 && 
                           origin.length < 100;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': isValidExtension ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Installation-Id, X-Timestamp, X-Signature',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'false',
    };

    const responseHeaders = { ...securityHeaders, ...corsHeaders };

    try {
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: responseHeaders });
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Route: /config (GET, no auth)
      if (pathname === '/config' && request.method === 'GET') {
        const config = await getSiteConfig(env);
        return new Response(JSON.stringify(config), {
          status: 200,
          headers: { ...responseHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Route: /translate (POST, with auth)
      if (pathname === '/translate' && request.method === 'POST') {
        // Verify authentication
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response(JSON.stringify({ error: authResult.message }), { 
            status: authResult.status, 
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Process combined translation + context request
        const response = await handleTranslateWithContext(request, env, ctx);
        
        // Add performance header
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // Route: /context (POST, with auth)
      if (pathname === '/context' && request.method === 'POST') {
        // Verify authentication
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response(JSON.stringify({ error: authResult.message }), { 
            status: authResult.status, 
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Process context-only request
        const response = await handleContextOnly(request, env, ctx);
        
        // Add performance header
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // Route: /installations/register (POST, no auth)
      if (pathname === '/installations/register' && request.method === 'POST') {
        const response = await handleInstallationRegistration(request, env, ctx);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { 
        status: 404, 
        headers: { ...responseHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logError('Worker error', error, {
        path: request.url,
        method: request.method
      });
      
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * Verify authentication headers
 */
async function verifyAuthentication(request, env) {
  const authHeader = request.headers.get('Authorization');
  const installationId = request.headers.get('X-Installation-Id');
  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  
  // Check required headers
  if (!authHeader || !authHeader.startsWith('Bearer ') || !installationId || !signature || !timestamp) {
    return { status: 401, message: 'Missing authentication headers' };
  }
  
  // Extract token from Bearer header
  const token = authHeader.substring(7);
  
  // TEMPORARY: Accept debug token for testing
  if (token === 'fluent-extension-2024-shared-secret-key' && installationId === 'debug-installation') {
    logInfo('Debug authentication accepted');
    return null; // Success
  }
  
  // Verify timestamp (5-minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
    return { status: 401, message: 'Authentication token expired' };
  }
  
  // Check if installation exists (skip for KV if not available)
  if (env.TRANSLATION_CACHE) {
    const installationData = await env.TRANSLATION_CACHE.get(`installation:${installationId}`);
    if (!installationData) {
      return { status: 401, message: 'Unknown installation' };
    }
  }
  
  // Verify signature using HMAC with the token as key
  const message = `${installationId}-${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  
  if (signature !== expectedSignature) {
    return { status: 401, message: 'Invalid signature' };
  }
  
  // Verify the Bearer token is valid (skip for KV if not available)
  if (env.TRANSLATION_CACHE) {
    const tokenData = await env.TRANSLATION_CACHE.get(`token:${token}`);
    if (!tokenData) {
      return { status: 401, message: 'Invalid token' };
    }
    
    const tokenInfo = JSON.parse(tokenData);
    if (tokenInfo.installationId !== installationId) {
      return { status: 401, message: 'Token mismatch' };
    }
  }
  
  return null; // Authentication successful
}

/**
 * Handle combined translation + context request
 */
async function handleTranslateWithContext(request, env, ctx) {
  const startTime = Date.now();
  
  // Get installation ID for rate limiting
  const installationId = request.headers.get('X-Installation-Id') || 'anonymous';
  
  try {
    // Parse request body
    const body = await request.json();
    const { words, targetLanguage, apiKey, enableContext = true } = body;

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
      /^[\w\s'-]+$/u.test(word)
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

    // Check cache for translations
    const translations = {};
    const wordsToTranslate = [];
    const cacheStats = { hits: 0, misses: 0 };

    for (const word of validWords) {
      const cacheKey = `trans:${targetLanguage}:${word.toLowerCase().trim()}`;
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

    // Rate limit only uncached words
    let rateLimitStatus = { hourlyRemaining: null, dailyRemaining: null };
    
    if (wordsToTranslate.length > 0 && env.TRANSLATION_RATE_LIMITER) {
      const hourlyRateLimit = await env.TRANSLATION_RATE_LIMITER.limit({
        key: `${installationId}:${targetLanguage}`
      });
      
      const dailyRateLimit = await env.DAILY_TRANSLATION_LIMITER.limit({
        key: `${installationId}:${targetLanguage}`
      });
      
      rateLimitStatus = {
        hourlyRemaining: hourlyRateLimit.remaining || 0,
        dailyRemaining: dailyRateLimit.remaining || 0
      };
      
      if (!hourlyRateLimit.success || !dailyRateLimit.success) {
        return new Response(JSON.stringify({
          translations,  // Return cached translations
          error: 'Rate limit exceeded for new translations',
          metadata: {
            cacheHits: cacheStats.hits,
            cacheMisses: cacheStats.misses,
            partial: true,
            limits: rateLimitStatus
          }
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit-Hourly': '100',
            'X-RateLimit-Remaining-Hourly': rateLimitStatus.hourlyRemaining.toString(),
            'X-RateLimit-Limit-Daily': '1000', 
            'X-RateLimit-Remaining-Daily': rateLimitStatus.dailyRemaining.toString(),
            'Retry-After': '3600'
          }
        });
      }
    }

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
        keyLength: translationApiKey ? translationApiKey.length : 0,
        keyPrefix: translationApiKey ? translationApiKey.substring(0, 8) + '...' : 'none',
        azureRegion: env.AZURE_REGION || 'not-set'
      });

      // Call Microsoft Translator API
      const apiTranslations = await callTranslatorAPI(
        wordsToTranslate,
        targetLanguage,
        translationApiKey,
        env
      );

      // Get context for translations if enabled
      let contextData = {};
      if (enableContext && env.CLAUDE_API_KEY && wordsToTranslate.length > 0) {
        // Prepare all translations for context generation
        const allTranslations = {};
        for (const word of wordsToTranslate) {
          allTranslations[word] = apiTranslations[word] || translations[word];
        }
        
        contextData = await getContextForWords(
          wordsToTranslate,
          allTranslations,
          targetLanguage,
          env,
          ctx
        );
      }

      // Update translations with context and cache them
      const cachePromises = [];
      for (const word of wordsToTranslate) {
        const translation = apiTranslations[word] || translations[word];
        const context = contextData[word];
        
        if (translation) {
          const combined = context ? {
            translation: typeof translation === 'string' ? translation : translation.translation || translation,
            pronunciation: context.pronunciation,
            meaning: context.meaning,
            example: context.example
          } : translation;
          
          translations[word] = combined;
          
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
      wordsRequested: validWords.length,
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
        wordsProcessed: validWords.length,
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
      },
    });

  } catch (error) {
    logError('Translation handler error', error, {
      installationId,
      wordCount: words?.length || 0
    });
    return new Response(JSON.stringify({ 
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Call Microsoft Translator API
 */
async function callTranslatorAPI(words, targetLanguage, apiKey, env) {
  const BATCH_SIZE = 25;
  const endpoint = 'https://api.cognitive.microsofttranslator.com/translate';
  const params = new URLSearchParams({
    'api-version': '3.0',
    'from': 'en',
    'to': targetLanguage,
  });

  const translations = {};
  
  // Process in batches if needed
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    
    // Debug log the request
    logInfo('Calling Microsoft Translator API', {
      endpoint: `${endpoint}?${params}`,
      batchSize: batch.length,
      region: env.AZURE_REGION || 'global',
      hasKey: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0
    });
    
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
      const errorText = await response.text();
      logError('Translator API error', new Error(`API returned ${response.status}: ${errorText}`));
      throw new Error(`Translator API error: ${response.status}`);
    }

    const result = await response.json();
    
    for (let j = 0; j < batch.length; j++) {
      if (result[j]?.translations?.[0]?.text) {
        translations[batch[j]] = result[j].translations[0].text;
      }
    }
  }
  
  return translations;
}

/**
 * Get context for words using Claude API
 */
async function getContextForWords(words, translations, targetLanguage, env, ctx) {
  const contexts = {};
  
  logInfo('Getting context for words', {
    wordCount: words.length,
    words: words,
    hasClaudeKey: !!env.CLAUDE_API_KEY
  });
  
  // Create batch prompt for Claude
  const wordsToAnalyze = words.map(word => `"${word}" → "${translations[word] || word}"`).join('\n');
  const prompt = `You are helping English speakers learn ${targetLanguage}. For each English word and its ${targetLanguage} translation below, provide:
1. Easy-to-read pronunciation of the ${targetLanguage} word (like "doo-rah-DEH-roh" for Spanish "duradero")
2. A simple, clear definition in English (one sentence)
3. A practical example sentence IN ${targetLanguage.toUpperCase()} using the translated word

Format your response as a JSON object with the English word as key and an object containing pronunciation (of the ${targetLanguage} word), meaning (in English), and example (in ${targetLanguage}).

Words to analyze:
${wordsToAnalyze}

Example format:
{
  "durable": {
    "pronunciation": "doo-rah-DEH-roh",
    "meaning": "Able to withstand wear, pressure, or damage",
    "example": "Esta mochila es muy duradera y debería durar muchos años."
  }
}

Respond with valid JSON only, no markdown or additional text.`;

  try {
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      logError('Claude API error', new Error(`API returned ${claudeResponse.status}: ${errorText}`));
      return contexts;
    }

    const claudeData = await claudeResponse.json();
    logInfo('Claude API response received', {
      hasContent: !!claudeData.content,
      contentLength: claudeData.content?.[0]?.text?.length
    });
    
    try {
      const content = claudeData.content[0].text;
      const contextData = JSON.parse(content);
      Object.assign(contexts, contextData);
      logInfo('Successfully parsed context data', {
        contextCount: Object.keys(contextData).length
      });
    } catch (error) {
      logError('Failed to parse Claude response', error);
    }
  } catch (error) {
    logError('Context generation error', error);
  }
  
  logInfo('Returning contexts', {
    contextCount: Object.keys(contexts).length
  });
  
  return contexts;
}

/**
 * Cost limiting functions
 */
async function checkCostLimit(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;

  const [hourlyCost, dailyCost] = env.TRANSLATION_CACHE ? await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]) : [null, null];

  const currentHourlyCost = parseFloat(hourlyCost || '0');
  const currentDailyCost = parseFloat(dailyCost || '0');
  const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;

  if (currentHourlyCost + requestCost > COST_LIMITS.HOURLY_COST_USD) {
    return {
      blocked: true,
      message: 'Hourly cost limit exceeded. Please try again later or provide your own API key.',
    };
  }

  if (currentDailyCost + requestCost > COST_LIMITS.DAILY_COST_USD) {
    return {
      blocked: true,
      message: 'Daily cost limit exceeded. Service will resume tomorrow or provide your own API key.',
    };
  }

  return { blocked: false };
}

async function updateCostTracking(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;
  const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;

  const [hourlyCost, dailyCost] = env.TRANSLATION_CACHE ? await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]) : [null, null];

  await Promise.all([
    env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
      hourKey,
      String((parseFloat(hourlyCost || '0') + requestCost)),
      { expirationTtl: 3600 }
    ),
    env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
      dayKey,
      String((parseFloat(dailyCost || '0') + requestCost)),
      { expirationTtl: CACHE_TTL.COST_TRACKING }
    ),
  ]);
}

/**
 * Get site configuration
 */
async function getSiteConfig(env) {
  const defaultConfig = {
    blockedSites: [
      // Email and productivity
      'gmail.com', 'mail.google.com', 'outlook.com', 'mail.yahoo.com',
      
      // Banking and financial
      'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'paypal.com',
      'venmo.com', 'coinbase.com', 'stripe.com',
      
      // Healthcare
      'mychart.com', 'kaiserpermanente.org',
      
      // Government
      'irs.gov', 'dmv.gov', 'uscis.gov',
      
      // Developer tools
      'github.com', 'gitlab.com', 'localhost', '127.0.0.1',
      
      // Password managers
      '1password.com', 'bitwarden.com', 'lastpass.com',
      
      // Work tools
      'slack.com', 'discord.com', 'teams.microsoft.com', 'zoom.us',
      
      // Social media
      'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com'
    ],
    
    optimizedSites: [
      // News sites
      {
        domain: 'bbc.com',
        selector: '.ssrcss-1if1lbl-StyledText p, .ssrcss-18cjaf3-StyledText p',
        wordsPerPage: 10
      },
      {
        domain: 'wikipedia.org',
        selector: '#mw-content-text p',
        wordsPerPage: 12,
        skipSelectors: ['.mw-editsection', '.reference', '.citation']
      },
      {
        domain: 'reddit.com',
        selector: '[data-testid="comment"] p, .Post h3',
        wordsPerPage: 6,
        useMutationObserver: true
      }
    ],
    
    globalSkipSelectors: [
      'script', 'style', 'noscript', 'iframe', 'pre', 'code',
      'input', 'textarea', 'button', '[contenteditable="true"]'
    ],
    
    version: '1.0.0',
    lastUpdated: new Date().toISOString()
  };

  // Try to get custom configuration from KV if available
  try {
    const customConfig = env.TRANSLATION_CACHE ? await env.TRANSLATION_CACHE.get('site-config', { type: 'json' }) : null;
    if (customConfig) {
      return {
        ...defaultConfig,
        ...customConfig,
        blockedSites: [...new Set([...defaultConfig.blockedSites, ...(customConfig.blockedSites || [])])],
        optimizedSites: [...defaultConfig.optimizedSites, ...(customConfig.optimizedSites || [])]
      };
    }
  } catch (error) {
    logError('Failed to load custom site config', error);
  }

  return defaultConfig;
}

/**
 * Handle installation registration
 */
async function handleInstallationRegistration(request, env, ctx) {
  try {
    const body = await request.json();
    const { installationId, extensionVersion, timestamp, platform } = body;
    
    if (!installationId || typeof installationId !== 'string' || installationId.length < 10) {
      return new Response(JSON.stringify({ error: 'Invalid installation ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Generate unique API token for this installation
    const apiToken = await generateInstallationToken(installationId, env);
    const refreshToken = await generateRefreshToken(installationId, env);
    
    // Store installation info
    const installationData = {
      installationId,
      extensionVersion,
      platform,
      registeredAt: timestamp || Date.now(),
      lastSeen: Date.now(),
      tokenVersion: 1
    };
    
    env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
      `installation:${installationId}`,
      JSON.stringify(installationData),
      { expirationTtl: 90 * 24 * 60 * 60 } // 90 days
    );
    
    logInfo('New installation registered', {
      installationId,
      extensionVersion,
      platform
    });
    
    return new Response(JSON.stringify({
      apiToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    logError('Installation registration error', error);
    return new Response(JSON.stringify({ 
      error: 'Registration failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function generateInstallationToken(installationId, env) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
    `token:${token}`,
    JSON.stringify({
      installationId,
      createdAt: Date.now(),
      type: 'api'
    }),
    { expirationTtl: 30 * 24 * 60 * 60 }
  );
  
  return token;
}

async function generateRefreshToken(installationId, env) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
    `refresh:${token}`,
    JSON.stringify({
      installationId,
      createdAt: Date.now(),
      type: 'refresh'
    }),
    { expirationTtl: 90 * 24 * 60 * 60 }
  );
  
  return token;
}

/**
 * Handle context-only requests
 */
async function handleContextOnly(request, env, ctx) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { word, translation, targetLanguage, sentence } = body;
    
    // Extract installation ID from auth headers
    const installationId = request.headers.get('X-Installation-Id');
    
    // Validate inputs
    if (!word || !translation || !targetLanguage) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: word, translation, targetLanguage' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check context cache first
    const cacheKey = `context:${targetLanguage}:${word.toLowerCase().trim()}`;
    const cached = env.TRANSLATION_CACHE ? await env.TRANSLATION_CACHE.get(cacheKey) : null;
    
    if (cached) {
      logInfo('Context cache hit', { word, targetLanguage });
      return new Response(JSON.stringify({ 
        context: JSON.parse(cached),
        cached: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Apply rate limiting for AI context generation
    if (env.AI_RATE_LIMITER) {
      const aiRateLimit = await env.AI_RATE_LIMITER.limit({
        key: `${installationId}:context`
      });
      
      if (!aiRateLimit.success) {
        return new Response(JSON.stringify({
          error: 'AI context rate limit exceeded',
          context: null
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-AI-RateLimit-Limit-Hourly': '100',
            'X-AI-RateLimit-Remaining-Hourly': (aiRateLimit.remaining || 0).toString(),
            'Retry-After': '3600'
          }
        });
      }
    }
    
    // Generate context using Claude
    if (!env.CLAUDE_API_KEY) {
      return new Response(JSON.stringify({ 
        context: null,
        error: 'Context generation not available'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const context = await generateContextForWord(
      word,
      translation,
      targetLanguage,
      sentence,
      env
    );
    
    // Cache the context
    if (context) {
      ctx.waitUntil(
        env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
          cacheKey, 
          JSON.stringify(context), 
          { expirationTtl: CACHE_TTL.TRANSLATION }
        )
      );
    }
    
    logInfo('Context generated', {
      installationId,
      word,
      targetLanguage,
      processingTimeMs: Date.now() - startTime
    });
    
    return new Response(JSON.stringify({ 
      context: context || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    logError('Context generation error', error);
    return new Response(JSON.stringify({ 
      error: 'Context generation failed',
      context: null
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Generate context for a single word
 */
async function generateContextForWord(word, translation, targetLanguage, sentence, env) {
  const languageNames = {
    es: 'Spanish',
    fr: 'French', 
    de: 'German'
  };
  
  const prompt = `You are a language learning assistant. Create a practical example for learning this word.

Word: "${word}" (English)
Translation: "${translation}" (${languageNames[targetLanguage] || targetLanguage})
${sentence ? `Context where the word was found: "${sentence}"` : ''}

Provide a JSON response with:
1. pronunciation: How to pronounce the ${languageNames[targetLanguage] || targetLanguage} word (e.g., "OH-lah" for "hola")
2. englishExample: A simple, practical sentence in English using "${word}" (8-12 words, everyday context)
3. gender: For nouns only - the grammatical gender and article:
   - German: "der, masculine" / "die, feminine" / "das, neuter"
   - French: "le, masculine" / "la, feminine"
   - Spanish: "el, masculine" / "la, feminine"
   - For non-nouns or words without gender, use null

Important: The English example should be natural and use common vocabulary that beginners would understand.

Response format:
{
  "pronunciation": "...",
  "englishExample": "...",
  "gender": "..." or null
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    
    // Parse the JSON response
    const context = JSON.parse(content);
    
    // Now translate the English example to the target language
    if (context.englishExample && env.MICROSOFT_TRANSLATOR_KEY) {
      try {
        const translationResult = await callTranslatorAPI(
          [context.englishExample], 
          targetLanguage, 
          env.MICROSOFT_TRANSLATOR_KEY, 
          env
        );
        
        context.translatedExample = translationResult[context.englishExample] || '';
      } catch (error) {
        logError('Failed to translate example sentence', error);
        context.translatedExample = '';
      }
    }
    
    return context;
  } catch (error) {
    logError('Failed to generate context', error);
    return null;
  }
}