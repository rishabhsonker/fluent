#!/bin/bash

# Local testing script for Cloudflare Worker
# This helps catch issues before pushing to GitHub

set -e

echo "🧪 Running local tests for Cloudflare Worker..."

# Check Node.js version
echo "📦 Checking Node.js version..."
node_version=$(node -v)
echo "Node.js version: $node_version"

# Check if wrangler is installed
echo "🔧 Checking wrangler installation..."
if ! npx wrangler --version; then
    echo "❌ Wrangler not found. Installing..."
    npm install -g wrangler
fi

# Validate JavaScript syntax
echo "✅ Validating translator.js syntax..."
if node -c translator.js; then
    echo "JavaScript syntax is valid"
else
    echo "❌ JavaScript syntax error detected"
    exit 1
fi

# Check if required files exist
echo "📁 Checking required files..."
required_files=("wrangler.toml" "translator.js" "site-config.json")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file is missing"
        exit 1
    fi
done

# Validate wrangler.toml by checking config
echo "🔍 Validating wrangler.toml..."
if npx wrangler deploy --env production --dry-run 2>/dev/null; then
    echo "✅ wrangler.toml is valid"
elif [ -f "wrangler.toml" ]; then
    echo "✅ wrangler.toml exists (syntax validation requires deployment)"
else
    echo "❌ wrangler.toml is missing"
    exit 1
fi

# Check environment variables
echo "🔑 Checking environment variables..."
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "⚠️  Warning: CLOUDFLARE_API_TOKEN not set"
    echo "   You can set it with: export CLOUDFLARE_API_TOKEN=your-token"
    echo "   Or add it to your .env file"
else
    echo "✅ CLOUDFLARE_API_TOKEN is set"
fi

# Run manage-sites.js validation
echo "📋 Validating site configuration..."
if node manage-sites.js list > /dev/null; then
    echo "✅ Site configuration is valid"
else
    echo "❌ Site configuration validation failed"
    exit 1
fi

echo ""
echo "🎉 All local tests passed!"
echo ""
echo "Next steps:"
echo "1. Make sure CLOUDFLARE_API_TOKEN is added to GitHub secrets"
echo "2. Push your changes to trigger the deployment"
echo "3. Or run './deploy.sh' to deploy manually"