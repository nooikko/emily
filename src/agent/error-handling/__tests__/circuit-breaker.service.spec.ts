import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerState } from '../interfaces/error-handling.interface';
import { CircuitBreakerService } from '../services/circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    service.resetAll();
  });

  describe('executeWithCircuitBreaker', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await service.executeWithCircuitBreaker('test-key', mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);

      const status = service.getStatus('test-key');
      expect(status?.state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Fail up to threshold
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithCircuitBreaker('test-key', mockOperation, { failureThreshold: 5 });
        } catch {
          // Expected to fail
        }
      }

      const status = service.getStatus('test-key');
      expect(status?.state).toBe(CircuitBreakerState.OPEN);
      expect(status?.failureCount).toBe(5);
    });

    it('should reject calls when circuit is open', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithCircuitBreaker('test-key', mockOperation, { failureThreshold: 5, resetTimeoutMs: 60000 });
        } catch {
          // Expected
        }
      }

      // Try to call when open
      mockOperation.mockClear();

      await expect(service.executeWithCircuitBreaker('test-key', mockOperation)).rejects.toThrow(/Circuit breaker is open/);

      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after reset timeout', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit with short reset timeout
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithCircuitBreaker('test-key-timeout', mockOperation, { failureThreshold: 5, resetTimeoutMs: 100 });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should attempt execution in half-open state
      mockOperation.mockClear().mockResolvedValue('recovered');

      const result = await service.executeWithCircuitBreaker('test-key-timeout', mockOperation);

      expect(result).toBe('recovered');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should close circuit after successful requests in half-open state', async () => {
      const mockOperation = jest.fn();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        mockOperation.mockRejectedValueOnce(new Error('Service error'));
        try {
          await service.executeWithCircuitBreaker('test-key-recovery', mockOperation, {
            failureThreshold: 5,
            resetTimeoutMs: 100,
            halfOpenRequests: 3,
          });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Successful requests in half-open state
      mockOperation.mockResolvedValue('success');

      for (let i = 0; i < 3; i++) {
        await service.executeWithCircuitBreaker('test-key-recovery', mockOperation);
      }

      const status = service.getStatus('test-key-recovery');
      expect(status?.state).toBe(CircuitBreakerState.CLOSED);
      expect(status?.failureCount).toBe(0);
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const mockOperation = jest.fn();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        mockOperation.mockRejectedValueOnce(new Error('Service error'));
        try {
          await service.executeWithCircuitBreaker('test-key-reopen', mockOperation, { failureThreshold: 5, resetTimeoutMs: 100 });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Fail in half-open state
      mockOperation.mockRejectedValueOnce(new Error('Still failing'));

      try {
        await service.executeWithCircuitBreaker('test-key-reopen', mockOperation);
      } catch {
        // Expected
      }

      const status = service.getStatus('test-key-reopen');
      expect(status?.state).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to closed state', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithCircuitBreaker('test-reset', mockOperation, { failureThreshold: 5 });
        } catch {
          // Expected
        }
      }

      let status = service.getStatus('test-reset');
      expect(status?.state).toBe(CircuitBreakerState.OPEN);

      // Reset the circuit
      service.reset('test-reset');

      status = service.getStatus('test-reset');
      expect(status?.state).toBe(CircuitBreakerState.CLOSED);
      expect(status?.failureCount).toBe(0);
    });
  });

  describe('getActiveBreakers', () => {
    it('should return only non-closed circuit breakers', async () => {
      const mockOperation = jest.fn();

      // Create one closed breaker (successful)
      mockOperation.mockResolvedValue('success');
      await service.executeWithCircuitBreaker('closed-breaker', mockOperation);

      // Create one open breaker
      mockOperation.mockRejectedValue(new Error('Service error'));
      for (let i = 0; i < 5; i++) {
        try {
          await service.executeWithCircuitBreaker('open-breaker', mockOperation, { failureThreshold: 5 });
        } catch {
          // Expected
        }
      }

      const activeBreakers = service.getActiveBreakers();

      expect(activeBreakers.size).toBe(1);
      expect(activeBreakers.has('open-breaker')).toBe(true);
      expect(activeBreakers.has('closed-breaker')).toBe(false);

      const openBreakerStatus = activeBreakers.get('open-breaker');
      expect(openBreakerStatus?.state).toBe(CircuitBreakerState.OPEN);
    });
  });
});
