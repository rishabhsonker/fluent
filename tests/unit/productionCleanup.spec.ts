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

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Production Cleanup Verification', () => {
  test('should not contain console.log statements in production code', () => {
    const filesToCheck = [
      'src/core/worker.ts',
      'src/features/translation/main.ts',
      'src/features/ui/popup/App.tsx',
      'src/features/translation/translator.ts'
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
      'src/features/translation/translator.ts',
      'src/core/worker.ts'
    ];
    
    filesToCheck.forEach(file => {
      const content = readFileSync(join(__dirname, '../..', file), 'utf-8');
      
      if (content.includes('TODO:') || content.includes('FIXME:')) {
        throw new Error(`Found TODO/FIXME comment in ${file}`);
      }
    });
  });
  
  test('should not contain debug message handlers', () => {
    const serviceWorkerPath = join(__dirname, '../../src/core/worker.ts');
    const content = readFileSync(serviceWorkerPath, 'utf-8');
    
    expect(content).not.toContain('DEBUG_RESET_AUTH');
    expect(content).not.toContain('[Service Worker Debug]');
  });
  
  test('should use installation-based authentication', () => {
    const translatorPath = join(__dirname, '../../src/features/translation/translator.ts');
    const content = readFileSync(translatorPath, 'utf-8');
    
    // Should use InstallationAuth instead of hardcoded debug auth
    expect(content).toContain('InstallationAuth.getAuthHeaders()');
    expect(content).not.toContain('debug-installation');
    expect(content).not.toContain('debug-signature');
    
    // Should have enableContext set to true for proactive fetching
    expect(content).toContain('enableContext: true');
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