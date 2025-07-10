# 🌍 Fluent - Learn Languages While Browsing

<div align="center">

[![Version](https://img.shields.io/github/v/release/rishabhsonker/fluent?label=version)](https://github.com/rishabhsonker/fluent/releases)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-green.svg)](#)
[![Tests](https://github.com/rishabhsonker/fluent/actions/workflows/test.yml/badge.svg)](https://github.com/rishabhsonker/fluent/actions/workflows/test.yml)
[![Worker Deploy](https://github.com/rishabhsonker/fluent/actions/workflows/cloudflare-worker.yml/badge.svg)](https://github.com/rishabhsonker/fluent/actions/workflows/cloudflare-worker.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange.svg)](LICENSE)

[![Languages](https://img.shields.io/badge/🇪🇸_Spanish-red.svg)](#)
[![Languages](https://img.shields.io/badge/🇫🇷_French-blue.svg)](#)
[![Languages](https://img.shields.io/badge/🇩🇪_German-yellow.svg)](#)

</div>

> **Learn languages naturally** - Fluent replaces 5-6 English words per page with translations, helping you learn Spanish, French, or German through immersion while browsing normally.

## ✨ Features

### 🔤 Smart Translation System
- **Contextual word replacement** - 5-6 words per page intelligently selected
- **Multi-language support** - Spanish 🇪🇸, French 🇫🇷, German 🇩🇪
- **Grammar-aware** - Shows gender for nouns, conjugations for verbs

### 💡 Interactive Learning
- **Hover tooltips** with:
  - 🔊 Pronunciation guide
  - 📖 AI-powered contextual explanations
  - 📊 Personal progress tracking
  - 🔄 Dynamic examples that rotate for variety
- **Spaced repetition** - Optimized learning intervals
- **Keyboard navigation** - Tab through translated words

### ⚡ Performance & Privacy
- **Lightning fast** - <2s response time with parallel API calls
- **Smart caching** - Reduces API calls over time
- **100% Private** - All data stored locally, zero tracking
- **Automatic blacklist** - Excludes productivity sites (Google Docs, Office 365, etc.)

## 📦 Installation

### Chrome Web Store
🚧 **Coming Soon** - Currently in review

### Build from Source
```bash
# Clone and build
git clone https://github.com/rishabhsonker/fluent.git
cd fluent
npm install
npm run build

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `dist` folder
```

## 🚀 Getting Started

### Quick Start
1. **Click** the Fluent icon in your toolbar
2. **Select** your target language (Spanish 🇪🇸, French 🇫🇷, or German 🇩🇪)
3. **Browse** any website - translations appear automatically
4. **Hover** over blue underlined words to learn

### 🎮 Controls

| Control | Action |
|---------|--------|
| **Extension Icon** | Open settings & language selector |
| **Page Widget** | Quick pause/resume (bottom-right) |
| **Hover** | View translation details |
| **Tab Key** | Navigate between translated words |

### 📊 Usage Limits

| Feature | Free Tier | With API Key |
|---------|-----------|--------------|
| **Translations** | 100/hour, 1000/day | Unlimited |
| **Context Hovering** | 50/minute | Unlimited |
| **Devices** | Per-device limits | Shared quota |

## ⚙️ Configuration

### 🔑 API Keys (Optional)
Add your own API keys for unlimited usage:
- **Microsoft Translator** - For translations
- **Claude API** - For contextual explanations

### ☁️ Cloudflare Worker Deployment
```bash
# Deploy the worker
cd workers/cloudflare
wrangler deploy --env production

# Set API secrets
wrangler secret put MICROSOFT_TRANSLATOR_KEY
wrangler secret put CLAUDE_API_KEY
```

## 👩‍💻 Development

### Commands
```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
npm run test         # Run all tests
npm run test:unit    # Unit tests only (52 tests)
npm run test:e2e     # E2E tests (requires built extension)
npm run package      # Create distribution ZIP
```

### 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| **Frontend** | TypeScript, React, Vite |
| **API Proxy** | Cloudflare Workers + KV Cache |
| **Translation** | Microsoft Translator API |
| **AI Context** | Claude 3 Haiku |
| **Authentication** | HMAC + Installation Tokens |
| **Storage** | Chrome Storage API (local) |

## 🔒 Security

- **Installation-based authentication** - Unique tokens per device
- **HMAC request signing** - Prevents tampering
- **Rate limiting** - Per-device quotas
- **Local storage only** - No cloud sync

See [SECURITY.md](SECURITY.md) for full details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

Apache License 2.0 - see [LICENSE](LICENSE) for details.