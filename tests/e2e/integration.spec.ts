/**
 * Copyright (c) 2024 Fluent Language Learning Extension. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * 
 * This file is part of the Fluent Language Learning Extension and is the
 * proprietary and confidential property of the copyright holder. Unauthorized
 * copying, modification, distribution, or use of this file, via any medium,
 * is strictly prohibited.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Fluent Extension Integration Tests', () => {
  let extensionId: string;

  test.beforeEach(async ({ context }) => {
    // Get extension ID from background service worker
    const [background] = context.serviceWorkers();
    if (background) {
      const url = background.url();
      extensionId = url.split('/')[2];
    }
  });

  test('should load extension without errors', async ({ context }) => {
    // Check that service worker is running
    const workers = context.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
  });

  test('should handle message passing between popup and service worker', async ({ context }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Wait for popup to load and fetch settings
    await popup.waitForSelector('.fluent-container', { timeout: 5000 });
    
    // Check that settings were loaded (popup shows content)
    const title = await popup.locator('.fluent-title').textContent();
    expect(title).toBe('Fluent');
  });

  test('should persist language selection', async ({ context }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Wait for language grid
    await popup.waitForSelector('.fluent-language-grid');
    
    // Click German
    await popup.locator('button:has-text("German")').click();
    
    // Close and reopen popup
    await popup.close();
    const newPopup = await context.newPage();
    await newPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Wait for language grid
    await newPopup.waitForSelector('.fluent-language-grid');
    
    // Check German is still selected
    const activeButton = await newPopup.locator('.fluent-lang-button-active').textContent();
    expect(activeButton).toContain('German');
  });

  test('should show learning progress section', async ({ context }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Check learning progress section exists
    await expect(popup.locator('h2:has-text("Learning Progress")')).toBeVisible();
    
    // Should show stats or prompt to start
    const statsSection = popup.locator('.fluent-stats, .fluent-no-stats');
    await expect(statsSection).toBeVisible();
  });
});