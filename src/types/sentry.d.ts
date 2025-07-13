/**
 * Type declarations for Sentry packages
 * These allow TypeScript to compile even when packages aren't installed
 */

declare module '@sentry/browser' {
  export function init(options: any): void;
  export function captureException(error: any, context?: any): void;
  export function captureMessage(message: string, level?: string, context?: any): void;
  export function setUser(user: any): void;
  export function getCurrentHub(): any;
  export const browserTracingIntegration: any;
}

declare module '@sentry/integrations' {
  export class CaptureConsole {
    constructor(options?: any);
  }
}