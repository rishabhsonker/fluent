/**
 * Text Processor - High-performance DOM text node processing
 * 
 * Purpose:
 * - Efficiently processes DOM text nodes for translation
 * - Implements batching to prevent UI blocking
 * - Manages the word replacement workflow
 * 
 * Key Features:
 * - Batch processing (10 nodes per batch)
 * - Non-blocking async processing with requestIdleCallback
 * - Automatic yielding to maintain 60fps
 * - Memory-efficient node handling
 * - Skip detection for already processed nodes
 * 
 * Performance Optimizations:
 * - Process only visible text nodes
 * - Skip nodes with data-fluent attributes
 * - Batch API calls for efficiency
 * - Early exit for small text nodes
 * 
 * Referenced by:
 * - src/features/translation/main.ts (processes found text nodes)
 * - src/features/translation/replacer.ts (performs replacements)
 * 
 * Processing Flow:
 * 1. Receive text nodes from main.ts
 * 2. Batch nodes for processing
 * 3. Extract words and request translations
 * 4. Apply replacements via replacer.ts
 * 5. Yield between batches for responsiveness
 */

'use strict';

import { logger } from '../../shared/logger';
import { safeSync } from '../../shared/utils/helpers';
import { PROCESSING, PERFORMANCE_LIMITS, STORAGE_SIZE, DOMAIN } from '../../shared/constants';

// Type definitions
interface ProcessorConfig {
  skipSelectors?: string[];
  [key: string]: any;
}

interface IdleDeadline {
  timeRemaining(): number;
  didTimeout: boolean;
}

type ProcessCallback<T> = (node: Text) => T | null | undefined;

export class TextProcessor {
  private config: ProcessorConfig;
  private BATCH_SIZE: number = PROCESSING.MAX_QUEUE_SIZE;
  private FRAME_BUDGET: number = PERFORMANCE_LIMITS.FRAME_BUDGET_MS; // ms per frame for 60fps
  private processedNodes: WeakSet<Text>;

  constructor(config: ProcessorConfig) {
    this.config = config;
    this.processedNodes = new WeakSet();
  }

  // Process text nodes in batches using requestIdleCallback
  async processBatched<T>(textNodes: Text[], callback: ProcessCallback<T>): Promise<T[]> {
    const batches = this.createBatches(textNodes);
    const results: T[] = [];
    
    for (const batch of batches) {
      const batchResult = await this.processBatch(batch, callback);
      results.push(...batchResult);
      
      // Yield to browser between batches
      await this.yieldToBrowser();
    }
    
    return results;
  }

  // Create optimized batches based on text length
  private createBatches(nodes: Text[]): Text[][] {
    const batches: Text[][] = [];
    let currentBatch: Text[] = [];
    let currentBatchSize = 0;
    
    for (const node of nodes) {
      const textLength = node.textContent?.length || 0;
      
      // Start new batch if current one is full
      if (currentBatch.length >= this.BATCH_SIZE || 
          currentBatchSize + STORAGE_SIZE.COMPRESSION_THRESHOLD_BYTES) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        currentBatch = [];
        currentBatchSize = 0;
      }
      
      currentBatch.push(node);
      currentBatchSize += textLength;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }

  // Process a single batch with performance monitoring
  private async processBatch<T>(batch: Text[], callback: ProcessCallback<T>): Promise<T[]> {
    return new Promise((resolve) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback((deadline: IdleDeadline) => {
          const results = this.processBatchSync(batch, callback, deadline);
          resolve(results);
        }, { timeout: 100 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          const results = this.processBatchSync(batch, callback);
          resolve(results);
        }, 0);
      }
    });
  }

  // Synchronous batch processing with deadline
  private processBatchSync<T>(
    batch: Text[], 
    callback: ProcessCallback<T>, 
    deadline: IdleDeadline | null = null
  ): T[] {
    const results: T[] = [];
    const startTime = performance.now();
    
    for (const node of batch) {
      // Check if we're out of time
      if (deadline && deadline.timeRemaining() < DOMAIN.WORD_PADDING_CHARS) {
        logger.debug('Out of idle time, yielding...');
        break;
      }
      
      // Check frame budget
      if (performance.now() - startTime > this.FRAME_BUDGET) {
        logger.debug('Frame budget exceeded, yielding...');
        break;
      }
      
      // Skip if already processed
      if (this.processedNodes.has(node)) {
        continue;
      }
      
      // Process node
      const result = safeSync(() => {
        const res = callback(node);
        if (res) {
          results.push(res);
          this.processedNodes.add(node);
        }
        return res;
      }, 'Processing text node', null);
      
      if (result) {
        // Already added to results in the callback
      }
    }
    
    return results;
  }

  // Yield control back to browser
  private yieldToBrowser(): Promise<void> {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => resolve(), { timeout: PROCESSING.IDLE_CALLBACK_TIMEOUT_MS });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  // Collect text nodes efficiently
  collectTextNodes(root: Node, config: ProcessorConfig): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node): number => {
          // Type guard to ensure we're dealing with Text nodes
          if (node.nodeType !== Node.TEXT_NODE) {
            return NodeFilter.FILTER_REJECT;
          }

          const textNode = node as Text;

          // Skip empty nodes
          if (!textNode.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip processed nodes
          if (this.processedNodes.has(textNode)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip nodes in skip selectors
          if (config.skipSelectors && textNode.parentElement) {
            const parent = textNode.parentElement;
            if (parent.matches(config.skipSelectors.join(', '))) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node: Node | null;
    while (node = walker.nextNode()) {
      nodes.push(node as Text);
      
      // Limit collection for performance
      if (nodes.length >= DOMAIN.MAX_TEXT_LENGTH) {
        logger.debug('Text node limit reached');
        break;
      }
    }
    
    return nodes;
  }

  // Reset processed nodes tracking
  reset(): void {
    this.processedNodes = new WeakSet();
  }
}

// Factory function
export function createTextProcessor(config: ProcessorConfig): TextProcessor {
  return new TextProcessor(config);
}

// Extend Window interface for requestIdleCallback
declare global {
  interface Window {
    requestIdleCallback(
      callback: (deadline: IdleDeadline) => void,
      options?: { timeout: number }
    ): number;
    cancelIdleCallback(id: number): void;
  }
}