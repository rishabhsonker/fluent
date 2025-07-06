// Fluent Background Service Worker - Chrome Extension
'use strict';

// Default settings
const DEFAULT_SETTINGS = {
  targetLanguage: 'spanish',
  wordCount: 6,
  enabledGlobally: true,
  siteSettings: {}
};

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  // Extension installed: details.reason
  
  if (details.reason === 'install') {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  try {
    switch (request.type) {
      case 'GET_SETTINGS':
        const { settings } = await chrome.storage.sync.get('settings');
        const currentSettings = settings || DEFAULT_SETTINGS;
        
        if (sender.tab && sender.tab.url) {
          try {
            const hostname = new URL(sender.tab.url).hostname;
            const siteSettings = currentSettings.siteSettings || {};
            const siteEnabled = siteSettings[hostname] !== false;
            
            return {
              settings: currentSettings,
              siteEnabled: siteEnabled && currentSettings.enabledGlobally,
              hostname
            };
          } catch (urlError) {
            // Invalid URL, return defaults
            return { settings: currentSettings, siteEnabled: true };
          }
        }
        
        return { settings: currentSettings, siteEnabled: true };
        
      case 'UPDATE_SETTINGS':
        const { settings: current } = await chrome.storage.sync.get('settings');
        const updated = { ...(current || DEFAULT_SETTINGS), ...request.settings };
        await chrome.storage.sync.set({ settings: updated });
        return { success: true };
        
      case 'UPDATE_SITE_SETTINGS':
        const { settings: siteSettings } = await chrome.storage.sync.get('settings');
        const updatedSettings = { ...(siteSettings || DEFAULT_SETTINGS) };
        if (!updatedSettings.siteSettings) updatedSettings.siteSettings = {};
        updatedSettings.siteSettings[request.hostname] = request.settings;
        await chrome.storage.sync.set({ settings: updatedSettings });
        return { success: true };
        
      case 'ERROR_LOG':
        // Store error for debugging without console
        // In production, this could be sent to an error tracking service
        return { success: true };
        
      default:
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    // Return error message without logging to console
    return { error: error.message };
  }
}