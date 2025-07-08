#!/usr/bin/env node

/**
 * Setup script for Fluent extension authentication
 * This script helps you configure the shared secret between the extension and Cloudflare Worker
 */

import crypto from 'crypto';

console.log('=== Fluent Extension Authentication Setup ===\n');

// Generate a secure random secret
const secret = crypto.randomBytes(32).toString('base64');

console.log('Generated Shared Secret:');
console.log('------------------------');
console.log(secret);
console.log('------------------------\n');

console.log('Setup Instructions:');
console.log('1. Copy the shared secret above\n');

console.log('2. Configure your Cloudflare Worker:');
console.log('   - Go to https://dash.cloudflare.com');
console.log('   - Select your "fluent-translator" worker');
console.log('   - Go to Settings → Variables');
console.log('   - Add an environment variable:');
console.log('     Name: FLUENT_SHARED_SECRET');
console.log('     Value: [paste the shared secret]\n');

console.log('3. Configure your Chrome Extension:');
console.log('   - Open Chrome DevTools (F12)');
console.log('   - Go to the Console');
console.log('   - Run this command:');
console.log(`   chrome.storage.local.set({ authSecret: '${secret}' })\n`);

console.log('4. Reload your extension:');
console.log('   - Go to chrome://extensions');
console.log('   - Click the refresh button on your Fluent extension\n');

console.log('5. (Optional) Add your extension ID to the allowlist:');
console.log('   - In Cloudflare Worker settings, add another environment variable:');
console.log('     Name: ALLOWED_EXTENSION_IDS');
console.log('     Value: jbcippanlmmlboelafnjocpfjblbfclg');
console.log('     (You can add multiple IDs separated by commas)\n');

console.log('After completing these steps, your extension should be able to authenticate with the worker.');