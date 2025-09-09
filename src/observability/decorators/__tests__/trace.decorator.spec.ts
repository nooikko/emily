import { Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  addSpanAttribute,
  addSpanAttributes,
  addSpanEvent,
  createChildSpan,
  setSpanStatus,
  Trace,
  TraceAI,
  TraceDB,
  TraceHTTP,
  type TraceOptions,
} from '../trace.decorator';

// Type definitions for mocks
interface MockTracer {
  startSpan: jest.MockedFunction<(name: string, options?: unknown) => Span>;
  startActiveSpan: jest.MockedFunction<(name: string, fn: (span: Span) => unknown) => unknown>;
}

// Mock OpenTelemetry API
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(),
    getActiveSpan: jest.fn(),
  },
  SpanKind: {
    INTERNAL: 'internal',
    CLIENT: 'client',
    SERVER: 'server',
    PRODUCER: 'producer',
    CONSUMER: 'consumer',
  },
  SpanStatusCode: {
    OK: 'ok',
    ERROR: 'error',
    UNSET: 'unset',
  },
}));

describe('Trace Decorators', () => {
  let mockTracer: MockTracer;
  let mockSpan: jest.Mocked<Span>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock span
    mockSpan = {
      setAttributes: jest.fn(),
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      recordException: jest.fn(),
      addEvent: jest.fn(),
      end: jest.fn(),
      spanContext: jest.fn(),
      isRecording: jest.fn().mockReturnValue(true),
      updateName: jest.fn(),
    } as any;

    // Mock tracer
    mockTracer = {
      startActiveSpan: jest.fn(),
      startSpan: jest.fn().mockReturnValue(mockSpan),
    };

    // Setup mocks
    (trace.getTracer as jest.Mock).mockReturnValue(mockTracer);
    (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);
  });

  describe('@Trace Decorator', () => {
    it('should create span with default options', async () => {
      class TestClass {
        @Trace()
        async testMethod(): Promise<string> {
          return 'test result';
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.testMethod',
        {
          kind: SpanKind.INTERNAL,
          attributes: {},
        },
        expect.any(Function),
      );

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'code.function': 'testMethod',
        'code.namespace': 'TestClass',
        'code.filepath': 'TestClass',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toBe('test result');
    });

    it('should use custom span name and attributes', async () => {
      const customOptions: TraceOptions = {
        name: 'custom-operation',
        attributes: { 'operation.type': 'database', priority: 'high' },
      };

      class TestClass {
        @Trace(customOptions)
        async customMethod(): Promise<number> {
          return 42;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.customMethod();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'custom-operation',
        {
          kind: SpanKind.INTERNAL,
          attributes: { 'operation.type': 'database', priority: 'high' },
        },
        expect.any(Function),
      );

      expect(result).toBe(42);
    });

    it('should handle synchronous methods', async () => {
      class TestClass {
        @Trace()
        syncMethod(): string {
          return 'sync result';
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.syncMethod();

      expect(result).toBe('sync result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    });

    it('should record exceptions when enabled', async () => {
      const error = new Error('Test error');

      class TestClass {
        @Trace({ recordException: true })
        async failingMethod(): Promise<void> {
          throw error;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();

      await expect(instance.failingMethod()).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should not record exceptions when disabled', async () => {
      const error = new Error('Test error');

      class TestClass {
        @Trace({ recordException: false, setStatusOnException: false })
        async failingMethod(): Promise<void> {
          throw error;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();

      await expect(instance.failingMethod()).rejects.toThrow('Test error');

      expect(mockSpan.recordException).not.toHaveBeenCalled();
      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle errors without message', async () => {
      const error = { name: 'CustomError' }; // Non-Error object

      class TestClass {
        @Trace()
        async failingMethod(): Promise<void> {
          throw error;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();

      await expect(instance.failingMethod()).rejects.toEqual(error);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Unknown error',
      });
    });

    it('should preserve original method metadata', () => {
      class TestClass {
        @Trace()
        originalMethodName(): void {}
      }

      const instance = new TestClass();
      expect(instance.originalMethodName.name).toBe('originalMethodName');
    });

    it('should work with different span kinds', async () => {
      class TestClass {
        @Trace({ kind: SpanKind.CLIENT })
        async clientMethod(): Promise<void> {}
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      await instance.clientMethod();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.clientMethod',
        {
          kind: SpanKind.CLIENT,
          attributes: {},
        },
        expect.any(Function),
      );
    });
  });

  describe('@TraceHTTP Decorator', () => {
    it('should create HTTP span with CLIENT kind', async () => {
      class TestClass {
        @TraceHTTP()
        async httpRequest(): Promise<string> {
          return 'response';
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.httpRequest();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.httpRequest',
        {
          kind: SpanKind.CLIENT,
          attributes: {},
        },
        expect.any(Function),
      );

      expect(result).toBe('response');
    });

    it('should merge custom attributes with HTTP attributes', async () => {
      class TestClass {
        @TraceHTTP({
          attributes: { 'http.method': 'POST', 'http.url': '/api/data' },
          name: 'post-request',
        })
        async postRequest(): Promise<void> {}
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      await instance.postRequest();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'post-request',
        {
          kind: SpanKind.CLIENT,
          attributes: { 'http.method': 'POST', 'http.url': '/api/data' },
        },
        expect.any(Function),
      );
    });
  });

  describe('@TraceDB Decorator', () => {
    it('should create database span with system and name', async () => {
      class TestClass {
        @TraceDB({ dbSystem: 'postgresql', dbName: 'emily_db' })
        async queryDatabase(): Promise<any[]> {
          return [];
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.queryDatabase();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.queryDatabase',
        {
          kind: SpanKind.CLIENT,
          attributes: { 'db.system': 'postgresql', 'db.name': 'emily_db' },
        },
        expect.any(Function),
      );

      expect(result).toEqual([]);
    });

    it('should work without database system and name', async () => {
      class TestClass {
        @TraceDB()
        async genericDbOperation(): Promise<void> {}
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      await instance.genericDbOperation();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.genericDbOperation',
        {
          kind: SpanKind.CLIENT,
          attributes: {},
        },
        expect.any(Function),
      );
    });
  });

  describe('@TraceAI Decorator', () => {
    it('should create AI span with model information', async () => {
      class TestClass {
        @TraceAI({
          modelProvider: 'openai',
          modelName: 'gpt-4',
          operation: 'completion',
        })
        async aiOperation(): Promise<string> {
          return 'AI response';
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.aiOperation();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.aiOperation',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'ai.system': 'langchain',
            'ai.model.provider': 'openai',
            'ai.model.name': 'gpt-4',
            'ai.operation': 'completion',
          },
        },
        expect.any(Function),
      );

      expect(result).toBe('AI response');
    });

    it('should work with minimal AI attributes', async () => {
      class TestClass {
        @TraceAI()
        async simpleAiOperation(): Promise<void> {}
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      await instance.simpleAiOperation();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestClass.simpleAiOperation',
        {
          kind: SpanKind.CLIENT,
          attributes: { 'ai.system': 'langchain' },
        },
        expect.any(Function),
      );
    });
  });

  describe('Utility Functions', () => {
    describe('addSpanAttribute', () => {
      it('should add attribute to active span', () => {
        addSpanAttribute('test.key', 'test.value');

        expect(trace.getActiveSpan).toHaveBeenCalled();
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.key', 'test.value');
      });

      it('should handle no active span gracefully', () => {
        (trace.getActiveSpan as jest.Mock).mockReturnValue(null);

        expect(() => addSpanAttribute('test.key', 'test.value')).not.toThrow();
      });

      it('should handle different attribute value types', () => {
        addSpanAttribute('string.key', 'string value');
        addSpanAttribute('number.key', 123);
        addSpanAttribute('boolean.key', true);

        expect(mockSpan.setAttribute).toHaveBeenCalledWith('string.key', 'string value');
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('number.key', 123);
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('boolean.key', true);
      });
    });

    describe('addSpanAttributes', () => {
      it('should add multiple attributes to active span', () => {
        const attributes = {
          attr1: 'value1',
          attr2: 42,
          attr3: false,
        };

        addSpanAttributes(attributes);

        expect(mockSpan.setAttributes).toHaveBeenCalledWith(attributes);
      });

      it('should handle no active span gracefully', () => {
        (trace.getActiveSpan as jest.Mock).mockReturnValue(null);

        expect(() => addSpanAttributes({ key: 'value' })).not.toThrow();
      });
    });

    describe('addSpanEvent', () => {
      it('should add event to active span with attributes', () => {
        const attributes = { eventType: 'user_action', userId: 123 };

        addSpanEvent('user_clicked', attributes);

        expect(mockSpan.addEvent).toHaveBeenCalledWith('user_clicked', attributes);
      });

      it('should add event without attributes', () => {
        addSpanEvent('process_started');

        expect(mockSpan.addEvent).toHaveBeenCalledWith('process_started', undefined);
      });

      it('should handle no active span gracefully', () => {
        (trace.getActiveSpan as jest.Mock).mockReturnValue(null);

        expect(() => addSpanEvent('test_event')).not.toThrow();
      });
    });

    describe('setSpanStatus', () => {
      it('should set span status with code and message', () => {
        setSpanStatus(SpanStatusCode.ERROR, 'Operation failed');

        expect(mockSpan.setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.ERROR,
          message: 'Operation failed',
        });
      });

      it('should set span status with code only', () => {
        setSpanStatus(SpanStatusCode.OK);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.OK,
          message: undefined,
        });
      });

      it('should handle no active span gracefully', () => {
        (trace.getActiveSpan as jest.Mock).mockReturnValue(null);

        expect(() => setSpanStatus(SpanStatusCode.OK)).not.toThrow();
      });
    });

    describe('createChildSpan', () => {
      it('should create child span with default options', () => {
        const span = createChildSpan('child-operation');

        expect(trace.getTracer).toHaveBeenCalledWith('emily-observability', '1.0.0');
        expect(mockTracer.startSpan).toHaveBeenCalledWith('child-operation', {
          kind: SpanKind.INTERNAL,
          attributes: undefined,
        });

        expect(span).toBe(mockSpan);
      });

      it('should create child span with custom options', () => {
        const options = {
          kind: SpanKind.CLIENT,
          attributes: { 'operation.type': 'http' },
        };

        const span = createChildSpan('http-request', options);

        expect(mockTracer.startSpan).toHaveBeenCalledWith('http-request', {
          kind: SpanKind.CLIENT,
          attributes: { 'operation.type': 'http' },
        });

        expect(span).toBe(mockSpan);
      });
    });
  });

  describe('Method Signature Preservation', () => {
    it('should preserve method parameters and return types', async () => {
      class TestClass {
        @Trace()
        async methodWithParams(param1: string, param2: number): Promise<boolean> {
          return param1.length > param2;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.methodWithParams('hello', 3);

      expect(result).toBe(true);
    });

    it('should preserve this context', async () => {
      class TestClass {
        private value = 'test-value';

        @Trace()
        async getThisValue(): Promise<string> {
          return this.value;
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.getThisValue();

      expect(result).toBe('test-value');
    });

    it('should work with regular async methods', async () => {
      class TestClass {
        @Trace()
        async regularMethod(): Promise<string> {
          return 'regular result';
        }
      }

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const instance = new TestClass();
      const result = await instance.regularMethod();

      expect(result).toBe('regular result');
    });
  });
});
