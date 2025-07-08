/**
 * Shared authentication configuration for Fluent Extension
 * This file contains the shared secret used for authentication between the extension and Cloudflare Worker
 */

export const AUTH_CONFIG = {
  /**
   * Shared secret key for authentication
   * This must match the FLUENT_SHARED_SECRET environment variable in the Cloudflare Worker
   */
  SHARED_SECRET: 'fluent-extension-2024-shared-secret-key',
  
  /**
   * Token expiry time in milliseconds
   */
  TOKEN_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
} as const;