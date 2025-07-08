# Fluent Cloudflare Worker

This worker provides the translation API and site configuration for the Fluent extension.

## Setup

### Prerequisites

1. Cloudflare account with Workers enabled
2. Wrangler CLI installed (`npm install -g wrangler`)
3. API keys configured as secrets

### Required Secrets

Set these secrets in your Cloudflare Worker:

```bash
# Microsoft Translator API key (required)
npx wrangler secret put MICROSOFT_TRANSLATOR_KEY

# Claude API key (optional, for enhanced context)
npx wrangler secret put CLAUDE_API_KEY

# Shared secret for authentication (required)
npx wrangler secret put FLUENT_SHARED_SECRET

# Allowed extension IDs (optional)
npx wrangler secret put ALLOWED_EXTENSION_IDS
```

### KV Namespace

The worker uses a KV namespace for caching translations and storing site configuration.

## Deployment

### Manual Deployment

```bash
# Deploy to production
npx wrangler deploy

# Deploy to staging
npx wrangler deploy --env staging
```

### GitHub Actions

The worker is automatically deployed when changes are pushed to the main branch.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token with Worker deployment permissions

## Site Configuration

Manage blocked and optimized sites:

```bash
# Block a site
node manage-sites.js block example.com

# Add optimized configuration
node manage-sites.js optimize medium.com "article p" 10

# Upload to KV
node manage-sites.js upload

# List current configuration
node manage-sites.js list
```

## Endpoints

- `POST /translate` - Translate words (requires authentication)
- `POST /context` - Get pronunciation and context (requires authentication)
- `GET /site-config` - Get site configuration (public)
- `GET /health` - Health check (requires authentication)

## Development

```bash
# Run locally
npx wrangler dev

# Tail logs
npx wrangler tail
```

## Monitoring

View metrics and logs in the Cloudflare dashboard or use:

```bash
npx wrangler tail --format pretty
```