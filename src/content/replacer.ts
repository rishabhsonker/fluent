// Word Replacer Module - Smart word selection and replacement
'use strict';

import { logger } from '../lib/logger.js';
import { errorBoundary as boundaries } from '../lib/errorBoundaryEnhanced.js';
import { 
  sanitizeText, 
  sanitizeTranslation, 
  setSafeAttribute, 
  isNodeSafe,
  sanitizeWord
} from '../lib/sanitizer.js';
import { antiFingerprint } from '../lib/antiFingerprintManager.js';
import type { 
  Translation, 
  ReplacementData, 
  ProcessingContext,
  LanguageCode
} from '../types';

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

  // Analyze text and find suitable words for replacement
  async analyzeText(textNodes: Text[]): Promise<string[]> {
    const startTime = performance.now();
    
    // Import performance utilities
    const { processInChunks } = await import('../lib/performance');
    
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
            const sanitized = sanitizeWord(word);
            if (!sanitized) continue;
            
            const normalized = sanitized.toLowerCase();
            
            // Prevent memory leak - remove oldest entries in batch
            if (this.wordCounts.size >= this.MAX_WORD_CACHE) {
              const keysToRemove = Math.floor(this.MAX_WORD_CACHE * 0.2); // Remove 20%
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
        chunkSize: 20,
        maxTime: this.config.PERFORMANCE_GUARD_MS / 2
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
    if (/^[A-Z][a-z]*$/.test(word) && word.length < 6) return false; // Skip short proper nouns
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
      try {
        // Get all word progress for current language
        const wordsData = await this.storage.getAllWordProgress(this.currentLanguage);
        
        // Import spaced repetition algorithm
        const { spacedRepetition } = await import('../lib/spacedRepetition');
        
        // Use spaced repetition to select words
        const selectedWords = spacedRepetition.selectWordsForPage(
          wordsData,
          candidates,
          this.config.MAX_WORDS_PER_PAGE
        );
        
        return selectedWords;
      } catch (error) {
        logger.error('Spaced repetition selection failed:', error);
        // Fall back to basic selection
      }
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
    if (count === 2 || count === 3) score += 3;
    else if (count === 4) score += 2;
    
    // Prefer medium-length words
    if (word.length >= 5 && word.length <= 8) score += 2;
    else if (word.length > 8 && word.length <= 12) score += 1;
    
    // Prefer common learning words (this would be expanded with real data)
    const commonLearnWords = ['house', 'water', 'food', 'time', 'work', 'people', 'world'];
    if (commonLearnWords.includes(word)) score += 2;
    
    return score;
  }

  // Replace words in text nodes
  async replaceWords(
    textNodes: Text[], 
    wordsToReplace: string[], 
    translations: Translation
  ): Promise<number> {
    const result = await boundaries.replacer.wrap(async () => {
      const context: ProcessingContext = {
        startTime: performance.now(),
        replacementCount: 0,
        processedPositions: new Set()
      };
      
      // Import performance utilities
      const { processInChunks } = await import('../lib/performance');
      
      // Process nodes in chunks
      const nodesToProcess: { node: Text; replacements: ReplacementData[] }[] = [];
      
      // First pass: collect replacements
      for (const node of textNodes) {
        if (this.shouldStopProcessing(context)) break;
        
        const nodeReplacements = boundaries.replacer.wrapSync(
          () => this.processNode(node, wordsToReplace, translations, context),
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
          await boundaries.replacer.wrap(
            async () => await this.applyReplacements(node, replacements),
            null
          );
          context.replacementCount += replacements.length;
        },
        {
          chunkSize: 5,
          maxTime: 30
        }
      );
      
      return context.replacementCount;
    }, 0); // Return 0 replacements on error
    
    return result || 0;
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
    context: ProcessingContext
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
        
        replacements.push({
          index: match.index!,
          length: match[0].length,
          original: sanitizeText(match[0]) || match[0],
          translation: translation
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
  private createReplacementElement(original: string, translation: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = antiFingerprint.generateClassName('fluent-word');
    
    // Use randomized attribute names to avoid detection
    const attrOriginal = antiFingerprint.randomizeAttributeName('data-fluent-original');
    const attrTranslation = antiFingerprint.randomizeAttributeName('data-fluent-translation');
    
    // Use safe attribute setting
    setSafeAttribute(span, attrOriginal, original);
    setSafeAttribute(span, attrTranslation, translation);
    setSafeAttribute(span, 'tabindex', '0');
    setSafeAttribute(span, 'role', 'button');
    setSafeAttribute(span, 'aria-label', `Translation: ${original} means ${translation}`);
    
    // Safe text content, no HTML injection
    span.textContent = translation;
    
    return span;
  }

  // Apply replacements to DOM
  private async applyReplacements(node: Text, replacements: ReplacementData[]): Promise<void> {
    const parent = node.parentElement;
    if (!parent || replacements.length === 0) return;
    
    // Add random delay to avoid detection
    await antiFingerprint.addRandomDelay('wordReplacement');
    
    // Sort by index (sometimes shuffle order slightly)
    replacements.sort((a, b) => a.index - b.index);
    if (Math.random() < 0.1) {
      // Occasionally process in slightly different order
      const mid = Math.floor(replacements.length / 2);
      [replacements[0], replacements[mid]] = [replacements[mid], replacements[0]];
    }
    
    // Build fragment
    const fragment = this.buildReplacementFragment(node, replacements);
    
    // Replace node with varying DOM operation
    await antiFingerprint.varyDOMOperation(() => {
      parent.replaceChild(fragment, node);
    });
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
        this.createReplacementElement(data.original, data.translation)
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
  getStats(): { wordsAnalyzed: number; wordsReplaced: number; memoryUsage: number } {
    return {
      wordsAnalyzed: this.wordCounts.size,
      wordsReplaced: this.replacedWords.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  // Estimate memory usage
  private estimateMemoryUsage(): number {
    // Rough estimation
    const wordCountSize = this.wordCounts.size * 50; // ~50 bytes per entry
    const replacedSize = this.replacedWords.size * 20; // ~20 bytes per word
    return (wordCountSize + replacedSize) / 1024 / 1024; // MB
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