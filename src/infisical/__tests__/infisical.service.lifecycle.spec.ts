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

describe('InfisicalService - Lifecycle and Readiness', () => {
  let service: InfisicalService;
  let configService: jest.Mocked<ConfigService>;
  let mockInfisicalClient: MockInfisicalSDK;
  let mockAuthenticatedClient: MockInfisicalSDK;
  let mockSecretsClient: MockSecretsClient;
  let mockAuthClient: MockAuthClient;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
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

      await expect(testService.waitForReady(1000, 200)).rejects.toThrow('InfisicalService failed to become ready within 1000ms');

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
