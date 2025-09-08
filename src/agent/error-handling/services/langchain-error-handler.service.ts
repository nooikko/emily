import { Runnable, RunnableConfig, RunnablePassthrough } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import {
  CircuitBreakerConfig,
  ErrorCategory,
  ErrorClassification,
  ErrorHandler,
  ErrorMetrics,
  ErrorSeverity,
  FallbackConfig,
  RetryConfig,
} from '../interfaces/error-handling.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryService } from './retry.service';

@Injectable()
export class LangChainErrorHandlerService implements ErrorHandler {
  private readonly logger = new Logger(LangChainErrorHandlerService.name);
  private metrics: ErrorMetrics = this.initializeMetrics();

  constructor(
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private initializeMetrics(): ErrorMetrics {
    return {
      totalErrors: 0,
      errorsByCategory: new Map<ErrorCategory, number>(),
      errorsBySeverity: new Map<ErrorSeverity, number>(),
      retryAttempts: 0,
      successfulRetries: 0,
      fallbackActivations: 0,
      circuitBreakerTrips: 0,
      recoveryExecutions: 0,
      averageRecoveryTime: 0,
    };
  }

  async handleWithRetry<T>(operation: () => Promise<T>, config?: RetryConfig): Promise<T> {
    const enhancedConfig: RetryConfig = {
      ...config,
      onRetry: (error: Error, attempt: number) => {
        this.metrics.retryAttempts++;
        this.recordError(error);
        config?.onRetry?.(error, attempt);
      },
    };

    try {
      const result = await this.retryService.executeWithRetry(operation, enhancedConfig);
      if (this.metrics.retryAttempts > 0) {
        this.metrics.successfulRetries++;
      }
      return result;
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  async handleWithCircuitBreaker<T>(operation: () => Promise<T>, config?: CircuitBreakerConfig): Promise<T> {
    const key = `cb_${Date.now()}_${Math.random()}`;
    const enhancedConfig: CircuitBreakerConfig = {
      ...config,
      onOpen: () => {
        this.metrics.circuitBreakerTrips++;
        config?.onOpen?.();
      },
    };

    try {
      return await this.circuitBreakerService.executeWithCircuitBreaker(key, operation, enhancedConfig);
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  async handleWithFallback<T>(operation: () => Promise<T>, config: FallbackConfig<T>): Promise<T> {
    const { fallbacks, shouldFallback, onFallback } = config;

    try {
      return await operation();
    } catch (primaryError) {
      const error = primaryError as Error;
      this.recordError(error);

      if (shouldFallback && !shouldFallback(error)) {
        throw error;
      }

      for (let i = 0; i < fallbacks.length; i++) {
        try {
          this.metrics.fallbackActivations++;
          onFallback?.(error, i);

          const fallback = fallbacks[i];
          if (typeof fallback === 'function') {
            return await fallback();
          }
          if (fallback && typeof fallback.invoke === 'function') {
            return await fallback.invoke({} as T);
          }

          throw new Error('Invalid fallback type');
        } catch (fallbackError) {
          this.logger.warn(`Fallback ${i} failed: ${(fallbackError as Error).message}`);
          if (i === fallbacks.length - 1) {
            throw fallbackError;
          }
        }
      }

      throw error;
    }
  }

  /**
   * Create a LangChain Runnable with retry logic
   */
  createRunnableWithRetry<T, U>(runnable: Runnable<T, U>, config?: RetryConfig): Runnable<T, U> {
    return new RunnablePassthrough<T>().pipe(async (input: T) => {
      return this.handleWithRetry(() => runnable.invoke(input), config);
    }) as Runnable<T, U>;
  }

  /**
   * Create a LangChain Runnable with fallback chains
   */
  createRunnableWithFallbacks<T, U>(primary: Runnable<T, U>, fallbacks: Runnable<T, U>[], config?: Partial<FallbackConfig<U>>): Runnable<T, U> {
    return new RunnablePassthrough<T>().pipe(async (input: T) => {
      return this.handleWithFallback(() => primary.invoke(input), {
        fallbacks: fallbacks.map((fb) => () => fb.invoke(input)),
        ...config,
      });
    }) as Runnable<T, U>;
  }

  /**
   * Create a LangChain Runnable with circuit breaker
   */
  createRunnableWithCircuitBreaker<T, U>(runnable: Runnable<T, U>, key: string, config?: CircuitBreakerConfig): Runnable<T, U> {
    return new RunnablePassthrough<T>().pipe(async (input: T) => {
      return this.circuitBreakerService.executeWithCircuitBreaker(key, () => runnable.invoke(input), config);
    }) as Runnable<T, U>;
  }

  /**
   * Combine retry, circuit breaker, and fallback patterns
   */
  createResilientRunnable<T, U>(
    primary: Runnable<T, U>,
    options: {
      retryConfig?: RetryConfig;
      circuitBreakerKey?: string;
      circuitBreakerConfig?: CircuitBreakerConfig;
      fallbacks?: Runnable<T, U>[];
      fallbackConfig?: Partial<FallbackConfig<U>>;
    },
  ): Runnable<T, U> {
    let runnable = primary;

    // Apply retry logic
    if (options.retryConfig) {
      runnable = this.createRunnableWithRetry(runnable, options.retryConfig);
    }

    // Apply circuit breaker
    if (options.circuitBreakerKey) {
      runnable = this.createRunnableWithCircuitBreaker(runnable, options.circuitBreakerKey, options.circuitBreakerConfig);
    }

    // Apply fallbacks
    if (options.fallbacks && options.fallbacks.length > 0) {
      runnable = this.createRunnableWithFallbacks(runnable, options.fallbacks, options.fallbackConfig);
    }

    return runnable;
  }

  classifyError(error: Error): ErrorClassification {
    return this.retryService.classifyError(error);
  }

  private recordError(error: Error): void {
    this.metrics.totalErrors++;

    const classification = this.classifyError(error);

    // Update category metrics
    const categoryCount = this.metrics.errorsByCategory.get(classification.category) || 0;
    this.metrics.errorsByCategory.set(classification.category, categoryCount + 1);

    // Update severity metrics
    const severityCount = this.metrics.errorsBySeverity.get(classification.severity) || 0;
    this.metrics.errorsBySeverity.set(classification.severity, severityCount + 1);
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(key: string) {
    return this.circuitBreakerService.getStatus(key);
  }

  /**
   * Get all active circuit breakers
   */
  getActiveCircuitBreakers() {
    return this.circuitBreakerService.getActiveBreakers();
  }

  /**
   * Reset a specific circuit breaker
   */
  resetCircuitBreaker(key: string): void {
    this.circuitBreakerService.reset(key);
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakerService.resetAll();
  }
}
