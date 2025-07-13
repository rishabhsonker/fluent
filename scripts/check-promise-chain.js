#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const filePath = join(__dirname, '..', 'src', 'features', 'translation', 'main.ts');
const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the Promise.all chain starting around line 227
for (let i = 225; i < 400 && i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  // Show lines with specific patterns
  if (line.includes('Promise.all') || 
      line.includes('.then') || 
      line.includes('.catch') ||
      line.includes('await errorHandler') ||
      line.includes('}, {') ||
      line.includes('});')) {
    console.log(`${lineNum.toString().padStart(4)}: ${line}`);
  }
}