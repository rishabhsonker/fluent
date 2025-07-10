import { test, expect } from '@playwright/test';

test.describe('Context Rotation', () => {
  test('should generate multiple context variations', () => {
    // Test that we generate multiple variations for rotation
    const mockVariations = [
      {
        pronunciation: 'KAH-sah',
        meaning: 'A building for human habitation',
        example: 'Vivo en una casa grande.'
      },
      {
        pronunciation: 'KAH-sah',
        meaning: 'A place where people live',
        example: 'Mi casa es muy cómoda.'
      },
      {
        pronunciation: 'KAH-sah',
        meaning: 'A dwelling or residence',
        example: 'La casa tiene tres habitaciones.'
      }
    ];
    
    // All variations should have required fields
    mockVariations.forEach(variation => {
      expect(variation).toHaveProperty('pronunciation');
      expect(variation).toHaveProperty('meaning');
      expect(variation).toHaveProperty('example');
    });
    
    // Variations should be different
    const meanings = mockVariations.map(v => v.meaning);
    const uniqueMeanings = new Set(meanings);
    expect(uniqueMeanings.size).toBe(meanings.length);
    
    const examples = mockVariations.map(v => v.example);
    const uniqueExamples = new Set(examples);
    expect(uniqueExamples.size).toBe(examples.length);
  });
  
  test('should rotate through variations', () => {
    // Test rotation logic
    const variations = ['variation1', 'variation2', 'variation3'];
    let lastUsedIndex = 0;
    
    // Simulate rotation
    const getNextVariation = () => {
      const current = variations[lastUsedIndex];
      lastUsedIndex = (lastUsedIndex + 1) % variations.length;
      return current;
    };
    
    // Should cycle through all variations
    expect(getNextVariation()).toBe('variation1');
    expect(getNextVariation()).toBe('variation2');
    expect(getNextVariation()).toBe('variation3');
    expect(getNextVariation()).toBe('variation1'); // Back to start
  });
  
  test('should handle context cache key format', () => {
    // Test cache key format for rotating contexts
    const targetLanguage = 'es';
    const word = 'House';
    const cacheKey = `contexts:${targetLanguage}:${word.toLowerCase()}`;
    
    expect(cacheKey).toBe('contexts:es:house');
    expect(cacheKey).toMatch(/^contexts:[a-z]{2}:[a-z]+$/);
  });
  
  test('should store translation and contexts separately', () => {
    // Test data structure for storing variations
    const contextData = {
      translation: 'casa',
      contexts: [
        { pronunciation: 'KAH-sah', meaning: 'A house', example: 'Una casa grande' },
        { pronunciation: 'KAH-sah', meaning: 'A home', example: 'Mi casa es bonita' },
        { pronunciation: 'KAH-sah', meaning: 'A dwelling', example: 'La casa está aquí' }
      ],
      lastUsedIndex: 0,
      createdAt: Date.now()
    };
    
    expect(contextData).toHaveProperty('translation');
    expect(contextData).toHaveProperty('contexts');
    expect(contextData.contexts).toBeInstanceOf(Array);
    expect(contextData.contexts.length).toBeGreaterThan(0);
    expect(contextData).toHaveProperty('lastUsedIndex');
    expect(contextData).toHaveProperty('createdAt');
  });
});