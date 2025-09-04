// Mock @xenova/transformers to avoid ES module parsing issues
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
  Pipeline: jest.fn(),
}));

// Mock global console methods for tests that expect console calls
global.console = {
  ...global.console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Suppress NestJS Logger output during tests
// Comment out for now to debug hanging tests
// jest.mock('@nestjs/common', () => {
//   const actual = jest.requireActual('@nestjs/common');
//   return {
//     ...actual,
//     Logger: class {
//       log = jest.fn();
//       error = jest.fn();
//       warn = jest.fn();
//       debug = jest.fn();
//       verbose = jest.fn();
//       static overrideLogger = jest.fn();
//     },
//   };
// });

// Set test environment variable to ensure test configurations are used
process.env.NODE_ENV = 'test';

// Use the global timeout from jest.config.js (60000ms)
// jest.setTimeout(30000); // Removed - was overriding global config
