#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Count parens in the errorHandler call starting at line 232
let parenCount = 0;
let inString = false;
let stringChar = null;

console.log('Analyzing errorHandler.withErrorHandling call starting at line 232...\n');

for (let i = 231; i < 400 && i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prevChar = j > 0 ? line[j-1] : '';
    
    // Skip comments
    if (!inString && char === '/' && line[j+1] === '/') {
      break;
    }
    
    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    if (!inString) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
    }
  }
  
  // Log important lines
  if (lineNum === 232 || lineNum === 395 || parenCount === 0) {
    console.log(`Line ${lineNum}: paren balance = ${parenCount}`);
    console.log(`  ${line.trim()}\n`);
    
    if (parenCount === 0 && lineNum > 232) {
      console.log('ErrorHandler call properly closed!');
      break;
    }
  }
}