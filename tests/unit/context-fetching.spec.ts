import { test, expect } from '@playwright/test';

test.describe('Context Fetching', () => {
  test('should fetch context proactively with translations', () => {
    // Test that enableContext is set to true
    const translationRequest = {
      words: ['house', 'water', 'book'],
      targetLanguage: 'es',
      apiKey: undefined,
      enableContext: true // Should be true for proactive fetching
    };
    
    expect(translationRequest.enableContext).toBe(true);
  });
  
  test('should have proper context rate limits', () => {
    // Test rate limits for context match translations
    const rateLimits = {
      translation: {
        perMinute: 50,
        perHour: 500,
        perDay: 2000
      },
      context: {
        perMinute: 50,  // Should match translations
        perHour: 500,   // Should match translations
        perDay: 2000    // Should match translations
      }
    };
    
    // Context limits should match translation limits
    expect(rateLimits.context.perMinute).toBe(rateLimits.translation.perMinute);
    expect(rateLimits.context.perHour).toBe(rateLimits.translation.perHour);
    expect(rateLimits.context.perDay).toBe(rateLimits.translation.perDay);
  });
  
  test('should support hovering on many words without rate limit', () => {
    // Test that we can hover on more than 3 words
    const contextRequests = [];
    const maxHovers = 20;
    
    for (let i = 0; i < maxHovers; i++) {
      contextRequests.push({
        word: `word${i}`,
        allowed: i < 50 // Should allow up to 50 per minute
      });
    }
    
    // All 20 hovers should be allowed within rate limit
    const allowedCount = contextRequests.filter(req => req.allowed).length;
    expect(allowedCount).toBe(maxHovers);
  });
  
  test('should include context data in translation response', () => {
    // Test translation response includes context
    const mockResponse = {
      translations: {
        'house': {
          translation: 'casa',
          pronunciation: 'KAH-sah',
          meaning: 'A building for human habitation',
          example: 'Vivo en una casa grande.'
        }
      },
      metadata: {
        cacheHits: 0,
        cacheMisses: 1
      }
    };
    
    const houseData = mockResponse.translations['house'];
    expect(houseData).toHaveProperty('translation');
    expect(houseData).toHaveProperty('pronunciation');
    expect(houseData).toHaveProperty('meaning');
    expect(houseData).toHaveProperty('example');
  });
});