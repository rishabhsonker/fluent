/**
 * Site configuration module
 * Handles site-specific settings and blocked sites
 */

import { logger } from '../../shared/logger';
import { API_CONFIG } from '../../shared/constants';
import { ComponentAsyncManager } from '../../shared/async';
import { safe } from '../../shared/utils/helpers';

export interface SiteConfig {
  contentSelector: string;
  skipSelectors?: string[];
  useMutationObserver?: boolean;
  wordsPerPage?: number;
}

// Site-specific configurations
export const SITE_CONFIGS: Record<string, SiteConfig> = {
  'wikipedia.org': {
    contentSelector: '.mw-parser-output > p:not(.mw-empty-elt)',
    skipSelectors: ['.mw-editsection', '.reference', '.citation']
  },
  'reddit.com': {
    contentSelector: '[data-testid="comment"], .Post__title, .Comment__body',
    useMutationObserver: true
  },
  'medium.com': {
    contentSelector: 'article p',
    skipSelectors: ['pre', 'code']
  },
  'github.com': {
    contentSelector: '.markdown-body p, .comment-body p',
    skipSelectors: ['pre', 'code', '.blob-code', '.highlight']
  },
  'default': {
    contentSelector: 'p, article, .content, .post, main',
    skipSelectors: ['script', 'style', 'pre', 'code', 'input', 'textarea', 'select']
  }
};

// Site configuration cache
let siteConfig: any = null;
let configLoadTime = 0;
const CONFIG_CACHE_DURATION = 3600000; // 1 hour

// AsyncManager instance
const asyncManager = new ComponentAsyncManager('SiteConfig');

/**
 * Fetch optimized site configuration from worker (optional)
 * Only fetches config for sites that have special optimization settings
 */
export async function fetchOptimizedSiteConfig(): Promise<any> {
  const now = Date.now();
  
  // Use cached config if fresh
  if (siteConfig && (now - configLoadTime) < CONFIG_CACHE_DURATION) {
    return siteConfig;
  }
  
  const result = await safe(async () => {
    const response = await asyncManager.fetch(
      'site-config',
      `${API_CONFIG.TRANSLATOR_API}/config`,
      { method: 'GET' },
      { description: 'Fetch optimized site configuration', preventDuplicates: true }
    );
    
    siteConfig = await response.json();
    configLoadTime = now;
    logger.debug('Optimized site config loaded:', siteConfig);
    return siteConfig;
  }, 'Fetch optimized site config');
  
  if (result) {
    return result;
  }
  
  // Return default config - API call is optional for optimization only
  return {
    optimizedSites: [],
    globalSkipSelectors: ['script', 'style', 'pre', 'code', 'iframe', 
                         'input', 'textarea', 'button', '[contenteditable="true"]']
  };
}

/**
 * Check if site should be processed using extension blocklist
 */
export async function shouldProcessSite(): Promise<boolean> {
  return await safe(async () => {
    // Use the extension's blocklist manager
    const { shouldProcessCurrentSite } = await import('../settings/blocklist');
    return await shouldProcessCurrentSite();
  }, 'Check site blocklist', true); // Default to allowing the site if blocklist check fails
}

/**
 * Get site-specific configuration
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  const hostname = window.location.hostname;
  const config = await fetchOptimizedSiteConfig();
  
  // Check if this site has optimized settings
  const optimized = config.optimizedSites?.find((site: any) => 
    hostname.includes(site.domain)
  );
  
  if (optimized) {
    logger.debug(`Using optimized config for ${hostname}:`, optimized);
    return {
      contentSelector: optimized.selector || SITE_CONFIGS.default.contentSelector,
      skipSelectors: [
        ...(config.globalSkipSelectors || []),
        ...(optimized.skipSelectors || [])
      ],
      useMutationObserver: optimized.useMutationObserver,
      wordsPerPage: optimized.wordsPerPage
    };
  }
  
  // Check legacy SITE_CONFIGS
  for (const [site, siteConfig] of Object.entries(SITE_CONFIGS)) {
    if (hostname.includes(site)) {
      return {
        ...siteConfig,
        skipSelectors: [
          ...(config.globalSkipSelectors || []),
          ...(siteConfig.skipSelectors || [])
        ]
      };
    }
  }
  
  // Default config with global skip selectors
  return {
    ...SITE_CONFIGS.default,
    skipSelectors: [
      ...(config.globalSkipSelectors || []),
      ...(SITE_CONFIGS.default.skipSelectors || [])
    ]
  };
}

/**
 * Check if element should be skipped
 */
export async function shouldSkipElement(element: Element | null, config?: SiteConfig): Promise<boolean> {
  const siteConfig = config || await getSiteConfig();
  const skipSelectors = siteConfig.skipSelectors || [];
  if (!element || !element.parentElement) return true;
  
  // Always skip Fluent extension UI elements
  if (element instanceof Element) {
    if (element.closest('.fluent-control') || 
        element.closest('.fluent-tooltip') ||
        element.closest('[data-fluent-skip]') ||
        element.classList.contains('fluent-control') ||
        element.classList.contains('fluent-tooltip') ||
        element.hasAttribute('data-fluent-skip')) {
      return true;
    }
  }
  
  // Check if element or any parent matches skip selectors
  for (const selector of skipSelectors) {
    if (element instanceof Element && element.matches(selector)) return true;
    if (element instanceof Element && element.closest(selector)) return true;
  }
  
  // Skip if inside contenteditable
  if (element instanceof HTMLElement && element.isContentEditable || 
      element instanceof Element && element.closest('[contenteditable="true"]')) {
    return true;
  }
  
  return false;
}