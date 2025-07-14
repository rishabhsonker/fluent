/**
 * Spaced Repetition Algorithm (SM-2)
 * 
 * This module implements the SuperMemo 2 (SM-2) algorithm for spaced repetition learning.
 * It tracks word learning progress and determines when words should be reviewed.
 */

import { LanguageCode } from '../../shared/types';
import { SRS, TIME, MATH, QUALITY, NUMERIC, THRESHOLD } from '../../shared/constants';

// Extended WordProgress type for spaced repetition
export interface SpacedRepetitionWordData {
  word: string;
  language?: LanguageCode;
  easeFactor: number;
  interval: number;
  repetitions: number;
  lastSeen: number;
  nextReview: number;
  totalSeen: number;
  correctCount: number;
  mastery: number;
  overdue?: number;
  encounters?: number;
  interactions?: {
    hover: number;
    pronunciation: number;
    context: number;
  };
}

// Type for word data collection
export type WordsData = Record<string, SpacedRepetitionWordData>;

// Quality rating type
export type QualityRating = 0 | 1 | 2 | 3 | 4 | 5;

// Interaction types
export type InteractionType = 'hover' | 'pronunciation' | 'context' | 'ignored' | 'clicked';

// Statistics interface
export interface SpacedRepetitionStats {
  totalWords: number;
  masteredWords: number;
  wordsInProgress: number;
  wordsDueForReview: number;
  averageMastery: number;
  todayReviews: number;
}

class SpacedRepetition {
  private intervals: number[];
  private minEaseFactor: number;
  private defaultEaseFactor: number;

  constructor() {
    // Default intervals in days
    this.intervals = [...SRS.INTERVALS_DAYS];
    
    // Minimum ease factor (difficulty)
    this.minEaseFactor = SRS.EASE_FACTOR_MIN;
    
    // Default ease factor for new words
    this.defaultEaseFactor = SRS.EASE_FACTOR_DEFAULT;
  }

  /**
   * Calculate the next review date and updated learning stats
   */
  calculateNextReview(
    wordData: Partial<SpacedRepetitionWordData>, 
    quality: QualityRating
  ): SpacedRepetitionWordData {
    const now = Date.now();
    
    // Initialize word data if new
    if (!wordData.easeFactor) {
      wordData = {
        ...wordData,
        word: wordData.word || '',
        easeFactor: this.defaultEaseFactor,
        interval: 0,
        repetitions: 0,
        lastSeen: now,
        nextReview: now,
        totalSeen: 0,
        correctCount: 0,
        mastery: 0
      };
    }

    // Clone to avoid mutations
    const updated = { ...wordData } as SpacedRepetitionWordData;
    
    // Update total seen count
    updated.totalSeen = (updated.totalSeen || 0) + 1;
    updated.lastSeen = now;

    // Calculate new ease factor
    const newEaseFactor = this.calculateEaseFactor(updated.easeFactor, quality);
    updated.easeFactor = Math.max(newEaseFactor, this.minEaseFactor);

    // Determine next interval
    if (quality >= SRS.QUALITY_THRESHOLD_PASS) {
      // Correct response
      updated.correctCount = (updated.correctCount || 0) + 1;
      
      if (updated.repetitions === 0) {
        updated.interval = 1;
      } else if (updated.repetitions === 1) {
        updated.interval = 3;
      } else {
        updated.interval = Math.round(updated.interval * updated.easeFactor);
      }
      
      updated.repetitions += 1;
    } else {
      // Incorrect response - reset
      updated.repetitions = 0;
      updated.interval = 1;
    }

    // Calculate next review date
    updated.nextReview = now + (updated.interval * TIME.MS_PER_DAY);

    // Calculate mastery level (0-100)
    updated.mastery = this.calculateMastery(updated);

    return updated;
  }

  /**
   * Calculate new ease factor based on quality of response
   */
  private calculateEaseFactor(oldEaseFactor: number, quality: QualityRating): number {
    return oldEaseFactor + (MATH.EASE_FACTOR_INCREASE - (QUALITY.RATING_PERFECT - quality) * (MATH.DIFFICULTY_EASY_FACTOR + (QUALITY.RATING_PERFECT - quality) * MATH.DIFFICULTY_HARD_FACTOR));
  }

  /**
   * Calculate mastery level as a percentage
   */
  calculateMastery(wordData: SpacedRepetitionWordData): number {
    if (!wordData.totalSeen) return 0;
    
    const correctRatio = wordData.correctCount / wordData.totalSeen;
    const intervalWeight = Math.min(wordData.interval / TIME.DAYS_PER_MONTH, 1);
    const repetitionWeight = Math.min(wordData.repetitions / QUALITY.RATING_PERFECT, 1);
    
    // Weighted average: 40% correct ratio, 30% interval, 30% repetitions
    const mastery = (
      correctRatio * SRS.MASTERY_CALCULATION_WEIGHTS.CORRECT_RATIO + 
      intervalWeight * SRS.MASTERY_CALCULATION_WEIGHTS.INTERVAL + 
      repetitionWeight * SRS.MASTERY_CALCULATION_WEIGHTS.REPETITIONS
    ) * NUMERIC.PERCENTAGE_MAX;
    
    return Math.round(Math.min(mastery, NUMERIC.PERCENTAGE_MAX));
  }

  /**
   * Get words due for review
   */
  getWordsForReview(wordsData: WordsData, limit: number = SRS.MAX_REVIEW_WORDS_PER_SESSION): SpacedRepetitionWordData[] {
    const now = Date.now();
    const dueWords: SpacedRepetitionWordData[] = [];

    Object.entries(wordsData).forEach(([word, data]) => {
      if (data.nextReview && data.nextReview <= now) {
        dueWords.push({
          ...data,
          word,
          overdue: now - data.nextReview
        });
      }
    });

    // Sort by most overdue first
    dueWords.sort((a, b) => (b.overdue || 0) - (a.overdue || 0));

    return dueWords.slice(0, limit);
  }

  /**
   * Get new words to introduce
   */
  getNewWords(wordsData: WordsData, availableWords: string[], limit: number = SRS.MAX_NEW_WORDS_PER_SESSION): string[] {
    const learnedWords = new Set(Object.keys(wordsData));
    const newWords = availableWords.filter(word => !learnedWords.has(word));
    
    // Shuffle and return limited set
    const shuffled = this.shuffle(newWords);
    return shuffled.slice(0, limit);
  }

  /**
   * Determine word selection for a page
   */
  selectWordsForPage(
    wordsData: WordsData, 
    pageWords: string[], 
    totalLimit: number = 6
  ): string[] {
    // Prioritize review words (max 2-3)
    const reviewWords = this.getWordsForReview(wordsData, QUALITY.RATING_GOOD)
      .filter(item => pageWords.includes(item.word))
      .map(item => item.word);

    // Fill remaining slots with new words
    const remainingSlots = totalLimit - reviewWords.length;
    const newWords = this.getNewWords(wordsData, pageWords, remainingSlots);

    return [...reviewWords, ...newWords];
  }

  /**
   * Record user interaction with a word
   */
  scoreInteraction(wordData: SpacedRepetitionWordData, interaction: InteractionType): QualityRating {
    switch (interaction) {
      case 'hover':
        // Just hovering means they needed help
        return QUALITY.RATING_FAIR as QualityRating;
      case 'pronunciation':
        // Needed pronunciation help
        return QUALITY.RATING_GOOD as QualityRating;
      case 'context':
        // Needed context explanation
        return QUALITY.RATING_FAIR as QualityRating;
      case 'ignored':
        // Recognized without hovering
        return QUALITY.RATING_GREAT as QualityRating;
      case 'clicked':
        // Actively engaged
        return QUALITY.RATING_PERFECT as QualityRating;
      default:
        return QUALITY.RATING_GOOD as QualityRating;
    }
  }

  /**
   * Get learning statistics
   */
  getStatistics(wordsData: WordsData): SpacedRepetitionStats {
    const words = Object.values(wordsData);
    const now = Date.now();

    return {
      totalWords: words.length,
      masteredWords: words.filter(w => w.mastery >= THRESHOLD.WARNING_THRESHOLD).length,
      wordsInProgress: words.filter(w => w.mastery > 0 && w.mastery < THRESHOLD.WARNING_THRESHOLD).length,
      wordsDueForReview: words.filter(w => w.nextReview <= now).length,
      averageMastery: words.reduce((sum, w) => sum + (w.mastery || 0), 0) / words.length || 0,
      todayReviews: words.filter(w => {
        const today = new Date().setHours(0, 0, 0, 0);
        return w.lastSeen >= today;
      }).length
    };
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

// Export singleton instance
export const spacedRepetition = new SpacedRepetition();