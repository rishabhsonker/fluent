// Permission Manager - Handles dynamic permission requests for new sites
'use strict';

interface PermissionResult {
  granted: boolean;
  reason?: string;
}

interface PermissionGrant {
  granted: number;
  count: number;
}

interface PermissionGrants {
  [domain: string]: PermissionGrant;
}

interface PermissionStatus {
  hasPermission: boolean;
  domain: string;
  isTrusted: boolean;
  isBlocked: boolean;
}

export class PermissionManager {
  private trustedDomains: Set<string>;
  private blockedPatterns: RegExp[];

  constructor() {
    this.trustedDomains = new Set([
      'wikipedia.org',
      'reddit.com',
      'medium.com',
      'nytimes.com',
      'bbc.com',
      'cnn.com',
      'theguardian.com',
      'washingtonpost.com',
      'economist.com',
      'forbes.com',
      'wired.com',
      'arstechnica.com',
      'techcrunch.com',
      'stackoverflow.com',
      'github.com'
    ]);
    
    this.blockedPatterns = [
      /\.bank/i,
      /banking/i,
      /\.gov/i,
      /\.mil/i,
      /healthcare/i,
      /medical/i,
      /paypal\.com/i,
      /venmo\.com/i,
      /stripe\.com/i,
      /mail\./i,
      /outlook\./i
    ];
  }
  
  // Check if we have permission for a URL
  async hasPermission(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Check if it's a blocked site
      if (this.isBlockedSite(domain)) {
        return false;
      }
      
      // Check if it's a trusted domain
      if (this.isTrustedDomain(domain)) {
        return true;
      }
      
      // Check if we have dynamic permission
      const hasPermission = await chrome.permissions.contains({
        origins: [`*://${domain}/*`]
      });
      
      return hasPermission;
    } catch (error) {
      return false;
    }
  }
  
  // Request permission for a new site
  async requestPermission(url: string): Promise<PermissionResult> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Don't request for blocked sites
      if (this.isBlockedSite(domain)) {
        return { 
          granted: false, 
          reason: 'This site is blocked for security reasons' 
        };
      }
      
      // Already have permission
      if (await this.hasPermission(url)) {
        return { granted: true };
      }
      
      // Request permission
      const granted = await chrome.permissions.request({
        origins: [`*://${domain}/*`]
      });
      
      if (granted) {
        // Store the permission grant
        await this.storePermissionGrant(domain);
      }
      
      return { granted };
    } catch (error) {
      return { 
        granted: false, 
        reason: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  // Check if domain is in our trusted list
  isTrustedDomain(domain: string): boolean {
    return this.trustedDomains.has(domain) || 
           Array.from(this.trustedDomains).some(trusted => 
             domain.endsWith(`.${trusted}`)
           );
  }
  
  // Check if domain matches blocked patterns
  isBlockedSite(domain: string): boolean {
    return this.blockedPatterns.some(pattern => pattern.test(domain));
  }
  
  // Store permission grant for analytics
  async storePermissionGrant(domain: string): Promise<void> {
    const storage = await chrome.storage.local.get('permissionGrants');
    const grants: PermissionGrants = storage.permissionGrants || {};
    
    grants[domain] = {
      granted: Date.now(),
      count: (grants[domain]?.count || 0) + 1
    };
    
    await chrome.storage.local.set({ permissionGrants: grants });
  }
  
  // Get permission status for popup display
  async getPermissionStatus(url: string): Promise<PermissionStatus> {
    const hasPermission = await this.hasPermission(url);
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    return {
      hasPermission,
      domain,
      isTrusted: this.isTrustedDomain(domain),
      isBlocked: this.isBlockedSite(domain)
    };
  }
  
  // Remove permission for a domain
  async removePermission(domain: string): Promise<boolean> {
    try {
      const removed = await chrome.permissions.remove({
        origins: [`*://${domain}/*`]
      });
      return removed;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const permissionManager = new PermissionManager();