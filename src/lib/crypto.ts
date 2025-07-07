// Crypto Module - Secure encryption for sensitive data
'use strict';

interface StoredSalt {
  [key: string]: number[];
}

interface StoredApiKey {
  encryptedApiKey?: string;
  userApiKey?: string;
}

class CryptoManager {
  private readonly saltKey: string;
  private readonly algorithm: string;
  private readonly keyLength: number;

  constructor() {
    // Generate a unique salt for this installation
    this.saltKey = 'fluent_salt_v1';
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
  }

  // Get or create installation-specific salt
  async getSalt(): Promise<Uint8Array> {
    const stored = await chrome.storage.local.get(this.saltKey) as StoredSalt;
    if (stored[this.saltKey]) {
      return new Uint8Array(stored[this.saltKey]);
    }

    // Generate new salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await chrome.storage.local.set({ [this.saltKey]: Array.from(salt) });
    return salt;
  }

  // Derive encryption key from extension ID and salt
  async deriveKey(): Promise<CryptoKey> {
    const salt = await this.getSalt();
    const extensionId = chrome.runtime.id;
    
    // Use extension ID as base material
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(extensionId),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive key using PBKDF2
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.algorithm, length: this.keyLength },
      false,
      ['encrypt', 'decrypt']
    );

    return key;
  }

  // Encrypt data
  async encrypt(plaintext: string): Promise<string> {
    try {
      const key = await this.deriveKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64 for storage
      return btoa(String.fromCharCode(...Array.from(combined)));
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  // Decrypt data
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.deriveKey();
      
      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        encrypted
      );

      // Convert to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  // Secure API key storage
  async storeApiKey(apiKey: string | null): Promise<void> {
    if (!apiKey) {
      await chrome.storage.sync.remove('encryptedApiKey');
      return;
    }

    const encrypted = await this.encrypt(apiKey);
    await chrome.storage.sync.set({ encryptedApiKey: encrypted });
  }

  // Retrieve API key
  async getApiKey(): Promise<string | null> {
    const stored = await chrome.storage.sync.get(['encryptedApiKey', 'userApiKey']) as StoredApiKey;
    if (!stored.encryptedApiKey) {
      // Check for legacy unencrypted key
      if (stored.userApiKey) {
        // Migrate to encrypted storage
        await this.storeApiKey(stored.userApiKey);
        await chrome.storage.sync.remove('userApiKey');
        return stored.userApiKey;
      }
      return null;
    }

    try {
      return await this.decrypt(stored.encryptedApiKey);
    } catch (error) {
      // If decryption fails, remove corrupted data
      await chrome.storage.sync.remove('encryptedApiKey');
      return null;
    }
  }

  // Clear all sensitive data
  async clearSensitiveData(): Promise<void> {
    await chrome.storage.sync.remove(['encryptedApiKey', 'userApiKey']);
    await chrome.storage.local.remove(this.saltKey);
  }
}

// Export singleton instance
export const cryptoManager = new CryptoManager();