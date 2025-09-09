// Mock @xenova/transformers to avoid ES module parsing issues
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  Pipeline: jest.fn(),
}));

// Mock @langchain/langgraph to avoid import errors in tests
jest.mock('@langchain/langgraph');

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
// Create a completely silent logger for tests
const { Logger } = require('@nestjs/common');

// Create custom logger that does nothing
class SilentLogger {
  log() {}
  error() {}
  warn() {}
  debug() {}
  verbose() {}
  fatal() {}
  setLogLevels() {}
}

// Override NestJS logger with silent logger
Logger.overrideLogger(new SilentLogger());

// Also override process.stdout.write and process.stderr.write to catch any direct writes
const _originalStdoutWrite = process.stdout.write;
const _originalStderrWrite = process.stderr.write;

// Suppress all direct writes to stdout/stderr during tests
process.stdout.write = jest.fn().mockReturnValue(true) as typeof process.stdout.write;
process.stderr.write = jest.fn().mockReturnValue(true) as typeof process.stderr.write;

// Set test environment variable to ensure test configurations are used
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent'; // Also set log level to silent

// Use the global timeout from jest.config.js (60000ms)
// jest.setTimeout(30000); // Removed - was overriding global config
