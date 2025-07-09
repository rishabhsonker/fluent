import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.FLUENT_DEBUG': JSON.stringify('false')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background/service-worker.ts'),
      name: 'FluentBackground',
      formats: ['iife'],
      fileName: () => 'background.js'
    },
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true
      }
    },
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      format: {
        comments: false
      },
      compress: {
        drop_console: true, // Remove console statements in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace']
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