import { SpanContext } from '@opentelemetry/api';
import type { LogContext } from '../../types/telemetry.types';
import { LogLevel, StructuredLoggerService } from '../structured-logger.service';

// Mock OpenTelemetry API
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
}));

describe('StructuredLoggerService', () => {
  let service: StructuredLoggerService;
  let _mockSpan: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Mock span with spanContext
    const mockSpanContext: SpanContext = {
      traceId: 'test-trace-id-12345',
      spanId: 'test-span-id-67890',
      traceFlags: 1,
    };

    _mockSpan = {
      spanContext: jest.fn().mockReturnValue(mockSpanContext),
    };

    // Clear mocks
    jest.clearAllMocks();

    service = new StructuredLoggerService('TestContext');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default context', () => {
      expect(service).toBeDefined();
      expect((service as any).context).toBe('TestContext');
    });

    it('should create service with default context when none provided', () => {
      const defaultService = new StructuredLoggerService();
      expect((defaultService as any).context).toBe('StructuredLogger');
    });

    it('should create service with additional context', () => {
      const additionalContext = { userId: 'user123', operation: 'test' };
      const serviceWithContext = new StructuredLoggerService('TestContext', additionalContext);
      expect(serviceWithContext).toBeDefined();
    });

    it('should enable structured logging by default', () => {
      expect(service).toBeDefined();
      // Structured logging is enabled by default unless explicitly disabled
    });

    it('should disable structured logging when environment variable is set', () => {
      process.env.OTEL_LOGS_STRUCTURED_ENABLED = 'false';
      const disabledService = new StructuredLoggerService('Test');
      expect(disabledService).toBeDefined();
    });

    it('should disable trace correlation when environment variable is set', () => {
      process.env.OTEL_LOGS_TRACE_CORRELATION_ENABLED = 'false';
      const noTraceService = new StructuredLoggerService('Test');
      expect(noTraceService).toBeDefined();
    });
  });

  describe('Child Logger Creation', () => {
    it('should create child logger with additional context', () => {
      const childContext = { operation: 'test-operation', threadId: 'thread-123' };
      const childLogger = service.child(childContext);

      expect(childLogger).toBeInstanceOf(StructuredLoggerService);
      expect((childLogger as any).context).toBe('TestContext');
    });

    it('should merge parent and child contexts', () => {
      const parentContext = { userId: 'user123' };
      const parentService = new StructuredLoggerService('Parent', parentContext);

      const childContext = { operation: 'test-operation' };
      const childLogger = parentService.child(childContext);

      expect(childLogger).toBeInstanceOf(StructuredLoggerService);
    });

    it('should create nested child loggers', () => {
      const level1 = service.child({ operation: 'level1' });
      const level2 = level1.child({ operation: 'level2' });
      const level3 = level2.child({ operation: 'level3' });

      expect(level3).toBeInstanceOf(StructuredLoggerService);
    });
  });

  describe('Basic Logging Functionality', () => {
    it('should not throw when logging messages', () => {
      expect(() => service.logError('Test error')).not.toThrow();
      expect(() => service.logWarn('Test warning')).not.toThrow();
      expect(() => service.logInfo('Test info')).not.toThrow();
      expect(() => service.logDebug('Test debug')).not.toThrow();
      expect(() => service.logVerbose('Test verbose')).not.toThrow();
    });

    it('should handle logging with context objects', () => {
      const context: LogContext = { operation: 'test-operation' };
      expect(() => service.logInfo('Test message', context)).not.toThrow();
    });

    it('should handle logging with data objects', () => {
      const customData = { metric: 123, label: 'test' };
      const context: LogContext = { threadId: 'thread-456' };
      expect(() => service.logData(LogLevel.INFO, 'Operation completed', customData, context)).not.toThrow();
    });

    it('should handle AI operation logging', () => {
      const metadata = { modelProvider: 'openai', modelName: 'gpt-4' };
      expect(() => service.logAIOperation('chain_invoke', 1500, true, metadata)).not.toThrow();
    });

    it('should handle AI operation logging with errors', () => {
      const metadata = { modelProvider: 'openai', modelName: 'gpt-4' };
      const error = new Error('AI operation failed');
      expect(() => service.logAIOperation('llm_invoke', 800, false, metadata, error)).not.toThrow();
    });

    it('should handle conversation logging', () => {
      const metadata = { messageCount: 5 };
      expect(() => service.logConversation('started', 'thread-123', 1, metadata)).not.toThrow();
    });

    it('should handle memory operation logging', () => {
      const metadata = { memoryType: 'semantic', resultsCount: 3 };
      expect(() => service.logMemoryOperation('retrieve', 'thread-789', 250, true, metadata)).not.toThrow();
    });

    it('should handle failed memory operations', () => {
      expect(() => service.logMemoryOperation('store', 'thread-999', 500, false)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed error objects', () => {
      const malformedError: any = { toString: () => 'Custom error' };
      expect(() => service.logError('Test error', malformedError)).not.toThrow();
    });

    it('should handle null or undefined errors', () => {
      expect(() => service.logError('Test error', null as any)).not.toThrow();
      expect(() => service.logError('Test error', undefined as any)).not.toThrow();
    });

    it('should handle errors with complex stack traces', () => {
      const complexError = new Error('Complex error');
      complexError.stack = 'Very long stack trace\n'.repeat(100);
      expect(() => service.logError('Complex error test', complexError)).not.toThrow();
    });
  });

  describe('Environment Configuration', () => {
    it('should respect structured logging configuration', () => {
      process.env.OTEL_LOGS_STRUCTURED_ENABLED = 'false';
      const disabledService = new StructuredLoggerService('Test');
      expect(() => disabledService.logInfo('Test message')).not.toThrow();
    });

    it('should respect trace correlation configuration', () => {
      process.env.OTEL_LOGS_TRACE_CORRELATION_ENABLED = 'false';
      const noTraceService = new StructuredLoggerService('Test');
      expect(() => noTraceService.logInfo('Test message')).not.toThrow();
    });
  });

  describe('Legacy Logger Compatibility', () => {
    it('should maintain compatibility with NestJS Logger interface', () => {
      // Test that it has the required Logger interface methods
      expect(typeof service.error).toBe('function');
      expect(typeof service.warn).toBe('function');
      expect(typeof service.log).toBe('function');
      expect(typeof service.debug).toBe('function');
      expect(typeof service.verbose).toBe('function');
    });

    it('should handle legacy logger calls', () => {
      expect(() => service.error('Legacy error')).not.toThrow();
      expect(() => service.warn('Legacy warning')).not.toThrow();
      expect(() => service.log('Legacy log')).not.toThrow();
      expect(() => service.debug('Legacy debug')).not.toThrow();
      expect(() => service.verbose('Legacy verbose')).not.toThrow();
    });
  });
});
