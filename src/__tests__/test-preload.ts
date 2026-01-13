/**
 * Bun test preload script
 * This file is loaded before any test files to set up consistent mocking
 * 
 * Usage: bun test --preload ./src/__tests__/test-preload.ts
 */

import { mock, afterEach } from "bun:test";

// Reset all mocks after each test to prevent mock pollution
afterEach(() => {
  mock.restore();
});
