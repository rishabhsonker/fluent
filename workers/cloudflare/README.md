# Fluent Cloudflare Worker

This worker provides the translation API and site configuration for the Fluent extension.

## Setup

### Prerequisites

1. Cloudflare account with Workers enabled
2. Wrangler CLI installed (`npm install -g wrangler`)
3. API keys configured as secrets
4. D1 databases created

### Required Secrets

Set these secrets in your Cloudflare Worker:

```bash
# Microsoft Translator API key (required)
npx wrangler secret put MICROSOFT_TRANSLATOR_KEY

# Claude API key (optional, for enhanced context)
npx wrangler secret put CLAUDE_API_KEY

# Allowed extension IDs (optional, for security)
npx wrangler secret put ALLOWED_EXTENSION_IDS
```

### D1 Database

The worker uses D1 databases for:
- Translation caching
- User management and authentication
- Usage tracking and analytics
- Word progress tracking

Database IDs are configured in `wrangler.toml`:
- Production: `translator` 
- Development: `translator-dev`

## Deployment

### Manual Deployment

```bash
# Deploy to production
npx wrangler deploy

# Deploy to development
npx wrangler deploy --env development
```

### GitHub Actions

The worker is automatically deployed when changes are pushed to the main branch.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token with Worker deployment permissions

## Site Configuration

Manage blocked and optimized sites:

```bash
# Block a site
node sites.js block example.com

# Add optimized configuration
node sites.js optimize medium.com "article p" 10

# List current configuration
node sites.js list

# Note: Upload/download to D1 not yet implemented
```

## Endpoints

- `POST /translate` - Translate words with context (requires authentication)
- `GET /site-config` - Get site configuration (public)
- `GET /health` - Health check (requires authentication)

## Development

```bash
# Run locally
npx wrangler dev

# Tail logs
npx wrangler tail

# Run database migrations
npx wrangler d1 execute translator-dev --file=migrations/0001_initial_schema.sql
npx wrangler d1 execute translator-dev --file=migrations/0002_add_analytics_table.sql
```

## Monitoring

View metrics and logs in the Cloudflare dashboard or use:

```bash
npx wrangler tail --format pretty
```

## Database Schema

The D1 database includes these tables:
- `translations` - Cached translations with context
- `users` - User accounts and plans
- `installations` - Extension installations
- `user_preferences` - User settings
- `user_tracking` - Daily usage tracking
- `user_stats` - Lifetime statistics
- `word_progress` - Learning progress per word
- `billing_events` - Stripe billing events
- `referrals` - Referral tracking
- `analytics_events` - General analytics

See `migrations/` for the complete schema.