import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStatus } from '../interfaces/error-handling.interface';

interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
  config: Required<CircuitBreakerConfig>;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly defaultConfig: Required<CircuitBreakerConfig> = {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenRequests: 3,
    onOpen: () => this.logger.warn('Circuit breaker opened'),
    onClose: () => this.logger.log('Circuit breaker closed'),
    onHalfOpen: () => this.logger.log('Circuit breaker half-open'),
  };

  async executeWithCircuitBreaker<T>(key: string, operation: () => Promise<T>, config?: CircuitBreakerConfig): Promise<T> {
    const circuitBreaker = this.getOrCreateCircuitBreaker(key, config);

    // Check if circuit is open
    if (circuitBreaker.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset(circuitBreaker)) {
        this.transitionToHalfOpen(circuitBreaker);
      } else {
        const timeUntilRetry = circuitBreaker.nextRetryTime ? Math.max(0, circuitBreaker.nextRetryTime.getTime() - Date.now()) : 0;
        throw new Error(`Circuit breaker is open. Service unavailable. Retry in ${Math.ceil(timeUntilRetry / 1000)}s`);
      }
    }

    try {
      const result = await operation();
      this.recordSuccess(circuitBreaker);
      return result;
    } catch (error) {
      this.recordFailure(circuitBreaker);
      throw error;
    }
  }

  private getOrCreateCircuitBreaker(key: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.circuitBreakers.has(key)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      this.circuitBreakers.set(key, {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        config: finalConfig,
      });
    }
    return this.circuitBreakers.get(key)!;
  }

  private shouldAttemptReset(breaker: CircuitBreaker): boolean {
    if (!breaker.nextRetryTime) {
      return true;
    }
    return Date.now() >= breaker.nextRetryTime.getTime();
  }

  private transitionToHalfOpen(breaker: CircuitBreaker): void {
    this.logger.debug('Circuit breaker transitioning to half-open');
    breaker.state = CircuitBreakerState.HALF_OPEN;
    breaker.successCount = 0;
    breaker.failureCount = 0;
    breaker.config.onHalfOpen();
  }

  private recordSuccess(breaker: CircuitBreaker): void {
    breaker.successCount++;

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      if (breaker.successCount >= breaker.config.halfOpenRequests) {
        this.transitionToClosed(breaker);
      }
    } else if (breaker.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on successful request in closed state
      breaker.failureCount = 0;
    }
  }

  private recordFailure(breaker: CircuitBreaker): void {
    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen(breaker);
    } else if (breaker.state === CircuitBreakerState.CLOSED && breaker.failureCount >= breaker.config.failureThreshold) {
      this.transitionToOpen(breaker);
    }
  }

  private transitionToOpen(breaker: CircuitBreaker): void {
    this.logger.warn(`Circuit breaker opened after ${breaker.failureCount} failures`);
    breaker.state = CircuitBreakerState.OPEN;
    breaker.nextRetryTime = new Date(Date.now() + breaker.config.resetTimeoutMs);
    breaker.config.onOpen();
  }

  private transitionToClosed(breaker: CircuitBreaker): void {
    this.logger.log('Circuit breaker closed after successful recovery');
    breaker.state = CircuitBreakerState.CLOSED;
    breaker.failureCount = 0;
    breaker.successCount = 0;
    breaker.lastFailureTime = undefined;
    breaker.nextRetryTime = undefined;
    breaker.config.onClose();
  }

  getStatus(key: string): CircuitBreakerStatus | null {
    const breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      return null;
    }

    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      successCount: breaker.successCount,
      lastFailureTime: breaker.lastFailureTime,
      nextRetryTime: breaker.nextRetryTime,
    };
  }

  reset(key: string): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      this.transitionToClosed(breaker);
    }
  }

  resetAll(): void {
    for (const [key] of this.circuitBreakers) {
      this.reset(key);
    }
  }

  getActiveBreakers(): Map<string, CircuitBreakerStatus> {
    const activeBreakers = new Map<string, CircuitBreakerStatus>();

    for (const [key, breaker] of this.circuitBreakers) {
      if (breaker.state !== CircuitBreakerState.CLOSED) {
        activeBreakers.set(key, {
          state: breaker.state,
          failureCount: breaker.failureCount,
          successCount: breaker.successCount,
          lastFailureTime: breaker.lastFailureTime,
          nextRetryTime: breaker.nextRetryTime,
        });
      }
    }

    return activeBreakers;
  }
}
