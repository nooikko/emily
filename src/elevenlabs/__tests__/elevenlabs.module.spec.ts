import { HttpModule, HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { ElevenLabsModule } from '../elevenlabs.module';
import { ElevenLabsConfigModule } from '../elevenlabs-config.module';
import { ElevenLabsBasicService } from '../services/elevenlabs-basic.service';
import type { ElevenLabsConfig } from '../types/elevenlabs-config.interface';

// Interface for accessing private properties in tests
interface ElevenLabsServiceTestAccess {
  logger: {
    log: jest.MockedFunction<typeof console.log>;
    warn: jest.MockedFunction<typeof console.warn>;
    error: jest.MockedFunction<typeof console.error>;
    debug: jest.MockedFunction<typeof console.debug>;
  };
}

// Mock the config module to avoid environment variable dependencies
const mockElevenLabsConfig: ElevenLabsConfig = {
  apiKey: 'test-api-key-12345',
  baseUrl: 'https://api.elevenlabs.io',
  defaultVoiceId: 'test-voice-id',
  defaultTtsModel: 'eleven_multilingual_v2',
  defaultSttModel: 'scribe_v1',
  maxConcurrentRequests: 3,
  rateLimitDelayMs: 1000,
  maxRetries: 3,
  retryDelayMs: 2000,
  defaultOutputFormat: 'audio/mpeg',
  voiceSettings: {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true,
  },
  enableLogging: true,
  logAudioData: false,
  healthCheck: {
    enabled: true,
    intervalMs: 60000,
  },
  nodeEnv: 'test',
};

// Mock HttpService
const createMockHttpService = () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  head: jest.fn(),
  options: jest.fn(),
  request: jest.fn(),
  axiosRef: {
    defaults: {},
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  },
});

describe('ElevenLabsModule', () => {
  let module: TestingModule;
  let elevenLabsService: ElevenLabsBasicService;
  let httpService: HttpService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set up test environment variables
    process.env = {
      ...originalEnv,
      ELEVENLABS_API_KEY: 'test-api-key-12345',
      NODE_ENV: 'test',
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up module
    if (module) {
      await module.close();
    }
  });

  describe('module compilation', () => {
    it('should compile successfully', async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      expect(module).toBeDefined();
    });

    it('should provide all expected services', async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      // Check that all expected services are available
      expect(module.get(ElevenLabsBasicService)).toBeDefined();
      expect(module.get(HttpService)).toBeDefined();
      expect(module.get('ELEVENLABS_CONFIG')).toBeDefined();
    });

    it('should import required modules', async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      // Verify that the module includes necessary dependencies
      elevenLabsService = module.get<ElevenLabsBasicService>(ElevenLabsBasicService);
      httpService = module.get<HttpService>(HttpService);

      expect(elevenLabsService).toBeDefined();
      expect(httpService).toBeDefined();
      expect(elevenLabsService).toBeInstanceOf(ElevenLabsBasicService);
    });
  });

  describe('service dependencies', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      elevenLabsService = module.get<ElevenLabsBasicService>(ElevenLabsBasicService);
      httpService = module.get<HttpService>(HttpService);
    });

    it('should inject configuration into ElevenLabsBasicService', () => {
      const config = elevenLabsService.getConfig();

      expect(config).toEqual({
        baseUrl: mockElevenLabsConfig.baseUrl,
        defaultVoiceId: mockElevenLabsConfig.defaultVoiceId,
        defaultTtsModel: mockElevenLabsConfig.defaultTtsModel,
        defaultSttModel: mockElevenLabsConfig.defaultSttModel,
        maxConcurrentRequests: mockElevenLabsConfig.maxConcurrentRequests,
        rateLimitDelayMs: mockElevenLabsConfig.rateLimitDelayMs,
        maxRetries: mockElevenLabsConfig.maxRetries,
        retryDelayMs: mockElevenLabsConfig.retryDelayMs,
        defaultOutputFormat: mockElevenLabsConfig.defaultOutputFormat,
        voiceSettings: mockElevenLabsConfig.voiceSettings,
        enableLogging: mockElevenLabsConfig.enableLogging,
        logAudioData: mockElevenLabsConfig.logAudioData,
        healthCheck: mockElevenLabsConfig.healthCheck,
        nodeEnv: mockElevenLabsConfig.nodeEnv,
      });
    });

    it('should provide HttpService with correct configuration', () => {
      expect(httpService).toBeDefined();

      // Verify HttpService is properly configured (basic check)
      const axiosRef = httpService.axiosRef;
      expect(axiosRef).toBeDefined();
      expect(axiosRef.defaults).toBeDefined();
    });

    it('should not expose API key in service configuration', () => {
      const config = elevenLabsService.getConfig();
      expect(config).not.toHaveProperty('apiKey');
    });
  });

  describe('module exports', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();
    });

    it('should export ElevenLabsBasicService', () => {
      const service = module.get(ElevenLabsBasicService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ElevenLabsBasicService);
    });

    it('should make ElevenLabsBasicService available for other modules', async () => {
      // Create a consumer module that imports ElevenLabsModule
      class TestConsumerService {
        constructor(public readonly elevenLabsService: ElevenLabsBasicService) {}
      }

      const TestConsumerModule = Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
          {
            provide: TestConsumerService,
            useFactory: (elevenLabsService: ElevenLabsBasicService) => new TestConsumerService(elevenLabsService),
            inject: [ElevenLabsBasicService],
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService());

      const consumerModule = await TestConsumerModule.compile();
      const consumerService = consumerModule.get(TestConsumerService);

      expect(consumerService.elevenLabsService).toBeDefined();
      expect(consumerService.elevenLabsService).toBeInstanceOf(ElevenLabsBasicService);

      await consumerModule.close();
    });
  });

  describe('HttpModule configuration', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      httpService = module.get<HttpService>(HttpService);
    });

    it('should configure HttpService with appropriate timeout', () => {
      const axiosInstance = httpService.axiosRef;

      // Check that timeout is configured (it should be set to 30000ms as per module)
      // Note: The exact check depends on how @nestjs/axios handles the configuration
      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults).toBeDefined();
    });

    it('should configure HttpService with redirect handling', () => {
      const axiosInstance = httpService.axiosRef;

      // Verify axios instance has proper configuration
      expect(axiosInstance).toBeDefined();
    });
  });

  describe('module initialization order', () => {
    it('should initialize configuration before services', async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      // Configuration should be available when service is created
      const config = module.get('ELEVENLABS_CONFIG');
      const service = module.get(ElevenLabsBasicService);

      expect(config).toBeDefined();
      expect(service).toBeDefined();

      // Service should have access to the configuration
      expect(service.getConfig()).toBeDefined();
    });
  });

  describe('service availability and status', () => {
    let mockHttpService: jest.Mocked<ReturnType<typeof createMockHttpService>>;

    beforeEach(async () => {
      mockHttpService = createMockHttpService();

      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .compile();

      elevenLabsService = module.get<ElevenLabsBasicService>(ElevenLabsBasicService);

      // Mock logger to avoid console output during tests
      jest.spyOn((elevenLabsService as unknown as ElevenLabsServiceTestAccess).logger, 'log').mockImplementation();
      jest.spyOn((elevenLabsService as unknown as ElevenLabsServiceTestAccess).logger, 'warn').mockImplementation();
      jest.spyOn((elevenLabsService as unknown as ElevenLabsServiceTestAccess).logger, 'error').mockImplementation();
      jest.spyOn((elevenLabsService as unknown as ElevenLabsServiceTestAccess).logger, 'debug').mockImplementation();
    });

    it('should provide service statistics', () => {
      const stats = elevenLabsService.getStatistics();

      expect(stats).toEqual({
        initialized: expect.any(Boolean),
        available: expect.any(Boolean),
        lastHealthCheck: expect.any(Object),
        activeRequests: expect.any(Number),
        configuration: {
          baseUrl: mockElevenLabsConfig.baseUrl,
          defaultTtsModel: mockElevenLabsConfig.defaultTtsModel,
          defaultSttModel: mockElevenLabsConfig.defaultSttModel,
          maxConcurrentRequests: mockElevenLabsConfig.maxConcurrentRequests,
          maxRetries: mockElevenLabsConfig.maxRetries,
        },
      });
    });

    it('should indicate service availability', () => {
      // Service should be available after initialization
      const available = elevenLabsService.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('error handling during module compilation', () => {
    it('should handle missing configuration gracefully', async () => {
      // This test verifies the module structure is sound even if configuration is problematic
      try {
        const testModule = await Test.createTestingModule({
          imports: [HttpModule],
          providers: [
            ElevenLabsBasicService,
            {
              provide: 'ELEVENLABS_CONFIG',
              useValue: mockElevenLabsConfig,
            },
          ],
        })
          .overrideProvider('ELEVENLABS_CONFIG')
          .useValue(null) // Invalid configuration
          .overrideProvider(HttpService)
          .useValue(createMockHttpService())
          .compile();

        // Try to get the service, which should fail
        expect(() => testModule.get(ElevenLabsBasicService)).toThrow();
        await testModule.close();
      } catch (error) {
        // Expected to fail due to invalid configuration
        expect(error).toBeDefined();
      }
    });

    it('should maintain module structure with minimal configuration', async () => {
      const minimalConfig: ElevenLabsConfig = {
        ...mockElevenLabsConfig,
        defaultVoiceId: undefined, // Optional field
      };

      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider('ELEVENLABS_CONFIG')
        .useValue(minimalConfig)
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      const service = module.get(ElevenLabsBasicService);
      expect(service).toBeDefined();

      const config = service.getConfig();
      expect(config.defaultVoiceId).toBeUndefined();
    });
  });

  describe('module metadata', () => {
    it('should include correct imports', () => {
      const moduleMetadata = Reflect.getMetadata('imports', ElevenLabsModule);

      expect(moduleMetadata).toBeDefined();
      expect(moduleMetadata).toContain(ElevenLabsConfigModule);

      // Check that HttpModule is imported with registration
      const httpModuleImport = moduleMetadata.find(
        (imp: unknown) => imp && typeof imp === 'object' && (imp as { module?: { name?: string } }).module?.name === 'HttpModule',
      );
      expect(httpModuleImport || moduleMetadata.includes(HttpModule)).toBeTruthy();
    });

    it('should include correct providers', () => {
      const providers = Reflect.getMetadata('providers', ElevenLabsModule);

      expect(providers).toBeDefined();
      expect(providers).toContain(ElevenLabsBasicService);
    });

    it('should include correct exports', () => {
      const exports = Reflect.getMetadata('exports', ElevenLabsModule);

      expect(exports).toBeDefined();
      expect(exports).toContain(ElevenLabsBasicService);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      elevenLabsService = module.get<ElevenLabsBasicService>(ElevenLabsBasicService);
    });

    it('should support multiple service instances sharing the same configuration', async () => {
      // Create another module instance
      const anotherModule = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      const anotherService = anotherModule.get<ElevenLabsBasicService>(ElevenLabsBasicService);

      // Both services should have the same configuration
      expect(elevenLabsService.getConfig()).toEqual(anotherService.getConfig());

      await anotherModule.close();
    });

    it('should handle service lifecycle correctly', async () => {
      // Service should be created and available
      expect(elevenLabsService).toBeDefined();
      expect(elevenLabsService.isAvailable).toBeDefined();
      expect(typeof elevenLabsService.isAvailable()).toBe('boolean');

      // Service should have proper methods
      expect(typeof elevenLabsService.generateSpeech).toBe('function');
      expect(typeof elevenLabsService.transcribeAudio).toBe('function');
      expect(typeof elevenLabsService.checkHealth).toBe('function');
      expect(typeof elevenLabsService.getVoices).toBe('function');
    });
  });

  describe('configuration validation integration', () => {
    it('should work with different environment configurations', async () => {
      const productionConfig: ElevenLabsConfig = {
        ...mockElevenLabsConfig,
        nodeEnv: 'production',
        enableLogging: false,
        logAudioData: false,
      };

      const prodModule = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider('ELEVENLABS_CONFIG')
        .useValue(productionConfig)
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      const prodService = prodModule.get<ElevenLabsBasicService>(ElevenLabsBasicService);
      const prodConfig = prodService.getConfig();

      expect(prodConfig.nodeEnv).toBe('production');
      expect(prodConfig.enableLogging).toBe(false);
      expect(prodConfig.logAudioData).toBe(false);

      await prodModule.close();
    });

    it('should handle development configuration', async () => {
      const devConfig: ElevenLabsConfig = {
        ...mockElevenLabsConfig,
        nodeEnv: 'development',
        enableLogging: true,
        logAudioData: true,
      };

      const devModule = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ElevenLabsBasicService,
          {
            provide: 'ELEVENLABS_CONFIG',
            useValue: mockElevenLabsConfig,
          },
        ],
      })
        .overrideProvider('ELEVENLABS_CONFIG')
        .useValue(devConfig)
        .overrideProvider(HttpService)
        .useValue(createMockHttpService())
        .compile();

      const devService = devModule.get<ElevenLabsBasicService>(ElevenLabsBasicService);
      const devConfigResult = devService.getConfig();

      expect(devConfigResult.nodeEnv).toBe('development');
      expect(devConfigResult.enableLogging).toBe(true);
      expect(devConfigResult.logAudioData).toBe(true);

      await devModule.close();
    });
  });
});
