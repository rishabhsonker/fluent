/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * 
 * This file is part of the Fluent Language Learning Extension and is the
 * proprietary and confidential property of the copyright holder. Unauthorized
 * copying, modification, distribution, or use of this file, via any medium,
 * is strictly prohibited.
 */

/**
 * Cloudflare Worker - Main Entry Point
 * 
 * Purpose:
 * - Acts as the API gateway between Chrome extension and external services
 * - Provides authentication, rate limiting, and caching layer
 * - Proxies requests to Microsoft Translator and Claude AI
 * 
 * Endpoints:
 * - GET /config - Public endpoint for site configuration
 * - POST /translate - Authenticated endpoint for translations + context
 * - POST /context - Authenticated endpoint for context only
 * - POST /installations/register - Registration for new installations
 * 
 * Security Features:
 * - HMAC-based request signing
 * - Installation-based authentication
 * - Rate limiting (per IP and per installation)
 * - CORS protection
 * - Request size limits (10KB)
 * 
 * Dependencies:
 * - handler.js - Main request processing logic
 * - auth.js - Authentication and verification
 * - cache.js - KV-based caching layer
 * - limiter.js - Rate limiting and cost control
 * - api.js - External API integrations
 * 
 * Deployment:
 * - Uses Cloudflare Workers platform
 * - Configured via wrangler.toml
 * - Environment variables in .dev.vars
 */

import { logInfo, logError } from './logger.js';
import { validateEnvironment, getSiteConfig } from './config.js';
import { verifyAuthentication, handleInstallationRegistration } from './auth.js';
import { handleTranslateWithContext } from './handler.js';
import { handleContextOnly } from './context.js';

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 */
function constantTimeEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    
    // Validate environment on first request
    validateEnvironment(env);
    
    // Security headers
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'interest-cohort=()',
    };

    // CORS headers
    const origin = request.headers.get('Origin') || '';
    const isValidExtension = origin.startsWith('chrome-extension://') && 
                           origin.length > 19 && 
                           origin.length < 100;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': isValidExtension ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Installation-Id, X-Timestamp, X-Signature',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'false',
    };

    const responseHeaders = { ...securityHeaders, ...corsHeaders };

    try {
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: responseHeaders });
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Route: /config (GET, no auth)
      if (pathname === '/config' && request.method === 'GET') {
        // Simple IP-based rate limiting for public endpoint
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.TRANSLATION_RATE_LIMITER) {
          const rateLimit = await env.TRANSLATION_RATE_LIMITER.limit({
            key: `config:${clientIP}`,
          });
          
          if (!rateLimit.success) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
              status: 429,
              headers: {
                ...responseHeaders,
                'Retry-After': '60',
                'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              },
            });
          }
        }
        
        const config = await getSiteConfig(env);
        return new Response(JSON.stringify(config), {
          status: 200,
          headers: { ...responseHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Route: /translate (POST, with auth)
      if (pathname === '/translate' && request.method === 'POST') {
        // Check content length before processing
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 10 * 1024) { // 10KB limit
          return new Response(JSON.stringify({ 
            error: 'Request too large. Maximum size: 10KB' 
          }), {
            status: 413,
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Verify authentication
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response(JSON.stringify({ error: authResult.message }), { 
            status: authResult.status, 
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Process combined translation + context request
        const response = await handleTranslateWithContext(request, env, ctx);
        
        // Add performance header
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // Route: /context (POST, with auth)
      if (pathname === '/context' && request.method === 'POST') {
        // Check content length before processing
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 10 * 1024) { // 10KB limit
          return new Response(JSON.stringify({ 
            error: 'Request too large. Maximum size: 10KB' 
          }), {
            status: 413,
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Verify authentication
        const authResult = await verifyAuthentication(request, env);
        if (authResult) {
          return new Response(JSON.stringify({ error: authResult.message }), { 
            status: authResult.status, 
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Process context-only request
        const response = await handleContextOnly(request, env, ctx);
        
        // Add performance header
        response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // Route: /installations/register (POST, no auth)
      if (pathname === '/installations/register' && request.method === 'POST') {
        // Check content length before processing
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 1024) { // 1KB limit for registration
          return new Response(JSON.stringify({ 
            error: 'Request too large. Maximum size: 1KB' 
          }), {
            status: 413,
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Strict rate limiting for registration endpoint
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.TRANSLATION_RATE_LIMITER) {
          const rateLimit = await env.TRANSLATION_RATE_LIMITER.limit({
            key: `register:${clientIP}`,
          });
          
          if (!rateLimit.success) {
            return new Response(JSON.stringify({ 
              error: 'Rate limit exceeded. Please try again later.' 
            }), {
              status: 429,
              headers: {
                ...responseHeaders,
                'Retry-After': '300', // 5 minutes
                'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              },
            });
          }
        }
        
        const response = await handleInstallationRegistration(request, env, ctx);
        
        // Add security headers
        Object.entries(responseHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { 
        status: 404, 
        headers: { ...responseHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logError('Worker error', error, {
        path: request.url,
        method: request.method
      });
      
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...responseHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * Verify authentication headers
 */
async function verifyAuthentication(request, env) {
  const authHeader = request.headers.get('Authorization');
  const installationId = request.headers.get('X-Installation-Id');
  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  
  // Check required headers
  if (!authHeader || !authHeader.startsWith('Bearer ') || !installationId || !signature || !timestamp) {
    return { status: 401, message: 'Missing authentication headers' };
  }
  
  // Extract token from Bearer header
  const token = authHeader.substring(7);
  
  // Verify timestamp (5-minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
    return { status: 401, message: 'Authentication token expired' };
  }
  
  // Check if installation exists (skip for KV if not available)
  if (env.TRANSLATION_CACHE) {
    const installationData = await env.TRANSLATION_CACHE.get(`installation:${installationId}`);
    if (!installationData) {
      return { status: 401, message: 'Unknown installation' };
    }
  }
  
  // Verify signature using HMAC with the token as key
  const message = `${installationId}-${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  
  // Use constant-time comparison to prevent timing attacks
  if (!constantTimeEquals(signature, expectedSignature)) {
    return { status: 401, message: 'Invalid signature' };
  }
  
  // Verify the Bearer token is valid (skip for KV if not available)
  if (env.TRANSLATION_CACHE) {
    const tokenData = await env.TRANSLATION_CACHE.get(`token:${token}`);
    if (!tokenData) {
      return { status: 401, message: 'Invalid token' };
    }
    
    const tokenInfo = JSON.parse(tokenData);
    if (tokenInfo.installationId !== installationId) {
      return { status: 401, message: 'Token mismatch' };
    }
  }
  
  return null; // Authentication successful
}

// The rest of the functionality has been moved to modular files









