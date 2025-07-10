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
  
  // Drag state
  private isDragging: boolean = false;
  private hasDraggedDistance: boolean = false;
  private dragOffset = { x: 0, y: 0 };
  private dragStartPos = { x: 0, y: 0 };
  private position = { x: 24, y: 24 }; // Default bottom-right position
  
  // Store event handlers for cleanup
  private documentClickHandler: ((e: Event) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;

  constructor(settings: PageControlSettings) {
    this.settings = settings;
    this.init();
  }

  private init(): void {
    // Create main button
    this.element = document.createElement('div');
    this.element.className = 'fluent-control';
    // Create button safely
    const button = document.createElement('button');
    button.className = 'fluent-control-button fluent-control-button-small';
    button.setAttribute('aria-label', 'Fluent language settings');
    
    // Use extension icon instead of flag
    const iconImg = document.createElement('img');
    iconImg.className = 'fluent-control-icon';
    iconImg.src = chrome.runtime.getURL('icons/icon-48.png');
    iconImg.alt = 'Fluent';
    
    // Add fallback in case icon fails to load
    iconImg.onerror = () => {
      iconImg.style.display = 'none';
      const fallbackText = document.createElement('span');
      fallbackText.textContent = 'F';
      fallbackText.style.fontSize = '20px';
      fallbackText.style.fontWeight = 'bold';
      button.appendChild(fallbackText);
    };
    
    button.appendChild(iconImg);
    this.element.appendChild(button);

    // Create menu
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'fluent-control-menu';
    this.menuElement.innerHTML = this.renderMenu();
    this.element.appendChild(this.menuElement);

    // Set initial position (bottom-right)
    this.updatePosition();
    
    // Add to page
    document.body.appendChild(this.element);

    // Bind events
    this.bindEvents();
    
    // Load saved position
    this.loadPosition();

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
      
    `;
  }

  private bindEvents(): void {
    if (!this.element || !this.menuElement) return;

    // Toggle menu and drag functionality
    const button = this.element.querySelector('.fluent-control-button');
    if (button instanceof HTMLElement) {
      // Make button draggable
      button.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) { // Left click only
          this.startDrag(e);
        }
      });
      
      button.addEventListener('click', (e: Event) => {
        // Only toggle menu if we haven't dragged a significant distance
        if (!this.hasDraggedDistance) {
          e.stopPropagation();
          this.toggleMenu();
        }
      });
    }

    // Language selection and menu actions
    this.menuElement.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const langBtn = target.closest('.fluent-control-lang-btn');
      
      if (langBtn instanceof HTMLElement) {
        const lang = langBtn.dataset.lang as LanguageCode;
        if (lang) {
          this.changeLanguage(lang);
          return;
        }
      }

      const menuItem = target.closest('.fluent-control-menu-item');
      if (menuItem instanceof HTMLElement) {
        const action = menuItem.dataset.action;
        if (action) {
          this.handleAction(action);
        }
      }
    });

    // Close menu on outside click
    this.documentClickHandler = (e: Event) => {
      // Add safety checks for element existence and DOM connectivity
      if (this.element && 
          e.target && 
          document.body.contains(this.element) && 
          !this.element.contains(e.target as Node)) {
        this.closeMenu();
      }
    };
    document.addEventListener('click', this.documentClickHandler);

    // Escape key
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.closeMenu();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
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


  // Drag functionality
  private startDrag(e: MouseEvent): void {
    this.isDragging = false; // Reset
    this.hasDraggedDistance = false; // Reset
    const rect = this.element!.getBoundingClientRect();
    
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    this.dragStartPos = {
      x: e.clientX,
      y: e.clientY
    };

    // Mouse move handler
    this.mouseMoveHandler = (e: MouseEvent) => {
      // Check if we've moved more than 5 pixels in any direction
      const dx = Math.abs(e.clientX - this.dragStartPos.x);
      const dy = Math.abs(e.clientY - this.dragStartPos.y);
      
      if (dx > 5 || dy > 5) {
        this.isDragging = true;
        this.hasDraggedDistance = true;
      }
      
      if (this.hasDraggedDistance) {
        this.handleDrag(e);
      }
    };

    // Mouse up handler
    this.mouseUpHandler = (e: MouseEvent) => {
      this.endDrag(e);
    };

    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('mouseup', this.mouseUpHandler);
    
    // Prevent text selection while dragging
    e.preventDefault();
  }

  private handleDrag(e: MouseEvent): void {
    if (!this.element) return;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    // Keep within viewport bounds
    const maxX = window.innerWidth - this.element.offsetWidth;
    const maxY = window.innerHeight - this.element.offsetHeight;

    this.position.x = Math.max(0, Math.min(x, maxX));
    this.position.y = Math.max(0, Math.min(y, maxY));

    this.updatePositionStyle();
  }

  private endDrag(e: MouseEvent): void {
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler);
      this.mouseUpHandler = null;
    }

    // Save position if we actually dragged a significant distance
    if (this.hasDraggedDistance) {
      this.savePosition();
      // Reset drag states after a short delay to prevent immediate click
      setTimeout(() => {
        this.isDragging = false;
        this.hasDraggedDistance = false;
      }, 100);
    } else {
      // If we didn't drag, reset immediately
      this.isDragging = false;
      this.hasDraggedDistance = false;
    }
  }

  private updatePositionStyle(): void {
    if (!this.element) return;
    
    this.element.style.left = `${this.position.x}px`;
    this.element.style.top = `${this.position.y}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
  }

  private savePosition(): void {
    try {
      chrome.storage.local.set({
        'fluent_control_position': this.position
      });
    } catch (error) {
      logger.error('Failed to save position:', error);
    }
  }

  private async loadPosition(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('fluent_control_position');
      if (result.fluent_control_position) {
        this.position = result.fluent_control_position;
        
        // Ensure position is within current viewport
        const maxX = window.innerWidth - (this.element?.offsetWidth || 48);
        const maxY = window.innerHeight - (this.element?.offsetHeight || 48);
        
        this.position.x = Math.max(0, Math.min(this.position.x, maxX));
        this.position.y = Math.max(0, Math.min(this.position.y, maxY));
        
        this.updatePositionStyle();
      } else {
        // Default to bottom-right
        this.updatePosition();
      }
    } catch (error) {
      logger.error('Failed to load position:', error);
      this.updatePosition();
    }
  }

  public updatePosition(): void {
    if (!this.element) return;

    // Default to bottom-right corner
    this.position = {
      x: window.innerWidth - (this.element.offsetWidth || 48) - 24,
      y: window.innerHeight - (this.element.offsetHeight || 48) - 24
    };
    
    this.updatePositionStyle();
  }

  public destroy(): void {
    // Remove event listeners
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
    
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler);
      this.mouseUpHandler = null;
    }
    
    // Remove element from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    // Clear references
    this.element = null;
    this.menuElement = null;
  }
}

// Factory function
export function createPageControl(settings: PageControlSettings): PageControl {
  return new PageControl(settings);
}