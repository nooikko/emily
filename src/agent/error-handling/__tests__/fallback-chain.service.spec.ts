import { RunnablePassthrough } from '@langchain/core/runnables';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCategory } from '../interfaces/error-handling.interface';
import { FallbackChainService } from '../services/fallback-chain.service';
import { RetryService } from '../services/retry.service';

describe('FallbackChainService', () => {
  let service: FallbackChainService;
  let retryService: RetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FallbackChainService, RetryService],
    }).compile();

    service = module.get<FallbackChainService>(FallbackChainService);
    retryService = module.get<RetryService>(RetryService);
  });

  describe('createFallbackChain', () => {
    it('should use primary when it succeeds', async () => {
      const primaryMock = {
        invoke: jest.fn().mockResolvedValue('primary result'),
      };
      const fallbackMock = {
        invoke: jest.fn().mockResolvedValue('fallback result'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: fallbackMock as any,
            config: {
              name: 'fallback-1',
              description: 'Test fallback',
              priority: 1,
            },
          },
        ],
      });

      const result = await chain.invoke('test input');

      expect(result).toBe('primary result');
      expect(primaryMock.invoke).toHaveBeenCalledWith('test input');
      expect(fallbackMock.invoke).not.toHaveBeenCalled();
    });

    it('should use fallback when primary fails', async () => {
      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(new Error('Primary failed')),
      };
      const fallbackMock = {
        invoke: jest.fn().mockResolvedValue('fallback result'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: fallbackMock as any,
            config: {
              name: 'fallback-1',
              description: 'Test fallback',
              priority: 1,
            },
          },
        ],
      });

      const result = await chain.invoke('test input');

      expect(result).toBe('fallback result');
      expect(primaryMock.invoke).toHaveBeenCalledWith('test input');
      expect(fallbackMock.invoke).toHaveBeenCalledWith('test input');
    });

    it('should try fallbacks in priority order', async () => {
      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(new Error('Primary failed')),
      };
      const fallback1Mock = {
        invoke: jest.fn().mockRejectedValue(new Error('Fallback 1 failed')),
      };
      const fallback2Mock = {
        invoke: jest.fn().mockResolvedValue('fallback 2 result'),
      };
      const fallback3Mock = {
        invoke: jest.fn().mockResolvedValue('fallback 3 result'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: fallback3Mock as any,
            config: {
              name: 'fallback-3',
              description: 'Low priority fallback',
              priority: 3,
            },
          },
          {
            runnable: fallback1Mock as any,
            config: {
              name: 'fallback-1',
              description: 'High priority fallback',
              priority: 1,
            },
          },
          {
            runnable: fallback2Mock as any,
            config: {
              name: 'fallback-2',
              description: 'Medium priority fallback',
              priority: 2,
            },
          },
        ],
      });

      const result = await chain.invoke('test input');

      expect(result).toBe('fallback 2 result');
      expect(fallback1Mock.invoke).toHaveBeenCalled(); // Priority 1 - tried first
      expect(fallback2Mock.invoke).toHaveBeenCalled(); // Priority 2 - tried second and succeeded
      expect(fallback3Mock.invoke).not.toHaveBeenCalled(); // Priority 3 - not reached
    });

    it('should skip unhealthy fallbacks', async () => {
      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(new Error('Primary failed')),
      };
      const unhealthyFallbackMock = {
        invoke: jest.fn().mockResolvedValue('unhealthy result'),
      };
      const healthyFallbackMock = {
        invoke: jest.fn().mockResolvedValue('healthy result'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: unhealthyFallbackMock as any,
            config: {
              name: 'unhealthy-fallback',
              description: 'Unhealthy fallback',
              priority: 1,
              healthCheck: async () => false, // Unhealthy
            },
          },
          {
            runnable: healthyFallbackMock as any,
            config: {
              name: 'healthy-fallback',
              description: 'Healthy fallback',
              priority: 2,
              healthCheck: async () => true, // Healthy
            },
          },
        ],
      });

      const result = await chain.invoke('test input');

      expect(result).toBe('healthy result');
      expect(unhealthyFallbackMock.invoke).not.toHaveBeenCalled();
      expect(healthyFallbackMock.invoke).toHaveBeenCalled();
    });

    it('should filter fallbacks by error category', async () => {
      const networkError = new Error('Network timeout');
      jest.spyOn(retryService, 'classifyError').mockReturnValue({
        category: ErrorCategory.NETWORK,
        severity: 'medium' as any,
        retryable: true,
        fallbackEligible: true,
        requiresRecovery: false,
      });

      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(networkError),
      };
      const rateLimitFallbackMock = {
        invoke: jest.fn().mockResolvedValue('rate limit fallback'),
      };
      const networkFallbackMock = {
        invoke: jest.fn().mockResolvedValue('network fallback'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: rateLimitFallbackMock as any,
            config: {
              name: 'rate-limit-fallback',
              description: 'For rate limit errors',
              priority: 1,
              errorCategories: [ErrorCategory.RATE_LIMIT],
            },
          },
          {
            runnable: networkFallbackMock as any,
            config: {
              name: 'network-fallback',
              description: 'For network errors',
              priority: 2,
              errorCategories: [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT],
            },
          },
        ],
      });

      const result = await chain.invoke('test input');

      expect(result).toBe('network fallback');
      expect(rateLimitFallbackMock.invoke).not.toHaveBeenCalled();
      expect(networkFallbackMock.invoke).toHaveBeenCalled();
    });

    it('should throw when all fallbacks fail', async () => {
      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(new Error('Primary failed')),
      };
      const fallback1Mock = {
        invoke: jest.fn().mockRejectedValue(new Error('Fallback 1 failed')),
      };
      const fallback2Mock = {
        invoke: jest.fn().mockRejectedValue(new Error('Fallback 2 failed')),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: fallback1Mock as any,
            config: {
              name: 'fallback-1',
              description: 'Test fallback 1',
              priority: 1,
            },
          },
          {
            runnable: fallback2Mock as any,
            config: {
              name: 'fallback-2',
              description: 'Test fallback 2',
              priority: 2,
            },
          },
        ],
      });

      await expect(chain.invoke('test input')).rejects.toThrow('All fallbacks exhausted. Primary error: Primary failed');
    });

    it('should call onFallback callback', async () => {
      const onFallback = jest.fn();
      const primaryMock = {
        invoke: jest.fn().mockRejectedValue(new Error('Primary failed')),
      };
      const fallbackMock = {
        invoke: jest.fn().mockResolvedValue('fallback result'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [
          {
            runnable: fallbackMock as any,
            config: {
              name: 'fallback-1',
              description: 'Test fallback',
              priority: 1,
            },
          },
        ],
        onFallback,
      });

      await chain.invoke('test input');

      expect(onFallback).toHaveBeenCalledWith(-1, 0, expect.objectContaining({ message: 'Primary failed' }));
    });
  });

  describe('createLLMFallbackChain', () => {
    it('should create LLM fallback chain with default providers', () => {
      const chain = service.createLLMFallbackChain();

      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });

    it('should include local model when requested', () => {
      const chain = service.createLLMFallbackChain({ includeLocal: true });

      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });
  });

  describe('createToolFallbackChain', () => {
    it('should create tool fallback chain', () => {
      const primaryTool = new RunnablePassthrough();
      const fallbackTool1 = new RunnablePassthrough();
      const fallbackTool2 = new RunnablePassthrough();

      const chain = service.createToolFallbackChain(primaryTool, [fallbackTool1, fallbackTool2], {
        toolNames: ['backup-tool-1', 'backup-tool-2'],
      });

      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });
  });

  describe('createDegradedServiceChain', () => {
    it('should create degraded service chain', () => {
      const fullService = new RunnablePassthrough();
      const degradedService1 = new RunnablePassthrough();
      const degradedService2 = new RunnablePassthrough();

      const chain = service.createDegradedServiceChain(fullService, [
        {
          service: degradedService1,
          name: 'basic-service',
          capabilities: ['read', 'list'],
        },
        {
          service: degradedService2,
          name: 'minimal-service',
          capabilities: ['read'],
        },
      ]);

      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });
  });

  describe('latency monitoring', () => {
    it('should track service latency', async () => {
      const primaryMock = {
        invoke: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'result';
        }),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [],
      });

      await chain.invoke('test');
      await chain.invoke('test');
      await chain.invoke('test');

      const metrics = service.getLatencyMetrics();
      const primaryMetrics = metrics.get('primary');

      expect(primaryMetrics).toBeDefined();
      expect(primaryMetrics?.average).toBeGreaterThan(40);
      expect(primaryMetrics?.average).toBeLessThan(100);
      expect(primaryMetrics?.min).toBeGreaterThan(0);
      expect(primaryMetrics?.max).toBeGreaterThan(0);
    });
  });

  describe('health monitoring', () => {
    it('should track service health status', async () => {
      const primaryMock = {
        invoke: jest.fn().mockResolvedValueOnce('success').mockRejectedValueOnce(new Error('Failed')).mockResolvedValueOnce('success'),
      };

      const chain = await service.createFallbackChain({
        primary: primaryMock as any,
        fallbacks: [],
      });

      await chain.invoke('test');
      let health = service.getServiceHealth();
      expect(health.get('primary')).toBe(true);

      try {
        await chain.invoke('test');
      } catch {
        // Expected
      }
      health = service.getServiceHealth();
      expect(health.get('primary')).toBe(false);

      await chain.invoke('test');
      health = service.getServiceHealth();
      expect(health.get('primary')).toBe(true);
    });
  });
});
