// Word Replacer Module - Smart word selection and replacement
'use strict';

export class WordReplacer {
  constructor(config) {
    this.config = config;
    this.wordCounts = new Map();
    this.replacedWords = new Set();
    this.replacementElements = new WeakMap();
  }

  // Analyze text and find suitable words for replacement
  analyzeText(textNodes) {
    const startTime = performance.now();
    
    // First pass: collect word frequencies
    for (const node of textNodes) {
      const text = node.textContent;
      const words = this.extractWords(text);
      
      for (const word of words) {
        if (this.isValidWord(word)) {
          const normalized = word.toLowerCase();
          this.wordCounts.set(normalized, (this.wordCounts.get(normalized) || 0) + 1);
        }
      }
      
      // Performance check
      if (performance.now() - startTime > 20) break;
    }
    
    // Select best words for replacement
    return this.selectWordsForReplacement();
  }

  // Extract words from text using regex
  extractWords(text) {
    // Match words including contractions but exclude URLs and numbers
    return text.match(/\b[a-zA-Z][a-zA-Z']*\b/g) || [];
  }

  // Check if word is valid for replacement
  isValidWord(word) {
    if (word.length < this.config.MIN_WORD_LENGTH) return false;
    if (/^(the|and|for|are|but|not|you|all|that|this|with|from)$/i.test(word)) return false;
    if (/^[A-Z][a-z]*$/.test(word) && word.length < 6) return false; // Skip short proper nouns
    return true;
  }

  // Select optimal words for replacement
  selectWordsForReplacement() {
    const candidates = [];
    
    // Filter words by occurrence count
    for (const [word, count] of this.wordCounts.entries()) {
      if (count >= this.config.MIN_WORD_OCCURRENCES && 
          count <= this.config.MAX_WORD_OCCURRENCES) {
        candidates.push({
          word,
          count,
          score: this.calculateWordScore(word, count)
        });
      }
    }
    
    // Sort by score and select top words
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, this.config.MAX_WORDS_PER_PAGE).map(c => c.word);
  }

  // Calculate word learning score
  calculateWordScore(word, count) {
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
  replaceWords(textNodes, wordsToReplace, translations) {
    const startTime = performance.now();
    let replacementCount = 0;
    const processedPositions = new Set();
    
    for (const node of textNodes) {
      if (replacementCount >= this.config.MAX_WORDS_PER_PAGE) break;
      if (performance.now() - startTime > 30) break; // Performance guard
      
      const text = node.textContent;
      let newContent = text;
      let hasReplacement = false;
      
      // Process each word to replace
      for (const word of wordsToReplace) {
        if (replacementCount >= this.config.MAX_WORDS_PER_PAGE) break;
        
        // Create regex for whole word matching
        const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          const position = `${node}:${match.index}`;
          
          // Skip if already processed this position
          if (processedPositions.has(position)) continue;
          processedPositions.add(position);
          
          // Skip if too many replacements
          if (this.replacedWords.has(word.toLowerCase())) {
            if (replacementCount >= this.config.MAX_WORDS_PER_PAGE) break;
          }
          
          // Create replacement span
          const translation = translations[word.toLowerCase()] || word;
          const originalWord = match[0];
          const replacementHtml = this.createReplacementElement(originalWord, translation);
          
          // Mark for replacement
          newContent = newContent.substring(0, match.index) + 
                      `{{FLUENT_${replacementCount}}}` + 
                      newContent.substring(match.index + originalWord.length);
          
          hasReplacement = true;
          replacementCount++;
          this.replacedWords.add(word.toLowerCase());
          break; // Only replace first occurrence in this node
        }
      }
      
      // Apply replacements if any
      if (hasReplacement) {
        this.applyReplacements(node, newContent);
      }
    }
    
    return replacementCount;
  }

  // Create replacement element HTML
  createReplacementElement(original, translation) {
    return `<span class="fluent-word" 
      data-original="${this.escapeHtml(original)}" 
      data-translation="${this.escapeHtml(translation)}"
      tabindex="0"
      role="button"
      aria-label="Translation: ${original} means ${translation}">
      ${this.escapeHtml(translation)}
    </span>`;
  }

  // Apply replacements to DOM
  applyReplacements(node, newContent) {
    const parent = node.parentElement;
    if (!parent) return;
    
    // Create a temporary container
    const temp = document.createElement('div');
    temp.innerHTML = newContent;
    
    // Replace placeholders with actual spans
    let html = temp.innerHTML;
    for (let i = 0; i < 10; i++) {
      const placeholder = `{{FLUENT_${i}}}`;
      if (html.includes(placeholder)) {
        const span = this.createReplacementElement('word', 'translation');
        html = html.replace(placeholder, span);
      }
    }
    
    // Create fragment and replace node
    const fragment = document.createRange().createContextualFragment(html);
    parent.replaceChild(fragment, node);
  }

  // Utility: Escape regex special characters
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Utility: Escape HTML
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Get performance stats
  getStats() {
    return {
      wordsAnalyzed: this.wordCounts.size,
      wordsReplaced: this.replacedWords.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  // Estimate memory usage
  estimateMemoryUsage() {
    // Rough estimation
    const wordCountSize = this.wordCounts.size * 50; // ~50 bytes per entry
    const replacedSize = this.replacedWords.size * 20; // ~20 bytes per word
    return (wordCountSize + replacedSize) / 1024 / 1024; // MB
  }

  // Cleanup
  cleanup() {
    this.wordCounts.clear();
    this.replacedWords.clear();
    this.replacementElements = new WeakMap();
  }
}