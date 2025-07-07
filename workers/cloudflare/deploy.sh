#!/bin/bash

# Fluent Cloudflare Worker Deployment Script

echo "🚀 Fluent Cloudflare Worker Deployment"
echo "======================================"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
else
    echo "✅ Wrangler CLI found"
fi

# Check if logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please login to Cloudflare..."
    wrangler login
fi

# Get current config
echo ""
echo "📋 Current Configuration:"
grep "id = " wrangler.toml | grep -v "your-"

# Check if KV namespace needs to be created
if grep -q "your-kv-namespace-id" wrangler.toml; then
    echo ""
    echo "⚠️  KV namespace not configured!"
    echo "Creating KV namespace..."
    
    # Create KV namespace
    OUTPUT=$(wrangler kv namespace create TRANSLATION_CACHE 2>&1)
    KV_ID=$(echo "$OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "//;s/"//')
    
    # Create preview namespace
    PREVIEW_OUTPUT=$(wrangler kv namespace create TRANSLATION_CACHE --preview 2>&1)
    PREVIEW_ID=$(echo "$PREVIEW_OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "//;s/"//')
    
    if [ ! -z "$KV_ID" ]; then
        echo "✅ Created KV namespace: $KV_ID"
        echo "✅ Created preview namespace: $PREVIEW_ID"
        
        # Update wrangler.toml
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/your-kv-namespace-id/$KV_ID/g" wrangler.toml
            sed -i '' "s/preview_id = \"[^\"]*\"/preview_id = \"$PREVIEW_ID\"/g" wrangler.toml
        else
            # Linux
            sed -i "s/your-kv-namespace-id/$KV_ID/g" wrangler.toml
            sed -i "s/preview_id = \"[^\"]*\"/preview_id = \"$PREVIEW_ID\"/g" wrangler.toml
        fi
        
        echo "✅ Updated wrangler.toml with KV namespace IDs"
    else
        echo "❌ Failed to create KV namespace"
        exit 1
    fi
fi

# Deploy
echo ""
echo "🚀 Deploying worker..."
wrangler deploy

# Get worker URL
WORKER_URL=$(wrangler deploy --dry-run 2>&1 | grep -o 'https://[^[:space:]]*' | head -1)

if [ ! -z "$WORKER_URL" ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo "🌐 Worker URL: $WORKER_URL"
    
    # Test the worker
    echo ""
    echo "🧪 Testing worker..."
    HEALTH_RESPONSE=$(curl -s "$WORKER_URL/health")
    
    if [[ "$HEALTH_RESPONSE" == *"ok"* ]]; then
        echo "✅ Health check passed"
    else
        echo "❌ Health check failed"
    fi
    
    echo ""
    echo "📝 Next steps:"
    echo "1. Update src/lib/constants.js with your worker URL:"
    echo "   TRANSLATOR_API: '$WORKER_URL',"
    echo ""
    echo "2. (Optional) Add Microsoft Translator API key:"
    echo "   wrangler secret put MICROSOFT_TRANSLATOR_KEY"
    echo ""
    echo "3. Rebuild the extension:"
    echo "   npm run build"
else
    echo "❌ Failed to get worker URL"
fi