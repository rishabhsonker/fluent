#!/usr/bin/env node

/**
 * Test script to demonstrate standardized error responses
 * Run with: node test-error-responses.js
 */

import { createErrorResponse, ErrorTypes } from './error-handler.js';

console.log('Testing Standardized Error Responses\n');
console.log('=====================================\n');

// Test different error types
const testCases = [
  {
    name: 'Validation Error',
    error: (() => {
      const e = new Error('Invalid word format');
      e.name = 'ValidationError';
      e.status = 400;
      return e;
    })()
  },
  {
    name: 'Authentication Error',
    error: (() => {
      const e = new Error('Invalid API token');
      e.status = 401;
      return e;
    })()
  },
  {
    name: 'Rate Limit Error',
    error: (() => {
      const e = new Error('Too many requests');
      e.name = 'RateLimitError';
      e.status = 429;
      return e;
    })(),
    context: { retryAfter: 3600 }
  },
  {
    name: 'Network Error',
    error: (() => {
      const e = new Error('Failed to fetch from external API');
      e.name = 'NetworkError';
      return e;
    })()
  },
  {
    name: 'Database Error',
    error: (() => {
      const e = new Error('D1 query failed');
      return e;
    })()
  }
];

// Test each case
testCases.forEach(({ name, error, context }) => {
  console.log(`Test Case: ${name}`);
  console.log('-'.repeat(40));
  
  const response = createErrorResponse(error, context);
  console.log(JSON.stringify(response, null, 2));
  console.log('\n');
});

console.log('Error Type Detection Examples\n');
console.log('============================\n');

// Test error type detection by message patterns
const messageTests = [
  'Invalid input provided',
  'Unauthorized access',
  'Rate limit exceeded',
  'Network timeout occurred',
  'Database connection failed',
  'Unknown error occurred'
];

messageTests.forEach(message => {
  const error = new Error(message);
  const response = createErrorResponse(error);
  console.log(`Message: "${message}"`);
  console.log(`Detected Type: ${response.error.type}`);
  console.log(`User Message: ${response.error.message}`);
  console.log('-'.repeat(40));
});