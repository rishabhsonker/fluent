# Security Features

## Authentication
- **HMAC-SHA256**: All API requests are signed with shared secret
- **Extension ID Verification**: Only whitelisted extension IDs can access the API
- **Timestamp Validation**: 5-minute window prevents replay attacks

## Data Protection
- **AES-256-GCM Encryption**: API keys are encrypted before storage
- **PBKDF2 Key Derivation**: 100,000 iterations for key strengthening
- **Secure Random IVs**: Unique initialization vectors for each encryption operation
- **No Logging**: API keys and secrets are never logged

## Privacy
- **Local Storage Only**: All user data stored locally in Chrome storage
- **No Tracking**: No analytics or telemetry
- **Minimal Permissions**: Only activeTab permission requested
- **Auto-Cleanup**: Data older than 30 days is automatically deleted

## Network Security
- **HTTPS Only**: All API calls use TLS encryption
- **CORS Protection**: Strict origin validation on API endpoints
- **Content Security Policy**: Enforced in manifest.json
- **Input Sanitization**: All user inputs are validated and sanitized

## Rate Limiting
- **Server-Side Enforcement**: Rate limits enforced at Cloudflare Worker level
- **Per-Installation Limits**: 100 requests/hour, 1000 requests/day for translations
- **Cost Protection**: Daily limit of $10 USD to prevent abuse

## Anti-Detection
- **Random Delays**: 300-800ms processing variation
- **Dynamic Attributes**: Randomized data attributes for replaced words
- **Behavioral Variation**: Non-deterministic word selection patterns

## Reporting Vulnerabilities

To report security vulnerabilities:
- Use GitHub's private security advisory feature
- Include steps to reproduce and potential impact
- Expected response within 48 hours

## Known Limitations

### Current Implementation
- Shared secret is hardcoded in extension (planned fix in v1.0.1)
- Content scripts run on all websites (moving to dynamic permissions in v1.1)

### Planned Improvements (v1.0.1)
- Dynamic installation tokens instead of shared secret
- Per-installation API keys with revocation capability
- Enhanced CORS validation for specific extension IDs
- Request signing with unique tokens