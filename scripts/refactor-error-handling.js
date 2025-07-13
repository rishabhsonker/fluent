#!/usr/bin/env node

/**
 * Script to help identify and refactor error handling patterns
 * This helps us replace duplicated try/catch blocks with centralized error handling
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Files to scan
const filesToScan = [
  'src/features/settings/storage.ts',
  'src/features/translation/translator.ts',
  'src/features/translation/explainer.ts',
  'src/shared/network.ts',
  'src/shared/offline.ts',
  'src/shared/cost.ts',
  'src/features/auth/auth.ts',
  'src/features/auth/crypto.ts',
  'src/features/ui/popup/App.tsx',
  'src/features/ui/popup/components/Settings.tsx'
];

// Count error handling patterns
function analyzeErrorPatterns() {
  const patterns = {
    tryBlocks: 0,
    loggerErrors: 0,
    defaultReturns: 0,
    rethrows: 0,
    contexts: []
  };

  filesToScan.forEach(file => {
    const filePath = join(rootDir, file);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (e) {
      console.log(`Skipping ${file} - not found`);
      return;
    }

    // Count try blocks
    const tryMatches = content.match(/try\s*{/g);
    if (tryMatches) {
      patterns.tryBlocks += tryMatches.length;
    }

    // Count logger.error calls
    const loggerMatches = content.match(/logger\.error\(/g);
    if (loggerMatches) {
      patterns.loggerErrors += loggerMatches.length;
    }

    // Count return defaultValue patterns
    const defaultReturnMatches = content.match(/return\s+defaultValue/g);
    if (defaultReturnMatches) {
      patterns.defaultReturns += defaultReturnMatches.length;
    }

    // Count rethrows
    const rethrowMatches = content.match(/throw\s+error/g);
    if (rethrowMatches) {
      patterns.rethrows += rethrowMatches.length;
    }

    // Extract contexts (what operations are being wrapped)
    const contextMatches = content.matchAll(/logger\.error\(['"`]([^'"`]+)['"`]/g);
    for (const match of contextMatches) {
      patterns.contexts.push({
        file: file,
        context: match[1]
      });
    }
  });

  return patterns;
}

// Generate refactoring suggestions
function generateRefactoringSuggestions(patterns) {
  console.log('\n=== Error Handling Analysis ===\n');
  console.log(`Total try blocks found: ${patterns.tryBlocks}`);
  console.log(`Logger.error calls: ${patterns.loggerErrors}`);
  console.log(`Default value returns: ${patterns.defaultReturns}`);
  console.log(`Error rethrows: ${patterns.rethrows}`);
  
  console.log('\n=== Common Error Contexts ===');
  const contextGroups = patterns.contexts.reduce((acc, item) => {
    const key = item.context.split(':')[0].trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  Object.entries(contextGroups).forEach(([context, items]) => {
    console.log(`\n${context}: ${items.length} occurrences`);
    items.forEach(item => console.log(`  - ${item.file}`));
  });

  console.log('\n=== Refactoring Priority ===');
  console.log('1. Storage operations (get, set, remove)');
  console.log('2. API calls (translate, explain)');
  console.log('3. Chrome API calls (tabs, runtime)');
  console.log('4. Crypto operations');
  console.log('5. Network requests');
}

// Main execution
const patterns = analyzeErrorPatterns();
generateRefactoringSuggestions(patterns);

console.log('\n=== Next Steps ===');
console.log('1. Import error handler: import { getErrorHandler } from "@/shared/utils/error-handler";');
console.log('2. Replace try/catch blocks with errorHandler.withErrorHandling()');
console.log('3. Add proper context information');
console.log('4. Ensure sensitive data is sanitized');