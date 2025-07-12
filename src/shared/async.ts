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

import { logger } from './logger';

interface AsyncOperation {
  id: string;
  controller: AbortController;
  promise: Promise<any>;
  description: string;
  timestamp: number;
}

/**
 * AsyncManager provides centralized management of async operations with
 * automatic cancellation support using AbortController.
 * 
 * Key features:
 * - Automatic cleanup of pending operations
 * - Prevents duplicate operations
 * - Navigation-aware cancellation
 * - Component lifecycle integration
 */
export class AsyncManager {
  private operations: Map<string, AsyncOperation> = new Map();
  private navigationController: AbortController | null = null;

  /**
   * Execute an async operation with automatic cancellation support
   * 
   * @param id - Unique identifier for the operation
   * @param operation - Async function to execute
   * @param options - Configuration options
   * @returns Promise that resolves to operation result or rejects if cancelled
   */
  async execute<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: {
      description?: string;
      preventDuplicates?: boolean;
      cancelOnNavigation?: boolean;
    } = {}
  ): Promise<T> {
    const {
      description = 'Async operation',
      preventDuplicates = true,
      cancelOnNavigation = true
    } = options;

    // Cancel existing operation if preventing duplicates
    if (preventDuplicates && this.operations.has(id)) {
      logger.debug(`Cancelling duplicate operation: ${id}`);
      await this.cancel(id);
    }

    // Create abort controller
    const controller = new AbortController();
    
    // Link to navigation controller if requested
    if (cancelOnNavigation && this.navigationController) {
      this.navigationController.signal.addEventListener('abort', () => {
        controller.abort('Navigation detected');
      });
    }

    // Execute operation
    const promise = operation(controller.signal);
    
    // Track operation
    const asyncOp: AsyncOperation = {
      id,
      controller,
      promise,
      description,
      timestamp: Date.now()
    };
    
    this.operations.set(id, asyncOp);
    logger.debug(`Started async operation: ${id} - ${description}`);

    try {
      const result = await promise;
      this.operations.delete(id);
      return result;
    } catch (error) {
      this.operations.delete(id);
      
      // Re-throw unless it's an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug(`Operation cancelled: ${id}`);
        throw new Error(`Operation cancelled: ${description}`);
      }
      
      throw error;
    }
  }

  /**
   * Cancel a specific operation
   */
  async cancel(id: string): Promise<void> {
    const operation = this.operations.get(id);
    if (!operation) return;

    logger.debug(`Cancelling operation: ${id} - ${operation.description}`);
    operation.controller.abort();
    
    try {
      await operation.promise;
    } catch (error) {
      // Expected - operation was cancelled
    }
    
    this.operations.delete(id);
  }

  /**
   * Cancel all pending operations
   */
  async cancelAll(): Promise<void> {
    logger.debug(`Cancelling ${this.operations.size} pending operations`);
    
    const promises: Promise<void>[] = [];
    for (const [id] of this.operations) {
      promises.push(this.cancel(id));
    }
    
    await Promise.allSettled(promises);
  }

  /**
   * Cancel operations matching a pattern
   */
  async cancelMatching(pattern: RegExp | ((id: string) => boolean)): Promise<void> {
    const matcher = pattern instanceof RegExp 
      ? (id: string) => pattern.test(id)
      : pattern;

    const toCancel = Array.from(this.operations.keys()).filter(matcher);
    
    logger.debug(`Cancelling ${toCancel.length} operations matching pattern`);
    
    const promises = toCancel.map(id => this.cancel(id));
    await Promise.allSettled(promises);
  }

  /**
   * Check if an operation is currently running
   */
  isRunning(id: string): boolean {
    return this.operations.has(id);
  }

  /**
   * Get count of pending operations
   */
  getPendingCount(): number {
    return this.operations.size;
  }

  /**
   * Wait for an operation to complete
   */
  async waitFor(id: string): Promise<any> {
    const operation = this.operations.get(id);
    if (!operation) return null;
    
    try {
      return await operation.promise;
    } catch (error) {
      // Operation was cancelled or failed
      return null;
    }
  }

  /**
   * Set up navigation tracking for automatic cancellation
   */
  setupNavigationTracking(): void {
    if (this.navigationController) {
      this.navigationController.abort();
    }
    
    this.navigationController = new AbortController();
    
    // Monitor for navigation events
    window.addEventListener('pagehide', this.handleNavigation);
    window.addEventListener('beforeunload', this.handleNavigation);
    
    // Also monitor visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.handleNavigation();
      }
    });
  }

  /**
   * Handle navigation event
   */
  private handleNavigation = (): void => {
    logger.info('Navigation detected, cancelling navigation-aware operations');
    
    if (this.navigationController) {
      this.navigationController.abort('Navigation detected');
      this.navigationController = new AbortController();
    }
  };

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await this.cancelAll();
    
    if (this.navigationController) {
      this.navigationController.abort();
      this.navigationController = null;
    }
    
    window.removeEventListener('pagehide', this.handleNavigation);
    window.removeEventListener('beforeunload', this.handleNavigation);
  }

  /**
   * Utility method for delayed operations with cancellation
   */
  async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Delay cancelled'));
        });
      }
    });
  }

  /**
   * Utility to wrap fetch with automatic abort support
   */
  async fetch(
    id: string,
    url: string,
    options: RequestInit = {},
    asyncOptions: Parameters<AsyncManager['execute']>[2] = {}
  ): Promise<Response> {
    return this.execute(
      id,
      async (signal) => {
        const response = await fetch(url, {
          ...options,
          signal
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response;
      },
      {
        description: `Fetch: ${url}`,
        ...asyncOptions
      }
    );
  }
}

// Singleton instance for global use
let globalAsyncManager: AsyncManager | null = null;

export function getAsyncManager(): AsyncManager {
  if (!globalAsyncManager) {
    globalAsyncManager = new AsyncManager();
    globalAsyncManager.setupNavigationTracking();
  }
  return globalAsyncManager;
}

// Component-specific async manager for local lifecycle
export class ComponentAsyncManager extends AsyncManager {
  constructor(private componentName: string) {
    super();
  }

  async execute<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: Parameters<AsyncManager['execute']>[2] = {}
  ): Promise<T> {
    // Prefix operations with component name
    const prefixedId = `${this.componentName}:${id}`;
    return super.execute(prefixedId, operation, options);
  }

  async cancel(id: string): Promise<void> {
    const prefixedId = `${this.componentName}:${id}`;
    return super.cancel(prefixedId);
  }

  async cancelComponentOperations(): Promise<void> {
    await this.cancelMatching(id => id.startsWith(`${this.componentName}:`));
  }
}