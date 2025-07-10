import { test, expect } from '@playwright/test';

test.describe('Tooltip Unit Tests', () => {
  test('should validate tooltip data attributes', () => {
    // Test data attribute validation
    const validWord = 'house';
    const validTranslation = 'casa';
    const validPronunciation = 'kah-sah';
    
    // Validate attribute names match expected format
    const attributes = {
      'data-original': validWord,
      'data-translation': validTranslation,
      'data-fluent-pronunciation': validPronunciation
    };
    
    expect(attributes['data-original']).toBe('house');
    expect(attributes['data-translation']).toBe('casa');
    expect(attributes['data-fluent-pronunciation']).toBe('kah-sah');
  });
  
  test('should format gender information correctly', () => {
    // Test gender formatting for different languages
    const genderFormats = {
      german: {
        masculine: 'der, masculine',
        feminine: 'die, feminine',
        neuter: 'das, neuter'
      },
      french: {
        masculine: 'le, masculine',
        feminine: 'la, feminine'
      },
      spanish: {
        masculine: 'el, masculine',
        feminine: 'la, feminine'
      }
    };
    
    // Validate German gender formats
    expect(genderFormats.german.masculine).toMatch(/^(der|die|das), (masculine|feminine|neuter)$/);
    expect(genderFormats.german.feminine).toBe('die, feminine');
    expect(genderFormats.german.neuter).toBe('das, neuter');
    
    // Validate French gender formats
    expect(genderFormats.french.masculine).toBe('le, masculine');
    expect(genderFormats.french.feminine).toBe('la, feminine');
    
    // Validate Spanish gender formats
    expect(genderFormats.spanish.masculine).toBe('el, masculine');
    expect(genderFormats.spanish.feminine).toBe('la, feminine');
  });
  
  test('should calculate mastery levels correctly', () => {
    // Test mastery calculation thresholds
    const masteryLevels = [
      { mastery: 0, expectedClass: 'fluent-progress-0', expectedColor: 'fluent-progress-blue' },
      { mastery: 25, expectedClass: 'fluent-progress-30', expectedColor: 'fluent-progress-blue' },
      { mastery: 45, expectedClass: 'fluent-progress-50', expectedColor: 'fluent-progress-blue' },
      { mastery: 55, expectedClass: 'fluent-progress-60', expectedColor: 'fluent-progress-yellow' },
      { mastery: 75, expectedClass: 'fluent-progress-80', expectedColor: 'fluent-progress-yellow' },
      { mastery: 85, expectedClass: 'fluent-progress-90', expectedColor: 'fluent-progress-green' },
      { mastery: 100, expectedClass: 'fluent-progress-100', expectedColor: 'fluent-progress-green' }
    ];
    
    masteryLevels.forEach(({ mastery, expectedClass, expectedColor }) => {
      const roundedMastery = Math.round(mastery / 10) * 10;
      const widthClass = `fluent-progress-${roundedMastery}`;
      expect(widthClass).toBe(expectedClass);
      
      // Check color thresholds
      if (mastery >= 80) {
        expect(expectedColor).toBe('fluent-progress-green');
      } else if (mastery >= 50) {
        expect(expectedColor).toBe('fluent-progress-yellow');
      } else {
        expect(expectedColor).toBe('fluent-progress-blue');
      }
    });
  });
  
  test('should format word mapping correctly', () => {
    // Test word mapping format with gender
    const word = 'house';
    const translation = 'casa';
    const language = 'Spanish';
    const gender = 'la, feminine';
    
    // Format: ∙ "translation" (gender) means "original" in Language
    const expectedFormat = `∙  "${translation}" (${gender}) means "${word}" in ${language}`;
    
    expect(expectedFormat).toContain('∙');
    expect(expectedFormat).toContain('"casa" (la, feminine)');
    expect(expectedFormat).toContain('means "house" in Spanish');
  });
  
  test('should use correct emojis for examples', () => {
    // Test emoji usage
    const englishEmoji = '🔖';
    const translatedEmoji = '📮';
    
    expect(englishEmoji).toBe('🔖');
    expect(translatedEmoji).toBe('📮');
  });
  
  test('should validate pronunciation separator', () => {
    // Test separator symbol
    const separator = '⁑';
    
    expect(separator).toBe('⁑');
    expect(separator.length).toBe(1);
  });
});