/**
 * Authentication module for secure communication between extension and Cloudflare Worker
 */

import { logger } from './logger';
import { AUTH_CONFIG } from '../config/auth.config';

interface AuthHeaders {
  'X-Extension-Id': string;
  'X-Timestamp': string;
  'X-Auth-Token': string;
}

export class ExtensionAuthenticator {
  private static readonly TOKEN_EXPIRY_MS = AUTH_CONFIG.TOKEN_EXPIRY_MS;
  private static readonly sharedSecret: string = AUTH_CONFIG.SHARED_SECRET;

  /**
   * Initialize the authenticator
   * This method is kept for backward compatibility but no longer needs to do anything
   * since we're using a fixed shared secret from the config
   */
  static async initialize(): Promise<void> {
    // No initialization needed - using fixed shared secret from config
    logger.debug('ExtensionAuthenticator initialized with fixed shared secret');
  }

  /**
   * Generate authentication headers for a request
   */
  static async generateAuthHeaders(): Promise<AuthHeaders> {
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
   * This returns the fixed shared secret from the config
   */
  static getSharedSecretForSetup(): string {
    return this.sharedSecret;
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
 * 
 * IMPORTANT: Set the FLUENT_SHARED_SECRET environment variable in your Cloudflare Worker to:
 * fluent-extension-2024-shared-secret-key
 */
export const workerAuthVerifier = `
// Add this to your Cloudflare Worker
// Set FLUENT_SHARED_SECRET environment variable to: fluent-extension-2024-shared-secret-key
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