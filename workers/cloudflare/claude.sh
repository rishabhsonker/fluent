#!/bin/bash

# Setup script for Claude API key in Cloudflare Worker

echo "=== Setting up Claude API key for Fluent Worker ==="
echo ""

# Check if CLAUDE_API_KEY is provided as argument
if [ -z "$1" ]; then
    echo "Usage: ./claude.sh YOUR_CLAUDE_API_KEY"
    echo ""
    echo "You can get your Claude API key from:"
    echo "https://console.anthropic.com/account/keys"
    echo ""
    echo "Example:"
    echo "./claude.sh sk-ant-api03-xxx..."
    exit 1
fi

CLAUDE_API_KEY=$1

echo "Setting Claude API key secret..."
npx wrangler secret put CLAUDE_API_KEY <<< "$CLAUDE_API_KEY"

echo ""
echo "✅ Claude API key has been set!"
echo ""
echo "Now deploy your worker with:"
echo "npm run deploy"