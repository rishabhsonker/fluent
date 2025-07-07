# Cloudflare Worker Deployment Guide - Secure Version

This guide will help you deploy the secure Fluent translation worker with authentication and rate limiting.

## 🔒 Security Overview

The new worker includes:
- HMAC authentication between extension and worker
- Server-side rate limiting
- Cost protection circuit breakers
- Input sanitization
- Encrypted storage for user API keys

## Prerequisites

1. **Cloudflare Account** (free): https://dash.cloudflare.com/sign-up
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **Extension Installed**: You need the shared secret from extension settings
4. **Microsoft Azure Account** (optional, for real translations)

## Step-by-Step Deployment

### 1. Get Your Shared Secret

**CRITICAL FIRST STEP**:
1. Install the Fluent extension in Chrome
2. Click the extension icon → Settings
3. Find "Authentication Secret" section
4. **Copy and save this secret** - you'll need it for step 5

### 2. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 3. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate.

### 4. Create KV Namespaces

Run these commands to create the required storage:

```bash
# Translation cache
wrangler kv:namespace create "TRANSLATION_CACHE"
wrangler kv:namespace create "TRANSLATION_CACHE" --preview

# Rate limiting tracking
wrangler kv:namespace create "RATE_LIMITS"
wrangler kv:namespace create "RATE_LIMITS" --preview

# Encrypted user API keys
wrangler kv:namespace create "USER_KEYS"
wrangler kv:namespace create "USER_KEYS" --preview
```

**Important**: Save the namespace IDs from each command. You'll see output like:
```
✨ Success!
Add the following to your configuration file:
{ binding = "TRANSLATION_CACHE", id = "abcd1234..." }
```

### 5. Configure wrangler.toml

Create/edit `workers/cloudflare/wrangler.toml`:

```toml
name = "fluent-translator-secure"
main = "translator-secure.js"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "TRANSLATION_CACHE", id = "YOUR_CACHE_ID", preview_id = "YOUR_PREVIEW_CACHE_ID" },
  { binding = "RATE_LIMITS", id = "YOUR_RATE_ID", preview_id = "YOUR_PREVIEW_RATE_ID" },
  { binding = "USER_KEYS", id = "YOUR_KEYS_ID", preview_id = "YOUR_PREVIEW_KEYS_ID" }
]

[env.production]
name = "fluent-translator-secure"
```

Replace the IDs with the ones from step 4.

### 6. Set Security Environment Variables

**CRITICAL**: Set these secrets in order:

```bash
# 1. Shared secret from extension (REQUIRED)
wrangler secret put FLUENT_SHARED_SECRET
# Paste the secret from extension settings EXACTLY

# 2. Your extension ID (REQUIRED)
wrangler secret put ALLOWED_EXTENSION_IDS
# Find this in chrome://extensions → Details → ID
# Format: single ID or comma-separated list

# 3. Microsoft Translator key (OPTIONAL - uses mock data without it)
wrangler secret put MICROSOFT_TRANSLATOR_KEY
# Paste your Azure translator key if you have one

# 4. Cost protection limits (RECOMMENDED)
wrangler secret put DAILY_COST_LIMIT
# Enter: 10

wrangler secret put MONTHLY_COST_LIMIT
# Enter: 100
```

### 7. Deploy the Secure Worker

```bash
cd workers/cloudflare

# Deploy the secure version (NOT the old translator.js)
wrangler deploy translator-secure.js
```

You'll see output like:
```
✨ Success!
Published fluent-translator-secure
  https://fluent-translator-secure.YOUR-SUBDOMAIN.workers.dev
```

**Save this URL** - you'll need it for the extension.

### 8. Update Extension Configuration

Edit your `.env.production` file:

```bash
VITE_TRANSLATOR_API=https://fluent-translator-secure.YOUR-SUBDOMAIN.workers.dev
```

Then rebuild the extension:

```bash
npm run build
```

Reload the extension in Chrome:
1. Go to `chrome://extensions/`
2. Click refresh icon on Fluent

### 9. Test the Deployment

#### Test Authentication
```bash
# This should FAIL (no auth)
curl https://your-worker.workers.dev/translate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"words":["hello"],"targetLanguage":"es"}'

# Response: {"error":"Missing authentication headers"}
```

#### Test Health Check
```bash
# This should SUCCEED (no auth needed)
curl https://your-worker.workers.dev/health

# Response: {"status":"healthy","version":"1.0.0"}
```

#### Test with Extension
1. Visit any website
2. Click "Enable on this site" in extension
3. Check that blue words appear
4. Open DevTools → Network tab
5. Look for translate requests - should have auth headers

### 10. Verify Security

Check the Worker logs to ensure authentication is working:

```bash
wrangler tail

# You should see logs like:
# ✅ Auth verified for extension: your-extension-id
# ✅ Translated 5 words (3 from cache)
```

## Getting a Microsoft Translator API Key

The worker will use mock translations without an API key. To get real translations:

### 1. Create Azure Account
- Go to https://portal.azure.com
- Sign up for free account (includes $200 credit)
- No credit card required for free tier

### 2. Create Translator Resource
1. Click "Create a resource"
2. Search for "Translator"
3. Click "Create"
4. Fill in:
   - **Subscription**: Your subscription
   - **Resource group**: Create new
   - **Region**: Any region
   - **Name**: `fluent-translator`
   - **Pricing tier**: F0 (Free - 2M chars/month)

### 3. Get Your API Key
1. Go to your Translator resource
2. Click "Keys and Endpoint"
3. Copy KEY 1
4. Add to Worker: `wrangler secret put MICROSOFT_TRANSLATOR_KEY`

## Monitoring & Security

### View Real-time Logs
```bash
wrangler tail

# Filter for errors
wrangler tail --format json | grep -E '"level":"error"'

# Check auth failures
wrangler tail --format json | grep "401"
```

### Monitor Usage
1. **Cloudflare Dashboard** → Workers & Pages → Your Worker
2. Check:
   - Request volume
   - Error rate
   - Response times
   - KV operations

### Security Alerts
Set up alerts for:
- High error rates (possible attack)
- Unusual request patterns
- Cost threshold warnings

## Cost Management

### Free Tier Limits
- **Cloudflare Workers**: 100k requests/day
- **KV Storage**: 1GB, 100k reads/day
- **Microsoft Translator**: 2M chars/month (F0 tier)

### Cost Estimates
| Users | Requests/Day | KV Reads | Monthly Cost |
|-------|--------------|----------|--------------|
| 100   | 5,000        | 10,000   | $0           |
| 1,000 | 50,000       | 100,000  | $0-5         |
| 10k   | 500,000      | 1M       | $20-50       |

### Cost Protection
The worker automatically:
- Limits free users to 50 words/day
- Tracks spending against limits
- Shuts down if limits exceeded
- Falls back to cached translations

## Troubleshooting

### Authentication Errors

#### "Missing authentication headers"
- Extension not sending auth headers
- Check extension has shared secret configured

#### "Invalid authentication token"
1. Verify shared secret matches exactly
2. Check for trailing spaces/newlines
3. Ensure extension and worker use same secret

#### "Authentication token expired"
- Clock skew between client and server
- Token has 5-minute validity window

#### "Extension ID not allowed"
1. Get extension ID from chrome://extensions
2. Add to worker: `wrangler secret put ALLOWED_EXTENSION_IDS`

### Rate Limiting Issues

#### "Rate limit exceeded"
- User hit 50 word daily limit
- They need to wait or use BYOK

#### Check user's usage
```bash
# Replace with actual IP
wrangler kv:get "rate:ip:1.2.3.4" --namespace-id=YOUR_RATE_ID
```

### Translation Errors

#### All translations failing
1. Check Microsoft API key is valid
2. Verify key added to worker secrets
3. Check Azure subscription active

#### Partial translations
- Some words may not have translations
- Check worker logs for specific errors

### Performance Issues

#### Slow responses
1. Check cache hit rate in logs
2. Verify KV namespaces configured
3. Consider increasing cache TTL

#### High error rate
1. Check worker logs for patterns
2. Verify rate limits not too strict
3. Check for malicious traffic

## Security Best Practices

### Before Production
- [ ] Shared secret is 32+ characters
- [ ] Extension ID whitelisted
- [ ] Rate limits tested
- [ ] Cost limits configured
- [ ] Monitoring enabled
- [ ] Backup API keys secured

### Regular Maintenance
- Rotate shared secret monthly
- Review access logs weekly
- Update dependencies regularly
- Test disaster recovery

### Incident Response
1. **Suspicious Activity**: Check logs, tighten rate limits
2. **Cost Spike**: Verify limits working, check for abuse
3. **Auth Failures**: Verify secrets, check for attacks
4. **Performance Issues**: Check cache, scale if needed

## Advanced Configuration

### Custom Rate Limits
Edit `translator-secure.js`:
```javascript
const RATE_LIMITS = {
  freeWordsPerDay: 50,  // Adjust as needed
  requestsPerMinute: 10,
  contextPerDay: 3
};
```

### IP Allowlisting
Add trusted IPs that bypass rate limits:
```bash
wrangler secret put TRUSTED_IPS
# Enter: 1.2.3.4,5.6.7.8
```

### A/B Testing
Deploy multiple versions:
```bash
wrangler deploy --env staging
wrangler deploy --env production
```

## Next Steps

1. **Test Everything**: Use TESTING_GUIDE.md
2. **Monitor Closely**: First 48 hours critical
3. **Gather Feedback**: User issues = improvement opportunities
4. **Plan Scaling**: Monitor growth, adjust limits
5. **Document Issues**: Keep FAQ updated

Remember: Security first, user experience second, features third.