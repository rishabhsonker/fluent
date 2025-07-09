/**
 * Authentication configuration for Fluent Extension
 * This file contains authentication configuration and helpers
 */

export const AUTH_CONFIG = {
  /**
   * DEPRECATED: Shared secret key for authentication
   * This is being phased out in favor of installation-based tokens
   * Only used as fallback for backward compatibility
   */
  SHARED_SECRET: process.env.FLUENT_SHARED_SECRET || 'DEPRECATED-DO-NOT-USE',
  
  /**
   * Token expiry time in milliseconds
   */
  TOKEN_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Authentication mode
   * 'installation' - Use unique installation tokens (recommended)
   * 'shared' - Use shared secret (deprecated, for backward compatibility only)
   */
  AUTH_MODE: 'installation' as 'installation' | 'shared',
  
  /**
   * Get authentication headers based on current mode
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.AUTH_MODE === 'installation') {
      const { InstallationAuth } = await import('../lib/installationAuth');
      const token = await InstallationAuth.getToken();
      const installationId = await InstallationAuth.getInstallationId();
      
      return {
        'Authorization': `Bearer ${token}`,
        'X-Installation-Id': installationId,
      };
    }
    
    // Fallback to shared secret (deprecated)
    return {
      'X-Shared-Secret': this.SHARED_SECRET,
    };
  },
} as const;