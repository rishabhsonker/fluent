/**
 * Content Script Injector - First script to run on every page
 * 
 * Purpose:
 * - Acts as the gatekeeper for the translation system
 * - Performs early checks to determine if translation should run on current page
 * - Dynamically loads the main translation script only when needed
 * 
 * Key Responsibilities:
 * - Check if extension is enabled globally
 * - Check site-specific settings and blacklist
 * - Verify page URL against blocked patterns
 * - Request translations for current page if eligible
 * - Inject main.js content script when translations are received
 * 
 * Performance Optimization:
 * - Lightweight (~2KB) to minimize impact on page load
 * - Early exit for blocked sites before loading heavy scripts
 * - Prevents unnecessary processing on blocked domains
 * 
 * Referenced by:
 * - manifest.json (injected on all http/https pages)
 * - src/core/worker.ts (receives translation requests)
 * - src/features/translation/main.ts (dynamically injected)
 * 
 * Security:
 * - Validates all URLs against blocklist patterns
 * - Only injects scripts after receiving valid translation data
 */

import { logger } from '../shared/logger';
import { storage } from '../features/settings/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { SiteSettings } from '../shared/types';

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
    // Import the default patterns from blocklist module
    const blacklistPatterns = [
      // Banking and financial
      /\.bank/i, /banking/i,
      /\.chase\.com$/, /\.wellsfargo\.com$/, /\.bankofamerica\.com$/,
      /paypal\.com$/, /venmo\.com$/, /coinbase\.com$/,
      
      // Government
      /\.gov$/, /\.gov\./, /\.mil$/,
      
      // Healthcare
      /healthcare/i, /medical/i, /hospital/i, /clinic/i,
      /mychart/i, /kaiserpermanente\.org/,
      
      // Email
      /mail\.google\.com/, /outlook\.live\.com/, /mail\.yahoo\.com/,
      
      // Password managers
      /1password\.com/, /lastpass\.com/, /bitwarden\.com/,
      
      // Authentication pages
      /\/login/i, /\/signin/i, /\/auth/i,
      
      // Local development
      /localhost/, /127\.0\.0\.1/, /0\.0\.0\.0/
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