/**
 * Jest setup file for test environment configuration
 * This file runs after the test environment is set up
 */

// Extend Jest matchers for better testing
import 'jest-extended';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && (args[0].includes('Warning:') || args[0].includes('React'))) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && (args[0].includes('Warning:') || args[0].includes('React'))) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Add global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidLangChainComponent(): R;
    }
  }
}

// Custom matcher for LangChain components
expect.extend({
  toBeValidLangChainComponent(received: any) {
    const hasInvoke = typeof received?.invoke === 'function';
    const hasGetType = typeof received?._getType === 'function' || typeof received?._llmType === 'string';

    if (hasInvoke || hasGetType) {
      return {
        message: () => `expected ${received} to be a valid LangChain component`,
        pass: true,
      };
    }

    return {
      message: () => `expected ${received} to be a valid LangChain component with invoke method or type identifier`,
      pass: false,
    };
  },
});
