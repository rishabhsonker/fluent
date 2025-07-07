#!/usr/bin/env node

/**
 * Pre-publish checks for Chrome extension
 * Ensures production readiness before Chrome Web Store submission
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DIST_DIR = './dist';
const MAX_SIZE_MB = 10;
const REQUIRED_FILES = ['manifest.json', 'background.js', 'content.js', 'popup.html'];

console.log('🔍 Running pre-publish checks...\n');

// Check 1: Verify build exists
try {
  const distFiles = readdirSync(DIST_DIR);
  console.log(`✅ Build directory found with ${distFiles.length} files`);
} catch (error) {
  console.error('❌ Build directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Check 2: Verify required files
let missingFiles = [];
for (const file of REQUIRED_FILES) {
  try {
    statSync(join(DIST_DIR, file));
  } catch {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.error(`❌ Missing required files: ${missingFiles.join(', ')}`);
  process.exit(1);
} else {
  console.log('✅ All required files present');
}

// Check 3: Verify manifest
try {
  const manifest = JSON.parse(readFileSync(join(DIST_DIR, 'manifest.json'), 'utf8'));
  console.log(`📌 Extension: ${manifest.name} v${manifest.version}`);
  
  // Check manifest version
  if (manifest.manifest_version !== 3) {
    console.warn('⚠️  Not using Manifest V3');
  }
  
  // Check permissions
  const dangerousPermissions = ['<all_urls>', 'tabs', 'webNavigation', 'webRequest'];
  const usedDangerous = manifest.permissions?.filter(p => dangerousPermissions.includes(p)) || [];
  if (usedDangerous.length > 0) {
    console.warn(`⚠️  Using broad permissions: ${usedDangerous.join(', ')}`);
  }
} catch (error) {
  console.error('❌ Failed to parse manifest.json');
  process.exit(1);
}

// Check 4: Look for console.log statements
console.log('\n🔍 Checking for console.log statements...');
const jsFiles = readdirSync(DIST_DIR).filter(f => f.endsWith('.js'));
let consoleLogsFound = false;

for (const file of jsFiles) {
  const content = readFileSync(join(DIST_DIR, file), 'utf8');
  if (content.includes('console.log')) {
    console.warn(`⚠️  console.log found in ${file}`);
    consoleLogsFound = true;
  }
}

if (!consoleLogsFound) {
  console.log('✅ No console.log statements found');
}

// Check 5: Check for exposed API endpoints
console.log('\n🔍 Checking for hardcoded API endpoints...');
let exposedEndpoints = false;

for (const file of jsFiles) {
  const content = readFileSync(join(DIST_DIR, file), 'utf8');
  
  // Check for hardcoded worker URLs
  if (content.includes('.workers.dev') && !content.includes('localhost')) {
    console.error(`❌ Hardcoded worker URL found in ${file}`);
    exposedEndpoints = true;
  }
  
  // Check for API keys
  if (content.match(/api[_-]?key/i) && content.includes('=') && content.includes('"')) {
    console.error(`❌ Potential API key found in ${file}`);
    exposedEndpoints = true;
  }
}

if (!exposedEndpoints) {
  console.log('✅ No exposed API endpoints found');
}

// Check 6: Bundle size
console.log('\n📦 Checking bundle size...');
let totalSize = 0;

function getDirectorySize(dir) {
  let size = 0;
  const files = readdirSync(dir);
  
  for (const file of files) {
    const path = join(dir, file);
    const stat = statSync(path);
    
    if (stat.isDirectory()) {
      size += getDirectorySize(path);
    } else {
      size += stat.size;
    }
  }
  
  return size;
}

totalSize = getDirectorySize(DIST_DIR);
const sizeMB = totalSize / 1024 / 1024;

console.log(`📦 Total size: ${sizeMB.toFixed(2)}MB`);

if (sizeMB > MAX_SIZE_MB) {
  console.error(`❌ Bundle too large! Chrome limit is ${MAX_SIZE_MB}MB`);
  process.exit(1);
} else {
  console.log(`✅ Bundle size OK (limit: ${MAX_SIZE_MB}MB)`);
}

// Check 7: Security checks
console.log('\n🔒 Running security checks...');
let securityIssues = false;

for (const file of jsFiles) {
  const content = readFileSync(join(DIST_DIR, file), 'utf8');
  
  // Check for eval usage
  if (content.includes('eval(')) {
    console.error(`❌ eval() usage found in ${file}`);
    securityIssues = true;
  }
  
  // Check for innerHTML
  if (content.includes('innerHTML')) {
    console.warn(`⚠️  innerHTML usage found in ${file} - ensure content is sanitized`);
  }
  
  // Check for insecure protocols
  if (content.includes('http://') && !content.includes('http://localhost')) {
    console.warn(`⚠️  Insecure HTTP protocol found in ${file}`);
  }
}

if (!securityIssues) {
  console.log('✅ No critical security issues found');
}

// Final summary
console.log('\n' + '='.repeat(50));
if (exposedEndpoints || securityIssues || sizeMB > MAX_SIZE_MB) {
  console.error('\n❌ Pre-publish checks FAILED. Fix issues before publishing.');
  process.exit(1);
} else if (consoleLogsFound) {
  console.warn('\n⚠️  Pre-publish checks passed with warnings.');
  console.log('✅ Extension is ready for Chrome Web Store submission!');
} else {
  console.log('\n✅ All pre-publish checks PASSED!');
  console.log('🚀 Extension is ready for Chrome Web Store submission!');
}