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

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async ({ browser }) => {
  // Skip extension tests in CI
  if (process.env.CI) {
    test.skip();
    return;
  }
  
  // Launch browser with extension
  const pathToExtension = path.join(__dirname, '../../dist');
  context = await browser.newContext({
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  // Get extension ID
  const [background] = context.serviceWorkers();
  if (background) {
    const url = background.url();
    extensionId = url.split('/')[2];
  }
});

test.afterAll(async () => {
  if (context) {
    await context.close();
  }
});

test.describe('Tooltip Functionality', () => {
  test.beforeEach(async () => {
    if (process.env.CI) {
      test.skip();
    }
  });

  test('should show tooltip with new structure on hover', async () => {
    // Create a test page
    const page = await context.newPage();
    await page.setContent(`
      <html>
        <body>
          <h1>Test Page</h1>
          <p>The house is beautiful. Water is essential. Books contain knowledge.</p>
        </body>
      </html>
    `);
    
    // Wait for content script to process
    await page.waitForTimeout(2000);
    
    // Hover over a replaced word
    const fluentWord = page.locator('.fluent-word').first();
    await fluentWord.hover();
    
    // Wait for tooltip to appear
    await page.waitForSelector('.fluent-tooltip.visible', { timeout: 5000 });
    
    // Check tooltip structure
    const tooltip = page.locator('.fluent-tooltip');
    
    // Check translation and pronunciation on same line
    await expect(tooltip.locator('.fluent-tooltip-translation')).toBeVisible();
    await expect(tooltip.locator('.fluent-tooltip-translation-word')).toBeVisible();
    await expect(tooltip.locator('.fluent-tooltip-pronunciation')).toBeVisible();
    
    // Check word mapping with ⁂ symbol
    const wordMapping = tooltip.locator('.fluent-tooltip-word-mapping');
    await expect(wordMapping).toBeVisible();
    await expect(wordMapping).toContainText('⁂');
    await expect(wordMapping).toContainText('means');
    await expect(wordMapping).toContainText('in');
    
    // Check example sentences with emojis
    await expect(tooltip.locator('.fluent-tooltip-example-english')).toContainText('🔖');
    await expect(tooltip.locator('.fluent-tooltip-example-translated')).toContainText('📮');
    
    // Check progress bar is present
    await expect(tooltip.locator('.fluent-tooltip-progress')).toBeVisible();
    await expect(tooltip.locator('.fluent-tooltip-progress-bar')).toBeVisible();
  });

  test('should display gender information for German nouns', async () => {
    // Change language to German
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByText('German').click();
    await popup.close();
    
    // Create a test page with German content
    const page = await context.newPage();
    await page.setContent(`
      <html>
        <body>
          <p>The house is big. The water is cold. The book is interesting.</p>
        </body>
      </html>
    `);
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    // Hover over a word that should show gender
    const fluentWord = page.locator('.fluent-word').first();
    await fluentWord.hover();
    
    // Wait for tooltip
    await page.waitForSelector('.fluent-tooltip.visible', { timeout: 5000 });
    
    // Check for gender in word mapping (e.g., "Haus" (das, neuter))
    const wordMapping = page.locator('.fluent-tooltip-word-mapping');
    await expect(wordMapping).toMatch(/\((der|die|das), (masculine|feminine|neuter)\)/);
  });

  test('should track progress across interactions', async () => {
    const page = await context.newPage();
    await page.setContent(`
      <html>
        <body>
          <p>The house is beautiful.</p>
        </body>
      </html>
    `);
    
    await page.waitForTimeout(2000);
    
    // Hover over the same word multiple times
    const fluentWord = page.locator('.fluent-word').first();
    
    // First hover
    await fluentWord.hover();
    await page.waitForSelector('.fluent-tooltip.visible');
    await page.mouse.move(0, 0); // Move away
    await page.waitForSelector('.fluent-tooltip.visible', { state: 'hidden' });
    
    // Second hover
    await fluentWord.hover();
    await page.waitForSelector('.fluent-tooltip.visible');
    
    // Check progress bar has some fill
    const progressFill = page.locator('.fluent-tooltip-progress-fill');
    const fillClass = await progressFill.getAttribute('class');
    expect(fillClass).toMatch(/fluent-progress-\d+/);
  });

  test('should not show debug message handlers', async () => {
    // Try to send debug message
    const response = await page.evaluate(async () => {
      try {
        return await chrome.runtime.sendMessage({ type: 'DEBUG_RESET_AUTH' });
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Should get an error or unrecognized message type response
    expect(response.error).toBeTruthy();
  });

  test('should display loading skeletons before content loads', async () => {
    const page = await context.newPage();
    
    // Mock slow network
    await page.route('**/*', route => {
      setTimeout(() => route.continue(), 1000);
    });
    
    await page.setContent(`
      <html>
        <body>
          <p>The house is beautiful.</p>
        </body>
      </html>
    `);
    
    await page.waitForTimeout(1000);
    
    // Quickly hover to catch loading state
    const fluentWord = page.locator('.fluent-word').first();
    await fluentWord.hover();
    
    // Check for skeleton elements
    const skeletons = page.locator('.fluent-skeleton');
    expect(await skeletons.count()).toBeGreaterThan(0);
  });
});