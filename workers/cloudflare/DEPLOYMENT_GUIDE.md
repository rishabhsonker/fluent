# Cloudflare Worker Deployment Guide

This guide will help you deploy the Fluent translation worker to Cloudflare.

## Prerequisites

1. **Cloudflare Account** (free): https://dash.cloudflare.com/sign-up
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **Microsoft Azure Account** (optional for now)

## Step-by-Step Deployment

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate.

### 3. Create KV Namespace

```bash
# Create production KV namespace
wrangler kv:namespace create "TRANSLATION_CACHE"

# Create preview KV namespace
wrangler kv:namespace create "TRANSLATION_CACHE" --preview
```

**Important**: Copy the namespace IDs from the output. You'll see something like:
```
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "TRANSLATION_CACHE", id = "abcd1234..." }
```

### 4. Update wrangler.toml

Edit `workers/cloudflare/wrangler.toml` and replace the placeholder IDs:

```toml
name = "fluent-translator"
main = "translator.js"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "TRANSLATION_CACHE", id = "YOUR_KV_ID_HERE", preview_id = "YOUR_PREVIEW_KV_ID_HERE" }
]
```

### 5. Deploy the Worker

From the `workers/cloudflare` directory:

```bash
cd workers/cloudflare
wrangler deploy
```

You'll get output like:
```
✨ Success!
Published fluent-translator (1.0.0)
  https://fluent-translator.YOUR-SUBDOMAIN.workers.dev
```

### 6. Update Extension Configuration

Edit `src/lib/constants.js` in the extension and update the API URL:

```javascript
export const API_CONFIG = {
  TRANSLATOR_API: 'https://fluent-translator.YOUR-SUBDOMAIN.workers.dev',
  // ... rest of config
};
```

### 7. (Optional) Add Microsoft Translator API Key

#### Option A: Environment Variable (Recommended)
```bash
wrangler secret put MICROSOFT_TRANSLATOR_KEY
# Enter your API key when prompted
```

#### Option B: Dashboard
1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker "fluent-translator"
3. Go to Settings → Variables
4. Add environment variable: `MICROSOFT_TRANSLATOR_KEY`

### 8. Test the Worker

```bash
# Health check
curl https://fluent-translator.YOUR-SUBDOMAIN.workers.dev/health

# Test translation (will use mock data without API key)
curl -X POST https://fluent-translator.YOUR-SUBDOMAIN.workers.dev/translate \
  -H "Content-Type: application/json" \
  -d '{"words":["house","water","time"],"targetLanguage":"es"}'
```

## Getting a Microsoft Translator API Key

1. **Create Azure Account**: https://portal.azure.com
2. **Create Translator Resource**:
   - Click "Create a resource"
   - Search for "Translator"
   - Click "Create"
   - Fill in:
     - Resource group: Create new or select existing
     - Region: Any region
     - Name: `fluent-translator` (or any unique name)
     - Pricing tier: F0 (Free - 2M chars/month)
3. **Get API Key**:
   - Go to your Translator resource
   - Click "Keys and Endpoint"
   - Copy KEY 1

## Monitoring & Analytics

View your worker analytics in the Cloudflare Dashboard:
- Request count
- Error rate
- Response times
- KV storage usage

## Cost Breakdown

### Cloudflare (Free Tier)
- 100,000 requests/day free
- 1GB KV storage free
- 100,000 KV reads/day free

### Microsoft Translator
- F0 tier: 2 million characters/month free
- S1 tier: $10 per million characters

### Estimated Costs
- **Free tier**: Supports ~1,000 daily active users
- **At scale (10k users)**: ~$10-50/month

## Troubleshooting

### CORS Errors
The worker already includes CORS headers. If you still get errors:
1. Check the browser console for the exact error
2. Verify the API URL in constants.js matches your worker URL

### Rate Limiting
Free users are limited to 50 words/day. Users can:
1. Provide their own API key (BYOK)
2. Wait for the daily reset
3. Upgrade to premium (when available)

### KV Cache Issues
To clear the cache:
```bash
# List all keys
wrangler kv:key list --namespace-id=YOUR_KV_ID

# Delete specific key
wrangler kv:key delete "translation:es:house" --namespace-id=YOUR_KV_ID
```

## Security Notes

1. **Never commit API keys** to the repository
2. **Use environment variables** for sensitive data
3. **Enable rate limiting** to prevent abuse
4. **Monitor usage** regularly

## Next Steps

1. Test with real translations
2. Monitor performance and costs
3. Consider implementing word pools for common words
4. Add more language support