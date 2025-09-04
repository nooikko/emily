import { Test, type TestingModule } from '@nestjs/testing';
import { UnleashService } from '../unleash.service';
import { UnleashConfigFactory, UnleashConfigFetchError, UnleashConfigValidationError } from '../unleash-config.factory';

describe('UnleashConfigFactory', () => {
  let factory: UnleashConfigFactory;
  let mockUnleashService: jest.Mocked<UnleashService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnleashConfigFactory,
        {
          provide: UnleashService,
          useValue: {
            getConfigValues: jest.fn(),
          },
        },
      ],
    }).compile();

    factory = module.get<UnleashConfigFactory>(UnleashConfigFactory);
    mockUnleashService = module.get(UnleashService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConfig', () => {
    interface TestConfig extends Record<string, any> {
      readonly host: string;
      readonly port: number;
      readonly enabled: boolean;
      readonly optionalValue?: string;
    }

    const testConfigMap = {
      host: 'TEST_HOST',
      port: 'TEST_PORT',
      enabled: 'TEST_ENABLED',
      optionalValue: 'TEST_OPTIONAL',
    };

    const testDefaults: Partial<TestConfig> = {
      host: 'localhost',
      port: 3000,
      enabled: false,
    };

    it('should create configuration with all config values available', async () => {
      const mockConfigValues = {
        TEST_HOST: 'production-host',
        TEST_PORT: '8080',
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: 'optional-value',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'production-host',
        port: 8080,
        enabled: true,
        optionalValue: 'optional-value',
      });
      expect(mockUnleashService.getConfigValues).toHaveBeenCalledWith(['TEST_HOST', 'TEST_PORT', 'TEST_ENABLED', 'TEST_OPTIONAL']);
    });

    it('should use defaults when config values are not available', async () => {
      const mockConfigValues = {
        TEST_HOST: undefined,
        TEST_PORT: undefined,
        TEST_ENABLED: undefined,
        TEST_OPTIONAL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'localhost',
        port: 3000,
        enabled: false,
        optionalValue: undefined,
      });
    });

    it('should mix config values and defaults appropriately', async () => {
      const mockConfigValues = {
        TEST_HOST: 'config-host',
        TEST_PORT: undefined, // Will use default
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'config-host',
        port: 3000, // from default
        enabled: true,
        optionalValue: undefined, // optional field
      });
    });

    it('should handle type conversion errors gracefully', async () => {
      const mockConfigValues = {
        TEST_HOST: 'production-host',
        TEST_PORT: 'invalid-number',
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: 'optional-value',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'production-host',
        port: 3000, // fallback to default due to invalid number
        enabled: true,
        optionalValue: 'optional-value',
      });
    });

    it('should throw UnleashConfigValidationError when required values are missing', async () => {
      const mockConfigValues = {
        TEST_HOST: undefined,
        TEST_PORT: undefined,
        TEST_ENABLED: undefined,
        TEST_OPTIONAL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      // Don't provide defaults for required fields
      await expect(factory.createConfig<TestConfig>(testConfigMap, {})).rejects.toThrow(UnleashConfigValidationError);
    });
  });

  describe('type conversion', () => {
    interface TypeTestConfig extends Record<string, any> {
      readonly stringValue: string;
      readonly numberValue: number;
      readonly booleanValue: boolean;
      readonly undefinedValue?: string;
    }

    const typeTestConfigMap = {
      stringValue: 'STRING_VALUE',
      numberValue: 'NUMBER_VALUE',
      booleanValue: 'BOOLEAN_VALUE',
      undefinedValue: 'UNDEFINED_VALUE',
    };

    const typeTestDefaults: Partial<TypeTestConfig> = {
      stringValue: 'default-string',
      numberValue: 42,
      booleanValue: false,
      undefinedValue: undefined,
    };

    it('should convert boolean values correctly', async () => {
      const testCases = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: 'TRUE', expected: true },
        { input: 'FALSE', expected: false },
        { input: 'yes', expected: false }, // Only 'true' should convert to true
      ];

      for (const testCase of testCases) {
        const mockConfigValues = {
          STRING_VALUE: 'test',
          NUMBER_VALUE: '100',
          BOOLEAN_VALUE: testCase.input,
          UNDEFINED_VALUE: 'test',
        };

        mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

        const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

        expect(result.booleanValue).toBe(testCase.expected);
      }
    });

    it('should convert number values correctly', async () => {
      const testCases = [
        { input: '123', expected: 123 },
        { input: '0', expected: 0 },
        { input: '-456', expected: -456 },
        { input: '3.14', expected: 3.14 },
        { input: 'invalid', expected: 42 }, // fallback to default
      ];

      for (const testCase of testCases) {
        const mockConfigValues = {
          STRING_VALUE: 'test',
          NUMBER_VALUE: testCase.input,
          BOOLEAN_VALUE: 'true',
          UNDEFINED_VALUE: 'test',
        };

        mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

        const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

        expect(result.numberValue).toBe(testCase.expected);
      }
    });

    it('should handle string values correctly', async () => {
      const mockConfigValues = {
        STRING_VALUE: 'config-string',
        NUMBER_VALUE: '100',
        BOOLEAN_VALUE: 'true',
        UNDEFINED_VALUE: 'config-undefined',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

      expect(result.stringValue).toBe('config-string');
      expect(result.undefinedValue).toBe('config-undefined');
    });

    it('should handle undefined default values correctly', async () => {
      const mockConfigValues = {
        STRING_VALUE: 'config-string',
        NUMBER_VALUE: '100',
        BOOLEAN_VALUE: 'true',
        UNDEFINED_VALUE: 'config-value',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

      expect(result.undefinedValue).toBe('config-value');
    });
  });

  describe('createDatabaseConfig', () => {
    it('should create database configuration with defaults', async () => {
      const mockConfigValues = {
        POSTGRES_HOST: undefined,
        POSTGRES_PORT: undefined,
        POSTGRES_USERNAME: 'db-user',
        POSTGRES_PASSWORD: 'db-password',
        POSTGRES_DB: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createDatabaseConfig();

      expect(result).toEqual({
        host: 'localhost',
        port: 5432,
        username: 'db-user',
        password: 'db-password',
        database: 'emily',
      });
    });

    it('should create database configuration with config values', async () => {
      const mockConfigValues = {
        POSTGRES_HOST: 'production-db',
        POSTGRES_PORT: '5433',
        POSTGRES_USERNAME: 'prod-user',
        POSTGRES_PASSWORD: 'prod-password',
        POSTGRES_DB: 'prod-database',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createDatabaseConfig();

      expect(result).toEqual({
        host: 'production-db',
        port: 5433,
        username: 'prod-user',
        password: 'prod-password',
        database: 'prod-database',
      });
    });

    it('should throw error when required database config values are missing', async () => {
      const mockConfigValues = {
        POSTGRES_HOST: undefined,
        POSTGRES_PORT: undefined,
        POSTGRES_USERNAME: undefined, // Required but missing
        POSTGRES_PASSWORD: undefined, // Required but missing
        POSTGRES_DB: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      await expect(factory.createDatabaseConfig()).rejects.toThrow(UnleashConfigValidationError);
    });
  });

  describe('createRedisConfig', () => {
    it('should create Redis configuration with defaults and optional password', async () => {
      const mockConfigValues = {
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: 'redis-password',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createRedisConfig();

      expect(result).toEqual({
        host: 'localhost',
        port: 6379,
        password: 'redis-password',
      });
    });

    it('should create Redis configuration without password', async () => {
      const mockConfigValues = {
        REDIS_HOST: 'redis-server',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: undefined, // Optional field
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createRedisConfig();

      expect(result).toEqual({
        host: 'redis-server',
        port: 6380,
        password: undefined, // Should be undefined since it's optional
      });
    });
  });

  describe('createLangSmithConfig', () => {
    it('should create LangSmith configuration with config values and defaults', async () => {
      const mockConfigValues = {
        LANGSMITH_API_KEY: 'ls-api-key',
        LANGSMITH_API_URL: undefined, // Use default
        LANGSMITH_PROJECT: 'custom-project',
        LANGSMITH_TRACING_ENABLED: 'true',
        LANGSMITH_BACKGROUND_CALLBACKS: 'false',
        LANGSMITH_HIDE_INPUTS: 'true',
        LANGSMITH_HIDE_OUTPUTS: 'false',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createLangSmithConfig();

      expect(result).toEqual({
        apiKey: 'ls-api-key',
        endpoint: 'https://api.smith.langchain.com',
        projectName: 'custom-project',
        tracingEnabled: true,
        backgroundCallbacks: false,
        hideInputs: true,
        hideOutputs: false,
        defaultMetadata: {},
        maskingPatterns: {},
      });
    });

    it('should use all defaults when API key is not provided (optional)', async () => {
      const mockConfigValues = {
        LANGSMITH_API_KEY: undefined, // Optional - should not throw error
        LANGSMITH_API_URL: undefined,
        LANGSMITH_PROJECT: undefined,
        LANGSMITH_TRACING_ENABLED: undefined,
        LANGSMITH_BACKGROUND_CALLBACKS: undefined,
        LANGSMITH_HIDE_INPUTS: undefined,
        LANGSMITH_HIDE_OUTPUTS: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createLangSmithConfig();

      expect(result).toEqual({
        apiKey: undefined,
        endpoint: 'https://api.smith.langchain.com',
        projectName: 'emily-ai-agent',
        tracingEnabled: false,
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: {},
        maskingPatterns: {},
      });
    });
  });

  describe('createElevenLabsConfig', () => {
    it('should create ElevenLabs configuration with comprehensive settings', async () => {
      const mockConfigValues = {
        ELEVENLABS_API_KEY: 'el-api-key',
        ELEVENLABS_BASE_URL: undefined, // Use default
        ELEVENLABS_DEFAULT_VOICE_ID: 'voice-123',
        ELEVENLABS_DEFAULT_TTS_MODEL: 'custom_model',
        ELEVENLABS_DEFAULT_STT_MODEL: undefined, // Use default
        ELEVENLABS_MAX_CONCURRENT_REQUESTS: '5',
        ELEVENLABS_RATE_LIMIT_DELAY_MS: '2000',
        ELEVENLABS_MAX_RETRIES: '5',
        ELEVENLABS_RETRY_DELAY_MS: '3000',
        ELEVENLABS_DEFAULT_OUTPUT_FORMAT: 'wav_44100',
        ELEVENLABS_VOICE_STABILITY: '0.8',
        ELEVENLABS_VOICE_SIMILARITY_BOOST: '0.9',
        ELEVENLABS_VOICE_STYLE: '0.2',
        ELEVENLABS_VOICE_USE_SPEAKER_BOOST: 'false',
        ELEVENLABS_ENABLE_LOGGING: 'false',
        ELEVENLABS_LOG_AUDIO_DATA: 'true',
        ELEVENLABS_HEALTH_CHECK_ENABLED: 'false',
        ELEVENLABS_HEALTH_CHECK_INTERVAL_MS: '30000',
        NODE_ENV: 'production',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createElevenLabsConfig();

      expect(result).toEqual({
        apiKey: 'el-api-key',
        baseUrl: 'https://api.elevenlabs.io',
        defaultVoiceId: 'voice-123',
        defaultTtsModel: 'custom_model',
        defaultSttModel: 'scribe_v1',
        maxConcurrentRequests: 5,
        rateLimitDelayMs: 2000,
        maxRetries: 5,
        retryDelayMs: 3000,
        defaultOutputFormat: 'wav_44100',
        voiceSettings: {
          stability: 0.8,
          similarityBoost: 0.9,
          style: 0.2,
          useSpeakerBoost: false,
        },
        enableLogging: false,
        logAudioData: true,
        healthCheck: {
          enabled: false,
          intervalMs: 30000,
        },
        nodeEnv: 'production',
      });
    });

    it('should use defaults when API key is not provided (optional)', async () => {
      const mockConfigValues = {
        ELEVENLABS_API_KEY: undefined, // Optional - should not throw error
        ELEVENLABS_BASE_URL: undefined,
        ELEVENLABS_DEFAULT_VOICE_ID: undefined, // Optional field
        ELEVENLABS_DEFAULT_TTS_MODEL: undefined,
        ELEVENLABS_DEFAULT_STT_MODEL: undefined,
        ELEVENLABS_MAX_CONCURRENT_REQUESTS: undefined,
        ELEVENLABS_RATE_LIMIT_DELAY_MS: undefined,
        ELEVENLABS_MAX_RETRIES: undefined,
        ELEVENLABS_RETRY_DELAY_MS: undefined,
        ELEVENLABS_DEFAULT_OUTPUT_FORMAT: undefined,
        ELEVENLABS_VOICE_STABILITY: undefined,
        ELEVENLABS_VOICE_SIMILARITY_BOOST: undefined,
        ELEVENLABS_VOICE_STYLE: undefined,
        ELEVENLABS_VOICE_USE_SPEAKER_BOOST: undefined,
        ELEVENLABS_ENABLE_LOGGING: undefined,
        ELEVENLABS_LOG_AUDIO_DATA: undefined,
        ELEVENLABS_HEALTH_CHECK_ENABLED: undefined,
        ELEVENLABS_HEALTH_CHECK_INTERVAL_MS: undefined,
        NODE_ENV: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createElevenLabsConfig();

      expect(result.apiKey).toBeUndefined(); // API key is optional
      expect(result.baseUrl).toBe('https://api.elevenlabs.io');
      expect(result.defaultTtsModel).toBe('eleven_multilingual_v2');
      expect(result.maxConcurrentRequests).toBe(3);
      expect(result.voiceSettings.stability).toBe(0.5);
      expect(result.enableLogging).toBe(true);
      expect(result.defaultVoiceId).toBeUndefined(); // Optional field should be undefined
    });
  });

  describe('createOpenAIConfig', () => {
    it('should create OpenAI configuration with config values', async () => {
      const mockConfigValues = {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_ORGANIZATION: 'org-123',
        OPENAI_MODEL: 'gpt-4-turbo',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: 'sk-openai-key',
        organization: 'org-123',
        model: 'gpt-4-turbo',
      });
    });

    it('should use default model when not specified', async () => {
      const mockConfigValues = {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_ORGANIZATION: undefined, // Optional field
        OPENAI_MODEL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: 'sk-openai-key',
        organization: undefined, // Optional field should be undefined
        model: 'gpt-4',
      });
    });

    it('should handle missing API key gracefully (optional)', async () => {
      const mockConfigValues = {
        OPENAI_API_KEY: undefined, // Optional - should not throw error
        OPENAI_ORGANIZATION: undefined,
        OPENAI_MODEL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: undefined, // API key is optional
        organization: undefined,
        model: 'gpt-4',
      });
    });
  });

  describe('createAnthropicConfig', () => {
    it('should create Anthropic configuration with config values', async () => {
      const mockConfigValues = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: 'sk-ant-key',
        model: 'claude-3-sonnet-20240229',
      });
    });

    it('should use default model when not specified', async () => {
      const mockConfigValues = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        ANTHROPIC_MODEL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: 'sk-ant-key',
        model: 'claude-3-opus-20240229',
      });
    });

    it('should handle missing API key gracefully (optional)', async () => {
      const mockConfigValues = {
        ANTHROPIC_API_KEY: undefined, // Optional - should not throw error
        ANTHROPIC_MODEL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: undefined, // API key is optional
        model: 'claude-3-opus-20240229',
      });
    });
  });

  describe('Error Classes', () => {
    describe('UnleashConfigValidationError', () => {
      it('should create error with missing keys and cause', () => {
        const missingKeys = ['KEY1', 'KEY2'];
        const cause = new Error('Original error');
        const error = new UnleashConfigValidationError('Validation failed', missingKeys, cause);

        expect(error.message).toBe('Validation failed');
        expect(error.code).toBe('UNLEASH_CONFIG_VALIDATION_ERROR');
        expect(error.missingKeys).toEqual(missingKeys);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('UnleashConfigValidationError');
      });

      it('should create error without cause', () => {
        const missingKeys = ['KEY1'];
        const error = new UnleashConfigValidationError('Validation failed', missingKeys);

        expect(error.message).toBe('Validation failed');
        expect(error.missingKeys).toEqual(missingKeys);
        expect((error as unknown as { cause?: Error }).cause).toBeUndefined();
      });
    });

    describe('UnleashConfigFetchError', () => {
      it('should create error with config key and cause', () => {
        const configKey = 'CONFIG_KEY';
        const cause = new Error('Fetch failed');
        const error = new UnleashConfigFetchError('Fetch error', configKey, cause);

        expect(error.message).toBe('Fetch error');
        expect(error.code).toBe('UNLEASH_CONFIG_FETCH_ERROR');
        expect(error.configKey).toBe(configKey);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('UnleashConfigFetchError');
      });
    });
  });

  describe('Optional API Key Validation', () => {
    it('should not throw validation error for optional API keys', async () => {
      interface OptionalApiConfig extends Record<string, any> {
        readonly apiKey?: string;
        readonly model: string;
      }

      const configMap = {
        apiKey: 'ANTHROPIC_API_KEY', // This is marked as optional
        model: 'ANTHROPIC_MODEL',
      };

      const mockConfigValues = {
        ANTHROPIC_API_KEY: undefined, // Optional API key missing
        ANTHROPIC_MODEL: undefined,
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<OptionalApiConfig>(configMap, { model: 'default-model' });

      expect(result).toEqual({
        apiKey: undefined,
        model: 'default-model',
      });
    });

    it('should validate all optional API keys are properly marked', async () => {
      // Test that all API keys mentioned in the implementation are properly optional
      const optionalKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'LANGSMITH_API_KEY', 'ELEVENLABS_API_KEY'];

      for (const apiKey of optionalKeys) {
        interface TestConfig extends Record<string, any> {
          readonly apiKey?: string;
          readonly requiredField: string;
        }

        const configMap = {
          apiKey: apiKey,
          requiredField: 'REQUIRED_FIELD',
        };

        const mockConfigValues = {
          [apiKey]: undefined, // Optional API key missing
          REQUIRED_FIELD: 'value',
        };

        mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

        // Should not throw error for optional API key
        const result = await factory.createConfig<TestConfig>(configMap);
        expect(result.apiKey).toBeUndefined();
        expect(result.requiredField).toBe('value');
      }
    });

    it('should still validate required fields correctly', async () => {
      interface RequiredConfig extends Record<string, any> {
        readonly requiredField: string;
        readonly optionalApiKey?: string;
      }

      const configMap = {
        requiredField: 'REQUIRED_FIELD',
        optionalApiKey: 'OPENAI_API_KEY', // This is optional
      };

      const mockConfigValues = {
        REQUIRED_FIELD: undefined, // Required field missing
        OPENAI_API_KEY: undefined, // Optional field missing - should be OK
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      await expect(factory.createConfig<RequiredConfig>(configMap)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('REQUIRED_FIELD'),
        }),
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle UnleashService failure gracefully', async () => {
      mockUnleashService.getConfigValues.mockRejectedValue(new Error('Service unavailable'));

      await expect(factory.createDatabaseConfig()).rejects.toThrow('Service unavailable');
    });

    it('should validate configuration completeness correctly', async () => {
      // Test with partially missing required config
      const mockConfigValues = {
        POSTGRES_HOST: 'host',
        POSTGRES_PORT: '5432',
        POSTGRES_USERNAME: undefined, // Missing required
        POSTGRES_PASSWORD: 'password',
        POSTGRES_DB: 'database',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const error = await factory.createDatabaseConfig().catch((e) => e);

      expect(error).toBeInstanceOf(UnleashConfigValidationError);
      expect(error.missingKeys).toContain('POSTGRES_USERNAME');
    });
  });

  describe('Type conversion edge cases', () => {
    interface EdgeCaseConfig extends Record<string, any> {
      readonly stringValue: string;
      readonly numberValue: number;
      readonly booleanValue: boolean;
    }

    const edgeConfigMap = {
      stringValue: 'STRING_VALUE',
      numberValue: 'NUMBER_VALUE',
      booleanValue: 'BOOLEAN_VALUE',
    };

    it('should handle empty string values', async () => {
      const mockConfigValues = {
        STRING_VALUE: '',
        NUMBER_VALUE: '0',
        BOOLEAN_VALUE: 'false',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<EdgeCaseConfig>(edgeConfigMap, {
        stringValue: 'default',
        numberValue: 42,
        booleanValue: true,
      });

      expect(result.stringValue).toBe('');
      expect(result.numberValue).toBe(0);
      expect(result.booleanValue).toBe(false);
    });

    it('should handle whitespace-only string values', async () => {
      const mockConfigValues = {
        STRING_VALUE: '   ',
        NUMBER_VALUE: '  123  ',
        BOOLEAN_VALUE: '  true  ',
      };

      mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

      const result = await factory.createConfig<EdgeCaseConfig>(edgeConfigMap, {
        stringValue: 'default',
        numberValue: 42,
        booleanValue: false,
      });

      expect(result.stringValue).toBe('   ');
      expect(result.numberValue).toBe(123); // parseFloat should handle whitespace
      expect(result.booleanValue).toBe(false); // whitespace-padded 'true' should be handled as false (toLowerCase of '  true  ' !== 'true')
    });

    it('should handle case sensitivity for boolean values', async () => {
      const testCases = ['True', 'TRUE', 'tRuE', 'False', 'FALSE', 'fAlSe'];

      for (const boolValue of testCases) {
        const mockConfigValues = {
          STRING_VALUE: 'test',
          NUMBER_VALUE: '42',
          BOOLEAN_VALUE: boolValue,
        };

        mockUnleashService.getConfigValues.mockResolvedValue(mockConfigValues);

        const result = await factory.createConfig<EdgeCaseConfig>(edgeConfigMap, {
          stringValue: 'default',
          numberValue: 0,
          booleanValue: false,
        });

        const expectedBoolean = boolValue.toLowerCase() === 'true';
        expect(result.booleanValue).toBe(expectedBoolean);
      }
    });
  });
});
