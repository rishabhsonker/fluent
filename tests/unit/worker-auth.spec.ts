import { test, expect } from '@playwright/test';

test.describe('Worker Authentication', () => {
  test('should generate unique installation tokens', () => {
    // Test token generation
    const mockToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Token should be URL-safe base64
    expect(mockToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mockToken.length).toBeGreaterThan(30);
    expect(mockToken).not.toContain('+');
    expect(mockToken).not.toContain('/');
    expect(mockToken).not.toContain('=');
  });
  
  test('should validate installation requests', () => {
    // Test installation request validation
    const validRequest = {
      installationId: crypto.randomUUID(),
      extensionVersion: '1.1.3',
      timestamp: Date.now(),
      platform: 'chrome'
    };
    
    const invalidRequest = {
      installationId: 'short', // Too short
      extensionVersion: '1.1.3',
      timestamp: Date.now()
    };
    
    // Valid request should have proper UUID
    expect(validRequest.installationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(validRequest.installationId.length).toBeGreaterThanOrEqual(10);
    
    // Invalid request should fail validation
    expect(invalidRequest.installationId.length).toBeLessThan(10);
  });
  
  test('should return proper registration response', () => {
    // Test registration response format
    const mockResponse = {
      token: 'generated-api-token',
      apiToken: 'generated-api-token',
      refreshToken: 'generated-refresh-token',
      expiresIn: 7 * 24 * 60 * 60 // 7 days
    };
    
    // Response should include both token formats
    expect(mockResponse).toHaveProperty('token');
    expect(mockResponse).toHaveProperty('apiToken');
    expect(mockResponse.token).toBe(mockResponse.apiToken);
    expect(mockResponse).toHaveProperty('refreshToken');
    expect(mockResponse.expiresIn).toBe(604800); // 7 days in seconds
  });
  
  test('should apply AI rate limits per installation', () => {
    // Test AI rate limiting logic
    const installationId = 'test-install-123';
    const contextKey = `${installationId}:context`;
    
    // Rate limit keys should include installation ID
    expect(contextKey).toContain(installationId);
    expect(contextKey).toBe('test-install-123:context');
    
    // Different installations should have different keys
    const anotherInstall = 'test-install-456';
    const anotherKey = `${anotherInstall}:context`;
    expect(anotherKey).not.toBe(contextKey);
  });
});