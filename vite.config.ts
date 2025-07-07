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
        
        // Copy popup CSS
        if (existsSync('src/popup/popup.css')) {
          copyFileSync(
            resolve(__dirname, 'src/popup/popup.css'),
            resolve(__dirname, 'dist/popup.css')
          );
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
    minify: 'terser', // Always minify for production
    sourcemap: false, // No sourcemaps in production
    terserOptions: {
      format: {
        comments: false // Remove all comments
      },
      compress: {
        drop_console: true, // Remove all console statements
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.warn'],
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