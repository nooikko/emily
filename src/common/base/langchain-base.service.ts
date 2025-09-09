import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { RunnableLambda } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { CallbackManagerService } from '../../agent/callbacks/callback-manager.service';
import { LangSmithService } from '../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../observability/services/langchain-instrumentation.service';

/**
 * Base service class that all LangChain-integrated services should extend.
 * Provides common LangChain patterns, callbacks, and observability integration.
 */
@Injectable()
export abstract class LangChainBaseService {
  protected readonly logger: Logger;
  protected callbackManager?: CallbackManager;
  protected callbacks: BaseCallbackHandler[] = [];

  constructor(
    protected readonly serviceName: string,
    protected readonly callbackManagerService?: CallbackManagerService,
    protected readonly langsmithService?: LangSmithService,
    protected readonly metricsService?: AIMetricsService,
    protected readonly instrumentationService?: LangChainInstrumentationService,
  ) {
    this.logger = new Logger(serviceName);
    this.initializeCallbacks();
  }

  /**
   * Initialize callbacks for this service
   */
  protected initializeCallbacks(): void {
    if (this.callbackManagerService) {
      this.callbackManager = this.callbackManagerService.createCallbackManager(this.serviceName, { service: this.serviceName });
      this.callbacks = this.callbackManager.handlers;
    }
  }

  /**
   * Create a runnable configuration with callbacks and metadata
   */
  protected createRunnableConfig(additionalMetadata: Record<string, any> = {}, additionalCallbacks: BaseCallbackHandler[] = []): RunnableConfig {
    const config: RunnableConfig = {
      metadata: {
        service: this.serviceName,
        timestamp: Date.now(),
        ...additionalMetadata,
      },
    };

    if (this.callbacks.length > 0 || additionalCallbacks.length > 0) {
      config.callbacks = [...this.callbacks, ...additionalCallbacks];
    }

    // CallbackManager is handled through callbacks array

    return config;
  }

  /**
   * Create a traced runnable that automatically includes observability
   */
  protected createTracedRunnable<TInput, TOutput>(
    name: string,
    fn: (input: TInput) => Promise<TOutput>,
    metadata: Record<string, any> = {},
  ): Runnable<TInput, TOutput> {
    return new RunnableLambda({
      func: async (input: TInput) => {
        const startTime = Date.now();

        // Start instrumentation span
        if (this.instrumentationService) {
          this.instrumentationService.startSpan(`${this.serviceName}.${name}`, metadata);
        }

        try {
          // Execute function with tracing
          const result = await this.traceExecution(name, fn, input, metadata);

          // Track success metrics
          if (this.metricsService) {
            this.metricsService.recordOperationDuration(this.serviceName, name, Date.now() - startTime, 'success');
          }

          return result;
        } catch (error) {
          // Track error metrics
          if (this.metricsService) {
            this.metricsService.recordOperationDuration(this.serviceName, name, Date.now() - startTime, 'error');
          }

          // End span with error
          if (this.instrumentationService) {
            this.instrumentationService.endSpan(`${this.serviceName}.${name}`, { error: true });
          }

          throw error;
        } finally {
          // End instrumentation span
          if (this.instrumentationService) {
            this.instrumentationService.endSpan(`${this.serviceName}.${name}`);
          }
        }
      },
    }).withConfig(this.createRunnableConfig(metadata));
  }

  /**
   * Trace execution with LangSmith if available
   */
  protected async traceExecution<TInput, TOutput>(
    operationName: string,
    fn: (input: TInput) => Promise<TOutput>,
    input: TInput,
    metadata: Record<string, any> = {},
  ): Promise<TOutput> {
    if (this.langsmithService?.isEnabled()) {
      // Use LangSmith tracing
      const tracedFn = this.langsmithService.createTraceable(`${this.serviceName}.${operationName}`, fn, metadata);
      return tracedFn(input);
    }

    // Execute without tracing
    return fn(input);
  }

  /**
   * Create a passthrough runnable with logging
   */
  protected createLoggingPassthrough<T>(logMessage: string, level: 'debug' | 'verbose' | 'log' = 'debug'): Runnable<T, T> {
    return new RunnableLambda({
      func: (input: T) => {
        this.logger[level](logMessage, { input });
        return input;
      },
    });
  }

  /**
   * Create a conditional runnable
   */
  protected createConditionalRunnable<TInput, TOutput>(
    condition: (input: TInput) => boolean,
    ifTrue: Runnable<TInput, TOutput>,
    ifFalse: Runnable<TInput, TOutput>,
  ): Runnable<TInput, TOutput> {
    return new RunnableLambda({
      func: async (input: TInput) => {
        const runnable = condition(input) ? ifTrue : ifFalse;
        return runnable.invoke(input, this.createRunnableConfig());
      },
    });
  }

  /**
   * Create a retry runnable with exponential backoff
   */
  protected createRetryRunnable<TInput, TOutput>(runnable: Runnable<TInput, TOutput>, maxRetries = 3, baseDelay = 1000): Runnable<TInput, TOutput> {
    return new RunnableLambda({
      func: async (input: TInput) => {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await runnable.invoke(input, this.createRunnableConfig());
          } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries) {
              const delay = baseDelay * 2 ** attempt;
              this.logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, { error: error.message });
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError || new Error('Max retries exceeded');
      },
    });
  }

  /**
   * Log method execution with metadata
   */
  protected logExecution(methodName: string, metadata: Record<string, any> = {}, level: 'debug' | 'verbose' | 'log' = 'debug'): void {
    this.logger[level](`Executing ${methodName}`, metadata);
  }

  /**
   * Get the current callback configuration
   */
  protected getCallbackConfig(): Partial<RunnableConfig> {
    return {
      callbacks: this.callbacks,
    };
  }

  /**
   * Cleanup resources on service destroy
   */
  protected onModuleDestroy(): void {
    if (this.callbackManagerService && this.serviceName) {
      this.callbackManagerService.removeHandler(this.serviceName);
    }
  }
}
