import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'typescript-chrome-extension',
      closeBundle() {
        // Ensure dist directory exists
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true });
        }

        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );

        // Copy content styles
        if (existsSync('src/content/styles.css')) {
          copyFileSync(
            resolve(__dirname, 'src/content/styles.css'),
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
        popup: resolve(__dirname, 'popup.html'),
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
        format: 'es'
      }
    },
    target: 'esnext',
    minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
    sourcemap: process.env.NODE_ENV === 'development',
    terserOptions: {
      format: {
        comments: false
      },
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
        pure_funcs: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug'] : []
      },
      mangle: {
        safari10: true
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
  },
  esbuild: {
    target: 'chrome100'
  }
});