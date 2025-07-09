/**
 * Installation-based authentication for Fluent Extension
 * Generates unique tokens for each extension installation
 */

import { SecureCrypto } from './secureCrypto';
import { API_CONFIG } from './constants';
import { logger } from './logger';

interface InstallationData {
  installationId: string;
  token: string;
  createdAt: number;
  lastRefreshed: number;
}

export class InstallationAuth {
  private static readonly STORAGE_KEY = 'fluent_installation_auth';
  private static readonly TOKEN_REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  /**
   * Initialize authentication on extension install/update
   */
  static async initialize(): Promise<void> {
    try {
      const existingAuth = await this.getStoredAuth();
      
      if (!existingAuth || this.shouldRefreshToken(existingAuth)) {
        await this.registerNewInstallation();
      }
    } catch (error) {
      logger.error('Failed to initialize installation auth:', error);
      throw new Error('Authentication initialization failed');
    }
  }
  
  /**
   * Get the current installation token
   */
  static async getToken(): Promise<string> {
    const auth = await this.getStoredAuth();
    
    if (!auth) {
      await this.registerNewInstallation();
      const newAuth = await this.getStoredAuth();
      if (!newAuth) {
        throw new Error('Failed to obtain installation token');
      }
      return newAuth.token;
    }
    
    if (this.shouldRefreshToken(auth)) {
      await this.refreshToken(auth);
      const refreshedAuth = await this.getStoredAuth();
      if (!refreshedAuth) {
        throw new Error('Failed to refresh installation token');
      }
      return refreshedAuth.token;
    }
    
    return auth.token;
  }
  
  /**
   * Get installation ID
   */
  static async getInstallationId(): Promise<string> {
    const auth = await this.getStoredAuth();
    if (!auth) {
      await this.initialize();
      const newAuth = await this.getStoredAuth();
      if (!newAuth) {
        throw new Error('Failed to obtain installation ID');
      }
      return newAuth.installationId;
    }
    return auth.installationId;
  }
  
  /**
   * Register a new installation with the server
   */
  private static async registerNewInstallation(): Promise<void> {
    const installationId = crypto.randomUUID();
    
    try {
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          extensionVersion: chrome.runtime.getManifest().version,
          timestamp: Date.now(),
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }
      
      const { token } = await response.json();
      
      const installationData: InstallationData = {
        installationId,
        token,
        createdAt: Date.now(),
        lastRefreshed: Date.now(),
      };
      
      await this.storeAuth(installationData);
      logger.info('Successfully registered new installation');
    } catch (error) {
      logger.error('Failed to register installation:', error);
      throw error;
    }
  }
  
  /**
   * Refresh an existing token
   */
  private static async refreshToken(auth: InstallationData): Promise<void> {
    try {
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          installationId: auth.installationId,
          timestamp: Date.now(),
        }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid, need to re-register
          await this.registerNewInstallation();
          return;
        }
        throw new Error(`Token refresh failed: ${response.status}`);
      }
      
      const { token } = await response.json();
      
      const updatedAuth: InstallationData = {
        ...auth,
        token,
        lastRefreshed: Date.now(),
      };
      
      await this.storeAuth(updatedAuth);
      logger.info('Successfully refreshed installation token');
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw error;
    }
  }
  
  /**
   * Check if token should be refreshed
   */
  private static shouldRefreshToken(auth: InstallationData): boolean {
    const timeSinceRefresh = Date.now() - auth.lastRefreshed;
    return timeSinceRefresh > this.TOKEN_REFRESH_INTERVAL;
  }
  
  /**
   * Store authentication data securely
   */
  private static async storeAuth(data: InstallationData): Promise<void> {
    const encrypted = await SecureCrypto.encrypt(JSON.stringify(data));
    await chrome.storage.local.set({
      [this.STORAGE_KEY]: encrypted,
    });
  }
  
  /**
   * Retrieve stored authentication data
   */
  private static async getStoredAuth(): Promise<InstallationData | null> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      if (!result[this.STORAGE_KEY]) {
        return null;
      }
      
      const decrypted = await SecureCrypto.decrypt(result[this.STORAGE_KEY]);
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to retrieve stored auth:', error);
      return null;
    }
  }
  
  /**
   * Clear stored authentication (for logout/reset)
   */
  static async clear(): Promise<void> {
    await chrome.storage.local.remove(this.STORAGE_KEY);
    logger.info('Cleared installation authentication');
  }
  
  /**
   * Get authentication headers for API requests
   */
  static async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    const installationId = await this.getInstallationId();
    
    return {
      'Authorization': `Bearer ${token}`,
      'X-Installation-Id': installationId,
      'X-Timestamp': Date.now().toString(),
    };
  }
  
  /**
   * Get stored installation data (for checking existence)
   */
  static async getInstallationData(): Promise<InstallationData | null> {
    return this.getStoredAuth();
  }
}