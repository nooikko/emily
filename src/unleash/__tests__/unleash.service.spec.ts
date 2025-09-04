import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { getVariant, initialize, isEnabled, type Unleash } from 'unleash-client';
import { InfisicalService } from '../../infisical/infisical.service';
import { UnleashConfigFetchError, UnleashInitializationError, UnleashService } from '../unleash.service';

// Mock the unleash-client module
jest.mock('unleash-client', () => ({
  initialize: jest.fn(),
  isEnabled: jest.fn(),
  getVariant: jest.fn(),
}));

// Create proper mock types for unleash client
interface MockUnleashClient {
  on: jest.MockedFunction<(event: string, callback: (...args: any[]) => void) => void>;
  destroy: jest.MockedFunction<() => void>;
}

describe('UnleashService', () => {
  let service: UnleashService;
  let configService: jest.Mocked<ConfigService>;
  let infisicalService: jest.Mocked<InfisicalService>;
  let mockUnleashClient: MockUnleashClient;
  let mockLogger: jest.Mocked<Logger>;

  // Mock data for testing - using any because it needs to match external unleash-client types
  const mockVariant = {
    name: 'variant-name',
    enabled: true,
    payload: {
      type: 'string',
      value: 'test-config-value',
    },
  } as any; // External library compatibility

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.TEST_CONFIG;
    delete process.env.ANOTHER_CONFIG;

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

    // Create mock Unleash client
    mockUnleashClient = {
      on: jest.fn(),
      destroy: jest.fn(),
    };

    // Reset unleash-client mocks
    (initialize as jest.MockedFunction<typeof initialize>).mockClear();
    (isEnabled as jest.MockedFunction<typeof isEnabled>).mockClear();
    (getVariant as jest.MockedFunction<typeof getVariant>).mockClear();

    // Setup default mock behavior
    (initialize as jest.MockedFunction<typeof initialize>).mockReturnValue(mockUnleashClient as unknown as Unleash);

    // Create a mock configService with default configuration
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_APP_NAME':
            return 'emily-ai-agent';
          case 'UNLEASH_ENVIRONMENT':
            return 'development';
          case 'NODE_ENV':
            return 'test';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          case 'UNLEASH_REFRESH_INTERVAL':
            return '15000';
          case 'UNLEASH_METRICS_INTERVAL':
            return '60000';
          case 'UNLEASH_TIMEOUT':
            return '10000';
          case 'UNLEASH_RETRIES':
            return '2';
          default:
            return undefined;
        }
      }),
    };

    // Create mock InfisicalService
    const mockInfisicalService = {
      getSecret: jest.fn(),
      waitForReady: jest.fn().mockResolvedValue(undefined),
      isReady: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnleashService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: InfisicalService,
          useValue: mockInfisicalService,
        },
      ],
    }).compile();

    service = module.get<UnleashService>(UnleashService);
    configService = module.get(ConfigService);
    infisicalService = module.get(InfisicalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with default configuration', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          case 'NODE_ENV':
            return 'test';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      const config = testService.getConfig();

      expect(config.enabled).toBe(false); // Disabled by default when not provided
      expect(config.cacheTtl).toBe(300000);
      expect(config.fallbackToEnv).toBe(true);
      expect(config.environment).toBe('test');
      expect(config.appName).toBe('emily-ai-agent');
    });

    it('should create service with enabled configuration', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_APP_NAME':
            return 'test-app';
          case 'UNLEASH_ENVIRONMENT':
            return 'production';
          case 'UNLEASH_CACHE_TTL':
            return '600000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_REFRESH_INTERVAL':
            return '30000';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      const config = testService.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.url).toBe('https://unleash.example.com');
      expect(config.appName).toBe('test-app');
      expect(config.environment).toBe('production');
      expect(config.cacheTtl).toBe(600000);
      expect(config.fallbackToEnv).toBe(false);
      expect(config.refreshInterval).toBe(30000);
    });

    it('should throw error for invalid cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_CACHE_TTL':
            return 'invalid-number';
          default:
            return undefined;
        }
      });

      expect(() => new UnleashService(configService, infisicalService)).toThrow(
        'Invalid UNLEASH_CACHE_TTL value: invalid-number. Must be a positive number.',
      );
    });

    it('should throw error for negative cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_CACHE_TTL':
            return '-1000';
          default:
            return undefined;
        }
      });

      expect(() => new UnleashService(configService, infisicalService)).toThrow('Invalid UNLEASH_CACHE_TTL value: -1000. Must be a positive number.');
    });
  });

  describe('onModuleInit', () => {
    it('should skip initialization when Unleash is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      await testService.onModuleInit();

      expect(testService.isOperational()).toBe(false);
      expect(initialize).not.toHaveBeenCalled();
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
      // When disabled, no need to wait for Infisical since we won't use it
      expect(infisicalService.waitForReady).not.toHaveBeenCalled();
    });

    it('should wait for InfisicalService to be ready before initializing', async () => {
      infisicalService.waitForReady.mockResolvedValue(undefined);
      infisicalService.getSecret.mockResolvedValue('unleash-api-key-123');

      // Mock successful initialization
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0); // Simulate ready event
        }
        return undefined as any;
      });

      await service.onModuleInit();

      // Verify that waitForReady was called before getSecret (test ordering through call counts)
      expect(infisicalService.waitForReady).toHaveBeenCalled();
      expect(infisicalService.waitForReady).toHaveBeenCalledWith(); // Called with default params
      expect(infisicalService.getSecret).toHaveBeenCalledWith('UNLEASH_API_KEY');
      expect(service.isOperational()).toBe(true);
    });

    it('should proceed with fallback when InfisicalService.waitForReady() fails', async () => {
      infisicalService.waitForReady.mockRejectedValue(new Error('Infisical timeout'));
      infisicalService.getSecret.mockResolvedValue('unleash-api-key-123');

      // Mock successful initialization
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      // Should not throw despite Infisical failure
      await service.onModuleInit();

      expect(infisicalService.waitForReady).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to wait for InfisicalService readiness:', expect.any(Error));
      expect(mockLogger.warn).toHaveBeenCalledWith('Proceeding with Unleash initialization despite Infisical failure (fallback enabled)');
      
      // Should still try to get the secret after waitForReady fails
      expect(infisicalService.getSecret).toHaveBeenCalledWith('UNLEASH_API_KEY');
      expect(service.isOperational()).toBe(true);
    });

    it('should throw error when InfisicalService.waitForReady() fails and fallback is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false'; // Fallback disabled
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.waitForReady.mockRejectedValue(new Error('Infisical timeout'));

      await expect(testService.onModuleInit()).rejects.toThrow('Infisical timeout');
      expect(infisicalService.waitForReady).toHaveBeenCalled();
      expect(infisicalService.getSecret).not.toHaveBeenCalled();
      expect(testService.isOperational()).toBe(false);
    });

    it('should initialize successfully with valid configuration', async () => {
      infisicalService.getSecret.mockResolvedValue('unleash-api-key-123');

      // Mock successful initialization
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0); // Simulate ready event
        }
        return undefined as any;
      });

      await service.onModuleInit();

      expect(infisicalService.getSecret).toHaveBeenCalledWith('UNLEASH_API_KEY');
      expect(initialize).toHaveBeenCalledWith({
        url: 'https://unleash.example.com',
        appName: 'emily-ai-agent',
        environment: 'development',
        instanceId: undefined,
        refreshInterval: 15000,
        metricsInterval: 60000,
        timeout: 10000,
        customHeaders: {
          Authorization: 'unleash-api-key-123',
        },
      });
      expect(service.isOperational()).toBe(true);
    });

    it('should set service as not operational when API key is not found in Infisical', async () => {
      infisicalService.getSecret.mockResolvedValue(undefined);

      await service.onModuleInit(); // Should not throw due to fallback
      expect(service.isOperational()).toBe(false);
    });

    it('should set service as not operational when UNLEASH_URL is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return undefined; // Missing URL
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');

      await testService.onModuleInit(); // Should not throw due to fallback
      expect(testService.isOperational()).toBe(false);
    });

    it('should handle client initialization timeout gracefully with fallback', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');

      // Don't trigger ready event, causing timeout
      mockUnleashClient.on.mockImplementation(() => undefined as any);

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_TIMEOUT':
            return '100'; // Short timeout for test
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);

      await testService.onModuleInit(); // Should not throw due to fallback
      expect(testService.isOperational()).toBe(false);
    });

    it('should handle client initialization error gracefully with fallback', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');

      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
        return undefined as any;
      });

      await service.onModuleInit(); // Should not throw due to fallback
      expect(service.isOperational()).toBe(false);
    });

    it('should fallback when initialization fails and fallback is enabled', async () => {
      infisicalService.waitForReady.mockRejectedValue(new Error('Infisical error'));
      infisicalService.getSecret.mockRejectedValue(new Error('Infisical error'));

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);

      await testService.onModuleInit();

      expect(testService.isOperational()).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Proceeding with Unleash initialization despite Infisical failure (fallback enabled)');
    });

    it('should throw error when initialization fails and fallback is disabled', async () => {
      infisicalService.waitForReady.mockRejectedValue(new Error('Infisical error'));
      infisicalService.getSecret.mockRejectedValue(new Error('Infisical error'));

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);

      await expect(testService.onModuleInit()).rejects.toThrow('Infisical error');
    });
  });

  describe('onModuleDestroy', () => {
    it('should destroy client when it exists', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockUnleashClient.destroy).toHaveBeenCalled();
    });

    it('should handle destroy when client is null', async () => {
      // Service not initialized, client should be null
      await service.onModuleDestroy();

      expect(mockUnleashClient.destroy).not.toHaveBeenCalled();
    });
  });

  describe('getConfigValue', () => {
    beforeEach(async () => {
      // Initialize service for config value tests
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();
    });

    it('should return config value from Unleash variant', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(mockVariant);

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('test-config-value');
      expect(isEnabled).toHaveBeenCalledWith(
        'TEST_CONFIG',
        {
          environment: 'development',
          appName: 'emily-ai-agent',
        },
        false,
      );
      expect(getVariant).toHaveBeenCalledWith('TEST_CONFIG', {
        environment: 'development',
        appName: 'emily-ai-agent',
      });
    });

    it('should return cached config value when available and not expired', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(mockVariant);

      // First call to cache the value
      const firstResult = await service.getConfigValue('TEST_CONFIG');
      expect(firstResult).toBe('test-config-value');

      // Clear the mocks to verify cache is used
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockClear();
      (getVariant as jest.MockedFunction<typeof getVariant>).mockClear();

      // Second call should use cache
      const secondResult = await service.getConfigValue('TEST_CONFIG');
      expect(secondResult).toBe('test-config-value');
      expect(isEnabled).not.toHaveBeenCalled();
      expect(getVariant).not.toHaveBeenCalled();
    });

    it('should fallback to environment variable when feature flag is disabled', async () => {
      process.env.TEST_CONFIG = 'env-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('env-value');
      expect(getVariant).not.toHaveBeenCalled();
    });

    it('should return default value when config not found and fallback disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await testService.onModuleInit();

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      const result = await testService.getConfigValue('TEST_CONFIG', 'default-value');

      expect(result).toBe('default-value');
    });

    it('should return undefined when config not found and no default provided', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await testService.onModuleInit();

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);
      delete process.env.TEST_CONFIG;

      const result = await testService.getConfigValue('TEST_CONFIG');

      expect(result).toBeUndefined();
    });

    it('should handle errors and fallback to environment when enabled', async () => {
      process.env.TEST_CONFIG = 'fallback-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockImplementation(() => {
        throw new Error('Unleash error');
      });

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('fallback-value');
    });

    it('should throw error when Unleash fails and fallback is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await testService.onModuleInit();

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockImplementation(() => {
        throw new Error('Unleash error');
      });

      await expect(testService.getConfigValue('TEST_CONFIG')).rejects.toThrow(UnleashConfigFetchError);
    });

    it('should initialize service if not initialized when getting config value', async () => {
      const nonInitializedService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');

      let readyCallback: () => void;
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          readyCallback = callback;
        }
        return undefined as any;
      });

      const configPromise = nonInitializedService.getConfigValue('TEST_CONFIG');

      // Trigger ready event after a short delay
      setTimeout(() => readyCallback!(), 10);

      process.env.TEST_CONFIG = 'env-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      const result = await configPromise;
      expect(result).toBe('env-value');
      expect(nonInitializedService.isOperational()).toBe(true);
    });
  });

  describe('getConfigValues', () => {
    beforeEach(async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();
    });

    it('should return multiple config values', async () => {
      process.env.CONFIG_2 = 'env-value-2';

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockImplementation((key: string) => {
        return key === 'CONFIG_1';
      });

      (getVariant as jest.MockedFunction<typeof getVariant>).mockImplementation((key: string) => {
        if (key === 'CONFIG_1') {
          return mockVariant;
        }
        return null as any;
      });

      const result = await service.getConfigValues(['CONFIG_1', 'CONFIG_2']);

      expect(result).toEqual({
        CONFIG_1: 'test-config-value',
        CONFIG_2: 'env-value-2',
      });
    });

    it('should handle errors for individual keys gracefully', async () => {
      process.env.CONFIG_1 = 'fallback-1';
      process.env.CONFIG_2 = 'fallback-2';

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockImplementation((key: string) => {
        if (key === 'CONFIG_1') {
          throw new Error('Unleash error');
        }
        return false;
      });

      const result = await service.getConfigValues(['CONFIG_1', 'CONFIG_2']);

      expect(result).toEqual({
        CONFIG_1: 'fallback-1',
        CONFIG_2: 'fallback-2',
      });
    });

    it('should return undefined for missing values when fallback disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await testService.onModuleInit();

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      const result = await testService.getConfigValues(['CONFIG_1', 'CONFIG_2']);

      expect(result).toEqual({
        CONFIG_1: undefined,
        CONFIG_2: undefined,
      });
    });
  });

  describe('isFeatureEnabled', () => {
    beforeEach(async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();
    });

    it('should return true when feature is enabled', () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);

      const result = service.isFeatureEnabled('test-feature');

      expect(result).toBe(true);
      expect(isEnabled).toHaveBeenCalledWith(
        'test-feature',
        {
          environment: 'development',
          appName: 'emily-ai-agent',
        },
        false,
      );
    });

    it('should return false when feature is disabled', () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      const result = service.isFeatureEnabled('test-feature');

      expect(result).toBe(false);
    });

    it('should use custom context when provided', () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);

      const customContext = {
        userId: 'user-123',
        environment: 'production',
        appName: 'test-app',
      };

      service.isFeatureEnabled('test-feature', customContext);

      expect(isEnabled).toHaveBeenCalledWith('test-feature', customContext, false);
    });

    it('should return false when service is not initialized', () => {
      const uninitializedService = new UnleashService(configService, infisicalService);

      const result = uninitializedService.isFeatureEnabled('test-feature');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith("Unleash not initialized, feature flag 'test-feature' defaulting to false");
    });
  });

  describe('clearCache', () => {
    beforeEach(async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();
    });

    it('should clear the configuration cache', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(mockVariant);

      // Cache a value
      await service.getConfigValue('TEST_CONFIG');

      // Clear cache
      service.clearCache();

      // Verify cache is cleared by checking that Unleash is called again
      (getVariant as jest.MockedFunction<typeof getVariant>).mockClear();
      await service.getConfigValue('TEST_CONFIG');

      expect(getVariant).toHaveBeenCalled();
    });
  });

  describe('isReady', () => {
    it('should return true when Unleash is disabled', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      expect(testService.isReady()).toBe(true);
    });

    it('should return false when Unleash is enabled but not initialized', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should return true when Unleash is enabled and properly initialized', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      await service.onModuleInit();
      expect(service.isReady()).toBe(true);
    });

    it('should return false when initialization failed', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
        return undefined as any;
      });

      await service.onModuleInit(); // Should not throw due to fallback
      expect(service.isReady()).toBe(false);
    });
  });

  describe('waitForReady', () => {
    it('should resolve immediately when service is already ready (disabled)', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      const startTime = Date.now();

      await testService.waitForReady(5000);
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(100); // Should resolve immediately
    });

    it('should resolve immediately when service is already initialized', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      await service.onModuleInit();

      const startTime = Date.now();
      await service.waitForReady(5000);
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(100); // Should resolve immediately
    });

    it('should wait for service to become ready and retry initialization', async () => {
      const testService = new UnleashService(configService, infisicalService);

      // Mock initialization to fail first time, succeed second time
      let callCount = 0;
      infisicalService.getSecret.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt fails'));
        }
        return Promise.resolve('api-key');
      });

      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      const startTime = Date.now();
      await testService.waitForReady(10000, 500); // 10s timeout, 500ms retry interval
      const elapsedTime = Date.now() - startTime;

      expect(testService.isReady()).toBe(true);
      expect(elapsedTime).toBeGreaterThan(400); // Should have waited at least one retry interval
      expect(elapsedTime).toBeLessThan(2000); // Should not take too long
    });

    it('should timeout when service fails to become ready within timeout', async () => {
      const testService = new UnleashService(configService, infisicalService);

      // Mock initialization to always fail
      infisicalService.getSecret.mockRejectedValue(new Error('Always fails'));

      const startTime = Date.now();
      
      await expect(testService.waitForReady(1000, 200)).rejects.toThrow(
        'UnleashService failed to become ready within 1000ms'
      );

      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(1000); // Should wait for full timeout
    });

    it('should handle initialization retries correctly', async () => {
      const testService = new UnleashService(configService, infisicalService);

      // Mock to succeed on third attempt
      let initializeCallCount = 0;
      infisicalService.getSecret.mockImplementation(() => {
        initializeCallCount++;
        if (initializeCallCount <= 2) {
          return Promise.reject(new Error(`Attempt ${initializeCallCount} fails`));
        }
        return Promise.resolve('api-key');
      });

      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      await testService.waitForReady(10000, 200);

      expect(testService.isReady()).toBe(true);
      expect(initializeCallCount).toBe(3); // Should have retried 3 times total
    });
  });

  describe('isOperational', () => {
    it('should return false when service is disabled', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new UnleashService(configService, infisicalService);

      expect(testService.isOperational()).toBe(false);
    });

    it('should return false when not initialized', () => {
      expect(service.isOperational()).toBe(false);
    });

    it('should return true when properly initialized', async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });

      await service.onModuleInit();

      expect(service.isOperational()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration without client key', () => {
      const config = service.getConfig();

      expect(config).toHaveProperty('enabled', true);
      expect(config).toHaveProperty('url', 'https://unleash.example.com');
      expect(config).toHaveProperty('appName', 'emily-ai-agent');
      expect(config).toHaveProperty('environment', 'development');
      expect(config).not.toHaveProperty('clientKey');
    });
  });

  describe('Error Classes', () => {
    describe('UnleashConfigFetchError', () => {
      it('should create error with config key and cause', () => {
        const configKey = 'TEST_CONFIG';
        const cause = new Error('Original error');
        const error = new UnleashConfigFetchError('Fetch failed', configKey, cause);

        expect(error.message).toBe('Fetch failed');
        expect(error.code).toBe('UNLEASH_CONFIG_FETCH_ERROR');
        expect(error.configKey).toBe(configKey);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('UnleashConfigFetchError');
      });
    });

    describe('UnleashInitializationError', () => {
      it('should create initialization error', () => {
        const error = new UnleashInitializationError('Init failed');

        expect(error.message).toBe('Init failed');
        expect(error.code).toBe('UNLEASH_INITIALIZATION_ERROR');
        expect(error.name).toBe('UnleashInitializationError');
      });
    });
  });

  describe('Intelligent Logging Behavior', () => {
    beforeEach(async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();

      // Clear initialization logs
      mockLogger.log.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.debug.mockClear();
      mockLogger.error.mockClear();
    });

    it('should log at DEBUG level when config retrieved from Unleash', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(mockVariant);

      await service.getConfigValue('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config value 'TEST_CONFIG' retrieved from Unleash");
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log at DEBUG level when config retrieved from cache', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(mockVariant);

      // First call to cache
      await service.getConfigValue('TEST_CONFIG');

      // Clear previous logs
      mockLogger.debug.mockClear();

      // Second call should use cache
      await service.getConfigValue('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config value 'TEST_CONFIG' retrieved from cache");
    });

    it('should log at DEBUG level when config retrieved from environment', async () => {
      process.env.TEST_CONFIG = 'env-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);

      await service.getConfigValue('TEST_CONFIG');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config value 'TEST_CONFIG' retrieved from environment variable");
    });

    it('should log at DEBUG level when using default value', async () => {
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);
      delete process.env.TEST_CONFIG;

      await service.getConfigValue('TEST_CONFIG', 'default-value');

      expect(mockLogger.debug).toHaveBeenCalledWith("Config value 'TEST_CONFIG' using provided default value");
    });

    it('should log at WARN level when config not found in any source', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'false';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          default:
            return 'test';
        }
      });

      const testService = new UnleashService(configService, infisicalService);
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await testService.onModuleInit();

      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(false);
      delete process.env.TEST_CONFIG;

      await testService.getConfigValue('TEST_CONFIG');

      expect(mockLogger.warn).toHaveBeenCalledWith("Config value 'TEST_CONFIG' not found in any source (Unleash, environment, or defaults)");
    });
  });

  describe('Edge cases and variant handling', () => {
    beforeEach(async () => {
      infisicalService.getSecret.mockResolvedValue('api-key');
      mockUnleashClient.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
        return undefined as any;
      });
      await service.onModuleInit();
    });

    it('should handle variant without payload', async () => {
      process.env.TEST_CONFIG = 'fallback-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue({
        name: 'variant',
        enabled: true,
        // No payload property
      } as any);

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('fallback-value');
    });

    it('should handle variant with null payload', async () => {
      process.env.TEST_CONFIG = 'fallback-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue({
        name: 'variant',
        enabled: true,
        payload: null,
      } as any);

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('fallback-value');
    });

    it('should handle null variant response', async () => {
      process.env.TEST_CONFIG = 'fallback-value';
      (isEnabled as jest.MockedFunction<typeof isEnabled>).mockReturnValue(true);
      (getVariant as jest.MockedFunction<typeof getVariant>).mockReturnValue(null as any);

      const result = await service.getConfigValue('TEST_CONFIG');

      expect(result).toBe('fallback-value');
    });
  });
});
