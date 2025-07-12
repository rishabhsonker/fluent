/**
 * Environment Configuration Module
 * 
 * This module provides centralized access to environment-specific configuration
 * that is injected during the build process. The placeholders are replaced
 * by Vite's define plugin based on the build environment.
 * 
 * Build Process:
 * - Development: WORKER_URL = https://translator-dev.hq.workers.dev
 * - Production: WORKER_URL = https://translator.hq.workers.dev
 */

// These will be replaced during build by Vite
declare const __WORKER_URL__: string;
declare const __ENVIRONMENT__: 'development' | 'production';
declare const __BUILD_TIME__: string;

// Export configuration with fallbacks for local development
export const config = {
  // Worker URL - injected at build time
  WORKER_URL: (() => {
    try {
      return __WORKER_URL__;
    } catch {
      // Fallback for local development when not built
      return process.env.NODE_ENV === 'production' 
        ? 'https://translator.hq.workers.dev'
        : 'https://translator-dev.hq.workers.dev';
    }
  })(),

  // Environment - injected at build time
  ENVIRONMENT: (() => {
    try {
      return __ENVIRONMENT__;
    } catch {
      // Fallback for local development
      return (process.env.NODE_ENV || 'development') as 'development' | 'production';
    }
  })(),

  // Build timestamp - injected at build time
  BUILD_TIME: (() => {
    try {
      return __BUILD_TIME__;
    } catch {
      return new Date().toISOString();
    }
  })(),

  // Feature flags based on environment
  get isDevelopment() {
    return this.ENVIRONMENT === 'development';
  },

  get isProduction() {
    return this.ENVIRONMENT === 'production';
  },

  // Debug features only in development
  get enableDebugLogging() {
    return this.isDevelopment;
  },

  get enablePerformanceMonitoring() {
    return this.isDevelopment;
  },

  // API configuration
  get apiTimeout() {
    return this.isDevelopment ? 30000 : 10000; // 30s dev, 10s prod
  },

  get maxRetries() {
    return this.isDevelopment ? 5 : 3;
  },

  // Rate limiting
  get rateLimitPerHour() {
    return this.isDevelopment ? 1000 : 100;
  },

  get dailyTranslationLimit() {
    return this.isDevelopment ? 10000 : 1000;
  }
};

// Type-safe config export
export type Config = typeof config;

// Log configuration in development
if (config.isDevelopment && typeof console !== 'undefined') {
  console.log('[Fluent] Environment Config:', {
    WORKER_URL: config.WORKER_URL,
    ENVIRONMENT: config.ENVIRONMENT,
    BUILD_TIME: config.BUILD_TIME
  });
}