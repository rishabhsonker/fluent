#!/usr/bin/env node

/**
 * Script to manage site configurations for Fluent extension
 * Usage: node manage-sites.js [command] [options]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const CONFIG_FILE = './site-config.json';

// Load existing configuration
function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
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
  config.lastUpdated = new Date().toISOString();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('✅ Configuration saved to site-config.json');
}

// Upload configuration to Cloudflare KV
function uploadConfig() {
  const config = loadConfig();
  
  console.log('📤 Uploading configuration to Cloudflare KV...');
  
  try {
    // Upload to KV - use proper wrangler v3 syntax
    execSync(`npx wrangler kv key put --binding=TRANSLATION_CACHE "site-config" '${JSON.stringify(config)}' --preview false`, {
      stdio: 'inherit'
    });
    
    console.log('✅ Configuration uploaded successfully!');
    console.log('📊 Stats:');
    console.log(`   - Blocked sites: ${config.blockedSites.length}`);
    console.log(`   - Optimized sites: ${config.optimizedSites.length}`);
  } catch (error) {
    console.error('❌ Failed to upload configuration:', error.message);
  }
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
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'block':
    if (args.length === 0) {
      console.error('Usage: node manage-sites.js block <domain>');
      process.exit(1);
    }
    addBlockedSite(args[0]);
    break;
    
  case 'unblock':
    if (args.length === 0) {
      console.error('Usage: node manage-sites.js unblock <domain>');
      process.exit(1);
    }
    removeBlockedSite(args[0]);
    break;
    
  case 'optimize':
    if (args.length < 2) {
      console.error('Usage: node manage-sites.js optimize <domain> <selector> [words-per-page]');
      console.error('Example: node manage-sites.js optimize example.com "article p" 10');
      process.exit(1);
    }
    addOptimizedSite(args[0], args[1], parseInt(args[2] || '8'));
    break;
    
  case 'list':
    listConfig();
    break;
    
  case 'upload':
    uploadConfig();
    break;
    
  case 'download':
    console.log('📥 Downloading configuration from Cloudflare KV...');
    try {
      const result = execSync('npx wrangler kv key get --binding=TRANSLATION_CACHE "site-config"', {
        encoding: 'utf-8'
      });
      const config = JSON.parse(result);
      saveConfig(config);
      console.log('✅ Configuration downloaded successfully!');
    } catch (error) {
      console.error('❌ Failed to download configuration:', error.message);
    }
    break;
    
  default:
    console.log('Fluent Site Configuration Manager');
    console.log('=================================\n');
    console.log('Commands:');
    console.log('  block <domain>         - Block translations on a domain');
    console.log('  unblock <domain>       - Remove domain from blocklist');
    console.log('  optimize <domain> <selector> [words] - Add optimized config for a site');
    console.log('  list                   - Show current configuration');
    console.log('  upload                 - Upload config to Cloudflare KV');
    console.log('  download               - Download config from Cloudflare KV');
    console.log('\nExamples:');
    console.log('  node manage-sites.js block facebook.com');
    console.log('  node manage-sites.js optimize nytimes.com ".css-at9mc1 p" 10');
    console.log('  node manage-sites.js upload');
}