/**
 * Simple authentication module using D1
 * For fresh start with no legacy KV data
 */

import { logInfo, logError } from './logger.js';
import { InstallationDB } from './database.js';
import { safe } from './utils.js';

const INSTALLATION_ID_HEADER = 'X-Installation-Id';

/**
 * Verify authentication and track installation
 */
export async function verifyAuthentication(request, env) {
  const installationId = request.headers.get(INSTALLATION_ID_HEADER);
  
  if (!installationId) {
    return { 
      isAuthenticated: false, 
      status: 401, 
      message: 'Missing installation ID' 
    };
  }

  return await safe(async () => {
    const { DB } = env;
    
    // Extract metadata from headers
    const metadata = {
      version: request.headers.get('X-Extension-Version') || '1.0.0',
      browser: request.headers.get('X-Browser') || 'unknown',
      platform: request.headers.get('X-Platform') || 'unknown'
    };
    
    // Use the centralized database operation
    const installation = await InstallationDB.upsert(DB, installationId, metadata);
    
    return {
      isAuthenticated: true,
      installationId,
      userId: installation?.user || null
    };
  }, 'Authentication error', {
    isAuthenticated: false,
    status: 500,
    message: 'Authentication failed'
  });
}

/**
 * Check if user has reached usage limits
 */
export async function checkUsageLimits(userId, env, type = 'translations') {
  if (!userId) {
    // Free tier limits for anonymous users
    return {
      allowed: true,
      translationsRemaining: 50,
      hintsRemaining: 10
    };
  }
  
  const { DB } = env;
  
  return await safe(async () => {
    // Use the centralized database operations
    const { UserDB, UsageDB } = await import('./database.js');
    
    // Get user's plan
    const user = await UserDB.getById(DB, userId);
    const plan = user?.plan || 'free';
    
    // Check limits using centralized operation
    const limitCheck = await UsageDB.checkLimits(DB, userId, plan, type);
    
    // Get hints limit too if checking translations
    if (type === 'translations') {
      const hintsCheck = await UsageDB.checkLimits(DB, userId, plan, 'hints');
      return {
        allowed: limitCheck.allowed,
        translationsRemaining: limitCheck.remaining,
        hintsRemaining: hintsCheck.remaining
      };
    }
    
    return limitCheck;
  }, 'Error checking usage limits', { allowed: true, translationsRemaining: 50, hintsRemaining: 10 });
}

/**
 * Track usage for rate limiting
 */
export async function trackUsage(userId, type, env) {
  if (!userId) return;
  
  const { DB } = env;
  
  await safe(async () => {
    // Use the centralized database operations
    const { UsageDB } = await import('./database.js');
    
    // Map type to the correct column name
    const usageType = type === 'translation' ? 'translations' : 'hints';
    
    // Use centralized increment operation
    await UsageDB.increment(DB, userId, usageType);
  }, `Error tracking ${type} usage`);
}

export default {
  verifyAuthentication,
  checkUsageLimits,
  trackUsage
};