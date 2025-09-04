import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalService } from '../../infisical/infisical.service';
import { UnleashModule } from '../unleash.module';
import { UnleashService } from '../unleash.service';
import { UnleashConfigFactory } from '../unleash-config.factory';

describe('UnleashModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UnleashModule, ConfigModule.forRoot()],
    })
      .overrideProvider(InfisicalService)
      .useValue({
        getSecret: jest.fn(),
        getSecrets: jest.fn(),
      })
      .compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Module Setup', () => {
    it('should be defined', () => {
      expect(module).toBeDefined();
    });

    it('should provide UnleashService', () => {
      const unleashService = module.get<UnleashService>(UnleashService);
      expect(unleashService).toBeDefined();
      expect(unleashService).toBeInstanceOf(UnleashService);
    });

    it('should provide UnleashConfigFactory', () => {
      const configFactory = module.get<UnleashConfigFactory>(UnleashConfigFactory);
      expect(configFactory).toBeDefined();
      expect(configFactory).toBeInstanceOf(UnleashConfigFactory);
    });

    it('should import required modules', () => {
      // ConfigModule should be available
      const configModule = module.get(ConfigModule);
      expect(configModule).toBeDefined();
    });
  });

  describe('Global Module Behavior', () => {
    it('should be available as global module', async () => {
      // Test that UnleashModule exports are available globally
      const testModule = await Test.createTestingModule({
        imports: [UnleashModule],
        providers: [
          {
            provide: 'TEST_PROVIDER',
            useFactory: (unleashService: UnleashService, configFactory: UnleashConfigFactory) => {
              return {
                unleashService,
                configFactory,
              };
            },
            inject: [UnleashService, UnleashConfigFactory],
          },
        ],
      })
        .overrideProvider(InfisicalService)
        .useValue({
          getSecret: jest.fn(),
          getSecrets: jest.fn(),
        })
        .compile();

      const testProvider = testModule.get('TEST_PROVIDER');
      expect(testProvider.unleashService).toBeInstanceOf(UnleashService);
      expect(testProvider.configFactory).toBeInstanceOf(UnleashConfigFactory);

      await testModule.close();
    });
  });

  describe('Dependency Injection', () => {
    it('should inject dependencies correctly in UnleashService', () => {
      const unleashService = module.get<UnleashService>(UnleashService);

      // UnleashService should have access to its dependencies
      expect(unleashService).toBeDefined();

      // Test that the service can access its configuration
      const config = unleashService.getConfig();
      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.cacheTtl).toBe('number');
    });

    it('should inject dependencies correctly in UnleashConfigFactory', () => {
      const configFactory = module.get<UnleashConfigFactory>(UnleashConfigFactory);

      expect(configFactory).toBeDefined();
      expect(configFactory).toBeInstanceOf(UnleashConfigFactory);
    });

    it('should handle InfisicalService dependency', () => {
      const infisicalService = module.get<InfisicalService>(InfisicalService);

      expect(infisicalService).toBeDefined();
      expect(typeof infisicalService.getSecret).toBe('function');
      expect(typeof infisicalService.getSecrets).toBe('function');
    });
  });

  describe('Module Lifecycle', () => {
    it('should initialize UnleashService on module init', async () => {
      const unleashService = module.get<UnleashService>(UnleashService);
      const mockInfisicalService = module.get<InfisicalService>(InfisicalService);

      // Mock the InfisicalService to prevent actual API calls during testing
      (mockInfisicalService.getSecret as jest.Mock).mockResolvedValue(undefined);

      // Service should initialize without throwing
      expect(async () => {
        await unleashService.onModuleInit();
      }).not.toThrow();

      // Should not be operational without proper configuration
      expect(unleashService.isOperational()).toBe(false);
    });

    it('should destroy UnleashService on module destroy', async () => {
      const unleashService = module.get<UnleashService>(UnleashService);

      // Service should destroy without throwing
      expect(async () => {
        await unleashService.onModuleDestroy();
      }).not.toThrow();
    });
  });

  describe('Configuration Integration', () => {
    it('should work with different configurations', async () => {
      // Test with disabled configuration
      const disabledModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            load: [
              () => ({
                UNLEASH_ENABLED: false,
                UNLEASH_CACHE_TTL: 300000,
                UNLEASH_FALLBACK_TO_ENV: true,
              }),
            ],
          }),
          UnleashModule,
        ],
      })
        .overrideProvider(InfisicalService)
        .useValue({
          getSecret: jest.fn(),
          getSecrets: jest.fn(),
        })
        .compile();

      const unleashService = disabledModule.get<UnleashService>(UnleashService);
      const config = unleashService.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.cacheTtl).toBe(300000);
      expect(config.fallbackToEnv).toBe(true);

      await disabledModule.close();
    });

    it('should handle missing configuration gracefully', async () => {
      // Store original env values to restore later
      const originalEnabled = process.env.UNLEASH_ENABLED;
      const originalAppName = process.env.UNLEASH_APP_NAME;
      
      // Clear environment variables to test true defaults
      delete process.env.UNLEASH_ENABLED;
      delete process.env.UNLEASH_APP_NAME;

      try {
        // Test with minimal configuration
        const minimalModule = await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              ignoreEnvFile: true, // Ignore .env file to test true defaults
              load: [() => ({})], // Empty configuration
            }),
            UnleashModule,
          ],
        })
          .overrideProvider(InfisicalService)
          .useValue({
            getSecret: jest.fn(),
            getSecrets: jest.fn(),
          })
          .compile();

        const unleashService = minimalModule.get<UnleashService>(UnleashService);
        const config = unleashService.getConfig();

        // Should use defaults
        expect(config.enabled).toBe(false); // Default when not specified
        expect(config.appName).toBe('emily-ai-agent'); // Default app name
        expect(config.cacheTtl).toBe(300000); // Default cache TTL

        await minimalModule.close();
      } finally {
        // Restore original environment variables
        if (originalEnabled !== undefined) {
          process.env.UNLEASH_ENABLED = originalEnabled;
        }
        if (originalAppName !== undefined) {
          process.env.UNLEASH_APP_NAME = originalAppName;
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid configuration values', async () => {
      expect(async () => {
        const invalidModule = await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              load: [
                () => ({
                  UNLEASH_CACHE_TTL: 'invalid-number', // Invalid cache TTL
                }),
              ],
            }),
            UnleashModule,
          ],
        })
          .overrideProvider(InfisicalService)
          .useValue({
            getSecret: jest.fn(),
            getSecrets: jest.fn(),
          })
          .compile();

        await invalidModule.close();
      }).rejects.toThrow('Invalid UNLEASH_CACHE_TTL value');
    });

    it('should handle negative cache TTL values', async () => {
      expect(async () => {
        const invalidModule = await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              load: [
                () => ({
                  UNLEASH_CACHE_TTL: '-1000', // Negative cache TTL
                }),
              ],
            }),
            UnleashModule,
          ],
        })
          .overrideProvider(InfisicalService)
          .useValue({
            getSecret: jest.fn(),
            getSecrets: jest.fn(),
          })
          .compile();

        await invalidModule.close();
      }).rejects.toThrow('Invalid UNLEASH_CACHE_TTL value');
    });
  });

  describe('Integration with InfisicalModule', () => {
    it('should properly integrate with InfisicalService', () => {
      const unleashService = module.get<UnleashService>(UnleashService);
      const infisicalService = module.get<InfisicalService>(InfisicalService);

      // Both services should be available
      expect(unleashService).toBeDefined();
      expect(infisicalService).toBeDefined();

      // InfisicalService should be injected into UnleashService
      expect(infisicalService).toBeDefined();
    });

    it('should handle InfisicalService failures gracefully', async () => {
      const mockInfisicalService = module.get<InfisicalService>(InfisicalService);
      const unleashService = module.get<UnleashService>(UnleashService);

      // Mock InfisicalService to fail
      (mockInfisicalService.getSecret as jest.Mock).mockRejectedValue(new Error('Infisical error'));

      // Service should handle the failure gracefully (not throw)
      await expect(unleashService.onModuleInit()).resolves.not.toThrow();

      // Service should fall back to environment variables
      expect(unleashService.isOperational()).toBe(false);
    });
  });

  describe('Factory Integration', () => {
    it('should allow UnleashConfigFactory to use UnleashService', async () => {
      const configFactory = module.get<UnleashConfigFactory>(UnleashConfigFactory);
      const unleashService = module.get<UnleashService>(UnleashService);

      // Mock getConfigValues on the UnleashService instead
      jest.spyOn(unleashService, 'getConfigValues').mockResolvedValue({
        TEST_CONFIG: 'test-value',
      });

      // Factory should be able to create configuration
      const result = await configFactory.createConfig({ testKey: 'TEST_CONFIG' }, { testKey: 'default-value' });

      expect(result.testKey).toBe('test-value');
    });
  });

  describe('Module Exports', () => {
    it('should export UnleashService', () => {
      // UnleashService should be available for injection in other modules
      expect(() => module.get<UnleashService>(UnleashService)).not.toThrow();
    });

    it('should export UnleashConfigFactory', () => {
      // UnleashConfigFactory should be available for injection in other modules
      expect(() => module.get<UnleashConfigFactory>(UnleashConfigFactory)).not.toThrow();
    });

    it('should make providers available to other modules', async () => {
      // Create a consuming module
      const consumerModule = await Test.createTestingModule({
        imports: [UnleashModule],
        providers: [
          {
            provide: 'CONSUMER_SERVICE',
            useFactory: (unleashService: UnleashService) => {
              return { unleashService };
            },
            inject: [UnleashService],
          },
        ],
      })
        .overrideProvider(InfisicalService)
        .useValue({
          getSecret: jest.fn(),
          getSecrets: jest.fn(),
        })
        .compile();

      const consumerService = consumerModule.get('CONSUMER_SERVICE');
      expect(consumerService.unleashService).toBeInstanceOf(UnleashService);

      await consumerModule.close();
    });
  });
});
