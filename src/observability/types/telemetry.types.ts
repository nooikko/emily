import type { DiagLogLevel } from '@opentelemetry/api';

/**
 * OpenTelemetry configuration for the observability stack
 */
export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;

  // OTLP Exporter configuration
  otlp: {
    endpoint: string;
    protocol: 'http/protobuf' | 'grpc';
    headers?: Record<string, string>;
    compression?: 'gzip' | 'none';
  };

  // Resource attributes
  resource?: Record<string, string>;

  // Instrumentation options
  instrumentation: {
    http: boolean;
    express: boolean;
    nestjs: boolean;
    postgres: boolean;
    redis: boolean;
    langchain: boolean;
  };

  // Sampling configuration
  sampling: {
    tracesSampleRate: number;
    metricsSampleRate: number;
  };

  // Logging configuration
  logging: {
    level: DiagLogLevel;
    enableConsole: boolean;
    enableStructuredLogging: boolean;
  };
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  namespace: string;
  defaultLabels: Record<string, string>;
  exportInterval: number; // in milliseconds
}

/**
 * Custom span attributes for LangChain operations
 */
export interface LangChainSpanAttributes {
  readonly 'langchain.operation': string;
  readonly 'langchain.chain_type': string;
  readonly 'langchain.model_name': string;
  readonly 'langchain.model_provider': string;
  readonly 'langchain.token_count': number;
  readonly 'langchain.cost_estimate': number;
  readonly 'langchain.memory_type': string;
  readonly 'langchain.thread_id': string;
}

/**
 * Strongly typed operation types for better type safety
 */
export type LangChainOperation =
  | 'chain_invoke'
  | 'agent_execute'
  | 'llm_invoke'
  | 'memory_retrieve'
  | 'memory_store'
  | 'tool_execute'
  | 'embedding_generate'
  | 'document_process';

/**
 * Memory operation types
 */
export type MemoryOperationType = 'retrieve' | 'store' | 'search';

/**
 * Memory system types
 */
export type MemorySystemType = 'semantic' | 'checkpointer';

/**
 * AI model providers
 */
export type AIModelProvider = 'openai' | 'anthropic' | 'google' | 'meta' | 'local' | string;

/**
 * Document processing operations
 */
export type DocumentProcessingOperation = 'split' | 'embed' | 'store';

/**
 * Custom metrics for AI operations
 */
export interface AIMetrics {
  conversationCount: number;
  conversationDuration: number;
  tokensConsumed: number;
  memoryRetrievalLatency: number;
  memoryHitRate: number;
  personalityConsistencyScore: number;
  suggestionSuccessRate: number;
}

/**
 * Structured log context with better type constraints
 */
export interface LogContext {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly conversationId?: string;
  readonly threadId?: string;
  readonly operation?: LangChainOperation | string;
  readonly component?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Type-safe log entry for structured logging
 */
export interface TypedLogContext<T extends Record<string, unknown> = Record<string, unknown>> extends Omit<LogContext, 'metadata'> {
  readonly metadata?: T;
}

/**
 * Component health status
 */
interface ComponentHealthStatus {
  readonly enabled: boolean;
  readonly exporting: boolean;
  readonly lastExport?: number;
  readonly error?: string;
}

/**
 * Logging health status
 */
interface LoggingHealthStatus {
  readonly enabled: boolean;
  readonly structured: boolean;
  readonly level: string;
}

/**
 * Observability health status with strongly typed structure
 */
export interface ObservabilityHealth {
  readonly tracing: ComponentHealthStatus;
  readonly metrics: ComponentHealthStatus;
  readonly logging: LoggingHealthStatus;
}
