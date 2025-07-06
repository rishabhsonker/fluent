// PageControl.js - Floating in-page control widget
'use strict';

export class PageControl {
  constructor(settings = {}) {
    this.settings = settings;
    this.isExpanded = false;
    this.isPaused = false;
    this.element = null;
    this.menuElement = null;
    
    this.init();
  }

  init() {
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

  getLanguageFlag() {
    const flags = {
      spanish: '🇪🇸',
      french: '🇫🇷', 
      german: '🇩🇪'
    };
    return flags[this.settings.targetLanguage] || '🌐';
  }

  renderMenu() {
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

  bindEvents() {
    // Toggle menu
    const button = this.element.querySelector('.fluent-control-button');
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Language selection
    this.menuElement.addEventListener('click', (e) => {
      const langBtn = e.target.closest('.fluent-control-lang-btn');
      if (langBtn) {
        const lang = langBtn.dataset.lang;
        this.changeLanguage(lang);
        return;
      }

      const menuItem = e.target.closest('.fluent-control-menu-item');
      if (menuItem) {
        const action = menuItem.dataset.action;
        this.handleAction(action);
      }
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target)) {
        this.closeMenu();
      }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.menuElement.classList.add('visible');
      // Update language selection
      this.updateLanguageSelection();
    } else {
      this.menuElement.classList.remove('visible');
    }
  }

  closeMenu() {
    this.isExpanded = false;
    this.menuElement.classList.remove('visible');
  }

  updateLanguageSelection() {
    // Remove all active states
    this.menuElement.querySelectorAll('.fluent-control-lang-btn').forEach(btn => {
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

  async changeLanguage(language) {
    try {
      // Update local state
      this.settings.targetLanguage = language;
      
      // Update flag
      this.element.querySelector('.fluent-control-flag').textContent = 
        this.getLanguageFlag();
      
      // Send to background
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { targetLanguage: language }
      });
      
      // Close menu and reload page
      this.closeMenu();
      window.location.reload();
    } catch (error) {
      console.error('Error changing language:', error);
    }
  }

  async handleAction(action) {
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
          chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
          break;
      }
      
      this.closeMenu();
    } catch (error) {
      console.error('Error handling action:', error);
    }
  }

  async pauseEverywhere() {
    const pauseUntil = Date.now() + (6 * 60 * 60 * 1000); // 6 hours
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { pausedUntil: pauseUntil }
    });
    
    this.showPausedState();
    
    // Set timer to auto-resume
    setTimeout(() => {
      this.checkPauseState();
    }, 6 * 60 * 60 * 1000);
  }

  async pauseSite() {
    const hostname = window.location.hostname;
    const pauseUntil = Date.now() + (6 * 60 * 60 * 1000); // 6 hours
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SITE_SETTINGS',
      hostname: hostname,
      settings: { pausedUntil: pauseUntil }
    });
    
    this.showPausedState();
  }

  async disableSite() {
    const hostname = window.location.hostname;
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SITE_SETTINGS',
      hostname: hostname,
      settings: { enabled: false }
    });
    
    // Reload to apply changes
    window.location.reload();
  }

  async checkPauseState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SETTINGS'
      });
      
      const now = Date.now();
      const globallyPaused = response.settings.pausedUntil && 
                           response.settings.pausedUntil > now;
      
      if (!response.siteEnabled || globallyPaused) {
        this.showPausedState();
      } else {
        this.showActiveState();
      }
    } catch (error) {
      console.error('Error checking pause state:', error);
    }
  }

  showPausedState() {
    this.isPaused = true;
    this.element.classList.add('fluent-paused');
    document.body.classList.add('fluent-paused');
  }

  showActiveState() {
    this.isPaused = false;
    this.element.classList.remove('fluent-paused');
    document.body.classList.remove('fluent-paused');
  }

  updatePosition() {
    // Smart positioning to avoid overlapping content
    const button = this.element.querySelector('.fluent-control-button');
    const rect = button.getBoundingClientRect();
    
    // Check if button overlaps any fixed/sticky elements
    const elements = document.elementsFromPoint(rect.right - 28, rect.bottom - 28);
    const hasOverlap = elements.some(el => {
      const style = window.getComputedStyle(el);
      return style.position === 'fixed' || style.position === 'sticky';
    });
    
    if (hasOverlap) {
      // Move up
      this.element.style.bottom = '100px';
    }
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.menuElement = null;
  }
}

// Factory function
export function createPageControl(settings) {
  return new PageControl(settings);
}