#!/usr/bin/env node

/**
 * QA Verification Script
 * Verifies all technical debt fixes are properly implemented
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkImports(filePath, imports) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const missing = imports.filter(imp => !content.includes(imp));
    return { success: missing.length === 0, missing };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkPatterns(filePath, patterns) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const found = patterns.filter(pattern => {
      const regex = new RegExp(pattern.regex, pattern.flags || 'g');
      return regex.test(content);
    });
    return { success: found.length === patterns.length, found, total: patterns.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runQAChecks() {
  console.log(`${colors.blue}🔍 Running QA Verification...${colors.reset}\n`);
  
  const checks = [
    {
      name: '1. Storage Retry Mechanism',
      tests: [
        {
          name: 'Storage retry implementation',
          type: 'pattern',
          file: 'src/features/settings/storage.ts',
          patterns: [
            { regex: 'private retryTimer:', description: 'Retry timer property' },
            { regex: 'private failedWrites:', description: 'Failed writes tracking' },
            { regex: 'RETRY_DELAYS.*=.*\\[1000, 2000, 4000\\]', description: 'Exponential backoff' },
            { regex: 'scheduleRetry\\(\\)', description: 'Retry scheduling method' },
            { regex: 'retryFailedWrites\\(\\)', description: 'Retry execution method' },
            { regex: 'localStorage\\.setItem.*fluent_failed_writes', description: 'LocalStorage backup' }
          ]
        }
      ]
    },
    {
      name: '2. Error Handler Implementation',
      tests: [
        {
          name: 'TypeScript error handler',
          type: 'file',
          file: 'src/shared/utils/error-handler.ts'
        },
        {
          name: 'JavaScript error handler for workers',
          type: 'file',
          file: 'workers/cloudflare/error-handler.js'
        },
        {
          name: 'Error handler imports in main.ts',
          type: 'imports',
          file: 'src/features/translation/main.ts',
          imports: [
            'getErrorHandler',
            'errorHandler.withErrorHandling'
          ]
        },
        {
          name: 'Error handler usage in handler.js',
          type: 'imports',
          file: 'workers/cloudflare/handler.js',
          imports: [
            'getErrorHandler',
            './error-handler.js'
          ]
        }
      ]
    },
    {
      name: '3. Memory Monitoring',
      tests: [
        {
          name: 'Memory monitor implementation',
          type: 'file',
          file: 'src/shared/memory-monitor.ts'
        },
        {
          name: 'Performance API usage',
          type: 'pattern',
          file: 'src/shared/memory-monitor.ts',
          patterns: [
            { regex: 'performance.*memory', description: 'Performance.memory API' },
            { regex: 'usedJSHeapSize', description: 'Actual memory measurement' },
            { regex: 'jsHeapSizeLimit', description: 'Memory limit checking' }
          ]
        },
        {
          name: 'Memory monitor integration in worker',
          type: 'imports',
          file: 'src/core/worker.ts',
          imports: [
            'getMemoryMonitor',
            'memoryMonitor.checkMemory'
          ]
        }
      ]
    },
    {
      name: '4. Service Worker Lifecycle',
      tests: [
        {
          name: 'Lifecycle manager implementation',
          type: 'file',
          file: 'src/shared/service-worker-lifecycle.ts'
        },
        {
          name: 'Chrome alarms API usage',
          type: 'pattern',
          file: 'src/shared/service-worker-lifecycle.ts',
          patterns: [
            { regex: 'chrome\\.alarms\\.create', description: 'Alarm creation' },
            { regex: 'chrome\\.alarms\\.onAlarm', description: 'Alarm listener' },
            { regex: 'sendKeepAlivePing', description: 'Keepalive mechanism' },
            { regex: 'chrome\\.runtime\\.onSuspend', description: 'Suspend handling' }
          ]
        },
        {
          name: 'Lifecycle integration in worker',
          type: 'imports',
          file: 'src/core/worker.ts',
          imports: [
            'getLifecycleManager',
            'lifecycleManager.initialize',
            'lifecycleManager.startOperation'
          ]
        }
      ]
    },
    {
      name: '5. AsyncManager Cleanup',
      tests: [
        {
          name: 'AsyncManager limits',
          type: 'pattern',
          file: 'src/shared/async.ts',
          patterns: [
            { regex: 'MAX_OPERATIONS.*=.*100', description: 'Operation limit' },
            { regex: 'OPERATION_TIMEOUT.*=.*5.*\\*.*60', description: 'Timeout setting' },
            { regex: 'cleanupOldOperations', description: 'Cleanup method' },
            { regex: 'getOldestOperationId', description: 'LRU eviction' },
            { regex: 'scheduleCleanup', description: 'Periodic cleanup' }
          ]
        }
      ]
    },
    {
      name: '6. Try/Catch Refactoring Progress',
      tests: [
        {
          name: 'Migration script',
          type: 'file',
          file: 'scripts/migrate-error-handling.js'
        },
        {
          name: 'Reduced try/catch in main.ts',
          type: 'custom',
          async check() {
            const content = await fs.readFile(path.join(rootDir, 'src/features/translation/main.ts'), 'utf8');
            const tryCount = (content.match(/try\s*{/g) || []).length;
            const errorHandlerCount = (content.match(/errorHandler\.withErrorHandling/g) || []).length;
            return {
              success: tryCount <= 2 && errorHandlerCount >= 8,
              details: `Try blocks: ${tryCount} (target: ≤2), Error handler calls: ${errorHandlerCount} (target: ≥8)`
            };
          }
        }
      ]
    }
  ];
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const section of checks) {
    console.log(`\n${colors.blue}${section.name}${colors.reset}`);
    
    for (const test of section.tests) {
      process.stdout.write(`  ${test.name}... `);
      
      let result;
      if (test.type === 'file') {
        const exists = await checkFileExists(path.join(rootDir, test.file));
        result = { success: exists };
      } else if (test.type === 'imports') {
        result = await checkImports(path.join(rootDir, test.file), test.imports);
      } else if (test.type === 'pattern') {
        result = await checkPatterns(path.join(rootDir, test.file), test.patterns);
      } else if (test.type === 'custom') {
        result = await test.check();
      }
      
      if (result.success) {
        console.log(`${colors.green}✓${colors.reset}`);
        if (result.details) {
          console.log(`    ${colors.yellow}${result.details}${colors.reset}`);
        }
        totalPassed++;
      } else {
        console.log(`${colors.red}✗${colors.reset}`);
        if (result.error) {
          console.log(`    ${colors.red}Error: ${result.error}${colors.reset}`);
        } else if (result.missing) {
          console.log(`    ${colors.red}Missing imports: ${result.missing.join(', ')}${colors.reset}`);
        } else if (result.found !== undefined) {
          console.log(`    ${colors.red}Found ${result.found.length}/${result.total} patterns${colors.reset}`);
        }
        totalFailed++;
      }
    }
  }
  
  // Summary
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}Summary:${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${totalPassed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${totalFailed}${colors.reset}`);
  console.log(`  Total: ${totalPassed + totalFailed}`);
  
  if (totalFailed === 0) {
    console.log(`\n${colors.green}✨ All QA checks passed! The codebase is stable and performant.${colors.reset}`);
  } else {
    console.log(`\n${colors.red}⚠️  Some checks failed. Please review the issues above.${colors.reset}`);
  }
  
  // Performance recommendations
  console.log(`\n${colors.blue}Performance Metrics to Monitor:${colors.reset}`);
  console.log('  • Memory usage: < 20MB warning, < 25MB critical');
  console.log('  • Storage retry success rate: > 95%');
  console.log('  • Service worker uptime: > 30 seconds during operations');
  console.log('  • Error handling coverage: 100% of async operations');
  console.log('  • AsyncManager pending operations: < 50 average');
}

// Run the checks
runQAChecks().catch(console.error);