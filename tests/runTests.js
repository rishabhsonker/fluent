#!/usr/bin/env node

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


const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure extension is built
console.log('Building extension...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to build extension');
  process.exit(1);
}

// Check if dist directory exists
const distPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distPath)) {
  console.error('dist directory not found. Build failed.');
  process.exit(1);
}

// Check if manifest.json exists in dist
const manifestPath = path.join(distPath, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found in dist directory.');
  process.exit(1);
}

console.log('Extension built successfully!');
console.log('Running Playwright tests...');

// Run Playwright tests
try {
  execSync('npx playwright test', { stdio: 'inherit' });
} catch (error) {
  console.error('Tests failed');
  process.exit(1);
}