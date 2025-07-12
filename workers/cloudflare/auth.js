/**
 * Authentication module for Cloudflare Worker
 * Handles token verification and installation management
 */

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

// Helper functions for structured logging
function logInfo(message, context = {}) {
  console.log(JSON.stringify({
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    ...context
  }));
}

function logError(message, error, context = {}) {
  console.error(JSON.stringify({
    level: 'error',
    message,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    timestamp: new Date().toISOString(),
    ...context
  }));
}

/**
 * Verify authentication headers
 */
export async function verifyAuthentication(request, env) {
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

/**
 * Handle installation registration
 */
export async function handleInstallationRegistration(request, env, ctx) {
  try {
    const body = await request.json();
    const { installationId, extensionVersion, timestamp, platform } = body;
    
    if (!installationId || typeof installationId !== 'string' || installationId.length < 10) {
      return new Response(JSON.stringify({ error: 'Invalid installation ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Generate unique API token for this installation
    const apiToken = await generateInstallationToken(installationId, env);
    const refreshToken = await generateRefreshToken(installationId, env);
    
    // Store installation info
    const installationData = {
      installationId,
      extensionVersion,
      platform,
      registeredAt: timestamp || Date.now(),
      lastSeen: Date.now(),
      tokenVersion: 1
    };
    
    env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
      `installation:${installationId}`,
      JSON.stringify(installationData),
      { expirationTtl: 90 * 24 * 60 * 60 } // 90 days
    );
    
    logInfo('New installation registered', {
      installationId,
      extensionVersion,
      platform
    });
    
    return new Response(JSON.stringify({
      token: apiToken,      // Extension expects 'token' field
      apiToken,             // Also include as apiToken for compatibility
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    logError('Installation registration error', error);
    return new Response(JSON.stringify({ 
      error: 'Registration failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function generateInstallationToken(installationId, env) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
    `token:${token}`,
    JSON.stringify({
      installationId,
      createdAt: Date.now(),
      type: 'api'
    }),
    { expirationTtl: 30 * 24 * 60 * 60 }
  );
  
  return token;
}

async function generateRefreshToken(installationId, env) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  env.TRANSLATION_CACHE && await env.TRANSLATION_CACHE.put(
    `refresh:${token}`,
    JSON.stringify({
      installationId,
      createdAt: Date.now(),
      type: 'refresh'
    }),
    { expirationTtl: 90 * 24 * 60 * 60 }
  );
  
  return token;
}