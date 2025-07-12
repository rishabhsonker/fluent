# Development Workflow

## Branch Strategy

We follow a simple two-environment workflow:

```
main          → Production (protected)
develop       → Development/Testing
feature/*     → New features
fix/*         → Bug fixes
refactor/*    → Code improvements
release/*     → Release preparation
```

## Development Process

### 1. Starting New Work

```bash
# Always branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### 2. During Development

- Commit frequently with clear messages
- Run tests locally: `npm test`
- Check types: `npm run type-check`
- Build locally: `npm run build`

### 3. Creating a Pull Request

1. Push your branch: `git push -u origin feature/your-feature-name`
2. Create PR targeting `develop` branch
3. Fill out the PR template
4. Wait for CI checks to pass

### 4. Code Review

- At least one approval required
- All CI checks must pass
- Address review feedback
- Squash and merge when approved

## Deployment Pipeline

### Automatic Deployments

| Branch | Environment | Automatic | Approval Required |
|--------|------------|-----------|-------------------|
| develop | Development | ✅ | ❌ |
| main | Production | ✅ | ✅ (5 min wait) |

### Manual Release Process

1. **Create Release**
   ```bash
   # Run from GitHub Actions UI
   # Select "Release Management" workflow
   # Input version number (e.g., 1.2.0)
   ```

2. **Release PR Flow**
   - Creates `release/x.x.x` branch from develop
   - Updates version in package.json and manifest.json
   - Creates PR to main
   - After merge: auto-deploys to production

3. **Post-Release**
   - Develop automatically syncs with main
   - GitHub release created with artifacts
   - Chrome Web Store updated

## Environment Configuration

### Development
- Develop branch auto-deploys
- No approval needed
- For testing and integration

### Production
- Main branch only
- Requires approval
- 5-minute safety delay
- Creates GitHub releases

## CI/CD Checks

Every PR runs:
1. **TypeScript Check** - Type safety
2. **Linting** - Code style
3. **Unit Tests** - Component testing
4. **Build Verification** - Extension builds correctly
5. **Bundle Size Check** - Under 300KB per file
6. **Security Scan** - No vulnerabilities

## Secret Management

### Required GitHub Secrets

```yaml
# Cloudflare (Development)
DEV_CLOUDFLARE_API_TOKEN
DEV_CLOUDFLARE_ACCOUNT_ID

# Cloudflare (Production)
PROD_CLOUDFLARE_API_TOKEN
PROD_CLOUDFLARE_ACCOUNT_ID

# Chrome Web Store
CHROME_WEBSTORE_CLIENT_ID
CHROME_WEBSTORE_CLIENT_SECRET
CHROME_WEBSTORE_REFRESH_TOKEN
```

### Setting Up Secrets

1. Go to Settings → Secrets and variables → Actions
2. Add repository secrets
3. Use environment-specific secrets

## Rollback Process

If issues are found in production:

1. **Immediate Rollback**
   ```bash
   git checkout main
   git revert HEAD
   git push origin main
   ```

2. **Previous Version**
   - Download from GitHub Releases
   - Manual upload to Chrome Web Store

## Best Practices

1. **Never commit directly to main or develop**
2. **Always branch from develop for new work**
3. **Keep PRs focused and small**
4. **Write meaningful commit messages**
5. **Update tests for new features**
6. **Document breaking changes**

## Troubleshooting

### Build Fails
- Check TypeScript errors: `npm run type-check`
- Verify imports are correct
- Ensure bundle sizes are under limit

### Tests Fail
- Run locally: `npm test`
- Check for console.log statements
- Verify file paths are correct

### Deployment Fails
- Check GitHub Actions logs
- Verify secrets are set correctly
- Ensure branch protections aren't blocking