#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let braceStack = [];
let parenStack = [];
let issues = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    
    if (char === '{') {
      braceStack.push({ line: lineNum, col: j + 1, context: line.trim() });
    } else if (char === '}') {
      if (braceStack.length === 0) {
        issues.push(`Line ${lineNum}: Unexpected closing brace }`);
      } else {
        braceStack.pop();
      }
    } else if (char === '(') {
      parenStack.push({ line: lineNum, col: j + 1, context: line.trim() });
    } else if (char === ')') {
      if (parenStack.length === 0) {
        issues.push(`Line ${lineNum}: Unexpected closing paren )`);
      } else {
        parenStack.pop();
      }
    }
  }
}

console.log('=== Brace Analysis ===');
console.log(`Total lines: ${lines.length}`);
console.log(`Unclosed braces: ${braceStack.length}`);
console.log(`Unclosed parens: ${parenStack.length}`);
console.log();

if (braceStack.length > 0) {
  console.log('=== Unclosed Braces ===');
  braceStack.forEach(item => {
    console.log(`Line ${item.line}, col ${item.col}: ${item.context.substring(0, 60)}...`);
  });
  console.log();
}

if (parenStack.length > 0) {
  console.log('=== Unclosed Parentheses ===');
  parenStack.forEach(item => {
    console.log(`Line ${item.line}, col ${item.col}: ${item.context.substring(0, 60)}...`);
  });
  console.log();
}

if (issues.length > 0) {
  console.log('=== Issues Found ===');
  issues.forEach(issue => console.log(issue));
}

// Find key structural points
console.log('\n=== Key Functions ===');
lines.forEach((line, i) => {
  if (line.includes('async function') || line.includes('function')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});