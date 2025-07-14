/**
 * Configuration module for Cloudflare Worker
 * Handles site configuration and blocked sites
 */

import { logError } from './logger.js';
import { safe } from './utils.js';

/**
 * Get site configuration
 */
export async function getSiteConfig(env) {
  const defaultConfig = {
    
    optimizedSites: [
      // News sites
      {
        domain: 'bbc.com',
        selector: '.ssrcss-1if1lbl-StyledText p, .ssrcss-18cjaf3-StyledText p',
        wordsPerPage: 10
      },
      {
        domain: 'wikipedia.org',
        selector: '#mw-content-text p',
        wordsPerPage: 12,
        skipSelectors: ['.mw-editsection', '.reference', '.citation']
      },
      {
        domain: 'reddit.com',
        selector: '[data-testid="comment"] p, .Post h3',
        wordsPerPage: 6,
        useMutationObserver: true
      }
    ],
    
    globalSkipSelectors: [
      'script', 'style', 'noscript', 'iframe', 'pre', 'code',
      'input', 'textarea', 'button', '[contenteditable="true"]'
    ],
    
    version: '1.0.0',
    lastUpdated: new Date().toISOString()
  };

  // Try to get custom configuration from D1 if available
  await safe(async () => {
    if (env.DB) {
      // In the future, we could store site config in D1
      // For now, just return default config
    }
  }, 'Failed to load custom site config');

  return defaultConfig;
}

/**
 * Validate environment bindings
 */
export function validateEnvironment(env) {
  const warnings = [];
  
  if (!env.DB) {
    warnings.push('D1 database not bound - caching and user tracking disabled');
  }
  
  if (!env.MICROSOFT_TRANSLATOR_KEY) {
    warnings.push('MICROSOFT_TRANSLATOR_KEY not set - translations will fail without API key');
  }
  
  if (!env.CLAUDE_API_KEY) {
    warnings.push('CLAUDE_API_KEY not set - context generation disabled');
  }
  
  if (!env.TRANSLATION_RATE_LIMITER) {
    warnings.push('Rate limiters not bound - rate limiting disabled');
  }
  
  if (warnings.length > 0) {
    const { logInfo } = require('./logger.js');
    logInfo('Environment warnings', { warnings });
  }
  
  return warnings;
}