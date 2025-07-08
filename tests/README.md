# Fluent Extension Testing

This directory contains automated tests for the Fluent Chrome Extension using Playwright.

## Structure

- `e2e/` - End-to-end tests that test the extension in a real browser
- `unit/` - Unit tests for individual modules and functions
- `fixtures/` - Test data and HTML pages for testing

## Running Tests

### Prerequisites

```bash
# Build the extension first
npm run build

# Install Playwright browsers (first time only)
npx playwright install chromium
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Run with UI mode (interactive)
npm run test:ui

# Debug mode
npm run test:debug
```

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:report
```

## Writing Tests

### Unit Tests

Unit tests should test individual functions and modules in isolation:

```typescript
import { test, expect } from '@playwright/test';
import { myFunction } from '../../src/lib/myModule';

test.describe('MyModule', () => {
  test('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### E2E Tests

E2E tests test the extension as a whole in a real browser:

```typescript
test('should replace words on page', async ({ page }) => {
  await page.goto('http://localhost:3000/test-page.html');
  
  // Wait for extension to process
  await page.waitForSelector('.fluent-word');
  
  // Check replacements
  const replacedWords = await page.locator('.fluent-word').count();
  expect(replacedWords).toBeGreaterThan(0);
});
```

## Testing Chrome Extension Features

The tests automatically load the built extension from the `dist/` directory. Make sure to build the extension before running tests.

### Testing Popup

```typescript
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
```

### Testing Content Scripts

Content scripts are tested by loading test pages and verifying the DOM modifications.

## CI/CD

Tests run automatically on GitHub Actions for:
- Every push to main/develop branches
- Every pull request

Test results and artifacts are uploaded for review.