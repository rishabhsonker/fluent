import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test.describe('Worker Configuration', () => {
  test('should have increased AI rate limits', () => {
    const wranglerPath = join(__dirname, '../../workers/cloudflare/wrangler.toml');
    const content = readFileSync(wranglerPath, 'utf-8');
    
    // Check AI rate limiter is set to 100/hour
    const aiRateLimiterMatch = content.match(/name = "AI_RATE_LIMITER"[\s\S]*?simple = \{ limit = (\d+), period = 3600 \}/);
    expect(aiRateLimiterMatch).toBeTruthy();
    expect(parseInt(aiRateLimiterMatch![1])).toBe(100);
    
    // Check daily AI limiter is set to 500/day
    const dailyAiLimiterMatch = content.match(/name = "DAILY_AI_LIMITER"[\s\S]*?simple = \{ limit = (\d+), period = 86400 \}/);
    expect(dailyAiLimiterMatch).toBeTruthy();
    expect(parseInt(dailyAiLimiterMatch![1])).toBe(500);
  });
  
  test('should have correct rate limit headers in worker', () => {
    const workerPath = join(__dirname, '../../workers/cloudflare/translator.js');
    const content = readFileSync(workerPath, 'utf-8');
    
    // Check header shows 100/hour limit
    expect(content).toContain("'X-AI-RateLimit-Limit-Hourly': '100'");
    expect(content).not.toContain("'X-AI-RateLimit-Limit-Hourly': '20'");
  });
  
  test('should have production cost limits', () => {
    const workerPath = join(__dirname, '../../workers/cloudflare/translator.js');
    const content = readFileSync(workerPath, 'utf-8');
    
    // Check cost limits are set
    expect(content).toContain('DAILY_COST_USD: 10');
    expect(content).toContain('HOURLY_COST_USD: 1');
  });
  
  test('should use structured logging in worker', () => {
    const workerPath = join(__dirname, '../../workers/cloudflare/translator.js');
    const content = readFileSync(workerPath, 'utf-8');
    
    // Check for structured logging functions
    expect(content).toContain('function logInfo(message, context = {})');
    expect(content).toContain('function logError(message, error, context = {})');
    
    // Should log as JSON
    expect(content).toContain('console.log(JSON.stringify({');
    expect(content).toContain('console.error(JSON.stringify({');
  });
});