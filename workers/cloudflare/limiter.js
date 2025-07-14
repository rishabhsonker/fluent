/**
 * Rate limiting and cost tracking module for Cloudflare Worker
 * Uses D1 for tracking and Cloudflare's built-in rate limiters
 */

import { logError, logInfo } from './logger.js';
import { safe } from './utils.js';
import { createErrorResponse, ErrorTypes } from './error-handler.js';

export const COST_LIMITS = {
  DAILY_COST_USD: 10,
  HOURLY_COST_USD: 1,
  COST_PER_CHARACTER: 0.00001, // $10 per million characters
};

export const PAYLOAD_LIMITS = {
  RATE_LIMIT_MULTIPLIER: 2, // Double count for large payloads
  LARGE_PAYLOAD_THRESHOLD: 5 * 1024, // 5KB
};

/**
 * Apply rate limiting for translation requests
 * Uses Cloudflare's built-in rate limiters
 */
export async function applyRateLimit(env, rateLimitKey, targetLanguage, wordsToTranslate) {
  let rateLimitStatus = { hourlyRemaining: null, dailyRemaining: null };
  
  if (wordsToTranslate.length > 0 && env.TRANSLATION_RATE_LIMITER) {
    // Parse the rate limit key to check for payload size indicator
    const keyParts = rateLimitKey.split(':');
    const installationId = keyParts[0];
    const payloadKB = keyParts.length > 2 ? parseInt(keyParts[2]) : 0;
    
    // Apply multiplier for large payloads
    const multiplier = payloadKB >= 5 ? PAYLOAD_LIMITS.RATE_LIMIT_MULTIPLIER : 1;
    
    const hourlyRateLimit = await env.TRANSLATION_RATE_LIMITER.limit({
      key: `${installationId}:${targetLanguage}`,
      multiplier
    });
    
    const dailyRateLimit = env.DAILY_TRANSLATION_LIMITER ? await env.DAILY_TRANSLATION_LIMITER.limit({
      key: `${installationId}:${targetLanguage}`,
      multiplier
    }) : { success: true, remaining: 1000 };
    
    rateLimitStatus = {
      hourlyRemaining: hourlyRateLimit.remaining || 0,
      dailyRemaining: dailyRateLimit.remaining || 0
    };
    
    if (!hourlyRateLimit.success || !dailyRateLimit.success) {
      const error = new Error('Rate limit exceeded for new translations');
      error.name = 'RateLimitError';
      error.status = 429;
      const errorResponse = createErrorResponse(error, { retryAfter: 3600 });
      errorResponse.error.details = {
        partial: true,
        limits: rateLimitStatus
      };
      
      return {
        limited: true,
        rateLimitStatus,
        response: errorResponse,
        headers: {
          'X-RateLimit-Limit-Hourly': '100',
          'X-RateLimit-Remaining-Hourly': rateLimitStatus.hourlyRemaining.toString(),
          'X-RateLimit-Limit-Daily': '1000', 
          'X-RateLimit-Remaining-Daily': rateLimitStatus.dailyRemaining.toString(),
          'Retry-After': '3600'
        }
      };
    }
  }
  
  return { limited: false, rateLimitStatus };
}

/**
 * Apply rate limiting for AI context generation
 */
export async function applyAIRateLimit(env, installationId) {
  if (!env.AI_RATE_LIMITER) {
    return { limited: false, rateLimitStatus: {} };
  }
  
  const hourlyLimit = await env.AI_RATE_LIMITER.limit({
    key: `${installationId}:context`
  });
  
  const dailyLimit = env.DAILY_AI_LIMITER ? await env.DAILY_AI_LIMITER.limit({
    key: `${installationId}:context`
  }) : { success: true, remaining: 100 };
  
  const rateLimitStatus = {
    hourlyRemaining: hourlyLimit.remaining || 0,
    dailyRemaining: dailyLimit.remaining || 0
  };
  
  if (!hourlyLimit.success || !dailyLimit.success) {
    const error = new Error('AI context rate limit exceeded');
    error.name = 'RateLimitError';
    error.status = 429;
    const errorResponse = createErrorResponse(error, { retryAfter: 3600 });
    errorResponse.error.details = { context: null };
    
    return {
      limited: true,
      rateLimitStatus,
      response: errorResponse,
      headers: {
        'X-AI-RateLimit-Limit-Hourly': '100',
        'X-AI-RateLimit-Remaining-Hourly': rateLimitStatus.hourlyRemaining.toString(),
        'Retry-After': '3600'
      }
    };
  }
  
  return { limited: false, rateLimitStatus };
}

/**
 * Check cost limits using D1
 */
export async function checkCostLimit(characterCount, env) {
  if (!env.DB) {
    // If D1 not available, allow the request
    return { blocked: false };
  }
  
  return await safe(async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    
    // Estimate costs based on translation counts
    // Assume average 10 characters per translation
    const avgCharsPerTranslation = 10;
    
    // Get hourly and daily translation counts from user_tracking
    const { AnalyticsDB } = await import('./database.js');
    
    const [hourlyCount, dailyCount] = await Promise.all([
      AnalyticsDB.getTranslationCount(env.DB, hourAgo),
      AnalyticsDB.getTranslationCount(env.DB, dayAgo)
    ]);
    
    const currentHourlyCost = hourlyCount * avgCharsPerTranslation * COST_LIMITS.COST_PER_CHARACTER;
    const currentDailyCost = dailyCount * avgCharsPerTranslation * COST_LIMITS.COST_PER_CHARACTER;
    const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;
    
    if (currentHourlyCost + requestCost > COST_LIMITS.HOURLY_COST_USD) {
      return {
        blocked: true,
        message: 'Hourly cost limit exceeded. Please try again later or provide your own API key.',
      };
    }
    
    if (currentDailyCost + requestCost > COST_LIMITS.DAILY_COST_USD) {
      return {
        blocked: true,
        message: 'Daily cost limit exceeded. Service will resume tomorrow or provide your own API key.',
      };
    }
    
    return { blocked: false };
  }, 'Error checking cost limits', { blocked: false });
}

/**
 * Update cost tracking in D1
 */
export async function updateCostTracking(characterCount, env, installationId = null, userId = null) {
  if (!env.DB || !userId) return;
  
  await safe(async () => {
    // Cost tracking is now implicit through the usage tracking in user_tracking table
    // The UsageDB.increment() calls in auth.js already track translations
    // We can calculate costs from the translation counts when needed
    
    // Log for monitoring purposes
    const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;
    logInfo('Translation cost estimate', {
      characterCount,
      estimatedCost: requestCost,
      userId,
      installationId
    });
  }, 'Error in cost tracking');
}