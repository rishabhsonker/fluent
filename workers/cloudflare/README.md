# Fluent Cloudflare Worker

This Worker serves as a proxy for translation API calls, providing:
- 🔒 API key protection (never exposed to client)
- 💾 Caching with Cloudflare KV
- 🚦 Rate limiting (50 free translations/day per IP)
- ⚡ Global edge deployment

## Setup

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Create KV Namespace**
   ```bash
   wrangler kv:namespace create "TRANSLATION_CACHE"
   wrangler kv:namespace create "TRANSLATION_CACHE" --preview
   ```

4. **Update wrangler.toml**
   - Replace `your-kv-namespace-id` with the ID from step 3
   - Update worker name if desired

5. **Set Environment Variables**
   ```bash
   # For Microsoft Translator API
   wrangler secret put MICROSOFT_TRANSLATOR_KEY
   ```

6. **Deploy**
   ```bash
   # Development
   wrangler dev

   # Production
   wrangler publish
   ```

## API Endpoints

### POST /translate
Translate words to target language.

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
  }
}
```

### GET /health
Health check endpoint.

## Rate Limiting

- **Free tier**: 50 translations per day per IP
- **With API key**: Unlimited
- Cached translations don't count toward limit

## Caching Strategy

- Translations cached for 30 days
- Cache key format: `translation:{lang}:{word}`
- Case-insensitive matching

## Cost Optimization

1. **KV Storage**: First 100,000 reads/day free
2. **Worker Requests**: First 100,000/day free
3. **Microsoft Translator**: $10 per million characters

With aggressive caching, costs should be minimal even at scale.

## Security

- CORS configured for browser extensions
- API keys never exposed to clients
- Rate limiting prevents abuse
- Input validation on all requests

## Local Development

```bash
# Install dependencies
npm install

# Run locally
wrangler dev

# Test endpoint
curl -X POST http://localhost:8787/translate \
  -H "Content-Type: application/json" \
  -d '{"words":["hello","world"],"targetLanguage":"es"}'
```

## Monitoring

View metrics in Cloudflare dashboard:
- Request count
- Cache hit rate
- Error rate
- Response times