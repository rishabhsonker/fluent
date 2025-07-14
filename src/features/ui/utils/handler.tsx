/**
 * UI-specific error handling utilities
 * Wraps the shared error handler with UI-specific features
 */

import { getErrorHandler } from '../../../shared/utils/error-handler';
import type { ErrorContext } from '../../../shared/utils/error-handler';
import { safe } from '../../../shared/utils/helpers';

interface UIErrorContext extends ErrorContext {
  showToast?: boolean;
  toastMessage?: string;
}

interface UIErrorHandlerOptions {
  onError?: (error: Error) => void;
  showToast?: boolean;
}

/**
 * Wraps an async operation with error handling suitable for UI components
 * Automatically shows error toasts and updates UI state
 */
export async function withUIErrorHandling<T>(
  operation: () => Promise<T>,
  context: UIErrorContext,
  options?: UIErrorHandlerOptions
): Promise<T | undefined> {
  const errorHandler = getErrorHandler();
  
  try {
    return await operation();
  } catch (error) {
    // Report to Sentry
    errorHandler.handleError(error, context);
    
    // Handle UI-specific error display
    if (options?.onError) {
      options.onError(error as Error);
    }
    
    // Show toast if requested (could be implemented with a toast library)
    if (context.showToast !== false) {
      const message = context.toastMessage || 
        (error instanceof Error ? error.message : 'An error occurred');
      // TODO: Implement toast notification
      console.error(message);
    }
    
    return undefined;
  }
}

/**
 * React hook for error handling in components
 */
export function useErrorHandler(component: string) {
  return {
    handleError: (error: unknown, operation: string, extra?: Record<string, any>) => {
      const errorHandler = getErrorHandler();
      errorHandler.handleError(error, {
        operation: `ui.${component}.${operation}`,
        component: `ui.${component}`,
        extra
      });
    },
    
    withErrorHandling: <T,>(
      operation: () => Promise<T>,
      operationName: string,
      options?: UIErrorHandlerOptions
    ) => {
      return withUIErrorHandling(
        operation,
        {
          operation: `ui.${component}.${operationName}`,
          component: `ui.${component}`
        },
        options
      );
    }
  };
}