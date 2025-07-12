/**
 * Secure Crypto Module - Proper encryption for sensitive data
 * Uses Web Crypto API with AES-GCM encryption
 */

import { logger } from '../../shared/logger';
import { SECURITY } from '../../shared/constants';

interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  timestamp: number;
}

export class SecureCrypto {
  private readonly STORAGE_KEY = 'fluent_encrypted_keys';
  private readonly KEY_DERIVATION_ITERATIONS = SECURITY.PBKDF2_ITERATIONS;
  
  /**
   * Generate a cryptographic key from extension ID and a salt
   */
  private async deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    // Use extension ID as part of the key material
    const extensionId = chrome.runtime.id;
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(extensionId + SECURITY.SALT_KEY),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.KEY_DERIVATION_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  /**
   * Encrypt sensitive data
   */
  async encrypt(data: string): Promise<EncryptedData> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Derive key
      const key = await this.deriveKey(salt);
      
      // Encrypt
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        dataBuffer
      );
      
      // Convert to base64 for storage
      return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv)),
        salt: btoa(String.fromCharCode(...salt)),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }
  
  /**
   * Decrypt data
   */
  async decrypt(encryptedData: EncryptedData): Promise<string> {
    try {
      // Convert from base64
      const ciphertext = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
      const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));
      
      // Derive key
      const key = await this.deriveKey(salt);
      
      // Decrypt
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        ciphertext
      );
      
      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }
  
  /**
   * Store API key securely in local storage
   */
  async storeApiKey(apiKey: string | null | undefined): Promise<void> {
    if (!apiKey) {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      logger.info('API key removed');
      return;
    }
    
    try {
      // Validate API key format
      if (apiKey.length < 10 || apiKey.length > 200) {
        throw new Error('Invalid API key format');
      }
      
      // Encrypt the API key
      const encryptedData = await this.encrypt(apiKey);
      
      // Store in local storage (not sync)
      await chrome.storage.local.set({
        [this.STORAGE_KEY]: encryptedData
      });
      
      logger.info('API key stored securely');
    } catch (error) {
      logger.error('Failed to store API key:', error);
      throw error;
    }
  }
  
  /**
   * Retrieve and decrypt API key
   */
  async getApiKey(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const encryptedData = result[this.STORAGE_KEY] as EncryptedData;
      
      if (!encryptedData) {
        return null;
      }
      
      // Check if data is too old (optional expiry)
      const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
      if (Date.now() - encryptedData.timestamp > maxAge) {
        logger.warn('API key has expired');
        await this.clearApiKey();
        return null;
      }
      
      // Decrypt
      return await this.decrypt(encryptedData);
    } catch (error) {
      logger.error('Failed to retrieve API key:', error);
      return null;
    }
  }
  
  /**
   * Clear stored API key
   */
  async clearApiKey(): Promise<void> {
    await chrome.storage.local.remove(this.STORAGE_KEY);
    logger.info('API key cleared');
  }
  
  /**
   * Check if API key exists
   */
  async hasApiKey(): Promise<boolean> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return !!result[this.STORAGE_KEY];
  }
  
  /**
   * Migrate from old storage to new secure storage
   */
  async migrateFromOldStorage(): Promise<boolean> {
    try {
      // Check if there's an old API key in sync storage
      const oldData = await chrome.storage.sync.get('userApiKey');
      if (oldData.userApiKey) {
        // Store using new secure method
        await this.storeApiKey(oldData.userApiKey);
        
        // Remove from old storage
        await chrome.storage.sync.remove(['userApiKey', 'keyStored']);
        
        logger.info('Successfully migrated API key to secure storage');
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Migration failed:', error);
      return false;
    }
  }
}

// Export singleton
export const secureCrypto = new SecureCrypto();