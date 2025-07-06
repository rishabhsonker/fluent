import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      writeBundle() {
        // Copy the bundled content script to the correct location
        copyFileSync(
          resolve(__dirname, 'src/content/content-main.js'),
          resolve(__dirname, 'dist/content.js')
        );
        // Copy styles
        copyFileSync(
          resolve(__dirname, 'src/content/styles.css'),
          resolve(__dirname, 'dist/content.css')
        );
        // Copy background script
        copyFileSync(
          resolve(__dirname, 'src/background/background-main.js'),
          resolve(__dirname, 'dist/background.js')
        );
        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/service-worker.js')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    // Chrome Extension specific optimizations
    minify: false, // Skip minification for now
    target: 'chrome100',
    sourcemap: false
  },
  // Copy static assets
  publicDir: 'public'
});