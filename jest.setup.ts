// Mock @xenova/transformers to avoid ES module parsing issues
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  Pipeline: jest.fn(),
}));

// Store original console methods for tests that need to verify calls
const _originalConsole = { ...global.console };

// Mock global console methods to suppress output during tests
global.console = {
  ...global.console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Suppress NestJS Logger output during tests
// Set silent logger to avoid console pollution while keeping functionality
const { Logger } = require('@nestjs/common');
Logger.overrideLogger(false);

// Set test environment variable to ensure test configurations are used
process.env.NODE_ENV = 'test';

// Use the global timeout from jest.config.js (60000ms)
// jest.setTimeout(30000); // Removed - was overriding global config
