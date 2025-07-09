#!/bin/bash

# Cloudflare Worker Deployment Script
# This script handles the deployment of the Fluent translator worker to Cloudflare

set -e

echo "🚀 Starting Cloudflare Worker deployment..."

# Check if we're in CI environment
if [ -n "$CI" ]; then
    echo "📦 Running in CI environment"
    
    # Check for required environment variables
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo "❌ Error: CLOUDFLARE_API_TOKEN environment variable is not set"
        echo "Please add CLOUDFLARE_API_TOKEN to your GitHub repository secrets"
        echo "You can create a token at: https://dash.cloudflare.com/profile/api-tokens"
        echo ""
        echo "Required permissions for the token:"
        echo "- Account: Cloudflare Workers Scripts:Edit"
        echo "- Zone: Workers Routes:Edit (if using custom domains)"
        exit 1
    fi
fi

# Navigate to the worker directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# Check if wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: wrangler.toml not found in $(pwd)"
    exit 1
fi

# Check if translator.js exists
if [ ! -f "translator.js" ]; then
    echo "❌ Error: translator.js not found in $(pwd)"
    exit 1
fi

# Validate the JavaScript file
echo "✅ Validating translator.js..."
node -c translator.js

# Deploy to Cloudflare
echo "🌐 Deploying to Cloudflare Workers..."

# Use production environment by default in CI
if [ -n "$CI" ]; then
    echo "Deploying to production environment..."
    npx wrangler deploy --env production
else
    # In local environment, prompt for environment
    echo "Select deployment environment:"
    echo "1) production"
    echo "2) staging"
    echo "3) development"
    read -p "Enter choice [1-3]: " choice
    
    case $choice in
        1) npx wrangler deploy --env production ;;
        2) npx wrangler deploy --env staging ;;
        3) npx wrangler deploy --env development ;;
        *) npx wrangler deploy ;; # Default environment
    esac
fi

echo "✅ Deployment completed successfully!"