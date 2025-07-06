// Fluent Content Script - Performance-first design
// Target: <50ms processing time, <30MB memory usage

(async function() {
  'use strict';

  // Performance monitoring
  const startTime = performance.now();
  
  // Configuration
  const CONFIG = {
    MAX_PROCESSING_TIME: 50, // ms
    MAX_WORDS_PER_PAGE: 6,
    MIN_WORD_LENGTH: 4,
    MIN_WORD_OCCURRENCES: 2,
    MAX_WORD_OCCURRENCES: 4,
    DEBOUNCE_DELAY: 500, // ms for mutation observer
  };

  // Site-specific configurations
  const SITE_CONFIGS = {
    'wikipedia.org': {
      contentSelector: '.mw-parser-output > p:not(.mw-empty-elt)',
      skipSelectors: ['.mw-editsection', '.reference', '.citation']
    },
    'reddit.com': {
      contentSelector: '[data-testid="comment"], .Post__title, .Comment__body',
      useMutationObserver: true
    },
    'medium.com': {
      contentSelector: 'article p',
      skipSelectors: ['pre', 'code']
    },
    'github.com': {
      contentSelector: '.markdown-body p, .comment-body p',
      skipSelectors: ['pre', 'code', '.blob-code', '.highlight']
    },
    'default': {
      contentSelector: 'p, article, .content, .post, main',
      skipSelectors: ['script', 'style', 'pre', 'code', 'input', 'textarea', 'select']
    }
  };

  // Blocked patterns for sensitive sites
  const BLOCKED_PATTERNS = [
    /\.gov$/,
    /bank/i,
    /health/i,
    /medical/i,
    /paypal/i,
    /stripe/i
  ];

  // Check if site should be processed
  function shouldProcessSite() {
    const hostname = window.location.hostname;
    return !BLOCKED_PATTERNS.some(pattern => pattern.test(hostname));
  }

  // Get site-specific configuration
  function getSiteConfig() {
    const hostname = window.location.hostname;
    for (const [site, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) {
        return config;
      }
    }
    return SITE_CONFIGS.default;
  }

  // Check if element should be skipped
  function shouldSkipElement(element) {
    const skipSelectors = getSiteConfig().skipSelectors || [];
    if (!element || !element.parentElement) return true;
    
    // Check if element or any parent matches skip selectors
    for (const selector of skipSelectors) {
      if (element.matches && element.matches(selector)) return true;
      if (element.closest && element.closest(selector)) return true;
    }
    
    // Skip if inside contenteditable
    if (element.isContentEditable || element.closest('[contenteditable="true"]')) {
      return true;
    }
    
    return false;
  }

  // Main processing function
  function processContent() {
    if (!shouldProcessSite()) {
      console.log('Fluent: Site blocked by security policy');
      return;
    }

    const config = getSiteConfig();
    const processedNodes = new WeakSet();
    let wordsReplaced = 0;
    
    // Get all text nodes efficiently using TreeWalker
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Quick performance check
          if (performance.now() - startTime > CONFIG.MAX_PROCESSING_TIME) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if already processed
          if (processedNodes.has(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip empty or whitespace-only nodes
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if parent should be skipped
          if (shouldSkipElement(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Check if node is in configured content area
          const parent = node.parentElement;
          if (config.contentSelector && !parent.closest(config.contentSelector)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // Collect text nodes
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
      processedNodes.add(node);
      
      // Stop if we've processed enough
      if (wordsReplaced >= CONFIG.MAX_WORDS_PER_PAGE) break;
    }

    // Process collected nodes
    if (textNodes.length > 0) {
      console.log(`Fluent: Processing ${textNodes.length} text nodes`);
      
      // Import and use word replacer
      import('./replacer.js').then(module => {
        const { WordReplacer } = module;
        const replacer = new WordReplacer(CONFIG);
        
        // Get mock translations for now
        import('../lib/constants.js').then(constants => {
          const language = 'spanish'; // Default for now
          const translations = constants.MOCK_TRANSLATIONS[language] || {};
          
          // Analyze and select words
          const wordsToReplace = replacer.analyzeText(textNodes);
          console.log(`Fluent: Selected ${wordsToReplace.length} words for replacement`);
          
          // Replace words
          const replacedCount = replacer.replaceWords(textNodes, wordsToReplace, translations);
          console.log(`Fluent: Replaced ${replacedCount} words`);
          
          // Cleanup
          replacer.cleanup();
        });
      }).catch(err => {
        console.error('Fluent: Error loading replacer', err);
      });
    }

    // Report performance
    const processingTime = performance.now() - startTime;
    console.log(`Fluent: Processed in ${processingTime.toFixed(2)}ms`);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processContent);
  } else {
    // Use requestIdleCallback for better performance
    if ('requestIdleCallback' in window) {
      requestIdleCallback(processContent, { timeout: 100 });
    } else {
      setTimeout(processContent, 0);
    }
  }

  // Set up MutationObserver for SPAs
  const config = getSiteConfig();
  if (config.useMutationObserver) {
    let observerTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(processContent, { timeout: 100 });
        } else {
          processContent();
        }
      }, CONFIG.DEBOUNCE_DELAY);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    });
  }

  // Expose API for testing
  window.__fluent = {
    processContent,
    CONFIG
  };

})();