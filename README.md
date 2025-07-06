# Fluent - Language Learning Chrome Extension

Learn Spanish, French, or German naturally while browsing the web. Fluent replaces 5-6 English words with their translations on any text-heavy webpage.

## Features

✨ **Smart Word Replacement** - Replaces 5-6 carefully selected words per page
🎯 **Performance First** - <50ms processing time, <30MB memory usage  
🌐 **Works Everywhere** - Compatible with all text-heavy websites
🔒 **Privacy Focused** - No tracking, local-only data storage
⚡ **Instant Learning** - See translations with hover tooltips

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/fluent.git
   cd fluent
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build
```

## Architecture

- **Content Script** (<20KB vanilla JS) - Handles word replacement with zero dependencies
- **Service Worker** - Manages storage and settings
- **React Popup** - Settings interface (only loads when clicked)
- **Cloudflare Worker** - Secure translation API proxy with caching
- **Performance Guards** - Automatic limits to ensure smooth browsing

## Current Status

### ✅ Completed
- Lean content script with TreeWalker-based word selection
- Smart site detection and configuration
- Lightweight tooltip system
- Chrome Storage integration
- Performance monitoring and guards
- Build system with Vite

### 🚧 Next Steps
- Deploy Cloudflare Worker for translations
- Bloom filter cache implementation  
- Connect to real translation API
- Spaced repetition system
- Advanced language configurations

## Cloudflare Worker Setup

The extension uses a Cloudflare Worker for secure API translation:

1. Navigate to `workers/cloudflare/`
2. Follow the README there to deploy your worker
3. Update `TRANSLATOR_API` in `src/lib/constants.js` with your worker URL
4. Set your Microsoft Translator API key in Cloudflare dashboard

## Testing

The extension has been optimized for:
- Wikipedia (structured content)
- Reddit (dynamic loading)
- Medium (reading-focused)
- GitHub (code-heavy pages)

## License

MIT