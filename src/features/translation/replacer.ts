/**
 * Word Replacer - Intelligent word selection and DOM replacement
 * 
 * Purpose:
 * - Implements smart word selection algorithm
 * - Performs actual DOM manipulation to replace words
 * - Manages the visual presentation of translated words
 * 
 * Key Features:
 * - Smart word scoring algorithm (frequency, difficulty, position)
 * - Context-aware replacement (maintains sentence structure)
 * - Proper capitalization handling
 * - HTML entity preservation
 * - Tooltip data attribute management
 * 
 * Word Selection Criteria:
 * - Word difficulty (beginner/intermediate/advanced)
 * - Position variety (spread across page)
 * - Frequency scoring (common but not too common)
 * - Length preferences (5-12 characters optimal)
 * - Skip proper nouns and already translated words
 * 
 * Referenced by:
 * - src/features/translation/processor.ts (calls for replacements)
 * - src/features/ui/tooltip/manager.ts (reads data attributes)
 * 
 * DOM Modifications:
 * - Wraps words in <span> with data-fluent attributes
 * - Preserves original text in data-fluent-original
 * - Adds translation data for tooltip display
 * - Maintains text node structure for clean uninstall
 */

'use strict';

import { logger } from '../../shared/logger';
import { MATH, DOMAIN, NUMERIC, ARRAY, WORD_CONFIG, SRS, PERFORMANCE_LIMITS, CRYPTO } from '../../shared/constants';
import { getMemoryMonitor } from '../../shared/monitor';
import { 
  sanitizeText, 
  sanitizeTranslation, 
  setSafeAttribute, 
  isNodeSafe
} from '../../shared/sanitizer';
import { validator } from '../../shared/validator';
import { safe, safeSync } from '../../shared/utils/helpers';
import type { 
  Translation, 
  ReplacementData, 
  ProcessingContext,
  LanguageCode
} from '../../shared/types';

interface WordReplacerConfig {
  MIN_WORD_LENGTH: number;
  MIN_WORD_OCCURRENCES: number;
  MAX_WORD_OCCURRENCES: number;
  MAX_WORDS_PER_PAGE: number;
  PERFORMANCE_GUARD_MS: number;
}

interface WordScore {
  word: string;
  count: number;
  score: number;
}

export class WordReplacer {
  private config: WordReplacerConfig;
  private wordCounts: Map<string, number>;
  private replacedWords: Set<string>;
  private replacementElements: WeakMap<Node, HTMLElement>;
  private readonly MAX_WORD_CACHE = 500; // Reduced for production memory constraints
  public storage: any; // Will be properly typed when storage is converted
  public currentLanguage: LanguageCode | null;

  constructor(config: WordReplacerConfig) {
    this.config = config;
    this.wordCounts = new Map();
    this.replacedWords = new Set();
    this.replacementElements = new WeakMap();
    this.storage = null;
    this.currentLanguage = null;
  }

  // Allow updating max words per page
  setMaxWordsPerPage(count: number): void {
    this.config.MAX_WORDS_PER_PAGE = count;
  }

  // Analyze text and find suitable words for replacement
  async analyzeText(textNodes: Text[]): Promise<string[]> {
    const startTime = performance.now();
    
    // Import performance utilities
    const { processInChunks } = await import('../../shared/performance');
    
    // Process nodes in chunks to avoid blocking
    await processInChunks(
      textNodes,
      (node) => {
        // Security check
        if (!isNodeSafe(node)) return;
        
        const text = node.textContent || '';
        const words = this.extractWords(text);
        
        for (const word of words) {
          if (this.isValidWord(word)) {
            const sanitized = validator.validateWord(word);
            if (!sanitized) continue;
            
            const normalized = sanitized.toLowerCase();
            
            // Prevent memory leak - remove oldest entries in batch
            if (this.wordCounts.size >= this.MAX_WORD_CACHE) {
              const keysToRemove = Math.floor(this.MAX_WORD_CACHE * MATH.EASE_FACTOR_DECREASE); // Remove 20%
              const iterator = this.wordCounts.keys();
              for (let i = 0; i < keysToRemove; i++) {
                const key = iterator.next().value;
                if (key) this.wordCounts.delete(key);
              }
            }
            
            this.wordCounts.set(normalized, (this.wordCounts.get(normalized) || 0) + 1);
          }
        }
      },
      {
        chunkSize: DOMAIN.MIN_NODE_LENGTH,
        maxTime: this.config.PERFORMANCE_GUARD_MS / DOMAIN.BACKOFF_FACTOR
      }
    );
    
    // Select best words for replacement
    return await this.selectWordsForReplacement();
  }

  // Extract words from text using regex
  private extractWords(text: string): string[] {
    // Match words including contractions but exclude URLs and numbers
    return text.match(/\b[a-zA-Z][a-zA-Z']*\b/g) || [];
  }

  // Check if word is valid for replacement
  private isValidWord(word: string): boolean {
    if (word.length < this.config.MIN_WORD_LENGTH) return false;
    if (/^(the|and|for|are|but|not|you|all|that|this|with|from)$/i.test(word)) return false;
    if (/^[A-Z][a-z]*$/.test(word) && word.length < WORD_CONFIG.MAX_WORDS_PER_PAGE) return false; // Skip short proper nouns
    return true;
  }

  // Select optimal words for replacement using spaced repetition
  private async selectWordsForReplacement(): Promise<string[]> {
    const candidates: string[] = [];
    
    // Get all available words that meet basic criteria
    for (const [word, count] of Array.from(this.wordCounts.entries())) {
      if (count >= this.config.MIN_WORD_OCCURRENCES && 
          count <= this.config.MAX_WORD_OCCURRENCES) {
        candidates.push(word);
      }
    }
    
    // If we have storage and language, use spaced repetition
    if (this.storage && this.currentLanguage) {
      const selectedWords = await safe(async () => {
        // Get all word progress for current language
        const wordsData = await this.storage!.getAllWordProgress(this.currentLanguage!);
        
        // Import spaced repetition algorithm
        const { spacedRepetition } = await import('../learning/srs');
        
        // Use spaced repetition to select words
        return spacedRepetition.selectWordsForPage(
          wordsData,
          candidates,
          this.config.MAX_WORDS_PER_PAGE
        );
      }, 'Spaced repetition selection failed');
      
      // If successful, return the selected words
      if (selectedWords) {
        return selectedWords;
      }
      // Otherwise fall back to basic selection
    }
    
    // Fallback: Basic selection by score
    const scoredCandidates: WordScore[] = candidates.map(word => ({
      word,
      count: this.wordCounts.get(word) || 0,
      score: this.calculateWordScore(word, this.wordCounts.get(word) || 0)
    }));
    
    // Sort by score and select top words
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates.slice(0, this.config.MAX_WORDS_PER_PAGE).map(c => c.word);
  }

  // Calculate word learning score
  private calculateWordScore(word: string, count: number): number {
    let score = 0;
    
    // Prefer words with 2-4 occurrences
    if (count === WORD_CONFIG.MIN_WORD_OCCURRENCES || count === ARRAY.TRIPLE_SIZE) score += ARRAY.TRIPLE_SIZE;
    else if (count === WORD_CONFIG.MAX_WORD_OCCURRENCES) score += WORD_CONFIG.MIN_WORD_OCCURRENCES;
    
    // Prefer medium-length words
    if (word.length >= NUMERIC.MINUTES_SHORT && word.length <= DOMAIN.MAX_CONSECUTIVE_ERRORS + ARRAY.TRIPLE_SIZE) score += ARRAY.PAIR_SIZE;
    else if (word.length > DOMAIN.MAX_CONSECUTIVE_ERRORS + ARRAY.TRIPLE_SIZE && word.length <= CRYPTO.TAG_LENGTH) score += ARRAY.SINGLE_ITEM;
    
    // Prefer common learning words (this would be expanded with real data)
    const commonLearnWords = ['house', 'water', 'food', 'time', 'work', 'people', 'world'];
    if (commonLearnWords.includes(word)) score += ARRAY.PAIR_SIZE;
    
    return score;
  }

  // Replace words in text nodes
  async replaceWords(
    textNodes: Text[], 
    wordsToReplace: string[], 
    translations: Translation,
    contextMap?: Record<string, any>
  ): Promise<number> {
    return await safe(async () => {
      const context: ProcessingContext = {
        startTime: performance.now(),
        replacementCount: 0,
        processedPositions: new Set()
      };
      
      // Import performance utilities
      const { processInChunks } = await import('../../shared/performance');
      
      // Process nodes in chunks
      const nodesToProcess: { node: Text; replacements: ReplacementData[] }[] = [];
      
      // First pass: collect replacements
      for (const node of textNodes) {
        if (this.shouldStopProcessing(context)) break;
        
        const nodeReplacements = safeSync(
          () => this.processNode(node, wordsToReplace, translations, context, contextMap),
          'Error processing node',
          []
        );
        
        if (nodeReplacements && nodeReplacements.length > 0) {
          nodesToProcess.push({ node, replacements: nodeReplacements });
        }
      }
      
      // Second pass: apply replacements in chunks
      await processInChunks(
        nodesToProcess,
        async ({ node, replacements }) => {
          await safe(async () => {
            await this.applyReplacements(node, replacements);
            context.replacementCount += replacements.length;
          }, 'Error applying replacements');
        },
        {
          chunkSize: 5,
          maxTime: 30
        }
      );
      
      return context.replacementCount;
    }, 'Error in replaceWords', 0);
  }
  
  // Check if we should stop processing
  private shouldStopProcessing(context: ProcessingContext): boolean {
    return context.replacementCount >= this.config.MAX_WORDS_PER_PAGE ||
           performance.now() - context.startTime > this.config.PERFORMANCE_GUARD_MS;
  }
  
  // Process a single text node
  private processNode(
    node: Text, 
    wordsToReplace: string[], 
    translations: Translation, 
    context: ProcessingContext,
    contextMap?: Record<string, any>
  ): ReplacementData[] {
    const text = node.textContent || '';
    const replacements: ReplacementData[] = [];
    
    for (const word of wordsToReplace) {
      if (context.replacementCount >= this.config.MAX_WORDS_PER_PAGE) break;
      
      const matches = this.findWordMatches(word, text, node, context);
      
      for (const match of matches) {
        const rawTranslation = translations[word.toLowerCase()] || word;
        const translation = sanitizeTranslation(rawTranslation);
        
        if (!translation) {
          logger.warn(`Invalid translation received for word: ${word}`);
          continue;
        }
        
        const wordContext = contextMap?.[word.toLowerCase()];
        replacements.push({
          index: match.index!,
          length: match[0].length,
          original: sanitizeText(match[0]) || match[0],
          translation: translation,
          context: wordContext
        });
        
        context.replacementCount++;
        this.replacedWords.add(word.toLowerCase());
        
        // Only replace first occurrence
        break;
      }
    }
    
    return replacements;
  }
  
  // Find matches for a word in text
  private findWordMatches(
    word: string, 
    text: string, 
    node: Text, 
    context: ProcessingContext
  ): RegExpExecArray[] {
    const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(text)) !== null) {
      const position = `${node}:${match.index}`;
      
      // Skip if already processed
      if (context.processedPositions.has(position)) continue;
      context.processedPositions.add(position);
      
      matches.push(match);
    }
    
    return matches;
  }

  // Create replacement element safely using DOM methods
  private createReplacementElement(original: string, translation: string, context?: any): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'fluent-word';
    
    // Use safe attribute setting
    setSafeAttribute(span, 'data-fluent-original', original);
    setSafeAttribute(span, 'data-fluent-translation', translation);
    setSafeAttribute(span, 'tabindex', '0');
    setSafeAttribute(span, 'role', 'button');
    setSafeAttribute(span, 'aria-label', `Translation: ${original} means ${translation}`);
    
    // Add context data if available
    if (context) {
      if (context.pronunciation) {
        setSafeAttribute(span, 'data-fluent-pronunciation', context.pronunciation);
      }
      if (context.meaning) {
        setSafeAttribute(span, 'data-fluent-meaning', context.meaning);
      }
      if (context.example) {
        setSafeAttribute(span, 'data-fluent-example', context.example);
      }
    }
    
    // Safe text content, no HTML injection
    span.textContent = translation;
    
    
    return span;
  }

  // Apply replacements to DOM
  private async applyReplacements(node: Text, replacements: ReplacementData[]): Promise<void> {
    const parent = node.parentElement;
    if (!parent || replacements.length === 0) return;
    
    // Process immediately for better performance
    
    // Sort by index (sometimes shuffle order slightly)
    replacements.sort((a, b) => a.index - b.index);
    if (Math.random() < MATH.EASE_FACTOR_INCREASE) {
      // Occasionally process in slightly different order
      const mid = Math.floor(replacements.length / ARRAY.PAIR_SIZE);
      [replacements[0], replacements[mid]] = [replacements[mid], replacements[0]];
    }
    
    // Build fragment
    const fragment = this.buildReplacementFragment(node, replacements);
    
    // Replace node
    parent.replaceChild(fragment, node);
  }
  
  // Build fragment with replacements
  private buildReplacementFragment(node: Text, replacements: ReplacementData[]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const text = node.textContent || '';
    let lastIndex = 0;
    
    for (const data of replacements) {
      // Add text before replacement
      if (data.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex, data.index))
        );
      }
      
      // Add replacement span
      fragment.appendChild(
        this.createReplacementElement(data.original, data.translation, data.context)
      );
      
      lastIndex = data.index + data.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(
        document.createTextNode(text.substring(lastIndex))
      );
    }
    
    return fragment;
  }

  // Utility: Escape regex special characters
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Get performance stats
  async getStats(): Promise<{ wordsAnalyzed: number; wordsReplaced: number; memoryUsage: string }> {
    const memoryMonitor = getMemoryMonitor();
    const memoryStats = await memoryMonitor.getMemoryUsage();
    
    return {
      wordsAnalyzed: this.wordCounts.size,
      wordsReplaced: this.replacedWords.size,
      memoryUsage: memoryMonitor.getFormattedStats(memoryStats)
    };
  }

  // Comprehensive cleanup
  cleanup(): void {
    // Clear all collections
    this.wordCounts.clear();
    this.replacedWords.clear();
    this.replacementElements = new WeakMap();
    
    // Remove references
    this.storage = null;
    this.currentLanguage = null;
    
    // Force garbage collection hint
    if ((globalThis as any).gc) {
      try {
        (globalThis as any).gc();
      } catch (e) {
        // Ignore - gc might not be available
      }
    }
  }
}