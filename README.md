# Fluent - Learn Languages While Browsing

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/fluent/releases)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-green.svg)](#)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-A%2B-brightgreen.svg)](SECURITY.md)

A Chrome extension that helps you learn Spanish, French, or German naturally through contextual word replacements while browsing the web. Fluent intelligently replaces 5-6 English words with their translations on any webpage, enabling immersive language learning without disrupting your browsing experience.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Development](#development)
- [Security](#security)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Features

### Core Learning System
- **Smart Word Selection** - Intelligently selects 5-6 words per page based on frequency, difficulty, and learning progress
- **Spaced Repetition** - Uses proven memory techniques to optimize word retention
- **Contextual Learning** - Words are replaced in their natural context for better comprehension
- **Multi-Language Support** - Currently supports Spanish, French, and German with more planned

### User Experience
- **Instant Processing** - Page processing in under 50ms with no impact on browsing performance
- **Beautiful Tooltips** - Hover over replaced words to see translations, pronunciation, and context
- **AI-Powered Explanations** - Optional Claude integration explains why specific translations were chosen
- **Offline Support** - Common words available offline for uninterrupted learning

### Privacy & Control
- **Privacy-First Design** - All data stored locally, no tracking or analytics
- **Per-Site Permissions** - Grant access only to sites you choose
- **Flexible Pausing** - Pause learning globally or per-site for 6 hours
- **Smart Blacklisting** - Automatically disabled on banking and sensitive sites

### Cost Management
- **Free Tier** - 50 translations per day at no cost
- **BYOK Support** - Bring your own Microsoft Translator API key for unlimited translations
- **Transparent Pricing** - Clear visibility into API usage and costs

## Installation

### Option 1: Chrome Web Store (Recommended)
*Coming soon - the extension is currently under review*

### Option 2: Install from Source

#### Prerequisites
- Node.js 18+ and npm
- Chrome browser
- Git

#### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fluent.git
   cd fluent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from the project

5. **Verify installation**
   - You should see the Fluent extension with a flag icon
   - Click the icon to access settings

## Usage

### Getting Started

1. **Choose Your Language**
   - Click the Fluent icon in Chrome toolbar
   - Select Spanish 🇪🇸, French 🇫🇷, or German 🇩🇪

2. **Enable on a Website**
   - Navigate to any text-heavy website
   - Click the Fluent icon
   - Click "Enable on this site"
   - Grant permission when prompted

3. **Start Learning**
   - Blue underlined words are translations
   - Hover to see original word and pronunciation
   - Click 🔊 to hear pronunciation
   - Click 💡 for AI-powered context explanation

### Controls

#### Tooltip Interactions
- **Hover** - View translation and original word
- **Tab Navigation** - Use keyboard to navigate between words
- **Click Actions**:
  - 🔊 Play pronunciation
  - 💡 Get context explanation (3 free/day)
  - ✓ Mark as learned

#### Page Control Widget (Bottom Right)
- **Flag Icon** - Shows current language, click to switch
- **Pause Menu**:
  - "Pause everywhere" - 6-hour global pause
  - "Pause this site" - 6-hour site-specific pause
  - "Disable for this site" - Permanent site disable

#### Extension Popup
- **Site Toggle** - Enable/disable for current site
- **Language Selector** - Switch target language
- **Progress Tracker** - View daily learning stats
- **Settings** - Configure API keys and preferences

### Daily Limits

| Feature | Free Tier | With API Key |
|---------|-----------|--------------|
| Word Translations | 50/day | Unlimited |
| AI Explanations | 3/day | Unlimited* |
| Languages | All 3 | All 3 |
| Sites | Unlimited | Unlimited |

*With Claude API key

## Architecture

### System Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Chrome Extension│     │ Cloudflare Worker│     │ Translation APIs│
│   (Client)      │────▶│    (Proxy)       │────▶│   (Services)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Chrome Storage  │     │  Cloudflare KV   │     │ Microsoft Azure │
│  (Local Cache)  │     │ (Global Cache)   │     │ Claude AI (Opt) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Extension | TypeScript, React 18 | Core functionality and UI |
| Build Tool | Vite | Fast development and optimized builds |
| API Proxy | Cloudflare Workers | Secure API management and caching |
| Translation | Microsoft Translator | Professional translations |
| AI Context | Claude 3 Haiku | Contextual explanations |
| Storage | Chrome Storage API | Local data persistence |
| Caching | Cloudflare KV | Global translation cache |

### Project Structure

```
fluent/
├── src/
│   ├── content/          # Content scripts for word replacement
│   │   ├── index.ts      # Main content script entry
│   │   ├── replacer.ts   # Word replacement engine
│   │   ├── tooltip.ts    # Tooltip UI component
│   │   └── PageControl.ts # In-page control widget
│   ├── popup/            # Extension popup UI
│   │   ├── App.tsx       # Main React app
│   │   └── components/   # React components
│   ├── background/       # Service worker
│   │   └── service-worker.ts # API calls and storage
│   └── lib/              # Shared utilities
│       ├── translator.ts # Translation service
│       ├── storage.ts    # Storage abstraction
│       └── security/     # Security modules
├── workers/
│   └── cloudflare/       # Cloudflare Worker code
│       └── translator.js # API proxy and caching
├── tests/                # Test suites
└── dist/                 # Built extension (generated)
```

## Deployment

### Prerequisites

1. **Microsoft Azure Account**
   - Sign up at [portal.azure.com](https://portal.azure.com)
   - Create a Translator resource
   - Note your API key and region

2. **Cloudflare Account**
   - Sign up at [cloudflare.com](https://cloudflare.com) (free tier works)
   - Note your account ID

3. **Chrome Web Store Developer Account** (for publishing)
   - One-time $5 fee
   - Register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)

### Step 1: Deploy Cloudflare Worker

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **Configure Worker**
   ```bash
   cd workers/cloudflare
   cp wrangler.toml.example wrangler.toml
   # Edit wrangler.toml with your account details
   ```

3. **Deploy Worker**
   ```bash
   # Login to Cloudflare
   wrangler login
   
   # Deploy to production
   wrangler deploy --env production
   ```

4. **Set Environment Secrets**
   ```bash
   # Required: Shared secret for authentication
   wrangler secret put FLUENT_SHARED_SECRET
   # Generate a secure random string (32+ characters)
   
   # Required: Microsoft Translator API key
   wrangler secret put MICROSOFT_TRANSLATOR_KEY
   # Enter your Azure Translator key
   
   # Optional: Claude API key for AI explanations
   wrangler secret put CLAUDE_API_KEY
   # Enter your Anthropic API key
   
   # Optional: Azure region (defaults to 'global')
   wrangler secret put AZURE_REGION
   # Enter your Azure region (e.g., 'eastus')
   ```

### Step 2: Configure Extension

1. **Update API endpoint**
   ```typescript
   // src/lib/constants.ts
   export const API_CONFIG = {
     TRANSLATOR_API: 'https://fluent-translator.YOUR-SUBDOMAIN.workers.dev',
   };
   ```

2. **Set shared secret**
   - Open extension popup
   - Go to Settings
   - Copy the authentication secret
   - Use this as FLUENT_SHARED_SECRET in Worker

3. **Rebuild extension**
   ```bash
   npm run build
   npm run package
   ```

### Step 3: Test Deployment

1. **Reload extension** in Chrome
2. **Test on a website** - translations should appear
3. **Check Worker logs**:
   ```bash
   wrangler tail
   ```

### Step 4: Publish to Chrome Web Store

1. **Prepare assets**:
   - Screenshots (1280x800 or 640x400)
   - Promotional images
   - Privacy policy URL

2. **Upload to store**:
   - Go to [Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
   - Upload `fluent.zip`
   - Fill in listing details
   - Submit for review

## Development

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/yourusername/fluent.git
cd fluent

# Install dependencies
npm install

# Start development mode with watch
npm run dev

# In another terminal, start local Worker
cd workers/cloudflare
wrangler dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development with hot reload |
| `npm run build` | Build production extension |
| `npm run test` | Run test suite |
| `npm run lint` | Run TypeScript type checking |
| `npm run package` | Create distribution ZIP |
| `npm run pre-publish` | Run pre-publication checks |

### Code Quality Standards

- **TypeScript** - Strict mode enabled, no `any` types
- **React** - Functional components with hooks
- **Security** - All inputs validated and sanitized
- **Performance** - Under 50ms page processing
- **Memory** - Maximum 30MB usage enforced

### Performance Monitoring

The extension tracks key metrics:
- Page processing time
- Memory usage
- Cache hit rates
- API response times

Access metrics via:
```javascript
// In console while on any page
chrome.runtime.sendMessage(
  EXTENSION_ID, 
  { type: 'GET_PERFORMANCE_STATS' },
  console.log
);
```

## Security

Fluent implements defense-in-depth security. See [SECURITY.md](SECURITY.md) for full details.

### Key Security Features

- **Authentication** - HMAC-SHA256 signed requests
- **Encryption** - AES-256-GCM for stored secrets
- **Rate Limiting** - Server-enforced quotas
- **Input Validation** - All inputs sanitized
- **CSP** - Strict Content Security Policy
- **Anti-Fingerprinting** - Randomized behaviors

### Reporting Vulnerabilities

Please report security issues privately to: security@fluent-extension.com

Do NOT open public GitHub issues for security vulnerabilities.

## API Documentation

### Content Script API

```typescript
// Get current settings
const settings = await chrome.runtime.sendMessage({ 
  type: 'GET_SETTINGS' 
});

// Update language
await chrome.runtime.sendMessage({ 
  type: 'UPDATE_SETTINGS',
  settings: { targetLanguage: 'fr' }
});

// Get translations
const result = await chrome.runtime.sendMessage({
  type: 'GET_TRANSLATIONS',
  words: ['house', 'water'],
  language: 'es'
});
```

### Worker API

```bash
# Translate words
curl -X POST https://your-worker.workers.dev/translate \
  -H "Content-Type: application/json" \
  -H "X-Extension-Id: YOUR_EXTENSION_ID" \
  -H "X-Timestamp: $(date +%s)000" \
  -H "X-Auth-Token: YOUR_HMAC_TOKEN" \
  -d '{
    "words": ["hello", "world"],
    "targetLanguage": "es"
  }'

# Response
{
  "translations": {
    "hello": "hola",
    "world": "mundo"
  },
  "metadata": {
    "cacheHits": 1,
    "cacheMisses": 1
  }
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run E2E tests only
npm run test:e2e

# Run with UI
npm run test:ui

# View test report
npm run test:report
```

### Test Coverage

- **Unit Tests** - Core utilities and functions
- **Integration Tests** - Extension components
- **E2E Tests** - Full extension flow
- **Security Tests** - Authentication and encryption

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md).

### Development Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Write tests for new features
- Update documentation

## Troubleshooting

### Common Issues

#### No translations appearing
1. Check if site is blacklisted
2. Verify daily limit not exceeded
3. Ensure sufficient text on page
4. Check console for errors

#### Authentication errors
1. Verify shared secret matches
2. Check Worker logs: `wrangler tail`
3. Ensure system time is synchronized

#### Performance issues
1. Check memory usage in Chrome Task Manager
2. Verify cache is working (90%+ hit rate expected)
3. Try disabling other extensions

### Debug Mode

Enable debug logging:
```javascript
// In extension console
chrome.storage.local.set({ debugMode: true });
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Microsoft Translator for translation services
- Anthropic Claude for AI explanations
- Cloudflare for edge computing platform
- The open-source community for invaluable tools and libraries

---

Built with ❤️ for language learners worldwide