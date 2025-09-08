import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCategory, ErrorSeverity } from '../interfaces/error-handling.interface';
import { RetryService } from '../services/retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryService],
    }).compile();

    service = module.get<RetryService>(RetryService);
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await service.executeWithRetry(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const result = await service.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts exhausted', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        service.executeWithRetry(mockOperation, {
          maxAttempts: 2,
          initialDelayMs: 10,
        }),
      ).rejects.toThrow('Network error');

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Validation failed'));

      await expect(
        service.executeWithRetry(mockOperation, {
          maxAttempts: 3,
          initialDelayMs: 10,
        }),
      ).rejects.toThrow('Validation failed');

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff with jitter', async () => {
      const delays: number[] = [];
      const startTimes: number[] = [];

      const mockOperation = jest.fn().mockImplementation(() => {
        startTimes.push(Date.now());
        return Promise.reject(new Error('Network error'));
      });

      try {
        await service.executeWithRetry(mockOperation, {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
        });
      } catch {
        // Expected to fail
      }

      // Calculate actual delays
      for (let i = 1; i < startTimes.length; i++) {
        delays.push(startTimes[i] - startTimes[i - 1]);
      }

      // First retry should be around 100ms (with jitter)
      expect(delays[0]).toBeGreaterThanOrEqual(50);
      expect(delays[0]).toBeLessThanOrEqual(150);

      // Second retry should be around 200ms (with jitter)
      expect(delays[1]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeLessThanOrEqual(300);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const mockOperation = jest.fn().mockRejectedValueOnce(new Error('Network error')).mockResolvedValue('success');

      await service.executeWithRetry(mockOperation, {
        maxAttempts: 2,
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ message: 'Network error' }), 1);
    });
  });

  describe('classifyError', () => {
    it('should classify network errors correctly', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.NETWORK);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.fallbackEligible).toBe(true);
    });

    it('should classify timeout errors correctly', () => {
      const error = new Error('Request timeout after 30000ms');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.fallbackEligible).toBe(true);
    });

    it('should classify rate limit errors correctly', () => {
      const error = new Error('429 Too Many Requests');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classification.severity).toBe(ErrorSeverity.LOW);
      expect(classification.retryable).toBe(true);
      expect(classification.fallbackEligible).toBe(false);
    });

    it('should classify authentication errors correctly', () => {
      const error = new Error('401 Unauthorized');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classification.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.retryable).toBe(false);
      expect(classification.requiresRecovery).toBe(true);
    });

    it('should classify validation errors correctly', () => {
      const error = new Error('Invalid request: missing required field');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.VALIDATION);
      expect(classification.severity).toBe(ErrorSeverity.LOW);
      expect(classification.retryable).toBe(false);
      expect(classification.fallbackEligible).toBe(false);
    });

    it('should classify unknown errors with default behavior', () => {
      const error = new Error('Something went wrong');
      const classification = service.classifyError(error);

      expect(classification.category).toBe(ErrorCategory.UNKNOWN);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.fallbackEligible).toBe(true);
    });
  });
});
