# Release v1.1.1 - UI Polish Update

## Release Summary
Minor update focusing on UI refinements and visual polish for the tooltip component.

## Changes

### UI/UX Improvements
- **Updated separator symbols** for better visual hierarchy:
  - Changed word mapping separator from ⁂ to ∙ (middle dot)
  - Changed pronunciation separator from ✴ to ⁑ (two asterisks aligned vertically)
  - These changes provide a cleaner, more subtle appearance

### Files Modified
- `src/content/tooltip.ts` - Updated word mapping separator in line 364
- `src/content/styles.css` - Updated pronunciation separator in line 154
- `tests/unit/tooltip.spec.ts` - Updated tests to match new separators

## Testing
- All unit tests pass with updated separators
- Visual testing confirmed improved appearance
- No functional changes - purely cosmetic update

## Deployment Steps

1. **Build the extension**:
   ```bash
   npm run build
   ```

2. **Create distribution package**:
   ```bash
   npm run package
   ```

3. **Test locally**:
   - Load unpacked extension from `dist/` folder
   - Verify tooltip displays with new separators
   - Test on multiple websites

4. **Submit to Chrome Web Store**:
   - Upload `fluent.zip`
   - Update version notes mentioning UI polish

## Version History
- v1.1.0 - Major tooltip redesign with educational features
- v1.1.1 - UI polish with updated separator symbols

## Notes
- No API changes
- No backend deployment required
- Backwards compatible with existing user data