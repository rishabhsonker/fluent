// AI Context Helper - Provides intelligent explanations for translations
// Uses Claude Haiku for cost-efficient context generation
'use strict';

import { storage } from './storage.js';

export class ContextHelper {
  constructor() {
    this.cache = new Map();
    this.dailyCount = 0;
    this.dailyLimit = 3; // Free explanations per day
    this.lastResetDate = new Date().toDateString();
    
    // Pre-generated explanations for common confusions
    this.commonExplanations = {
      'es:time:tiempo': {
        explanation: 'In Spanish, "tiempo" means both "time" and "weather". The context determines which meaning applies.',
        example: '¿Qué tiempo hace? (What\'s the weather like?)',
        tip: 'Think of "tiempo" as the general conditions - temporal or atmospheric!'
      },
      'es:people:gente': {
        explanation: '"Gente" is always singular in Spanish, even though it refers to multiple people.',
        example: 'La gente está feliz (The people are happy)',
        tip: 'Remember: "gente" = singular, "personas" = plural'
      },
      'fr:time:temps': {
        explanation: 'Like Spanish "tiempo", French "temps" means both "time" and "weather".',
        example: 'Quel temps fait-il? (What\'s the weather like?)',
        tip: 'Context is key - "le temps" usually means time, "il fait beau temps" means nice weather'
      },
      'de:girl:Mädchen': {
        explanation: '"Mädchen" (girl) is neuter in German, not feminine, because of the diminutive suffix "-chen".',
        example: 'Das Mädchen ist klug (The girl is smart)',
        tip: 'All German words ending in "-chen" or "-lein" are neuter, regardless of natural gender'
      }
    };
    
    this.initializeCache();
  }
  
  async initializeCache() {
    // Load cached explanations
    const cached = await storage.get('contextExplanations');
    if (cached && cached.explanations) {
      for (const [key, value] of Object.entries(cached.explanations)) {
        this.cache.set(key, value);
      }
    }
    
    // Load daily count
    const usage = await storage.get('contextUsage');
    if (usage) {
      if (usage.date === this.lastResetDate) {
        this.dailyCount = usage.count || 0;
      } else {
        // Reset for new day
        this.dailyCount = 0;
        await this.updateUsage();
      }
    }
  }
  
  async getExplanation(word, translation, language, sentence) {
    // Check daily limit
    if (this.dailyCount >= this.dailyLimit) {
      const hasApiKey = await this.checkForApiKey();
      if (!hasApiKey) {
        return {
          limited: true,
          explanation: `You've used all ${this.dailyLimit} free explanations today. Add your own API key in settings for unlimited access.`
        };
      }
    }
    
    // Create cache key
    const cacheKey = `${language}:${word.toLowerCase()}:${translation.toLowerCase()}`;
    
    // Check pre-generated explanations
    if (this.commonExplanations[cacheKey]) {
      return this.commonExplanations[cacheKey];
    }
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Generate new explanation
    try {
      const explanation = await this.generateExplanation(word, translation, language, sentence);
      
      // Cache the explanation
      this.cache.set(cacheKey, explanation);
      await this.saveCache();
      
      // Update usage count
      this.dailyCount++;
      await this.updateUsage();
      
      return explanation;
    } catch (error) {
      console.error('Error generating explanation:', error);
      return {
        error: true,
        explanation: 'Unable to generate explanation at this time.'
      };
    }
  }
  
  async generateExplanation(word, translation, language, sentence) {
    // For MVP, use predefined explanations or call Claude API
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_CONTEXT',
      prompt: this.buildPrompt(word, translation, language, sentence)
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return this.parseExplanation(response.text);
  }
  
  buildPrompt(word, translation, language, sentence) {
    const langName = {
      es: 'Spanish',
      fr: 'French', 
      de: 'German'
    }[language] || 'target language';
    
    return `
Explain why "${word}" translates to "${translation}" in ${langName}.
Context: "${sentence}"

Include:
1. Why this specific translation (not alternatives)
2. Common usage example in ${langName}
3. Memory tip or cultural note if relevant

Keep it under 3 sentences, conversational and helpful.
Format as JSON: { "explanation": "...", "example": "...", "tip": "..." }
    `.trim();
  }
  
  parseExplanation(text) {
    try {
      // Attempt to parse as JSON
      const parsed = JSON.parse(text);
      return {
        explanation: parsed.explanation || text,
        example: parsed.example,
        tip: parsed.tip
      };
    } catch {
      // Fallback to plain text
      return {
        explanation: text,
        example: null,
        tip: null
      };
    }
  }
  
  async checkForApiKey() {
    const result = await chrome.storage.sync.get('userApiKey');
    return !!result.userApiKey;
  }
  
  async updateUsage() {
    await storage.set('contextUsage', {
      date: this.lastResetDate,
      count: this.dailyCount
    });
  }
  
  async saveCache() {
    // Limit cache size
    if (this.cache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      this.cache = new Map(entries.slice(-800));
    }
    
    // Save to storage
    const explanations = Object.fromEntries(this.cache);
    await storage.set('contextExplanations', {
      explanations,
      updated: Date.now()
    });
  }
  
  // Get statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      dailyUsage: this.dailyCount,
      dailyLimit: this.dailyLimit
    };
  }
}

// Export singleton
export const contextHelper = new ContextHelper();