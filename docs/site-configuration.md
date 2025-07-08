# Site Configuration for Fluent Extension

The Fluent extension now supports dynamic site configuration that can be updated without redeploying the extension. This allows you to:

1. **Block sites** where translations shouldn't appear (email, banking, etc.)
2. **Optimize sites** with custom selectors and word counts for better translation placement

## How It Works

Site configurations are stored in Cloudflare KV and fetched by the extension. The extension caches the configuration for 1 hour to minimize API calls.

## Managing Site Configuration

### Using the CLI Tool

We've provided a simple CLI tool to manage site configurations:

```bash
cd workers/cloudflare
node manage-sites.js [command] [options]
```

### Commands

#### Block a Site
```bash
# Block translations on a domain
node manage-sites.js block linkedin.com

# Multiple domains
node manage-sites.js block tinder.com
node manage-sites.js block bumble.com
```

#### Unblock a Site
```bash
# Remove a site from the blocklist
node manage-sites.js unblock linkedin.com
```

#### Add Optimized Configuration
```bash
# Add optimized config for a site
# Format: optimize <domain> <css-selector> [words-per-page]
node manage-sites.js optimize nytimes.com ".css-at9mc1 p" 10
node manage-sites.js optimize reddit.com "[data-testid='comment'] p" 6
```

#### List Current Configuration
```bash
# Show all blocked and optimized sites
node manage-sites.js list
```

#### Upload to Cloudflare
```bash
# Upload your local configuration to Cloudflare KV
node manage-sites.js upload
```

#### Download from Cloudflare
```bash
# Download the current configuration from Cloudflare KV
node manage-sites.js download
```

## Default Blocked Sites

The following sites are blocked by default:

### Email Services
- gmail.com, mail.google.com
- superhuman.com
- outlook.com, outlook.live.com
- mail.yahoo.com
- hey.com
- protonmail.com, mail.proton.me

### Banking & Financial
- chase.com, wellsfargo.com, bankofamerica.com
- paypal.com, venmo.com, cashapp.com
- coinbase.com, binance.com
- stripe.com, square.com

### Healthcare
- mychart.com
- kaiserpermanente.org
- anthem.com, cigna.com, uhc.com

### Government
- irs.gov, dmv.gov
- uscis.gov, state.gov

### Developer Tools
- github.com, gitlab.com, bitbucket.org
- localhost, 127.0.0.1

### Work/Productivity
- slack.com, discord.com
- teams.microsoft.com, zoom.us
- notion.so, monday.com, asana.com

### Social/Dating
- facebook.com, instagram.com
- twitter.com, x.com, linkedin.com
- tinder.com, bumble.com, hinge.co

## Default Optimized Sites

The following sites have optimized configurations:

### News Sites
- **BBC**: 10 words/page
- **CNN**: 8 words/page
- **NYTimes**: 10 words/page
- **The Guardian**: 10 words/page
- **Reuters**: 8 words/page

### Educational
- **Wikipedia**: 12 words/page
- **Medium**: 10 words/page
- **Quora**: 8 words/page

### Forums
- **Reddit**: 6 words/page (with mutation observer)
- **Hacker News**: 6 words/page
- **Stack Overflow**: 6 words/page

### Others
- **Amazon**: 4 words/page (product descriptions)
- **Recipe sites**: 6 words/page
- **Travel sites**: 6 words/page

## Manual Configuration

You can also edit `site-config.json` directly:

```json
{
  "blockedSites": [
    "example.com",
    "another-site.com"
  ],
  "optimizedSites": [
    {
      "domain": "example.com",
      "selector": "article p, .content p",
      "wordsPerPage": 10,
      "skipSelectors": ["pre", "code"],
      "useMutationObserver": true
    }
  ]
}
```

Then upload it:
```bash
node manage-sites.js upload
```

## Examples

### Block a new email service
```bash
node manage-sites.js block fastmail.com
node manage-sites.js upload
```

### Add a news site with specific selectors
```bash
node manage-sites.js optimize wsj.com ".article-content p" 8
node manage-sites.js upload
```

### Check current configuration
```bash
node manage-sites.js list
```

## Tips

1. **Test selectors** using browser DevTools before adding them
2. **Start with fewer words** (4-6) and increase if needed
3. **Use mutation observer** for dynamic sites (SPAs)
4. **Skip code blocks** to avoid translating programming terms
5. **Update regularly** as sites change their HTML structure

## Troubleshooting

If sites aren't being blocked or optimized:

1. Check the configuration was uploaded:
   ```bash
   node manage-sites.js download
   node manage-sites.js list
   ```

2. Clear the extension's cache by reloading it

3. Check the console for any errors

4. Verify the domain matches exactly (without www. prefix unless specified)