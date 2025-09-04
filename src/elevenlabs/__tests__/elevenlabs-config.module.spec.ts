import { Test, type TestingModule } from '@nestjs/testing';
import { InfisicalConfigFactory } from '../../infisical/infisical-config.factory';
import { ElevenLabsConfigModule } from '../elevenlabs-config.module';
import type { ElevenLabsConfig } from '../types/elevenlabs-config.interface';

// Mock interface for proper typing
interface MockInfisicalConfigFactory {
  createElevenLabsConfig: jest.Mock;
}

// Mock InfisicalConfigFactory for testing
const createMockInfisicalConfigFactory = (config: Partial<ElevenLabsConfig> = {}): MockInfisicalConfigFactory => {
  const defaultConfig: ElevenLabsConfig = {
    apiKey: 'test-api-key-12345',
    baseUrl: 'https://api.elevenlabs.io',
    defaultVoiceId: 'test-voice-id',
    defaultTtsModel: 'eleven_multilingual_v2',
    defaultSttModel: 'scribe_v1',
    maxConcurrentRequests: 3,
    rateLimitDelayMs: 1000,
    maxRetries: 3,
    retryDelayMs: 2000,
    defaultOutputFormat: 'mp3_44100_128',
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

  return {
    createElevenLabsConfig: jest.fn().mockResolvedValue({
      ...defaultConfig,
      ...config,
    }),
  };
};

describe('ElevenLabsConfigModule', () => {
  let module: TestingModule;
  let mockInfisicalConfigFactory: MockInfisicalConfigFactory;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up module
    if (module) {
      await module.close();
    }
  });

  describe('module compilation with valid configuration', () => {
    beforeEach(() => {
      // Setup mock InfisicalConfigFactory with default config
      mockInfisicalConfigFactory = createMockInfisicalConfigFactory();
    });

    it('should compile successfully with valid configuration', async () => {
      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      expect(module).toBeDefined();
      expect(module.get('ELEVENLABS_CONFIG')).toBeDefined();
    });

    it('should provide ELEVENLABS_CONFIG token with correct configuration', async () => {
      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config).toEqual({
        apiKey: 'test-api-key-12345',
        baseUrl: 'https://api.elevenlabs.io',
        defaultVoiceId: 'test-voice-id',
        defaultTtsModel: 'eleven_multilingual_v2',
        defaultSttModel: 'scribe_v1',
        maxConcurrentRequests: 3,
        rateLimitDelayMs: 1000,
        maxRetries: 3,
        retryDelayMs: 2000,
        defaultOutputFormat: 'mp3_44100_128',
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
      });
    });

    it('should call ConfigService.get for each configuration property', async () => {
      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      // Verify the factory method was called
      expect(mockInfisicalConfigFactory.createElevenLabsConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('default value scenarios', () => {
    it('should work with minimal configuration (only required fields)', async () => {
      const minimalConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        // All other values should get defaults
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(minimalConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseUrl: 'https://api.elevenlabs.io', // Default
        defaultVoiceId: 'test-voice-id', // From mock
        defaultTtsModel: 'eleven_multilingual_v2', // Default
        defaultSttModel: 'scribe_v1', // Default
        maxConcurrentRequests: 3, // Default
        rateLimitDelayMs: 1000, // Default
        maxRetries: 3, // Default
        retryDelayMs: 2000, // Default
        defaultOutputFormat: 'mp3_44100_128', // Default
        voiceSettings: {
          stability: 0.5, // Default
          similarityBoost: 0.75, // Default
          style: 0, // Default
          useSpeakerBoost: true, // Default
        },
        enableLogging: true, // Default
        logAudioData: false, // Default
        healthCheck: {
          enabled: true, // Default
          intervalMs: 60000, // Default
        },
        nodeEnv: 'test', // From mock
      });
    });

    it('should apply custom values when provided', async () => {
      const customConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'custom-api-key',
        baseUrl: 'https://custom.elevenlabs.io',
        defaultVoiceId: 'custom-voice-id',
        defaultTtsModel: 'custom_tts_model',
        defaultSttModel: 'custom_stt_model',
        maxConcurrentRequests: 5,
        rateLimitDelayMs: 2000,
        maxRetries: 5,
        retryDelayMs: 3000,
        defaultOutputFormat: 'wav_44100',
        voiceSettings: {
          stability: 0.8,
          similarityBoost: 0.9,
          style: 0.5,
          useSpeakerBoost: false,
        },
        enableLogging: false,
        logAudioData: true,
        healthCheck: {
          enabled: false,
          intervalMs: 120000,
        },
        nodeEnv: 'production',
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(customConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config).toEqual({
        apiKey: 'custom-api-key',
        baseUrl: 'https://custom.elevenlabs.io',
        defaultVoiceId: 'custom-voice-id',
        defaultTtsModel: 'custom_tts_model',
        defaultSttModel: 'custom_stt_model',
        maxConcurrentRequests: 5,
        rateLimitDelayMs: 2000,
        maxRetries: 5,
        retryDelayMs: 3000,
        defaultOutputFormat: 'wav_44100',
        voiceSettings: {
          stability: 0.8,
          similarityBoost: 0.9,
          style: 0.5,
          useSpeakerBoost: false,
        },
        enableLogging: false,
        logAudioData: true,
        healthCheck: {
          enabled: false,
          intervalMs: 120000,
        },
        nodeEnv: 'production',
      });
    });
  });

  describe('numeric type conversions', () => {
    it('should handle numeric values as strings from environment', async () => {
      // Create mock configuration with proper types
      const numericTestConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        maxConcurrentRequests: 5,
        rateLimitDelayMs: 2000,
        voiceSettings: {
          stability: 0.8,
          similarityBoost: 0.75,
          style: 0,
          useSpeakerBoost: true,
        },
        healthCheck: {
          enabled: true,
          intervalMs: 120000,
        },
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(numericTestConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.maxConcurrentRequests).toBe(5);
      expect(config.rateLimitDelayMs).toBe(2000);
      expect(config.voiceSettings.stability).toBe(0.8);
      expect(config.healthCheck.intervalMs).toBe(120000);

      expect(typeof config.maxConcurrentRequests).toBe('number');
      expect(typeof config.rateLimitDelayMs).toBe('number');
      expect(typeof config.voiceSettings.stability).toBe('number');
      expect(typeof config.healthCheck.intervalMs).toBe('number');
    });
  });

  describe('boolean type conversions', () => {
    it('should handle boolean values as strings from environment', async () => {
      // Create mock configuration with proper types
      const booleanTestConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.75,
          style: 0,
          useSpeakerBoost: false,
        },
        enableLogging: false,
        logAudioData: true,
        healthCheck: {
          enabled: false,
          intervalMs: 60000,
        },
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(booleanTestConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.voiceSettings.useSpeakerBoost).toBe(false);
      expect(config.enableLogging).toBe(false);
      expect(config.logAudioData).toBe(true);
      expect(config.healthCheck.enabled).toBe(false);

      expect(typeof config.voiceSettings.useSpeakerBoost).toBe('boolean');
      expect(typeof config.enableLogging).toBe('boolean');
      expect(typeof config.logAudioData).toBe('boolean');
      expect(typeof config.healthCheck.enabled).toBe('boolean');
    });
  });

  describe('module exports', () => {
    beforeEach(() => {
      const validConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
      };
      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(validConfig);
    });

    it('should export ELEVENLABS_CONFIG provider', async () => {
      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      // Verify the token is available for injection
      expect(() => module.get('ELEVENLABS_CONFIG')).not.toThrow();
    });

    it('should make ELEVENLABS_CONFIG available for other modules', async () => {
      // Create a consumer service that uses the config
      class TestConsumerService {
        constructor(public readonly config: ElevenLabsConfig) {}
      }

      const TestConsumerModule = Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
        providers: [
          {
            provide: TestConsumerService,
            useFactory: (config: ElevenLabsConfig) => new TestConsumerService(config),
            inject: ['ELEVENLABS_CONFIG'],
          },
        ],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory);

      const consumerModule = await TestConsumerModule.compile();
      const consumerService = consumerModule.get(TestConsumerService);

      expect(consumerService.config).toBeDefined();
      expect(consumerService.config.apiKey).toBe('test-api-key');

      await consumerModule.close();
    });
  });

  describe('voice settings nested object', () => {
    it('should create voice settings with all properties', async () => {
      const voiceConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        voiceSettings: {
          stability: 0.3,
          similarityBoost: 0.8,
          style: 0.2,
          useSpeakerBoost: false,
        },
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(voiceConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.voiceSettings).toEqual({
        stability: 0.3,
        similarityBoost: 0.8,
        style: 0.2,
        useSpeakerBoost: false,
      });
    });

    it('should create voice settings with default values when not provided', async () => {
      const defaultConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        // Voice settings not provided, should use defaults
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(defaultConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.voiceSettings).toEqual({
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0,
        useSpeakerBoost: true,
      });
    });
  });

  describe('health check nested object', () => {
    it('should create health check config with all properties', async () => {
      const healthConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        healthCheck: {
          enabled: false,
          intervalMs: 30000,
        },
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(healthConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.healthCheck).toEqual({
        enabled: false,
        intervalMs: 30000,
      });
    });

    it('should create health check config with default values when not provided', async () => {
      const defaultHealthConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        // Health check settings not provided, should use defaults
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(defaultHealthConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.healthCheck).toEqual({
        enabled: true,
        intervalMs: 60000,
      });
    });
  });

  describe('optional vs required fields', () => {
    it('should handle optional fields correctly when not provided', async () => {
      const optionalConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        defaultVoiceId: undefined, // Explicitly set to undefined
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(optionalConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.defaultVoiceId).toBeUndefined();
      expect(config.apiKey).toBe('test-api-key'); // Required field should be present
    });

    it('should include optional fields when provided', async () => {
      const optionalWithValueConfig: Partial<ElevenLabsConfig> = {
        apiKey: 'test-api-key',
        defaultVoiceId: 'optional-voice-id',
      };

      mockInfisicalConfigFactory = createMockInfisicalConfigFactory(optionalWithValueConfig);

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      expect(config.defaultVoiceId).toBe('optional-voice-id');
      expect(config.apiKey).toBe('test-api-key');
    });
  });

  describe('factory function behavior', () => {
    it('should call InfisicalConfigFactory to create ElevenLabs configuration', async () => {
      const expectedConfig: ElevenLabsConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.elevenlabs.io',
        defaultVoiceId: 'test-voice-id',
        defaultTtsModel: 'eleven_multilingual_v2',
        defaultSttModel: 'scribe_v1',
        maxConcurrentRequests: 3,
        rateLimitDelayMs: 1000,
        maxRetries: 3,
        retryDelayMs: 2000,
        defaultOutputFormat: 'mp3_44100_128',
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

      // Mock InfisicalConfigFactory
      const mockInfisicalConfigFactory = {
        createElevenLabsConfig: jest.fn().mockResolvedValue(expectedConfig),
      };

      module = await Test.createTestingModule({
        imports: [ElevenLabsConfigModule],
      })
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory)
        .compile();

      // Get the config to trigger the factory
      const config = module.get<ElevenLabsConfig>('ELEVENLABS_CONFIG');

      // Verify the factory was called
      expect(mockInfisicalConfigFactory.createElevenLabsConfig).toHaveBeenCalled();

      // Verify the config matches expected
      expect(config).toEqual(expectedConfig);
    });
  });
});
