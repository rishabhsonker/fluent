#!/usr/bin/env node

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


/**
 * Script to manage site configurations for Fluent extension
 * Usage: node sites.js [command] [options]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { safe } from './utils.js';

const CONFIG_FILE = './config.json';

// Load existing configuration
function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('⚠️  Error loading config file:', error.message);
  }
  
  return {
    blockedSites: [],
    optimizedSites: [],
    globalSkipSelectors: [],
    version: '1.0.0',
    lastUpdated: new Date().toISOString()
  };
}

// Save configuration
function saveConfig(config) {
  try {
    config.lastUpdated = new Date().toISOString();
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('✅ Configuration saved to config.json');
  } catch (error) {
    console.error('❌ Failed to save configuration:', error.message);
    process.exit(1);
  }
}

// Upload configuration to D1 database
async function uploadConfig() {
  const config = loadConfig();
  
  console.log('📤 Uploading configuration to D1 database...');
  
  await safe(async () => {
    // For now, we'll need to implement this through the Worker API
    // or use direct D1 commands when available
    console.log('⚠️  D1 upload not yet implemented');
    console.log('Configuration would include:');
    console.log(`   - Blocked sites: ${config.blockedSites.length}`);
    console.log(`   - Optimized sites: ${config.optimizedSites.length}`);
    console.log('\nTo implement: Create a system_config table in D1 for storing site configurations');
  }, 'Upload configuration to D1');
}

// Add blocked site
function addBlockedSite(domain) {
  const config = loadConfig();
  
  if (!config.blockedSites.includes(domain)) {
    config.blockedSites.push(domain);
    saveConfig(config);
    console.log(`✅ Added ${domain} to blocked sites`);
  } else {
    console.log(`⚠️  ${domain} is already blocked`);
  }
}

// Remove blocked site
function removeBlockedSite(domain) {
  const config = loadConfig();
  const index = config.blockedSites.indexOf(domain);
  
  if (index > -1) {
    config.blockedSites.splice(index, 1);
    saveConfig(config);
    console.log(`✅ Removed ${domain} from blocked sites`);
  } else {
    console.log(`⚠️  ${domain} was not in blocked sites`);
  }
}

// Add optimized site
function addOptimizedSite(domain, selector, wordsPerPage = 8) {
  const config = loadConfig();
  
  const existing = config.optimizedSites.find(site => site.domain === domain);
  if (existing) {
    // Update existing
    existing.selector = selector;
    existing.wordsPerPage = wordsPerPage;
    console.log(`✅ Updated optimized config for ${domain}`);
  } else {
    // Add new
    config.optimizedSites.push({
      domain,
      selector,
      wordsPerPage
    });
    console.log(`✅ Added optimized config for ${domain}`);
  }
  
  saveConfig(config);
}

// List configuration
function listConfig() {
  const config = loadConfig();
  
  console.log('\n📋 Current Configuration:');
  console.log('========================\n');
  
  console.log('🚫 Blocked Sites:');
  if (config.blockedSites.length === 0) {
    console.log('   (none)');
  } else {
    config.blockedSites.forEach(site => console.log(`   - ${site}`));
  }
  
  console.log('\n✨ Optimized Sites:');
  if (config.optimizedSites.length === 0) {
    console.log('   (none)');
  } else {
    config.optimizedSites.forEach(site => {
      console.log(`   - ${site.domain}`);
      console.log(`     Selector: ${site.selector}`);
      console.log(`     Words/page: ${site.wordsPerPage}`);
      if (site.skipSelectors) {
        console.log(`     Skip: ${site.skipSelectors.join(', ')}`);
      }
    });
  }
  
  console.log(`\n📅 Last updated: ${config.lastUpdated}`);
}

// Main CLI
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'block':
      if (args.length === 0) {
        console.error('Usage: node sites.js block <domain>');
        process.exit(1);
      }
      addBlockedSite(args[0]);
      break;
      
    case 'unblock':
      if (args.length === 0) {
        console.error('Usage: node sites.js unblock <domain>');
        process.exit(1);
      }
      removeBlockedSite(args[0]);
      break;
      
    case 'optimize':
      if (args.length < 2) {
        console.error('Usage: node sites.js optimize <domain> <selector> [words-per-page]');
        console.error('Example: node sites.js optimize example.com "article p" 10');
        process.exit(1);
      }
      addOptimizedSite(args[0], args[1], parseInt(args[2] || '8'));
      break;
      
    case 'list':
      listConfig();
      break;
      
    case 'upload':
      await uploadConfig();
      break;
      
    case 'download':
      console.log('📥 Downloading configuration from D1 database...');
      await safe(async () => {
        console.log('⚠️  D1 download not yet implemented');
        console.log('To implement: Query system_config table from D1 database');
      }, 'Download configuration from D1');
      break;
      
    default:
      console.log('Fluent Site Configuration Manager');
      console.log('=================================\n');
      console.log('Commands:');
      console.log('  block <domain>         - Block translations on a domain');
      console.log('  unblock <domain>       - Remove domain from blocklist');
      console.log('  optimize <domain> <selector> [words] - Add optimized config for a site');
      console.log('  list                   - Show current configuration');
      console.log('  upload                 - Upload config to D1 database (not yet implemented)');
      console.log('  download               - Download config from D1 database (not yet implemented)');
      console.log('\nExamples:');
      console.log('  node sites.js block facebook.com');
      console.log('  node sites.js optimize nytimes.com ".css-at9mc1 p" 10');
      console.log('  node sites.js upload');
  }
}

// Run main function
main().catch(error => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});