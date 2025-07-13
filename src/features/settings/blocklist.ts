// Blacklist.ts - Site blocking and exclusion management
'use strict';

import { storage } from './storage';
import { getErrorHandler } from '../../shared/utils/error-handler';
import { safeSync, safe } from '../../shared/utils/helpers';

const errorHandler = getErrorHandler();

// Default blacklisted patterns - sensitive sites that should never be translated
const DEFAULT_BLACKLIST: RegExp[] = [
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
  /\.ally\.com$/,
  /\.usbank\.com$/,
  /\.pnc\.com$/,
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
  /stripe\.com$/,
  
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
  
  // Work/productivity tools
  /slack\.com$/,
  /discord\.com$/,
  /teams\.microsoft\.com/,
  /zoom\.us/,
  /meet\.google\.com/,
  
  // Google productivity suite
  /docs\.google\.com/,
  /sheets\.google\.com/,
  /slides\.google\.com/,
  /drive\.google\.com/,
  
  // Microsoft productivity suite
  /office\.com$/,
  /office365\.com$/,
  /word\.office\.com/,
  /excel\.office\.com/,
  /powerpoint\.office\.com/,
  /onedrive\.com/,
  /sharepoint\.com/,
  
  // Other productivity tools
  /notion\.so/,
  /evernote\.com/,
  /dropbox\.com/,
  /box\.com/,
  
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
  /github\.com$/,
  /gitlab\.com$/,
  /bitbucket\.org$/,
  /localhost/,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /\.local$/,
  
  // Social media (optional)
  /facebook\.com$/,
  /instagram\.com$/,
  /twitter\.com$/,
  /x\.com$/,
  /linkedin\.com$/,
  /tiktok\.com$/,
  
  // Adult content
  /porn/i,
  /xxx/i,
  /adult/i,
  /nsfw/i
];

interface BlacklistCategory {
  name: string;
  description: string;
  enabled: boolean;
  patterns: RegExp[];
}

interface BlacklistCategories {
  [key: string]: BlacklistCategory;
}

interface BlacklistSettings {
  categories: { [key: string]: boolean };
  customSites: string[];
}

interface BlacklistExport {
  version: number;
  categories: { [key: string]: boolean };
  customSites: string[];
  exportDate: string;
}

interface BlacklistStats {
  totalPatterns: number;
  customSites: number;
  categories: number;
}

// User-customizable blacklist categories
export const BLACKLIST_CATEGORIES: BlacklistCategories = {
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
  private cache: Set<RegExp> | null;
  private customPatterns: RegExp[];
  private urlCache: Map<string, boolean>;

  constructor() {
    this.cache = null;
    this.customPatterns = [];
    this.urlCache = new Map();
    this.init();
  }

  async init(): Promise<void> {
    // Load custom blacklist from storage
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    // Handle null case
    const settings = stored || { categories: {}, customSites: [] };
    
    this.customPatterns = settings.customSites.map((site: string) => {
      return safeSync(() => new RegExp(site, 'i'), 'Creating custom pattern regex',
        new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      );
    });
    
    // Build cache
    await this.buildCache();
  }

  private async buildCache(): Promise<void> {
    this.cache = new Set<RegExp>();
    this.urlCache.clear(); // Clear URL cache when rebuilding pattern cache
    
    // Add default patterns
    DEFAULT_BLACKLIST.forEach(pattern => {
      this.cache!.add(pattern);
    });
    
    // Add category patterns if enabled
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', { categories: {}, customSites: [] });
    const settings = stored || { categories: {}, customSites: [] };
    
    for (const [key, category] of Object.entries(BLACKLIST_CATEGORIES)) {
      const isEnabled = settings.categories[key] !== false && category.enabled;
      if (isEnabled) {
        category.patterns.forEach(pattern => {
          this.cache!.add(pattern);
        });
      }
    }
    
    // Add custom patterns
    this.customPatterns.forEach(pattern => {
      this.cache!.add(pattern);
    });
  }

  // Check if a URL is blacklisted
  isBlacklisted(url: string): boolean {
    // Check URL cache first
    if (this.urlCache.has(url)) {
      return this.urlCache.get(url)!;
    }
    
    return safeSync(() => {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      const fullUrl = hostname + pathname;
      
      let isBlocked = false;
      
      // Check against all patterns
      if (this.cache) {
        for (const pattern of Array.from(this.cache)) {
          if (pattern.test(fullUrl) || pattern.test(hostname)) {
            isBlocked = true;
            break;
          }
        }
      }
      
      // Cache the result (limit cache size)
      if (this.urlCache.size > 1000) {
        // Clear oldest entries
        const firstKey = this.urlCache.keys().next().value;
        if (firstKey !== undefined) {
          this.urlCache.delete(firstKey);
        }
      }
      this.urlCache.set(url, isBlocked);
      
      return isBlocked;
    }, 'URL blacklist check', true); // Err on the side of caution
  }

  // Check if current site should be processed
  shouldProcessSite(): boolean {
    const url = window.location.href;
    return !this.isBlacklisted(url);
  }

  // Add a custom site to blacklist
  async addSite(site: string): Promise<void> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    
    if (!settings.customSites.includes(site)) {
      settings.customSites.push(site);
      await storage.set('blacklist_settings', settings);
      
      // Update cache
      const pattern = safeSync(() => new RegExp(site, 'i'), 'Creating pattern for new site',
        new RegExp(site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      );
      this.customPatterns.push(pattern);
      this.cache?.add(pattern);
    }
  }

  // Remove a custom site from blacklist
  async removeSite(site: string): Promise<void> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    
    const index = settings.customSites.indexOf(site);
    if (index > -1) {
      settings.customSites.splice(index, 1);
      await storage.set('blacklist_settings', settings);
      
      // Rebuild cache
      await this.init();
    }
  }

  // Get all custom sites
  async getCustomSites(): Promise<string[]> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    return settings.customSites;
  }

  // Toggle a category
  async toggleCategory(categoryKey: string, enabled: boolean): Promise<void> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    
    settings.categories[categoryKey] = enabled;
    await storage.set('blacklist_settings', settings);
    
    // Rebuild cache
    await this.buildCache();
  }

  // Get category states
  async getCategoryStates(): Promise<{ [key: string]: boolean }> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    
    const states: { [key: string]: boolean } = {};
    for (const [key, category] of Object.entries(BLACKLIST_CATEGORIES)) {
      states[key] = settings.categories[key] !== undefined 
        ? settings.categories[key] 
        : category.enabled;
    }
    
    return states;
  }

  // Export blacklist for backup
  async exportBlacklist(): Promise<BlacklistExport> {
    const stored = await storage.get<BlacklistSettings>('blacklist_settings', {
      categories: {},
      customSites: []
    });
    
    const settings = stored || { categories: {}, customSites: [] };
    
    return {
      version: 1,
      categories: settings.categories,
      customSites: settings.customSites,
      exportDate: new Date().toISOString()
    };
  }

  // Import blacklist from backup
  async importBlacklist(data: BlacklistExport): Promise<void> {
    if (data.version !== 1) {
      throw new Error('Unsupported blacklist version');
    }
    
    await storage.set('blacklist_settings', {
      categories: data.categories || {},
      customSites: data.customSites || []
    });
    
    // Rebuild cache
    await this.init();
  }

  // Get statistics
  getStats(): BlacklistStats {
    return {
      totalPatterns: this.cache?.size || 0,
      customSites: this.customPatterns.length,
      categories: Object.keys(BLACKLIST_CATEGORIES).length
    };
  }
}

// Singleton instance
let blacklistInstance: BlacklistManager | null = null;

export function getBlacklist(): BlacklistManager {
  if (!blacklistInstance) {
    blacklistInstance = new BlacklistManager();
  }
  return blacklistInstance;
}

// Quick check function for content scripts
export async function shouldProcessCurrentSite(): Promise<boolean> {
  const blacklist = getBlacklist();
  return blacklist.shouldProcessSite();
}