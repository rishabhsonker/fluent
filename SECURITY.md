# Security Features

## Authentication
- **Installation-Based Tokens**: Each device gets a unique authentication token
- **HMAC-SHA256**: All API requests are signed for integrity verification
- **Timestamp Validation**: 5-minute window prevents replay attacks
- **Per-Device Rate Limiting**: Isolated quotas for each installation

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
- **Per-Installation Limits**: 
  - Translations: 100/hour, 1000/day
  - Context hovering: 50/minute
  - AI explanations: 100/hour, 500/day
- **Cost Protection**: Daily limit of $10 USD to prevent abuse
- **Dynamic Caching**: Cloudflare KV reduces API calls over time

## Anti-Detection
- **Random Delays**: 300-800ms processing variation
- **Dynamic Attributes**: Randomized data attributes for replaced words
- **Behavioral Variation**: Non-deterministic word selection patterns

## Reporting Vulnerabilities

To report security vulnerabilities:
- Use GitHub's private security advisory feature
- Include steps to reproduce and potential impact
- Expected response within 48 hours

## Security Updates

### Recent Improvements (v1.1.3)
✅ Implemented installation-based authentication tokens
✅ Removed hardcoded shared secrets
✅ Added per-device rate limiting
✅ Enhanced API performance with parallel calls
✅ Automatic blacklisting of productivity sites

### Future Enhancements
- OAuth 2.0 support for premium users
- WebAuthn for enhanced security
- Certificate pinning for API calls
- Anomaly detection for usage patterns