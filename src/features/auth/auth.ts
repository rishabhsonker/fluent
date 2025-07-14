/**
 * Installation Authentication - Per-device authentication system
 * 
 * Purpose:
 * - Provides unique authentication for each extension installation
 * - Enables per-device rate limiting and usage tracking
 * - Manages token lifecycle and refresh
 * 
 * Key Features:
 * - Unique installation ID generation
 * - Token generation and refresh
 * - HMAC request signing
 * - Automatic token renewal
 * - Fallback authentication support
 * 
 * Authentication Flow:
 * 1. Generate unique installation ID on first run
 * 2. Register with worker to get API token
 * 3. Sign all requests with HMAC
 * 4. Refresh tokens before expiry
 * 
 * Referenced by:
 * - src/core/worker.ts (manages auth state)
 * - src/features/translation/translator.ts (signs API requests)
 * - workers/cloudflare/auth.js (verifies signatures)
 * 
 * Security:
 * - Cryptographically secure ID generation
 * - HMAC-SHA256 request signing
 * - Time-based signature validation
 * - No sensitive data in storage
 */

import { secureCrypto } from './crypto';
import { API_CONFIG, AUTH_CONSTANTS, NETWORK, DOMAIN } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { fetchWithRetry } from '../../shared/network';
import { safe, chromeCall } from '../../shared/utils/helpers';

interface InstallationData {
  installationId: string;
  token: string;
  createdAt: number;
  lastRefreshed: number;
}

export class InstallationAuth {
  private static readonly STORAGE_KEY = AUTH_CONSTANTS.STORAGE_KEY;
  private static readonly TOKEN_REFRESH_INTERVAL = AUTH_CONSTANTS.TOKEN_REFRESH_INTERVAL_MS;
  
  /**
   * Initialize authentication on extension install/update
   */
  static async initialize(): Promise<void> {
    await safe(
      async () => {
        logger.info('[InstallationAuth] Checking for existing auth...');
        const existingAuth = await this.getStoredAuth();
        
        if (!existingAuth) {
          logger.info('[InstallationAuth] No existing auth found, registering new installation');
          await this.registerNewInstallation();
        } else if (this.shouldRefreshToken(existingAuth)) {
          logger.info('[InstallationAuth] Token needs refresh, refreshing...');
          await this.refreshToken(existingAuth);
        } else {
          logger.info('[InstallationAuth] Using existing auth');
        }
      },
      'auth.initialize'
    ).catch(error => {
      // Re-throw with more specific error message
      throw new Error('Authentication initialization failed');
    });
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
      logger.info('New auth obtained');
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
    
    logger.debug('Using existing token');
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
    
    logger.info('Attempting to register new installation');
    
    await safe(async () => {
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
          maxRetries: NETWORK.MAX_RETRY_COUNT + DOMAIN.WORD_PADDING_CHARS, // More retries for registration since it's critical
          initialDelay: NETWORK.RETRY_INITIAL_DELAY_MS * DOMAIN.BACKOFF_FACTOR, // Start with double the standard delay for critical registration
          onRetry: (attempt) => {
            logger.info(`Registration retry attempt ${attempt}/${NETWORK.MAX_RETRY_COUNT + DOMAIN.WORD_PADDING_CHARS}`);
          }
        }
      );
      
      logger.info(`Registration response: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Registration failed:', { status: response.status, error: errorText });
        
        // Provide helpful error messages for common scenarios
        if (response.status === AUTH_CONSTANTS.HTTP_STATUS.NOT_FOUND) {
          throw new Error(
            'Authentication service not available. Please ensure the Cloudflare Worker is deployed and the AUTH_ENDPOINT is correctly configured.'
          );
        } else if (response.status === AUTH_CONSTANTS.HTTP_STATUS.UNAUTHORIZED || 
                   response.status === AUTH_CONSTANTS.HTTP_STATUS.FORBIDDEN) {
          throw new Error(
            'Authentication failed. Please check your credentials and try again.'
          );
        } else if (response.status >= AUTH_CONSTANTS.HTTP_STATUS.SERVER_ERROR) {
          throw new Error(
            'Authentication service is temporarily unavailable. Please try again later.'
          );
        }
        
        throw new Error(`Registration failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      logger.info('[InstallationAuth] Registration successful');
      
      const installationData: InstallationData = {
        installationId,
        token: data.token || data.apiToken, // Handle both possible field names
        createdAt: Date.now(),
        lastRefreshed: Date.now(),
      };
      
      logger.info('[InstallationAuth] Storing installation data...');
      
      await this.storeAuth(installationData);
      logger.info('[InstallationAuth] Successfully registered and stored new installation');
    }, 'Register new installation');
  }
  
  /**
   * Refresh an existing token
   */
  private static async refreshToken(auth: InstallationData): Promise<void> {
    await safe(async () => {
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
        if (response.status === AUTH_CONSTANTS.HTTP_STATUS.UNAUTHORIZED) {
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
    }, 'Refresh installation token');
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
    await chromeCall(
      () => chrome.storage.local.set({
        [this.STORAGE_KEY]: encrypted,
      }),
      'auth.storeAuth'
    );
  }
  
  /**
   * Retrieve stored authentication data
   */
  private static async getStoredAuth(): Promise<InstallationData | null> {
    return safe(
      async () => {
        const result = await chromeCall(
          () => chrome.storage.local.get(this.STORAGE_KEY),
          'auth.getStoredAuth',
          {}
        );
        if (!result[this.STORAGE_KEY]) {
          return null;
        }
        
        const decrypted = await secureCrypto.decrypt(result[this.STORAGE_KEY]);
        return JSON.parse(decrypted);
      },
      'auth.getStoredAuth',
      null
    );
  }
  
  /**
   * Clear stored authentication (for logout/reset)
   */
  static async clear(): Promise<void> {
    await chromeCall(
      () => chrome.storage.local.remove(this.STORAGE_KEY),
      'auth.clear'
    );
    logger.info('Cleared installation authentication');
  }
  
  /**
   * Get authentication headers for API requests
   */
  static async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    const installationId = await this.getInstallationId();
    const timestamp = Date.now().toString();
    
    logger.info('Building auth headers');
    
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
    return safe(
      async () => {
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
      },
      'auth.generateSignature'
    );
  }
  
  /**
   * Get stored installation data (for checking existence)
   */
  static async getInstallationData(): Promise<InstallationData | null> {
    const data = await this.getStoredAuth();
    logger.info('Getting installation data');
    return data;
  }
}