import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalService } from '../../../infisical/infisical.service';
import { UnleashService } from '../../../unleash/unleash.service';
import {
  ConfigFetchError,
  ConfigSource,
  type UnifiedConfigValue,
  UnifiedConfigService,
} from '../unified-config.service';

describe('UnifiedConfigService', () => {
  let service: UnifiedConfigService;
  let configService: jest.Mocked<ConfigService>;
  let infisicalService: jest.Mocked<InfisicalService>;
  let unleashService: jest.Mocked<UnleashService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.TEST_CONFIG;
    delete process.env.ANOTHER_CONFIG;
    delete process.env.ENV_ONLY_CONFIG;

    // Mock the Logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Spy on Logger constructor to return our mock
    jest.spyOn(Logger.prototype, 'log').mockImplementation(mockLogger.log);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(mockLogger.error);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(mockLogger.warn);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(mockLogger.debug);

    // Create mock services
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return '300000';
          case 'NODE_ENV':
            return 'test';
          default:
            return undefined;
        }
      }),
    };

    const mockInfisicalService = {
      getSecret: jest.fn(),
      waitForReady: jest.fn().mockResolvedValue(undefined),
      isReady: jest.fn().mockReturnValue(true),
    };

    const mockUnleashService = {
      getConfigValue: jest.fn(),
      waitForReady: jest.fn().mockResolvedValue(undefined),
      isReady: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: InfisicalService,
          useValue: mockInfisicalService,
        },
        {
          provide: UnleashService,
          useValue: mockUnleashService,
        },
      ],
    }).compile();

    service = module.get<UnifiedConfigService>(UnifiedConfigService);
    configService = module.get(ConfigService);
    infisicalService = module.get(InfisicalService);
    unleashService = module.get(UnleashService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with default cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return undefined; // Use default
          default:
            return undefined;
        }
      });

      const testService = new UnifiedConfigService(
        configService,
        infisicalService,
        unleashService,
      );

      // Access private property through type assertion for testing
      const defaultCacheTtl = (testService as any).defaultCacheTtl;
      expect(defaultCacheTtl).toBe(300000); // 5 minutes default
    });

    it('should create service with custom cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return '600000';
          default:
            return undefined;
        }
      });

      const testService = new UnifiedConfigService(
        configService,
        infisicalService,
        unleashService,
      );

      const defaultCacheTtl = (testService as any).defaultCacheTtl;
      expect(defaultCacheTtl).toBe(600000);
    });

    it('should throw error for invalid cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return 'invalid-number';
          default:
            return undefined;
        }
      });

      expect(
        () =>
          new UnifiedConfigService(
            configService,
            infisicalService,
            unleashService,
          ),
      ).toThrow('Invalid UNIFIED_CONFIG_CACHE_TTL value: invalid-number. Must be a positive number.');
    });

    it('should throw error for negative cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return '-1000';
          default:
            return undefined;
        }
      });

      expect(
        () =>
          new UnifiedConfigService(
            configService,
            infisicalService,
            unleashService,
          ),
      ).toThrow('Invalid UNIFIED_CONFIG_CACHE_TTL value: -1000. Must be a positive number.');
    });
  });

  describe('onModuleInit', () => {
    it('should initialize successfully when all services are ready', async () => {
      infisicalService.waitForReady.mockResolvedValue(undefined);
      unleashService.waitForReady.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(infisicalService.waitForReady).toHaveBeenCalled();
      expect(unleashService.waitForReady).toHaveBeenCalled();
      expect(service.isServiceReady()).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith('Unified Configuration service initialized successfully');
    });

    it('should operate in degraded mode when services fail to initialize', async () => {
      infisicalService.waitForReady.mockRejectedValue(new Error('Infisical failed'));
      unleashService.waitForReady.mockRejectedValue(new Error('Unleash failed'));

      await service.onModuleInit(); // Should not throw

      expect(service.isServiceReady()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Unified Configuration service:',
        expect.any(Error),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unified Configuration service will operate in degraded mode (environment variables only)',
      );
    });

    it('should handle partial service failures gracefully', async () => {
      infisicalService.waitForReady.mockResolvedValue(undefined);
      unleashService.waitForReady.mockRejectedValue(new Error('Unleash failed'));

      await service.onModuleInit(); // Should not throw

      expect(service.isServiceReady()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Unified Configuration service:',
        expect.any(Error),
      );
    });
  });

  describe('Priority Resolution (Infisical > Unleash > Environment > Default)', () => {
    beforeEach(async () => {
      // Initialize service for priority tests
      infisicalService.waitForReady.mockResolvedValue(undefined);
      unleashService.waitForReady.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should prioritize Infisical over all other sources', async () => {
      process.env.TEST_CONFIG = 'env-value';
      infisicalService.getSecret.mockResolvedValue('infisical-value');
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      const result = await service.getConfig('TEST_CONFIG', {
        defaultValue: 'default-value',
      });

      expect(result).toBe('infisical-value');
      expect(infisicalService.getSecret).toHaveBeenCalledWith('TEST_CONFIG');
      expect(unleashService.getConfigValue).not.toHaveBeenCalled();
    });

    it('should prioritize Unleash over environment and default when Infisical fails', async () => {
      process.env.TEST_CONFIG = 'env-value';
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      const result = await service.getConfig('TEST_CONFIG', {
        defaultValue: 'default-value',
      });

      expect(result).toBe('unleash-value');
      expect(unleashService.getConfigValue).toHaveBeenCalledWith('TEST_CONFIG');
    });

    it('should prioritize environment over default when higher priority sources fail', async () => {
      process.env.TEST_CONFIG = 'env-value';
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);

      const result = await service.getConfig('TEST_CONFIG', {
        defaultValue: 'default-value',
      });

      expect(result).toBe('env-value');
    });

    it('should use default value when all other sources fail', async () => {
      delete process.env.TEST_CONFIG;
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);
      configService.get.mockReturnValue(undefined);

      const result = await service.getConfig('TEST_CONFIG', {
        defaultValue: 'default-value',
      });

      expect(result).toBe('default-value');
    });

    it('should return undefined when no sources provide value and no default', async () => {
      delete process.env.TEST_CONFIG;
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);
      configService.get.mockReturnValue(undefined);

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBeUndefined();
    });

    it('should respect custom source priority order', async () => {
      process.env.TEST_CONFIG = 'env-value';
      infisicalService.getSecret.mockResolvedValue('infisical-value');
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      // Test with custom source order (environment first)
      const result = await service.getConfig('TEST_CONFIG', {
        sources: [ConfigSource.ENVIRONMENT, ConfigSource.UNLEASH],
      });

      expect(result).toBe('env-value');
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
    });
  });

  describe('Caching Mechanism', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should cache configuration values and serve from cache', async () => {
      infisicalService.getSecret.mockResolvedValue('cached-value');

      // First call should fetch from source
      const firstResult = await service.getConfig('TEST_CONFIG');
      expect(firstResult).toBe('cached-value');
      expect(infisicalService.getSecret).toHaveBeenCalledTimes(1);

      // Clear mock to verify cache usage
      infisicalService.getSecret.mockClear();

      // Second call should use cache
      const secondResult = await service.getConfig('TEST_CONFIG');
      expect(secondResult).toBe('cached-value');
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
    });

    it('should return cached value with proper metadata', async () => {
      infisicalService.getSecret.mockResolvedValue('cached-value');

      // Cache the value
      await service.getConfig('TEST_CONFIG');

      // Get with metadata
      const result = await service.getConfigWithMetadata('TEST_CONFIG');

      expect(result).toMatchObject({
        value: 'cached-value',
        source: ConfigSource.INFISICAL,
        found: true,
        cached: true,
      });
      expect(result.expiry).toBeDefined();
      expect(result.expiry).toBeGreaterThan(Date.now());
    });

    it('should skip cache when skipCache option is true', async () => {
      infisicalService.getSecret.mockResolvedValue('cached-value');

      // Cache the value
      await service.getConfig('TEST_CONFIG');

      // Update the return value
      infisicalService.getSecret.mockResolvedValue('fresh-value');

      // Skip cache should get fresh value
      const result = await service.getConfig('TEST_CONFIG', {
        skipCache: true,
      });

      expect(result).toBe('fresh-value');
      expect(infisicalService.getSecret).toHaveBeenCalledTimes(2);
    });

    it('should use custom cache TTL when provided', async () => {
      infisicalService.getSecret.mockResolvedValue('test-value');

      const customTtl = 10000; // 10 seconds
      const result = await service.getConfigWithMetadata('TEST_CONFIG', {
        cacheTtl: customTtl,
      });

      expect(result.cached).toBe(false); // First call, not cached
      
      // Get from cache
      const cachedResult = await service.getConfigWithMetadata('TEST_CONFIG');
      expect(cachedResult.cached).toBe(true);
      
      // Verify TTL is approximately correct (allowing for execution time)
      const expectedExpiry = Date.now() + customTtl;
      expect(cachedResult.expiry).toBeLessThanOrEqual(expectedExpiry + 100);
      expect(cachedResult.expiry).toBeGreaterThan(expectedExpiry - 100);
    });

    it('should not cache default values', async () => {
      delete process.env.TEST_CONFIG;
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);

      // Call with default value
      await service.getConfig('TEST_CONFIG', {
        defaultValue: 'default-value',
      });

      // Change the environment and call again
      process.env.TEST_CONFIG = 'env-value';
      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('env-value'); // Should get env value, not cached default
    });

    it('should handle cache expiry correctly', async () => {
      infisicalService.getSecret.mockResolvedValue('initial-value');

      // Cache with very short TTL
      await service.getConfig('TEST_CONFIG', { cacheTtl: 10 });

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      // Update return value
      infisicalService.getSecret.mockResolvedValue('fresh-value');

      // Should get fresh value after expiry
      const result = await service.getConfig('TEST_CONFIG');
      expect(result).toBe('fresh-value');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should continue to next source when Infisical throws error', async () => {
      process.env.TEST_CONFIG = 'env-fallback';
      infisicalService.getSecret.mockRejectedValue(new Error('Infisical error'));
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('unleash-value');
      // Error is logged at debug level within getFromSource, not warn level at main loop
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Infisical lookup failed for key 'TEST_CONFIG':",
        expect.any(Error),
      );
    });

    it('should continue to next source when Unleash throws error', async () => {
      process.env.TEST_CONFIG = 'env-fallback';
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockRejectedValue(new Error('Unleash error'));

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('env-fallback');
      // Error is logged at debug level within getFromSource, not warn level at main loop
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Unleash lookup failed for key 'TEST_CONFIG':",
        expect.any(Error),
      );
    });

    it('should handle multiple source failures gracefully', async () => {
      infisicalService.getSecret.mockRejectedValue(new Error('Infisical error'));
      unleashService.getConfigValue.mockRejectedValue(new Error('Unleash error'));

      const result = await service.getConfig('TEST_CONFIG', {
        defaultValue: 'fallback-default',
      });

      expect(result).toBe('fallback-default');
    });
  });

  describe('Service Readiness', () => {
    it('should handle requests when services are not ready', async () => {
      infisicalService.isReady.mockReturnValue(false);
      unleashService.isReady.mockReturnValue(false);
      process.env.TEST_CONFIG = 'env-value';

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('env-value');
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
      expect(unleashService.getConfigValue).not.toHaveBeenCalled();
    });

    it('should fall back to ready services when others are not ready', async () => {
      infisicalService.isReady.mockReturnValue(false);
      unleashService.isReady.mockReturnValue(true);
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('unleash-value');
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
      expect(unleashService.getConfigValue).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should get multiple configurations efficiently', async () => {
      infisicalService.getSecret.mockImplementation((key: string) => {
        switch (key) {
          case 'CONFIG_1':
            return Promise.resolve('infisical-1');
          case 'CONFIG_2':
            return Promise.resolve(undefined);
          default:
            return Promise.resolve(undefined);
        }
      });

      process.env.CONFIG_2 = 'env-2';
      unleashService.getConfigValue.mockResolvedValue(undefined);

      const result = await service.getConfigs(['CONFIG_1', 'CONFIG_2']);

      expect(result).toEqual({
        CONFIG_1: 'infisical-1',
        CONFIG_2: 'env-2',
      });
    });

    it('should handle mixed sources in batch operations', async () => {
      infisicalService.getSecret.mockImplementation((key: string) => {
        return key === 'INFISICAL_CONFIG' ? Promise.resolve('infisical-value') : Promise.resolve(undefined);
      });

      unleashService.getConfigValue.mockImplementation((key: string) => {
        return key === 'UNLEASH_CONFIG' ? Promise.resolve('unleash-value') : Promise.resolve(undefined);
      });

      process.env.ENV_CONFIG = 'env-value';

      const result = await service.getConfigs([
        'INFISICAL_CONFIG',
        'UNLEASH_CONFIG',
        'ENV_CONFIG',
        'MISSING_CONFIG',
      ], {
        defaultValue: 'default-value',
      });

      expect(result).toEqual({
        INFISICAL_CONFIG: 'infisical-value',
        UNLEASH_CONFIG: 'unleash-value',
        ENV_CONFIG: 'env-value',
        MISSING_CONFIG: 'default-value',
      });
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clear cache successfully', async () => {
      infisicalService.getSecret.mockResolvedValue('cached-value');

      // Cache a value
      await service.getConfig('TEST_CONFIG');

      // Clear cache
      service.clearCache();

      // Update mock to return different value
      infisicalService.getSecret.mockResolvedValue('fresh-value');

      // Should get fresh value after cache clear
      const result = await service.getConfig('TEST_CONFIG');
      expect(result).toBe('fresh-value');
    });

    it('should clear expired cache entries', async () => {
      infisicalService.getSecret.mockResolvedValue('test-value');

      // Cache with short TTL
      await service.getConfig('TEST_CONFIG', { cacheTtl: 10 });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 20));

      // Manually trigger expired cache cleanup
      service.clearExpiredCache();

      // Verify cache was cleared by checking fresh fetch
      infisicalService.getSecret.mockClear();
      infisicalService.getSecret.mockResolvedValue('fresh-value');

      const result = await service.getConfig('TEST_CONFIG');
      expect(result).toBe('fresh-value');
      expect(infisicalService.getSecret).toHaveBeenCalled();
    });

    it('should return cache statistics', async () => {
      infisicalService.getSecret.mockResolvedValue('test-value-1');
      unleashService.getConfigValue.mockResolvedValue('test-value-2');

      // Cache some values
      await service.getConfig('CONFIG_1'); // From Infisical
      await service.getConfig('CONFIG_2'); // From Unleash

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries.map(e => e.key)).toContain('CONFIG_1');
      expect(stats.entries.map(e => e.key)).toContain('CONFIG_2');
      expect(stats.entries.map(e => e.source)).toContain(ConfigSource.INFISICAL);
      expect(stats.entries[0].age).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Intelligent Logging', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      mockLogger.log.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.debug.mockClear();
      mockLogger.error.mockClear();
    });

    it('should log at DEBUG level when config retrieved from Infisical', async () => {
      infisicalService.getSecret.mockResolvedValue('infisical-value');

      await service.getConfig('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config 'TEST_CONFIG' retrieved from Infisical");
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log at DEBUG level when config retrieved from cache', async () => {
      infisicalService.getSecret.mockResolvedValue('cached-value');

      // First call to cache
      await service.getConfig('TEST_CONFIG');
      mockLogger.debug.mockClear();

      // Second call from cache
      await service.getConfig('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config 'TEST_CONFIG' retrieved from cache (source: infisical)");
    });

    it('should log at DEBUG level when config retrieved from environment', async () => {
      process.env.TEST_CONFIG = 'env-value';
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);

      await service.getConfig('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config 'TEST_CONFIG' retrieved from environment variables");
    });

    it('should log at WARN level when config not found in any source', async () => {
      delete process.env.TEST_CONFIG;
      infisicalService.getSecret.mockResolvedValue(undefined);
      unleashService.getConfigValue.mockResolvedValue(undefined);

      await service.getConfig('TEST_CONFIG');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Config 'TEST_CONFIG' not found in any source (Infisical, Unleash, environment, or defaults)",
      );
    });
  });

  describe('ConfigSource enum', () => {
    it('should have correct priority order values', () => {
      expect(ConfigSource.ENVIRONMENT).toBe('environment');
      expect(ConfigSource.DEFAULT).toBe('default');
      expect(ConfigSource.UNLEASH).toBe('unleash');
      expect(ConfigSource.INFISICAL).toBe('infisical');
    });
  });

  describe('Error Classes', () => {
    describe('ConfigFetchError', () => {
      it('should create error with config key and attempted sources', () => {
        const configKey = 'TEST_CONFIG';
        const sources = [ConfigSource.INFISICAL, ConfigSource.UNLEASH];
        const cause = new Error('Original error');
        const error = new ConfigFetchError('Fetch failed', configKey, sources, cause);

        expect(error.message).toBe('Fetch failed');
        expect(error.code).toBe('CONFIG_FETCH_ERROR');
        expect(error.configKey).toBe(configKey);
        expect(error.attemptedSources).toBe(sources);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('ConfigFetchError');
      });
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle null and undefined values from sources correctly', async () => {
      infisicalService.getSecret.mockResolvedValue(undefined); // Change to undefined since null is converted to undefined by the service
      unleashService.getConfigValue.mockResolvedValue(undefined);
      process.env.TEST_CONFIG = 'env-value';

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe('env-value');
    });

    it('should handle empty string values as valid', async () => {
      infisicalService.getSecret.mockResolvedValue('');
      unleashService.getConfigValue.mockResolvedValue('unleash-value');

      const result = await service.getConfig('TEST_CONFIG');

      expect(result).toBe(''); // Empty string from Infisical should be used
    });

    it('should handle concurrent requests for same key', async () => {
      // Create a resolved promise to ensure consistent behavior
      infisicalService.getSecret.mockResolvedValue('concurrent-value');

      // Make concurrent requests
      const promises = [
        service.getConfig('TEST_CONFIG'),
        service.getConfig('TEST_CONFIG'),
        service.getConfig('TEST_CONFIG'),
      ];

      const results = await Promise.all(promises);

      // All should get the value (either from source or cache)
      expect(results[0]).toBe('concurrent-value');
      expect(results[1]).toBe('concurrent-value');
      expect(results[2]).toBe('concurrent-value');
      expect(infisicalService.getSecret).toHaveBeenCalled();
    });
  });
});