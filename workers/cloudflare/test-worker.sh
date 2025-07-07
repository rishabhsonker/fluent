#!/bin/bash

# Test script for Fluent Cloudflare Worker

WORKER_URL=${1:-"http://localhost:8787"}

echo "🧪 Testing Fluent Worker at: $WORKER_URL"
echo "========================================"

# Test 1: Health check
echo ""
echo "1️⃣ Testing health endpoint..."
HEALTH=$(curl -s "$WORKER_URL/health")
if [[ "$HEALTH" == *"ok"* ]]; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    echo "Response: $HEALTH"
fi

# Test 2: Translation with mock data
echo ""
echo "2️⃣ Testing translation (Spanish)..."
TRANSLATION=$(curl -s -X POST "$WORKER_URL/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "words": ["house", "water", "time"],
    "targetLanguage": "es"
  }')

if [[ "$TRANSLATION" == *"casa"* ]]; then
    echo "✅ Spanish translation working"
    echo "Response: $TRANSLATION" | jq '.' 2>/dev/null || echo "$TRANSLATION"
else
    echo "❌ Spanish translation failed"
    echo "Response: $TRANSLATION"
fi

# Test 3: Translation with French
echo ""
echo "3️⃣ Testing translation (French)..."
TRANSLATION_FR=$(curl -s -X POST "$WORKER_URL/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "words": ["world", "people"],
    "targetLanguage": "fr"
  }')

if [[ "$TRANSLATION_FR" == *"monde"* ]]; then
    echo "✅ French translation working"
    echo "Response: $TRANSLATION_FR" | jq '.' 2>/dev/null || echo "$TRANSLATION_FR"
else
    echo "❌ French translation failed"
    echo "Response: $TRANSLATION_FR"
fi

# Test 4: Invalid request
echo ""
echo "4️⃣ Testing error handling..."
ERROR_RESPONSE=$(curl -s -X POST "$WORKER_URL/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "words": [],
    "targetLanguage": "es"
  }')

if [[ "$ERROR_RESPONSE" == *"error"* ]]; then
    echo "✅ Error handling working"
    echo "Response: $ERROR_RESPONSE" | jq '.' 2>/dev/null || echo "$ERROR_RESPONSE"
else
    echo "❌ Error handling not working properly"
fi

# Test 5: CORS headers
echo ""
echo "5️⃣ Testing CORS headers..."
CORS_CHECK=$(curl -s -I "$WORKER_URL/health" | grep -i "access-control-allow-origin")
if [[ "$CORS_CHECK" == *"*"* ]]; then
    echo "✅ CORS headers present"
else
    echo "❌ CORS headers missing"
fi

echo ""
echo "✅ Tests completed!"