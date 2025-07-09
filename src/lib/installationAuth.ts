/**
 * Installation-based authentication for Fluent Extension
 * Generates unique tokens for each extension installation
 */

import { secureCrypto } from './secureCrypto';
import { API_CONFIG } from './constants';
import { logger } from './logger';
import { fetchWithRetry } from './networkUtils';

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
      logger.info('No existing auth, registering new installation');
      await this.registerNewInstallation();
      const newAuth = await this.getStoredAuth();
      if (!newAuth) {
        throw new Error('Failed to obtain installation token');
      }
      logger.info('New auth obtained:', { installationId: newAuth.installationId });
      return newAuth.token;
    }
    
    if (this.shouldRefreshToken(auth)) {
      logger.info('Token refresh needed');
      await this.refreshToken(auth);
      const refreshedAuth = await this.getStoredAuth();
      if (!refreshedAuth) {
        throw new Error('Failed to refresh installation token');
      }
      return refreshedAuth.token;
    }
    
    logger.debug('Using existing token for installation:', auth.installationId);
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
    
    logger.info('Attempting to register new installation:', {
      installationId,
      endpoint: `${API_CONFIG.TRANSLATOR_API}/installations/register`
    });
    
    try {
      const response = await fetchWithRetry(
        `${API_CONFIG.TRANSLATOR_API}/installations/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            installationId,
            extensionVersion: chrome.runtime.getManifest().version,
            timestamp: Date.now(),
          }),
        },
        {
          maxRetries: 5, // More retries for registration since it's critical
          initialDelay: 2000, // Start with 2 seconds
          onRetry: (attempt) => {
            logger.info(`Registration retry attempt ${attempt}/${5}`);
          }
        }
      );
      
      logger.info('Registration response:', {
        status: response.status,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        // If 404, the auth endpoint might not be implemented yet
        if (response.status === 404) {
          logger.warn('Auth endpoint not found, fallback auth will not work properly');
          // Don't use fallback auth as it won't work with the Bearer token format
          throw new Error('Installation registration endpoint not available');
        }
        const errorText = await response.text();
        logger.error('Registration failed:', { status: response.status, error: errorText });
        throw new Error(`Registration failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      logger.info('Registration successful:', { 
        hasToken: !!data.token,
        hasRefreshToken: !!data.refreshToken,
        expiresIn: data.expiresIn
      });
      
      const installationData: InstallationData = {
        installationId,
        token: data.token || data.apiToken, // Handle both possible field names
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
   * Currently disabled as the worker doesn't have a refresh endpoint
   */
  private static shouldRefreshToken(auth: InstallationData): boolean {
    return false;
  }
  
  /**
   * Store authentication data securely
   */
  private static async storeAuth(data: InstallationData): Promise<void> {
    const encrypted = await secureCrypto.encrypt(JSON.stringify(data));
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
      
      const decrypted = await secureCrypto.decrypt(result[this.STORAGE_KEY]);
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
    const timestamp = Date.now().toString();
    
    logger.info('Building auth headers:', {
      hasToken: !!token,
      tokenLength: token?.length,
      installationId: installationId
    });
    
    if (!token || !installationId) {
      logger.error('Missing auth credentials:', { hasToken: !!token, hasInstallationId: !!installationId });
      throw new Error('Authentication not initialized');
    }
    
    // Generate signature using HMAC-SHA256
    const signature = await this.generateSignature(installationId, timestamp);
    
    return {
      'Authorization': `Bearer ${token}`,
      'X-Installation-Id': installationId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    };
  }
  
  /**
   * Generate HMAC signature for request verification
   */
  private static async generateSignature(installationId: string, timestamp: string): Promise<string> {
    try {
      // Use the installation token as the signing key
      const token = await this.getToken();
      const message = `${installationId}-${timestamp}`;
      
      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const keyData = encoder.encode(token);
      const messageData = encoder.encode(message);
      
      // Import key for HMAC
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      // Generate signature
      const signature = await crypto.subtle.sign('HMAC', key, messageData);
      
      // Convert to base64
      return btoa(String.fromCharCode(...new Uint8Array(signature)));
    } catch (error) {
      logger.error('Failed to generate signature:', error);
      throw error;
    }
  }
  
  /**
   * Get stored installation data (for checking existence)
   */
  static async getInstallationData(): Promise<InstallationData | null> {
    const data = await this.getStoredAuth();
    logger.info('Getting installation data:', {
      hasData: !!data,
      installationId: data?.installationId,
      hasToken: !!data?.token
    });
    return data;
  }
}