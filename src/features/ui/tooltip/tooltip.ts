/**
 * Tooltip Component - Rich hover information for translated words
 * 
 * Purpose:
 * - Displays detailed translation information on hover
 * - Shows pronunciation, meaning, and usage examples
 * - Provides progressive loading with skeleton states
 * 
 * Key Features:
 * - Lightweight vanilla JS implementation (no framework deps)
 * - Smart positioning (avoids viewport edges)
 * - Progressive content loading
 * - Skeleton loading states for async content
 * - Keyboard accessible (focus support)
 * - Auto-hide on scroll/click
 * 
 * Content Sections:
 * - Header: Original word → Translation
 * - Pronunciation guide (phonetic)
 * - Meaning in English
 * - Example sentences (English + translated)
 * - Gender information (for applicable languages)
 * 
 * Referenced by:
 * - src/features/ui/tooltip/manager.ts (creates/manages instances)
 * - src/features/translation/replacer.ts (triggers on hover)
 * - src/features/ui/styles/tooltip.css (styling)
 * 
 * Performance:
 * - Single tooltip instance reused (no memory leaks)
 * - Debounced show/hide (prevents flicker)
 * - CSS animations for smooth transitions
 */

'use strict';

import { logger } from '../../../shared/logger';
import { TIMING, PERFORMANCE_LIMITS, NUMERIC, UI_DIMENSIONS_EXTENDED, ARRAY, TIME, THRESHOLD, ANIMATION } from '../../../shared/constants';
import { CSS_DIMENSIONS } from '../../../shared/constants/css-variables';
import { ComponentAsyncManager } from '../../../shared/async';
import { throttle } from '../../../shared/performance';
import { safe } from '../../../shared/utils/helpers';
import type { LanguageCode, WordProgress, ContextExplanation, MessageResponse } from '../../../shared/types';

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
  private asyncManager: ComponentAsyncManager;
  
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
  
  // Scroll animation frame reference
  private scrollRAF: number | null = null;
  private scrollTimeout: number | null = null;
  private throttledUpdatePosition: (() => void) | null = null;
  
  constructor() {
    this.asyncManager = new ComponentAsyncManager('Tooltip');
    // Create throttled update function
    this.throttledUpdatePosition = throttle(() => this.updatePosition(), PERFORMANCE_LIMITS.FRAME_BUDGET_MS);
    this.init();
  }
  
  private createSkeletonElement(className: string = ''): HTMLSpanElement {
    const skeleton = document.createElement('span');
    skeleton.className = `fluent-skeleton fluent-skeleton-text ${className}`.trim();
    return skeleton;
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
      if (this.isVisible && this.element && this.throttledUpdatePosition) {
        // Use throttled update to prevent excessive recalculations
        this.throttledUpdatePosition();
        
        // Optional: Add subtle opacity change for visual feedback
        this.element.classList.add('fluent-opacity-low');
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        this.scrollTimeout = window.setTimeout(() => {
          if (this.isVisible && this.element) {
            this.element.classList.remove('fluent-opacity-low');
            this.element.classList.add('fluent-opacity-full');
          }
        }, ANIMATION.DEBOUNCE_DELAY_MS);
      }
    };
    
    this.eventHandlers.windowResize = () => {
      if (this.isVisible) {
        // Use throttled update instead of hiding immediately
        if (this.throttledUpdatePosition) {
          this.throttledUpdatePosition();
        }
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
    
    // Cancel any pending show operation
    this.asyncManager.cancel('show-tooltip');

    // Delay show with anti-fingerprinting variance
    const delay = TIMING.TOOLTIP_SHOW_DELAY_MS;
    
    this.asyncManager.execute(
      'show-tooltip',
      async (signal) => {
        // Wait for delay
        await this.asyncManager.delay(delay, signal);
        
        // Check if still valid after delay
        if (!this.element || !element.isConnected) {
          return;
        }
        
        this.currentTarget = element;
        
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
          await safe(
            () => this.storage!.recordWordInteraction(
              original.toLowerCase(),
              this.currentLanguage!,
              'hover'
            ),
            'Failed to record interaction'
          );
        }
        
        // Check if operation was cancelled
        if (signal.aborted) return;
        
        // Update content (now async) - pass undefined for context fields to show loading states
        await this.updateContent(
          original, 
          translation, 
          language, 
          pronunciation || undefined,  // null/empty string becomes undefined
          undefined,                   // englishExample - will be fetched
          undefined                    // translatedExample - will be fetched
        );
        
        // Check again before showing
        if (signal.aborted || !this.element || !element.isConnected) return;
        
        // Show and position
        this.show();
        this.updatePosition();
        
        // Update position again after a brief delay
        await this.asyncManager.delay(THRESHOLD.MAX_ERROR_COUNT, signal);
        if (!signal.aborted && this.isVisible) {
          this.updatePosition();
        }
      },
      {
        description: 'Show tooltip for element',
        preventDuplicates: true,
        cancelOnNavigation: true
      }
    ).catch(error => {
      if (error.message !== 'Operation cancelled: Show tooltip for element') {
        logger.error('Failed to show tooltip:', error);
      }
    });
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
        pronunciationElement.textContent = '';
        pronunciationElement.appendChild(this.createSkeletonElement());
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
      
      wordMappingElement.textContent = `∙  "${translation}"${genderInfo} means "${original}" in ${languageName}`;
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
        englishExampleElement.textContent = '🔖  ';
        englishExampleElement.appendChild(this.createSkeletonElement('fluent-skeleton-full'));
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
        translatedExampleElement.textContent = '📮  ';
        translatedExampleElement.appendChild(this.createSkeletonElement('fluent-skeleton-full'));
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
      await safe(async () => {
        const wordData = await this.storage!.getWordProgress(original.toLowerCase(), this.currentLanguage!);
        if (wordData && wordData.mastery !== undefined && this.element) {
          const progressFill = this.element.querySelector('.fluent-tooltip-progress-fill') as HTMLDivElement;
          const progressText = this.element.querySelector('.fluent-tooltip-progress-text') as HTMLSpanElement;
          const progressContainer = this.element.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          
          if (progressFill && progressText) {
            // Use CSS classes for width
            const widthClass = `fluent-progress-${Math.round(wordData.mastery / THRESHOLD.MAX_ERROR_COUNT) * THRESHOLD.MAX_ERROR_COUNT}`;
            progressFill.className = 'fluent-tooltip-progress-fill ' + widthClass;
            
            // Set color based on mastery
            if (wordData.mastery >= THRESHOLD.WARNING_THRESHOLD) {
              progressFill.classList.add('fluent-progress-green');
              progressText.textContent = '';
            } else if (wordData.mastery >= NUMERIC.PERCENTAGE_HALF) {
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
          const progressContainer = this.element?.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
          if (progressContainer) {
            progressContainer.classList.remove('fluent-visible');
            progressContainer.classList.add('fluent-hidden');
          }
        }
      }, 
      'Failed to get word progress'
      ).catch(() => {
        // On error, hide progress container
        const progressContainer = this.element?.querySelector('.fluent-tooltip-progress') as HTMLDivElement;
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
      });
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
    
    // Use async manager for context fetching
    this.asyncManager.execute(
      `fetch-context-${original}`,
      async (signal) => {
        await this.performContextFetch(signal, original, translation, language, gender);
      },
      {
        description: `Fetch context for ${original}`,
        preventDuplicates: true,
        cancelOnNavigation: true
      }
    ).catch(error => {
      if (error.message !== `Operation cancelled: Fetch context for ${original}`) {
        logger.error('[Tooltip] Failed to fetch context:', error);
        // Remove loading states on error
        if (this.element) {
          const loadingElements = this.element.querySelectorAll('.fluent-tooltip-loading');
          loadingElements.forEach(el => {
            el.classList.remove('fluent-tooltip-loading');
            const skeleton = el.querySelector('.fluent-skeleton');
            if (skeleton) {
              skeleton.remove();
            }
          });
        }
      }
    });
  }
  
  private async performContextFetch(
    signal: AbortSignal,
    original: string,
    translation: string,
    language: LanguageCode,
    gender?: string | null
  ): Promise<void> {
    
    // Check if operation was cancelled
    if (signal.aborted) return;
    
    // Get the sentence context
    const sentence = this.getWordContext(this.currentTarget!);
    
    logger.info('[Tooltip] Sending GET_CONTEXT message:', {
      word: original,
      translation: translation,
      language: language,
      sentence: sentence?.substring(0, NUMERIC.PERCENTAGE_HALF) + '...' // Log first 50 chars of sentence
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
    
    // Check if cancelled after async operation
    if (signal.aborted) return;
      
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
      // Check if cancelled before updating UI
      if (signal.aborted) return;
      
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
      
      // Only update if still showing the same word and not cancelled
      if (currentOriginal === original && currentTranslation === translation && !signal.aborted) {
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
    
    // Cancel any pending operations when hiding
    this.asyncManager.cancelComponentOperations();
    
    // Hide after transition using async manager
    this.asyncManager.execute(
      'hide-animation',
      async (signal) => {
        await this.asyncManager.delay(ANIMATION.FADE_DURATION_MS, signal);
        if (!signal.aborted && !this.isVisible && this.element) {
          this.element.classList.add('fluent-hidden');
          this.currentTarget = null;
        }
      },
      {
        description: 'Hide tooltip after animation',
        preventDuplicates: true,
        cancelOnNavigation: false
      }
    ).catch(() => {
      // Ignore cancellation errors
    });
  }

  private scheduleHide(): void {
    this.cancelHide();
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, ANIMATION.SLIDE_DURATION_MS);
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
    if (spaceAbove >= tooltipHeight + CSS_DIMENSIONS.ICON_MEDIUM) {
      // Place above with more spacing to avoid covering the word
      top = targetRect.top + scrollTop - tooltipHeight - CSS_DIMENSIONS.TOOLTIP_ARROW_SIZE;
      this.element.classList.remove('bottom');
      this.element.classList.add('top');
    } else if (spaceBelow >= tooltipHeight + CSS_DIMENSIONS.ICON_MEDIUM) {
      // Place below with more spacing
      top = targetRect.bottom + scrollTop + CSS_DIMENSIONS.TOOLTIP_ARROW_SIZE;
      tooltipAbove = false;
      this.element.classList.remove('top');
      this.element.classList.add('bottom');
    } else {
      // Not enough space either way, choose the side with more space
      if (spaceAbove > spaceBelow) {
        top = Math.max(scrollTop + THRESHOLD.MAX_ERROR_COUNT, targetRect.top + scrollTop - tooltipHeight - CSS_DIMENSIONS.TOOLTIP_ARROW_SIZE);
        this.element.classList.remove('bottom');
        this.element.classList.add('top');
      } else {
        top = targetRect.bottom + scrollTop + CSS_DIMENSIONS.TOOLTIP_ARROW_SIZE;
        tooltipAbove = false;
        this.element.classList.remove('top');
        this.element.classList.add('bottom');
      }
    }

    // Calculate horizontal position (center by default)
    let left = targetRect.left + scrollLeft + (targetRect.width / ARRAY.PAIR_SIZE) - (tooltipRect.width / ARRAY.PAIR_SIZE);

    // Keep within viewport horizontally with 10px margins
    const minLeft = scrollLeft + THRESHOLD.MAX_ERROR_COUNT;
    const maxLeft = scrollLeft + viewport.width - tooltipRect.width - THRESHOLD.MAX_ERROR_COUNT;
    
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
      await safe(
        () => this.storage!.recordWordInteraction(
          original.toLowerCase(),
          this.currentLanguage!,
          'pronunciation'
        ),
        'Failed to record interaction'
      );
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
        }, TIME.MS_PER_SECOND);
      }
    }
  }


  private getWordContext(element: HTMLElement): string {
    // Get the parent text node or container
    let container: HTMLElement | null = element.parentElement;
    while (container && container.textContent && container.textContent.length < NUMERIC.PERCENTAGE_HALF) {
      container = container.parentElement;
    }
    
    if (!container || !container.textContent) return '';
    
    // Extract sentence around the word
    const text = container.textContent;
    const wordIndex = text.indexOf(element.textContent || '');
    
    if (wordIndex === -1) return text.slice(ARRAY.FIRST_INDEX, NUMERIC.PERCENTAGE_MAX);
    
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
    // Cancel all async operations
    this.asyncManager.cleanup();
    
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