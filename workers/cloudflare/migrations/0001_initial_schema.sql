-- Fluent Database Schema for Cloudflare D1
-- Generated: July 2025
-- This schema includes all tables, indexes, and constraints for production use

-- =====================================================
-- CORE TABLES
-- =====================================================

-- 1. Translations cache table
CREATE TABLE IF NOT EXISTS translations (
    word TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('es', 'fr', 'de')),
    translation TEXT NOT NULL,
    pronunciation TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5),
    context TEXT NOT NULL, -- JSON array
    etymology TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (word, language)
);

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT 0,
    plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'plus')),
    stripe_id TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. Installations table
CREATE TABLE IF NOT EXISTS installations (
    id TEXT PRIMARY KEY,
    user TEXT REFERENCES users(id) ON DELETE SET NULL,
    version TEXT NOT NULL,
    browser TEXT NOT NULL CHECK(browser IN ('chrome', 'edge', 'brave')),
    platform TEXT NOT NULL,
    first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 4. User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'es' CHECK(language IN ('es', 'fr', 'de')),
    experience INTEGER NOT NULL DEFAULT 1 CHECK(experience BETWEEN 1 AND 5),
    expectations INTEGER NOT NULL DEFAULT 3 CHECK(expectations BETWEEN 1 AND 5),
    density INTEGER NOT NULL DEFAULT 3 CHECK(density BETWEEN 1 AND 5),
    pronunciation BOOLEAN NOT NULL DEFAULT 1,
    hints BOOLEAN NOT NULL DEFAULT 1,
    blocklist TEXT, -- JSON array
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =====================================================
-- USAGE & ANALYTICS TABLES
-- =====================================================

-- 5. Daily usage tracking table
CREATE TABLE IF NOT EXISTS user_tracking (
    user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    translations INTEGER NOT NULL DEFAULT 0,
    hints INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    pages INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 6. Lifetime statistics table
CREATE TABLE IF NOT EXISTS user_stats (
    user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    translations INTEGER NOT NULL DEFAULT 0,
    hints INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    pages INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    vocabulary INTEGER NOT NULL DEFAULT 0,
    lexicon INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 7. Word progress tracking table
CREATE TABLE IF NOT EXISTS word_progress (
    user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('es', 'fr', 'de')),
    views INTEGER NOT NULL DEFAULT 1,
    interactions INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    learned_at INTEGER,
    PRIMARY KEY (user, word, language)
);

-- =====================================================
-- BUSINESS TABLES
-- =====================================================

-- 8. Billing events table
CREATE TABLE IF NOT EXISTS billing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    amount INTEGER,
    currency TEXT DEFAULT 'USD',
    metadata TEXT, -- JSON
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 9. Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred TEXT REFERENCES users(id) ON DELETE SET NULL,
    installation TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_expires_at ON users(expires_at) WHERE expires_at IS NOT NULL;

-- Installation queries
CREATE INDEX IF NOT EXISTS idx_installations_user ON installations(user) WHERE user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_installations_last_seen ON installations(last_seen);

-- Word progress queries
CREATE INDEX IF NOT EXISTS idx_word_progress_user ON word_progress(user);
CREATE INDEX IF NOT EXISTS idx_word_progress_word ON word_progress(word);
CREATE INDEX IF NOT EXISTS idx_word_progress_learned ON word_progress(user, learned_at) WHERE learned_at IS NOT NULL;

-- Billing queries
CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user);
CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events(created_at);

-- Referral queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer);
CREATE INDEX IF NOT EXISTS idx_referrals_installation ON referrals(installation);

-- Translation cache performance
CREATE INDEX IF NOT EXISTS idx_translations_word ON translations(word);
CREATE INDEX IF NOT EXISTS idx_translations_language ON translations(language);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- =====================================================

-- Update users.updated_at on any change
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Update user_preferences.updated_at on any change
CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp 
AFTER UPDATE ON user_preferences
BEGIN
    UPDATE user_preferences SET updated_at = unixepoch() WHERE user = NEW.user;
END;

-- Update user_tracking.updated_at on any change
CREATE TRIGGER IF NOT EXISTS update_user_tracking_timestamp 
AFTER UPDATE ON user_tracking
BEGIN
    UPDATE user_tracking SET updated_at = unixepoch() WHERE user = NEW.user;
END;

-- Update installations.last_seen on any update
CREATE TRIGGER IF NOT EXISTS update_installations_last_seen 
AFTER UPDATE ON installations
BEGIN
    UPDATE installations SET last_seen = unixepoch() WHERE id = NEW.id;
END;

-- Update word_progress.last_seen when views increment
CREATE TRIGGER IF NOT EXISTS update_word_progress_last_seen 
AFTER UPDATE OF views ON word_progress
BEGIN
    UPDATE word_progress SET last_seen = unixepoch() 
    WHERE user = NEW.user AND word = NEW.word AND language = NEW.language;
END;

-- =====================================================
-- INITIAL DATA (Optional)
-- =====================================================

-- Insert default preferences for new users (handled by application logic instead)
-- INSERT INTO user_preferences (user) SELECT id FROM users WHERE id NOT IN (SELECT user FROM user_preferences);