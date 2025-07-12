/**
 * Configuration module for Cloudflare Worker
 * Handles site configuration and blocked sites
 */

import { logError } from './logger.js';

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

  // Try to get custom configuration from KV if available
  try {
    const customConfig = env.TRANSLATION_CACHE ? await env.TRANSLATION_CACHE.get('site-config', { type: 'json' }) : null;
    if (customConfig) {
      return {
        ...defaultConfig,
        ...customConfig,
        optimizedSites: [...defaultConfig.optimizedSites, ...(customConfig.optimizedSites || [])]
      };
    }
  } catch (error) {
    logError('Failed to load custom site config', error);
  }

  return defaultConfig;
}

/**
 * Validate environment bindings
 */
export function validateEnvironment(env) {
  const warnings = [];
  
  if (!env.TRANSLATION_CACHE) {
    warnings.push('TRANSLATION_CACHE KV namespace not bound - caching disabled');
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