// PageControl.ts - Floating in-page control widget
'use strict';

import type { UserSettings, LanguageCode, MessageRequest, MessageResponse } from '../types';
import { logger } from '../lib/logger';

interface PageControlSettings extends Partial<UserSettings> {
  targetLanguage: LanguageCode;
}

interface LanguageButton {
  lang: LanguageCode;
  flag: string;
  name: string;
}

export class PageControl {
  private settings: PageControlSettings;
  private isExpanded: boolean = false;
  private isPaused: boolean = false;
  private element: HTMLDivElement | null = null;
  private menuElement: HTMLDivElement | null = null;

  constructor(settings: PageControlSettings) {
    this.settings = settings;
    this.init();
  }

  private init(): void {
    // Create main button
    this.element = document.createElement('div');
    this.element.className = 'fluent-control';
    this.element.innerHTML = `
      <button class="fluent-control-button" aria-label="Fluent language settings">
        <span class="fluent-control-flag">${this.getLanguageFlag()}</span>
      </button>
    `;

    // Create menu
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'fluent-control-menu';
    this.menuElement.innerHTML = this.renderMenu();
    this.element.appendChild(this.menuElement);

    // Add to page
    document.body.appendChild(this.element);

    // Bind events
    this.bindEvents();

    // Check pause state
    this.checkPauseState();
  }

  private getLanguageFlag(): string {
    const flags: Record<LanguageCode, string> = {
      spanish: '🇪🇸',
      french: '🇫🇷', 
      german: '🇩🇪'
    };
    return flags[this.settings.targetLanguage] || '🌐';
  }

  private renderMenu(): string {
    return `
      <div class="fluent-control-menu-section">
        <div class="fluent-control-menu-label">Language</div>
        <div class="fluent-control-language-buttons">
          <button class="fluent-control-lang-btn" data-lang="spanish">
            <span>🇪🇸</span>
            <span>Spanish</span>
          </button>
          <button class="fluent-control-lang-btn" data-lang="french">
            <span>🇫🇷</span>
            <span>French</span>
          </button>
          <button class="fluent-control-lang-btn" data-lang="german">
            <span>🇩🇪</span>
            <span>German</span>
          </button>
        </div>
      </div>
      
      <div class="fluent-control-menu-divider"></div>
      
      <div class="fluent-control-menu-section">
        <div class="fluent-control-menu-item" data-action="pause-everywhere">
          <span>⏸️</span>
          <span>Pause everywhere (6 hours)</span>
        </div>
        <div class="fluent-control-menu-item" data-action="pause-site">
          <span>🚫</span>
          <span>Pause this site (6 hours)</span>
        </div>
        <div class="fluent-control-menu-item" data-action="disable-site">
          <span>❌</span>
          <span>Disable for this site</span>
        </div>
      </div>
      
      <div class="fluent-control-menu-divider"></div>
      
      <div class="fluent-control-menu-section">
        <div class="fluent-control-menu-item" data-action="settings">
          <span>⚙️</span>
          <span>Settings</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.element || !this.menuElement) return;

    // Toggle menu
    const button = this.element.querySelector('.fluent-control-button') as HTMLButtonElement;
    if (button) {
      button.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.toggleMenu();
      });
    }

    // Language selection and menu actions
    this.menuElement.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const langBtn = target.closest('.fluent-control-lang-btn') as HTMLButtonElement;
      
      if (langBtn) {
        const lang = langBtn.dataset.lang as LanguageCode;
        if (lang) {
          this.changeLanguage(lang);
          return;
        }
      }

      const menuItem = target.closest('.fluent-control-menu-item') as HTMLElement;
      if (menuItem) {
        const action = menuItem.dataset.action;
        if (action) {
          this.handleAction(action);
        }
      }
    });

    // Close menu on outside click
    document.addEventListener('click', (e: Event) => {
      if (this.element && !this.element.contains(e.target as Node)) {
        this.closeMenu();
      }
    });

    // Escape key
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.closeMenu();
      }
    });
  }

  private toggleMenu(): void {
    this.isExpanded = !this.isExpanded;
    if (this.menuElement) {
      if (this.isExpanded) {
        this.menuElement.classList.add('visible');
        // Update language selection
        this.updateLanguageSelection();
      } else {
        this.menuElement.classList.remove('visible');
      }
    }
  }

  private closeMenu(): void {
    this.isExpanded = false;
    if (this.menuElement) {
      this.menuElement.classList.remove('visible');
    }
  }

  private updateLanguageSelection(): void {
    if (!this.menuElement) return;

    // Remove all active states
    this.menuElement.querySelectorAll('.fluent-control-lang-btn').forEach((btn: Element) => {
      btn.classList.remove('active');
    });
    
    // Add active state to current language
    const activeBtn = this.menuElement.querySelector(
      `[data-lang="${this.settings.targetLanguage}"]`
    );
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  private async changeLanguage(language: LanguageCode): Promise<void> {
    try {
      // Update local state
      this.settings.targetLanguage = language;
      
      // Update flag
      if (this.element) {
        const flagElement = this.element.querySelector('.fluent-control-flag');
        if (flagElement) {
          flagElement.textContent = this.getLanguageFlag();
        }
      }
      
      // Send to background
      const message: MessageRequest = {
        type: 'UPDATE_SETTINGS',
        settings: { targetLanguage: language }
      };
      await chrome.runtime.sendMessage(message);
      
      // Close menu and reload page
      this.closeMenu();
      window.location.reload();
    } catch (error) {
      logger.error('Error changing language:', error);
    }
  }

  private async handleAction(action: string): Promise<void> {
    try {
      switch (action) {
        case 'pause-everywhere':
          await this.pauseEverywhere();
          break;
          
        case 'pause-site':
          await this.pauseSite();
          break;
          
        case 'disable-site':
          await this.disableSite();
          break;
          
        case 'settings':
          // Open extension popup
          const message: MessageRequest = { type: 'OPEN_POPUP' };
          chrome.runtime.sendMessage(message);
          break;
      }
      
      this.closeMenu();
    } catch (error) {
      logger.error('Error handling action:', error);
    }
  }

  private async pauseEverywhere(): Promise<void> {
    const pauseUntil = Date.now() + (6 * 60 * 60 * 1000); // 6 hours
    
    const message: MessageRequest = {
      type: 'UPDATE_SETTINGS',
      settings: { pausedUntil: pauseUntil }
    };
    await chrome.runtime.sendMessage(message);
    
    this.showPausedState();
    
    // Set timer to auto-resume
    setTimeout(() => {
      this.checkPauseState();
    }, 6 * 60 * 60 * 1000);
  }

  private async pauseSite(): Promise<void> {
    const hostname = window.location.hostname;
    const pauseUntil = Date.now() + (6 * 60 * 60 * 1000); // 6 hours
    
    const message: MessageRequest = {
      type: 'UPDATE_SITE_SETTINGS',
      hostname: hostname,
      settings: { pausedUntil: pauseUntil }
    };
    await chrome.runtime.sendMessage(message);
    
    this.showPausedState();
  }

  private async disableSite(): Promise<void> {
    const hostname = window.location.hostname;
    
    const message: MessageRequest = {
      type: 'UPDATE_SITE_SETTINGS',
      hostname: hostname,
      settings: { enabled: false }
    };
    await chrome.runtime.sendMessage(message);
    
    // Reload to apply changes
    window.location.reload();
  }

  private async checkPauseState(): Promise<void> {
    try {
      const message: MessageRequest = { type: 'GET_SETTINGS' };
      const response = await chrome.runtime.sendMessage(message) as MessageResponse & {
        settings?: UserSettings;
        siteEnabled?: boolean;
      };
      
      const now = Date.now();
      const globallyPaused = response.settings?.pausedUntil && 
                           response.settings.pausedUntil > now;
      
      if (!response.siteEnabled || globallyPaused) {
        this.showPausedState();
      } else {
        this.showActiveState();
      }
    } catch (error) {
      logger.error('Error checking pause state:', error);
    }
  }

  private showPausedState(): void {
    this.isPaused = true;
    if (this.element) {
      this.element.classList.add('fluent-paused');
    }
    document.body.classList.add('fluent-paused');
  }

  private showActiveState(): void {
    this.isPaused = false;
    if (this.element) {
      this.element.classList.remove('fluent-paused');
    }
    document.body.classList.remove('fluent-paused');
  }

  public updatePosition(): void {
    if (!this.element) return;

    // Smart positioning to avoid overlapping content
    const button = this.element.querySelector('.fluent-control-button') as HTMLButtonElement;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    
    // Check if button overlaps any fixed/sticky elements
    const elements = document.elementsFromPoint(rect.right - 28, rect.bottom - 28);
    const hasOverlap = elements.some((el: Element) => {
      const style = window.getComputedStyle(el);
      return style.position === 'fixed' || style.position === 'sticky';
    });
    
    if (hasOverlap) {
      // Move up
      this.element.classList.add('fluent-control-adjusted');
    }
  }

  public destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.menuElement = null;
  }
}

// Factory function
export function createPageControl(settings: PageControlSettings): PageControl {
  return new PageControl(settings);
}