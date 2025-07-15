# Fluent - Natural Language Learning Chrome Extension

Learn languages while browsing the web. Fluent seamlessly replaces 5-6 English words per page with translations, helping you learn Spanish, French, or German through natural immersion.

## Quick Start

```bash
# 1. Get the extension running
npm install
npm run dev
# Load dist/ folder in chrome://extensions (Developer Mode ON)

# 2. Get the worker running (new terminal)
cd workers/cloudflare
cp .dev.vars.example .dev.vars  # Add your API keys
./local.sh

# 3. Test it - visit any website, should see 5-6 translated words
```

### Common Tasks

| Task | Command/Location |
|------|-----------------|
| **Debug missing translations** | Check console, verify worker is running |
| **Test API connection** | `cd workers/cloudflare && ./claude.sh` |
| **Add blacklisted site** | Edit `src/shared/constants/sites.ts` |
| **Change word selection** | Edit `src/features/translation/selector.ts` |
| **View database** | `wrangler d1 execute fluent-db --command "SELECT * FROM users"` |
| **Deploy to production** | `npm run build && cd workers/cloudflare && ./deploy.sh` |

## Architecture

```
Chrome Extension (TypeScript + React)
├── Content Script      → Injects into pages, selects words (<50ms limit)
├── Service Worker      → Handles API calls, caching, state
└── Popup UI           → Settings interface (React)
         ↓
    HTTPS + HMAC
         ↓
Cloudflare Worker (Edge Proxy)
├── Authentication     → Installation-based (no user accounts)
├── Rate Limiting      → Per installation ID
├── KV Cache          → 90%+ hit rate
└── D1 Database       → User preferences, progress tracking
         ↓
External APIs
├── MS Translator     → Word translations (batch up to 25)
└── Claude AI        → Context explanations (500 char limit)
```

**Why this architecture?** Direct API calls from extension = exposed keys. Worker proxy = secure.

## Project Structure

```
fluent/
├── src/
│   ├── content/                    # DOM manipulation (<50ms budget)
│   ├── service-worker/             # API coordination
│   ├── features/translation/       # Core logic
│   │   ├── selector.ts            # Word selection algorithm
│   │   ├── replacer.ts            # DOM updates
│   │   └── translator.ts          # API client
│   └── shared/constants/sites.ts  # Blacklisted sites
├── workers/cloudflare/
│   ├── handler.js                 # Request router
│   ├── translator.js              # MS Translator integration
│   ├── context.js                 # Claude integration  
│   └── database.js                # D1 queries
└── manifest.json                  # Extension config
```

## Development

### Prerequisites
- Node.js 18+
- Cloudflare account
- API keys: Microsoft Translator, Claude AI

### Environment Setup

```bash
# Extension (.env)
VITE_FLUENT_DEBUG=true
VITE_FLUENT_VERSION=${npm_package_version}

# Worker (.dev.vars) - REQUIRED
MICROSOFT_TRANSLATOR_KEY=your_key    # Azure Portal
CLAUDE_API_KEY=your_key             # Anthropic Console  
FLUENT_HMAC_SECRET=generate_this    # openssl rand -hex 32
ENVIRONMENT=development
```

### Scripts

| Command | Description |
|---------|-------------|
| **Extension** ||
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript validation |
| `npm run package` | Create distribution ZIP |
| **Worker** ||
| `./local.sh` | Local dev server |
| `./deploy.sh` | Deploy to Cloudflare |
| `./worker.sh migrate` | Run D1 migrations |

## Troubleshooting

### Debug Commands

```javascript
// Content script console
fluent.debug = true                          // Verbose logging
fluent.stats()                              // Translation stats
fluent.clear()                              // Clear translations

// Service worker console  
chrome.storage.local.get(null, console.log)  // Dump storage
```

### Common Issues

| Problem | Solution |
|---------|----------|
| No translations | Check worker logs: `wrangler tail` |
| Slow translations | Check cache hit rate in worker logs |
| High memory | Clear storage: `chrome.storage.local.clear()` |
| HMAC errors | Clock drift or wrong keys in .dev.vars |

### Log Locations
- **Extension**: Chrome DevTools Console
- **Service Worker**: chrome://extensions → Inspect
- **Cloudflare Worker**: `wrangler tail` or dashboard

## Known Limitations

- **Performance**: 50ms page processing limit (Chrome kills slow extensions)
- **Memory**: 30MB limit (Chrome restriction)
- **Blacklisted**: Google Docs, Office 365, banking sites, code editors
- **API Limits**: MS Translator (25 words/batch), Claude (500 chars)

## Technical Details

<details>
<summary>Implementation Notes</summary>

### Word Selection
- Targets common nouns, verbs, adjectives
- Avoids technical terms, proper nouns, UI elements
- 5-6 words optimal for retention without overwhelm

### Performance Optimizations
- RequestAnimationFrame for DOM batching
- Chunked text node processing
- Lazy-loaded UI components
- LRU cache eviction

### Security
- Content Security Policy
- Service worker proxy for all external requests
- HMAC request signing
- Input sanitization

### Database Schema
- `users`: Installation ID, preferences
- `translations`: Word pairs with context
- `user_progress`: Learning statistics
- `cache_entries`: API response cache
- `blocked_sites`: User exclusions

</details>

## Deployment

### Production Build
```bash
npm run build
cd workers/cloudflare && ./deploy.sh
```

### Chrome Web Store
Status: In review (manual installation only for now)

### Manual Installation
1. `npm run build`
2. Open `chrome://extensions`
3. Enable Developer Mode
4. Load unpacked → select `dist/`

## License

Copyright © 2025 Fluent Language Learning Extension. All Rights Reserved.

This is proprietary software. Unauthorized copying, modification, or distribution is prohibited.