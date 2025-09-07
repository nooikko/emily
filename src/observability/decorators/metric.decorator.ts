import { Histogram, Meter, metrics, UpDownCounter } from '@opentelemetry/api';

/**
 * Metric label value types
 */
export type MetricLabelValue = string | number | boolean;

/**
 * Options for the @Metric decorator with improved type safety
 */
export interface MetricOptions {
  /** Custom metric name (defaults to className.methodName) */
  readonly name?: string;
  /** Metric description */
  readonly description?: string;
  /** Metric unit */
  readonly unit?: string;
  /** Additional labels to add to the metric */
  readonly labels?: Record<string, MetricLabelValue>;
  /** Whether to measure execution duration */
  readonly measureDuration?: boolean;
  /** Whether to count invocations */
  readonly countInvocations?: boolean;
  /** Whether to track success/failure rates */
  readonly trackSuccessRate?: boolean;
}

/**
 * Method signature constraint for metric-decorated methods
 */

/**
 * Metric type definitions
 */
export type MetricType = 'counter' | 'histogram' | 'upDownCounter';

/**
 * Decorator that creates metrics for method execution
 *
 * @param options - Configuration options for the metrics
 *
 * Usage:
 * ```typescript
 * @Metric({ measureDuration: true, countInvocations: true })
 * async performOperation(input: string): Promise<string> {
 *   // Method implementation
 * }
 * ```
 */
/**
 * Type-safe metric decorator with proper method signature preservation
 */
export function Metric(options: MetricOptions = {}): MethodDecorator {
  return function (target: object, propertyName: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor | undefined {
    if (!descriptor?.value) {
      throw new TypeError('Metric decorator can only be applied to methods');
    }

    const originalMethod = descriptor.value;
    const className = (target.constructor as { name: string }).name;
    const methodName = String(propertyName);

    const {
      name = `emily_${className.toLowerCase()}_${methodName}`,
      description = `Metrics for ${className}.${methodName}`,
      labels = {},
      measureDuration = true,
      countInvocations = false,
      trackSuccessRate = false,
    } = options;

    const meter = metrics.getMeter('emily-metrics', '1.0.0');

    // Create metrics instances with proper type safety
    const durationHistogram = measureDuration
      ? meter.createHistogram(`${name}_duration`, {
          description: `${description} - execution duration`,
          unit: 'ms',
        })
      : null;

    const invocationCounter = countInvocations
      ? meter.createCounter(`${name}_invocations`, {
          description: `${description} - invocation count`,
        })
      : null;

    const successCounter = trackSuccessRate
      ? meter.createCounter(`${name}_operations`, {
          description: `${description} - success/failure count`,
        })
      : null;

    const metricMethod = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const startTime = measureDuration ? Date.now() : 0;
      const baseLabels: Record<string, MetricLabelValue> = {
        class: className,
        method: methodName,
        ...labels,
      };

      try {
        // Count invocation
        if (invocationCounter) {
          invocationCounter.add(1, baseLabels);
        }

        // Execute the original method
        const result = await originalMethod.apply(this, args);

        // Record success
        if (successCounter) {
          successCounter.add(1, { ...baseLabels, status: 'success' });
        }

        return result;
      } catch (error: unknown) {
        // Record failure with proper error type handling
        if (successCounter) {
          const errorType = error instanceof Error ? error.constructor.name : typeof error === 'string' ? 'StringError' : 'Unknown';

          successCounter.add(1, {
            ...baseLabels,
            status: 'error',
            error_type: errorType,
          });
        }

        throw error;
      } finally {
        // Record duration
        if (durationHistogram && measureDuration) {
          const duration = Date.now() - startTime;
          durationHistogram.record(duration, baseLabels);
        }
      }
    };

    // Preserve original method metadata
    Object.defineProperty(metricMethod, 'name', {
      value: originalMethod.name,
      configurable: true,
    });

    descriptor.value = metricMethod;
    return descriptor;
  };
}

/**
 * Specialized decorator for AI operation metrics
 */
export function MetricAI(
  options: Partial<MetricOptions> & {
    modelProvider?: string;
    modelName?: string;
    operation?: string;
  } = {},
): MethodDecorator {
  const { modelProvider, modelName, operation, ...metricOptions } = options;

  return Metric({
    ...metricOptions,
    labels: {
      ...(metricOptions.labels || {}),
      ...(modelProvider && { model_provider: modelProvider }),
      ...(modelName && { model_name: modelName }),
      ...(operation && { ai_operation: operation }),
    },
    measureDuration: metricOptions.measureDuration ?? true,
    trackSuccessRate: metricOptions.trackSuccessRate ?? true,
  });
}

/**
 * Specialized decorator for memory operation metrics
 */
export function MetricMemory(
  options: Partial<MetricOptions> & {
    memoryType?: string;
    operation?: string;
  } = {},
): MethodDecorator {
  const { memoryType, operation, ...metricOptions } = options;

  return Metric({
    ...metricOptions,
    labels: {
      ...(metricOptions.labels || {}),
      ...(memoryType && { memory_type: memoryType }),
      ...(operation && { memory_operation: operation }),
    },
    measureDuration: metricOptions.measureDuration ?? true,
    trackSuccessRate: metricOptions.trackSuccessRate ?? true,
  });
}

/**
 * Specialized decorator for conversation metrics
 */
export function MetricConversation(
  options: Partial<MetricOptions> & {
    conversationType?: string;
  } = {},
): MethodDecorator {
  const { conversationType, ...metricOptions } = options;

  return Metric({
    ...metricOptions,
    labels: {
      ...(metricOptions.labels || {}),
      ...(conversationType && { conversation_type: conversationType }),
    },
    measureDuration: metricOptions.measureDuration ?? true,
    countInvocations: metricOptions.countInvocations ?? true,
    trackSuccessRate: metricOptions.trackSuccessRate ?? true,
  });
}

/**
 * Manual metrics recording utilities
 */
export class MetricsCollector {
  private static _meter: Meter | undefined;

  private static get meter(): Meter {
    if (!MetricsCollector._meter) {
      MetricsCollector._meter = metrics.getMeter('emily-manual-metrics', '1.0.0');
    }
    return MetricsCollector._meter;
  }

  // Predefined metrics for common operations - lazy initialization
  private static _tokenConsumptionHistogram: Histogram | undefined;
  private static _memoryRetrievalHistogram: Histogram | undefined;
  private static _conversationGauge: UpDownCounter | undefined;

  private static get tokenConsumptionHistogram(): Histogram {
    if (!MetricsCollector._tokenConsumptionHistogram) {
      MetricsCollector._tokenConsumptionHistogram = MetricsCollector.meter.createHistogram('emily_ai_tokens_consumed', {
        description: 'Number of tokens consumed by AI operations',
        unit: 'tokens',
      });
    }
    return MetricsCollector._tokenConsumptionHistogram;
  }

  private static get memoryRetrievalHistogram(): Histogram {
    if (!MetricsCollector._memoryRetrievalHistogram) {
      MetricsCollector._memoryRetrievalHistogram = MetricsCollector.meter.createHistogram('emily_memory_retrieval_duration', {
        description: 'Time taken to retrieve memories',
        unit: 'ms',
      });
    }
    return MetricsCollector._memoryRetrievalHistogram;
  }

  private static get conversationGauge(): UpDownCounter {
    if (!MetricsCollector._conversationGauge) {
      MetricsCollector._conversationGauge = MetricsCollector.meter.createUpDownCounter('emily_active_conversations', {
        description: 'Number of active conversations',
      });
    }
    return MetricsCollector._conversationGauge;
  }

  /**
   * Records token consumption for AI operations with type safety
   */
  static recordTokenConsumption(tokens: number, labels: Record<string, MetricLabelValue> = {}): void {
    MetricsCollector.tokenConsumptionHistogram.record(tokens, labels);
  }

  /**
   * Records memory retrieval performance with type safety
   */
  static recordMemoryRetrieval(duration: number, hitRate: number, labels: Record<string, MetricLabelValue> = {}): void {
    MetricsCollector.memoryRetrievalHistogram.record(duration, {
      ...labels,
      hit_rate: hitRate,
    });
  }

  /**
   * Updates active conversation count with type safety
   */
  static updateActiveConversations(delta: number, labels: Record<string, MetricLabelValue> = {}): void {
    MetricsCollector.conversationGauge.add(delta, labels);
  }

  /**
   * Records a custom histogram metric with type safety
   */
  static recordHistogram(
    name: string,
    value: number,
    options: {
      readonly description?: string;
      readonly unit?: string;
      readonly labels?: Record<string, MetricLabelValue>;
    } = {},
  ): void {
    const histogram = MetricsCollector.meter.createHistogram(name, {
      description: options.description || name,
      unit: options.unit || '',
    });
    histogram.record(value, options.labels || {});
  }

  /**
   * Increments a custom counter metric with type safety
   */
  static incrementCounter(
    name: string,
    value = 1,
    options: {
      readonly description?: string;
      readonly labels?: Record<string, MetricLabelValue>;
    } = {},
  ): void {
    const counter = MetricsCollector.meter.createCounter(name, {
      description: options.description || name,
    });
    counter.add(value, options.labels || {});
  }

  /**
   * Updates a custom gauge metric with type safety
   */
  static updateGauge(
    name: string,
    value: number,
    options: {
      readonly description?: string;
      readonly labels?: Record<string, MetricLabelValue>;
    } = {},
  ): void {
    const gauge = MetricsCollector.meter.createUpDownCounter(name, {
      description: options.description || name,
    });
    gauge.add(value, options.labels || {});
  }
}
