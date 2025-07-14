#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Track brackets with their locations
let braceStack = [];
let parenStack = [];
let inString = false;
let stringChar = null;

// Process up to line 405
for (let i = 0; i < Math.min(405, lines.length); i++) {
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
      if (char === '{') {
        braceStack.push({ line: lineNum, col: j + 1, context: line.trim().substring(0, 50) });
      }
      if (char === '}') {
        if (braceStack.length > 0) {
          braceStack.pop();
        }
      }
      if (char === '(') {
        parenStack.push({ line: lineNum, col: j + 1, context: line.trim().substring(0, 50) });
      }
      if (char === ')') {
        if (parenStack.length > 0) {
          parenStack.pop();
        }
      }
    }
  }
}

console.log('=== Unclosed Braces (up to line 405) ===');
braceStack.forEach((item, idx) => {
  console.log(`${idx + 1}. Line ${item.line}: ${item.context}`);
});

console.log('\n=== Unclosed Parentheses (up to line 405) ===');
parenStack.forEach((item, idx) => {
  console.log(`${idx + 1}. Line ${item.line}: ${item.context}`);
});