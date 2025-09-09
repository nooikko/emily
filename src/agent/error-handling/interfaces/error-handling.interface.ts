import { Runnable } from '@langchain/core/runnables';

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryIf?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenRequests?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

export interface FallbackConfig<TInput = unknown, TOutput = unknown> {
  fallbacks: Array<Runnable<TInput, TOutput> | (() => Promise<TOutput>)>;
  shouldFallback?: (error: Error) => boolean;
  onFallback?: (error: Error, fallbackIndex: number) => void;
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  fallbackEligible: boolean;
  requiresRecovery: boolean;
}

export enum ErrorCategory {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  RESOURCE = 'resource',
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  execute: () => Promise<void>;
  validateRecovery: () => Promise<boolean>;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Map<ErrorCategory, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  retryAttempts: number;
  successfulRetries: number;
  fallbackActivations: number;
  circuitBreakerTrips: number;
  recoveryExecutions: number;
  averageRecoveryTime: number;
}

export interface ErrorHandler {
  handleWithRetry<T>(operation: () => Promise<T>, config?: RetryConfig): Promise<T>;

  handleWithCircuitBreaker<T>(operation: () => Promise<T>, config?: CircuitBreakerConfig): Promise<T>;

  handleWithFallback<TInput, TOutput>(operation: () => Promise<TOutput>, config: FallbackConfig<TInput, TOutput>): Promise<TOutput>;

  classifyError(error: Error): ErrorClassification;

  getMetrics(): ErrorMetrics;

  resetMetrics(): void;
}
