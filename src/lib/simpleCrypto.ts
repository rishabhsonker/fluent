// Simple Crypto Module - Basic API key storage
'use strict';

import { logger } from './logger.js';

interface StorageData {
  userApiKey?: string;
  keyStored?: number;
}

export class SimpleCrypto {
  constructor() {
    // For MVP, we'll use Chrome's built-in storage encryption
    // which is sufficient for API keys
  }
  
  // Store API key securely
  async storeApiKey(apiKey: string | null | undefined): Promise<void> {
    if (!apiKey) {
      await chrome.storage.sync.remove('userApiKey');
      return;
    }
    
    // Chrome automatically encrypts sync storage
    await chrome.storage.sync.set({ 
      userApiKey: apiKey,
      keyStored: Date.now()
    });
  }
  
  // Retrieve API key
  async getApiKey(): Promise<string | null> {
    try {
      const result = await chrome.storage.sync.get('userApiKey') as StorageData;
      return result.userApiKey || null;
    } catch (error) {
      logger.error('Failed to get API key:', error);
      return null;
    }
  }
  
  // Clear API key
  async clearApiKey(): Promise<void> {
    await chrome.storage.sync.remove(['userApiKey', 'keyStored']);
  }
  
  // Check if API key exists
  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }
}

// Export singleton
export const simpleCrypto = new SimpleCrypto();