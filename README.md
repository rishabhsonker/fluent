# Fluent - Language Learning Chrome Extension

Learn Spanish, French, or German naturally while browsing the web. Fluent intelligently replaces 5-6 English words with their translations on any webpage, helping you learn through context and repetition.

![Fluent Demo](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Chrome Extension](https://img.shields.io/badge/platform-Chrome-green.svg)
![Languages](https://img.shields.io/badge/languages-ES%20%7C%20FR%20%7C%20DE-orange.svg)

## ✨ Features

### Core Learning Experience
- **🔄 Smart Word Replacement** - 5-6 carefully selected words per page for optimal learning
- **💡 AI Context Helper** - Understand why specific translations were chosen with Claude-powered explanations
- **🔊 Native Pronunciation** - Hear how words sound with one click
- **📊 Spaced Repetition** - Words appear based on your learning progress
- **🎯 Adaptive Difficulty** - Automatically adjusts to your language level

### User Experience
- **⚡ Lightning Fast** - <50ms processing, works instantly on any page
- **🌐 Works Everywhere** - Learn on any text-heavy website
- **🎨 Beautiful UI** - Clean tooltips and intuitive controls
- **⏸️ Smart Pausing** - Pause on specific sites or everywhere for 6 hours
- **🚫 Site Blacklist** - Automatically disabled on banking and sensitive sites

### Privacy & Security
- **🔒 Privacy First** - No tracking, all data stored locally
- **🔐 Encrypted Storage** - API keys protected with AES-256-GCM encryption
- **⚖️ Minimal Permissions** - Only requests access to sites you approve
- **💰 Free Tier** - 50 words/day at no cost
- **🔑 BYOK Option** - Use your own API key for unlimited translations

## 📦 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store page](#) (Coming soon)
2. Click "Add to Chrome"
3. Start browsing and learning!

### From Source (Developers)
```bash
# Clone repository
git clone https://github.com/yourusername/fluent.git
cd fluent

# Install dependencies
npm install

# Build extension
npm run build

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `dist` folder
```

## 🚀 Deployment Guide

### Prerequisites
1. Microsoft Azure account with Translator API key
2. Cloudflare account (free tier is fine)
3. (Optional) Claude API key for AI explanations
4. Chrome Web Store Developer account ($5 one-time fee)

### Step 1: Microsoft Translator API Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Create a new Translator resource:
   - Click "Create a resource"
   - Search for "Translator"
   - Select pricing tier:
     - **F0 (Free)**: 2M characters/month
     - **S1**: $10 per 1M characters
3. Once created, go to "Keys and Endpoint"
4. Copy:
   - **Key 1** (your API key)
   - **Location/Region** (e.g., "global", "eastus", etc.)

### Step 2: Deploy Cloudflare Worker

#### Install Wrangler CLI
```bash
npm install -g wrangler
```

#### Login to Cloudflare
```bash
wrangler login
```

#### Deploy the Worker
```bash
cd workers
# Add your API keys as secrets
wrangler secret put TRANSLATOR_API_KEY
# Paste your Microsoft Translator API key when prompted

# Optional: Add Claude API key for AI context explanations
wrangler secret put CLAUDE_API_KEY
# Paste your Claude API key when prompted (or press Enter to skip)

# Deploy to production
wrangler deploy --env production
```

Your worker will be available at: `https://fluent-translator.YOUR-SUBDOMAIN.workers.dev`

### Step 3: Update Extension Configuration

1. Update `src/lib/constants.ts`:
```typescript
export const API_CONFIG: ApiConfig = {
  TRANSLATOR_API: 'https://fluent-translator.YOUR-SUBDOMAIN.workers.dev',
} as const;
```

2. Rebuild the extension:
```bash
npm run build
npm run package
```

### Step 4: Test Locally

1. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

2. Test on a webpage:
   - Visit any text-heavy site (e.g., Wikipedia)
   - You should see 5-6 words replaced
   - Hover over blue words to see translations

### Step 5: Publish to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
2. Click "New Item"
3. Upload `fluent.zip`
4. Fill in the listing details
5. Submit for review

## 🚀 Getting Started

### First Time Setup
1. **Choose Your Language**: Click the Fluent icon and select Spanish 🇪🇸, French 🇫🇷, or German 🇩🇪
2. **Grant Permission**: Click "Enable on this site" when visiting a website
3. **Start Learning**: Blue underlined words will appear automatically
4. **Hover to Learn**: Hover over replaced words to see translations
5. **Click for More**: Use 🔊 for pronunciation and 💡 for AI-powered explanations

### Daily Usage Limits
- **Free Users**: 50 word translations per day
- **BYOK Users**: Unlimited translations with your own API key
- **AI Explanations**: 3 free per day (unlimited with Claude API key)

## 🎮 How to Use

### Basic Controls
- **Hover** over blue words to see translations
- **Click** 🔊 to hear pronunciation
- **Click** 💡 to understand why this translation was chosen (AI-powered)
- **Tab** through words for keyboard navigation

### Page Control Widget (Bottom Right)
- **Flag Button**: Shows current language, click to open menu
- **Language Switch**: Instantly change between Spanish, French, or German
- **Pause Options**:
  - "Pause everywhere" - Disable on all sites for 6 hours
  - "Pause this site" - Disable for 6 hours on current site
  - "Disable for this site" - Permanently disable on current domain

### Extension Popup
- **Site Toggle**: Enable/disable for current site
- **Language Selection**: Choose your target language
- **Progress**: Track daily words learned
- **Settings**: Configure API key and preferences

## 🏗️ Architecture

### Extension Components
```
fluent/
├── src/
│   ├── content/          # Word replacement engine
│   ├── popup/           # React settings UI
│   ├── background/      # Service worker
│   └── lib/            # Shared utilities
├── workers/
│   └── translator-worker.js  # Cloudflare Worker
└── dist/               # Built extension
```

### Key Technologies
- **TypeScript**: Full type safety across the codebase
- **React 18**: Modern UI with hooks
- **Vite**: Fast build tool
- **Cloudflare Workers**: Serverless API proxy
- **Microsoft Translator**: Professional translations
- **Claude AI**: Intelligent context explanations

### Performance Guarantees
- ✅ <50ms page processing time
- ✅ <30MB memory usage
- ✅ 90%+ cache hit rate
- ✅ No impact on page scroll performance

## 💰 Cost Analysis

### Microsoft Translator
- **Free tier (F0)**: 2M characters/month
- **Typical usage**: ~500-1000 chars/day
- **Monthly cost**: $0 (free tier) or ~$0.15-0.30 (paid)

### Claude API (Optional)
- **Model**: Claude 3 Haiku
- **Cost**: $0.25 per 1M tokens
- **Typical usage**: ~1000 tokens/day
- **Monthly cost**: ~$0.01

### Cloudflare Workers
- **Free tier**: 100k requests/day
- **Typical usage**: Well within free tier
- **Monthly cost**: $0

## 🛠️ Development

### Setup
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run security checks
npm run pre-publish

# Create distribution package
npm run package
```

### Project Structure
- `src/content/` - Content script that replaces words
- `src/popup/` - React app for extension popup
- `src/background/` - Service worker for API calls
- `src/lib/` - Shared utilities and constants
- `workers/` - Cloudflare Worker code

## 🔒 Security

### Security Features
- **Encrypted Storage**: API keys encrypted with AES-256-GCM
- **Secure Communication**: All API calls use HTTPS
- **Input Sanitization**: All user inputs sanitized
- **Rate Limiting**: Server-side protection
- **Minimal Permissions**: Only activeTab and storage

### Troubleshooting

#### Extension Not Working
1. Check if the site is blacklisted (banking sites)
2. Ensure you haven't hit the daily limit
3. Try refreshing the page
4. Check DevTools console for errors

#### Worker Issues
- Check Cloudflare dashboard for errors
- Verify API key is set: `wrangler secret list`
- Check worker logs: `wrangler tail`

#### No Translations Appearing
1. Verify page has enough text
2. Check if site is paused
3. Ensure correct language is selected
4. Verify worker URL in constants.ts

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Run tests and linting
4. Submit a pull request

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE) file

---

Made with ❤️ for language learners everywhere