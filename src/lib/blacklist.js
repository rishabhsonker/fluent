// Blacklist.js - Site blocking and exclusion management
'use strict';

import { getStorage } from './storage.js';

// Default blacklisted patterns - sensitive sites that should never be translated
const DEFAULT_BLACKLIST = [
  // Banking and financial
  /\.bank/i,
  /banking/i,
  /\.chase\.com$/,
  /\.wellsfargo\.com$/,
  /\.bankofamerica\.com$/,
  /\.citi\.com$/,
  /\.capitalone\.com$/,
  /\.americanexpress\.com$/,
  /\.discover\.com$/,
  /paypal\.com$/,
  /venmo\.com$/,
  /cashapp\.com$/,
  /zelle\.com$/,
  /coinbase\.com$/,
  /binance\.com$/,
  /kraken\.com$/,
  /robinhood\.com$/,
  /etrade\.com$/,
  /fidelity\.com$/,
  /vanguard\.com$/,
  /schwab\.com$/,
  
  // Government sites
  /\.gov$/,
  /\.gov\./,
  /\.mil$/,
  /irs\.gov/,
  /ssa\.gov/,
  /state\.gov/,
  /usa\.gov/,
  
  // Healthcare and medical
  /healthcare/i,
  /health\.com$/,
  /\.healthcare/,
  /hospital/i,
  /medical/i,
  /clinic/i,
  /patient/i,
  /mychart/i,
  /kaiserpermanente\.org/,
  /anthem\.com/,
  /cigna\.com/,
  /aetna\.com/,
  /bluecross/i,
  /medicare\.gov/,
  /medicaid\.gov/,
  /webmd\.com/,
  /mayoclinic\.org/,
  
  // Password managers
  /1password\.com/,
  /lastpass\.com/,
  /bitwarden\.com/,
  /dashlane\.com/,
  /keeper/i,
  
  // Work/productivity tools (optional - can be removed)
  /slack\.com$/,
  /teams\.microsoft\.com/,
  /zoom\.us/,
  /meet\.google\.com/,
  
  // Email providers
  /mail\.google\.com/,
  /outlook\.live\.com/,
  /outlook\.office\.com/,
  /mail\.yahoo\.com/,
  /mail\.aol\.com/,
  /protonmail\.com/,
  
  // Shopping checkout pages
  /checkout/i,
  /payment/i,
  /billing/i,
  /\/cart\//,
  /\/order\//,
  
  // Authentication pages
  /\/login/i,
  /\/signin/i,
  /\/signup/i,
  /\/auth/i,
  /\/oauth/i,
  /\/sso/i,
  
  // Developer tools
  /localhost/,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /\.local$/,
  
  // Adult content
  /porn/i,
  /xxx/i,
  /adult/i,
  /nsfw/i
];

// User-customizable blacklist categories
export const BLACKLIST_CATEGORIES = {
  FINANCIAL: {
    name: 'Financial & Banking',
    description: 'Banks, payment processors, and financial services',
    enabled: true,
    patterns: [
      /\.bank/i,
      /banking/i,
      /paypal\.com$/,
      /venmo\.com$/,
      /coinbase\.com$/,
      /robinhood\.com$/
    ]
  },
  GOVERNMENT: {
    name: 'Government',
    description: 'Government websites and services',
    enabled: true,
    patterns: [
      /\.gov$/,
      /\.gov\./,
      /\.mil$/
    ]
  },
  HEALTHCARE: {
    name: 'Healthcare',
    description: 'Medical, healthcare, and patient portals',
    enabled: true,
    patterns: [
      /healthcare/i,
      /hospital/i,
      /medical/i,
      /patient/i,
      /mychart/i
    ]
  },
  AUTHENTICATION: {
    name: 'Login & Authentication',
    description: 'Login, signup, and authentication pages',
    enabled: true,
    patterns: [
      /\/login/i,
      /\/signin/i,
      /\/signup/i,
      /\/auth/i
    ]
  },
  SHOPPING_CHECKOUT: {
    name: 'Shopping Checkout',
    description: 'Checkout and payment pages',
    enabled: true,
    patterns: [
      /checkout/i,
      /payment/i,
      /billing/i,
      /\/cart\//
    ]
  },
  WORK_TOOLS: {
    name: 'Work Tools',
    description: 'Productivity and communication tools',
    enabled: false, // Optional by default
    patterns: [
      /slack\.com$/,
      /teams\.microsoft\.com/,
      /zoom\.us/,
      /docs\.google\.com/,
      /drive\.google\.com/
    ]
  },
  DEVELOPER: {
    name: 'Developer Tools',
    description: 'Local development and coding sites',
    enabled: true,
    patterns: [
      /localhost/,
      /127\.0\.0\.1/,
      /codepen\.io/,
      /jsfiddle\.net/,
      /codesandbox\.io/
    ]
  }
};

export class BlacklistManager {
  constructor() {
    this.storage = getStorage();
    this.cache = null;
    this.customPatterns = [];
    this.init();
  }

  async init() {
    // Load custom blacklist from storage
    const stored = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    this.customPatterns = stored.customSites.map(site => {
      try {
        return new RegExp(site, 'i');
      } catch (e) {
        // If regex is invalid, treat as literal string
        return new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
    });
    
    // Build cache
    this.buildCache();
  }

  buildCache() {
    this.cache = new Set();
    
    // Add default patterns
    DEFAULT_BLACKLIST.forEach(pattern => {
      this.cache.add(pattern);
    });
    
    // Add category patterns if enabled
    const settings = this.storage.get('blacklist_settings', { categories: {} });
    
    for (const [key, category] of Object.entries(BLACKLIST_CATEGORIES)) {
      const isEnabled = settings.categories[key] !== false && category.enabled;
      if (isEnabled) {
        category.patterns.forEach(pattern => {
          this.cache.add(pattern);
        });
      }
    }
    
    // Add custom patterns
    this.customPatterns.forEach(pattern => {
      this.cache.add(pattern);
    });
  }

  // Check if a URL is blacklisted
  isBlacklisted(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      const fullUrl = hostname + pathname;
      
      // Check against all patterns
      for (const pattern of this.cache) {
        if (pattern.test(fullUrl) || pattern.test(hostname)) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      // Invalid URL
      return true; // Err on the side of caution
    }
  }

  // Check if current site should be processed
  shouldProcessSite() {
    const url = window.location.href;
    return !this.isBlacklisted(url);
  }

  // Add a custom site to blacklist
  async addSite(site) {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    if (!settings.customSites.includes(site)) {
      settings.customSites.push(site);
      await this.storage.set('blacklist_settings', settings);
      
      // Update cache
      try {
        const pattern = new RegExp(site, 'i');
        this.customPatterns.push(pattern);
        this.cache.add(pattern);
      } catch (e) {
        const pattern = new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        this.customPatterns.push(pattern);
        this.cache.add(pattern);
      }
    }
  }

  // Remove a custom site from blacklist
  async removeSite(site) {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const index = settings.customSites.indexOf(site);
    if (index > -1) {
      settings.customSites.splice(index, 1);
      await this.storage.set('blacklist_settings', settings);
      
      // Rebuild cache
      await this.init();
    }
  }

  // Get all custom sites
  async getCustomSites() {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    return settings.customSites;
  }

  // Toggle a category
  async toggleCategory(categoryKey, enabled) {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    settings.categories[categoryKey] = enabled;
    await this.storage.set('blacklist_settings', settings);
    
    // Rebuild cache
    this.buildCache();
  }

  // Get category states
  async getCategoryStates() {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const states = {};
    for (const [key, category] of Object.entries(BLACKLIST_CATEGORIES)) {
      states[key] = settings.categories[key] !== undefined 
        ? settings.categories[key] 
        : category.enabled;
    }
    
    return states;
  }

  // Export blacklist for backup
  async exportBlacklist() {
    const settings = await this.storage.get('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    return {
      version: 1,
      categories: settings.categories,
      customSites: settings.customSites,
      exportDate: new Date().toISOString()
    };
  }

  // Import blacklist from backup
  async importBlacklist(data) {
    if (data.version !== 1) {
      throw new Error('Unsupported blacklist version');
    }
    
    await this.storage.set('blacklist_settings', {
      categories: data.categories || {},
      customSites: data.customSites || []
    });
    
    // Rebuild cache
    await this.init();
  }

  // Get statistics
  getStats() {
    return {
      totalPatterns: this.cache.size,
      customSites: this.customPatterns.length,
      categories: Object.keys(BLACKLIST_CATEGORIES).length
    };
  }
}

// Singleton instance
let blacklistInstance = null;

export function getBlacklist() {
  if (!blacklistInstance) {
    blacklistInstance = new BlacklistManager();
  }
  return blacklistInstance;
}

// Quick check function for content scripts
export async function shouldProcessCurrentSite() {
  const blacklist = getBlacklist();
  return blacklist.shouldProcessSite();
}