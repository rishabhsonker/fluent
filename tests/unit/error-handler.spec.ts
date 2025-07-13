/**
 * Error Handler Unit Tests
 * Tests for centralized error handling
 */

import { test, expect } from '@playwright/test';
import { getErrorHandler } from '../../src/shared/utils/error-handler';

test.describe('ErrorHandler', () => {
  test('should handle successful operations', async () => {
    const errorHandler = getErrorHandler();
    
    const result = await errorHandler.withErrorHandling(
      async () => 'success',
      { operation: 'test-op', component: 'test' }
    );

    expect(result).toBe('success');
  });

  test('should handle errors and return fallback value', async () => {
    const errorHandler = getErrorHandler();
    
    const result = await errorHandler.withErrorHandling(
      async () => { throw new Error('Test error'); },
      {
        operation: 'test-op',
        component: 'test',
        fallbackValue: 'fallback'
      }
    );

    expect(result).toBe('fallback');
  });

  test('should execute fallback function on error', async () => {
    const errorHandler = getErrorHandler();
    
    const result = await errorHandler.withErrorHandling(
      async () => { throw new Error('Test error'); },
      {
        operation: 'test-op',
        component: 'test',
        fallbackValue: () => 'dynamic-fallback'
      }
    );

    expect(result).toBe('dynamic-fallback');
  });

  test('should handle synchronous operations', () => {
    const errorHandler = getErrorHandler();
    
    const result = errorHandler.withSyncErrorHandling(
      () => 'sync-success',
      { operation: 'sync-op', component: 'test' }
    );

    expect(result).toBe('sync-success');
  });

  test('should handle synchronous errors', () => {
    const errorHandler = getErrorHandler();
    
    const result = errorHandler.withSyncErrorHandling(
      () => { throw new Error('Sync error'); },
      {
        operation: 'sync-op',
        component: 'test',
        fallbackValue: 'sync-fallback'
      }
    );

    expect(result).toBe('sync-fallback');
  });

  test('should wrap async function', async () => {
    const errorHandler = getErrorHandler();
    
    const asyncFn = async (x: number, y: number) => x + y;
    const wrapped = errorHandler.wrapAsync(
      asyncFn,
      { operation: 'wrapped-op', component: 'test' }
    );

    const result = await wrapped(2, 3);
    expect(result).toBe(5);
  });

  test('should handle wrapped function errors', async () => {
    const errorHandler = getErrorHandler();
    
    const asyncFn = async () => { throw new Error('Wrapped error'); };
    const wrapped = errorHandler.wrapAsync(
      asyncFn,
      {
        operation: 'wrapped-op',
        component: 'test',
        fallbackValue: 'wrapped-fallback'
      }
    );

    const result = await wrapped();
    expect(result).toBe('wrapped-fallback');
  });

  test('should create contextual error', () => {
    const errorHandler = getErrorHandler();
    
    const contextualError = errorHandler.createContextualError(
      'Test message',
      { operation: 'context-op', component: 'test' }
    );

    expect(contextualError).toBeInstanceOf(Error);
    expect(contextualError.message).toBe('Test message');
    expect((contextualError as any).context).toEqual({
      operation: 'context-op',
      component: 'test'
    });
  });

  test('should handle non-Error objects', async () => {
    const errorHandler = getErrorHandler();
    
    const result = await errorHandler.withErrorHandling(
      async () => { throw 'string error'; },
      {
        operation: 'test-op',
        component: 'test',
        fallbackValue: 'fallback'
      }
    );

    expect(result).toBe('fallback');
  });

  test('should handle undefined and null gracefully', async () => {
    const errorHandler = getErrorHandler();
    
    const result1 = await errorHandler.withErrorHandling(
      async () => { throw undefined; },
      {
        operation: 'undefined-op',
        component: 'test',
        fallbackValue: 'handled-undefined'
      }
    );
    
    const result2 = await errorHandler.withErrorHandling(
      async () => { throw null; },
      {
        operation: 'null-op',
        component: 'test',
        fallbackValue: 'handled-null'
      }
    );
    
    expect(result1).toBe('handled-undefined');
    expect(result2).toBe('handled-null');
  });

  test('should handle concurrent error handling', async () => {
    const errorHandler = getErrorHandler();
    
    const results = await Promise.all([
      errorHandler.withErrorHandling(
        async () => { throw new Error('Concurrent 1'); },
        { operation: 'concurrent-1', component: 'test', fallbackValue: 'fb1' }
      ),
      errorHandler.withErrorHandling(
        async () => 'success',
        { operation: 'concurrent-2', component: 'test' }
      ),
      errorHandler.withErrorHandling(
        async () => { throw new Error('Concurrent 3'); },
        { operation: 'concurrent-3', component: 'test', fallbackValue: 'fb3' }
      )
    ]);
    
    expect(results).toEqual(['fb1', 'success', 'fb3']);
  });
});