#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Running pre-publish checks for Fluent extension...\n');

let errors = 0;
let warnings = 0;

// Check 1: Verify manifest.json exists and is valid
try {
  const manifestPath = path.join(__dirname, '../dist/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`✅ Manifest version: ${manifest.version}`);
  console.log(`✅ Extension name: ${manifest.name}`);
} catch (error) {
  console.error('❌ Error reading manifest.json:', error.message);
  errors++;
}

// Check 2: Look for console.log statements
console.log('\n📋 Checking for console.log statements...');
const jsFiles = ['content.js', 'background.js', 'popup.js'];
jsFiles.forEach(file => {
  try {
    const filePath = path.join(__dirname, '../dist', file);
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/console\.(log|error|warn|info)/g);
    if (matches) {
      console.warn(`⚠️  Found ${matches.length} console statements in ${file}`);
      warnings++;
    } else {
      console.log(`✅ No console statements in ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error reading ${file}:`, error.message);
    errors++;
  }
});

// Check 3: File sizes
console.log('\n📦 Checking file sizes...');
const sizeTargets = {
  'content.js': 20 * 1024, // 20KB max
  'background.js': 50 * 1024, // 50KB max
  'popup.js': 500 * 1024 // 500KB max (includes React)
};

for (const [file, maxSize] of Object.entries(sizeTargets)) {
  try {
    const filePath = path.join(__dirname, '../dist', file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    if (stats.size > maxSize) {
      console.error(`❌ ${file} is too large: ${sizeKB}KB (max: ${maxSize/1024}KB)`);
      errors++;
    } else {
      console.log(`✅ ${file}: ${sizeKB}KB`);
    }
  } catch (error) {
    console.error(`❌ Error checking ${file}:`, error.message);
    errors++;
  }
}

// Check 4: Total package size
try {
  const getDirectorySize = (dir) => {
    let size = 0;
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    });
    
    return size;
  };
  
  const distSize = getDirectorySize(path.join(__dirname, '../dist'));
  const sizeMB = (distSize / 1024 / 1024).toFixed(2);
  
  console.log(`\n📊 Total package size: ${sizeMB}MB`);
  
  if (distSize > 10 * 1024 * 1024) {
    console.error('❌ Package too large! Chrome limit is 10MB');
    errors++;
  } else {
    console.log('✅ Package size is within Chrome limits');
  }
} catch (error) {
  console.error('❌ Error calculating package size:', error.message);
  errors++;
}

// Check 5: Required files
console.log('\n📄 Checking required files...');
const requiredFiles = [
  'manifest.json',
  'content.js',
  'content.css',
  'background.js',
  'popup.html',
  'popup.js',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, '../dist', file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.error(`❌ Missing required file: ${file}`);
    errors++;
  }
});

// Final summary
console.log('\n' + '='.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('✅ All checks passed! Extension is ready to publish.');
} else {
  console.log(`⚠️  Found ${errors} errors and ${warnings} warnings`);
  if (errors > 0) {
    console.log('❌ Please fix errors before publishing!');
    process.exit(1);
  }
}
console.log('='.repeat(50));