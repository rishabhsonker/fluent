// Performance utilities for production
'use strict';

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
    chunkSize = 10,
    delayMs = 0,
    maxTime = 50 // Max time per chunk in ms
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
          requestIdleCallback(() => resolve(undefined), { timeout: 50 });
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
  chunkSize: number = 1000
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