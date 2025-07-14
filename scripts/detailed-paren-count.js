#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let parenCount = 0;
let lineParens = [];

// Process lines 232 to 400
for (let i = 231; i < 400 && i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  let lineOpen = 0;
  let lineClose = 0;
  
  // Count parens in this line (ignoring strings and comments)
  let inString = false;
  let stringChar = null;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prevChar = j > 0 ? line[j-1] : '';
    const nextChar = j < line.length - 1 ? line[j+1] : '';
    
    // Skip comments
    if (!inString && char === '/' && nextChar === '/') {
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
      if (char === '(') {
        parenCount++;
        lineOpen++;
      }
      if (char === ')') {
        parenCount--;
        lineClose++;
      }
    }
  }
  
  if (lineOpen > 0 || lineClose > 0) {
    lineParens.push({
      line: lineNum,
      open: lineOpen,
      close: lineClose,
      balance: parenCount,
      content: line.trim().substring(0, 60)
    });
  }
}

console.log('Parentheses tracking from line 232 to 400:\n');
lineParens.forEach(item => {
  console.log(`Line ${item.line}: +${item.open} -${item.close} = ${item.balance}`);
  console.log(`  ${item.content}...\n`);
});