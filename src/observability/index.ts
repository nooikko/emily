// Main module

// Configuration
export { createTelemetryConfig, defaultMetricsConfig } from './config/telemetry.config';
export type {
  MetricOptions,
  MetricType,
} from './decorators/metric.decorator';
export {
  Metric,
  MetricAI,
  MetricConversation,
  MetricMemory,
  MetricsCollector,
} from './decorators/metric.decorator';
// Decorator types
export type { TraceOptions } from './decorators/trace.decorator';
// Decorators
export {
  addSpanAttribute,
  addSpanAttributes,
  addSpanEvent,
  createChildSpan,
  setSpanStatus,
  Trace,
  TraceAI,
  TraceDB,
  TraceHTTP,
} from './decorators/trace.decorator';
export { ObservabilityModule } from './observability.module';
export { AIMetricsService } from './services/ai-metrics.service';
export { LangChainInstrumentationService } from './services/langchain-instrumentation.service';
export { LogLevel, StructuredLoggerService } from './services/structured-logger.service';
// Services
export { TelemetryService } from './services/telemetry.service';
// Types
export type {
  AIMetrics,
  AIModelProvider,
  DocumentProcessingOperation,
  LangChainOperation,
  LangChainSpanAttributes,
  LogContext,
  MemoryOperationType,
  MemorySystemType,
  MetricsConfig,
  ObservabilityHealth,
  TelemetryConfig,
  TypedLogContext,
} from './types/telemetry.types';
