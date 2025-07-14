/**
 * Database module for D1 operations
 * Clean, focused implementation for the new schema
 */

import { logInfo, logError } from './logger.js';
import { safe } from './utils.js';
import { DATABASE } from './constants.js';

/**
 * Installation operations
 */
export const InstallationDB = {
  /**
   * Register or update an installation
   * @param {D1Database} db
   * @param {string} installationId
   * @param {Object} metadata - Browser, version, platform info
   * @returns {Promise<Object>} Installation record
   */
  async upsert(db, installationId, metadata = {}) {
    return await safe(async () => {
      const existing = await db.prepare(
        'SELECT * FROM installations WHERE id = ?'
      ).bind(installationId).first();
      
      if (existing) {
        // Update last seen
        await db.prepare(
          'UPDATE installations SET last_seen = unixepoch() WHERE id = ?'
        ).bind(installationId).run();
        return existing;
      }
      
      // Create new installation
      await db.prepare(`
        INSERT INTO installations (id, version, browser, platform)
        VALUES (?, ?, ?, ?)
      `).bind(
        installationId,
        metadata.version || 'unknown',
        metadata.browser || 'unknown',
        metadata.platform || 'unknown'
      ).run();
      
      logInfo('New installation registered', { installationId });
      return { id: installationId, user: null };
    }, 'Failed to upsert installation');
  }
};

/**
 * User operations
 */
export const UserDB = {
  /**
   * Get user by ID
   * @param {D1Database} db
   * @param {string} userId
   * @returns {Promise<Object|null>} User record
   */
  async getById(db, userId) {
    return await safe(
      async () => db.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(userId).first(),
      'Failed to get user',
      null
    );
  },

  /**
   * Create new user
   * @param {D1Database} db
   * @param {string} email
   * @returns {Promise<Object>} Created user
   */
  async create(db, email) {
    const userId = crypto.randomUUID();
    return await safe(async () => {
      await db.prepare(`
        INSERT INTO users (id, email, verified, plan)
        VALUES (?, ?, 0, 'free')
      `).bind(userId, email).run();
      
      return { id: userId, email, plan: 'free', verified: false };
    }, 'Failed to create user');
  },

  /**
   * Link installation to user
   * @param {D1Database} db
   * @param {string} installationId
   * @param {string} userId
   */
  async linkInstallation(db, installationId, userId) {
    await safe(async () => {
      await db.prepare(`
        UPDATE installations SET user = ? WHERE id = ?
      `).bind(userId, installationId).run();
    }, 'Failed to link installation');
  }
};

/**
 * Usage tracking operations
 */
export const UsageDB = {
  /**
   * Get or create today's usage record
   * @param {D1Database} db
   * @param {string} userId
   * @returns {Promise<Object>} Usage record
   */
  async getTodayUsage(db, userId) {
    return await safe(async () => {
      let usage = await db.prepare(
        'SELECT * FROM user_tracking WHERE user = ?'
      ).bind(userId).first();
      
      if (!usage) {
        // Create new tracking record
        await db.prepare(`
          INSERT INTO user_tracking (user, translations, hints, sessions, pages, impressions)
          VALUES (?, 0, 0, 0, 0, 0)
        `).bind(userId).run();
        
        usage = {
          user: userId,
          translations: 0,
          hints: 0,
          sessions: 0,
          pages: 0,
          impressions: 0
        };
      }
      
      return usage;
    }, 
    'Failed to get usage',
    { translations: 0, hints: 0 });
  },

  /**
   * Increment usage counter
   * @param {D1Database} db
   * @param {string} userId
   * @param {string} type - 'translations' or 'hints'
   */
  async increment(db, userId, type) {
    await safe(async () => {
      await db.prepare(`
        INSERT INTO user_tracking (user, ${type})
        VALUES (?, 1)
        ON CONFLICT(user) DO UPDATE SET
          ${type} = ${type} + 1,
          updated_at = unixepoch()
      `).bind(userId).run();
      
      // Also update lifetime stats
      await db.prepare(`
        INSERT INTO user_stats (user, ${type}, last_seen)
        VALUES (?, 1, unixepoch())
        ON CONFLICT(user) DO UPDATE SET
          ${type} = ${type} + 1,
          last_seen = unixepoch()
      `).bind(userId).run();
    }, `Failed to increment ${type}`);
  },

  /**
   * Check if user is within limits
   * @param {D1Database} db
   * @param {string} userId
   * @param {string} plan
   * @param {string} type - 'translations' or 'hints'
   * @returns {Promise<Object>} Limit check result
   */
  async checkLimits(db, userId, plan, type) {
    const limits = DATABASE.PLANS;
    
    const usage = await this.getTodayUsage(db, userId);
    const userLimits = limits[plan] || limits.free;
    const current = usage[type] || 0;
    const limit = userLimits[type];
    
    return {
      allowed: current < limit,
      current,
      limit,
      remaining: Math.max(0, limit - current)
    };
  }
};

/**
 * Translation cache operations
 */
export const TranslationDB = {
  /**
   * Get cached translations
   * @param {D1Database} db
   * @param {string[]} words
   * @param {string} language
   * @returns {Promise<Object>} Map of word to translation data
   */
  async getBatch(db, words, language) {
    if (!words.length) return {};
    
    return await safe(async () => {
      const placeholders = words.map(() => '?').join(',');
      const results = await db.prepare(`
        SELECT * FROM translations 
        WHERE word IN (${placeholders}) AND language = ?
      `).bind(...words, language).all();
      
      const cache = {};
      for (const row of results.results) {
        cache[row.word] = {
          translation: row.translation,
          pronunciation: row.pronunciation,
          level: row.level,
          context: JSON.parse(row.context || '[]'),
          etymology: row.etymology
        };
      }
      
      return cache;
    }, 'Failed to get translations', {});
  },

  /**
   * Store translations in cache
   * @param {D1Database} db
   * @param {string} language
   * @param {Object} translations - Map of word to translation data
   */
  async storeBatch(db, language, translations) {
    await safe(async () => {
      const stmt = db.prepare(`
        INSERT INTO translations (word, language, translation, pronunciation, level, context, etymology)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(word, language) DO UPDATE SET
          translation = excluded.translation,
          pronunciation = excluded.pronunciation,
          level = excluded.level,
          context = excluded.context,
          etymology = excluded.etymology
      `);
      
      const batch = [];
      for (const [word, data] of Object.entries(translations)) {
        batch.push(stmt.bind(
          word,
          language,
          data.translation,
          data.pronunciation || '',
          data.level || 3,
          JSON.stringify(data.context || []),
          data.etymology || ''
        ));
      }
      
      await db.batch(batch);
      logInfo(`Cached ${batch.length} translations`);
    }, 'Failed to store translations');
  }
};

/**
 * Word progress operations
 */
export const WordProgressDB = {
  /**
   * Record word view/interaction
   * @param {D1Database} db
   * @param {string} userId
   * @param {string} word
   * @param {string} language
   * @param {boolean} wasClicked
   */
  async recordView(db, userId, word, language, wasClicked = false) {
    await safe(async () => {
      const existing = await db.prepare(`
        SELECT * FROM word_progress 
        WHERE user = ? AND word = ? AND language = ?
      `).bind(userId, word, language).first();
      
      if (existing) {
        await db.prepare(`
          UPDATE word_progress
          SET views = views + 1,
              interactions = interactions + ?,
              last_seen = unixepoch()
          WHERE user = ? AND word = ? AND language = ?
        `).bind(wasClicked ? 1 : 0, userId, word, language).run();
      } else {
        await db.prepare(`
          INSERT INTO word_progress (user, word, language, views, interactions)
          VALUES (?, ?, ?, 1, ?)
        `).bind(userId, word, language, wasClicked ? 1 : 0).run();
      }
      
      // Update user stats
      await db.prepare(`
        UPDATE user_stats 
        SET impressions = impressions + 1,
            last_seen = unixepoch()
        WHERE user = ?
      `).bind(userId).run();
    }, 'Failed to record word view');
  },

  /**
   * Mark word as learned
   * @param {D1Database} db
   * @param {string} userId
   * @param {string} word
   * @param {string} language
   */
  async markLearned(db, userId, word, language) {
    await safe(async () => {
      await db.prepare(`
        UPDATE word_progress
        SET learned_at = unixepoch()
        WHERE user = ? AND word = ? AND language = ?
      `).bind(userId, word, language).run();
      
      // Update vocabulary count
      await db.prepare(`
        UPDATE user_stats
        SET vocabulary = vocabulary + 1
        WHERE user = ?
      `).bind(userId).run();
    }, 'Failed to mark word as learned');
  }
};

/**
 * Analytics operations using existing tracking tables
 */
export const AnalyticsDB = {
  /**
   * Get translation counts for cost estimation
   * @param {D1Database} db
   * @param {number} sinceTimestamp - Unix timestamp
   * @returns {Promise<number>} Translation count
   */
  async getTranslationCount(db, sinceTimestamp) {
    return await safe(async () => {
      // Get count from user_tracking for recent activity
      const result = await db.prepare(`
        SELECT SUM(translations) as count 
        FROM user_tracking 
        WHERE updated_at >= ?
      `).bind(sinceTimestamp).first();
      
      return result?.count || 0;
    }, 'Failed to get translation count', 0);
  },

  /**
   * Get usage statistics for a time period
   * @param {D1Database} db
   * @param {string} userId
   * @param {number} sinceTimestamp
   */
  async getUsageStats(db, userId, sinceTimestamp) {
    return await safe(async () => {
      const result = await db.prepare(`
        SELECT 
          SUM(translations) as translations,
          SUM(hints) as hints,
          SUM(pages) as pages,
          SUM(impressions) as impressions
        FROM user_tracking 
        WHERE user = ? AND updated_at >= ?
      `).bind(userId, sinceTimestamp).first();
      
      return result || { translations: 0, hints: 0, pages: 0, impressions: 0 };
    }, 'Failed to get usage stats', { translations: 0, hints: 0, pages: 0, impressions: 0 });
  }
};

/**
 * Daily maintenance operations
 */
export const MaintenanceDB = {
  /**
   * Reset daily tracking (called at midnight UTC)
   * @param {D1Database} db
   */
  async resetDailyTracking(db) {
    await safe(async () => {
      // Archive today's data to user_stats
      await db.prepare(`
        INSERT INTO user_stats (user, translations, hints, sessions, pages, impressions)
        SELECT user, translations, hints, sessions, pages, impressions
        FROM user_tracking
        ON CONFLICT(user) DO UPDATE SET
          translations = user_stats.translations + excluded.translations,
          hints = user_stats.hints + excluded.hints,
          sessions = user_stats.sessions + excluded.sessions,
          pages = user_stats.pages + excluded.pages,
          impressions = user_stats.impressions + excluded.impressions
      `).run();
      
      // Reset daily counters
      await db.prepare(`
        UPDATE user_tracking 
        SET translations = 0, hints = 0, sessions = 0, 
            pages = 0, impressions = 0,
            created_at = unixepoch(),
            updated_at = unixepoch()
      `).run();
      
      logInfo('Daily tracking reset completed');
    }, 'Failed to reset daily tracking');
  }
};