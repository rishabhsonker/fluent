// Fluent Content Script - Single file version for Chrome Extension
// This file bundles all content script functionality

(function() {
  'use strict';

  // ===== Constants =====
  const CONFIG = {
    MAX_PROCESSING_TIME: 50,
    MAX_WORDS_PER_PAGE: 6,
    MIN_WORD_LENGTH: 4,
    MIN_WORD_OCCURRENCES: 2,
    MAX_WORD_OCCURRENCES: 4,
    DEBOUNCE_DELAY: 500,
  };

  const MOCK_TRANSLATIONS = {
    spanish: {
      'house': 'casa',
      'water': 'agua',
      'time': 'tiempo',
      'work': 'trabajo',
      'people': 'gente',
      'world': 'mundo',
      'life': 'vida',
      'problem': 'problema',
      'company': 'empresa',
      'government': 'gobierno'
    }
  };

  const SITE_CONFIGS = {
    'wikipedia.org': {
      contentSelector: '.mw-parser-output > p:not(.mw-empty-elt)',
      skipSelectors: ['.mw-editsection', '.reference', '.citation']
    },
    'reddit.com': {
      contentSelector: '[data-testid="comment"], .Post__title, .Comment__body',
      useMutationObserver: true
    },
    'default': {
      contentSelector: 'p, article, .content, .post, main',
      skipSelectors: ['script', 'style', 'pre', 'code', 'input', 'textarea']
    }
  };

  const BLOCKED_PATTERNS = [/\.gov$/, /bank/i, /health/i, /medical/i];

  // ===== Tooltip Class =====
  class Tooltip {
    constructor() {
      this.element = null;
      this.currentTarget = null;
      this.hideTimeout = null;
      this.init();
    }

    init() {
      this.element = document.createElement('div');
      this.element.className = 'fluent-tooltip';
      this.element.innerHTML = `
        <div class="fluent-tooltip-translation"></div>
        <div class="fluent-tooltip-original"></div>
      `;
      document.body.appendChild(this.element);
      this.bindEvents();
    }

    bindEvents() {
      document.addEventListener('mouseenter', (e) => {
        if (e.target.classList.contains('fluent-word')) {
          this.show(e.target);
        }
      }, true);

      document.addEventListener('mouseleave', (e) => {
        if (e.target.classList.contains('fluent-word')) {
          this.scheduleHide();
        }
      }, true);
    }

    show(target) {
      clearTimeout(this.hideTimeout);
      this.currentTarget = target;
      
      const original = target.getAttribute('data-original');
      const translation = target.getAttribute('data-translation');
      
      this.element.querySelector('.fluent-tooltip-translation').textContent = translation;
      this.element.querySelector('.fluent-tooltip-original').textContent = `"${original}" in English`;
      
      this.element.style.display = 'block';
      this.updatePosition();
      setTimeout(() => this.element.classList.add('visible'), 10);
    }

    updatePosition() {
      const rect = this.currentTarget.getBoundingClientRect();
      const tooltipRect = this.element.getBoundingClientRect();
      
      let top = rect.top - tooltipRect.height - 8;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      
      if (top < 10) top = rect.bottom + 8;
      if (left < 10) left = 10;
      
      this.element.style.left = `${left}px`;
      this.element.style.top = `${top}px`;
    }

    scheduleHide() {
      this.hideTimeout = setTimeout(() => {
        this.element.classList.remove('visible');
        setTimeout(() => {
          this.element.style.display = 'none';
        }, 200);
      }, 300);
    }
  }

  // ===== Word Replacer =====
  class WordReplacer {
    constructor() {
      this.wordCounts = new Map();
      this.replacedWords = new Set();
    }

    analyzeAndReplace(textNodes) {
      // Count word occurrences
      for (const node of textNodes) {
        const words = node.textContent.match(/\b[a-zA-Z][a-zA-Z']*\b/g) || [];
        for (const word of words) {
          if (this.isValidWord(word)) {
            const normalized = word.toLowerCase();
            this.wordCounts.set(normalized, (this.wordCounts.get(normalized) || 0) + 1);
          }
        }
      }

      // Select words to replace
      const wordsToReplace = this.selectWords();
      
      // Replace in DOM
      let replacedCount = 0;
      for (const node of textNodes) {
        if (replacedCount >= CONFIG.MAX_WORDS_PER_PAGE) break;
        
        const text = node.textContent;
        let hasReplacement = false;
        let newHTML = text;
        
        for (const word of wordsToReplace) {
          if (replacedCount >= CONFIG.MAX_WORDS_PER_PAGE) break;
          
          const regex = new RegExp(`\\b${word}\\b`, 'gi');
          const match = regex.exec(text);
          
          if (match && !this.replacedWords.has(word)) {
            const translation = MOCK_TRANSLATIONS.spanish[word] || word;
            const span = `<span class="fluent-word" data-original="${match[0]}" data-translation="${translation}">${translation}</span>`;
            
            newHTML = newHTML.substring(0, match.index) + span + newHTML.substring(match.index + match[0].length);
            hasReplacement = true;
            replacedCount++;
            this.replacedWords.add(word);
            break;
          }
        }
        
        if (hasReplacement && node.parentElement) {
          const newNode = document.createElement('span');
          newNode.innerHTML = newHTML;
          node.parentElement.replaceChild(newNode, node);
        }
      }
      
      return replacedCount;
    }

    isValidWord(word) {
      return word.length >= CONFIG.MIN_WORD_LENGTH && 
             !/^(the|and|for|are|but|not|you|all|that|this)$/i.test(word);
    }

    selectWords() {
      const candidates = [];
      for (const [word, count] of this.wordCounts.entries()) {
        if (count >= CONFIG.MIN_WORD_OCCURRENCES && count <= CONFIG.MAX_WORD_OCCURRENCES) {
          candidates.push(word);
        }
      }
      return candidates.slice(0, CONFIG.MAX_WORDS_PER_PAGE);
    }
  }

  // ===== Main Processing =====
  function shouldProcessSite() {
    const hostname = window.location.hostname;
    return !BLOCKED_PATTERNS.some(pattern => pattern.test(hostname));
  }

  function getSiteConfig() {
    const hostname = window.location.hostname;
    for (const [site, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) return config;
    }
    return SITE_CONFIGS.default;
  }

  function processContent() {
    try {
      const startTime = performance.now();
      
      if (!shouldProcessSite()) {
        // Site blocked - exit silently
        return;
      }

      const config = getSiteConfig();
      const textNodes = [];
      
      // Collect text nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            try {
              if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
              if (!node.parentElement) return NodeFilter.FILTER_REJECT;
              const skipSelectors = config.skipSelectors || [];
              if (skipSelectors.length > 0 && node.parentElement.closest(skipSelectors.join(','))) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            } catch (e) {
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );

      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node);
        if (textNodes.length > 100) break; // Limit for performance
      }

      // Process nodes
      if (textNodes.length > 0) {
        const replacer = new WordReplacer();
        const count = replacer.analyzeAndReplace(textNodes);
        // Performance tracking: Replaced ${count} words in ${performance.now() - startTime}ms
      }
    } catch (error) {
      // Silent fail - never break the host page
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'ERROR_LOG',
          message: error.message,
          stack: error.stack
        }).catch(() => {});
      }
    }
  }

  // ===== Initialize =====
  function init() {
    // Load styles
    const style = document.createElement('style');
    style.textContent = `
      .fluent-word {
        color: #3b82f6 !important;
        text-decoration: underline dotted !important;
        cursor: help !important;
      }
      .fluent-tooltip {
        position: absolute;
        z-index: 2147483647;
        background: #1f2937;
        color: white;
        padding: 12px;
        border-radius: 8px;
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
        max-width: 250px;
      }
      .fluent-tooltip.visible {
        opacity: 1;
      }
      .fluent-tooltip-translation {
        font-weight: bold;
        margin-bottom: 4px;
      }
      .fluent-tooltip-original {
        font-size: 12px;
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);

    // Initialize tooltip
    new Tooltip();

    // Process content
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', processContent);
    } else {
      requestIdleCallback ? requestIdleCallback(processContent) : setTimeout(processContent, 0);
    }
  }

  // Start
  init();

})();