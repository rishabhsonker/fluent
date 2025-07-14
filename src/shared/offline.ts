/**
 * Offline Manager - Preloaded translations for offline support
 */

import { logger } from './logger';
// storage import removed - not used
import { safe, chromeCall } from './utils/helpers';
import type { Translation, LanguageCode } from './types';
import { CACHE_LIMITS, TIME, ARRAY } from './constants';

interface OfflineData {
  translations: Record<LanguageCode, Translation>;
  wordLists: Record<LanguageCode, string[]>;
  lastUpdated: number;
  version: string;
}

interface WordFrequency {
  word: string;
  frequency: number;
  rank: number;
}

export class OfflineManager {
  private static instance: OfflineManager;
  private readonly STORAGE_KEY = 'fluent_offline_data';
  private readonly MAX_OFFLINE_WORDS = CACHE_LIMITS.STORAGE_CACHE_MAX_ENTRIES;
  private readonly UPDATE_INTERVAL = TIME.DAYS_PER_WEEK * TIME.MS_PER_DAY; // 7 days
  private offlineData: OfflineData | null = null;
  private isLoaded: boolean = false;

  private constructor() {}

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  /**
   * Initialize offline support
   */
  async initialize(): Promise<void> {
    await safe(
      async () => {
        // Load existing offline data
        await this.loadOfflineData();

        // Check if update is needed
        if (this.shouldUpdate()) {
          // Update in background
          this.updateOfflineData().catch(error => {
            logger.error('[Offline] Update failed:', error);
          });
        }

        logger.info('Offline manager initialized');
      },
      'offline.initialize'
    );
  }

  /**
   * Load offline data from storage
   */
  private async loadOfflineData(): Promise<void> {
    await safe(
      async () => {
        const stored = await chromeCall(
          () => chrome.storage.local.get(this.STORAGE_KEY),
          'offline.loadOfflineData',
          {}
        );
        if (stored[this.STORAGE_KEY]) {
          this.offlineData = stored[this.STORAGE_KEY];
          this.isLoaded = true;
          logger.info(`Loaded offline data: ${this.getWordCount()} words`);
        }
      },
      'offline.loadOfflineData'
    );
  }

  /**
   * Check if offline data needs update
   */
  private shouldUpdate(): boolean {
    if (!this.offlineData) return true;
    
    const age = Date.now() - this.offlineData.lastUpdated;
    return age > this.UPDATE_INTERVAL;
  }

  /**
   * Update offline data
   */
  private async updateOfflineData(): Promise<void> {
    await safe(
      async () => {
        logger.info('Updating offline data...');

        // Load word frequency lists
        const languages: LanguageCode[] = ['spanish', 'french', 'german'];
        const offlineData: OfflineData = {
          translations: {} as Record<LanguageCode, Translation>,
          wordLists: {} as Record<LanguageCode, string[]>,
          lastUpdated: Date.now(),
          version: '1.0'
        };

        for (const lang of languages) {
          const wordList = await this.loadWordFrequencyList(lang);
          offlineData.wordLists[lang] = wordList;
          offlineData.translations[lang] = {};
        }

        // Preload translations for common words
        await this.preloadTranslations(offlineData);

        // Save to storage
        await this.saveOfflineData(offlineData);
        this.offlineData = offlineData;
        this.isLoaded = true;

        logger.info(`Updated offline data: ${this.getWordCount()} words`);
      },
      'offline.updateOfflineData'
    );
  }

  /**
   * Load word frequency list for a language
   */
  private async loadWordFrequencyList(_language: LanguageCode): Promise<string[]> {
    const result = await safe(
      async () => {
        // Try to load from bundled data
        const response = await fetch(chrome.runtime.getURL(`data/common-words-en.json`));
        if (response.ok) {
          const data: WordFrequency[] = await response.json();
          return data
            .slice(0, Math.floor(this.MAX_OFFLINE_WORDS / ARRAY.TRIPLE_SIZE))
            .map(item => item.word);
        }
        return null;
      },
      'offline.loadWordFrequencyList',
      null
    );

    // Return default common words if loading fails
    return result || this.getDefaultCommonWords();
  }

  /**
   * Preload translations for common words
   */
  private async preloadTranslations(data: OfflineData): Promise<void> {
    // Get unique words across all languages
    const allWords = new Set<string>();
    Object.values(data.wordLists).forEach(list => {
      list.forEach(word => allWords.add(word));
    });

    // const words = Array.from(allWords).slice(0, this.MAX_OFFLINE_WORDS); // Removed - not used
    
    // For now, use hardcoded translations for most common words
    // In production, this would fetch from the API during off-peak hours
    const commonTranslations = this.getCommonTranslations();
    
    for (const [lang, translations] of Object.entries(commonTranslations)) {
      data.translations[lang as LanguageCode] = translations;
    }
  }

  /**
   * Get offline translation if available
   */
  async getTranslation(word: string, language: LanguageCode): Promise<string | null> {
    if (!this.isLoaded) {
      await this.loadOfflineData();
    }

    if (!this.offlineData) {
      return null;
    }

    const translations = this.offlineData.translations[language];
    if (!translations) {
      return null;
    }

    return translations[word.toLowerCase()] || null;
  }

  /**
   * Get multiple offline translations
   */
  async getTranslations(
    words: string[], 
    language: LanguageCode
  ): Promise<Translation> {
    const results: Translation = {};

    for (const word of words) {
      const translation = await this.getTranslation(word, language);
      if (translation) {
        results[word] = translation;
      }
    }

    return results;
  }

  /**
   * Check if a word is available offline
   */
  isAvailableOffline(word: string, language: LanguageCode): boolean {
    if (!this.offlineData) return false;
    
    const translations = this.offlineData.translations[language];
    return translations ? word.toLowerCase() in translations : false;
  }

  /**
   * Save offline data to storage
   */
  private async saveOfflineData(data: OfflineData): Promise<void> {
    await safe(
      async () => {
        // Compress data by removing duplicates
        const compressed = this.compressOfflineData(data);
        
        await chromeCall(
          () => chrome.storage.local.set({
            [this.STORAGE_KEY]: compressed
          }),
          'offline.saveOfflineData'
        );
      },
      'offline.saveOfflineData'
    ).catch(async error => {
      // If storage is full, try to save essential data only
      if (error instanceof Error && error.message?.includes('QUOTA_BYTES')) {
        const essential = this.getEssentialData(data);
        await chromeCall(
          () => chrome.storage.local.set({
            [this.STORAGE_KEY]: essential
          }),
          'offline.saveEssentialData'
        );
      } else {
        throw error;
      }
    });
  }

  /**
   * Compress offline data to save space
   */
  private compressOfflineData(data: OfflineData): OfflineData {
    const compressed = { ...data };
    
    // Remove words that are rarely used
    for (const lang of Object.keys(compressed.translations) as LanguageCode[]) {
      const translations = compressed.translations[lang];
      const wordList = compressed.wordLists[lang];
      
      // Keep only translations for words in the word list
      const filtered: Translation = {};
      for (const word of wordList) {
        if (translations[word]) {
          filtered[word] = translations[word];
        }
      }
      
      compressed.translations[lang] = filtered;
    }
    
    return compressed;
  }

  /**
   * Get essential data for minimal offline support
   */
  private getEssentialData(data: OfflineData): OfflineData {
    const essential: OfflineData = {
      ...data,
      translations: {} as Record<LanguageCode, Translation>,
      wordLists: {} as Record<LanguageCode, string[]>
    };

    // Keep only top 1000 words per language
    for (const lang of Object.keys(data.translations) as LanguageCode[]) {
      const wordList = data.wordLists[lang].slice(0, CACHE_LIMITS.MEMORY_CACHE_MAX_ENTRIES);
      essential.wordLists[lang] = wordList;
      
      essential.translations[lang] = {};
      for (const word of wordList) {
        if (data.translations[lang][word]) {
          essential.translations[lang][word] = data.translations[lang][word];
        }
      }
    }

    return essential;
  }

  /**
   * Get word count for offline data
   */
  private getWordCount(): number {
    if (!this.offlineData) return 0;
    
    return Object.values(this.offlineData.translations)
      .reduce((sum, translations) => sum + Object.keys(translations).length, 0);
  }

  /**
   * Get default common words
   */
  private getDefaultCommonWords(): string[] {
    return [
      // Most common English words
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
      'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
      'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
      'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
      'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
      'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
      'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
    ];
  }

  /**
   * Get common translations (essential subset)
   */
  private getCommonTranslations(): Record<LanguageCode, Translation> {
    return {
      spanish: {
        'the': 'el/la',
        'be': 'ser/estar',
        'to': 'a',
        'of': 'de',
        'and': 'y',
        'a': 'un/una',
        'in': 'en',
        'that': 'que',
        'have': 'tener',
        'I': 'yo',
        'it': 'lo/la',
        'for': 'para',
        'not': 'no',
        'on': 'en',
        'with': 'con',
        'he': 'él',
        'as': 'como',
        'you': 'tú/usted',
        'do': 'hacer',
        'at': 'en',
        'this': 'este/esta',
        'but': 'pero',
        'his': 'su',
        'by': 'por',
        'from': 'de',
        'they': 'ellos/ellas',
        'we': 'nosotros',
        'say': 'decir',
        'her': 'su/ella',
        'she': 'ella',
        'or': 'o',
        'an': 'un/una',
        'will': 'voluntad',
        'my': 'mi',
        'one': 'uno',
        'all': 'todo',
        'would': 'sería',
        'there': 'allí',
        'their': 'su',
        'what': 'qué',
        'so': 'así',
        'up': 'arriba',
        'out': 'fuera',
        'if': 'si',
        'about': 'sobre',
        'who': 'quién',
        'get': 'obtener',
        'which': 'cuál',
        'go': 'ir',
        'me': 'me',
        'when': 'cuando',
        'make': 'hacer',
        'can': 'poder',
        'like': 'gustar',
        'time': 'tiempo',
        'no': 'no',
        'just': 'solo',
        'him': 'él',
        'know': 'saber',
        'take': 'tomar',
        'people': 'gente',
        'into': 'en',
        'year': 'año',
        'your': 'tu/su',
        'good': 'bueno',
        'some': 'alguno',
        'could': 'podría',
        'them': 'ellos',
        'see': 'ver',
        'other': 'otro',
        'than': 'que',
        'then': 'entonces',
        'now': 'ahora',
        'look': 'mirar',
        'only': 'solo',
        'come': 'venir',
        'its': 'su',
        'over': 'sobre',
        'think': 'pensar',
        'also': 'también',
        'back': 'atrás',
        'after': 'después',
        'use': 'usar',
        'two': 'dos',
        'how': 'cómo',
        'our': 'nuestro',
        'work': 'trabajo',
        'first': 'primero',
        'well': 'bien',
        'way': 'camino',
        'even': 'incluso',
        'new': 'nuevo',
        'want': 'querer',
        'because': 'porque',
        'any': 'cualquier',
        'these': 'estos',
        'give': 'dar',
        'day': 'día',
        'most': 'más',
        'us': 'nosotros'
      },
      french: {
        'the': 'le/la',
        'be': 'être',
        'to': 'à',
        'of': 'de',
        'and': 'et',
        'a': 'un/une',
        'in': 'dans',
        'that': 'que',
        'have': 'avoir',
        'I': 'je',
        'it': 'il/elle',
        'for': 'pour',
        'not': 'ne...pas',
        'on': 'sur',
        'with': 'avec',
        'he': 'il',
        'as': 'comme',
        'you': 'tu/vous',
        'do': 'faire',
        'at': 'à',
        'this': 'ce/cette',
        'but': 'mais',
        'his': 'son/sa',
        'by': 'par',
        'from': 'de',
        'they': 'ils/elles',
        'we': 'nous',
        'say': 'dire',
        'her': 'son/sa/elle',
        'she': 'elle',
        'or': 'ou',
        'an': 'un/une',
        'will': 'volonté',
        'my': 'mon/ma',
        'one': 'un',
        'all': 'tout',
        'would': 'serait',
        'there': 'là',
        'their': 'leur',
        'what': 'quoi',
        'so': 'alors',
        'up': 'haut',
        'out': 'dehors',
        'if': 'si',
        'about': 'sur',
        'who': 'qui',
        'get': 'obtenir',
        'which': 'quel',
        'go': 'aller',
        'me': 'me',
        'when': 'quand',
        'make': 'faire',
        'can': 'pouvoir',
        'like': 'aimer',
        'time': 'temps',
        'no': 'non',
        'just': 'juste',
        'him': 'lui',
        'know': 'savoir',
        'take': 'prendre',
        'people': 'gens',
        'into': 'dans',
        'year': 'année',
        'your': 'ton/votre',
        'good': 'bon',
        'some': 'quelque',
        'could': 'pourrait',
        'them': 'eux',
        'see': 'voir',
        'other': 'autre',
        'than': 'que',
        'then': 'alors',
        'now': 'maintenant',
        'look': 'regarder',
        'only': 'seulement',
        'come': 'venir',
        'its': 'son/sa',
        'over': 'sur',
        'think': 'penser',
        'also': 'aussi',
        'back': 'retour',
        'after': 'après',
        'use': 'utiliser',
        'two': 'deux',
        'how': 'comment',
        'our': 'notre',
        'work': 'travail',
        'first': 'premier',
        'well': 'bien',
        'way': 'chemin',
        'even': 'même',
        'new': 'nouveau',
        'want': 'vouloir',
        'because': 'parce que',
        'any': 'n\'importe quel',
        'these': 'ces',
        'give': 'donner',
        'day': 'jour',
        'most': 'plus',
        'us': 'nous'
      },
      german: {
        'the': 'der/die/das',
        'be': 'sein',
        'to': 'zu',
        'of': 'von',
        'and': 'und',
        'a': 'ein/eine',
        'in': 'in',
        'that': 'dass',
        'have': 'haben',
        'I': 'ich',
        'it': 'es',
        'for': 'für',
        'not': 'nicht',
        'on': 'auf',
        'with': 'mit',
        'he': 'er',
        'as': 'als',
        'you': 'du/Sie',
        'do': 'machen',
        'at': 'bei',
        'this': 'dieser/diese',
        'but': 'aber',
        'his': 'sein',
        'by': 'von',
        'from': 'von',
        'they': 'sie',
        'we': 'wir',
        'say': 'sagen',
        'her': 'ihr/sie',
        'she': 'sie',
        'or': 'oder',
        'an': 'ein/eine',
        'will': 'Wille',
        'my': 'mein',
        'one': 'eins',
        'all': 'alle',
        'would': 'würde',
        'there': 'dort',
        'their': 'ihr',
        'what': 'was',
        'so': 'so',
        'up': 'auf',
        'out': 'aus',
        'if': 'wenn',
        'about': 'über',
        'who': 'wer',
        'get': 'bekommen',
        'which': 'welche',
        'go': 'gehen',
        'me': 'mich',
        'when': 'wann',
        'make': 'machen',
        'can': 'können',
        'like': 'mögen',
        'time': 'Zeit',
        'no': 'nein',
        'just': 'nur',
        'him': 'ihn',
        'know': 'wissen',
        'take': 'nehmen',
        'people': 'Leute',
        'into': 'in',
        'year': 'Jahr',
        'your': 'dein/Ihr',
        'good': 'gut',
        'some': 'einige',
        'could': 'könnte',
        'them': 'sie',
        'see': 'sehen',
        'other': 'andere',
        'than': 'als',
        'then': 'dann',
        'now': 'jetzt',
        'look': 'schauen',
        'only': 'nur',
        'come': 'kommen',
        'its': 'sein',
        'over': 'über',
        'think': 'denken',
        'also': 'auch',
        'back': 'zurück',
        'after': 'nach',
        'use': 'benutzen',
        'two': 'zwei',
        'how': 'wie',
        'our': 'unser',
        'work': 'Arbeit',
        'first': 'erste',
        'well': 'gut',
        'way': 'Weg',
        'even': 'sogar',
        'new': 'neu',
        'want': 'wollen',
        'because': 'weil',
        'any': 'jede',
        'these': 'diese',
        'give': 'geben',
        'day': 'Tag',
        'most': 'meist',
        'us': 'uns'
      }
    };
  }

  /**
   * Clear offline data
   */
  async clear(): Promise<void> {
    await chromeCall(
      () => chrome.storage.local.remove(this.STORAGE_KEY),
      'offline.clear'
    );
    this.offlineData = null;
    this.isLoaded = false;
  }

  /**
   * Get storage size used
   */
  async getStorageSize(): Promise<number> {
    const stored = await chromeCall(
      () => chrome.storage.local.getBytesInUse(this.STORAGE_KEY),
      'offline.getStorageSize',
      0
    );
    return stored;
  }

  /**
   * Cleanup method to prevent memory leaks
   */
  destroy(): void {
    this.offlineData = null;
    this.isLoaded = false;
  }
}

// Export singleton instance
export const offlineManager = OfflineManager.getInstance();