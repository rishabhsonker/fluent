// Cloudflare Worker for Fluent Translation API
// This worker proxies requests to Microsoft Translator API

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
})

async function handleRequest(request, event) {
  const env = {
    TRANSLATOR_API_KEY: TRANSLATOR_API_KEY,
    TRANSLATOR_REGION: TRANSLATOR_REGION || 'global',
    CLAUDE_API_KEY: CLAUDE_API_KEY
  };
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    // Parse request body
    const body = await request.json();
    
    // Check if this is a context explanation request
    if (body.type === 'context') {
      return await handleContextRequest(body, env, corsHeaders);
    }
    
    // Otherwise it's a translation request
    const { text, from, to } = body;

    // Validate input
    if (!text || !Array.isArray(text) || text.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid text input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!to || typeof to !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid target language' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting check (optional)
    const clientIP = request.headers.get('CF-Connecting-IP');
    // You can implement rate limiting here using Cloudflare KV

    // Call Microsoft Translator API
    const endpoint = 'https://api.cognitive.microsofttranslator.com/translate';
    const params = new URLSearchParams({
      'api-version': '3.0',
      'from': from || 'en',
      'to': to
    });

    const response = await fetch(`${endpoint}?${params}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': env.TRANSLATOR_API_KEY,
        'Ocp-Apim-Subscription-Region': env.TRANSLATOR_REGION || 'global',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(text.map(t => ({ text: t })))
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const translations = await response.json();
    
    // Transform response to our format
    const result = {};
    text.forEach((word, index) => {
      if (translations[index] && translations[index].translations[0]) {
        result[word] = translations[index].translations[0].text;
      }
    });

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Translation error:', error);
    return new Response(JSON.stringify({ error: 'Translation failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle Claude API requests for context explanations
async function handleContextRequest(body, env, corsHeaders) {
  const { prompt, word, translation, language } = body;
  
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check if Claude API key is configured
  if (!env.CLAUDE_API_KEY) {
    // Return a helpful mock response if no API key
    return new Response(JSON.stringify({
      explanation: {
        explanation: `"${word}" translates to "${translation}" because it's the most common and natural translation in this context.`,
        example: `This word is commonly used in everyday ${language} conversation.`,
        tip: 'Practice using this word in different contexts to master it.'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Call Claude API
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
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content[0].text;
    
    // Try to parse as JSON, fallback to text
    let explanation;
    try {
      explanation = JSON.parse(content);
    } catch {
      explanation = { explanation: content };
    }

    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Claude API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Context generation failed',
      explanation: {
        explanation: 'Unable to generate detailed explanation at this time.',
        tip: 'The translation provided is accurate for this context.'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}