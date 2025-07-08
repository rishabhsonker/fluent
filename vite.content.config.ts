import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      name: 'FluentContent',
      formats: ['iife'],
      fileName: () => 'content.js'
    },
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true
      }
    },
    target: 'chrome100',
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      format: {
        comments: false
      },
      compress: {
        drop_console: false, // Keep console statements for debugging
        drop_debugger: true,
        pure_funcs: [] // Don't remove any console functions for now
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': resolve(__dirname, 'src'),
      '@lib': resolve(__dirname, 'src/lib'),
      '@content': resolve(__dirname, 'src/content'),
      '@popup': resolve(__dirname, 'src/popup'),
      '@background': resolve(__dirname, 'src/background'),
      '@types': resolve(__dirname, 'src/types')
    }
  }
});