import { Injectable, Logger } from '@nestjs/common';
import { ErrorCategory, ErrorClassification, ErrorSeverity, RetryConfig } from '../interfaces/error-handling.interface';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly defaultConfig: Required<RetryConfig> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryIf: (error: Error) => this.isRetryableError(error),
    onRetry: (error: Error, attempt: number) => {
      this.logger.warn(`Retry attempt ${attempt}: ${error.message}`);
    },
  };

  async executeWithRetry<T>(operation: () => Promise<T>, config?: RetryConfig): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === finalConfig.maxAttempts) {
          this.logger.error(`All retry attempts exhausted after ${attempt} attempts`);
          throw lastError;
        }

        if (!finalConfig.retryIf(lastError)) {
          this.logger.debug(`Error is not retryable: ${lastError.message}`);
          throw lastError;
        }

        finalConfig.onRetry(lastError, attempt);

        const delay = this.calculateDelay(attempt, finalConfig.initialDelayMs, finalConfig.maxDelayMs, finalConfig.backoffMultiplier);

        this.logger.debug(`Waiting ${delay}ms before retry attempt ${attempt + 1}`);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Retry failed with unknown error');
  }

  private calculateDelay(attempt: number, initialDelay: number, maxDelay: number, multiplier: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = initialDelay * multiplier ** (attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5);
    return Math.min(jitteredDelay, maxDelay);
  }

  private isRetryableError(error: Error): boolean {
    const classification = this.classifyError(error);
    return classification.retryable;
  }

  classifyError(error: Error): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name?.toLowerCase() || '';

    // Network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout')
    ) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        fallbackEligible: true,
        requiresRecovery: false,
      };
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorName.includes('timeout')) {
      return {
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        fallbackEligible: true,
        requiresRecovery: false,
      };
    }

    // Rate limit errors
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests') || errorMessage.includes('429')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.LOW,
        retryable: true,
        fallbackEligible: false,
        requiresRecovery: false,
      };
    }

    // Authentication errors
    if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('authentication')
    ) {
      return {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        fallbackEligible: false,
        requiresRecovery: true,
      };
    }

    // Validation errors
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('bad request') ||
      errorMessage.includes('400')
    ) {
      return {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        retryable: false,
        fallbackEligible: false,
        requiresRecovery: false,
      };
    }

    // Resource errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('404') ||
      errorMessage.includes('resource') ||
      errorMessage.includes('memory') ||
      errorMessage.includes('disk')
    ) {
      return {
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        fallbackEligible: true,
        requiresRecovery: false,
      };
    }

    // Internal server errors
    if (errorMessage.includes('internal') || errorMessage.includes('500') || errorMessage.includes('server error')) {
      return {
        category: ErrorCategory.INTERNAL,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        fallbackEligible: true,
        requiresRecovery: true,
      };
    }

    // External service errors
    if (errorMessage.includes('external') || errorMessage.includes('third party') || errorMessage.includes('api error')) {
      return {
        category: ErrorCategory.EXTERNAL,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        fallbackEligible: true,
        requiresRecovery: false,
      };
    }

    // Unknown errors
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      fallbackEligible: true,
      requiresRecovery: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
