import { Counter, Histogram, Meter, metrics, UpDownCounter } from '@opentelemetry/api';
import { Metric, MetricAI, MetricConversation, MetricMemory, type MetricOptions, MetricsCollector } from '../metric.decorator';

// Mock OpenTelemetry API
jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: jest.fn(),
  },
}));

describe('Metric Decorators', () => {
  let mockMeter: jest.Mocked<Meter>;
  let mockCounter: jest.Mocked<Counter>;
  let mockHistogram: jest.Mocked<Histogram>;
  let mockUpDownCounter: jest.Mocked<UpDownCounter>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock metric instruments
    mockCounter = {
      add: jest.fn(),
    } as any;

    mockHistogram = {
      record: jest.fn(),
    } as any;

    mockUpDownCounter = {
      add: jest.fn(),
    } as any;

    // Mock meter
    mockMeter = {
      createCounter: jest.fn().mockReturnValue(mockCounter),
      createHistogram: jest.fn().mockReturnValue(mockHistogram),
      createUpDownCounter: jest.fn().mockReturnValue(mockUpDownCounter),
    } as any;

    // Setup mocks
    (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);
  });

  describe('@Metric Decorator', () => {
    it('should create metrics with default options', async () => {
      class TestClass {
        @Metric()
        async testMethod(): Promise<string> {
          return 'test result';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('emily_testclass_testMethod_duration', {
        description: 'Metrics for TestClass.testMethod - execution duration',
        unit: 'ms',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), {
        class: 'TestClass',
        method: 'testMethod',
      });

      expect(result).toBe('test result');
    });

    it('should create metrics with custom options', async () => {
      const options: MetricOptions = {
        name: 'custom_operation',
        description: 'Custom operation metrics',
        unit: 'requests',
        labels: { service: 'api' },
        measureDuration: true,
        countInvocations: true,
        trackSuccessRate: true,
      };

      class TestClass {
        @Metric(options)
        async customMethod(): Promise<number> {
          return 42;
        }
      }

      const instance = new TestClass();
      const result = await instance.customMethod();

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('custom_operation_duration', {
        description: 'Custom operation metrics - execution duration',
        unit: 'ms',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('custom_operation_invocations', {
        description: 'Custom operation metrics - invocation count',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('custom_operation_operations', {
        description: 'Custom operation metrics - success/failure count',
      });

      expect(result).toBe(42);
    });

    it('should track invocations when enabled', async () => {
      class TestClass {
        @Metric({ countInvocations: true })
        async countedMethod(): Promise<void> {}
      }

      const instance = new TestClass();
      await instance.countedMethod();

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        class: 'TestClass',
        method: 'countedMethod',
      });
    });

    it('should track success rate when enabled', async () => {
      class TestClass {
        @Metric({ trackSuccessRate: true })
        async successMethod(): Promise<string> {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.successMethod();

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        class: 'TestClass',
        method: 'successMethod',
        status: 'success',
      });

      expect(result).toBe('success');
    });

    it('should track failures with error types', async () => {
      const error = new TypeError('Type error occurred');

      class TestClass {
        @Metric({ trackSuccessRate: true })
        async failingMethod(): Promise<void> {
          throw error;
        }
      }

      const instance = new TestClass();

      await expect(instance.failingMethod()).rejects.toThrow('Type error occurred');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        class: 'TestClass',
        method: 'failingMethod',
        status: 'error',
        error_type: 'TypeError',
      });
    });

    it('should measure duration accurately', async () => {
      class TestClass {
        @Metric({ measureDuration: true })
        async timedMethod(): Promise<void> {
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      const instance = new TestClass();
      await instance.timedMethod();

      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), {
        class: 'TestClass',
        method: 'timedMethod',
      });

      // Verify duration is reasonable (at least 10ms, but not too much more due to test timing)
      const recordedDuration = mockHistogram.record.mock.calls[0][0] as number;
      expect(recordedDuration).toBeGreaterThanOrEqual(8); // Account for timing variations
    });

    it('should work with synchronous methods', async () => {
      class TestClass {
        @Metric()
        syncMethod(): number {
          return 123;
        }
      }

      const instance = new TestClass();
      const result = await instance.syncMethod();

      expect(result).toBe(123);
      expect(mockHistogram.record).toHaveBeenCalled();
    });

    it('should preserve method metadata', () => {
      class TestClass {
        @Metric()
        originalMethodName(): void {}
      }

      const instance = new TestClass();
      expect(instance.originalMethodName.name).toBe('originalMethodName');
    });

    it('should include custom labels in all metrics', async () => {
      class TestClass {
        @Metric({
          labels: { version: '1.0', environment: 'test' },
          countInvocations: true,
          trackSuccessRate: true,
        })
        async labeledMethod(): Promise<void> {}
      }

      const instance = new TestClass();
      await instance.labeledMethod();

      const expectedLabels = {
        class: 'TestClass',
        method: 'labeledMethod',
        version: '1.0',
        environment: 'test',
      };

      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), expectedLabels);
      expect(mockCounter.add).toHaveBeenCalledWith(1, expectedLabels);
      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        ...expectedLabels,
        status: 'success',
      });
    });

    it('should disable duration measurement when specified', async () => {
      class TestClass {
        @Metric({ measureDuration: false })
        async noDurationMethod(): Promise<void> {}
      }

      const instance = new TestClass();
      await instance.noDurationMethod();

      expect(mockMeter.createHistogram).not.toHaveBeenCalledWith(expect.stringContaining('duration'), expect.any(Object));
    });
  });

  describe('Specialized Decorators', () => {
    describe('@MetricAI', () => {
      it('should create AI-specific metrics with model information', async () => {
        class TestClass {
          @MetricAI({
            modelProvider: 'openai',
            modelName: 'gpt-4',
            operation: 'completion',
          })
          async aiMethod(): Promise<string> {
            return 'AI response';
          }
        }

        const instance = new TestClass();
        const result = await instance.aiMethod();

        expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), {
          class: 'TestClass',
          method: 'aiMethod',
          model_provider: 'openai',
          model_name: 'gpt-4',
          ai_operation: 'completion',
        });

        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          class: 'TestClass',
          method: 'aiMethod',
          model_provider: 'openai',
          model_name: 'gpt-4',
          ai_operation: 'completion',
          status: 'success',
        });

        expect(result).toBe('AI response');
      });

      it('should enable duration and success tracking by default', async () => {
        class TestClass {
          @MetricAI()
          async simpleAiMethod(): Promise<void> {}
        }

        const instance = new TestClass();
        await instance.simpleAiMethod();

        expect(mockMeter.createHistogram).toHaveBeenCalled();
        expect(mockMeter.createCounter).toHaveBeenCalled();
      });
    });

    describe('@MetricMemory', () => {
      it('should create memory-specific metrics', async () => {
        class TestClass {
          @MetricMemory({
            memoryType: 'semantic',
            operation: 'retrieve',
          })
          async memoryMethod(): Promise<any[]> {
            return [];
          }
        }

        const instance = new TestClass();
        const result = await instance.memoryMethod();

        expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), {
          class: 'TestClass',
          method: 'memoryMethod',
          memory_type: 'semantic',
          memory_operation: 'retrieve',
        });

        expect(result).toEqual([]);
      });
    });

    describe('@MetricConversation', () => {
      it('should create conversation-specific metrics', async () => {
        class TestClass {
          @MetricConversation({
            conversationType: 'question_answer',
          })
          async conversationMethod(): Promise<string> {
            return 'conversation response';
          }
        }

        const instance = new TestClass();
        const result = await instance.conversationMethod();

        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          class: 'TestClass',
          method: 'conversationMethod',
          conversation_type: 'question_answer',
        });

        expect(result).toBe('conversation response');
      });

      it('should enable invocation count, duration, and success rate by default', async () => {
        class TestClass {
          @MetricConversation()
          async conversationMethod(): Promise<void> {}
        }

        const instance = new TestClass();
        await instance.conversationMethod();

        // Should have created all three types of metrics
        expect(mockMeter.createHistogram).toHaveBeenCalled(); // duration
        expect(mockMeter.createCounter).toHaveBeenCalledTimes(2); // invocations + success rate
      });
    });
  });

  describe('MetricsCollector', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Reset static properties to ensure fresh state
      (MetricsCollector as any)._meter = undefined;
      (MetricsCollector as any)._tokenConsumptionHistogram = undefined;
      (MetricsCollector as any)._memoryRetrievalHistogram = undefined;
      (MetricsCollector as any)._conversationGauge = undefined;

      // Setup mocks to return correct instruments
      mockMeter.createHistogram.mockImplementation((name: string) => {
        if (name.includes('tokens_consumed') || name.includes('memory_retrieval') || name === 'custom_metric' || name === 'test_metric') {
          return mockHistogram;
        }
        return mockHistogram;
      });

      mockMeter.createCounter.mockImplementation(() => mockCounter);
      mockMeter.createUpDownCounter.mockImplementation(() => mockUpDownCounter);
    });

    it('should record token consumption', () => {
      MetricsCollector.recordTokenConsumption(150, { operation: 'completion' });

      expect(mockHistogram.record).toHaveBeenCalledWith(150, { operation: 'completion' });
    });

    it('should record memory retrieval metrics', () => {
      MetricsCollector.recordMemoryRetrieval(250, 0.85, { memory_type: 'semantic' });

      expect(mockHistogram.record).toHaveBeenCalledWith(250, {
        memory_type: 'semantic',
        hit_rate: 0.85,
      });
    });

    it('should update active conversations', () => {
      MetricsCollector.updateActiveConversations(1, { thread_id: 'thread-123' });

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(1, { thread_id: 'thread-123' });
    });

    it('should record custom histogram', () => {
      // Create a specific mock histogram for this test
      const customHistogram = { record: jest.fn() } as any;
      mockMeter.createHistogram.mockReturnValue(customHistogram);

      MetricsCollector.recordHistogram('custom_metric', 42, {
        description: 'Custom metric description',
        unit: 'items',
        labels: { type: 'test' },
      });

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('custom_metric', {
        description: 'Custom metric description',
        unit: 'items',
      });

      expect(customHistogram.record).toHaveBeenCalledWith(42, { type: 'test' });
    });

    it('should increment custom counter', () => {
      // Create a specific mock counter for this test
      const customCounter = { add: jest.fn() } as any;
      mockMeter.createCounter.mockReturnValue(customCounter);

      MetricsCollector.incrementCounter('custom_counter', 5, {
        description: 'Custom counter description',
        labels: { category: 'test' },
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('custom_counter', {
        description: 'Custom counter description',
      });

      expect(customCounter.add).toHaveBeenCalledWith(5, { category: 'test' });
    });

    it('should increment counter with default value', () => {
      // Create a specific mock counter for this test
      const simpleCounter = { add: jest.fn() } as any;
      mockMeter.createCounter.mockReturnValue(simpleCounter);

      MetricsCollector.incrementCounter('simple_counter');

      expect(simpleCounter.add).toHaveBeenCalledWith(1, {});
    });

    it('should update custom gauge', () => {
      // Create a specific mock gauge for this test
      const customGauge = { add: jest.fn() } as any;
      mockMeter.createUpDownCounter.mockReturnValue(customGauge);

      MetricsCollector.updateGauge('custom_gauge', 10, {
        description: 'Custom gauge description',
        labels: { status: 'active' },
      });

      expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith('custom_gauge', {
        description: 'Custom gauge description',
      });

      expect(customGauge.add).toHaveBeenCalledWith(10, { status: 'active' });
    });

    it('should use default descriptions when not provided', () => {
      // Create specific mocks for each metric type
      const testHistogram = { record: jest.fn() } as any;
      const testCounter = { add: jest.fn() } as any;
      const testGauge = { add: jest.fn() } as any;

      mockMeter.createHistogram.mockReturnValue(testHistogram);
      mockMeter.createCounter.mockReturnValue(testCounter);
      mockMeter.createUpDownCounter.mockReturnValue(testGauge);

      MetricsCollector.recordHistogram('test_metric', 1);
      MetricsCollector.incrementCounter('test_counter');
      MetricsCollector.updateGauge('test_gauge', 1);

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('test_metric', {
        description: 'test_metric',
        unit: '',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('test_counter', {
        description: 'test_counter',
      });

      expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith('test_gauge', {
        description: 'test_gauge',
      });
    });
  });

  describe('Type Safety and Edge Cases', () => {
    it('should throw TypeError when applied to non-methods', () => {
      class TestClass {
        public property = 'value';
      }

      const descriptor = {
        value: undefined,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Metric();
      expect(() => decorator(TestClass.prototype, 'property', descriptor)).toThrow('Metric decorator can only be applied to methods');
    });

    it('should handle methods with complex parameter types', async () => {
      class TestClass {
        @Metric()
        async complexMethod(str: string, num: number, _obj: { key: string }, _arr: number[]): Promise<{ result: boolean }> {
          return { result: str.length > num };
        }
      }

      const instance = new TestClass();
      const result = await instance.complexMethod('test', 2, { key: 'value' }, [1, 2, 3]);

      expect(result).toEqual({ result: true });
      expect(mockHistogram.record).toHaveBeenCalled();
    });

    it('should preserve this context correctly', async () => {
      class TestClass {
        private value = 'instance-value';

        @Metric()
        async getInstanceValue(): Promise<string> {
          return this.value;
        }
      }

      const instance = new TestClass();
      const result = await instance.getInstanceValue();

      expect(result).toBe('instance-value');
    });

    it('should handle zero and negative durations', async () => {
      // Mock Date.now to simulate zero duration
      const originalDateNow = Date.now;
      Date.now = jest
        .fn()
        .mockReturnValueOnce(1000) // Start time
        .mockReturnValueOnce(1000); // End time (same = 0 duration)

      class TestClass {
        @Metric({ measureDuration: true })
        async instantMethod(): Promise<void> {}
      }

      const instance = new TestClass();
      await instance.instantMethod();

      expect(mockHistogram.record).toHaveBeenCalledWith(0, expect.any(Object));

      Date.now = originalDateNow;
    });

    it('should handle very large metric values', async () => {
      const largeValue = Number.MAX_SAFE_INTEGER;

      // Clear all mocks and reset the static properties
      jest.clearAllMocks();
      (MetricsCollector as any)._meter = undefined;

      // Create a specific mock histogram for this test
      const largeHistogram = { record: jest.fn() } as any;
      mockMeter.createHistogram.mockReturnValue(largeHistogram);

      MetricsCollector.recordHistogram('large_metric', largeValue);

      expect(largeHistogram.record).toHaveBeenCalledWith(largeValue, {});
    });
  });
});
