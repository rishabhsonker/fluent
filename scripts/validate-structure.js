#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Track all kinds of brackets
let braces = 0;
let parens = 0;
let brackets = 0;
let inString = false;
let inComment = false;
let stringChar = null;

for (let i = 0; i < Math.min(405, lines.length); i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prevChar = j > 0 ? line[j-1] : '';
    
    // Handle comments
    if (!inString && char === '/' && line[j+1] === '/') {
      break; // Skip rest of line
    }
    
    // Handle strings
    if (!inComment && (char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    if (!inString && !inComment) {
      if (char === '{') braces++;
      if (char === '}') braces--;
      if (char === '(') parens++;
      if (char === ')') parens--;
      if (char === '[') brackets++;
      if (char === ']') brackets--;
    }
  }
  
  // Log state at key lines
  if (lineNum === 400 || lineNum === 401 || lineNum === 402 || lineNum === 403 || lineNum === 404 || lineNum === 405) {
    console.log(`Line ${lineNum}: braces=${braces}, parens=${parens}, brackets=${brackets}`);
    console.log(`  Content: ${line.trim().substring(0, 60)}...`);
  }
}

console.log(`\nAt line 405:`);
console.log(`Braces: ${braces} (should be 1 for main IIFE)`);
console.log(`Parens: ${parens} (should be 1 for main IIFE)`);
console.log(`Brackets: ${brackets} (should be 0)`);