import { Attributes, AttributeValue, Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Type guard to check if a value is an Error
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if a value has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string';
}

/**
 * Convert unknown attributes to OpenTelemetry AttributeValue format
 */
function toAttributes(attrs: Record<string, unknown> | undefined): Attributes | undefined {
  if (!attrs) {
    return undefined;
  }

  const result: Attributes = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value as AttributeValue;
    } else if (Array.isArray(value)) {
      // Convert arrays to comma-separated strings
      result[key] = value.map((v) => String(v)).join(',');
    } else {
      // Convert other types to strings
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * Options for the @Trace decorator
 */
export interface TraceOptions {
  /** Custom span name (defaults to className.methodName) */
  name?: string;
  /** Span kind (defaults to SpanKind.INTERNAL) */
  kind?: SpanKind;
  /** Additional attributes to add to the span */
  attributes?: Record<string, string | number | boolean>;
  /** Whether to record exceptions as span events */
  recordException?: boolean;
  /** Whether to set span status to ERROR on exception */
  setStatusOnException?: boolean;
}

/**
 * Decorator that creates an OpenTelemetry span for method execution
 *
 * @param options - Configuration options for the span
 *
 * Usage:
 * ```typescript
 * @Trace({ name: 'custom-operation', attributes: { 'operation.type': 'ai' } })
 * async performOperation(input: string): Promise<string> {
 *   // Method implementation
 * }
 * ```
 */
export function Trace(options: TraceOptions = {}): MethodDecorator {
  return function (target: object, propertyName: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyName);

    const {
      name = `${className}.${methodName}`,
      kind = SpanKind.INTERNAL,
      attributes = {},
      recordException = true,
      setStatusOnException = true,
    } = options;

    // Check if the original method is async
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
      descriptor.value = async function (this: unknown, ...args: unknown[]) {
        const tracer = trace.getTracer('emily-observability', '1.0.0');

        return tracer.startActiveSpan(name, { kind, attributes }, async (span: Span) => {
          try {
            // Add method-specific attributes
            span.setAttributes({
              'code.function': methodName,
              'code.namespace': className,
              'code.filepath': target.constructor.name,
              ...attributes,
            });

            // Execute the original method
            const result = await originalMethod.apply(this, args);

            // Set successful status
            span.setStatus({ code: SpanStatusCode.OK });

            return result;
          } catch (error: unknown) {
            // Handle exception with proper type checking
            if (recordException && isError(error)) {
              span.recordException(error);
            }

            if (setStatusOnException) {
              const message = isError(error) ? error.message : hasMessage(error) ? error.message : 'Unknown error';
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message,
              });
            }

            // Re-throw the error
            throw error;
          } finally {
            span.end();
          }
        });
      };
    } else {
      // Handle synchronous methods
      descriptor.value = function (this: unknown, ...args: unknown[]) {
        const tracer = trace.getTracer('emily-observability', '1.0.0');
        const span = tracer.startSpan(name, { kind, attributes });

        try {
          // Add method-specific attributes
          span.setAttributes({
            'code.function': methodName,
            'code.namespace': className,
            'code.filepath': target.constructor.name,
            ...attributes,
          });

          // Execute the original method synchronously
          const result = originalMethod.apply(this, args);

          // Set successful status
          span.setStatus({ code: SpanStatusCode.OK });

          return result;
        } catch (error: unknown) {
          // Handle exception with proper type checking
          if (recordException && isError(error)) {
            span.recordException(error);
          }

          if (setStatusOnException) {
            const message = isError(error) ? error.message : hasMessage(error) ? error.message : 'Unknown error';
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message,
            });
          }

          // Re-throw the error
          throw error;
        } finally {
          span.end();
        }
      };
    }

    // Preserve original method metadata
    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      configurable: true,
    });

    return descriptor;
  };
}

/**
 * Specialized decorator for tracing HTTP operations
 */
export function TraceHTTP(options: Partial<TraceOptions> = {}): MethodDecorator {
  return Trace({
    ...options,
    kind: SpanKind.CLIENT,
    attributes: {
      ...(options.attributes || {}),
    },
  });
}

/**
 * Specialized decorator for tracing database operations
 */
export function TraceDB(options: Partial<TraceOptions> & { dbSystem?: string; dbName?: string } = {}): MethodDecorator {
  const { dbSystem, dbName, ...traceOptions } = options;

  return Trace({
    ...traceOptions,
    kind: SpanKind.CLIENT,
    attributes: {
      ...(traceOptions.attributes || {}),
      ...(dbSystem && { 'db.system': dbSystem }),
      ...(dbName && { 'db.name': dbName }),
    },
  });
}

/**
 * Specialized decorator for tracing AI/LLM operations
 */
export function TraceAI(
  options: Partial<TraceOptions> & {
    modelProvider?: string;
    modelName?: string;
    operation?: string;
  } = {},
): MethodDecorator {
  const { modelProvider, modelName, operation, ...traceOptions } = options;

  return Trace({
    ...traceOptions,
    kind: SpanKind.CLIENT,
    attributes: {
      ...(traceOptions.attributes || {}),
      'ai.system': 'langchain',
      ...(modelProvider && { 'ai.model.provider': modelProvider }),
      ...(modelName && { 'ai.model.name': modelName }),
      ...(operation && { 'ai.operation': operation }),
    },
  });
}

/**
 * Utility function to add single attribute to current span with type safety
 */
export function addSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Utility function to add multiple attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Utility function to record an event on the current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Utility function to set span status
 */
export function setSpanStatus(code: SpanStatusCode, message?: string): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setStatus({ code, message });
  }
}

/**
 * Utility function to create a child span manually
 */
export function createChildSpan(name: string, options: { attributes?: Record<string, unknown>; kind?: SpanKind } = {}): Span {
  const tracer = trace.getTracer('emily-observability', '1.0.0');
  return tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: toAttributes(options.attributes),
  });
}
