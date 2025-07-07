// Optimized Text Processing with Batching
'use strict';

import { logger } from '../lib/logger.js';

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
  private BATCH_SIZE: number = 50;
  private FRAME_BUDGET: number = 16; // ms per frame for 60fps
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
          currentBatchSize + textLength > 10000) {
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
      if (deadline && deadline.timeRemaining() < 2) {
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
      try {
        const result = callback(node);
        if (result) {
          results.push(result);
          this.processedNodes.add(node);
        }
      } catch (error) {
        logger.error('Error processing node:', error);
      }
    }
    
    return results;
  }

  // Yield control back to browser
  private yieldToBrowser(): Promise<void> {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => resolve(), { timeout: 50 });
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
      if (nodes.length >= 1000) {
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