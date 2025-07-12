/**
 * Rate limiting and cost tracking module for Cloudflare Worker
 */

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
 * Now includes payload size consideration
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
    
    const dailyRateLimit = await env.DAILY_TRANSLATION_LIMITER.limit({
      key: `${installationId}:${targetLanguage}`,
      multiplier
    });
    
    rateLimitStatus = {
      hourlyRemaining: hourlyRateLimit.remaining || 0,
      dailyRemaining: dailyRateLimit.remaining || 0
    };
    
    if (!hourlyRateLimit.success || !dailyRateLimit.success) {
      return {
        limited: true,
        rateLimitStatus,
        response: {
          error: 'Rate limit exceeded for new translations',
          metadata: {
            partial: true,
            limits: rateLimitStatus
          }
        },
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
  
  const dailyLimit = await env.DAILY_AI_LIMITER.limit({
    key: `${installationId}:context`
  });
  
  const rateLimitStatus = {
    hourlyRemaining: hourlyLimit.remaining || 0,
    dailyRemaining: dailyLimit.remaining || 0
  };
  
  if (!hourlyLimit.success || !dailyLimit.success) {
    return {
      limited: true,
      rateLimitStatus,
      response: {
        error: 'AI context rate limit exceeded',
        context: null
      },
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
 * Check cost limits
 */
export async function checkCostLimit(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;

  const [hourlyCost, dailyCost] = env.TRANSLATION_CACHE ? await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]) : [null, null];

  const currentHourlyCost = parseFloat(hourlyCost || '0');
  const currentDailyCost = parseFloat(dailyCost || '0');
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
}

/**
 * Update cost tracking
 */
export async function updateCostTracking(characterCount, env) {
  const now = new Date();
  const hourKey = `cost:hour:${now.toISOString().slice(0, 13)}`;
  const dayKey = `cost:day:${now.toISOString().slice(0, 10)}`;
  const requestCost = characterCount * COST_LIMITS.COST_PER_CHARACTER;

  const [hourlyCost, dailyCost] = env.TRANSLATION_CACHE ? await Promise.all([
    env.TRANSLATION_CACHE.get(hourKey),
    env.TRANSLATION_CACHE.get(dayKey),
  ]) : [null, null];

  await Promise.all([
    env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
      hourKey,
      String((parseFloat(hourlyCost || '0') + requestCost)),
      { expirationTtl: 3600 }
    ),
    env.TRANSLATION_CACHE && env.TRANSLATION_CACHE.put(
      dayKey,
      String((parseFloat(dailyCost || '0') + requestCost)),
      { expirationTtl: 24 * 60 * 60 }
    ),
  ]);
}