#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find initializeExtension function
let inFunction = false;
let braceCount = 0;
let startLine = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('async function initializeExtension')) {
    inFunction = true;
    startLine = i;
    console.log(`Function starts at line ${i + 1}`);
  }
  
  if (inFunction) {
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    if (braceCount === 0 && startLine !== i) {
      console.log(`Function ends at line ${i + 1}`);
      console.log(`\nFunction content (lines ${startLine + 1}-${i + 1}):`);
      console.log('='.repeat(50));
      
      // Print with line numbers
      for (let j = startLine; j <= i; j++) {
        console.log(`${(j + 1).toString().padStart(4)}: ${lines[j]}`);
      }
      break;
    }
  }
}