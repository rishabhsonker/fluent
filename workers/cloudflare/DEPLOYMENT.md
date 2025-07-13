# Cloudflare Worker Deployment Guide

## Setup Instructions

### 1. Create Cloudflare API Token

To deploy the Fluent translator worker to Cloudflare, you need to create an API token:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Custom token" template
4. Configure the token with these permissions:
   - **Account** → `Cloudflare Workers Scripts:Edit`
   - **Account** → `Account Settings:Read` (to verify the token)
   - **User** → `User Details:Read` (optional, for token validation)

5. Copy the generated token

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repository settings
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click "New repository secret"
4. Name: `CLOUDFLARE_API_TOKEN`
5. Value: Paste your Cloudflare API token
6. Click "Add secret"

### 3. Verify Wrangler Configuration

The `wrangler.toml` file is already configured with:
- Production environment settings
- KV namespace bindings for translation cache
- Rate limiting configurations
- CPU limits and observability settings

### 4. Deploy Manually (Local Development)

```bash
# Navigate to the worker directory
cd workers/cloudflare

# Run the deployment script
./deploy.sh

# Or deploy directly with wrangler
npx wrangler deploy --env production
```

### 5. GitHub Actions Deployment

The workflow automatically deploys on:
- Push to `main` branch
- When files in `workers/cloudflare/` are modified

## Troubleshooting

### "CLOUDFLARE_API_TOKEN not set" Error

This means the GitHub secret is missing. Follow step 2 above.

### "Multiple environments defined" Warning

The workflow now specifies `--env production` to avoid this warning.

### Build Failures in Cloudflare Dashboard

Even if GitHub Actions fails, Cloudflare might still attempt builds if you have the GitHub integration enabled. Make sure:
1. The API token has correct permissions
2. The worker code is valid JavaScript
3. All environment variables are set

### Rate Limiting Errors

The worker uses Cloudflare's Rate Limiting API. These bindings are configured in `wrangler.toml` and should work automatically.

## Environment Variables

Required in Cloudflare (set via dashboard or wrangler secret):
- `MICROSOFT_TRANSLATOR_KEY` - Microsoft Translator API key
- `FLUENT_SHARED_SECRET` - Shared secret for authentication
- `CLAUDE_API_KEY` - Anthropic Claude API key for context generation
- `AZURE_REGION` - Azure region for translator (default: eastus)

## D1 Databases (DEPLOYED)

The worker uses D1 for all data storage:
- **Production**: `translator` (ID: f1a6d16b-cc72-48a0-bc33-8ec71f75b75c)
  - Status: ✅ DEPLOYED with 12 tables total
  - Schema: Applied July 13, 2025
  - Verified: July 13, 2025
- **Development**: `translator-dev` (ID: 53323f1e-ce8a-4ba3-8732-5b62b088cdf2)
  - Status: ✅ DEPLOYED with 12 tables total
  - Schema: Applied July 13, 2025
  - Verified: July 13, 2025

These are already configured in `wrangler.toml`.

### Database Verification Results

Both databases contain the following tables (verified via REST API):

**Schema Tables (9)**:
- `billing_events` - Stripe webhook history and payment records
- `installations` - Browser extension instances
- `referrals` - Referral program tracking
- `translations` - Cached translations with pronunciation
- `user_preferences` - Language settings and blocklist
- `user_stats` - Lifetime learning statistics
- `user_tracking` - Daily usage counters for rate limiting
- `users` - User accounts with plan info
- `word_progress` - Per-word learning progress

**System Tables (3)**:
- `_cf_KV` - Cloudflare KV compatibility table
- `d1_migrations` - D1 migration tracking
- `sqlite_sequence` - SQLite autoincrement tracking

All tables are currently empty (0 rows) - ready for production data.

### Database Management

#### Using Wrangler (Recommended - No Auth Issues)
```bash
# List all tables
wrangler d1 execute translator-dev --command="SELECT name FROM sqlite_master WHERE type='table';" --remote

# Check specific table
wrangler d1 execute translator-dev --command="SELECT * FROM users LIMIT 10;" --remote

# Count records
wrangler d1 execute translator --command="SELECT COUNT(*) FROM translations;" --remote
```

#### Using REST API with Wrangler Environment Variables
```bash
# Wrangler automatically sets these environment variables when logged in:
# - CLOUDFLARE_API_TOKEN
# - CLOUDFLARE_ACCOUNT_ID

# Query using curl with Wrangler's auth
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/translator-dev/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT name FROM sqlite_master WHERE type=\"table\";"}'

# Or use jq for cleaner output
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/translator/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as count FROM users;"}' | jq '.result[0].results'
```

#### Applying Migrations
```bash
# Apply to development first
wrangler d1 execute translator-dev --file=migrations/[migration-file].sql --remote

# Then to production
wrangler d1 execute translator --file=migrations/[migration-file].sql --remote
```

#### Useful Database Queries
```bash
# Show all tables with row counts
wrangler d1 execute translator --command="
  SELECT name, 
    (SELECT COUNT(*) FROM sqlite_master sm WHERE sm.name = m.name) as row_count 
  FROM sqlite_master m 
  WHERE type='table' 
  ORDER BY name;" --remote

# Check database size
wrangler d1 execute translator --command="SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();" --remote

# View table schema
wrangler d1 execute translator --command="PRAGMA table_info(users);" --remote
```