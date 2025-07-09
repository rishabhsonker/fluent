# Fluent - Chrome Extension

[![Version](https://img.shields.io/github/v/release/rishabhsonker/fluent?label=version)](https://github.com/rishabhsonker/fluent/releases)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-green.svg)](#)
[![Tests](https://github.com/rishabhsonker/fluent/actions/workflows/test.yml/badge.svg)](https://github.com/rishabhsonker/fluent/actions/workflows/test.yml)
[![Worker Deploy](https://github.com/rishabhsonker/fluent/actions/workflows/cloudflare-worker.yml/badge.svg)](https://github.com/rishabhsonker/fluent/actions/workflows/cloudflare-worker.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-features-brightgreen.svg)](SECURITY.md)
[![Languages](https://img.shields.io/badge/languages-ES%20%7C%20FR%20%7C%20DE-red.svg)](#features)
[![Chrome](https://img.shields.io/badge/Chrome-88%2B-4285F4.svg)](https://www.google.com/chrome/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://www.typescriptlang.org/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-FF6611.svg)](https://developer.chrome.com/docs/extensions/mv3/)

A Chrome extension that replaces 5-6 English words per page with Spanish, French, or German translations to help you learn languages while browsing.

## Features

- **Word Replacement**: 5-6 words per page replaced with translations
- **Languages**: Spanish 🇪🇸, French 🇫🇷, German 🇩🇪
- **Interactive Tooltips**: Hover to see original word, pronunciation, and context
- **Per-Site Control**: Enable/disable for specific websites
- **Privacy**: All data stored locally

## Installation

### From Chrome Web Store
Coming soon

### From Source
```bash
git clone https://github.com/rishabhsonker/fluent.git
cd fluent
npm install
npm run build
```

Load the `dist` folder as an unpacked extension in Chrome.

## Usage

1. Click the extension icon
2. Select your target language
3. Enable on any website
4. Blue underlined words are translations - hover for details

### Daily Limits
- **Translation requests**: 1000/day (100/hour)
- **AI explanations**: 100/day (10/hour)
- **With your API key**: Unlimited

### Controls
- **Extension popup**: Language selection and settings
- **Page widget**: Quick pause/disable (bottom-right corner)
- **Keyboard**: Tab to navigate between words

## Configuration

### API Keys (Optional)
For unlimited translations, add your own Microsoft Translator API key in settings.

### Cloudflare Worker
Deploy the worker from `workers/cloudflare/`:
```bash
cd workers/cloudflare
wrangler deploy --env production
```

Set required secrets:
```bash
wrangler secret put FLUENT_SHARED_SECRET
wrangler secret put MICROSOFT_TRANSLATOR_KEY
```

## Development

```bash
npm run dev          # Development mode
npm run build        # Production build
npm run test         # Run tests
npm run package      # Create distribution ZIP
```

## Testing

```bash
npm test             # All tests
npm run test:unit    # Unit tests only
npm run test:e2e     # End-to-end tests
```

## Architecture

- **Extension**: TypeScript, React, Vite
- **API Proxy**: Cloudflare Workers
- **Translation**: Microsoft Translator API
- **Storage**: Chrome Storage API

## Security

See [SECURITY.md](SECURITY.md) for security features.

## Issues

Report bugs via GitHub Issues.

## License

Apache License 2.0