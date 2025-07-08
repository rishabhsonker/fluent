/**
 * Authentication module for secure communication between extension and Cloudflare Worker
 */

import { logger } from './logger';

interface AuthHeaders {
  'X-Extension-Id': string;
  'X-Timestamp': string;
  'X-Auth-Token': string;
}

export class ExtensionAuthenticator {
  private static readonly TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private static sharedSecret: string | null = null;

  /**
   * Initialize the authenticator with a shared secret
   * This should be called once during extension installation
   */
  static async initialize(): Promise<void> {
    const stored = await chrome.storage.local.get('authSecret');
    
    if (!stored.authSecret) {
      // Generate a cryptographically secure random secret
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const secret = btoa(String.fromCharCode(...array));
      
      await chrome.storage.local.set({ authSecret: secret });
      this.sharedSecret = secret;
    } else {
      this.sharedSecret = stored.authSecret;
    }
  }

  /**
   * Generate authentication headers for a request
   */
  static async generateAuthHeaders(): Promise<AuthHeaders> {
    if (!this.sharedSecret) {
      await this.initialize();
    }

    const extensionId = chrome.runtime.id;
    const timestamp = Date.now().toString();
    
    // Create a unique token for this request
    const message = `${extensionId}-${timestamp}-${this.sharedSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const token = btoa(hashArray.map(b => String.fromCharCode(b)).join(''));

    return {
      'X-Extension-Id': extensionId,
      'X-Timestamp': timestamp,
      'X-Auth-Token': token
    };
  }

  /**
   * Get the shared secret for Worker configuration
   * This should only be displayed once during setup
   */
  static async getSharedSecretForSetup(): Promise<string> {
    if (!this.sharedSecret) {
      await this.initialize();
    }
    return this.sharedSecret!;
  }

  /**
   * Verify if a timestamp is within acceptable range
   */
  static isTimestampValid(timestamp: string): boolean {
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    const diff = Math.abs(now - requestTime);
    return diff <= this.TOKEN_EXPIRY_MS;
  }
}

/**
 * Worker-side authentication verifier
 * This code should be used in the Cloudflare Worker
 */
export const workerAuthVerifier = `
// Add this to your Cloudflare Worker
async function verifyAuthentication(request, env) {
  const extensionId = request.headers.get('X-Extension-Id');
  const timestamp = request.headers.get('X-Timestamp');
  const authToken = request.headers.get('X-Auth-Token');

  if (!extensionId || !timestamp || !authToken) {
    return new Response('Missing authentication headers', { status: 401 });
  }

  // Verify timestamp is within 5 minutes
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (Math.abs(now - requestTime) > 300000) {
    return new Response('Authentication token expired', { status: 401 });
  }

  // Verify the token
  const sharedSecret = env.FLUENT_SHARED_SECRET;
  if (!sharedSecret) {
    logger.error('FLUENT_SHARED_SECRET not configured');
    return new Response('Server configuration error', { status: 500 });
  }

  // Recreate the expected token
  const message = \`\${extensionId}-\${timestamp}-\${sharedSecret}\`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expectedToken = btoa(hashArray.map(b => String.fromCharCode(b)).join(''));

  if (authToken !== expectedToken) {
    return new Response('Invalid authentication token', { status: 401 });
  }

  // Optional: Verify extension ID is in allowlist
  const allowedExtensions = (env.ALLOWED_EXTENSION_IDS || '').split(',');
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extensionId)) {
    return new Response('Extension not authorized', { status: 403 });
  }

  return null; // Authentication successful
}
`;