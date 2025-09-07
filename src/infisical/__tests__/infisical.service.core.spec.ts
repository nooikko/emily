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
  getAccessToken: jest.MockedFunction<() => Promise<string>>;
  accessToken: jest.MockedFunction<() => Promise<string>>;
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

describe('InfisicalService - Core Functionality', () => {
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

      // Mock the list secrets call with actual secrets in wrapped format
      mockSecretsClient.listSecrets.mockResolvedValue({ secrets: mockSecrets });

      await service.onModuleInit();

      expect(service.isOperational()).toBe(true);
    });

    it('should initialize successfully with secrets - direct array response format', async () => {
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
});
