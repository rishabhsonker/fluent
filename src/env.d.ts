/// <reference types="vite/client" />

/**
 * Environment variables type definitions for Fluent Chrome Extension
 */
declare interface ImportMetaEnv {
  // Custom environment variables
  readonly VITE_FLUENT_DEBUG?: string
  
  // Vite built-in environment variables
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

// ImportMeta is already declared by Vite, we just extend ImportMetaEnv above