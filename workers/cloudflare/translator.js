// Cloudflare Worker - Translation API Proxy
// Handles caching, rate limiting, and API key protection

export default {
  async fetch(request, env, ctx) {
    // CORS headers for extension
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Parse request
      const url = new URL(request.url);
      const { pathname } = url;

      // Route handling
      if (pathname === '/translate' && request.method === 'POST') {
        return handleTranslate(request, env, ctx, corsHeaders);
      }

      if (pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleTranslate(request, env, ctx, corsHeaders) {
  try {
    const body = await request.json();
    const { words, targetLanguage, apiKey } = body;

    // Validate input
    if (!words || !Array.isArray(words) || words.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid words array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!targetLanguage || !['es', 'fr', 'de'].includes(targetLanguage)) {
      return new Response(JSON.stringify({ error: 'Invalid target language' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting by IP
    const clientIP = request.headers.get('CF-Connecting-IP');
    const rateLimitKey = `rate_limit:${clientIP}:${new Date().toISOString().slice(0, 10)}`;
    const dailyCount = await env.TRANSLATION_CACHE.get(rateLimitKey);
    
    if (!apiKey && dailyCount && parseInt(dailyCount) > 50) {
      return new Response(JSON.stringify({ 
        error: 'Daily limit exceeded. Please provide your own API key.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first
    const translations = {};
    const wordsToTranslate = [];
    
    for (const word of words) {
      const cacheKey = `translation:${targetLanguage}:${word.toLowerCase()}`;
      const cached = await env.TRANSLATION_CACHE.get(cacheKey);
      
      if (cached) {
        translations[word] = cached;
      } else {
        wordsToTranslate.push(word);
      }
    }

    // Translate missing words
    if (wordsToTranslate.length > 0) {
      // Use provided API key or default
      const translationApiKey = apiKey || env.MICROSOFT_TRANSLATOR_KEY;
      
      if (!translationApiKey) {
        // Return mock translations in development
        const mockTranslations = getMockTranslations(wordsToTranslate, targetLanguage);
        Object.assign(translations, mockTranslations);
      } else {
        // Call Microsoft Translator API
        const apiTranslations = await callTranslatorAPI(
          wordsToTranslate, 
          targetLanguage, 
          translationApiKey
        );
        
        // Cache translations
        for (const [word, translation] of Object.entries(apiTranslations)) {
          const cacheKey = `translation:${targetLanguage}:${word.toLowerCase()}`;
          await env.TRANSLATION_CACHE.put(cacheKey, translation, {
            expirationTtl: 30 * 24 * 60 * 60, // 30 days
          });
          translations[word] = translation;
        }
      }
      
      // Update rate limit counter
      if (!apiKey) {
        const currentCount = parseInt(dailyCount || '0');
        await env.TRANSLATION_CACHE.put(rateLimitKey, String(currentCount + wordsToTranslate.length), {
          expirationTtl: 24 * 60 * 60, // 24 hours
        });
      }
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Translation error:', error);
    return new Response(JSON.stringify({ error: 'Translation failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function callTranslatorAPI(words, targetLanguage, apiKey) {
  // Microsoft Translator API call
  const endpoint = 'https://api.cognitive.microsofttranslator.com/translate';
  const params = new URLSearchParams({
    'api-version': '3.0',
    'from': 'en',
    'to': targetLanguage,
  });

  const response = await fetch(`${endpoint}?${params}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(words.map(word => ({ text: word }))),
  });

  if (!response.ok) {
    throw new Error(`Translator API error: ${response.status}`);
  }

  const result = await response.json();
  const translations = {};
  
  for (let i = 0; i < words.length; i++) {
    if (result[i] && result[i].translations && result[i].translations[0]) {
      translations[words[i]] = result[i].translations[0].text;
    }
  }
  
  return translations;
}

function getMockTranslations(words, targetLanguage) {
  // Mock translations for development
  const mocks = {
    es: {
      'house': 'casa',
      'water': 'agua',
      'time': 'tiempo',
      'work': 'trabajo',
      'people': 'gente',
      'world': 'mundo',
    },
    fr: {
      'house': 'maison',
      'water': 'eau',
      'time': 'temps',
      'work': 'travail',
      'people': 'gens',
      'world': 'monde',
    },
    de: {
      'house': 'Haus',
      'water': 'Wasser',
      'time': 'Zeit',
      'work': 'Arbeit',
      'people': 'Leute',
      'world': 'Welt',
    },
  };

  const translations = {};
  const langMocks = mocks[targetLanguage] || mocks.es;
  
  for (const word of words) {
    translations[word] = langMocks[word.toLowerCase()] || word;
  }
  
  return translations;
}