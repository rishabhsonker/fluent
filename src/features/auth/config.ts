/**
 * Authentication configuration for Fluent Extension
 * Uses installation-based authentication with unique tokens per installation
 */

import { TIME, NUMERIC } from '../../shared/constants';

export const AUTH_CONFIG = {
  /**
   * Token expiry time in milliseconds
   */
  TOKEN_EXPIRY_MS: NUMERIC.MINUTES_SHORT * TIME.MS_PER_MINUTE, // 5 minutes
  
  /**
   * Token refresh interval (7 days)
   */
  TOKEN_REFRESH_INTERVAL: TIME.DAYS_PER_WEEK * TIME.MS_PER_DAY,
  
  /**
   * API endpoints
   */
  ENDPOINTS: {
    REGISTER: '/installations/register',
    REFRESH: '/auth/refresh',
  },
} as const;