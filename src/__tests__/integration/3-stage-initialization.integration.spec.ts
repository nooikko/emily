/**
 * Integration tests for 3-stage initialization system
 * Tests the complete flow: Infisical → Unleash → UnifiedConfig
 * 
 * This test file validates:
 * 1. Services start in correct order
 * 2. Dependencies are properly resolved
 * 3. Timeout and error handling works across services
 * 4. Degraded mode operation when services fail
 * 5. Complete initialization sequence timing
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalService } from '../../infisical/infisical.service';
import { UnleashService } from '../../unleash/unleash.service';
import { ConfigSource, UnifiedConfigService } from '../../config/services/unified-config.service';

// Mock external dependencies
jest.mock('@infisical/sdk', () => ({
  InfisicalSDK: jest.fn().mockImplementation(() => ({
    auth: jest.fn(() => ({
      universalAuth: {
        login: jest.fn(),
        renew: jest.fn(),
      },
    })),
    secrets: jest.fn(() => ({
      listSecrets: jest.fn(),
      getSecret: jest.fn(),
    })),
  })),
}));

jest.mock('unleash-client', () => ({
  initialize: jest.fn(),
  isEnabled: jest.fn(),
  getVariant: jest.fn(),
}));

describe('3-Stage Initialization Integration', () => {
  let infisicalService: InfisicalService;
  let unleashService: UnleashService;
  let unifiedConfigService: UnifiedConfigService;
  let configService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.TEST_CONFIG;
    delete process.env.UNLEASH_API_KEY;

    // Mock logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    jest.spyOn(Logger.prototype, 'log').mockImplementation(mockLogger.log);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(mockLogger.error);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(mockLogger.warn);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(mockLogger.debug);

    // Create comprehensive mock configuration
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          // Infisical configuration
          case 'INFISICAL_ENABLED':
            return 'true';
          case 'INFISICAL_CLIENT_ID':
            return 'test-client-id';
          case 'INFISICAL_CLIENT_SECRET':
            return 'test-client-secret';
          case 'INFISICAL_PROJECT_ID':
            return 'test-project-id';
          case 'INFISICAL_ENVIRONMENT':
            return 'test';
          case 'INFISICAL_CACHE_TTL':
            return '300000';
          case 'INFISICAL_FALLBACK_TO_ENV':
            return 'true';

          // Unleash configuration
          case 'UNLEASH_ENABLED':
            return 'true';
          case 'UNLEASH_URL':
            return 'https://unleash.example.com';
          case 'UNLEASH_APP_NAME':
            return 'emily-ai-agent';
          case 'UNLEASH_ENVIRONMENT':
            return 'test';
          case 'UNLEASH_CACHE_TTL':
            return '300000';
          case 'UNLEASH_FALLBACK_TO_ENV':
            return 'true';
          case 'UNLEASH_TIMEOUT':
            return '10000';

          // Unified Config configuration
          case 'UNIFIED_CONFIG_CACHE_TTL':
            return '300000';

          case 'NODE_ENV':
            return 'test';

          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfisicalService,
        UnleashService,
        UnifiedConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    infisicalService = module.get<InfisicalService>(InfisicalService);
    unleashService = module.get<UnleashService>(UnleashService);
    unifiedConfigService = module.get<UnifiedConfigService>(UnifiedConfigService);
    configService = module.get(ConfigService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Successful 3-Stage Initialization', () => {
    it('should initialize all services in correct order with proper dependencies', async () => {
      // Mock successful Infisical initialization
      const mockSecretsClient = {
        listSecrets: jest.fn().mockResolvedValue({ secrets: [] }),
        getSecret: jest.fn().mockResolvedValue({
          secretKey: 'UNLEASH_API_KEY',
          secretValue: 'unleash-api-key-123',
          id: 'secret-id',
          workspace: 'workspace-id',
          environment: 'test',
        }),
      };

      const mockAuthClient: any = {
        universalAuth: {
          login: jest.fn().mockResolvedValue({
            auth: jest.fn(() => mockAuthClient),
            secrets: jest.fn(() => mockSecretsClient),
          }),
        },
      };

      // Mock the SDK creation
      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => mockAuthClient),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      // Mock successful Unleash initialization
      const mockUnleashClient = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10); // Simulate async ready
          }
        }),
        destroy: jest.fn(),
      };

      const { initialize } = require('unleash-client');
      initialize.mockReturnValue(mockUnleashClient);

      // Track initialization timing and order
      const initializationOrder: string[] = [];
      const initializationTimes: Record<string, number> = {};

      // Spy on service initializations
      const originalInfisicalInit = infisicalService.onModuleInit;
      const originalUnleashInit = unleashService.onModuleInit;
      const originalUnifiedInit = unifiedConfigService.onModuleInit;

      jest.spyOn(infisicalService, 'onModuleInit').mockImplementation(async function(this: InfisicalService) {
        initializationOrder.push('Infisical');
        initializationTimes['Infisical'] = Date.now();
        return originalInfisicalInit.call(this);
      });

      jest.spyOn(unleashService, 'onModuleInit').mockImplementation(async function(this: UnleashService) {
        initializationOrder.push('Unleash');
        initializationTimes['Unleash'] = Date.now();
        return originalUnleashInit.call(this);
      });

      jest.spyOn(unifiedConfigService, 'onModuleInit').mockImplementation(async function(this: UnifiedConfigService) {
        initializationOrder.push('UnifiedConfig');
        initializationTimes['UnifiedConfig'] = Date.now();
        return originalUnifiedInit.call(this);
      });

      // Initialize services in the correct order (as would happen in NestJS)
      await infisicalService.onModuleInit();
      await unleashService.onModuleInit();
      await unifiedConfigService.onModuleInit();

      // Verify initialization order and dependencies
      expect(initializationOrder).toEqual(['Infisical', 'Unleash', 'UnifiedConfig']);
      
      // Verify all services are operational
      expect(infisicalService.isReady()).toBe(true);
      expect(unleashService.isReady()).toBe(true);
      expect(unifiedConfigService.isServiceReady()).toBe(true);

      // Verify Unleash waited for Infisical (through waitForReady call)
      expect(mockSecretsClient.getSecret).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'test',
        secretName: 'UNLEASH_API_KEY',
      });

      // Verify timing relationships
      expect(initializationTimes['Unleash']).toBeGreaterThanOrEqual(initializationTimes['Infisical']);
      expect(initializationTimes['UnifiedConfig']).toBeGreaterThanOrEqual(initializationTimes['Unleash']);
    });

    it('should provide end-to-end configuration retrieval through all stages', async () => {
      // Setup successful initialization (abbreviated)
      const mockSecretsClient = {
        listSecrets: jest.fn().mockResolvedValue({ secrets: [] }),
        getSecret: jest.fn().mockImplementation((options) => {
          if (options.secretName === 'UNLEASH_API_KEY') {
            return Promise.resolve({
              secretKey: 'UNLEASH_API_KEY',
              secretValue: 'unleash-api-key-123',
              id: 'secret-id',
              workspace: 'workspace-id',
              environment: 'test',
            });
          }
          if (options.secretName === 'DATABASE_URL') {
            return Promise.resolve({
              secretKey: 'DATABASE_URL',
              secretValue: 'postgresql://user:pass@host/db',
              id: 'secret-id-2',
              workspace: 'workspace-id',
              environment: 'test',
            });
          }
          return Promise.resolve({ secretValue: undefined });
        }),
      };

      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => ({
          universalAuth: {
            login: jest.fn().mockResolvedValue({
              auth: jest.fn(),
              secrets: jest.fn(() => mockSecretsClient),
            }),
          },
        })),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      const mockUnleashClient = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'ready') {
            setTimeout(callback, 5);
          }
        }),
        destroy: jest.fn(),
      };

      const { initialize, isEnabled, getVariant } = require('unleash-client');
      initialize.mockReturnValue(mockUnleashClient);
      isEnabled.mockImplementation((key: string) => {
        // Only enable specific feature flags that should exist in Unleash
        return ['FEATURE_CONFIG'].includes(key);
      });
      getVariant.mockImplementation((key: string) => {
        if (key === 'FEATURE_CONFIG') {
          return {
            name: 'feature-config',
            enabled: true,
            payload: {
              type: 'string',
              value: 'unleash-feature-value',
            },
          };
        }
        return null; // Return null for unknown keys
      });

      // Initialize all services
      await infisicalService.onModuleInit();
      await unleashService.onModuleInit();
      await unifiedConfigService.onModuleInit();

      // Test end-to-end configuration retrieval
      process.env.ENV_CONFIG = 'environment-value';

      // Test priority resolution through unified service
      const databaseUrl = await unifiedConfigService.getConfig('DATABASE_URL');
      const featureConfig = await unifiedConfigService.getConfig('FEATURE_CONFIG');
      const envConfig = await unifiedConfigService.getConfig('ENV_CONFIG');
      const missingConfig = await unifiedConfigService.getConfig('MISSING_CONFIG', {
        defaultValue: 'default-value',
      });

      // Verify correct values from correct sources
      expect(databaseUrl).toBe('postgresql://user:pass@host/db'); // From Infisical
      expect(featureConfig).toBe('unleash-feature-value'); // From Unleash
      expect(envConfig).toBe('environment-value'); // From Environment
      expect(missingConfig).toBe('default-value'); // Default

      // Verify priority was respected
      const metadata = await unifiedConfigService.getConfigWithMetadata('DATABASE_URL');
      expect(metadata.source).toBe(ConfigSource.INFISICAL);
      expect(metadata.found).toBe(true);
      expect(metadata.cached).toBe(true); // Should be cached since we requested it earlier
    });
  });

  describe('Degraded Mode Operation', () => {
    it('should operate in degraded mode when Infisical fails but Unleash succeeds', async () => {
      // Store original values for cleanup
      const originalInfisicalEnabled = process.env.INFISICAL_ENABLED;
      const originalUnleashApiKey = process.env.UNLEASH_API_KEY;
      const originalTestConfig = process.env.TEST_CONFIG;
      
      try {
        // Disable Infisical to simulate failure scenario
        process.env.INFISICAL_ENABLED = 'false';
        
        // Mock Infisical failure
        const { InfisicalSDK } = require('@infisical/sdk');
        InfisicalSDK.mockImplementation(() => {
          throw new Error('Infisical connection failed');
        });

        // Mock successful Unleash (using env fallback for API key)
        process.env.UNLEASH_API_KEY = 'env-unleash-key';
        const mockUnleashClient = {
          on: jest.fn((event: string, callback: (...args: any[]) => void) => {
            if (event === 'ready') {
              setTimeout(callback, 5);
            }
          }),
          destroy: jest.fn(),
        };

        const { initialize } = require('unleash-client');
        initialize.mockReturnValue(mockUnleashClient);

        // Initialize services
        await infisicalService.onModuleInit(); // Should not throw
        await unleashService.onModuleInit(); // Should succeed via env fallback
        await unifiedConfigService.onModuleInit(); // Should handle mixed state

        // Verify service states
        expect(infisicalService.isReady()).toBe(false);
        expect(unleashService.isReady()).toBe(true);
        expect(unifiedConfigService.isServiceReady()).toBe(false); // Mixed state = degraded

        // Verify degraded mode still works
        process.env.TEST_CONFIG = 'env-fallback';
        const config = await unifiedConfigService.getConfig('TEST_CONFIG');
        expect(config).toBe('env-fallback');
      } finally {
        // Restore environment variables
        if (originalInfisicalEnabled !== undefined) {
          process.env.INFISICAL_ENABLED = originalInfisicalEnabled;
        } else {
          delete process.env.INFISICAL_ENABLED;
        }
        if (originalUnleashApiKey !== undefined) {
          process.env.UNLEASH_API_KEY = originalUnleashApiKey;
        } else {
          delete process.env.UNLEASH_API_KEY;
        }
        if (originalTestConfig !== undefined) {
          process.env.TEST_CONFIG = originalTestConfig;
        } else {
          delete process.env.TEST_CONFIG;
        }
      }
    });

    it('should handle complete service failure gracefully', async () => {
      // Mock all services to fail
      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => {
        throw new Error('Infisical failed');
      });

      const { initialize } = require('unleash-client');
      initialize.mockImplementation(() => {
        throw new Error('Unleash failed');
      });

      // Initialize with failures
      await infisicalService.onModuleInit(); // Should not throw
      await unleashService.onModuleInit(); // Should not throw
      await unifiedConfigService.onModuleInit(); // Should not throw

      // All should be in failed/degraded state
      expect(infisicalService.isReady()).toBe(false);
      expect(unleashService.isReady()).toBe(false);
      expect(unifiedConfigService.isServiceReady()).toBe(false);

      // But environment variables should still work
      process.env.TEST_CONFIG = 'env-only';
      const config = await unifiedConfigService.getConfig('TEST_CONFIG');
      expect(config).toBe('env-only');

      // Verify appropriate warnings were logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('degraded mode')
      );
    });

    it('should handle timeout scenarios in initialization chain', async () => {
      // Mock Infisical with slow initialization
      let resolveInfisical: () => void;
      const infisicalPromise = new Promise<void>(resolve => {
        resolveInfisical = resolve;
      });

      const mockSecretsClient = {
        listSecrets: jest.fn(() => infisicalPromise.then(() => ({ secrets: [] }))),
        getSecret: jest.fn().mockResolvedValue({ secretValue: undefined }),
      };

      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => ({
          universalAuth: {
            login: jest.fn().mockResolvedValue({
              secrets: jest.fn(() => mockSecretsClient),
            }),
          },
        })),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      // Start initialization
      const infisicalInitPromise = infisicalService.onModuleInit();

      // Test waitForReady timeout
      const waitPromise = unleashService.onModuleInit();

      // Should timeout and fallback
      setTimeout(() => resolveInfisical(), 100); // Resolve after a delay

      await expect(waitPromise).resolves.not.toThrow(); // Should handle gracefully

      await infisicalInitPromise; // Complete Infisical init

      // Verify fallback behavior was triggered
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('despite Infisical failure')
      );
    });
  });

  describe('Concurrent Initialization Scenarios', () => {
    it('should handle concurrent service initialization attempts', async () => {
      // Setup successful mocks
      const mockSecretsClient = {
        listSecrets: jest.fn().mockResolvedValue({ secrets: [] }),
        getSecret: jest.fn().mockResolvedValue({
          secretKey: 'UNLEASH_API_KEY',
          secretValue: 'test-key',
          id: 'id',
          workspace: 'workspace',
          environment: 'test',
        }),
      };

      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => ({
          universalAuth: {
            login: jest.fn().mockResolvedValue({
              secrets: jest.fn(() => mockSecretsClient),
            }),
          },
        })),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      const mockUnleashClient = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'ready') {
            setTimeout(callback, 5);
          }
        }),
        destroy: jest.fn(),
      };

      const { initialize } = require('unleash-client');
      initialize.mockReturnValue(mockUnleashClient);

      // Start multiple concurrent initialization attempts
      const promises = [
        infisicalService.onModuleInit(),
        infisicalService.onModuleInit(),
        infisicalService.onModuleInit(),
      ];

      // All should complete without error
      await Promise.all(promises);

      // Service should be properly initialized (not multiple times)
      expect(infisicalService.isReady()).toBe(true);
      expect(InfisicalSDK).toHaveBeenCalledTimes(1); // Only initialized once
    });
  });

  describe('Configuration Priority Integration', () => {
    it('should respect configuration priority across the full stack', async () => {
      // Setup all services successfully
      const mockSecretsClient = {
        listSecrets: jest.fn().mockResolvedValue({ secrets: [] }),
        getSecret: jest.fn().mockImplementation((options) => {
          const secrets = {
            'UNLEASH_API_KEY': 'unleash-key',
            'PRIORITY_TEST': 'infisical-priority-value',
            'PARTIAL_CONFIG': 'infisical-partial',
          };
          return Promise.resolve({
            secretKey: options.secretName,
            secretValue: secrets[options.secretName as keyof typeof secrets],
            id: 'id',
            workspace: 'workspace',
            environment: 'test',
          });
        }),
      };

      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => ({
          universalAuth: {
            login: jest.fn().mockResolvedValue({
              secrets: jest.fn(() => mockSecretsClient),
            }),
          },
        })),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      const mockUnleashClient = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'ready') {
            setTimeout(callback, 5);
          }
        }),
        destroy: jest.fn(),
      };

      const { initialize, isEnabled, getVariant } = require('unleash-client');
      initialize.mockReturnValue(mockUnleashClient);
      isEnabled.mockImplementation((key: string) => {
        return ['UNLEASH_ONLY', 'PARTIAL_CONFIG'].includes(key);
      });
      getVariant.mockImplementation((key: string) => {
        const variants = {
          'UNLEASH_ONLY': {
            payload: { value: 'unleash-only-value' },
          },
          'PARTIAL_CONFIG': {
            payload: { value: 'unleash-should-be-overridden' },
          },
        };
        return variants[key as keyof typeof variants] || null;
      });

      // Set environment variables
      process.env.ENV_ONLY = 'env-only-value';
      process.env.PRIORITY_TEST = 'env-should-be-overridden';
      process.env.PARTIAL_CONFIG = 'env-should-be-overridden-too';

      // Initialize all services
      await infisicalService.onModuleInit();
      await unleashService.onModuleInit();
      await unifiedConfigService.onModuleInit();

      // Test priority resolution
      const results = await unifiedConfigService.getConfigs([
        'PRIORITY_TEST', // Should come from Infisical
        'UNLEASH_ONLY', // Should come from Unleash
        'ENV_ONLY', // Should come from Environment
        'MISSING_CONFIG', // Should be undefined
      ]);

      expect(results).toEqual({
        'PRIORITY_TEST': 'infisical-priority-value',
        'UNLEASH_ONLY': 'unleash-only-value',
        'ENV_ONLY': 'env-only-value',
        'MISSING_CONFIG': undefined,
      });

      // Verify PARTIAL_CONFIG prioritization (Infisical > Unleash)
      const partialConfig = await unifiedConfigService.getConfig('PARTIAL_CONFIG');
      expect(partialConfig).toBe('infisical-partial');
    });
  });

  describe('Performance and Timing', () => {
    it('should complete full initialization within reasonable time bounds', async () => {
      // Setup fast mocks
      const mockSecretsClient = {
        listSecrets: jest.fn().mockResolvedValue({ secrets: [] }),
        getSecret: jest.fn().mockResolvedValue({
          secretKey: 'UNLEASH_API_KEY',
          secretValue: 'test-key',
          id: 'id',
          workspace: 'workspace',
          environment: 'test',
        }),
      };

      const { InfisicalSDK } = require('@infisical/sdk');
      InfisicalSDK.mockImplementation(() => ({
        auth: jest.fn(() => ({
          universalAuth: {
            login: jest.fn().mockResolvedValue({
              secrets: jest.fn(() => mockSecretsClient),
            }),
          },
        })),
        secrets: jest.fn(() => mockSecretsClient),
      }));

      const mockUnleashClient = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'ready') {
            setTimeout(callback, 1); // Very fast ready
          }
        }),
        destroy: jest.fn(),
      };

      const { initialize } = require('unleash-client');
      initialize.mockReturnValue(mockUnleashClient);

      // Measure initialization time
      const startTime = Date.now();

      await infisicalService.onModuleInit();
      await unleashService.onModuleInit();
      await unifiedConfigService.onModuleInit();

      const totalTime = Date.now() - startTime;

      // Should complete reasonably quickly (under 1 second in test environment)
      expect(totalTime).toBeLessThan(1000);
      
      // All services should be ready
      expect(infisicalService.isReady()).toBe(true);
      expect(unleashService.isReady()).toBe(true);
      expect(unifiedConfigService.isServiceReady()).toBe(true);
    });
  });
});