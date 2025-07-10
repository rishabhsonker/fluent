# Release v1.1.3 - Authentication & Performance Improvements

## Release Summary
Major improvements to authentication, context fetching, and rate limiting for better user experience.

## Key Changes

### 1. Fixed Authentication System
- **Enabled proper installation-based authentication** instead of debug auth
- Each installation now gets a unique token for proper rate limiting per device
- Added fallback to debug auth if worker isn't updated yet
- Worker properly validates installation tokens and tracks per-installation limits

### 2. Improved Context Fetching Performance
- **Context is now fetched proactively with translations** instead of on-hover
- This makes tooltips appear instantly without loading delays
- Combined API call reduces latency and improves user experience

### 3. Fixed Rate Limiting Issues
- **Context rate limits increased** from 3/min to 50/min (same as translations)
- Fixed issue where only first 3 word hovers would show context
- Proper per-installation rate limiting now enforced

### 4. Page Control Fix (from v1.1.2)
- Extension no longer translates its own UI elements

## Technical Changes

### Files Modified
- `src/lib/simpleTranslator.ts` - Use InstallationAuth instead of debug auth
- `src/lib/installationAuth.ts` - Add fallback for 404 responses
- `src/lib/rateLimiter.ts` - Increase context rate limits
- `src/background/service-worker.ts` - Enable installation auth initialization
- `workers/cloudflare/translator.js` - Add rate limiting for AI context, fix auth

### Breaking Changes
- Worker must be redeployed with the new authentication logic
- Debug authentication only works in development environment

## Deployment Steps

### 1. Deploy Worker First
```bash
cd workers/cloudflare
wrangler deploy --env production
```

### 2. Build Extension
```bash
npm run build
npm run package
```

### 3. Test Authentication
- Install extension fresh (or clear storage)
- Check console for "Installation auth initialized successfully"
- Verify translations work without 401 errors

### 4. Submit to Chrome Web Store
- Upload `fluent.zip`
- Mention performance improvements in release notes

## Testing Checklist
- [ ] Fresh install creates unique installation ID
- [ ] Translations work without authentication errors
- [ ] Context appears immediately in tooltips (no loading)
- [ ] Can hover on 10+ words without rate limit issues
- [ ] Page control doesn't show translated text
- [ ] Per-device rate limiting works correctly

## Notes
- If worker deployment is delayed, extension will use debug auth as fallback
- Monitor worker logs for proper authentication after deployment
- Rate limits are now per-installation instead of global