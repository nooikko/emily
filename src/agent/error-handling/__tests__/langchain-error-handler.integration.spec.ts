import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCategory } from '../interfaces/error-handling.interface';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { FallbackChainService } from '../services/fallback-chain.service';
import { LangChainErrorHandlerService } from '../services/langchain-error-handler.service';
import { RecoveryWorkflowService } from '../services/recovery-workflow.service';
import { RetryService } from '../services/retry.service';

describe('LangChainErrorHandler Integration', () => {
  let errorHandler: LangChainErrorHandlerService;
  let recoveryService: RecoveryWorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [LangChainErrorHandlerService, RetryService, CircuitBreakerService, FallbackChainService, RecoveryWorkflowService],
    }).compile();

    errorHandler = module.get<LangChainErrorHandlerService>(LangChainErrorHandlerService);
    recoveryService = module.get<RecoveryWorkflowService>(RecoveryWorkflowService);
  });

  describe('LangChain Runnable Integration', () => {
    it('should create runnable with retry logic', async () => {
      let attempts = 0;
      const mockRunnable = new RunnablePassthrough().pipe((input) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return `Success after ${attempts} attempts`;
      });

      const resilientRunnable = errorHandler.createRunnableWithRetry(mockRunnable, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      const result = await resilientRunnable.invoke('test input');

      expect(result).toBe('Success after 3 attempts');
      expect(attempts).toBe(3);
    });

    it('should create runnable with fallback chains', async () => {
      const primaryRunnable = new RunnablePassthrough().pipe(() => {
        throw new Error('Primary failed');
      });

      const fallback1 = new RunnablePassthrough().pipe(() => {
        throw new Error('Fallback 1 failed');
      });

      const fallback2 = new RunnablePassthrough().pipe(() => 'Fallback 2 success');

      const resilientRunnable = errorHandler.createRunnableWithFallbacks(primaryRunnable, [fallback1, fallback2]);

      const result = await resilientRunnable.invoke('test input');

      expect(result).toBe('Fallback 2 success');
    });

    it('should create runnable with circuit breaker', async () => {
      let calls = 0;
      const flakeyRunnable = new RunnablePassthrough().pipe(() => {
        calls++;
        if (calls <= 5) {
          throw new Error('Service unavailable');
        }
        return 'Service recovered';
      });

      const resilientRunnable = errorHandler.createRunnableWithCircuitBreaker(flakeyRunnable, 'test-service', {
        failureThreshold: 3,
        resetTimeoutMs: 100,
      });

      // First 3 calls should fail and open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await resilientRunnable.invoke('test');
        } catch {
          // Expected
        }
      }

      // Next call should fail immediately (circuit open)
      await expect(resilientRunnable.invoke('test')).rejects.toThrow(/Circuit breaker is open/);
      expect(calls).toBe(3); // No additional calls made

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Circuit should attempt recovery
      const result = await resilientRunnable.invoke('test');
      expect(result).toBe('Service recovered');
    });

    it('should create fully resilient runnable with all patterns', async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryRunnable = new RunnablePassthrough().pipe(() => {
        primaryCalls++;
        if (primaryCalls <= 2) {
          throw new Error('Temporary failure');
        }
        return 'Primary success';
      });

      const fallbackRunnable = new RunnablePassthrough().pipe(() => {
        fallbackCalls++;
        return 'Fallback success';
      });

      const resilientRunnable = errorHandler.createResilientRunnable(primaryRunnable, {
        retryConfig: {
          maxAttempts: 2,
          initialDelayMs: 10,
        },
        circuitBreakerKey: 'resilient-test',
        circuitBreakerConfig: {
          failureThreshold: 5,
        },
        fallbacks: [fallbackRunnable],
      });

      // First call should retry twice then use fallback
      const result1 = await resilientRunnable.invoke('test');
      expect(result1).toBe('Fallback success');
      expect(primaryCalls).toBe(2);
      expect(fallbackCalls).toBe(1);

      // Second call should succeed on primary (third attempt overall)
      const result2 = await resilientRunnable.invoke('test');
      expect(result2).toBe('Primary success');
      expect(primaryCalls).toBe(3);
    });
  });

  describe('Complex Chain Integration', () => {
    it('should handle complex LangChain sequences with error handling', async () => {
      const step1 = new RunnablePassthrough().pipe((input: string) => {
        if (input === 'fail') {
          throw new Error('Step 1 failed');
        }
        return `${input} -> step1`;
      });

      const step2 = new RunnablePassthrough().pipe((input: string) => {
        return `${input} -> step2`;
      });

      const step3 = new RunnablePassthrough().pipe((input: string) => {
        return `${input} -> step3`;
      });

      // Create resilient versions of each step
      const resilientStep1 = errorHandler.createRunnableWithRetry(step1, {
        maxAttempts: 2,
        initialDelayMs: 10,
      });

      const resilientStep2 = errorHandler.createRunnableWithFallbacks(step2, [new RunnablePassthrough().pipe(() => 'step2-fallback')]);

      const resilientStep3 = errorHandler.createRunnableWithCircuitBreaker(step3, 'step3-breaker', { failureThreshold: 3 });

      // Chain them together
      const chain = RunnableSequence.from([resilientStep1, resilientStep2, resilientStep3]);

      const result = await chain.invoke('test');
      expect(result).toBe('test -> step1 -> step2 -> step3');
    });
  });

  describe('Recovery Workflow Integration', () => {
    it('should integrate with recovery workflows', async () => {
      const recoveryExecuted = jest.fn();

      // Register a recovery workflow
      recoveryService.registerWorkflow({
        id: 'integration-recovery',
        name: 'Integration Recovery',
        description: 'Recovery for integration test',
        trigger: {
          errorCategories: [ErrorCategory.EXTERNAL],
          failureThreshold: 2,
          timeWindowMs: 1000,
        },
        steps: [
          {
            name: 'Reset state',
            description: 'Reset application state',
            action: recoveryExecuted,
          },
        ],
      });

      // Create a failing operation
      const failingOperation = jest.fn().mockRejectedValue(new Error('External service error'));

      // Execute with error handler (will record errors)
      for (let i = 0; i < 3; i++) {
        try {
          await errorHandler.handleWithRetry(failingOperation, {
            maxAttempts: 1,
          });
        } catch (error) {
          recoveryService.recordError(error as Error);
        }
      }

      // Give time for monitoring to potentially trigger workflow
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check metrics to ensure errors were recorded
      const metrics = errorHandler.getMetrics();
      expect(metrics.totalErrors).toBeGreaterThan(0);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track comprehensive metrics', async () => {
      // Successful operation
      await errorHandler.handleWithRetry(() => Promise.resolve('success'), { maxAttempts: 1 });

      // Retried operation
      let retryAttempts = 0;
      await errorHandler.handleWithRetry(
        () => {
          retryAttempts++;
          if (retryAttempts < 2) {
            throw new Error('Network error');
          }
          return Promise.resolve('success after retry');
        },
        { maxAttempts: 3, initialDelayMs: 10 },
      );

      // Fallback operation
      await errorHandler.handleWithFallback(() => Promise.reject(new Error('Primary failed')), {
        fallbacks: [() => Promise.resolve('fallback success')],
      });

      // Circuit breaker operation
      for (let i = 0; i < 6; i++) {
        try {
          await errorHandler.handleWithCircuitBreaker(() => Promise.reject(new Error('Service error')), { failureThreshold: 5 });
        } catch {
          // Expected
        }
      }

      const metrics = errorHandler.getMetrics();

      expect(metrics.totalErrors).toBeGreaterThan(0);
      expect(metrics.retryAttempts).toBeGreaterThan(0);
      expect(metrics.successfulRetries).toBe(1);
      expect(metrics.fallbackActivations).toBe(1);
      expect(metrics.circuitBreakerTrips).toBe(1);
      expect(metrics.errorsByCategory.size).toBeGreaterThan(0);
      expect(metrics.errorsBySeverity.size).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      // Generate some metrics
      await errorHandler.handleWithFallback(() => Promise.reject(new Error('Failed')), {
        fallbacks: [() => Promise.resolve('success')],
      });

      let metrics = errorHandler.getMetrics();
      expect(metrics.totalErrors).toBeGreaterThan(0);

      // Reset metrics
      errorHandler.resetMetrics();

      metrics = errorHandler.getMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.retryAttempts).toBe(0);
      expect(metrics.fallbackActivations).toBe(0);
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should manage circuit breakers', async () => {
      // Create multiple circuit breakers
      const breaker1 = errorHandler.createRunnableWithCircuitBreaker(
        new RunnablePassthrough().pipe(() => {
          throw new Error('Service 1 error');
        }),
        'service-1',
        { failureThreshold: 2 },
      );

      const breaker2 = errorHandler.createRunnableWithCircuitBreaker(
        new RunnablePassthrough().pipe(() => {
          throw new Error('Service 2 error');
        }),
        'service-2',
        { failureThreshold: 2 },
      );

      // Trigger failures to open breakers
      for (let i = 0; i < 2; i++) {
        try {
          await breaker1.invoke('test');
        } catch {
          // Expected
        }
        try {
          await breaker2.invoke('test');
        } catch {
          // Expected
        }
      }

      // Check circuit breaker status
      const status1 = errorHandler.getCircuitBreakerStatus('service-1');
      const status2 = errorHandler.getCircuitBreakerStatus('service-2');

      expect(status1?.state).toBe('open');
      expect(status2?.state).toBe('open');

      // Get all active breakers
      const activeBreakers = errorHandler.getActiveCircuitBreakers();
      expect(activeBreakers.size).toBe(2);

      // Reset one breaker
      errorHandler.resetCircuitBreaker('service-1');
      const statusAfterReset = errorHandler.getCircuitBreakerStatus('service-1');
      expect(statusAfterReset?.state).toBe('closed');

      // Reset all breakers
      errorHandler.resetAllCircuitBreakers();
      const activeBreakersFinal = errorHandler.getActiveCircuitBreakers();
      expect(activeBreakersFinal.size).toBe(0);
    });
  });
});
