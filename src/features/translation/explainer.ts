// AI Context Helper - Provides intelligent explanations for translations
// Uses Claude Haiku for cost-efficient context generation
'use strict';

import { storage } from '../settings/storage';
import { safe } from '../../shared/utils/helpers';
import { LanguageCode, ContextExplanation, MessageRequest, MessageResponse } from '../../shared/types';
import { CACHE_LIMITS, THRESHOLD, NUMERIC } from '../../shared/constants';

interface CommonExplanations {
  [key: string]: ContextExplanation;
}

interface ContextUsage {
  date: string;
  count: number;
}

interface ContextCache {
  explanations: { [key: string]: ContextExplanation };
  updated: number;
}

interface ContextStats {
  cacheSize: number;
  dailyUsage: number;
  dailyLimit: number;
}

interface LimitedExplanation extends ContextExplanation {
  limited?: boolean;
  error?: boolean;
}

interface GenerateContextMessage extends MessageRequest {
  type: 'GENERATE_CONTEXT';
  prompt: string;
}

interface GenerateContextResponse extends MessageResponse {
  text?: string;
}

export class ContextHelper {
  private cache: Map<string, ContextExplanation>;
  private dailyCount: number;
  private readonly dailyLimit: number;
  private lastResetDate: string;
  private readonly commonExplanations: CommonExplanations;

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
  
  private async initializeCache(): Promise<void> {
    // Load cached explanations
    const cached = await storage.get('contextExplanations') as ContextCache | null;
    if (cached && cached.explanations) {
      for (const [key, value] of Object.entries(cached.explanations)) {
        this.cache.set(key, value);
      }
    }
    
    // Load daily count
    const usage = await storage.get('contextUsage') as ContextUsage | null;
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
  
  async getExplanation(
    word: string, 
    translation: string, 
    language: LanguageCode | string, 
    sentence: string
  ): Promise<LimitedExplanation> {
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
      return this.cache.get(cacheKey) as ContextExplanation;
    }
    
    // Generate new explanation
    return safe(
      async () => {
        const explanation = await this.generateExplanation(word, translation, language, sentence);
        
        // Cache the explanation
        this.cache.set(cacheKey, explanation);
        await this.saveCache();
        
        // Update usage count
        this.dailyCount++;
        await this.updateUsage();
        
        return explanation;
      },
      'explainer.getExplanation',
      {
        error: true,
        explanation: 'Unable to generate explanation at this time.'
      } as LimitedExplanation
    );
  }
  
  private async generateExplanation(
    word: string, 
    translation: string, 
    language: LanguageCode | string, 
    sentence: string
  ): Promise<ContextExplanation> {
    // For MVP, use predefined explanations or call Claude API
    const message: GenerateContextMessage = {
      type: 'GENERATE_CONTEXT',
      prompt: this.buildPrompt(word, translation, language, sentence)
    };

    const response = await chrome.runtime.sendMessage<
      GenerateContextMessage,
      GenerateContextResponse
    >(message);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return this.parseExplanation(response.text || '');
  }
  
  private buildPrompt(
    word: string, 
    translation: string, 
    language: LanguageCode | string, 
    sentence: string
  ): string {
    const langName: Record<string, string> = {
      es: 'Spanish',
      spanish: 'Spanish',
      fr: 'French',
      french: 'French',
      de: 'German',
      german: 'German'
    };
    
    const targetLang = langName[language] || 'target language';
    
    return `
Explain why "${word}" translates to "${translation}" in ${targetLang}.
Context: "${sentence}"

Include:
1. Why this specific translation (not alternatives)
2. Common usage example in ${targetLang}
3. Memory tip or cultural note if relevant

Keep it under 3 sentences, conversational and helpful.
Format as JSON: { "explanation": "...", "example": "...", "tip": "..." }
    `.trim();
  }
  
  private parseExplanation(text: string): ContextExplanation {
    try {
      // Attempt to parse as JSON
      const parsed = JSON.parse(text) as Partial<ContextExplanation>;
      return {
        explanation: parsed.explanation || text,
        example: parsed.example,
        tip: parsed.tip,
        alternatives: parsed.alternatives
      };
    } catch {
      // Fallback to plain text
      return {
        explanation: text,
        example: undefined,
        tip: undefined
      };
    }
  }
  
  private async checkForApiKey(): Promise<boolean> {
    const result = await chrome.storage.sync.get('userApiKey');
    return !!result.userApiKey;
  }
  
  private async updateUsage(): Promise<void> {
    await storage.set('contextUsage', {
      date: this.lastResetDate,
      count: this.dailyCount
    });
  }
  
  private async saveCache(): Promise<void> {
    // Limit cache size
    if (this.cache.size > CACHE_LIMITS.MEMORY_CACHE_MAX_ENTRIES) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      this.cache = new Map(entries.slice(-(CACHE_LIMITS.MEMORY_CACHE_MAX_ENTRIES * THRESHOLD.WARNING_THRESHOLD / NUMERIC.PERCENTAGE_MAX)));
    }
    
    // Save to storage
    const explanations = Object.fromEntries(this.cache);
    await storage.set('contextExplanations', {
      explanations,
      updated: Date.now()
    });
  }
  
  // Get statistics
  getStats(): ContextStats {
    return {
      cacheSize: this.cache.size,
      dailyUsage: this.dailyCount,
      dailyLimit: this.dailyLimit
    };
  }
}

// Export singleton
export const contextHelper = new ContextHelper();