#!/usr/bin/env node

/**
 * Script to add proprietary license headers to all source files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LICENSE_HEADER = `/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * 
 * This file is part of the Fluent Language Learning Extension and is the
 * proprietary and confidential property of the copyright holder. Unauthorized
 * copying, modification, distribution, or use of this file, via any medium,
 * is strictly prohibited.
 */

`;

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', 'build', 'coverage', '.wrangler'];

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return EXTENSIONS.includes(ext);
}

function hasLicenseHeader(content) {
  return content.includes('Copyright (c) 2024 Fluent Language Learning Extension');
}

function addLicenseHeader(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (hasLicenseHeader(content)) {
    return false; // Already has header
  }
  
  // Skip if file starts with shebang
  if (content.startsWith('#!')) {
    const lines = content.split('\n');
    const shebang = lines[0];
    const rest = lines.slice(1).join('\n');
    fs.writeFileSync(filePath, shebang + '\n\n' + LICENSE_HEADER + rest);
  } else {
    fs.writeFileSync(filePath, LICENSE_HEADER + content);
  }
  
  return true;
}

function processDirectory(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(item)) {
        count += processDirectory(fullPath);
      }
    } else if (stat.isFile() && shouldProcessFile(fullPath)) {
      if (addLicenseHeader(fullPath)) {
        console.log(`✓ Added header to: ${path.relative(process.cwd(), fullPath)}`);
        count++;
      }
    }
  }
  
  return count;
}

// Main execution
console.log('Adding proprietary license headers to source files...\n');

const rootDir = path.join(__dirname, '..');
const count = processDirectory(rootDir);

console.log(`\n✅ Added license headers to ${count} files`);
console.log('\nNote: You should review the changes before committing.');