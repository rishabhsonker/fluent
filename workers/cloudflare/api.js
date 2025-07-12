/**
 * External API integration module for Cloudflare Worker
 * Handles Microsoft Translator and Claude AI API calls
 */

import { logInfo, logError } from './logger.js';
import { validateTranslation, validateContext } from './validator.js';

/**
 * Call Microsoft Translator API
 */
export async function callTranslatorAPI(words, targetLanguage, apiKey, env) {
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
      batchSize: batch.length,
      region: env.AZURE_REGION || 'global',
      hasKey: !!apiKey
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
        const rawTranslation = result[j].translations[0].text;
        const validatedTranslation = validateTranslation(rawTranslation);
        
        if (validatedTranslation) {
          translations[batch[j]] = validatedTranslation;
        } else {
          logError('Invalid translation received', new Error('Translation validation failed'), {
            word: batch[j],
            rawTranslation
          });
          // Fall back to original word
          translations[batch[j]] = batch[j];
        }
      }
    }
  }
  
  return translations;
}

/**
 * Generate context for a single word using Claude AI
 */
export async function generateContextForWord(word, translation, targetLanguage, sentence, env) {
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

/**
 * Get context for multiple words using Claude API with variations
 */
export async function getContextForWords(words, translations, targetLanguage, env, ctx, installationId = 'anonymous') {
  const contexts = {};
  
  logInfo('Getting context for words', {
    wordCount: words.length,
    hasClaudeKey: !!env.CLAUDE_API_KEY
  });
  
  // Skip if no Claude key
  if (!env.CLAUDE_API_KEY) {
    logInfo('No Claude API key, returning basic context');
    return contexts;
  }
  
  // Create batch prompt for Claude to generate multiple variations
  const wordsToAnalyze = words.map(word => `"${word}" → "${translations[word] || word}"`).join('\n');
  const prompt = `You are helping English speakers learn ${targetLanguage}. For each English word and its ${targetLanguage} translation below, provide 3 DIFFERENT variations of:
1. Easy-to-read pronunciation of the ${targetLanguage} word (like "doo-rah-DEH-roh" for Spanish "duradero")
2. A simple, clear definition in English (vary the phrasing for each variation)
3. A practical example sentence IN ${targetLanguage.toUpperCase()} using the translated word (different contexts)

Format your response as a JSON object with the English word as key and an array of 3 variation objects, each containing pronunciation, meaning, and example.

Words to analyze:
${wordsToAnalyze}

Example format:
{
  "durable": [
    {
      "pronunciation": "doo-rah-DEH-roh",
      "meaning": "Able to withstand wear, pressure, or damage",
      "example": "Esta mochila es muy duradera y debería durar muchos años."
    },
    {
      "pronunciation": "doo-rah-DEH-roh",
      "meaning": "Long-lasting and resistant to breaking",
      "example": "Necesito zapatos duraderos para caminar mucho."
    },
    {
      "pronunciation": "doo-rah-DEH-roh",
      "meaning": "Something that remains in good condition over time",
      "example": "El material duradero protege contra la lluvia."
    }
  ]
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
      
      // Process the variations for each word
      for (const [word, variations] of Object.entries(contextData)) {
        if (Array.isArray(variations) && variations.length > 0) {
          // Validate each variation
          const validVariations = variations.filter(variation => {
            if (!variation || typeof variation !== 'object') return false;
            
            // Validate each field
            const validPronunciation = validateContext(variation.pronunciation);
            const validMeaning = validateContext(variation.meaning);
            const validExample = validateContext(variation.example);
            
            return validPronunciation && validMeaning && validExample;
          }).map(variation => ({
            pronunciation: validateContext(variation.pronunciation),
            meaning: validateContext(variation.meaning),
            example: validateContext(variation.example)
          }));
          
          if (validVariations.length > 0) {
            // Store all valid variations in KV for future rotation
            const { storeContextVariations } = await import('./cache.js');
            await storeContextVariations(env, targetLanguage, word, translations[word], validVariations);
            
            // Return the first variation for immediate use
            contexts[word] = validVariations[0];
          }
        } else if (variations && typeof variations === 'object') {
          // Fallback for single context format - validate fields
          const validPronunciation = validateContext(variations.pronunciation);
          const validMeaning = validateContext(variations.meaning);
          const validExample = validateContext(variations.example);
          
          if (validPronunciation && validMeaning && validExample) {
            contexts[word] = {
              pronunciation: validPronunciation,
              meaning: validMeaning,
              example: validExample
            };
          }
        }
      }
      
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