/**
 * Copyright (c) 2025 Fluent Language Learning Extension. All Rights Reserved.
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
 * - cache.js - D1-based caching layer
 * - limiter.js - Rate limiting and cost control
 * - api.js - External API integrations
 * 
 * Deployment:
 * - Uses Cloudflare Workers platform
 * - Configured via wrangler.toml
 * - Environment variables in .dev.vars
 */

import { logError } from './logger.js';
import { validateEnvironment, getSiteConfig } from './config.js';
import { verifyAuthentication, checkUsageLimits, trackUsage } from './auth.js';
import { handleTranslateWithContext } from './handler.js';
import { handleContextOnly } from './context.js';
import { safe } from './utils.js';
import { HTTP, VALIDATION } from './constants.js';


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
                           origin.length < VALIDATION.MAX_WORD_LENGTH;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': isValidExtension ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Installation-Id, X-Timestamp, X-Signature',
      'Access-Control-Max-Age': HTTP.CORS_MAX_AGE_SECONDS.toString(),
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

      // Test D1 connectivity (temporary - remove in production)
      if (pathname === '/test-db' && request.method === 'GET') {
        if (!env.DB) {
          return new Response(JSON.stringify({ 
            status: 'error', 
            message: 'D1 database not configured' 
          }), {
            status: 503,
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return await safe(async () => {
          // Test basic connectivity
          const tables = await env.DB.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            ORDER BY name
          `).all();
          
          // Count users
          const userCount = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM users"
          ).first();
          
          return new Response(JSON.stringify({ 
            status: 'success',
            database: 'connected',
            tables: tables.results.map(t => t.name),
            users: userCount?.count || 0
          }), {
            status: 200,
            headers: { ...responseHeaders, 'Content-Type': 'application/json' }
          });
        }, 'Database connectivity test failed', new Response(JSON.stringify({ 
          status: 'error',
          message: 'Database test failed' 
        }), {
          status: 500,
          headers: { ...responseHeaders, 'Content-Type': 'application/json' }
        }));
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

// The rest of the functionality has been moved to modular files









