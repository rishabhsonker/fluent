/**
 * Context generation module for Cloudflare Worker
 * Generates basic context without API calls and handles context requests
 */

import { logInfo, logError } from './logger.js';
import { generateContextForWord } from './api.js';
import { storeContextVariations } from './cache.js';
import { safe } from './utils.js';

/**
 * Generate multiple basic context variations without API call
 */
export function generateBasicContextVariations(word, translation, targetLanguage, count = 3) {
  const variations = [];
  
  const pronunciationGuides = {
    es: {
      // Spanish pronunciation patterns
      'a': 'ah', 'e': 'eh', 'i': 'ee', 'o': 'oh', 'u': 'oo',
      'ñ': 'ny', 'll': 'y', 'rr': 'rr', 'j': 'h', 'g': 'g/h',
      'que': 'keh', 'qui': 'kee', 'gue': 'geh', 'gui': 'gee'
    },
    fr: {
      // French pronunciation patterns
      'ou': 'oo', 'eu': 'uh', 'oi': 'wah', 'ai': 'eh', 'au': 'oh',
      'ch': 'sh', 'r': 'r', 'u': 'ew', 'é': 'ay', 'è': 'eh'
    },
    de: {
      // German pronunciation patterns
      'ei': 'eye', 'ie': 'ee', 'eu': 'oy', 'äu': 'oy', 'ö': 'er',
      'ü': 'ew', 'ä': 'eh', 'sch': 'sh', 'ch': 'kh', 'w': 'v'
    }
  };
  
  const exampleSets = {
    es: [
      // Set 1 - Present tense
      ['Me gusta {word}.', 'Veo {word}.', 'Busco {word}.', 'Encuentro {word}.', 'Uso {word}.'],
      // Set 2 - Need/want
      ['Necesito {word}.', 'Quiero {word}.', 'Prefiero {word}.', 'Deseo {word}.', 'Compro {word}.'],
      // Set 3 - Descriptive
      ['Es {word}.', 'Hay {word}.', 'Tengo {word}.', 'Existe {word}.', 'Conozco {word}.']
    ],
    fr: [
      // Set 1 - Present tense
      ["J'aime {word}.", "Je vois {word}.", "Je cherche {word}.", "Je trouve {word}.", "J'utilise {word}."],
      // Set 2 - Need/want
      ["J'ai besoin de {word}.", "Je veux {word}.", "Je préfère {word}.", "Je souhaite {word}.", "J'achète {word}."],
      // Set 3 - Descriptive
      ["C'est {word}.", "Il y a {word}.", "J'ai {word}.", "Voici {word}.", "Je connais {word}."]
    ],
    de: [
      // Set 1 - Present tense
      ['Ich mag {word}.', 'Ich sehe {word}.', 'Ich suche {word}.', 'Ich finde {word}.', 'Ich benutze {word}.'],
      // Set 2 - Need/want
      ['Ich brauche {word}.', 'Ich will {word}.', 'Ich möchte {word}.', 'Ich wünsche {word}.', 'Ich kaufe {word}.'],
      // Set 3 - Descriptive
      ['Das ist {word}.', 'Es gibt {word}.', 'Ich habe {word}.', 'Hier ist {word}.', 'Ich kenne {word}.']
    ]
  };
  
  const meanings = {
    es: [
      `The Spanish word for "${word}"`,
      `"${word}" in Spanish`,
      `Spanish translation of "${word}"`
    ],
    fr: [
      `The French word for "${word}"`,
      `"${word}" in French`,
      `French translation of "${word}"`
    ],
    de: [
      `The German word for "${word}"`,
      `"${word}" in German`,
      `German translation of "${word}"`
    ]
  };
  
  // Generate basic pronunciation
  let pronunciation = translation;
  const patterns = pronunciationGuides[targetLanguage] || {};
  for (const [pattern, replacement] of Object.entries(patterns)) {
    pronunciation = pronunciation.replace(new RegExp(pattern, 'gi'), replacement);
  }
  
  // Add stress marks for readability
  if (pronunciation.length > 2) {
    const syllables = pronunciation.match(/.{1,3}/g) || [];
    pronunciation = syllables.join('-').toUpperCase();
  }
  
  // Generate variations
  const sets = exampleSets[targetLanguage] || exampleSets.es;
  const meaningOptions = meanings[targetLanguage] || meanings.es;
  
  for (let i = 0; i < count; i++) {
    const setIndex = i % sets.length;
    const exampleSet = sets[setIndex];
    const randomExample = exampleSet[Math.floor(Math.random() * exampleSet.length)];
    const example = randomExample.replace('{word}', translation);
    const meaning = meaningOptions[i % meaningOptions.length];
    
    variations.push({
      pronunciation: pronunciation,
      meaning: meaning,
      example: example
    });
  }
  
  return variations;
}

/**
 * Generate basic context for multiple words (backwards compatibility)
 */
export function generateBasicContext(words, translations, targetLanguage) {
  const contexts = {};
  
  for (const word of words) {
    const translation = translations[word] || word;
    const variations = generateBasicContextVariations(word, translation, targetLanguage, 1);
    contexts[word] = variations[0];
  }
  
  return contexts;
}

/**
 * Handle context-only requests
 */
export async function handleContextOnly(request, env, ctx) {
  const startTime = Date.now();
  
  return await safe(async () => {
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
    
    // Check context cache in D1 first
    if (env.DB) {
      const cacheResponse = await safe(async () => {
        const cached = await env.DB.prepare(`
          SELECT translation, pronunciation, context, etymology 
          FROM translations 
          WHERE word = ? AND language = ?
        `).bind(word.toLowerCase().trim(), targetLanguage).first();
        
        if (cached && cached.context) {
          // Parse and return a random context from the array
          const contexts = JSON.parse(cached.context);
          if (Array.isArray(contexts) && contexts.length > 0) {
            const selectedContext = contexts[Math.floor(Math.random() * contexts.length)];
            logInfo('Context cache hit', { word, targetLanguage });
            return new Response(JSON.stringify({ 
              context: {
                pronunciation: cached.pronunciation || selectedContext.pronunciation,
                meaning: selectedContext.meaning,
                example: selectedContext.example
              },
              cached: true
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
        return null;
      }, 'Error checking context cache');
      
      if (cacheResponse) {
        return cacheResponse;
      }
    }
    
    // Apply rate limiting for AI context generation
    const { applyAIRateLimit } = await import('./limiter.js');
    const rateLimit = await applyAIRateLimit(env, installationId);
    
    if (rateLimit.limited) {
      return new Response(JSON.stringify(rateLimit.response), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...rateLimit.headers
        }
      });
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
    
    // Cache the context in D1
    if (context && env.DB) {
      const contexts = [{
        pronunciation: context.pronunciation,
        meaning: context.meaning,
        example: context.example
      }];
      
      ctx.waitUntil(
        storeContextVariations(env, targetLanguage, word, translation, contexts)
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
  }, 'Context generation error', new Response(JSON.stringify({ 
    error: 'Context generation failed',
    context: null
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  }));
}