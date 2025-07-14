// Performance utilities for production
'use strict';

import { PROCESSING, NUMERIC } from './constants';

/**
 * Process items in chunks to avoid blocking the main thread
 */
export async function processInChunks<T>(
  items: T[],
  processor: (item: T) => void | Promise<void>,
  options: {
    chunkSize?: number;
    delayMs?: number;
    maxTime?: number;
  } = {}
): Promise<void> {
  const {
    chunkSize = PROCESSING.CHUNK_PROCESSING_SIZE,
    delayMs = 0,
    maxTime = PROCESSING.CHUNK_TIMEOUT_MS
  } = options;
  
  const startTime = performance.now();
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunkStart = performance.now();
    const chunk = items.slice(i, i + chunkSize);
    
    // Process chunk
    for (const item of chunk) {
      await processor(item);
      
      // Check if we've exceeded time budget
      if (performance.now() - chunkStart > maxTime) {
        break;
      }
    }
    
    // Yield to browser
    if (i + chunkSize < items.length) {
      if ('requestIdleCallback' in window) {
        await new Promise(resolve => {
          requestIdleCallback(() => resolve(undefined), { timeout: PROCESSING.IDLE_CALLBACK_TIMEOUT_MS });
        });
      } else if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        // Microtask yield
        await Promise.resolve();
      }
    }
  }
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function debounced(...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Memory-efficient string operations
 */
export function* splitTextIntoChunks(
  text: string,
  chunkSize: number = PROCESSING.MAX_BATCH_SIZE * NUMERIC.DECIMAL_BASE
): Generator<string, void, unknown> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}

/**
 * Check if we should stop processing based on performance
 */
export function shouldStopProcessing(
  startTime: number,
  maxTime: number,
  itemsProcessed: number,
  maxItems: number
): boolean {
  return (
    performance.now() - startTime > maxTime ||
    itemsProcessed >= maxItems
  );
}