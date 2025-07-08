# Fluent Cloudflare Worker

This directory contains the Cloudflare Worker that serves as a secure proxy between the Chrome extension and translation APIs.

## Features

- **Authentication**: HMAC-SHA256 signed requests
- **Rate Limiting**: Protects against abuse
- **Caching**: Reduces API costs with KV storage
- **Cost Protection**: Automatic circuit breakers
- **Request Coalescing**: Prevents duplicate API calls

## Deployment

See the main [README.md](../../README.md#deployment) for detailed deployment instructions.

## Quick Deploy

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy --env production

# Set secrets
wrangler secret put FLUENT_SHARED_SECRET
wrangler secret put MICROSOFT_TRANSLATOR_KEY
wrangler secret put CLAUDE_API_KEY  # Optional
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FLUENT_SHARED_SECRET` | Yes | Shared secret for HMAC authentication |
| `MICROSOFT_TRANSLATOR_KEY` | Yes | Azure Translator API key |
| `CLAUDE_API_KEY` | No | Anthropic API key for AI explanations |
| `AZURE_REGION` | No | Azure region (default: 'global') |
| `ALLOWED_EXTENSION_IDS` | No | Comma-separated extension ID allowlist |

## Monitoring

```bash
# View real-time logs
wrangler tail

# Check KV storage
wrangler kv:key list --namespace-id=TRANSLATION_CACHE
```

## API Endpoints

- `POST /translate` - Translate words (requires authentication)
- `GET /health` - Health check (requires authentication)