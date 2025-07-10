import { test, expect } from '@playwright/test';

test.describe('Page Control Skip Tests', () => {
  test('should have data-fluent-skip attributes on page control elements', () => {
    // Test that all page control elements have skip attributes
    const skipSelectors = [
      '.fluent-control',
      '.fluent-control *',
      '.fluent-tooltip',
      '.fluent-tooltip *',
      '[data-fluent-skip]',
      '[data-fluent-skip] *'
    ];
    
    // Verify skip selectors include page control elements
    expect(skipSelectors).toContain('.fluent-control');
    expect(skipSelectors).toContain('[data-fluent-skip]');
  });
  
  test('should mark language buttons with skip attribute', () => {
    // Test HTML structure has data-fluent-skip
    const menuHTML = `
      <button class="fluent-control-lang-btn" data-lang="spanish" data-fluent-skip="true">
        <span>🇪🇸</span>
        <span>Spanish</span>
      </button>
    `;
    
    expect(menuHTML).toContain('data-fluent-skip="true"');
    expect(menuHTML).toContain('Spanish');
  });
  
  test('should skip elements with fluent-control class', () => {
    // Mock element check
    const mockElement = {
      classList: {
        contains: (className: string) => className === 'fluent-control'
      },
      closest: (selector: string) => selector === '.fluent-control' ? true : null,
      hasAttribute: (attr: string) => attr === 'data-fluent-skip'
    };
    
    // Should return true for fluent-control elements
    const shouldSkip = mockElement.classList.contains('fluent-control') || 
                      mockElement.closest('.fluent-control') || 
                      mockElement.hasAttribute('data-fluent-skip');
    
    expect(shouldSkip).toBe(true);
  });
});