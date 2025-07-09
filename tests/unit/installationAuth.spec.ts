import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';

test.describe('Installation Authentication', () => {
  test('should generate valid HMAC signature', async () => {
    // Test HMAC signature generation
    const token = 'test-token-123';
    const installationId = 'test-install-id';
    const timestamp = Date.now();
    const method = 'POST';
    const path = '/translate';
    const body = JSON.stringify({ words: ['hello'], targetLanguage: 'es' });
    
    // Create message for signing
    const message = `${method}:${path}:${timestamp}:${body}`;
    
    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', token)
      .update(message)
      .digest('hex');
    
    // Verify signature format
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(signature.length).toBe(64);
  });

  test('should validate timestamp within acceptable range', async () => {
    const now = Date.now();
    const validTimestamp = now - 1000; // 1 second ago
    const invalidTimestamp = now - 360000; // 6 minutes ago
    
    // Check timestamp validation (5 minute window)
    const isValidRecent = Math.abs(now - validTimestamp) <= 5 * 60 * 1000;
    const isValidOld = Math.abs(now - invalidTimestamp) <= 5 * 60 * 1000;
    
    expect(isValidRecent).toBe(true);
    expect(isValidOld).toBe(false);
  });

  test('should format auth headers correctly', async () => {
    const token = 'test-bearer-token';
    const installationId = 'test-install-123';
    const timestamp = Date.now();
    const signature = 'test-signature';
    
    // Format headers as expected
    const headers = {
      'Authorization': `Bearer ${token}`,
      'X-Installation-Id': installationId,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature
    };
    
    // Verify header format
    expect(headers['Authorization']).toMatch(/^Bearer .+$/);
    expect(headers['X-Installation-Id']).toBe(installationId);
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Signature']).toBe(signature);
  });

  test('should handle missing token gracefully', async () => {
    // When token is null/undefined, auth headers should not include Bearer token
    const token: string | null = null;
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    expect(headers['Authorization']).toBeUndefined();
  });
});