#!/usr/bin/env node

/**
 * Build configuration script
 * Generates runtime config from environment variables
 */

const fs = require('fs');
const path = require('path');

// Get URLs from environment or use defaults
const config = {
  PRODUCTION_API: process.env.PRODUCTION_API || 'https://translator.hq.workers.dev',
  DEVELOPMENT_API: process.env.DEVELOPMENT_API || 'https://translator-dev.hq.workers.dev'
};

// Generate TypeScript config file
const configContent = `// Auto-generated file - DO NOT EDIT
// Generated at build time from environment variables

export const BUILD_CONFIG = {
  PRODUCTION_API: '${config.PRODUCTION_API}',
  DEVELOPMENT_API: '${config.DEVELOPMENT_API}',
  BUILD_TIME: '${new Date().toISOString()}'
} as const;
`;

// Write to src/generated/
const outputDir = path.join(__dirname, '../src/generated');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(
  path.join(outputDir, 'build-config.ts'),
  configContent
);

console.log('Build configuration generated successfully');

// Log if using defaults
if (!process.env.PRODUCTION_API || !process.env.DEVELOPMENT_API) {
  console.log('Note: Using default API URLs. Set PRODUCTION_API and DEVELOPMENT_API environment variables to customize.');
}