import { Logger } from '@nestjs/common';

/**
 * Silent logger for use in tests
 * This logger does nothing, preventing test output pollution
 */
export class TestLogger extends Logger {
  log() {
    // Intentionally empty - suppress logs in tests
  }

  error() {
    // Intentionally empty - suppress error logs in tests
  }

  warn() {
    // Intentionally empty - suppress warnings in tests
  }

  debug() {
    // Intentionally empty - suppress debug logs in tests
  }

  verbose() {
    // Intentionally empty - suppress verbose logs in tests
  }

  fatal() {
    // Intentionally empty - suppress fatal logs in tests
  }

  /**
   * Create a mock logger for testing that tracks calls
   * Use this when you need to verify logging behavior
   */
  static createMockLogger() {
    return {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      fatal: jest.fn(),
      setLogLevels: jest.fn(),
    };
  }

  /**
   * Create a silent logger instance
   * Use this for services that require a logger in tests
   */
  static createSilent(context?: string) {
    const logger = new TestLogger(context);
    return logger;
  }
}

/**
 * Global function to suppress all logging in a test suite
 * Call this in beforeAll() to ensure no logs appear
 */
export function suppressTestLogs() {
  // Override console methods
  global.console.log = jest.fn();
  global.console.error = jest.fn();
  global.console.warn = jest.fn();
  global.console.info = jest.fn();
  global.console.debug = jest.fn();

  // Override process.stdout.write and process.stderr.write
  process.stdout.write = jest.fn() as any;
  process.stderr.write = jest.fn() as any;
}

/**
 * Restore original console methods for debugging
 * Call this when you need to see logs for debugging
 */
export function restoreTestLogs() {
  // Note: This won't fully restore original methods in Jest environment
  // Use for debugging only, not in committed tests
  delete (global.console as any).log;
  delete (global.console as any).error;
  delete (global.console as any).warn;
  delete (global.console as any).info;
  delete (global.console as any).debug;
}
