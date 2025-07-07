/**
 * Content Script Manager - Dynamic injection based on user permissions
 */

import { logger } from '../lib/logger';
import { storage } from '../lib/storage';
import { STORAGE_KEYS } from '../lib/constants';
import type { SiteSettings } from '../types';

export class ContentScriptManager {
  private injectedTabs: Set<number> = new Set();
  
  /**
   * Check if site is enabled and inject content script if needed
   */
  async handleTabUpdate(tabId: number, url: string): Promise<void> {
    try {
      // Parse URL
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Check if this is a supported protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return;
      }
      
      // Check if site is blacklisted
      if (this.isBlacklisted(domain)) {
        logger.info(`Site ${domain} is blacklisted`);
        return;
      }
      
      // Check site settings
      const siteSettings = await this.getSiteSettings(domain);
      if (siteSettings && !siteSettings.enabled) {
        logger.info(`Site ${domain} is disabled`);
        return;
      }
      
      // Check user settings
      const userSettings = await storage.get(STORAGE_KEYS.USER_SETTINGS);
      if (!userSettings?.enabled) {
        logger.info('Extension is globally disabled');
        return;
      }
      
      // Check if user has granted permission for this site
      const hasPermission = await this.checkPermission(url);
      if (!hasPermission) {
        logger.info(`No permission for ${domain}`);
        return;
      }
      
      // Inject content script if not already injected
      if (!this.injectedTabs.has(tabId)) {
        await this.injectContentScript(tabId);
        this.injectedTabs.add(tabId);
      }
    } catch (error) {
      logger.error('Error handling tab update:', error);
    }
  }
  
  /**
   * Inject content script into tab
   */
  private async injectContentScript(tabId: number): Promise<void> {
    try {
      // Inject CSS first
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content.css']
      });
      
      // Then inject JavaScript
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      
      logger.info(`Content script injected into tab ${tabId}`);
    } catch (error) {
      logger.error(`Failed to inject content script:`, error);
      throw error;
    }
  }
  
  /**
   * Check if user has granted permission for URL
   */
  private async checkPermission(url: string): Promise<boolean> {
    try {
      return await chrome.permissions.contains({
        origins: [url]
      });
    } catch (error) {
      logger.error('Error checking permissions:', error);
      return false;
    }
  }
  
  /**
   * Request permission for a specific site
   */
  async requestPermission(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const origin = `${urlObj.protocol}//${urlObj.hostname}/*`;
      
      return await chrome.permissions.request({
        origins: [origin]
      });
    } catch (error) {
      logger.error('Error requesting permission:', error);
      return false;
    }
  }
  
  /**
   * Get site-specific settings
   */
  private async getSiteSettings(domain: string): Promise<SiteSettings | null> {
    const allSettings = await storage.get(STORAGE_KEYS.SITE_SETTINGS) || {};
    return allSettings[domain] || null;
  }
  
  /**
   * Check if domain is in the security blacklist
   */
  private isBlacklisted(domain: string): boolean {
    const blacklistPatterns = [
      /\.bank/i,
      /banking/i,
      /\.gov/i,
      /\.mil/i,
      /paypal\.com/i,
      /venmo\.com/i,
      /stripe\.com/i,
      /coinbase\.com/i,
      /kraken\.com/i,
      /binance\.com/i,
      /healthcare/i,
      /medical/i,
      /hospital/i,
      /clinic/i,
      /insurance/i,
      /mail\.google\.com/i,
      /outlook\.live\.com/i,
      /mail\.yahoo\.com/i
    ];
    
    return blacklistPatterns.some(pattern => pattern.test(domain));
  }
  
  /**
   * Clean up when tab is closed
   */
  handleTabRemoved(tabId: number): void {
    this.injectedTabs.delete(tabId);
  }
  
  /**
   * Enable extension for current tab
   */
  async enableForCurrentTab(): Promise<boolean> {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url || !activeTab.id) {
        return false;
      }
      
      // Request permission
      const granted = await this.requestPermission(activeTab.url);
      if (!granted) {
        return false;
      }
      
      // Inject content script
      await this.injectContentScript(activeTab.id);
      this.injectedTabs.add(activeTab.id);
      
      // Save site settings
      const urlObj = new URL(activeTab.url);
      const domain = urlObj.hostname;
      const siteSettings = await storage.get(STORAGE_KEYS.SITE_SETTINGS) || {};
      siteSettings[domain] = { enabled: true, timestamp: Date.now() };
      await storage.set(STORAGE_KEYS.SITE_SETTINGS, siteSettings);
      
      return true;
    } catch (error) {
      logger.error('Error enabling for current tab:', error);
      return false;
    }
  }
}

export const contentScriptManager = new ContentScriptManager();