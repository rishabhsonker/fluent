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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  define: {
    // Inject environment variables - these will be replaced at build time
    __WORKER_URL__: JSON.stringify(process.env.WORKER_URL || 'https://translator-dev.hq.workers.dev'),
    __ENVIRONMENT__: JSON.stringify(process.env.ENVIRONMENT || 'development'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN || '')
  },
  plugins: [
    react(),
    {
      name: 'typescript-chrome-extension',
      closeBundle() {
        // Ensure dist directory exists
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true });
        }
        
        // Copy popup CSS
        if (existsSync('src/features/ui/popup/popup.css')) {
          copyFileSync(
            resolve(__dirname, 'src/features/ui/popup/popup.css'),
            resolve(__dirname, 'dist/popup.css')
          );
        }

        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );

        // Copy content styles
        if (existsSync('src/features/translation/styles.css')) {
          copyFileSync(
            resolve(__dirname, 'src/features/translation/styles.css'),
            resolve(__dirname, 'dist/content.css')
          );
        }

        // Copy public assets
        const publicFiles = ['icons', 'data'];
        publicFiles.forEach(file => {
          const src = resolve(__dirname, 'public', file);
          const dest = resolve(__dirname, 'dist', file);
          if (existsSync(src)) {
            mkdirSync(dest, { recursive: true });
            // Copy directory contents
            const files = readdirSync(src);
            files.forEach(f => {
              if (f.endsWith('.png') || f.endsWith('.json')) {
                copyFileSync(
                  resolve(src, f),
                  resolve(dest, f)
                );
              }
            });
          }
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
        format: 'es'
      }
    },
    target: 'esnext',
    minify: 'terser', // Always minify for production
    sourcemap: false, // No sourcemaps in production
    terserOptions: {
      format: {
        comments: false // Remove all comments
      },
      compress: {
        drop_console: true, // Remove console statements in production
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2, // Run compression twice for better optimization
        ecma: 2020,
        module: true,
        toplevel: true,
        unsafe_arrows: true,
        warnings: false
      },
      mangle: {
        safari10: true,
        toplevel: true,
        properties: {
          regex: /^_/ // Mangle properties starting with underscore
        }
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': resolve(__dirname, 'src'),
      '@features': resolve(__dirname, 'src/features'),
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@types': resolve(__dirname, 'src/types')
    }
  },
  esbuild: {
    target: 'chrome100'
  }
});