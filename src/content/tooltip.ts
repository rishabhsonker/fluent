// Lightweight Tooltip Module - Pure vanilla JS, no dependencies
'use strict';

import { logger } from '../lib/logger';
import { TIMING } from '../lib/constants';
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
    this.element.classList.add('fluent-hidden');
    
    // Build DOM structure safely
    this.buildTooltipDOM();
    
    // Add to body
    document.body.appendChild(this.element);
    
    // Bind events
    this.bindEvents();
  }
  
  private buildTooltipDOM(): void {
    if (!this.element) return;

    // Translation container (will hold both word and pronunciation)
    const translationContainer = document.createElement('div');
    translationContainer.className = 'fluent-tooltip-translation';
    
    // Translation word span
    const translationWord = document.createElement('span');
    translationWord.className = 'fluent-tooltip-translation-word';
    translationContainer.appendChild(translationWord);
    
    // Pronunciation span (inside translation container)
    const pronunciation = document.createElement('span');
    pronunciation.className = 'fluent-tooltip-pronunciation';
    translationContainer.appendChild(pronunciation);
    
    this.element.appendChild(translationContainer);
    
    // Word mapping (spanish-word = english-word)
    const wordMapping = document.createElement('div');
    wordMapping.className = 'fluent-tooltip-word-mapping';
    this.element.appendChild(wordMapping);
    
    // Divider
    const divider1 = document.createElement('div');
    divider1.className = 'fluent-tooltip-divider';
    this.element.appendChild(divider1);
    
    // English example
    const englishExample = document.createElement('div');
    englishExample.className = 'fluent-tooltip-example-english';
    this.element.appendChild(englishExample);
    
    // Translated example
    const translatedExample = document.createElement('div');
    translatedExample.className = 'fluent-tooltip-example-translated';
    this.element.appendChild(translatedExample);
    
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
    
    // No action buttons needed
  }

  private bindEvents(): void {
    if (!this.element) return;

    // Create bound event handlers
    this.eventHandlers.documentMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.classList && target.classList.contains('fluent-word')) {
        this.showForElement(target);
      }
    };
    
    this.eventHandlers.documentMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.classList && target.classList.contains('fluent-word')) {
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
      if (target && target.classList && target.classList.contains('fluent-word')) {
        this.showForElement(target);
      }
    };
    
    this.eventHandlers.documentBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.classList && target.classList.contains('fluent-word')) {
        this.scheduleHide();
      }
    };
    
    this.eventHandlers.pronunciationClick = () => {
      this.playPronunciation();
    };
    
    this.eventHandlers.windowScroll = () => {
      if (this.isVisible && this.element) {
        // Update position immediately during scroll to keep tooltip aligned
        this.updatePosition();
        
        // Optional: Add subtle opacity change for visual feedback
        this.element.classList.add('fluent-opacity-low');
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        this.scrollTimeout = window.setTimeout(() => {
          if (this.isVisible && this.element) {
            this.element.classList.remove('fluent-opacity-low');
            this.element.classList.add('fluent-opacity-full');
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
    
    // No pronunciation button to bind
    
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
    const delay = TIMING.TOOLTIP_SHOW_DELAY_MS;
    
    this.showTimeout = window.setTimeout(async () => {
      this.currentTarget = element;
      
      // Add random micro-delay
      // Show immediately for better UX
      
      // Get data (check for randomized attribute names)
      const original = element.getAttribute('data-original') || 
                      element.getAttribute('data-fluent-original') ||
                      element.getAttribute('data-source');
      const translation = element.getAttribute('data-translation') || 
                         element.getAttribute('data-fluent-translation') ||
                         element.getAttribute('data-trans');
      const pronunciation = element.getAttribute('data-fluent-pronunciation');
      const meaning = element.getAttribute('data-fluent-meaning');
      const example = element.getAttribute('data-fluent-example');
      
      logger.info('[Tooltip] Attribute values:', {
        original,
        translation,
        pronunciation,
        meaning,
        example,
        pronunciationIsNull: pronunciation === null,
        pronunciationIsUndefined: pronunciation === undefined
      });
      
      if (!original || !translation) {
        logger.error('Missing tooltip data!');
        return;
      }
      
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
      
      // Update content (now async) - pass undefined for context fields to show loading states
      await this.updateContent(
        original, 
        translation, 
        language, 
        pronunciation || undefined,  // null/empty string becomes undefined
        undefined,                   // englishExample - will be fetched
        undefined                    // translatedExample - will be fetched
      );
      
      // Show and position
      this.show();
      this.updatePosition();
      
      // Update position again after a brief delay to ensure proper calculation
      // This handles cases where the browser needs time to render
      setTimeout(() => {
        if (this.isVisible) {
          this.updatePosition();
        }
      }, 10);
    }, delay);
  }

  private async updateContent(
    original: string, 
    translation: string, 
    language: LanguageCode,
    pronunciation?: string | null,
    englishExample?: string | null,
    translatedExample?: string | null,
    gender?: string | null
  ): Promise<void> {
    logger.info('[Tooltip] updateContent called:', {
      original,
      translation,
      language,
      pronunciation,
      englishExample,
      translatedExample,
      gender
    });
    
    if (!this.element) return;

    const translationWordElement = this.element.querySelector('.fluent-tooltip-translation-word');
    const pronunciationElement = this.element.querySelector('.fluent-tooltip-pronunciation');
    const wordMappingElement = this.element.querySelector('.fluent-tooltip-word-mapping');
    const englishExampleElement = this.element.querySelector('.fluent-tooltip-example-english');
    const translatedExampleElement = this.element.querySelector('.fluent-tooltip-example-translated');

    // 1. Show translated word
    if (translationWordElement) translationWordElement.textContent = translation;
    
    // 2. Show pronunciation inline with translation
    if (pronunciationElement instanceof HTMLElement) {
      if (pronunciation) {
        pronunciationElement.textContent = pronunciation;
        pronunciationElement.classList.remove('fluent-tooltip-loading');
        pronunciationElement.style.display = 'inline';
      } else if (pronunciation === undefined) {
        // Show loading skeleton inline
        pronunciationElement.innerHTML = '<span class="fluent-skeleton fluent-skeleton-text"></span>';
        pronunciationElement.classList.add('fluent-tooltip-loading');
        pronunciationElement.style.display = 'inline';
      } else {
        pronunciationElement.style.display = 'none';
      }
    }
    
    // 2.5. Show word mapping
    if (wordMappingElement instanceof HTMLElement) {
      const languageNames: Record<LanguageCode, string> = {
        spanish: 'Spanish',
        french: 'French',
        german: 'German'
      };
      const languageName = languageNames[language] || language;
      
      // Include gender information if available
      let genderInfo = '';
      if (gender) {
        genderInfo = ` (${gender})`;
      }
      
      wordMappingElement.textContent = `⁂  "${translation}"${genderInfo} means "${original}" in ${languageName}`;
      wordMappingElement.style.display = 'block';
    }
    
    // 3. Show English example or loading state
    if (englishExampleElement instanceof HTMLElement) {
      if (englishExample) {
        englishExampleElement.textContent = `🔖  ${englishExample}`;
        englishExampleElement.classList.remove('fluent-tooltip-loading');
        englishExampleElement.style.display = 'block';
      } else if (englishExample === undefined) {
        // Show loading skeleton
        englishExampleElement.innerHTML = '🔖  <span class="fluent-skeleton fluent-skeleton-text fluent-skeleton-full"></span>';
        englishExampleElement.classList.add('fluent-tooltip-loading');
        englishExampleElement.style.display = 'block';
      } else {
        englishExampleElement.style.display = 'none';
      }
    }
    
    // 4. Show translated example or loading state
    if (translatedExampleElement instanceof HTMLElement) {
      if (translatedExample) {
        translatedExampleElement.textContent = `📮  ${translatedExample}`;
        translatedExampleElement.classList.remove('fluent-tooltip-loading');
        translatedExampleElement.style.display = 'block';
      } else if (translatedExample === undefined) {
        // Show loading skeleton
        translatedExampleElement.innerHTML = `📮  <span class="fluent-skeleton fluent-skeleton-text fluent-skeleton-full"></span>`;
        translatedExampleElement.classList.add('fluent-tooltip-loading');
        translatedExampleElement.style.display = 'block';
      } else {
        translatedExampleElement.style.display = 'none';
      }
    }
    
    // Fetch context asynchronously if not provided
    logger.info('[Tooltip] Context check:', {
      pronunciation,
      englishExample,
      translatedExample,
      pronunciationUndefined: pronunciation === undefined,
      englishExampleUndefined: englishExample === undefined,
      translatedExampleUndefined: translatedExample === undefined,
      shouldFetchContext: pronunciation === undefined || englishExample === undefined || translatedExample === undefined
    });
    
    if (pronunciation === undefined || englishExample === undefined || translatedExample === undefined) {
      logger.info('[Tooltip] Triggering async context fetch');
      this.fetchContextAsync(original, translation, language, gender);
    }
    
    // Update progress if storage is available
    if (this.storage && this.currentLanguage) {
      try {
        const wordData = await this.storage.getWordProgress(original.toLowerCase(), this.currentLanguage);
        if (wordData && wordData.mastery !== undefined) {
          const progressFill = this.element.querySelector('.fluent-tooltip-progress-fill') as HTMLDivElement;
          const progressText = this.element.querySelector('.fluent-tooltip-progress-text') as HTMLSpanElement;
          const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          
          if (progressFill && progressText) {
            // Use CSS classes for width
            const widthClass = `fluent-progress-${Math.round(wordData.mastery / 10) * 10}`;
            progressFill.className = 'fluent-tooltip-progress-fill ' + widthClass;
            
            // Set color based on mastery
            if (wordData.mastery >= 80) {
              progressFill.classList.add('fluent-progress-green');
              progressText.textContent = '';
            } else if (wordData.mastery >= 50) {
              progressFill.classList.add('fluent-progress-yellow');
              progressText.textContent = '';
            } else {
              progressFill.classList.add('fluent-progress-blue');
              progressText.textContent = '';
            }
          }
          
          // Show progress bar
          if (progressContainer) {
            progressContainer.classList.remove('fluent-hidden');
            progressContainer.classList.add('fluent-visible');
          }
        } else {
          // Hide progress for new words
          const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          if (progressContainer) {
            progressContainer.classList.remove('fluent-visible');
            progressContainer.classList.add('fluent-hidden');
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
  
  private async fetchContextAsync(original: string, translation: string, language: LanguageCode, gender?: string | null): Promise<void> {
    logger.info('[Tooltip] fetchContextAsync called:', { original, translation, language, gender });
    
    if (!this.currentTarget || !this.element) {
      logger.warn('[Tooltip] No target or element, skipping context fetch');
      return;
    }
    
    try {
      // Get the sentence context
      const sentence = this.getWordContext(this.currentTarget);
      
      logger.info('[Tooltip] Sending GET_CONTEXT message:', {
        word: original,
        translation: translation,
        language: language,
        sentence: sentence?.substring(0, 50) + '...' // Log first 50 chars of sentence
      });
      
      // Check if chrome.runtime is available
      if (!chrome.runtime?.id) {
        logger.error('[Tooltip] Chrome runtime not available or extension context invalidated');
        throw new Error('Extension context invalidated');
      }
      
      // Fetch context from background script
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CONTEXT',
        word: original,
        translation: translation,
        language: language,
        sentence: sentence
      });
      
      // Check for chrome runtime errors
      if (chrome.runtime.lastError) {
        logger.error('[Tooltip] Chrome runtime error:', chrome.runtime.lastError);
        throw new Error(chrome.runtime.lastError.message);
      }
      
      logger.info('[Tooltip] GET_CONTEXT response received:', response);
      
      // Check if response is wrapped in secure message format
      const actualResponse = response?.data || response?.payload || response;
      logger.info('[Tooltip] Actual response data:', actualResponse);
      
      // Log the exact structure to debug
      logger.info('[Tooltip] Response structure debug:', {
        hasResponse: !!response,
        hasData: !!response?.data,
        hasPayload: !!response?.payload,
        responseKeys: response ? Object.keys(response) : [],
        actualResponseKeys: actualResponse ? Object.keys(actualResponse) : [],
        hasContext: !!actualResponse?.context,
        contextKeys: actualResponse?.context ? Object.keys(actualResponse.context) : []
      });
      
      if (actualResponse && actualResponse.context && this.isVisible && this.currentTarget) {
        logger.info('[Tooltip] Context update check passed, updating content:', {
          contextData: actualResponse.context,
          isVisible: this.isVisible,
          hasTarget: !!this.currentTarget
        });
        
        // Update content with fetched context
        const currentOriginal = this.currentTarget.getAttribute('data-original') || 
                               this.currentTarget.getAttribute('data-fluent-original');
        const currentTranslation = this.currentTarget.getAttribute('data-translation') || 
                                  this.currentTarget.getAttribute('data-fluent-translation');
        
        logger.info('[Tooltip] Current target check:', {
          currentOriginal,
          currentTranslation,
          expectedOriginal: original,
          expectedTranslation: translation,
          matches: currentOriginal === original && currentTranslation === translation
        });
        
        // Only update if still showing the same word
        if (currentOriginal === original && currentTranslation === translation) {
          logger.info('[Tooltip] Updating tooltip with context:', actualResponse.context);
          await this.updateContent(
            original,
            translation,
            language,
            actualResponse.context.pronunciation || null,
            actualResponse.context.englishExample || null,
            actualResponse.context.translatedExample || null,
            actualResponse.context.gender || null
          );
          
          // Recalculate position after content update since size may have changed
          this.updatePosition();
        } else {
          logger.warn('[Tooltip] Word mismatch, not updating:', {
            current: { original: currentOriginal, translation: currentTranslation },
            expected: { original, translation }
          });
        }
      } else {
        logger.warn('[Tooltip] Context update check failed:', {
          hasResponse: !!actualResponse,
          hasContext: !!actualResponse?.context,
          isVisible: this.isVisible,
          hasTarget: !!this.currentTarget
        });
      }
    } catch (error) {
      logger.error('[Tooltip] Failed to fetch context:', error);
      // Remove loading states on error
      if (this.element) {
        const loadingElements = this.element.querySelectorAll('.fluent-tooltip-loading');
        loadingElements.forEach(el => {
          el.classList.remove('fluent-tooltip-loading');
          if (el.querySelector('.fluent-skeleton')) {
            el.innerHTML = el.textContent || '';
          }
        });
      }
    }
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
    
    this.element.classList.remove('fluent-hidden');
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
        this.element.classList.add('fluent-hidden');
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

    // Add scroll offsets to get absolute position
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    // Determine vertical position based on available space
    let top: number;
    let tooltipAbove = true;
    
    const spaceAbove = targetRect.top;
    const spaceBelow = viewport.height - targetRect.bottom;
    const tooltipHeight = tooltipRect.height;
    
    // Check if there's enough space above (with 20px margin)
    if (spaceAbove >= tooltipHeight + 20) {
      // Place above with more spacing to avoid covering the word
      top = targetRect.top + scrollTop - tooltipHeight - 12;
      this.element.classList.remove('bottom');
      this.element.classList.add('top');
    } else if (spaceBelow >= tooltipHeight + 20) {
      // Place below with more spacing
      top = targetRect.bottom + scrollTop + 12;
      tooltipAbove = false;
      this.element.classList.remove('top');
      this.element.classList.add('bottom');
    } else {
      // Not enough space either way, choose the side with more space
      if (spaceAbove > spaceBelow) {
        top = Math.max(scrollTop + 10, targetRect.top + scrollTop - tooltipHeight - 12);
        this.element.classList.remove('bottom');
        this.element.classList.add('top');
      } else {
        top = targetRect.bottom + scrollTop + 12;
        tooltipAbove = false;
        this.element.classList.remove('top');
        this.element.classList.add('bottom');
      }
    }

    // Calculate horizontal position (center by default)
    let left = targetRect.left + scrollLeft + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Keep within viewport horizontally with 10px margins
    const minLeft = scrollLeft + 10;
    const maxLeft = scrollLeft + viewport.width - tooltipRect.width - 10;
    
    if (left < minLeft) {
      left = minLeft;
    } else if (left > maxLeft) {
      left = maxLeft;
    }

    // Apply position
    // Set position using CSS custom properties to avoid inline styles
    this.element.style.setProperty('--tooltip-left', `${left}px`);
    this.element.style.setProperty('--tooltip-top', `${top}px`);
    
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
      
      const pronunciationBtn = this.element.querySelector('.fluent-tooltip-pronunciation-btn');
      
      if (pronunciationBtn && this.eventHandlers.pronunciationClick) {
        pronunciationBtn.removeEventListener('click', this.eventHandlers.pronunciationClick);
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