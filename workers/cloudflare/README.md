# Fluent Cloudflare Worker - Secure Translation API

This Worker serves as a secure proxy for translation API calls, providing:
- 🔐 HMAC-based authentication
- 🔒 API key protection (never exposed to client)
- 💾 Multi-tier caching with Cloudflare KV
- 🚦 Server-side rate limiting & cost protection
- ⚡ Global edge deployment
- 🛡️ Input sanitization & security headers

## 🔒 Security Features

### Authentication
- **HMAC Authentication**: All requests must be signed with shared secret
- **Extension ID Verification**: Only whitelisted extensions allowed
- **Timestamp Validation**: Prevents replay attacks (5-minute window)
- **No API Keys in Transit**: Keys stored securely in Worker environment

### Rate Limiting & Protection
- **Per-User Limits**: 50 free translations/day
- **Request Throttling**: Max 10 requests/second per IP
- **Cost Circuit Breakers**: Automatic shutdown at spending limits
- **IP-based Tracking**: Prevents abuse without user tracking

### Data Security
- **Input Sanitization**: All inputs validated and sanitized
- **CORS Protection**: Strict origin validation
- **No Logging of Sensitive Data**: API keys never logged
- **Secure Headers**: CSP, X-Frame-Options, etc.

## Setup

### 1. Install Wrangler CLI
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

### 3. Create KV Namespaces
```bash
# Translation cache
wrangler kv:namespace create "TRANSLATION_CACHE"
wrangler kv:namespace create "TRANSLATION_CACHE" --preview

# Rate limiting
wrangler kv:namespace create "RATE_LIMITS"
wrangler kv:namespace create "RATE_LIMITS" --preview

# User API keys (encrypted)
wrangler kv:namespace create "USER_KEYS"
wrangler kv:namespace create "USER_KEYS" --preview
```

### 4. Configure wrangler.toml
```toml
name = "fluent-translator"
main = "translator.js"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "TRANSLATION_CACHE", id = "your-cache-id", preview_id = "your-preview-id" },
  { binding = "RATE_LIMITS", id = "your-rate-id", preview_id = "your-preview-id" },
  { binding = "USER_KEYS", id = "your-keys-id", preview_id = "your-preview-id" }
]

[env.production.vars]
ENVIRONMENT = "production"
```

### 5. Set Environment Variables
```bash
# CRITICAL: Shared secret from extension
wrangler secret put FLUENT_SHARED_SECRET
# Enter the secret shown in extension settings

# Microsoft Translator API key
wrangler secret put MICROSOFT_TRANSLATOR_KEY
# Enter your Azure translator key

# Allowed extension IDs (comma-separated)
wrangler secret put ALLOWED_EXTENSION_IDS
# Enter your extension ID(s)

# Cost protection limits
wrangler secret put DAILY_COST_LIMIT
# Enter: 10 (dollars)

wrangler secret put MONTHLY_COST_LIMIT
# Enter: 100 (dollars)
```

### 6. Deploy
```bash
# Deploy the secure worker
wrangler deploy

# Or use npm scripts
npm run deploy:worker
```

## API Endpoints

### POST /translate
Translate words with authentication.

**Headers Required:**
```
X-Extension-Id: your-extension-id
X-Timestamp: current-timestamp-ms
X-Auth-Token: hmac-sha256-hash
```

**Request:**
```json
{
  "words": ["house", "water", "time"],
  "targetLanguage": "es",
  "apiKey": "optional-user-api-key"
}
```

**Response:**
```json
{
  "translations": {
    "house": "casa",
    "water": "agua",
    "time": "tiempo"
  },
  "cached": true,
  "remaining": 45
}
```

### GET /health
Health check endpoint (no auth required).

### POST /context
Generate AI context explanations (requires auth).

## Rate Limiting

### Free Tier
- 50 translations per day per user
- 3 context explanations per day
- Cached translations don't count
- Resets at midnight UTC

### BYOK (Bring Your Own Key)
- Unlimited translations
- User pays Microsoft directly
- Still subject to request rate limits

## Caching Strategy

### Multi-Tier Cache
1. **Worker Memory**: 10ms response (LRU, 1000 entries)
2. **Cloudflare KV**: 50ms response (30-day TTL)
3. **Daily Word Pools**: Pre-translated common words
4. **Offline Cache**: Built into extension

### Cache Key Format
```
translation:{lang}:{word_hash}
context:{lang}:{word}:{sentence_hash}
```

## Security Best Practices

### Authentication Flow
```javascript
// Extension generates request
const timestamp = Date.now();
const message = `${extensionId}-${timestamp}-${sharedSecret}`;
const authToken = await sha256(message);

// Worker validates
if (Math.abs(now - timestamp) > 300000) {
  return error(401, 'Token expired');
}
const expected = await sha256(message);
if (authToken !== expected) {
  return error(401, 'Invalid token');
}
```

### Input Validation
- Word length: 2-50 characters
- Allowed languages: es, fr, de
- No HTML/scripts in input
- Rate limit headers validated

## Cost Optimization

### Cloudflare Costs (Free Tier)
- 100,000 requests/day free
- 1GB KV storage free
- 100,000 KV reads/day free
- 1,000 KV writes/day free

### Microsoft Translator
- F0: 2M characters/month free
- S1: $10 per million characters
- Average word: 10 characters
- With 90% cache rate: $0.001/user/month

### Cost Protection
- Daily spending limits enforced
- Automatic circuit breakers
- Cost alerts via Workers Analytics
- Fallback to cached/offline mode

## Monitoring

### Cloudflare Analytics
Track via dashboard:
- Request volume
- Cache hit rate
- Error rate
- Response times
- Cost metrics

### Security Monitoring
```bash
# View real-time logs
wrangler tail

# Check for auth failures
wrangler tail --format json | grep "401"

# Monitor rate limits
wrangler kv:key list --namespace-id=RATE_LIMITS_ID
```

## Local Development

### Setup
```bash
# Clone repository
git clone https://github.com/your-org/fluent
cd workers/cloudflare

# Install dependencies
npm install

# Create .dev.vars file
echo "FLUENT_SHARED_SECRET=test-secret-123" > .dev.vars
echo "MICROSOFT_TRANSLATOR_KEY=your-key" >> .dev.vars
echo "ALLOWED_EXTENSION_IDS=test-extension" >> .dev.vars
```

### Testing
```bash
# Run locally
wrangler dev

# Test with curl
./test-worker.sh

# Run test suite
npm test
```

## Troubleshooting

### Authentication Errors
```bash
# Check Worker logs
wrangler tail

# Common issues:
# 1. Shared secret mismatch
# 2. Clock skew >5 minutes  
# 3. Extension ID not whitelisted
# 4. Incorrect HMAC calculation
```

### Rate Limit Issues
```bash
# Check user's limit
wrangler kv:get "rate:ip:1.2.3.4" --namespace-id=RATE_LIMITS_ID

# Reset user's limit (careful!)
wrangler kv:delete "rate:ip:1.2.3.4" --namespace-id=RATE_LIMITS_ID
```

### Cache Issues
```bash
# Clear specific translation
wrangler kv:delete "translation:es:house" --namespace-id=CACHE_ID

# View cache stats
wrangler kv:key list --namespace-id=CACHE_ID --prefix="translation:"
```

## Security Checklist

Before deploying:
- [ ] Shared secret is strong (32+ characters)
- [ ] Extension IDs whitelisted
- [ ] Rate limits configured
- [ ] Cost limits set
- [ ] CORS origins restricted
- [ ] Error messages don't leak info
- [ ] Logging excludes sensitive data
- [ ] Input validation comprehensive

## Performance Optimization

### Edge Caching
- Cache headers set correctly
- KV operations minimized
- Batch translations when possible

### Response Times
- Memory cache: <10ms
- KV cache hit: <50ms
- Translation API: ~200ms
- Target p95: <100ms

## Future Enhancements

1. **Word Pools**: Pre-translate top 1000 words daily
2. **Compression**: gzip responses >1KB
3. **Webhooks**: Alert on anomalies
4. **A/B Testing**: Gradual feature rollout
5. **GraphQL**: Batch API for efficiency