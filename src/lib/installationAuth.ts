/**
 * Installation-based Authentication System
 * Generates unique tokens per installation for secure API access
 */

import { logger } from './logger';
import { secureCrypto } from './secureCrypto';
import { API_CONFIG } from './constants';

interface InstallationData {
  installationId: string;
  apiToken?: string;
  refreshToken?: string;
  createdAt: number;
  lastRefreshed?: number;
}

export class InstallationAuth {
  private static readonly INSTALLATION_KEY = 'fluent_installation_data';
  private static readonly TOKEN_REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  /**
   * Initialize installation authentication on first install
   */
  static async initialize(): Promise<InstallationData> {
    try {
      // Check if already initialized
      const existing = await this.getInstallationData();
      if (existing && existing.apiToken) {
        logger.info('Installation already initialized');
        return existing;
      }
      
      // Generate new installation ID
      const installationId = crypto.randomUUID();
      const timestamp = Date.now();
      
      // Register with backend to get API tokens
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/installations/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          extensionVersion: chrome.runtime.getManifest().version,
          timestamp,
          platform: 'chrome',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }
      
      const { apiToken, refreshToken } = await response.json();
      
      // Store installation data securely
      const installationData: InstallationData = {
        installationId,
        apiToken,
        refreshToken,
        createdAt: timestamp,
        lastRefreshed: timestamp,
      };
      
      await this.storeInstallationData(installationData);
      logger.info('Installation registered successfully');
      
      return installationData;
    } catch (error) {
      logger.error('Failed to initialize installation', error);
      
      // Fallback to offline mode with just installation ID
      const installationId = crypto.randomUUID();
      const installationData: InstallationData = {
        installationId,
        createdAt: Date.now(),
      };
      
      await this.storeInstallationData(installationData);
      return installationData;
    }
  }
  
  /**
   * Get current installation data
   */
  static async getInstallationData(): Promise<InstallationData | null> {
    try {
      const result = await chrome.storage.local.get(this.INSTALLATION_KEY);
      return result[this.INSTALLATION_KEY] || null;
    } catch (error) {
      logger.error('Failed to get installation data', error);
      return null;
    }
  }
  
  /**
   * Store installation data securely
   */
  private static async storeInstallationData(data: InstallationData): Promise<void> {
    await chrome.storage.local.set({
      [this.INSTALLATION_KEY]: data,
    });
  }
  
  /**
   * Get authentication headers for API requests
   */
  static async getAuthHeaders(): Promise<Record<string, string>> {
    const installation = await this.getInstallationData();
    
    if (!installation) {
      throw new Error('Installation not initialized');
    }
    
    // Check if token needs refresh
    if (installation.apiToken && installation.lastRefreshed) {
      const timeSinceRefresh = Date.now() - installation.lastRefreshed;
      if (timeSinceRefresh > this.TOKEN_REFRESH_INTERVAL) {
        await this.refreshToken();
      }
    }
    
    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
      'X-Installation-ID': installation.installationId,
      'X-Timestamp': timestamp,
    };
    
    // If we have an API token, create signature
    if (installation.apiToken) {
      const message = `${installation.installationId}-${timestamp}`;
      const signature = await this.createSignature(message, installation.apiToken);
      headers['X-Signature'] = signature;
    }
    
    // Keep backward compatibility
    headers['X-Extension-Id'] = chrome.runtime.id;
    
    return headers;
  }
  
  /**
   * Create HMAC signature
   */
  private static async createSignature(message: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }
  
  /**
   * Refresh API token
   */
  static async refreshToken(): Promise<void> {
    const installation = await this.getInstallationData();
    
    if (!installation || !installation.refreshToken) {
      logger.warn('Cannot refresh token - no refresh token available');
      return;
    }
    
    try {
      const response = await fetch(`${API_CONFIG.TRANSLATOR_API}/installations/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installationId: installation.installationId,
          refreshToken: installation.refreshToken,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }
      
      const { apiToken, refreshToken } = await response.json();
      
      // Update stored data
      installation.apiToken = apiToken;
      installation.refreshToken = refreshToken;
      installation.lastRefreshed = Date.now();
      
      await this.storeInstallationData(installation);
      logger.info('Token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh token', error);
    }
  }
  
  /**
   * Check if installation is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const installation = await this.getInstallationData();
    return !!(installation && installation.apiToken);
  }
  
  /**
   * Get installation ID (for client-side caching keys)
   */
  static async getInstallationId(): Promise<string> {
    const installation = await this.getInstallationData();
    if (!installation) {
      // Initialize if not present
      const newInstallation = await this.initialize();
      return newInstallation.installationId;
    }
    return installation.installationId;
  }
}