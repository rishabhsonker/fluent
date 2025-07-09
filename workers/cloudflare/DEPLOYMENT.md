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

## KV Namespaces

The worker uses KV for caching translations:
- Production: `90eca25c86964d90b4421803ce41094c`
- Preview: `d5bd562d385b4dde947f290af8fe553b`

These are already configured in `wrangler.toml`.