/**
 * Authentication configuration for Fluent Extension
 * Uses installation-based authentication with unique tokens per installation
 */

export const AUTH_CONFIG = {
  /**
   * Token expiry time in milliseconds
   */
  TOKEN_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Token refresh interval (7 days)
   */
  TOKEN_REFRESH_INTERVAL: 7 * 24 * 60 * 60 * 1000,
  
  /**
   * API endpoints
   */
  ENDPOINTS: {
    REGISTER: '/installations/register',
    REFRESH: '/auth/refresh',
  },
} as const;