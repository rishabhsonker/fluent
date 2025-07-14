#!/usr/bin/env node

/**
 * Script to help migrate try/catch blocks to use centralized error handler
 * Usage: node scripts/migrate-error-handling.js [--analyze|--typescript|--javascript]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

// Patterns to identify different types of try/catch blocks
const patterns = {
  // Simple try/catch with console.error or logger
  simpleLog: /try\s*{\s*([\s\S]*?)\s*}\s*catch\s*\(([\w]+)\)\s*{\s*(console\.(error|log)|logger\.(error|warn))\s*\(/,
  
  // Try/catch that returns a value
  withReturn: /try\s*{\s*([\s\S]*?)\s*}\s*catch\s*\(([\w]+)\)\s*{\s*[^}]*return\s+([^}]+);\s*}/,
  
  // Try/catch that throws
  withThrow: /try\s*{\s*([\s\S]*?)\s*}\s*catch\s*\(([\w]+)\)\s*{\s*[^}]*throw\s+/,
  
  // Try/catch with finally
  withFinally: /try\s*{\s*([\s\S]*?)\s*}\s*catch\s*\(([\w]+)\)\s*{\s*([\s\S]*?)\s*}\s*finally\s*{/,
  
  // Any try/catch block
  anyTryCatch: /try\s*{\s*[\s\S]*?\s*}\s*catch\s*\([^)]*\)\s*{[\s\S]*?}/g
};

// Files to skip (already using error handler or special cases)
const skipFiles = [
  'error-handler.ts',
  'error-handler.js',
  'sentry.ts',
  'sentry-init.ts',
  'error-boundary.tsx',
  'error-boundary.ts',
  'migrate-error-handling.js'
];

async function findFiles(pattern) {
  return glob(pattern, { 
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    nodir: true 
  });
}

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const fileName = path.basename(filePath);
  
  // Skip if file is in skip list
  if (skipFiles.some(skip => fileName.includes(skip))) {
    return null;
  }
  
  // Check if already using error handler
  if (content.includes('getErrorHandler') || content.includes('withErrorHandling')) {
    return null;
  }
  
  // Find all try/catch blocks
  const matches = content.match(patterns.anyTryCatch) || [];
  if (matches.length === 0) {
    return null;
  }
  
  // Analyze each try/catch block
  const blocks = matches.map(block => {
    let type = 'unknown';
    let canAutoMigrate = false;
    
    if (patterns.simpleLog.test(block)) {
      type = 'simple-log';
      canAutoMigrate = true;
    } else if (patterns.withReturn.test(block)) {
      type = 'with-return';
      canAutoMigrate = true;
    } else if (patterns.withThrow.test(block)) {
      type = 'with-throw';
      canAutoMigrate = false; // Needs manual review
    } else if (patterns.withFinally.test(block)) {
      type = 'with-finally';
      canAutoMigrate = false; // Complex, needs manual review
    }
    
    // Extract the operation context
    const lines = content.split('\n');
    const blockStart = content.indexOf(block);
    const lineNumber = content.substring(0, blockStart).split('\n').length;
    
    // Try to find function/method name
    let context = 'unknown';
    for (let i = lineNumber - 1; i >= Math.max(0, lineNumber - 10); i--) {
      const line = lines[i];
      const funcMatch = line.match(/(?:async\s+)?(?:function|class)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=.*(?:async\s*)?(?:\(|=>)|(?:async\s+)?(\w+)\s*\(/);
      if (funcMatch) {
        context = funcMatch[1] || funcMatch[2] || funcMatch[3];
        break;
      }
    }
    
    return {
      type,
      canAutoMigrate,
      lineNumber,
      context,
      preview: block.substring(0, 100).replace(/\n/g, ' ') + '...'
    };
  });
  
  return {
    filePath,
    blocks,
    totalBlocks: blocks.length,
    autoMigratable: blocks.filter(b => b.canAutoMigrate).length
  };
}

async function generateMigrationSuggestion(filePath, isTypeScript) {
  const ext = path.extname(filePath);
  const componentName = path.basename(filePath, ext).replace(/[.-]/g, '_');
  
  if (isTypeScript) {
    return `
// Add import at the top of ${filePath}:
import { getErrorHandler } from '../shared/utils/error-handler';

// In the component/function:
const errorHandler = getErrorHandler();

// Replace try/catch blocks with:
const result = await errorHandler.withErrorHandling(
  async () => {
    // Your code here
  },
  {
    operation: 'operation-name',
    component: '${componentName}',
    extra: { /* context */ }
  }
);
`;
  } else {
    return `
// For Cloudflare Workers - add import at the top of ${filePath}:
import { getErrorHandler } from './error-handler.js';

// For other JavaScript files, you may need to adapt the error handling pattern
// or keep the try/catch but standardize the error logging.
`;
  }
}

async function analyzeCodebase() {
  console.log('🔍 Analyzing codebase for try/catch blocks...\n');
  
  const tsFiles = await findFiles('src/**/*.{ts,tsx}');
  const jsFiles = await findFiles('workers/**/*.js');
  const allFiles = [...tsFiles, ...jsFiles];
  
  let totalBlocks = 0;
  let totalAutoMigratable = 0;
  const results = [];
  
  for (const file of allFiles) {
    const analysis = await analyzeFile(file);
    if (analysis) {
      results.push(analysis);
      totalBlocks += analysis.totalBlocks;
      totalAutoMigratable += analysis.autoMigratable;
    }
  }
  
  // Sort by number of blocks
  results.sort((a, b) => b.totalBlocks - a.totalBlocks);
  
  console.log(`📊 Summary:`);
  console.log(`- Total files with try/catch: ${results.length}`);
  console.log(`- Total try/catch blocks: ${totalBlocks}`);
  console.log(`- Auto-migratable blocks: ${totalAutoMigratable}`);
  console.log(`- Manual review needed: ${totalBlocks - totalAutoMigratable}\n`);
  
  console.log('📋 Top 10 files by try/catch count:');
  results.slice(0, 10).forEach(result => {
    console.log(`\n${result.filePath}:`);
    console.log(`  Blocks: ${result.totalBlocks} (${result.autoMigratable} auto-migratable)`);
    result.blocks.slice(0, 3).forEach(block => {
      console.log(`  - Line ${block.lineNumber}: ${block.type} in ${block.context}()`);
    });
  });
  
  // Save detailed report
  const report = {
    summary: {
      totalFiles: results.length,
      totalBlocks,
      autoMigratable: totalAutoMigratable,
      manualReview: totalBlocks - totalAutoMigratable
    },
    files: results,
    timestamp: new Date().toISOString()
  };
  
  await fs.writeFile(
    'error-handling-migration-report.json',
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n✅ Detailed report saved to error-handling-migration-report.json');
}

async function showMigrationGuide() {
  console.log(`
🔧 Error Handler Migration Guide
================================

1. TypeScript Files (.ts, .tsx):
   - Import: import { getErrorHandler } from '../shared/utils/error-handler';
   - Create instance: const errorHandler = getErrorHandler();
   - Use withErrorHandling for async operations
   - Use withSyncErrorHandling for sync operations

2. Cloudflare Workers (.js):
   - Import: import { getErrorHandler } from './error-handler.js';
   - Same usage pattern as TypeScript

3. Common Patterns:

   // Simple logging replacement:
   try {
     await doSomething();
   } catch (error) {
     logger.error('Failed', error);
   }
   
   // Becomes:
   await errorHandler.withErrorHandling(
     () => doSomething(),
     { operation: 'do-something', component: 'component-name' }
   );

   // With fallback value:
   try {
     return await fetchData();
   } catch (error) {
     logger.error('Fetch failed', error);
     return defaultData;
   }
   
   // Becomes:
   return await errorHandler.withErrorHandling(
     () => fetchData(),
     { 
       operation: 'fetch-data',
       component: 'component-name',
       fallbackValue: defaultData
     }
   );

4. When to keep try/catch:
   - Initialization code (like Sentry init)
   - Very specific error handling logic
   - Performance-critical hot paths
   - Test code

Run with --analyze to see which files need migration.
`);
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--analyze')) {
  analyzeCodebase().catch(console.error);
} else {
  showMigrationGuide();
}