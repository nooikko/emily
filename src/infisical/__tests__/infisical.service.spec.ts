import { InfisicalSDK } from '@infisical/sdk';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalService } from '../infisical.service';

// Create proper mock types that match the SDK structure
interface MockSecretsClient {
  listSecrets: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  getSecret: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  listSecretsWithImports: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  updateSecret: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  createSecret: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  deleteSecret: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  apiClient?: unknown;
}

interface MockAuthClient {
  universalAuth: {
    login: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
    renew: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  };
  awsIamAuth: {
    login: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
    renew: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  };
  getAccessToken: jest.MockedFunction<(...args: any[]) => any>;
  accessToken: jest.MockedFunction<(...args: any[]) => any>;
}

interface MockInfisicalSDK {
  auth: jest.MockedFunction<() => MockAuthClient>;
  secrets: jest.MockedFunction<() => MockSecretsClient>;
}

// Mock the InfisicalSDK module
jest.mock('@infisical/sdk', () => ({
  InfisicalSDK: jest.fn().mockImplementation(() => {
    const mockSecretsClient: MockSecretsClient = {
      listSecrets: jest.fn(),
      getSecret: jest.fn(),
      listSecretsWithImports: jest.fn(),
      updateSecret: jest.fn(),
      createSecret: jest.fn(),
      deleteSecret: jest.fn(),
    };

    const mockAuthClient: MockAuthClient = {
      universalAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      awsIamAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      getAccessToken: jest.fn(),
      accessToken: jest.fn(),
    };

    return {
      auth: jest.fn(() => mockAuthClient),
      secrets: jest.fn(() => mockSecretsClient),
    } as MockInfisicalSDK;
  }),
}));

describe('InfisicalService', () => {
  let service: InfisicalService;
  let configService: jest.Mocked<ConfigService>;
  let mockInfisicalClient: MockInfisicalSDK;
  let mockAuthenticatedClient: MockInfisicalSDK;
  let mockSecretsClient: MockSecretsClient;
  let mockAuthClient: MockAuthClient;
  let mockLogger: jest.Mocked<Logger>;

  // Mock data for testing
  const mockSecret = {
    id: 'secret-id',
    secretKey: 'TEST_SECRET',
    secretValue: 'secret-value',
    workspace: 'workspace-id',
    environment: 'development',
    type: 'shared',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSecrets = [
    mockSecret,
    {
      id: 'secret-id-2',
      secretKey: 'ANOTHER_SECRET',
      secretValue: 'another-value',
      workspace: 'workspace-id',
      environment: 'development',
      type: 'shared',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    // Reset process.env before each test
    delete process.env.TEST_SECRET;
    delete process.env.ANOTHER_SECRET;

    // Mock the Logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as Partial<Logger> as jest.Mocked<Logger>;

    // Spy on Logger constructor to return our mock
    jest.spyOn(Logger.prototype, 'log').mockImplementation(mockLogger.log);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(mockLogger.error);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(mockLogger.warn);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(mockLogger.debug);

    // Create mock instances with proper typing
    mockSecretsClient = {
      listSecrets: jest.fn(),
      getSecret: jest.fn(),
      listSecretsWithImports: jest.fn(),
      updateSecret: jest.fn(),
      createSecret: jest.fn(),
      deleteSecret: jest.fn(),
    };

    mockAuthClient = {
      universalAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      awsIamAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
      getAccessToken: jest.fn(),
      accessToken: jest.fn(),
    };

    mockAuthenticatedClient = {
      auth: jest.fn(() => mockAuthClient),
      secrets: jest.fn(() => mockSecretsClient),
    };

    mockInfisicalClient = {
      auth: jest.fn(() => mockAuthClient),
      secrets: jest.fn(() => mockSecretsClient),
    };

    // Setup the universal auth login to return the authenticated client
    mockAuthClient.universalAuth.login.mockResolvedValue(mockAuthenticatedClient as any);

    // Reset the InfisicalSDK mock to ensure clean state
    (InfisicalSDK as jest.MockedClass<typeof InfisicalSDK>).mockClear();
    (InfisicalSDK as jest.MockedClass<typeof InfisicalSDK>).mockImplementation(() => mockInfisicalClient as any);

    // Create a mock configService with default configuration
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfisicalService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<InfisicalService>(InfisicalService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with default configuration', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          case 'NODE_ENV':
            return 'test';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const config = testService.getConfig();

      expect(config.enabled).toBe(false); // Disabled by default when not provided
      expect(config.cacheTtl).toBe(300000);
      expect(config.fallbackToEnv).toBe(true);
      expect(config.environment).toBe('test');
    });

    it('should create service with enabled configuration', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_SITE_URL':
            return 'https://app.infisical.com';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'production';
          case 'INFISICAL_CACHE_TTL':
            return '600000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'false';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const config = testService.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.siteUrl).toBe('https://app.infisical.com');
      expect(config.clientId).toBe('test-client-id');
      expect(config.projectId).toBe('test-project-id');
      expect(config.environment).toBe('production');
      expect(config.cacheTtl).toBe(600000);
      expect(config.fallbackToEnv).toBe(false);
    });

    it('should throw error for invalid cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return 'invalid-number';
          default:
            return undefined;
        }
      });

      expect(() => new InfisicalService(configService)).toThrow('Invalid INFISICAL_CACHE_TTL value: invalid-number. Must be a positive number.');
    });

    it('should throw error for negative cache TTL', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '-1000';
          default:
            return undefined;
        }
      });

      expect(() => new InfisicalService(configService)).toThrow('Invalid INFISICAL_CACHE_TTL value: -1000. Must be a positive number.');
    });
  });

  describe('onModuleInit', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });
    });

    it('should skip initialization when credentials are missing', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined; // No credentials provided
        }
      });

      const testService = new InfisicalService(configService);
      await testService.onModuleInit();

      expect(testService.isOperational()).toBe(false);
    });

    it('should initialize successfully with valid configuration - wrapped response format', async () => {
      // Create a new service instance with enabled configuration
      const testService = new InfisicalService(configService);

      // Mock the list secrets call for connection test - wrapped format
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });

      await testService.onModuleInit();

      expect(InfisicalSDK).toHaveBeenCalledWith({
        siteUrl: undefined,
      });
      expect(mockAuthClient.universalAuth.login).toHaveBeenCalledWith({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      expect(mockSecretsClient.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
      });
      expect(testService.isOperational()).toBe(true);
    });

    it('should initialize successfully with valid configuration - direct array response format', async () => {
      // Mock the list secrets call for connection test - direct array format
      mockSecretsClient.listSecrets.mockResolvedValue([]);

      await service.onModuleInit();

      expect(InfisicalSDK).toHaveBeenCalledWith({
        siteUrl: undefined,
      });
      expect(mockAuthClient.universalAuth.login).toHaveBeenCalledWith({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      expect(mockSecretsClient.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
      });
      expect(service.isOperational()).toBe(true);
    });

    it('should initialize successfully with secrets - wrapped response format', async () => {
      // Mock the list secrets call with actual secrets in wrapped format
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: mockSecrets });

      await service.onModuleInit();

      expect(service.isOperational()).toBe(true);
    });

    it('should initialize successfully with secrets - direct array response format', async () => {
      // Mock the list secrets call with actual secrets in direct array format
      mockSecretsClient.listSecrets.mockResolvedValue(mockSecrets);

      await service.onModuleInit();

      expect(service.isOperational()).toBe(true);
    });

    it('should handle invalid response format during initialization', async () => {
      // Mock invalid response format (neither array nor wrapped object)
      mockSecretsClient.listSecrets.mockResolvedValue('invalid-response' as any);

      await service.onModuleInit();

      expect(service.isOperational()).toBe(true); // Should still be operational with empty secrets
    });

    it('should warn and skip initialization with incomplete credentials', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          // Missing client secret and project ID
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      await testService.onModuleInit();

      expect(testService.isOperational()).toBe(false);
    });

    it('should handle authentication failure and fallback when enabled', async () => {
      mockInfisicalClient.auth().universalAuth.login = jest.fn().mockRejectedValue(new Error('Auth failed'));

      await service.onModuleInit();

      expect(service.isOperational()).toBe(false);
    });

    it('should throw error on authentication failure when fallback is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'false';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      mockInfisicalClient.auth().universalAuth.login = jest.fn().mockRejectedValue(new Error('Auth failed'));

      await expect(testService.onModuleInit()).rejects.toThrow('Auth failed');
    });
  });

  describe('getSecret', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });
    });

    it('should return cached secret when available and not expired', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue({
        ...mockSecret,
        secretValue: 'cached-value',
      });
      await service.onModuleInit();

      // Verify service is operational before testing caching
      expect(service.isOperational()).toBe(true);

      // First call to cache the value
      const firstResult = await service.getSecret('TEST_SECRET');
      expect(firstResult).toBe('cached-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
        secretName: 'TEST_SECRET',
      });

      // Clear the mock to verify cache is used
      mockSecretsClient.getSecret.mockClear();

      // Second call should use cache
      const result = await service.getSecret('TEST_SECRET');

      expect(result).toBe('cached-value');
      expect(mockSecretsClient.getSecret).not.toHaveBeenCalled();
    });

    it('should fetch from Infisical when cache is expired', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue(mockSecret);
      await service.onModuleInit();

      // First call to cache the value, then simulate expiry by advancing time
      mockSecretsClient.getSecret.mockResolvedValueOnce({
        ...mockSecret,
        secretValue: 'cached-value',
      });
      await service.getSecret('TEST_SECRET');

      // Mock Date.now to simulate cache expiry
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 400000); // Advance time

      // Set up the actual value to be returned on cache miss
      mockSecretsClient.getSecret.mockResolvedValueOnce(mockSecret);

      const result = await service.getSecret('TEST_SECRET');

      expect(result).toBe('secret-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
        secretName: 'TEST_SECRET',
      });
    });

    it('should fetch from Infisical successfully and cache result', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue(mockSecret);
      await service.onModuleInit();

      // Clear call count after initialization
      mockSecretsClient.getSecret.mockClear();

      const result = await service.getSecret('TEST_SECRET');

      expect(result).toBe('secret-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
        secretName: 'TEST_SECRET',
      });
      expect(mockSecretsClient.getSecret).toHaveBeenCalledTimes(1);

      // Verify caching by calling again immediately and checking no additional API call was made
      const secondResult = await service.getSecret('TEST_SECRET');
      expect(secondResult).toBe('secret-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledTimes(1); // Still only called once due to caching
    });

    it('should fallback to environment variable when Infisical is not operational', async () => {
      process.env.TEST_SECRET = 'env-value';

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined; // No credentials, so service won't be operational
        }
      });

      const testService = new InfisicalService(configService);
      const result = await testService.getSecret('TEST_SECRET');

      expect(result).toBe('env-value');
      expect(mockSecretsClient.getSecret).not.toHaveBeenCalled();
    });

    it('should fallback to environment variable when Infisical fetch fails', async () => {
      process.env.TEST_SECRET = 'env-fallback-value';

      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockRejectedValue(new Error('Network error'));
      await service.onModuleInit();

      const result = await service.getSecret('TEST_SECRET');

      expect(result).toBe('env-fallback-value');
    });

    it('should throw error when Infisical fails and fallback is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'false';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockRejectedValue(new Error('Network error'));
      await testService.onModuleInit();

      await expect(testService.getSecret('TEST_SECRET')).rejects.toThrow('Network error');
    });

    it('should return default value when secret not found and fallback disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'false';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue({
        ...mockSecret,
        secretValue: '', // Empty value
      });
      await testService.onModuleInit();

      const result = await testService.getSecret('NON_EXISTENT_SECRET', 'default-value');

      expect(result).toBe('default-value');
    });

    it('should handle invalid secret response format', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue({
        // Invalid response missing required fields
        secretKey: 'TEST_SECRET',
      } as any);
      await service.onModuleInit();

      process.env.TEST_SECRET = 'env-fallback';

      const result = await service.getSecret('TEST_SECRET');

      expect(result).toBe('env-fallback');
    });

    it('should fallback to environment when project ID is missing during initialization', async () => {
      process.env.TEST_SECRET = 'env-fallback';

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          // Missing project ID - this will cause initialization to fail
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const result = await testService.getSecret('TEST_SECRET');

      expect(result).toBe('env-fallback');
      expect(testService.isOperational()).toBe(false);
    });
  });

  describe('getSecrets', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });
    });

    it('should fetch multiple secrets from Infisical successfully - wrapped response format', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: mockSecrets }); // For actual call

      await service.onModuleInit();

      const result = await service.getSecrets(['TEST_SECRET', 'ANOTHER_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'secret-value',
        ANOTHER_SECRET: 'another-value',
      });
      expect(mockSecretsClient.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
      });

      // Verify both secrets are cached
      // Verify secrets were fetched successfully (avoid testing private cache directly)
      expect(result).toEqual({ TEST_SECRET: 'secret-value', ANOTHER_SECRET: 'another-value' });
    });

    it('should fetch multiple secrets from Infisical successfully - direct array response format', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce(mockSecrets); // Direct array for actual call

      await service.onModuleInit();

      const result = await service.getSecrets(['TEST_SECRET', 'ANOTHER_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'secret-value',
        ANOTHER_SECRET: 'another-value',
      });
      expect(mockSecretsClient.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
      });

      expect(result).toEqual({ TEST_SECRET: 'secret-value', ANOTHER_SECRET: 'another-value' });
    });

    it('should fallback to environment variables for missing secrets', async () => {
      process.env.TEST_SECRET = 'env-value';
      process.env.MISSING_SECRET = 'missing-env-value';

      // Set up initialized service with only one secret
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [mockSecret] }); // Only TEST_SECRET

      await service.onModuleInit();

      const result = await service.getSecrets(['TEST_SECRET', 'MISSING_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'secret-value',
        MISSING_SECRET: 'missing-env-value',
      });
    });

    it('should fallback to individual getSecret calls when batch fetch fails', async () => {
      process.env.TEST_SECRET = 'env-value-1';
      process.env.ANOTHER_SECRET = 'env-value-2';

      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockRejectedValueOnce(new Error('Batch fetch failed')); // For actual call

      await service.onModuleInit();

      // Mock individual getSecret calls
      jest.spyOn(service, 'getSecret').mockResolvedValueOnce('env-value-1').mockResolvedValueOnce('env-value-2');

      const result = await service.getSecrets(['TEST_SECRET', 'ANOTHER_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'env-value-1',
        ANOTHER_SECRET: 'env-value-2',
      });
      expect(service.getSecret).toHaveBeenCalledWith('TEST_SECRET');
      expect(service.getSecret).toHaveBeenCalledWith('ANOTHER_SECRET');
    });

    it('should use individual getSecret when Infisical is not operational', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined; // No credentials, so service won't be operational
        }
      });

      const testService = new InfisicalService(configService);

      jest.spyOn(testService, 'getSecret').mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

      const result = await testService.getSecrets(['SECRET1', 'SECRET2']);

      expect(result).toEqual({
        SECRET1: 'value-1',
        SECRET2: 'value-2',
      });
    });

    it('should handle invalid secrets list response format and throw error', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce('invalid-response' as any); // Invalid response format

      await service.onModuleInit();

      jest.spyOn(service, 'getSecret').mockResolvedValue('fallback-value');

      const result = await service.getSecrets(['TEST_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'fallback-value',
      });
      expect(service.getSecret).toHaveBeenCalledWith('TEST_SECRET');
    });

    it('should handle response with invalid secrets array format', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: 'not-an-array' } as any); // Invalid secrets array

      await service.onModuleInit();

      jest.spyOn(service, 'getSecret').mockResolvedValue('fallback-value');

      const result = await service.getSecrets(['TEST_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'fallback-value',
      });
      expect(service.getSecret).toHaveBeenCalledWith('TEST_SECRET');
    });

    it('should handle response with null/undefined secrets in wrapped format', async () => {
      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: null } as any); // Null secrets

      await service.onModuleInit();

      jest.spyOn(service, 'getSecret').mockResolvedValue('fallback-value');

      const result = await service.getSecrets(['TEST_SECRET']);

      expect(result).toEqual({
        TEST_SECRET: 'fallback-value',
      });
      expect(service.getSecret).toHaveBeenCalledWith('TEST_SECRET');
    });

    it('should throw error when invalid response format encountered and fallback disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'false'; // Fallback disabled
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Set up initialized service
      mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] }); // For initialization
      mockSecretsClient.listSecrets.mockResolvedValueOnce('invalid-response' as any); // Invalid format
      await testService.onModuleInit();

      await expect(testService.getSecrets(['TEST_SECRET'])).rejects.toThrow('Invalid secrets list response format from Infisical');
    });

    it('should fallback to individual getSecret when project ID is missing during initialization', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          // Missing project ID - this will cause initialization to fail
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Mock the individual getSecret calls that will be used as fallback
      jest.spyOn(testService, 'getSecret').mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

      const result = await testService.getSecrets(['SECRET1', 'SECRET2']);

      expect(result).toEqual({
        SECRET1: 'value-1',
        SECRET2: 'value-2',
      });
      expect(testService.getSecret).toHaveBeenCalledWith('SECRET1');
      expect(testService.getSecret).toHaveBeenCalledWith('SECRET2');
    });
  });

  describe('clearCache', () => {
    it('should clear the secret cache', async () => {
      // First, set up service and cache a value
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      mockSecretsClient.getSecret.mockResolvedValue({ ...mockSecret, secretValue: 'test-value' });
      await service.onModuleInit();

      // Clear call count after initialization
      mockSecretsClient.getSecret.mockClear();

      // Cache a value
      const firstResult = await service.getSecret('TEST_SECRET');
      expect(firstResult).toBe('test-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledTimes(1);

      // Verify caching is working by calling again
      const cachedResult = await service.getSecret('TEST_SECRET');
      expect(cachedResult).toBe('test-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledTimes(1); // Still 1, from cache

      // Clear cache
      service.clearCache();

      // Verify cache was cleared by checking that API is called again
      mockSecretsClient.getSecret.mockResolvedValueOnce({ ...mockSecret, secretValue: 'fresh-value' });
      const newResult = await service.getSecret('TEST_SECRET');
      expect(newResult).toBe('fresh-value');
      expect(mockSecretsClient.getSecret).toHaveBeenCalledTimes(2); // Now called again
    });
  });

  describe('isOperational', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });
    });

    it('should return false when credentials are missing', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined; // No credentials provided
        }
      });

      const testService = new InfisicalService(configService);

      expect(testService.isOperational()).toBe(false);
    });

    it('should return false when not initialized', () => {
      expect(service.isOperational()).toBe(false);
    });

    it('should return true when properly initialized', async () => {
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      await service.onModuleInit();

      expect(service.isOperational()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration without client secret', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_SITE_URL':
            return 'https://app.infisical.com';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'secret-value';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const config = testService.getConfig();

      expect(config).toHaveProperty('enabled', true);
      expect(config).toHaveProperty('clientId', 'test-client-id');
      expect(config).toHaveProperty('projectId', 'test-project-id');
      expect(config).not.toHaveProperty('clientSecret');
    });
  });

  describe('Intelligent Logging Behavior', () => {
    beforeEach(async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      // Initialize service for logging tests
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      await service.onModuleInit();
    });

    describe('ValueSource.INFISICAL logging', () => {
      it('should log at DEBUG level when secret retrieved from Infisical', async () => {
        // Clear any logs from beforeEach initialization
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        mockSecretsClient.getSecret.mockResolvedValue({
          ...mockSecret,
          secretValue: 'infisical-value',
        });

        const result = await service.getSecret('TEST_SECRET');

        expect(result).toBe('infisical-value');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' retrieved from Infisical");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should log at DEBUG level for cached secrets from Infisical source', async () => {
        // First call to cache the value from Infisical
        mockSecretsClient.getSecret.mockResolvedValue({
          ...mockSecret,
          secretValue: 'cached-value',
        });
        await service.getSecret('TEST_SECRET');

        // Clear previous logs
        mockLogger.debug.mockClear();
        mockLogger.warn.mockClear();

        // Second call should use cache
        const result = await service.getSecret('TEST_SECRET');

        expect(result).toBe('cached-value');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' retrieved from cache");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('ValueSource.ENVIRONMENT logging', () => {
      it('should log at DEBUG level when secret retrieved from environment', async () => {
        process.env.TEST_SECRET = 'env-value';

        // Configure service to not be operational to force environment fallback
        const envMockConfig = {
          get: jest.fn((key: string) => {
            switch (key) {
              case 'INFISICAL_CACHE_TTL':
                return '300000';
              case 'INFISICAL_FALLBACK_TO_ENV':
                return 'true';
              default:
                return undefined; // No credentials, so service won't be operational
            }
          }),
        };

        const testService = new InfisicalService(envMockConfig as any);

        // Clear any initialization logs
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        const result = await testService.getSecret('TEST_SECRET');

        expect(result).toBe('env-value');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' retrieved from environment variable");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should log at DEBUG level when falling back to environment after Infisical failure', async () => {
        process.env.TEST_SECRET = 'env-fallback';

        // Use a fresh service initialized with operational Infisical but forced to fail
        const fallbackMockConfig = {
          get: jest.fn((key: string) => {
            switch (key) {
              case 'INFISICAL_ENABLED':
                return 'true';
              case 'INFISICAL_CLIENT_ID':
                return 'test-client-id';
              case 'INFISICAL_CLIENT_SECRET':
                return 'test-client-secret';
              case 'INFISICAL_PROJECT_ID':
                return 'test-project-id';
              case 'INFISICAL_ENVIRONMENT':
                return 'development';
              case 'INFISICAL_CACHE_TTL':
                return '300000';
              case 'INFISICAL_FALLBACK_TO_ENV':
                return 'true';
              default:
                return undefined;
            }
          }),
        };

        const fallbackTestService = new InfisicalService(fallbackMockConfig as any);

        // Initialize the service
        mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] });
        await fallbackTestService.onModuleInit();

        // Clear initialization logs
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        // Now make getSecret fail to trigger fallback
        mockSecretsClient.getSecret.mockRejectedValue(new Error('Infisical error'));

        const result = await fallbackTestService.getSecret('TEST_SECRET');

        expect(result).toBe('env-fallback');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' retrieved from environment variable");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('ValueSource.DEFAULT logging', () => {
      it('should log at DEBUG level when using default value', async () => {
        // Configure to not fallback to env and no Infisical secret found
        const defaultMockConfig = {
          get: jest.fn((key: string) => {
            switch (key) {
              case 'INFISICAL_ENABLED':
                return 'true';
              case 'INFISICAL_CLIENT_ID':
                return 'test-client-id';
              case 'INFISICAL_CLIENT_SECRET':
                return 'test-client-secret';
              case 'INFISICAL_PROJECT_ID':
                return 'test-project-id';
              case 'INFISICAL_FALLBACK_TO_ENV':
                return 'false'; // No fallback to env
              case 'INFISICAL_CACHE_TTL':
                return '300000';
              default:
                return undefined;
            }
          }),
        };

        const testService = new InfisicalService(defaultMockConfig as any);
        mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
        mockSecretsClient.getSecret.mockResolvedValue({
          ...mockSecret,
          secretValue: '', // Empty value to trigger default
        });
        await testService.onModuleInit();

        // Clear initialization logs
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        const result = await testService.getSecret('NON_EXISTENT_SECRET', 'default-value');

        expect(result).toBe('default-value');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'NON_EXISTENT_SECRET' using provided default value");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should log at DEBUG level when using default after environment check fails', async () => {
        // Environment variable not set, should use default
        delete process.env.TEST_SECRET;

        const defaultEnvMockConfig = {
          get: jest.fn((key: string) => {
            switch (key) {
              case 'INFISICAL_CACHE_TTL':
                return '300000';
              case 'INFISICAL_FALLBACK_TO_ENV':
                return 'true';
              default:
                return undefined; // No credentials, so service won't be operational
            }
          }),
        };

        const testService = new InfisicalService(defaultEnvMockConfig as any);

        // Clear initialization logs
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        const result = await testService.getSecret('TEST_SECRET', 'my-default');

        expect(result).toBe('my-default');
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' using provided default value");
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('ValueSource null (not found) logging', () => {
      it('should log at WARN level when secret not found in any source', async () => {
        // Configure to not use defaults and not fallback to env
        configService.get.mockImplementation((key: string) => {
          switch (key) {
            case 'INFISICAL_ENABLED':
              return 'true';
            case 'INFISICAL_CLIENT_ID':
              return 'test-client-id';
            case 'INFISICAL_CLIENT_SECRET':
              return 'test-client-secret';
            case 'INFISICAL_PROJECT_ID':
              return 'test-project-id';
            case 'INFISICAL_FALLBACK_TO_ENV':
              return 'false'; // No fallback to env
            case 'INFISICAL_CACHE_TTL':
              return '300000';
            default:
              return undefined;
          }
        });

        const testService = new InfisicalService(configService);
        mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
        mockSecretsClient.getSecret.mockResolvedValue({
          ...mockSecret,
          secretValue: '', // Empty value
        });
        await testService.onModuleInit();

        // Don't provide default value
        const result = await testService.getSecret('NON_EXISTENT_SECRET');

        expect(result).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith("Secret 'NON_EXISTENT_SECRET' not found in any source (Infisical, environment, or defaults)");
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log at WARN level when secret not found and no fallback enabled', async () => {
        // Environment variable not set, no default provided
        delete process.env.MISSING_SECRET;

        configService.get.mockImplementation((key: string) => {
          switch (key) {
            case 'INFISICAL_CACHE_TTL':
              return '300000';
            case 'INFISICAL_FALLBACK_TO_ENV':
              return 'true'; // Fallback enabled but no env var
            default:
              return undefined; // No credentials, so service won't be operational
          }
        });

        const testService = new InfisicalService(configService);
        const result = await testService.getSecret('MISSING_SECRET'); // No default

        expect(result).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith("Secret 'MISSING_SECRET' not found in any source (Infisical, environment, or defaults)");
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });
    });

    describe('Logging in batch operations', () => {
      it('should log correctly for mixed sources in getSecrets', async () => {
        process.env.ENV_ONLY_SECRET = 'env-value';
        delete process.env.MISSING_SECRET;

        // Create a fresh service for this test to avoid mock conflicts
        const batchMockConfig = {
          get: jest.fn((key: string) => {
            switch (key) {
              case 'INFISICAL_ENABLED':
                return 'true';
              case 'INFISICAL_CLIENT_ID':
                return 'test-client-id';
              case 'INFISICAL_CLIENT_SECRET':
                return 'test-client-secret';
              case 'INFISICAL_PROJECT_ID':
                return 'test-project-id';
              case 'INFISICAL_ENVIRONMENT':
                return 'development';
              case 'INFISICAL_CACHE_TTL':
                return '300000';
              case 'INFISICAL_FALLBACK_TO_ENV':
                return 'true';
              default:
                return undefined;
            }
          }),
        };

        const batchTestService = new InfisicalService(batchMockConfig as any);

        // Mock for initialization
        mockSecretsClient.listSecrets.mockResolvedValueOnce({ secrets: [] });
        await batchTestService.onModuleInit();

        // Clear initialization logs
        mockLogger.log.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        // Mock for the actual getSecrets call - return TEST_SECRET from Infisical
        mockSecretsClient.listSecrets.mockResolvedValueOnce({
          secrets: [mockSecret], // Only TEST_SECRET in Infisical
        });

        const result = await batchTestService.getSecrets(['TEST_SECRET', 'ENV_ONLY_SECRET', 'MISSING_SECRET']);

        expect(result).toEqual({
          TEST_SECRET: 'secret-value',
          ENV_ONLY_SECRET: 'env-value',
          MISSING_SECRET: undefined,
        });

        // Verify different log levels for different sources
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'TEST_SECRET' retrieved from Infisical");
        expect(mockLogger.debug).toHaveBeenCalledWith("Secret 'ENV_ONLY_SECRET' retrieved from environment variable");
        expect(mockLogger.warn).toHaveBeenCalledWith("Secret 'MISSING_SECRET' not found in any source (Infisical, environment, or defaults)");
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle unknown source gracefully', async () => {
        // This tests the defensive programming case in logSecretRetrieval
        const testService = new InfisicalService(configService);

        // Use reflection to access and test the private method
        const privateMethod = (testService as any).logSecretRetrieval.bind(testService);

        // Test with an unknown source value
        privateMethod('TEST_KEY', {
          value: 'test-value',
          source: 'unknown-source' as any,
          found: true,
        });

        expect(mockLogger.warn).toHaveBeenCalledWith("Secret 'TEST_KEY' retrieved from unknown source: unknown-source");
      });
    });
  });

  describe('isReady', () => {
    it('should return true when Infisical is disabled', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'false';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      expect(testService.isReady()).toBe(true);
    });

    it('should return false when Infisical is enabled but not initialized', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      expect(testService.isReady()).toBe(false);
    });

    it('should return true when Infisical is enabled and properly initialized', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      await testService.onModuleInit();

      expect(testService.isReady()).toBe(true);
    });

    it('should return false when initialization failed but fallback is enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      mockAuthClient.universalAuth.login.mockRejectedValue(new Error('Auth failed'));

      await testService.onModuleInit(); // Should not throw due to fallback

      expect(testService.isReady()).toBe(false);
    });
  });

  describe('waitForReady', () => {
    it('should resolve immediately when service is already ready (disabled)', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'false';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const startTime = Date.now();

      await testService.waitForReady(5000);
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(100); // Should resolve immediately
    });

    it('should resolve immediately when service is already initialized', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      await testService.onModuleInit();

      const startTime = Date.now();
      await testService.waitForReady(5000);
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(100); // Should resolve immediately
    });

    it('should wait for service to become ready and retry initialization', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Mock initialization to fail first time, succeed second time
      let callCount = 0;
      mockSecretsClient.listSecrets.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt fails'));
        }
        return Promise.resolve({ secrets: [] });
      });

      const startTime = Date.now();
      await testService.waitForReady(10000, 500); // 10s timeout, 500ms retry interval
      const elapsedTime = Date.now() - startTime;

      expect(testService.isReady()).toBe(true);
      expect(elapsedTime).toBeGreaterThan(400); // Should have waited at least one retry interval
      expect(elapsedTime).toBeLessThan(2000); // Should not take too long
    });

    it('should timeout when service fails to become ready within timeout', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Mock initialization to always fail
      mockSecretsClient.listSecrets.mockRejectedValue(new Error('Always fails'));

      const startTime = Date.now();
      
      await expect(testService.waitForReady(1000, 200)).rejects.toThrow(
        'InfisicalService failed to become ready within 1000ms'
      );

      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(1000); // Should wait for full timeout
    });

    it('should use custom timeout and retry interval values', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Mock to succeed on second attempt
      let callCount = 0;
      mockSecretsClient.listSecrets.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt fails'));
        }
        return Promise.resolve({ secrets: [] });
      });

      const customTimeout = 5000;
      const customRetryInterval = 300;
      const startTime = Date.now();

      await testService.waitForReady(customTimeout, customRetryInterval);
      
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(customRetryInterval - 50); // Account for timing precision
      expect(elapsedTime).toBeLessThan(customTimeout);
      expect(testService.isReady()).toBe(true);
    });

    it('should handle initialization retries correctly', async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);

      // Mock to succeed on third attempt
      let initializeCallCount = 0;
      mockSecretsClient.listSecrets.mockImplementation(() => {
        initializeCallCount++;
        if (initializeCallCount <= 2) {
          return Promise.reject(new Error(`Attempt ${initializeCallCount} fails`));
        }
        return Promise.resolve({ secrets: [] });
      });

      // Spy on the private initialize method indirectly by checking isOperational state
      await testService.waitForReady(10000, 200);

      expect(testService.isReady()).toBe(true);
      expect(initializeCallCount).toBe(3); // Should have retried 3 times total
    });
  });

  describe('getSecretWithSource method testing', () => {
    beforeEach(async () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'development';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
      await service.onModuleInit();
    });

    it('should return correct SecretResult with INFISICAL source', async () => {
      mockSecretsClient.getSecret.mockResolvedValue({
        ...mockSecret,
        secretValue: 'infisical-secret',
      });

      // Use reflection to test the private method
      const privateMethod = (service as any).getSecretWithSource.bind(service);
      const result = await privateMethod('TEST_SECRET');

      expect(result).toEqual({
        value: 'infisical-secret',
        source: 'infisical',
        found: true,
      });
    });

    it('should return correct SecretResult with CACHE source', async () => {
      mockSecretsClient.getSecret.mockResolvedValue({
        ...mockSecret,
        secretValue: 'cached-value',
      });

      const privateMethod = (service as any).getSecretWithSource.bind(service);

      // First call to cache the value
      await privateMethod('TEST_SECRET');

      // Second call should return from cache
      const result = await privateMethod('TEST_SECRET');

      expect(result).toEqual({
        value: 'cached-value',
        source: 'cache',
        found: true,
      });
    });

    it('should return correct SecretResult with ENVIRONMENT source', async () => {
      process.env.TEST_SECRET = 'env-value';

      // Configure non-operational service
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const privateMethod = (testService as any).getSecretWithSource.bind(testService);
      const result = await privateMethod('TEST_SECRET');

      expect(result).toEqual({
        value: 'env-value',
        source: 'environment',
        found: true,
      });
    });

    it('should return correct SecretResult with DEFAULT source', async () => {
      delete process.env.TEST_SECRET;

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const privateMethod = (testService as any).getSecretWithSource.bind(testService);
      const result = await privateMethod('TEST_SECRET', 'default-value');

      expect(result).toEqual({
        value: 'default-value',
        source: 'default',
        found: true,
      });
    });

    it('should return correct SecretResult with null source when not found', async () => {
      delete process.env.TEST_SECRET;

      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';
          default:
            return undefined;
        }
      });

      const testService = new InfisicalService(configService);
      const privateMethod = (testService as any).getSecretWithSource.bind(testService);
      const result = await privateMethod('TEST_SECRET'); // No default

      expect(result).toEqual({
        value: undefined,
        source: null,
        found: false,
      });
    });
  });
});
