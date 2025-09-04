/**
 * LangSmith configuration interface for centralized logging setup.
 * Provides type-safe configuration for LangSmith tracing and observability.
 */
export interface LangSmithConfig {
  /** LangSmith API key for authentication */
  apiKey: string;

  /** Enable/disable LangSmith tracing */
  tracingEnabled: boolean;

  /** LangSmith project name for organizing traces */
  projectName: string;

  /** LangSmith API endpoint (cloud or self-hosted) */
  endpoint?: string;

  /** Enable background callbacks for better performance in non-serverless environments */
  backgroundCallbacks: boolean;

  /** Hide sensitive inputs in traces for production security */
  hideInputs: boolean;

  /** Hide sensitive outputs in traces for production security */
  hideOutputs: boolean;

  /** Additional metadata to include with all traces */
  defaultMetadata?: Record<string, unknown>;

  /** Regex patterns for masking sensitive data */
  maskingPatterns?: Record<string, string>;
}

/**
 * Environment variables used for LangSmith configuration
 */
export interface LangSmithEnvironment {
  LANGSMITH_API_KEY?: string;
  LANGSMITH_TRACING?: string;
  LANGCHAIN_PROJECT?: string;
  LANGSMITH_ENDPOINT?: string;
  LANGCHAIN_CALLBACKS_BACKGROUND?: string;
  LANGSMITH_HIDE_INPUTS?: string;
  LANGSMITH_HIDE_OUTPUTS?: string;
  NODE_ENV?: string;
}

/**
 * Health check status for LangSmith service
 */
export interface LangSmithHealthStatus {
  connected: boolean;
  endpoint: string;
  lastChecked: number;
  error?: string;
}
