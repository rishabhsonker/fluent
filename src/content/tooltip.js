// Lightweight Tooltip Module - Pure vanilla JS, no dependencies
'use strict';

export class Tooltip {
  constructor() {
    this.element = null;
    this.currentTarget = null;
    this.hideTimeout = null;
    this.showTimeout = null;
    this.isVisible = false;
    
    this.init();
  }

  init() {
    // Create tooltip element
    this.element = document.createElement('div');
    this.element.className = 'fluent-tooltip';
    this.element.setAttribute('role', 'tooltip');
    this.element.style.display = 'none';
    
    // Structure
    this.element.innerHTML = `
      <div class="fluent-tooltip-header">
        <span class="fluent-tooltip-flag"></span>
        <span class="fluent-tooltip-language"></span>
      </div>
      <div class="fluent-tooltip-translation"></div>
      <div class="fluent-tooltip-original"></div>
      <div class="fluent-tooltip-actions">
        <button class="fluent-tooltip-btn fluent-tooltip-pronunciation" aria-label="Play pronunciation">
          🔊 Pronunciation
        </button>
      </div>
    `;
    
    // Add to body
    document.body.appendChild(this.element);
    
    // Bind events
    this.bindEvents();
  }

  bindEvents() {
    // Hover events on replaced words
    document.addEventListener('mouseenter', (e) => {
      if (e.target.classList.contains('fluent-word')) {
        this.showForElement(e.target);
      }
    }, true);

    document.addEventListener('mouseleave', (e) => {
      if (e.target.classList.contains('fluent-word')) {
        this.scheduleHide();
      }
    }, true);

    // Keep tooltip visible when hovering over it
    this.element.addEventListener('mouseenter', () => {
      this.cancelHide();
    });

    this.element.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    // Keyboard support
    document.addEventListener('focus', (e) => {
      if (e.target.classList.contains('fluent-word')) {
        this.showForElement(e.target);
      }
    }, true);

    document.addEventListener('blur', (e) => {
      if (e.target.classList.contains('fluent-word')) {
        this.scheduleHide();
      }
    }, true);

    // Pronunciation button
    this.element.querySelector('.fluent-tooltip-pronunciation').addEventListener('click', () => {
      this.playPronunciation();
    });

    // Hide on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      if (this.isVisible) {
        this.element.style.opacity = '0.3';
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (this.isVisible) {
            this.updatePosition();
            this.element.style.opacity = '1';
          }
        }, 150);
      }
    }, { passive: true });

    // Hide on window resize
    window.addEventListener('resize', () => {
      if (this.isVisible) {
        this.hide();
      }
    }, { passive: true });
  }

  showForElement(element) {
    // Cancel any pending hide
    this.cancelHide();
    
    // Cancel any pending show (debounce)
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }

    // Delay show slightly for better UX
    this.showTimeout = setTimeout(() => {
      this.currentTarget = element;
      
      // Get data
      const original = element.getAttribute('data-original');
      const translation = element.getAttribute('data-translation');
      const language = this.getCurrentLanguage();
      
      // Update content
      this.updateContent(original, translation, language);
      
      // Show and position
      this.show();
      this.updatePosition();
    }, 200);
  }

  updateContent(original, translation, language) {
    const languageInfo = this.getLanguageInfo(language);
    
    this.element.querySelector('.fluent-tooltip-flag').textContent = languageInfo.flag;
    this.element.querySelector('.fluent-tooltip-language').textContent = languageInfo.name;
    this.element.querySelector('.fluent-tooltip-translation').textContent = translation;
    this.element.querySelector('.fluent-tooltip-original').textContent = `"${original}" in English`;
  }

  getCurrentLanguage() {
    // This would normally come from settings
    return 'spanish';
  }

  getLanguageInfo(language) {
    const languages = {
      spanish: { name: 'Spanish', flag: '🇪🇸' },
      french: { name: 'French', flag: '🇫🇷' },
      german: { name: 'German', flag: '🇩🇪' }
    };
    return languages[language] || languages.spanish;
  }

  show() {
    this.element.style.display = 'block';
    // Force reflow
    void this.element.offsetHeight;
    this.element.classList.add('visible');
    this.isVisible = true;
  }

  hide() {
    this.element.classList.remove('visible');
    this.isVisible = false;
    
    // Hide after transition
    setTimeout(() => {
      if (!this.isVisible) {
        this.element.style.display = 'none';
        this.currentTarget = null;
      }
    }, 200);
  }

  scheduleHide() {
    this.cancelHide();
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, 300);
  }

  cancelHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  updatePosition() {
    if (!this.currentTarget || !this.isVisible) return;

    const targetRect = this.currentTarget.getBoundingClientRect();
    const tooltipRect = this.element.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // Calculate position (above the word by default)
    let top = targetRect.top - tooltipRect.height - 8;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Flip to bottom if not enough space above
    if (top < 10) {
      top = targetRect.bottom + 8;
      this.element.classList.add('bottom');
    } else {
      this.element.classList.remove('bottom');
    }

    // Keep within viewport horizontally
    if (left < 10) {
      left = 10;
    } else if (left + tooltipRect.width > viewport.width - 10) {
      left = viewport.width - tooltipRect.width - 10;
    }

    // Apply position
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  async playPronunciation() {
    if (!this.currentTarget) return;

    const translation = this.currentTarget.getAttribute('data-translation');
    const language = this.getCurrentLanguage();

    // For now, use the Web Speech API as a fallback
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(translation);
      
      // Set language
      const langCodes = {
        spanish: 'es-ES',
        french: 'fr-FR',
        german: 'de-DE'
      };
      utterance.lang = langCodes[language] || 'es-ES';
      utterance.rate = 0.9;
      
      speechSynthesis.speak(utterance);
      
      // Visual feedback
      const btn = this.element.querySelector('.fluent-tooltip-pronunciation');
      btn.textContent = '🔊 Playing...';
      setTimeout(() => {
        btn.textContent = '🔊 Pronunciation';
      }, 1000);
    }
  }

  destroy() {
    // Clean up event listeners
    if (this.showTimeout) clearTimeout(this.showTimeout);
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    
    // Remove from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    this.element = null;
    this.currentTarget = null;
  }
}

// Create and export singleton instance
let tooltipInstance = null;

export function initTooltip() {
  if (!tooltipInstance) {
    tooltipInstance = new Tooltip();
  }
  return tooltipInstance;
}

export function destroyTooltip() {
  if (tooltipInstance) {
    tooltipInstance.destroy();
    tooltipInstance = null;
  }
}