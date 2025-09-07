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

describe('InfisicalService - Intelligent Logging Behavior', () => {
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

  const _mockSecrets = [
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

    // Initialize service for logging tests
    mockSecretsClient.listSecrets.mockResolvedValue({ secrets: [] });
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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
      // Should not log debug for successful retrieval
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
      // Should not log debug for successful retrieval from cache
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
      // Should not log debug for successful retrieval from environment
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
      // Should not log debug for successful retrieval from environment
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
      // Should not log debug when using default value
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
      // Should not log debug when using default value
      expect(mockLogger.debug).not.toHaveBeenCalled();
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

      // Verify no debug logs for successful retrievals, only warn for missing
      expect(mockLogger.debug).not.toHaveBeenCalled();
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
