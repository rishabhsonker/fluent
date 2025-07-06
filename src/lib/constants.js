// Shared constants and configuration
export const SUPPORTED_LANGUAGES = {
  spanish: {
    code: 'es',
    name: 'Spanish',
    flag: '🇪🇸',
    articles: {
      masculine: 'el',
      feminine: 'la',
      masculinePlural: 'los',
      femininePlural: 'las'
    }
  },
  french: {
    code: 'fr',
    name: 'French',
    flag: '🇫🇷',
    articles: {
      masculine: 'le',
      feminine: 'la',
      plural: 'les',
      vowelStart: "l'"
    }
  },
  german: {
    code: 'de',
    name: 'German',
    flag: '🇩🇪',
    articles: {
      masculine: 'der',
      feminine: 'die',
      neuter: 'das',
      plural: 'die'
    },
    specialRules: {
      capitalizeNouns: true
    }
  }
};

// Performance limits
export const PERFORMANCE_LIMITS = {
  MAX_MEMORY_MB: 30,
  MAX_PROCESSING_TIME_MS: 50,
  MAX_PAGE_LOAD_IMPACT_MS: 100,
  MIN_CACHE_HIT_RATE: 0.9,
  MAX_API_TIMEOUT_MS: 2000
};

// Word selection configuration
export const WORD_CONFIG = {
  MIN_WORD_LENGTH: 4,
  MAX_WORD_LENGTH: 15,
  MIN_WORD_OCCURRENCES: 2,
  MAX_WORD_OCCURRENCES: 4,
  MAX_WORDS_PER_PAGE: 6,
  WORDS_PER_PARAGRAPH: 1,
  MIN_PARAGRAPH_LENGTH: 100
};

// Mock translations for development/testing
export const MOCK_TRANSLATIONS = {
  spanish: {
    // Common words
    'house': 'casa',
    'water': 'agua',
    'food': 'comida',
    'time': 'tiempo',
    'work': 'trabajo',
    'people': 'gente',
    'world': 'mundo',
    'life': 'vida',
    'day': 'día',
    'year': 'año',
    'way': 'camino',
    'man': 'hombre',
    'woman': 'mujer',
    'child': 'niño',
    'hand': 'mano',
    'part': 'parte',
    'place': 'lugar',
    'week': 'semana',
    'case': 'caso',
    'point': 'punto',
    'government': 'gobierno',
    'company': 'empresa',
    'number': 'número',
    'group': 'grupo',
    'problem': 'problema',
    'fact': 'hecho',
    
    // Verbs
    'make': 'hacer',
    'know': 'saber',
    'think': 'pensar',
    'take': 'tomar',
    'see': 'ver',
    'come': 'venir',
    'want': 'querer',
    'look': 'mirar',
    'use': 'usar',
    'find': 'encontrar',
    'give': 'dar',
    'tell': 'decir',
    'work': 'trabajar',
    'call': 'llamar',
    'try': 'intentar',
    'ask': 'preguntar',
    'need': 'necesitar',
    'feel': 'sentir',
    'become': 'convertirse',
    'leave': 'dejar'
  },
  french: {
    // Common words
    'house': 'maison',
    'water': 'eau',
    'food': 'nourriture',
    'time': 'temps',
    'work': 'travail',
    'people': 'gens',
    'world': 'monde',
    'life': 'vie',
    'day': 'jour',
    'year': 'année',
    'way': 'chemin',
    'man': 'homme',
    'woman': 'femme',
    'child': 'enfant',
    'hand': 'main',
    'part': 'partie',
    'place': 'lieu',
    'week': 'semaine',
    'case': 'cas',
    'point': 'point',
    'government': 'gouvernement',
    'company': 'entreprise',
    'number': 'nombre',
    'group': 'groupe',
    'problem': 'problème',
    'fact': 'fait',
    
    // Verbs
    'make': 'faire',
    'know': 'savoir',
    'think': 'penser',
    'take': 'prendre',
    'see': 'voir',
    'come': 'venir',
    'want': 'vouloir',
    'look': 'regarder',
    'use': 'utiliser',
    'find': 'trouver',
    'give': 'donner',
    'tell': 'dire',
    'work': 'travailler',
    'call': 'appeler',
    'try': 'essayer',
    'ask': 'demander',
    'need': 'avoir besoin',
    'feel': 'sentir',
    'become': 'devenir',
    'leave': 'partir'
  },
  german: {
    // Common words (capitalized for German nouns)
    'house': 'Haus',
    'water': 'Wasser',
    'food': 'Essen',
    'time': 'Zeit',
    'work': 'Arbeit',
    'people': 'Leute',
    'world': 'Welt',
    'life': 'Leben',
    'day': 'Tag',
    'year': 'Jahr',
    'way': 'Weg',
    'man': 'Mann',
    'woman': 'Frau',
    'child': 'Kind',
    'hand': 'Hand',
    'part': 'Teil',
    'place': 'Ort',
    'week': 'Woche',
    'case': 'Fall',
    'point': 'Punkt',
    'government': 'Regierung',
    'company': 'Unternehmen',
    'number': 'Nummer',
    'group': 'Gruppe',
    'problem': 'Problem',
    'fact': 'Tatsache',
    
    // Verbs
    'make': 'machen',
    'know': 'wissen',
    'think': 'denken',
    'take': 'nehmen',
    'see': 'sehen',
    'come': 'kommen',
    'want': 'wollen',
    'look': 'schauen',
    'use': 'benutzen',
    'find': 'finden',
    'give': 'geben',
    'tell': 'erzählen',
    'work': 'arbeiten',
    'call': 'anrufen',
    'try': 'versuchen',
    'ask': 'fragen',
    'need': 'brauchen',
    'feel': 'fühlen',
    'become': 'werden',
    'leave': 'verlassen'
  }
};

// API Configuration
export const API_CONFIG = {
  // Cloudflare Worker endpoint (update with your deployed URL)
  TRANSLATOR_API: 'https://fluent-translator.workers.dev',
  // Or use localhost for development
  // TRANSLATOR_API: 'http://localhost:8787',
};

// Storage keys
export const STORAGE_KEYS = {
  USER_SETTINGS: 'fluent_settings',
  SITE_SETTINGS: 'fluent_site_settings',
  WORD_PROGRESS: 'fluent_word_progress',
  TRANSLATION_CACHE: 'fluent_translation_cache',
  DAILY_STATS: 'fluent_daily_stats'
};

// Default settings
export const DEFAULT_SETTINGS = {
  targetLanguage: 'spanish',
  wordCount: 6,
  difficulty: 'intermediate',
  enabledGlobally: true,
  enablePronunciation: true,
  enableContextHelper: true,
  pausedUntil: null
};