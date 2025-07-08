import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Basic Extension Tests', () => {
  test('extension structure is valid', async () => {
    // Check that required files exist
    const distPath = path.join(__dirname, '../../dist');
    const fs = await import('fs');
    
    // Check manifest
    const manifestPath = path.join(distPath, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBeTruthy();
    
    // Check key files
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

  test('manifest.json is valid', async () => {
    const fs = await import('fs');
    const manifestPath = path.join(__dirname, '../../dist/manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Check required fields
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.action).toBeTruthy();
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.content_scripts).toBeTruthy();
    expect(manifest.content_scripts[0].js).toContain('content.js');
  });

  test('extension can be loaded in browser', async () => {
    const pathToExtension = path.join(__dirname, '../../dist');
    
    const browser = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    
    const context = await browser.newContext();
    
    // Check service workers loaded
    await context.waitForEvent('serviceworker', { timeout: 5000 });
    const workers = context.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    
    await browser.close();
  });
});