/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * Sentry stub for when the actual SDK is not available
 */

import { initErrorHandler } from './error-handler';
import { config } from '../config';

export type ExtensionContext = 'background' | 'content' | 'popup';

/**
 * Initialize error handling without Sentry
 * This is used when Sentry packages are not available
 */
export async function initSentry(context: ExtensionContext) {
  console.info(`[${context}] Error handler initialized (Sentry not available)`);
  return initErrorHandler();
}

/**
 * Get error handler for the current context
 */
export function getContextErrorHandler() {
  return initErrorHandler();
}