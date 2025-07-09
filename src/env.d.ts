/// <reference types="vite/client" />

/**
 * Environment variables type definitions for Fluent Chrome Extension
 */
interface ImportMetaEnv {
  // Custom environment variables
  readonly VITE_FLUENT_DEBUG?: string
  
  // Vite built-in environment variables
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}