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

  // Comprehensive blacklist patterns
  const BLOCKED_PATTERNS = [
    // Banking and financial
    /\.bank/i, /banking/i, /paypal\.com$/, /venmo\.com$/, /coinbase\.com$/,
    /chase\.com$/, /wellsfargo\.com$/, /bankofamerica\.com$/, /citi\.com$/,
    
    // Government
    /\.gov$/, /\.gov\./, /\.mil$/,
    
    // Healthcare
    /healthcare/i, /hospital/i, /medical/i, /patient/i, /mychart/i,
    
    // Authentication
    /\/login/i, /\/signin/i, /\/signup/i, /\/auth/i,
    
    // Shopping checkout
    /checkout/i, /payment/i, /billing/i, /\/cart\//,
    
    // Developer
    /localhost/, /127\.0\.0\.1/, /0\.0\.0\.0/
  ];

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

  // ===== PageControl Class =====
  class PageControl {
    constructor(settings = {}) {
      this.settings = settings;
      this.isExpanded = false;
      this.element = null;
      this.menuElement = null;
      this.init();
    }

    init() {
      this.element = document.createElement('div');
      this.element.className = 'fluent-control';
      this.element.innerHTML = `
        <button class="fluent-control-button">
          <span class="fluent-control-flag">${this.getLanguageFlag()}</span>
        </button>
      `;

      this.menuElement = document.createElement('div');
      this.menuElement.className = 'fluent-control-menu';
      this.menuElement.innerHTML = this.renderMenu();
      this.element.appendChild(this.menuElement);

      document.body.appendChild(this.element);
      this.bindEvents();
    }

    getLanguageFlag() {
      const flags = { spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪' };
      return flags[this.settings.targetLanguage || 'spanish'] || '🌐';
    }

    renderMenu() {
      return `
        <div class="fluent-control-menu-section">
          <div class="fluent-control-menu-label">Language</div>
          <div class="fluent-control-language-buttons">
            <button class="fluent-control-lang-btn" data-lang="spanish">
              <span>🇪🇸</span><span>Spanish</span>
            </button>
            <button class="fluent-control-lang-btn" data-lang="french">
              <span>🇫🇷</span><span>French</span>
            </button>
            <button class="fluent-control-lang-btn" data-lang="german">
              <span>🇩🇪</span><span>German</span>
            </button>
          </div>
        </div>
        <div class="fluent-control-menu-divider"></div>
        <div class="fluent-control-menu-item" data-action="pause-site">
          <span>🚫</span><span>Pause this site</span>
        </div>
        <div class="fluent-control-menu-item" data-action="disable-site">
          <span>❌</span><span>Disable for this site</span>
        </div>
      `;
    }

    bindEvents() {
      const button = this.element.querySelector('.fluent-control-button');
      button.addEventListener('click', () => this.toggleMenu());

      this.menuElement.addEventListener('click', (e) => {
        const langBtn = e.target.closest('.fluent-control-lang-btn');
        if (langBtn) {
          this.changeLanguage(langBtn.dataset.lang);
        }
      });

      document.addEventListener('click', (e) => {
        if (!this.element.contains(e.target)) {
          this.closeMenu();
        }
      });
    }

    toggleMenu() {
      this.isExpanded = !this.isExpanded;
      this.menuElement.classList.toggle('visible', this.isExpanded);
    }

    closeMenu() {
      this.isExpanded = false;
      this.menuElement.classList.remove('visible');
    }

    changeLanguage(lang) {
      this.settings.targetLanguage = lang;
      this.element.querySelector('.fluent-control-flag').textContent = this.getLanguageFlag();
      this.closeMenu();
      // In production, this would notify the background script
      window.location.reload();
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
      /* Page control styles */
      .fluent-control {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
      }
      .fluent-control-button {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: white;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 2px solid #e5e7eb;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        transition: all 0.2s;
      }
      .fluent-control-button:hover {
        transform: scale(1.05);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      }
      .fluent-control-menu {
        position: absolute;
        bottom: 70px;
        right: 0;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        padding: 12px;
        min-width: 280px;
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        transition: all 0.2s;
        pointer-events: none;
      }
      .fluent-control-menu.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .fluent-control-menu-section {
        margin-bottom: 8px;
      }
      .fluent-control-menu-label {
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      .fluent-control-language-buttons {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .fluent-control-lang-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 6px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        font-size: 11px;
        color: #374151;
      }
      .fluent-control-lang-btn:hover {
        border-color: #3b82f6;
        background: #eff6ff;
      }
      .fluent-control-menu-divider {
        height: 1px;
        background: #e5e7eb;
        margin: 8px -12px;
      }
      .fluent-control-menu-item {
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: #374151;
      }
      .fluent-control-menu-item:hover {
        background: #f3f4f6;
      }
    `;
    document.head.appendChild(style);

    // Initialize tooltip
    new Tooltip();

    // Initialize page control
    new PageControl({ targetLanguage: 'spanish' });

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