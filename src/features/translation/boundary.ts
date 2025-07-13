/**
 * Error Boundary for Content Scripts
 * 
 * Provides crash protection for translation functionality
 * to prevent breaking entire pages when errors occur
 */

import { logger } from '../../shared/logger';
import { getErrorHandler } from '../../shared/utils/error-handler';
import { safe, safeSync } from '../../shared/utils/helpers';

interface ErrorBoundaryOptions {
  maxErrors?: number;
  resetDelay?: number;
  onError?: (error: Error, context: string) => void;
  onDisable?: () => void;
}

export class ContentScriptErrorBoundary {
  private static errorCount = 0;
  private static readonly MAX_ERRORS = 3;
  private static readonly RESET_DELAY = 60000; // 1 minute
  private static resetTimer: NodeJS.Timeout | null = null;
  private static isDisabled = false;

  /**
   * Wrap an async operation with error protection
   */
  static async wrap<T>(
    operation: () => Promise<T>,
    context: string,
    options: ErrorBoundaryOptions = {}
  ): Promise<T | null> {
    if (this.isDisabled) {
      logger.warn('Content script is disabled due to excessive errors');
      return null;
    }

    const maxErrors = options.maxErrors || this.MAX_ERRORS;
    const resetDelay = options.resetDelay || this.RESET_DELAY;

    try {
      const result = await operation();
      
      // Reset error count on successful operation
      if (this.errorCount > 0) {
        this.errorCount = 0;
        logger.info('Error count reset after successful operation');
      }
      
      return result;
    } catch (error) {
      this.errorCount++;
      
      // Log error with context
      logger.error(`Content script error in ${context}:`, error);
      
      // Report to error handler
      const errorHandler = getErrorHandler();
      errorHandler.handleError(error, {
        operation: `content-script.${context}`,
        component: 'content-script',
        extra: {
          errorCount: this.errorCount,
          maxErrors
        }
      });
      
      // Call custom error handler if provided
      if (options.onError) {
        options.onError(error as Error, context);
      }
      
      // Report to background script
      await safe(async () => {
        await chrome.runtime.sendMessage({
          type: 'CONTENT_SCRIPT_ERROR',
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            context,
            errorCount: this.errorCount
          }
        });
      }, 'Report error to background');
      
      // Check if we should disable
      if (this.errorCount >= maxErrors) {
        logger.error('Too many errors, disabling content script');
        this.disable(options.onDisable);
      } else {
        // Set reset timer
        this.setResetTimer(resetDelay);
      }
      
      return null;
    }
  }

  /**
   * Wrap a synchronous operation with error protection
   */
  static wrapSync<T>(
    operation: () => T,
    context: string,
    defaultValue: T,
    options: ErrorBoundaryOptions = {}
  ): T {
    if (this.isDisabled) {
      logger.warn('Content script is disabled due to excessive errors');
      return defaultValue;
    }

    try {
      return operation();
    } catch (error) {
      this.errorCount++;
      
      logger.error(`Content script sync error in ${context}:`, error);
      
      // Report synchronously if possible
      const errorHandler = getErrorHandler();
      errorHandler.handleError(error, {
        operation: `content-script.${context}`,
        component: 'content-script'
      });
      
      if (this.errorCount >= (options.maxErrors || this.MAX_ERRORS)) {
        this.disable(options.onDisable);
      }
      
      return defaultValue;
    }
  }

  /**
   * Disable content script functionality
   */
  private static disable(onDisable?: () => void): void {
    this.isDisabled = true;
    
    // Show user notification
    this.showErrorNotification(
      'Fluent translation has been temporarily disabled due to errors. Please reload the page to try again.'
    );
    
    // Cleanup
    this.cleanup();
    
    // Call custom disable handler
    if (onDisable) {
      onDisable();
    }
  }

  /**
   * Reset error count after delay
   */
  private static setResetTimer(delay: number): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      this.errorCount = 0;
      this.resetTimer = null;
      logger.info('Error count reset after timeout');
    }, delay);
  }

  /**
   * Show error notification to user
   */
  private static showErrorNotification(message: string): void {
    safeSync(() => {
      // Create notification element
      const notification = document.createElement('div');
      notification.className = 'fluent-error-notification';
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 2147483647;
        max-width: 400px;
        animation: fluent-slide-in 0.3s ease-out;
      `;
      
      // Add animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fluent-slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        line-height: 24px;
        text-align: center;
      `;
      closeBtn.onclick = () => notification.remove();
      notification.appendChild(closeBtn);
      
      document.body.appendChild(notification);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        notification.style.animation = 'fluent-slide-in 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
      }, 10000);
    }, 'Show error notification');
  }

  /**
   * Cleanup all Fluent functionality
   */
  private static cleanup(): void {
    safeSync(() => {
      // Remove all Fluent elements
      document.querySelectorAll('[data-fluent]').forEach(el => {
        const textNode = document.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(textNode, el);
      });
      
      // Remove event listeners
      if (window.__fluent) {
        window.__fluent.cleanup?.();
      }
      
      // Clear timers
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }
    }, 'Cleanup Fluent functionality');
  }

  /**
   * Reset error boundary state
   */
  static reset(): void {
    this.errorCount = 0;
    this.isDisabled = false;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Get current error count
   */
  static getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Check if disabled
   */
  static isContentScriptDisabled(): boolean {
    return this.isDisabled;
  }
}

// Type declaration is in main.ts, don't redeclare