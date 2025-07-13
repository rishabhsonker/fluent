/**
 * Network utilities with retry logic and exponential backoff
 * Provides resilient network operations for the extension
 */

import { logger } from './logger';
import { getErrorHandler } from './utils/error-handler';
import { safe } from './utils/helpers';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Retryable HTTP status codes
  onRetry: () => {}
};

export class NetworkError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: Response,
    public attempt?: number
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Fetch with exponential backoff retry
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  
  logger.info('[NetworkUtils] fetchWithRetry called', {
    url,
    method: options.method || 'GET',
    hasHeaders: !!options.headers,
    maxRetries: opts.maxRetries
  });
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      logger.info(`[NetworkUtils] Attempt ${attempt + 1}/${opts.maxRetries + 1}`, { url });
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      logger.info(`[NetworkUtils] Response received`, {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      // Check if response is retryable
      if (!response.ok && opts.retryableStatuses.includes(response.status) && attempt < opts.maxRetries) {
        logger.warn(`[NetworkUtils] Retryable error, will retry`, {
          status: response.status,
          attempt: attempt + 1
        });
        throw new NetworkError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response,
          attempt
        );
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on non-retryable errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError('Request timeout', undefined, undefined, attempt);
        }
        
        // Check if it's a network error (offline, DNS failure, etc)
        const isNetworkError = error.message.includes('Failed to fetch') ||
                             error.message.includes('NetworkError') ||
                             error.message.includes('ERR_INTERNET_DISCONNECTED');
        
        if (!isNetworkError && !(error instanceof NetworkError)) {
          throw error; // Non-retryable error
        }
      }
      
      // Calculate delay with exponential backoff
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
          opts.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitter = delay * 0.1 * Math.random();
        const finalDelay = delay + jitter;
        
        logger.warn(`Network request failed, retrying in ${Math.round(finalDelay)}ms`, {
          url,
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          error: lastError.message
        });
        
        opts.onRetry(attempt + 1, lastError);
        
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
  }
  
  // All retries exhausted
  const errorHandler = getErrorHandler();
  const networkError = new NetworkError(
    `Network request failed after ${opts.maxRetries + 1} attempts: ${lastError?.message}`,
    undefined,
    undefined,
    opts.maxRetries
  );
  
  errorHandler.handleError(networkError, {
    operation: 'network.fetchWithRetry',
    component: 'network',
    extra: {
      url,
      attempts: opts.maxRetries + 1,
      lastError: lastError?.message
    }
  });
  
  throw networkError;
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Wait for the browser to come back online
 */
export function waitForOnline(timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve();
      return;
    }
    
    const timeoutId = setTimeout(() => {
      window.removeEventListener('online', handleOnline);
      reject(new Error('Timeout waiting for network connection'));
    }, timeout);
    
    const handleOnline = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      resolve();
    };
    
    window.addEventListener('online', handleOnline);
  });
}

/**
 * Batch requests to avoid overwhelming the network
 */
export class RequestBatcher<T> {
  private queue: Array<{
    request: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;
  
  constructor(
    private maxConcurrent: number = 3,
    private delayBetweenBatches: number = 100
  ) {}
  
  async add(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.process();
    });
  }
  
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxConcurrent);
      
      await Promise.all(
        batch.map(async ({ request, resolve, reject }) => {
          const result = await safe(
            request,
            'Batch request execution',
            undefined
          );
          if (result !== undefined) {
            resolve(result);
          } else {
            // safe() threw an error, reject the promise
            reject(new Error('Batch request failed'));
          }
        })
      );
      
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }
    
    this.processing = false;
  }
}