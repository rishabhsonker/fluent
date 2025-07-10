# Release v1.1.2 - Page Control Fix

## Release Summary
Critical bug fix to prevent the extension from translating its own UI elements in the page control widget.

## Bug Fixed

### Page Control Translation Issue
- **Problem**: The extension was translating language names (Spanish, French, German) in its own page control widget
- **Solution**: Added proper exclusion attributes to prevent the extension's UI elements from being processed
- **Impact**: Page control now displays correctly without unwanted translations

## Technical Changes

### Files Modified
- `src/content/index.ts` - Added skip selectors for fluent-control and data-fluent-skip attributes
- `src/content/PageControl.ts` - Added data-fluent-skip attributes to all UI elements
- `tests/unit/page-control-skip.spec.ts` - Added tests for skip functionality

### Implementation Details
1. Added `data-fluent-skip="true"` attribute to all page control elements
2. Updated text processor to exclude elements with:
   - `.fluent-control` class and all children
   - `.fluent-tooltip` class and all children  
   - `[data-fluent-skip]` attribute and all children
3. Enhanced `shouldSkipElement` function to check for these exclusions

## Testing
- TypeScript compilation passes
- New unit tests added for skip functionality
- Manual testing confirmed page control displays correctly

## Deployment Steps

1. **Build the extension**:
   ```bash
   npm run build
   ```

2. **Test locally**:
   - Load unpacked extension
   - Verify page control shows "Spanish", "French", "German" without translations
   - Test language switching functionality

3. **Package for release**:
   ```bash
   npm run package
   ```

4. **Submit to Chrome Web Store**:
   - Upload `fluent.zip`
   - Mention critical bug fix in release notes

## Version History
- v1.1.0 - Major tooltip redesign
- v1.1.1 - UI polish with separator symbols
- v1.1.2 - Fix page control translation bug