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
  await context.close();
});

test.describe('Fluent Extension', () => {
  test.beforeEach(async () => {
    if (process.env.CI) {
      test.skip();
    }
  });
  test('should load popup', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Check popup loads
    await expect(popup.locator('.fluent-title')).toHaveText('Fluent');
    await expect(popup.locator('.fluent-subtitle')).toHaveText('Learn languages while browsing');
  });

  test('should display language options', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Wait for settings to load
    await popup.waitForSelector('.fluent-language-grid');
    
    // Check all languages are present
    await expect(popup.locator('.fluent-lang-button')).toHaveCount(3);
    await expect(popup.getByText('Spanish')).toBeVisible();
    await expect(popup.getByText('French')).toBeVisible();
    await expect(popup.getByText('German')).toBeVisible();
  });

  test('should switch languages', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Click French
    await popup.getByText('French').click();
    
    // Check French is active
    await expect(popup.locator('.fluent-lang-button-active')).toContainText('French');
  });

  test('should show site control', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Check site control section
    await expect(popup.locator('.fluent-site-control')).toBeVisible();
    await expect(popup.locator('.fluent-site-info')).toContainText('Status');
  });

  test('should navigate to blocked sites tab', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    
    // Click blocked sites tab
    await popup.getByText('Blocked Sites').click();
    
    // Check tab is active
    await expect(popup.locator('.fluent-tab-active')).toHaveText('Blocked Sites');
  });
});

test.describe('Content Script', () => {
  test('should inject content script on text-heavy pages', async () => {
    // Create a test page with content
    const page = await context.newPage();
    await page.setContent(`
      <html>
        <body>
          <h1>Test Page</h1>
          <p>This is a paragraph with some text content that should be processed by the extension. 
          The house is beautiful. Water is essential for life. People work together.</p>
        </body>
      </html>
    `);
    
    // Wait for content script to process
    await page.waitForTimeout(1000);
    
    // Check if words were replaced
    const replacedWords = await page.locator('.fluent-word').count();
    expect(replacedWords).toBeGreaterThan(0);
  });
});