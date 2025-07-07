// Lightweight Tooltip Module - Pure vanilla JS, no dependencies
'use strict';

import { logger } from '../lib/logger';
import { TIMING } from '../lib/constants';
import { antiFingerprint } from '../lib/antiFingerprintManager';
import type { LanguageCode, WordProgress, ContextExplanation, MessageResponse } from '../types';

interface LanguageInfo {
  name: string;
  flag: string;
}

interface EventHandlers {
  documentMouseEnter: ((e: MouseEvent) => void) | null;
  documentMouseLeave: ((e: MouseEvent) => void) | null;
  documentFocus: ((e: FocusEvent) => void) | null;
  documentBlur: ((e: FocusEvent) => void) | null;
  tooltipMouseEnter: (() => void) | null;
  tooltipMouseLeave: (() => void) | null;
  pronunciationClick: (() => void) | null;
  contextClick: (() => void) | null;
  windowScroll: (() => void) | null;
  windowResize: (() => void) | null;
}

interface Storage {
  recordWordInteraction(word: string, language: LanguageCode, interactionType: 'hover' | 'pronunciation' | 'context'): Promise<WordProgress>;
  getWordProgress(word: string, language: LanguageCode): Promise<WordProgress | null>;
}

export class Tooltip {
  private element: HTMLDivElement | null = null;
  private currentTarget: HTMLElement | null = null;
  private hideTimeout: number | null = null;
  private showTimeout: number | null = null;
  private isVisible: boolean = false;
  public storage: Storage | null = null; // Will be injected
  public currentLanguage: LanguageCode | null = null; // Will be set
  
  // Store bound event handlers for cleanup
  private eventHandlers: EventHandlers = {
    documentMouseEnter: null,
    documentMouseLeave: null,
    documentFocus: null,
    documentBlur: null,
    tooltipMouseEnter: null,
    tooltipMouseLeave: null,
    pronunciationClick: null,
    contextClick: null,
    windowScroll: null,
    windowResize: null
  };
  
  // Scroll timeout reference
  private scrollTimeout: number | null = null;
  
  constructor() {
    this.init();
  }

  private init(): void {
    // Create tooltip element
    this.element = document.createElement('div');
    this.element.className = 'fluent-tooltip';
    this.element.setAttribute('role', 'tooltip');
    this.element.style.display = 'none';
    
    // Build DOM structure safely
    this.buildTooltipDOM();
    
    // Add to body
    document.body.appendChild(this.element);
    
    // Bind events
    this.bindEvents();
  }
  
  private buildTooltipDOM(): void {
    if (!this.element) return;

    // Header
    const header = document.createElement('div');
    header.className = 'fluent-tooltip-header';
    
    const flag = document.createElement('span');
    flag.className = 'fluent-tooltip-flag';
    header.appendChild(flag);
    
    const language = document.createElement('span');
    language.className = 'fluent-tooltip-language';
    header.appendChild(language);
    
    this.element.appendChild(header);
    
    // Translation
    const translation = document.createElement('div');
    translation.className = 'fluent-tooltip-translation';
    this.element.appendChild(translation);
    
    // Original
    const original = document.createElement('div');
    original.className = 'fluent-tooltip-original';
    this.element.appendChild(original);
    
    // Progress
    const progress = document.createElement('div');
    progress.className = 'fluent-tooltip-progress';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'fluent-tooltip-progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'fluent-tooltip-progress-fill';
    progressBar.appendChild(progressFill);
    
    progress.appendChild(progressBar);
    
    const progressText = document.createElement('span');
    progressText.className = 'fluent-tooltip-progress-text';
    progress.appendChild(progressText);
    
    this.element.appendChild(progress);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'fluent-tooltip-actions';
    
    const pronunciationBtn = document.createElement('button');
    pronunciationBtn.className = 'fluent-tooltip-btn fluent-tooltip-pronunciation';
    pronunciationBtn.setAttribute('aria-label', 'Play pronunciation');
    pronunciationBtn.textContent = '🔊 Pronunciation';
    actions.appendChild(pronunciationBtn);
    
    const contextBtn = document.createElement('button');
    contextBtn.className = 'fluent-tooltip-btn fluent-tooltip-context';
    contextBtn.setAttribute('aria-label', 'Why this translation?');
    contextBtn.textContent = '💡 Why?';
    actions.appendChild(contextBtn);
    
    this.element.appendChild(actions);
    
    // Context panel
    const contextPanel = document.createElement('div');
    contextPanel.className = 'fluent-tooltip-context-panel';
    contextPanel.style.display = 'none';
    
    const contextContent = document.createElement('div');
    contextContent.className = 'fluent-tooltip-context-content';
    contextPanel.appendChild(contextContent);
    
    this.element.appendChild(contextPanel);
  }

  private bindEvents(): void {
    if (!this.element) return;

    // Create bound event handlers
    this.eventHandlers.documentMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('fluent-word')) {
        this.showForElement(target);
      }
    };
    
    this.eventHandlers.documentMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('fluent-word')) {
        this.scheduleHide();
      }
    };
    
    this.eventHandlers.tooltipMouseEnter = () => {
      this.cancelHide();
    };
    
    this.eventHandlers.tooltipMouseLeave = () => {
      this.scheduleHide();
    };
    
    this.eventHandlers.documentFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('fluent-word')) {
        this.showForElement(target);
      }
    };
    
    this.eventHandlers.documentBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('fluent-word')) {
        this.scheduleHide();
      }
    };
    
    this.eventHandlers.pronunciationClick = () => {
      this.playPronunciation();
    };
    
    this.eventHandlers.contextClick = () => {
      this.toggleContext();
    };
    
    this.eventHandlers.windowScroll = () => {
      if (this.isVisible && this.element) {
        this.element.style.opacity = '0.3';
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        this.scrollTimeout = window.setTimeout(() => {
          if (this.isVisible && this.element) {
            this.updatePosition();
            this.element.style.opacity = '1';
          }
        }, 150);
      }
    };
    
    this.eventHandlers.windowResize = () => {
      if (this.isVisible) {
        this.hide();
      }
    };
    
    // Attach events
    document.addEventListener('mouseenter', this.eventHandlers.documentMouseEnter, true);
    document.addEventListener('mouseleave', this.eventHandlers.documentMouseLeave, true);
    document.addEventListener('focus', this.eventHandlers.documentFocus, true);
    document.addEventListener('blur', this.eventHandlers.documentBlur, true);
    
    this.element.addEventListener('mouseenter', this.eventHandlers.tooltipMouseEnter);
    this.element.addEventListener('mouseleave', this.eventHandlers.tooltipMouseLeave);
    
    const pronunciationBtn = this.element.querySelector('.fluent-tooltip-pronunciation') as HTMLButtonElement;
    const contextBtn = this.element.querySelector('.fluent-tooltip-context') as HTMLButtonElement;
    
    if (pronunciationBtn) {
      pronunciationBtn.addEventListener('click', this.eventHandlers.pronunciationClick);
    }
    if (contextBtn) {
      contextBtn.addEventListener('click', this.eventHandlers.contextClick);
    }
    
    window.addEventListener('scroll', this.eventHandlers.windowScroll, { passive: true });
    window.addEventListener('resize', this.eventHandlers.windowResize, { passive: true });
  }

  private showForElement(element: HTMLElement): void {
    // Cancel any pending hide
    this.cancelHide();
    
    // Cancel any pending show (debounce)
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }

    // Delay show with anti-fingerprinting variance
    const delay = antiFingerprint.varyNumber(TIMING.TOOLTIP_SHOW_DELAY_MS, 0.3);
    
    this.showTimeout = window.setTimeout(async () => {
      this.currentTarget = element;
      
      // Add random micro-delay
      await antiFingerprint.addRandomDelay('tooltipShow');
      
      // Get data (check for randomized attribute names)
      const original = element.getAttribute('data-original') || 
                      element.getAttribute('data-fluent-original') ||
                      element.getAttribute('data-source');
      const translation = element.getAttribute('data-translation') || 
                         element.getAttribute('data-fluent-translation') ||
                         element.getAttribute('data-trans');
      
      if (!original || !translation) return;
      
      const language = this.getCurrentLanguage();
      
      // Track interaction for spaced repetition
      if (this.storage && this.currentLanguage) {
        try {
          await this.storage.recordWordInteraction(
            original.toLowerCase(),
            this.currentLanguage,
            'hover'
          );
        } catch (error) {
          logger.error('Failed to record interaction:', error);
        }
      }
      
      // Update content (now async)
      await this.updateContent(original, translation, language);
      
      // Show and position
      this.show();
      this.updatePosition();
    }, delay);
  }

  private async updateContent(original: string, translation: string, language: LanguageCode): Promise<void> {
    if (!this.element) return;

    const languageInfo = this.getLanguageInfo(language);
    
    const flagElement = this.element.querySelector('.fluent-tooltip-flag');
    const languageElement = this.element.querySelector('.fluent-tooltip-language');
    const translationElement = this.element.querySelector('.fluent-tooltip-translation');
    const originalElement = this.element.querySelector('.fluent-tooltip-original');

    if (flagElement) flagElement.textContent = languageInfo.flag;
    if (languageElement) languageElement.textContent = languageInfo.name;
    if (translationElement) translationElement.textContent = translation;
    if (originalElement) originalElement.textContent = `"${original}" in English`;
    
    // Update progress if storage is available
    if (this.storage && this.currentLanguage) {
      try {
        const wordData = await this.storage.getWordProgress(original.toLowerCase(), this.currentLanguage);
        if (wordData && wordData.mastery !== undefined) {
          const progressFill = this.element.querySelector('.fluent-tooltip-progress-fill') as HTMLDivElement;
          const progressText = this.element.querySelector('.fluent-tooltip-progress-text') as HTMLSpanElement;
          const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          
          if (progressFill && progressText) {
            progressFill.style.width = `${wordData.mastery}%`;
            
            // Set color based on mastery
            if (wordData.mastery >= 80) {
              progressFill.style.backgroundColor = '#10b981'; // Green
              progressText.textContent = 'Mastered';
            } else if (wordData.mastery >= 50) {
              progressFill.style.backgroundColor = '#f59e0b'; // Yellow
              progressText.textContent = 'Learning';
            } else {
              progressFill.style.backgroundColor = '#3b82f6'; // Blue
              progressText.textContent = 'New';
            }
          }
          
          // Show progress bar
          if (progressContainer) {
            progressContainer.style.display = 'block';
          }
        } else {
          // Hide progress for new words
          const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          if (progressContainer) {
            progressContainer.style.display = 'none';
          }
        }
      } catch (error) {
        logger.error('Failed to get word progress:', error);
        const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
      }
    }
  }

  private getCurrentLanguage(): LanguageCode {
    // This would normally come from settings
    return this.currentLanguage || 'spanish';
  }

  private getLanguageInfo(language: LanguageCode): LanguageInfo {
    const languages: Record<LanguageCode, LanguageInfo> = {
      spanish: { name: 'Spanish', flag: '🇪🇸' },
      french: { name: 'French', flag: '🇫🇷' },
      german: { name: 'German', flag: '🇩🇪' }
    };
    return languages[language] || languages.spanish;
  }

  private show(): void {
    if (!this.element) return;
    
    this.element.style.display = 'block';
    // Force reflow
    void this.element.offsetHeight;
    this.element.classList.add('visible');
    this.isVisible = true;
  }

  private hide(): void {
    if (!this.element) return;

    this.element.classList.remove('visible');
    this.isVisible = false;
    
    // Hide after transition
    setTimeout(() => {
      if (!this.isVisible && this.element) {
        this.element.style.display = 'none';
        this.currentTarget = null;
      }
    }, 200);
  }

  private scheduleHide(): void {
    this.cancelHide();
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 300);
  }

  private cancelHide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private updatePosition(): void {
    if (!this.currentTarget || !this.isVisible || !this.element) return;

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

  private async playPronunciation(): Promise<void> {
    if (!this.currentTarget || !this.element) return;

    const original = this.currentTarget.getAttribute('data-original');
    const translation = this.currentTarget.getAttribute('data-translation');
    
    if (!original || !translation) return;
    
    const language = this.getCurrentLanguage();

    // Track pronunciation interaction
    if (this.storage && this.currentLanguage) {
      try {
        await this.storage.recordWordInteraction(
          original.toLowerCase(),
          this.currentLanguage,
          'pronunciation'
        );
      } catch (error) {
        logger.error('Failed to record interaction:', error);
      }
    }

    // For now, use the Web Speech API as a fallback
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(translation);
      
      // Set language
      const langCodes: Record<LanguageCode, string> = {
        spanish: 'es-ES',
        french: 'fr-FR',
        german: 'de-DE'
      };
      utterance.lang = langCodes[language] || 'es-ES';
      utterance.rate = 0.9;
      
      speechSynthesis.speak(utterance);
      
      // Visual feedback
      const btn = this.element.querySelector('.fluent-tooltip-pronunciation') as HTMLButtonElement;
      if (btn) {
        btn.textContent = '🔊 Playing...';
        setTimeout(() => {
          btn.textContent = '🔊 Pronunciation';
        }, 1000);
      }
    }
  }

  private async toggleContext(): Promise<void> {
    if (!this.element) return;

    const panel = this.element.querySelector('.fluent-tooltip-context-panel') as HTMLDivElement;
    const content = this.element.querySelector('.fluent-tooltip-context-content') as HTMLDivElement;
    const btn = this.element.querySelector('.fluent-tooltip-context') as HTMLButtonElement;
    
    if (!panel || !content || !btn) return;

    if (panel.style.display === 'none') {
      // Show context
      panel.style.display = 'block';
      btn.textContent = '💡 Loading...';
      
      // Track context interaction
      if (this.storage && this.currentLanguage && this.currentTarget) {
        const original = this.currentTarget.getAttribute('data-original');
        if (original) {
          try {
            await this.storage.recordWordInteraction(
              original.toLowerCase(),
              this.currentLanguage,
              'context'
            );
          } catch (error) {
            logger.error('Failed to record interaction:', error);
          }
        }
      }
      
      // Get context explanation
      const explanation = await this.getContextExplanation();
      
      // Clear previous content
      content.textContent = '';
      
      if (explanation) {
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'fluent-context-explanation';
        explanationDiv.textContent = explanation.explanation;
        content.appendChild(explanationDiv);
        
        if (explanation.example) {
          const exampleDiv = document.createElement('div');
          exampleDiv.className = 'fluent-context-example';
          const strong = document.createElement('strong');
          strong.textContent = 'Example: ';
          exampleDiv.appendChild(strong);
          exampleDiv.appendChild(document.createTextNode(explanation.example));
          content.appendChild(exampleDiv);
        }
        
        if (explanation.tip) {
          const tipDiv = document.createElement('div');
          tipDiv.className = 'fluent-context-tip';
          const strong = document.createElement('strong');
          strong.textContent = 'Tip: ';
          tipDiv.appendChild(strong);
          tipDiv.appendChild(document.createTextNode(explanation.tip));
          content.appendChild(tipDiv);
        }
      } else {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fluent-context-error';
        errorDiv.textContent = 'Unable to load explanation. Daily limit may be reached.';
        content.appendChild(errorDiv);
      }
      
      btn.textContent = '💡 Hide';
      this.updatePosition(); // Reposition tooltip
    } else {
      // Hide context
      panel.style.display = 'none';
      btn.textContent = '💡 Why?';
      this.updatePosition();
    }
  }

  private async getContextExplanation(): Promise<ContextExplanation | null> {
    if (!this.currentTarget) return null;
    
    const original = this.currentTarget.getAttribute('data-original');
    const translation = this.currentTarget.getAttribute('data-translation');
    
    if (!original || !translation) return null;
    
    const language = this.getCurrentLanguage();
    
    // Get surrounding sentence for context
    const sentence = this.getWordContext(this.currentTarget);
    
    try {
      // Request context from background
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CONTEXT_EXPLANATION',
        word: original,
        translation: translation,
        language: language,
        sentence: sentence
      }) as MessageResponse;
      
      return response.data as ContextExplanation;
    } catch (error) {
      logger.error('Error getting context:', error);
      return null;
    }
  }

  private getWordContext(element: HTMLElement): string {
    // Get the parent text node or container
    let container: HTMLElement | null = element.parentElement;
    while (container && container.textContent && container.textContent.length < 50) {
      container = container.parentElement;
    }
    
    if (!container || !container.textContent) return '';
    
    // Extract sentence around the word
    const text = container.textContent;
    const wordIndex = text.indexOf(element.textContent || '');
    
    if (wordIndex === -1) return text.slice(0, 100);
    
    // Find sentence boundaries
    let start = wordIndex;
    let end = wordIndex + (element.textContent?.length || 0);
    
    // Look backwards for sentence start
    while (start > 0 && !'.!?'.includes(text[start - 1])) {
      start--;
    }
    
    // Look forwards for sentence end
    while (end < text.length && !'.!?'.includes(text[end])) {
      end++;
    }
    
    return text.slice(start, end + 1).trim();
  }

  public destroy(): void {
    // Clean up timeouts
    if (this.showTimeout) clearTimeout(this.showTimeout);
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    
    // Remove all event listeners
    if (this.eventHandlers.documentMouseEnter) {
      document.removeEventListener('mouseenter', this.eventHandlers.documentMouseEnter, true);
    }
    if (this.eventHandlers.documentMouseLeave) {
      document.removeEventListener('mouseleave', this.eventHandlers.documentMouseLeave, true);
    }
    if (this.eventHandlers.documentFocus) {
      document.removeEventListener('focus', this.eventHandlers.documentFocus, true);
    }
    if (this.eventHandlers.documentBlur) {
      document.removeEventListener('blur', this.eventHandlers.documentBlur, true);
    }
    
    if (this.element) {
      if (this.eventHandlers.tooltipMouseEnter) {
        this.element.removeEventListener('mouseenter', this.eventHandlers.tooltipMouseEnter);
      }
      if (this.eventHandlers.tooltipMouseLeave) {
        this.element.removeEventListener('mouseleave', this.eventHandlers.tooltipMouseLeave);
      }
      
      const pronunciationBtn = this.element.querySelector('.fluent-tooltip-pronunciation');
      const contextBtn = this.element.querySelector('.fluent-tooltip-context');
      
      if (pronunciationBtn && this.eventHandlers.pronunciationClick) {
        pronunciationBtn.removeEventListener('click', this.eventHandlers.pronunciationClick);
      }
      if (contextBtn && this.eventHandlers.contextClick) {
        contextBtn.removeEventListener('click', this.eventHandlers.contextClick);
      }
    }
    
    if (this.eventHandlers.windowScroll) {
      window.removeEventListener('scroll', this.eventHandlers.windowScroll);
    }
    if (this.eventHandlers.windowResize) {
      window.removeEventListener('resize', this.eventHandlers.windowResize);
    }
    
    // Remove from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    // Clear references
    this.element = null;
    this.currentTarget = null;
  }
}

// Create and export singleton instance
let tooltipInstance: Tooltip | null = null;

export function initTooltip(): Tooltip {
  if (!tooltipInstance) {
    tooltipInstance = new Tooltip();
  }
  return tooltipInstance;
}

export function destroyTooltip(): void {
  if (tooltipInstance) {
    tooltipInstance.destroy();
    tooltipInstance = null;
  }
}