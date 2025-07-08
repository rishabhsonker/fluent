# Setting up Claude API for Enhanced Word Context

The Fluent extension now uses Claude AI to provide pronunciation guides, word meanings, and usage examples for a better learning experience.

## Features

- **Phonetic Pronunciation**: See how to pronounce words (e.g., "actually" → "ak·chu·lee")
- **Clear Definitions**: Get simple, one-sentence explanations of what words mean
- **Usage Examples**: See practical examples of how to use words in context

## Setup Instructions

### 1. Get a Claude API Key

1. Go to [Claude Console](https://console.anthropic.com/account/keys)
2. Sign up or log in to your Anthropic account
3. Create a new API key
4. Copy the key (it starts with `sk-ant-api03-...`)

### 2. Configure the Cloudflare Worker

```bash
cd workers/cloudflare
./setup-claude.sh YOUR_CLAUDE_API_KEY
```

Or manually using wrangler:
```bash
npx wrangler secret put CLAUDE_API_KEY
# Paste your API key when prompted
```

### 3. Deploy the Updated Worker

```bash
npm run deploy
```

### 4. Reload the Extension

1. Go to `chrome://extensions`
2. Click the refresh button on the Fluent extension

## Usage

Once configured, when you hover over translated words:

- You'll see the translation prominently displayed
- Below it, you'll see the pronunciation guide
- A clear definition of the word
- An example sentence showing how to use it
- A button to hear the pronunciation (using text-to-speech)

## API Usage and Costs

- The extension uses Claude 3 Haiku model (fast and cost-effective)
- Words are processed in batches of up to 6 words at a time
- Context is cached to minimize API calls
- Typical usage costs less than $0.01 per day

## Troubleshooting

If context isn't loading:

1. Check that the Claude API key is set correctly:
   ```bash
   npx wrangler secret list
   ```

2. Check worker logs for any errors:
   ```bash
   npx wrangler tail
   ```

3. Ensure your Claude API key has sufficient credits

## Privacy

- Word context requests are sent to Claude via your Cloudflare Worker
- No personal data is sent - only the words being translated
- All requests are authenticated and encrypted