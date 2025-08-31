// Suppress NestJS Logger output during tests
jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Logger: class {
      log = jest.fn();
      error = jest.fn();
      warn = jest.fn();
      debug = jest.fn();
      verbose = jest.fn();
      static overrideLogger = jest.fn();
    },
  };
});

// Set test environment variable to ensure test configurations are used
process.env.NODE_ENV = 'test';

// Increase timeout for tests that might load models or other resources
jest.setTimeout(30000);
