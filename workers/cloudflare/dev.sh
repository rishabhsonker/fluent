#!/bin/bash

# Local development server for Cloudflare Worker

echo "🚀 Starting Fluent Worker Development Server"
echo "==========================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
else
    echo "✅ Wrangler CLI found"
fi

echo ""
echo "📝 Starting local development server..."
echo "The worker will be available at: http://localhost:8787"
echo ""
echo "To use with the extension:"
echo "1. Update src/lib/constants.js:"
echo "   TRANSLATOR_API: 'http://localhost:8787',"
echo "2. Rebuild extension: npm run build"
echo "3. Reload extension in Chrome"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start dev server
wrangler dev --local