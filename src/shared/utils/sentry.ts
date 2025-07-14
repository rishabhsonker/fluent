/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * Sentry initialization for different Chrome extension contexts
 */

import { initErrorHandler, getErrorHandler } from './error-handler';
import { config } from '../config';
import { SAMPLING, PROCESSING_LIMITS } from '../constants';

export type ExtensionContext = 'background' | 'content' | 'popup';

// Define Sentry types locally to avoid dependency issues
interface SentryEvent {
  request?: { 
    url?: string;
    query_string?: any;
    fragment?: any;
  };
  extra?: Record<string, any>;
  contexts?: { extra?: Record<string, any> };
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  breadcrumbs?: Array<{
    timestamp?: number;
    category?: string;
    message?: string;
    level?: string;
    data?: Record<string, any>;
  }>;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          vars?: Record<string, any>;
        }>;
      };
    }>;
  };
}

interface SentryHub {
  captureException(error: unknown, context?: any): void;
  captureMessage(message: string, level: string, context?: any): void;
}

// Dynamic Sentry loader to handle optional dependency
let Sentry: any = null;

// Track initialization state to prevent race conditions
let sentryInitPromise: Promise<ReturnType<typeof initErrorHandler>> | null = null;
let sentryInitialized = false;

/**
 * Initialize Sentry for the Chrome extension with proper locking
 * @param context The extension context (background, content, or popup)
 * @returns The initialized error handler with Sentry integration
 */
export async function initSentry(context: ExtensionContext) {
  // Return existing promise if initialization is in progress
  if (sentryInitPromise) {
    return sentryInitPromise;
  }
  
  // Return cached handler if already initialized
  const existingHandler = getErrorHandler();
  if (sentryInitialized && existingHandler) {
    return existingHandler;
  }
  
  // Start initialization with proper locking
  sentryInitPromise = initSentryInternal(context);
  
  try {
    const handler = await sentryInitPromise;
    sentryInitialized = true;
    return handler;
  } catch (error) {
    // Reset on failure to allow retry
    sentryInitPromise = null;
    throw error;
  }
}

/**
 * Internal Sentry initialization - should not be called directly
 */
async function initSentryInternal(context: ExtensionContext) {
  try {
    // Try to load Sentry dynamically
    try {
      // Use require to avoid TypeScript module resolution errors
      Sentry = (window as any).require ? (window as any).require('@sentry/browser') : null;
      if (!Sentry) {
        // Try dynamic import as fallback
        Sentry = await import(/* webpackIgnore: true */ '@sentry/browser').catch(() => null);
      }
    } catch (error) {
      console.warn('Sentry not available, continuing without error tracking');
      return initErrorHandler();
    }
    
    if (!Sentry) {
      return initErrorHandler();
    }

    // Get config from chrome.storage or use build-time config
    const configData = await getConfig();
    
    if (!configData.sentryDsn || !configData.sentryEnabled) {
      // Return error handler without Sentry
      return initErrorHandler();
    }

    const manifest = chrome.runtime.getManifest();
    
    Sentry.init({
      dsn: configData.sentryDsn,
      environment: configData.environment,
      release: `fluent@${manifest.version}`,
      
      // Context-specific settings
      integrations: [
        // Capture console errors and warnings
        ...(await (async () => {
          try {
            const integrations = await import(/* webpackIgnore: true */ '@sentry/integrations').catch(() => null);
            if (integrations?.CaptureConsole) {
              return [new integrations.CaptureConsole({ levels: ['error', 'warn'] })];
            }
          } catch {
            // Ignore dynamic import failures
          }
          return [];
        })()),
        // Browser tracing for performance
        ...(context === 'background' && Sentry.browserTracingIntegration ? [
          Sentry.browserTracingIntegration({
            tracingOrigins: ['localhost', /^\//],
          })
        ] : [])
      ],
      
      // Sample rates based on context and Sentry best practices
      // Content scripts: 5% sampling (high volume, lower priority)
      // Background: 10% sampling (medium volume, high priority)  
      // Popup: 50% sampling (low volume, user-facing)
      tracesSampleRate: context === 'content' ? SAMPLING.TRACE_SAMPLE_RATE_LOW : context === 'background' ? SAMPLING.TRACE_SAMPLE_RATE_BACKGROUND : SAMPLING.TRACE_SAMPLE_RATE_CRITICAL,
      
      // Custom traces sampler for more granular control
      tracesSampler: (samplingContext: any) => {
        // Always sample if there's an error
        if (samplingContext.transactionContext.status === 'internal_error') {
          return 1.0;
        }
        
        // Sample critical operations more frequently
        const op = samplingContext.transactionContext.op;
        if (op === 'translation' || op === 'api.request') {
          return SAMPLING.TRACE_SAMPLE_RATE_HIGH; // 20% for important operations
        }
        
        // Use default sample rate
        return undefined;
      },
      
      // Set initial scope
      initialScope: {
        tags: { 
          extension_context: context,
          extension_version: manifest.version,
          browser: getBrowserInfo()
        }
      },
      
      // Privacy-focused settings with comprehensive controls
      beforeSend(event: SentryEvent, hint: any) {
        // Check privacy settings
        const privacyLevel = configData.privacyLevel || 'standard';
        
        // Strict privacy mode - don't send any events
        if (privacyLevel === 'strict') {
          return null;
        }
        
        // Remove potentially sensitive data
        if (event.request?.url) {
          // Only keep domain, not full URL
          try {
            const url = new URL(event.request.url);
            event.request.url = url.hostname;
            
            // Remove query params and hash
            delete event.request.query_string;
            delete event.request.fragment;
          } catch {
            event.request.url = '[INVALID_URL]';
          }
        }
        
        // Remove user IP and other PII
        if (event.user) {
          delete event.user.ip_address;
          delete event.user.email;
          delete event.user.username;
          // Only keep installation ID
        }
        
        // Sanitize breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
            if (breadcrumb.data) {
              breadcrumb.data = sanitizeEventData(breadcrumb.data);
            }
            if (breadcrumb.message) {
              breadcrumb.message = sanitizeString(breadcrumb.message);
            }
            return breadcrumb;
          });
        }
        
        // Redact any sensitive data in extra context
        if (event.extra) {
          event.extra = sanitizeEventData(event.extra);
        }
        
        if (event.contexts?.extra) {
          event.contexts.extra = sanitizeEventData(event.contexts.extra);
        }
        
        // Remove stack local variables (can contain sensitive data)
        if (event.exception?.values) {
          event.exception.values.forEach(exception => {
            if (exception.stacktrace?.frames) {
              exception.stacktrace.frames.forEach(frame => {
                delete frame.vars;
              });
            }
          });
        }
        
        // Enhanced privacy mode - further redactions
        if (privacyLevel === 'enhanced') {
          // Remove file paths
          if (event.exception?.values) {
            event.exception.values.forEach(exception => {
              if (exception.stacktrace?.frames) {
                exception.stacktrace.frames.forEach(frame => {
                  if (frame.filename) {
                    frame.filename = frame.filename.replace(/.*\//, '');
                  }
                });
              }
            });
          }
          
          // Limit breadcrumb count
          if (event.breadcrumbs && event.breadcrumbs.length > PROCESSING_LIMITS.MAX_BREADCRUMB_COUNT) {
            event.breadcrumbs = event.breadcrumbs.slice(PROCESSING_LIMITS.BREADCRUMB_SLICE_OFFSET);
          }
        }
        
        return event;
      },
      
      // Additional privacy options
      beforeBreadcrumb(breadcrumb: any) {
        // Skip breadcrumbs with sensitive categories
        if (breadcrumb.category === 'console' || 
            breadcrumb.category === 'fetch' ||
            breadcrumb.category === 'xhr') {
          // Sanitize data
          if (breadcrumb.data) {
            breadcrumb.data = sanitizeEventData(breadcrumb.data);
          }
        }
        
        return breadcrumb;
      },
      
      // Don't send events in development
      enabled: configData.environment !== 'development'
    });
    
    // Set user context if available
    const installationId = await getInstallationId();
    if (installationId) {
      Sentry.setUser({
        id: installationId,
        // Don't include email or other PII
      });
    }
    
    // Create a simple hub interface for our error handler
    const sentryHub: SentryHub = {
      captureException: (error, context) => Sentry.captureException(error, context),
      captureMessage: (message, level, context) => Sentry.captureMessage(message, level, context)
    };
    
    return initErrorHandler(sentryHub);
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
    // Return error handler without Sentry
    return initErrorHandler();
  }
}

/**
 * Get Sentry configuration
 */
async function getConfig(): Promise<{
  sentryDsn: string;
  sentryEnabled: boolean;
  environment: string;
  privacyLevel?: 'standard' | 'enhanced' | 'strict';
}> {
  // Try to get user preferences first
  const stored = await chrome.storage.sync.get(['sentryEnabled', 'privacyLevel']);
  
  return {
    sentryDsn: config.SENTRY_DSN || '',
    sentryEnabled: stored.sentryEnabled !== false, // Default to enabled
    environment: config.ENVIRONMENT || 'production',
    privacyLevel: stored.privacyLevel || 'standard'
  };
}

/**
 * Get browser information for context
 */
function getBrowserInfo(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Edg/')) return 'edge';
  if (userAgent.includes('Chrome/')) return 'chrome';
  if (userAgent.includes('Firefox/')) return 'firefox';
  if (userAgent.includes('Safari/')) return 'safari';
  return 'unknown';
}

/**
 * Get installation ID for user context
 */
async function getInstallationId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['installationId']);
    return result.installationId || null;
  } catch {
    return null;
  }
}

/**
 * Sanitize a string to remove sensitive patterns
 */
function sanitizeString(str: string): string {
  if (!str) return str;
  
  // PII patterns to redact
  const patterns = [
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (various formats)
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    // Social Security Numbers
    /\b\d{3}-\d{2}-\d{4}\b/g,
    // Credit card numbers
    /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    // IP addresses
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ];
  
  let sanitized = str;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[PII_REMOVED]');
  }
  
  return sanitized;
}

/**
 * Sanitize event data to remove sensitive information
 */
function sanitizeEventData(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Redact sensitive fields
    if (lowerKey.includes('word') || 
        lowerKey.includes('translation') ||
        lowerKey.includes('text')) {
      if (typeof value === 'string' && value.length > PROCESSING_LIMITS.SANITIZATION_PREFIX_LENGTH) {
        sanitized[key] = value.substring(0, PROCESSING_LIMITS.SANITIZATION_PREFIX_LENGTH) + '***';
      } else if (Array.isArray(value)) {
        sanitized[key] = `[${value.length} items]`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (lowerKey.includes('token') || 
               lowerKey.includes('key') ||
               lowerKey.includes('secret') ||
               lowerKey.includes('password')) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}