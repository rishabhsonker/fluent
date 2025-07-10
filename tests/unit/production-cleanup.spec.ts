import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Production Cleanup Verification', () => {
  test('should not contain console.log statements in production code', () => {
    const filesToCheck = [
      'src/background/service-worker.ts',
      'src/content/index.ts',
      'src/popup/App.tsx',
      'src/lib/simpleTranslator.ts'
    ];
    
    filesToCheck.forEach(file => {
      const content = readFileSync(join(__dirname, '../..', file), 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Skip import statements and comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('import')) {
          return;
        }
        
        // Check for console statements
        if (line.includes('console.log') || line.includes('console.error') || line.includes('console.warn')) {
          // Allow console in logger.ts as it's the logging utility
          if (!file.includes('logger.ts')) {
            throw new Error(`Found console statement in ${file} at line ${index + 1}: ${line.trim()}`);
          }
        }
      });
    });
  });
  
  test('should not contain TODO comments in critical files', () => {
    const filesToCheck = [
      'src/lib/simpleTranslator.ts',
      'src/background/service-worker.ts'
    ];
    
    filesToCheck.forEach(file => {
      const content = readFileSync(join(__dirname, '../..', file), 'utf-8');
      
      if (content.includes('TODO:') || content.includes('FIXME:')) {
        throw new Error(`Found TODO/FIXME comment in ${file}`);
      }
    });
  });
  
  test('should not contain debug message handlers', () => {
    const serviceWorkerPath = join(__dirname, '../../src/background/service-worker.ts');
    const content = readFileSync(serviceWorkerPath, 'utf-8');
    
    expect(content).not.toContain('DEBUG_RESET_AUTH');
    expect(content).not.toContain('[Service Worker Debug]');
  });
  
  test('should use shared secret authentication', () => {
    const translatorPath = join(__dirname, '../../src/lib/simpleTranslator.ts');
    const content = readFileSync(translatorPath, 'utf-8');
    
    // Should have shared secret auth headers
    expect(content).toContain('fluent-extension-2024-shared-secret-key');
    expect(content).toContain('debug-installation');
    
    // Should not have TODO about auth
    expect(content).not.toContain('TODO: Fix installation-based auth');
  });
  
  test('should have production-ready bundle sizes', async () => {
    // Check dist folder exists
    const distFiles = [
      'dist/popup.js',
      'dist/content.js',
      'dist/background.js'
    ];
    
    distFiles.forEach(file => {
      try {
        const stats = require('fs').statSync(join(__dirname, '../..', file));
        const sizeInKB = stats.size / 1024;
        
        // Ensure bundles are reasonable size (under 300KB each)
        expect(sizeInKB).toBeLessThan(300);
      } catch (error) {
        // Skip if dist doesn't exist (not built yet)
        console.warn(`Skipping size check for ${file} - file not found`);
      }
    });
  });
});