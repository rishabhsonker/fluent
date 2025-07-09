import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Build Validation Tests', () => {
  const distPath = path.join(__dirname, '../../dist');

  test('dist directory exists', async () => {
    expect(fs.existsSync(distPath)).toBeTruthy();
  });

  test('manifest.json exists and is valid', async () => {
    const manifestPath = path.join(distPath, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBeTruthy();
    
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Validate manifest structure
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Fluent - Language Learning While Browsing');
    expect(manifest.version).toBeTruthy();
  });

  test('required build files exist', async () => {
    const requiredFiles = [
      'popup.html',
      'popup.js',
      'content.js',
      'background.js'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(distPath, file);
      expect(fs.existsSync(filePath)).toBeTruthy();
    }
  });

  test('icons directory exists with required icons', async () => {
    const iconsPath = path.join(distPath, 'icons');
    expect(fs.existsSync(iconsPath)).toBeTruthy();
    
    const requiredIcons = ['icon-16.png', 'icon-48.png', 'icon-128.png'];
    for (const icon of requiredIcons) {
      const iconPath = path.join(iconsPath, icon);
      expect(fs.existsSync(iconPath)).toBeTruthy();
    }
  });

  test('data directory exists with common words', async () => {
    const dataPath = path.join(distPath, 'data');
    expect(fs.existsSync(dataPath)).toBeTruthy();
    
    const commonWordsPath = path.join(dataPath, 'common-words-en.json');
    expect(fs.existsSync(commonWordsPath)).toBeTruthy();
    
    // Validate JSON structure
    const commonWords = JSON.parse(fs.readFileSync(commonWordsPath, 'utf-8'));
    expect(Array.isArray(commonWords)).toBeTruthy();
    expect(commonWords.length).toBeGreaterThan(0);
  });

  test('popup.html has correct structure', async () => {
    const popupPath = path.join(distPath, 'popup.html');
    const popupContent = fs.readFileSync(popupPath, 'utf-8');
    
    // Check for required elements
    expect(popupContent).toContain('<!DOCTYPE html>');
    expect(popupContent).toContain('<div id="root">');
    expect(popupContent).toContain('popup.js');
  });

  test('JavaScript files are minified', async () => {
    const jsFiles = ['popup.js', 'content.js', 'background.js'];
    
    for (const file of jsFiles) {
      const filePath = path.join(distPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check that file is minified (no excessive whitespace, newlines)
      const lines = content.split('\n');
      expect(lines.length).toBeLessThan(50); // Minified files should have few lines
      expect(content.length).toBeGreaterThan(100); // But still have content
    }
  });
});