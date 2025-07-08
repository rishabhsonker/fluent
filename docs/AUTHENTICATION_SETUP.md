# Fluent Extension Authentication Setup

## Overview
The Fluent extension uses a shared secret authentication system to secure communication between the browser extension and the Cloudflare Worker.

## Shared Secret Configuration

### Extension Side
The shared secret is configured in `/src/config/auth.config.ts`:
```typescript
SHARED_SECRET: 'fluent-extension-2024-shared-secret-key'
```

### Cloudflare Worker Side
Set the following environment variable in your Cloudflare Worker:
```
FLUENT_SHARED_SECRET=fluent-extension-2024-shared-secret-key
```

## How It Works

1. **Extension Request**: When the extension makes a request to the Cloudflare Worker, it generates authentication headers using the shared secret:
   - `X-Extension-Id`: The Chrome extension ID
   - `X-Timestamp`: Current timestamp
   - `X-Auth-Token`: SHA-256 hash of `extensionId-timestamp-sharedSecret`

2. **Worker Verification**: The Cloudflare Worker verifies the request by:
   - Checking the timestamp is within 5 minutes
   - Recreating the expected token using the same shared secret
   - Comparing the tokens to ensure they match

## Security Considerations

- The shared secret is embedded in the extension code, so it's not truly "secret" from users who inspect the extension
- This authentication primarily prevents:
  - Unauthorized use of your Cloudflare Worker by other applications
  - Replay attacks (via timestamp validation)
  - Basic abuse of the translation API

## Updating the Shared Secret

If you need to change the shared secret:
1. Update the value in `/src/config/auth.config.ts`
2. Rebuild and publish the extension
3. Update the `FLUENT_SHARED_SECRET` environment variable in your Cloudflare Worker
4. Note: Users will need to update to the new extension version for authentication to work