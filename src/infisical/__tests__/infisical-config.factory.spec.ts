import { Test, type TestingModule } from '@nestjs/testing';
import { UnleashService } from '../../unleash/unleash.service';
import { InfisicalService } from '../infisical.service';
import { ConfigFetchError, ConfigValidationError, InfisicalConfigFactory } from '../infisical-config.factory';

type ConfigValue = string | number | boolean | undefined;

describe('InfisicalConfigFactory', () => {
  let factory: InfisicalConfigFactory;
  let mockInfisicalService: jest.Mocked<InfisicalService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfisicalConfigFactory,
        {
          provide: InfisicalService,
          useValue: {
            getSecrets: jest.fn(),
            getSecret: jest.fn(),
          },
        },
        {
          provide: UnleashService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            getAllToggles: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    factory = module.get<InfisicalConfigFactory>(InfisicalConfigFactory);
    mockInfisicalService = module.get(InfisicalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConfig', () => {
    interface TestConfig extends Record<string, ConfigValue> {
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

    it('should create configuration with all secrets available', async () => {
      const mockSecrets = {
        TEST_HOST: 'production-host',
        TEST_PORT: '8080',
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: 'optional-value',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'production-host',
        port: 8080,
        enabled: true,
        optionalValue: 'optional-value',
      });
      expect(mockInfisicalService.getSecrets).toHaveBeenCalledWith(['TEST_HOST', 'TEST_PORT', 'TEST_ENABLED', 'TEST_OPTIONAL']);
    });

    it('should use defaults when secrets are not available', async () => {
      const mockSecrets = {
        TEST_HOST: undefined,
        TEST_PORT: undefined,
        TEST_ENABLED: undefined,
        TEST_OPTIONAL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'localhost',
        port: 3000,
        enabled: false,
        optionalValue: undefined,
      });
    });

    it('should mix secrets and defaults appropriately', async () => {
      const mockSecrets = {
        TEST_HOST: 'secret-host',
        TEST_PORT: undefined, // Will use default
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'secret-host',
        port: 3000, // from default
        enabled: true,
        optionalValue: undefined, // This is optional so no error expected
      });
    });

    it('should handle type conversion errors gracefully', async () => {
      const mockSecrets = {
        TEST_HOST: 'production-host',
        TEST_PORT: 'invalid-number',
        TEST_ENABLED: 'true',
        TEST_OPTIONAL: 'optional-value',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TestConfig>(testConfigMap, testDefaults);

      expect(result).toEqual({
        host: 'production-host',
        port: 3000, // fallback to default due to invalid number
        enabled: true,
        optionalValue: 'optional-value',
      });
    });

    it('should throw ConfigValidationError when required values are missing', async () => {
      const mockSecrets = {
        TEST_HOST: undefined,
        TEST_PORT: undefined,
        TEST_ENABLED: undefined,
        TEST_OPTIONAL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      // Don't provide defaults for required fields
      await expect(factory.createConfig<TestConfig>(testConfigMap, {})).rejects.toThrow(ConfigValidationError);
    });
  });

  describe('type conversion', () => {
    interface TypeTestConfig extends Record<string, ConfigValue> {
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
        const mockSecrets = {
          STRING_VALUE: 'test',
          NUMBER_VALUE: '100',
          BOOLEAN_VALUE: testCase.input,
          UNDEFINED_VALUE: 'test',
        };

        mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

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
        const mockSecrets = {
          STRING_VALUE: 'test',
          NUMBER_VALUE: testCase.input,
          BOOLEAN_VALUE: 'true',
          UNDEFINED_VALUE: 'test',
        };

        mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

        const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

        expect(result.numberValue).toBe(testCase.expected);
      }
    });

    it('should handle string values correctly', async () => {
      const mockSecrets = {
        STRING_VALUE: 'secret-string',
        NUMBER_VALUE: '100',
        BOOLEAN_VALUE: 'true',
        UNDEFINED_VALUE: 'secret-undefined',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

      expect(result.stringValue).toBe('secret-string');
      expect(result.undefinedValue).toBe('secret-undefined');
    });

    it('should handle undefined default values correctly', async () => {
      const mockSecrets = {
        STRING_VALUE: 'secret-string',
        NUMBER_VALUE: '100',
        BOOLEAN_VALUE: 'true',
        UNDEFINED_VALUE: 'secret-value',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<TypeTestConfig>(typeTestConfigMap, typeTestDefaults);

      expect(result.undefinedValue).toBe('secret-value');
    });
  });

  describe('createDatabaseConfig', () => {
    it('should create database configuration with defaults', async () => {
      // Mock individual getSecret calls
      mockInfisicalService.getSecret.mockImplementation((key: string) => {
        const mockSecrets: Record<string, string | undefined> = {
          POSTGRES_USERNAME: 'db-user',
          POSTGRES_PASSWORD: 'db-password',
        };
        return Promise.resolve(mockSecrets[key]);
      });

      const result = await factory.createDatabaseConfig();

      expect(result).toEqual({
        host: 'localhost',
        port: 5432,
        username: 'db-user',
        password: 'db-password',
        database: 'emily',
      });
    });

    it('should create database configuration with secrets', async () => {
      // Mock individual getSecret calls
      mockInfisicalService.getSecret.mockImplementation((key: string) => {
        const mockSecrets: Record<string, string | undefined> = {
          POSTGRES_USERNAME: 'prod-user',
          POSTGRES_PASSWORD: 'prod-password',
        };
        return Promise.resolve(mockSecrets[key]);
      });

      const result = await factory.createDatabaseConfig();

      expect(result).toEqual({
        host: 'localhost',
        port: 5432,
        username: 'prod-user',
        password: 'prod-password',
        database: 'emily',
      });
    });

    it('should throw error when required database secrets are missing', async () => {
      const mockSecrets = {
        POSTGRES_HOST: undefined,
        POSTGRES_PORT: undefined,
        POSTGRES_USERNAME: undefined, // Required but missing
        POSTGRES_PASSWORD: undefined, // Required but missing
        POSTGRES_DB: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      await expect(factory.createDatabaseConfig()).rejects.toThrow(ConfigValidationError);
    });
  });

  describe('createRedisConfig', () => {
    it('should create Redis configuration with defaults and optional password', async () => {
      const mockSecrets = {
        REDIS_HOST: undefined,
        REDIS_PORT: undefined,
        REDIS_PASSWORD: 'redis-password',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createRedisConfig();

      expect(result).toEqual({
        host: 'localhost',
        port: 6379,
        password: 'redis-password',
      });
    });

    it('should create Redis configuration without password', async () => {
      const mockSecrets = {
        REDIS_HOST: 'redis-server',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: undefined, // Optional field
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createRedisConfig();

      expect(result).toEqual({
        host: 'redis-server',
        port: 6380,
        password: undefined, // Should be undefined since it's optional
      });
    });
  });

  describe('createLangSmithConfig', () => {
    it('should create LangSmith configuration with secrets and defaults', async () => {
      // Mock individual getSecret calls
      mockInfisicalService.getSecret.mockImplementation((key: string) => {
        const mockSecrets: Record<string, string | undefined> = {
          LANGSMITH_API_KEY: 'ls-api-key',
        };
        return Promise.resolve(mockSecrets[key]);
      });

      const result = await factory.createLangSmithConfig();

      expect(result).toEqual({
        apiKey: 'ls-api-key',
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

    it('should use all defaults when API key is not provided (optional)', async () => {
      // Mock getSecret to return undefined for API key
      mockInfisicalService.getSecret.mockResolvedValue(undefined);

      const result = await factory.createLangSmithConfig();

      expect(result).toEqual({
        apiKey: '',
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
      const mockSecrets = {
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

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

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
      const mockSecrets = {
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

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

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
    it('should create OpenAI configuration with secrets', async () => {
      const mockSecrets = {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_ORGANIZATION: 'org-123',
        OPENAI_MODEL: 'gpt-4-turbo',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: 'sk-openai-key',
        organization: 'org-123',
        model: 'gpt-4-turbo',
      });
    });

    it('should use default model when not specified', async () => {
      const mockSecrets = {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_ORGANIZATION: undefined, // Optional field
        OPENAI_MODEL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: 'sk-openai-key',
        organization: undefined, // Optional field should be undefined
        model: 'gpt-4',
      });
    });

    it('should handle missing API key gracefully (optional)', async () => {
      const mockSecrets = {
        OPENAI_API_KEY: undefined, // Optional - should not throw error
        OPENAI_ORGANIZATION: undefined,
        OPENAI_MODEL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createOpenAIConfig();

      expect(result).toEqual({
        apiKey: undefined, // API key is optional
        organization: undefined,
        model: 'gpt-4',
      });
    });
  });

  describe('createAnthropicConfig', () => {
    it('should create Anthropic configuration with secrets', async () => {
      const mockSecrets = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        ANTHROPIC_MODEL: 'claude-3-sonnet-20240229',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: 'sk-ant-key',
        model: 'claude-3-sonnet-20240229',
      });
    });

    it('should use default model when not specified', async () => {
      const mockSecrets = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        ANTHROPIC_MODEL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: 'sk-ant-key',
        model: 'claude-3-opus-20240229',
      });
    });

    it('should handle missing API key gracefully (optional)', async () => {
      const mockSecrets = {
        ANTHROPIC_API_KEY: undefined, // Optional - should not throw error
        ANTHROPIC_MODEL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createAnthropicConfig();

      expect(result).toEqual({
        apiKey: undefined, // API key is optional
        model: 'claude-3-opus-20240229',
      });
    });
  });

  describe('Error Classes', () => {
    describe('ConfigValidationError', () => {
      it('should create error with missing keys and cause', () => {
        const missingKeys = ['KEY1', 'KEY2'];
        const cause = new Error('Original error');
        const error = new ConfigValidationError('Validation failed', missingKeys, cause);

        expect(error.message).toBe('Validation failed');
        expect(error.code).toBe('CONFIG_VALIDATION_ERROR');
        expect(error.missingKeys).toEqual(missingKeys);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('ConfigValidationError');
      });

      it('should create error without cause', () => {
        const missingKeys = ['KEY1'];
        const error = new ConfigValidationError('Validation failed', missingKeys);

        expect(error.message).toBe('Validation failed');
        expect(error.missingKeys).toEqual(missingKeys);
        expect((error as unknown as { cause?: Error }).cause).toBeUndefined();
      });
    });

    describe('ConfigFetchError', () => {
      it('should create error with secret key and cause', () => {
        const secretKey = 'SECRET_KEY';
        const cause = new Error('Fetch failed');
        const error = new ConfigFetchError('Fetch error', secretKey, cause);

        expect(error.message).toBe('Fetch error');
        expect(error.code).toBe('CONFIG_FETCH_ERROR');
        expect(error.secretKey).toBe(secretKey);
        expect((error as unknown as { cause: Error }).cause).toBe(cause);
        expect(error.name).toBe('ConfigFetchError');
      });
    });
  });

  describe('Optional API Key Validation', () => {
    it('should not throw validation error for optional API keys', async () => {
      interface OptionalApiConfig extends Record<string, ConfigValue> {
        readonly apiKey?: string;
        readonly model: string;
      }

      const configMap = {
        apiKey: 'ANTHROPIC_API_KEY', // This is marked as optional
        model: 'ANTHROPIC_MODEL',
      };

      const mockSecrets = {
        ANTHROPIC_API_KEY: undefined, // Optional API key missing
        ANTHROPIC_MODEL: undefined,
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const result = await factory.createConfig<OptionalApiConfig>(configMap, { model: 'default-model' });

      expect(result).toEqual({
        apiKey: undefined,
        model: 'default-model',
      });
    });

    it('should validate all optional API keys are properly marked', async () => {
      // Test that all API keys mentioned in the fix are properly optional
      const optionalKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'LANGSMITH_API_KEY', 'ELEVENLABS_API_KEY'];

      for (const apiKey of optionalKeys) {
        interface TestConfig extends Record<string, ConfigValue> {
          readonly apiKey?: string;
          readonly requiredField: string;
        }

        const configMap = {
          apiKey: apiKey,
          requiredField: 'REQUIRED_FIELD',
        };

        const mockSecrets = {
          [apiKey]: undefined, // Optional API key missing
          REQUIRED_FIELD: 'value',
        };

        mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

        // Should not throw error for optional API key
        const result = await factory.createConfig<TestConfig>(configMap);
        expect(result.apiKey).toBeUndefined();
        expect(result.requiredField).toBe('value');
      }
    });

    it('should still validate required fields correctly', async () => {
      interface RequiredConfig extends Record<string, ConfigValue> {
        readonly requiredField: string;
        readonly optionalApiKey?: string;
      }

      const configMap = {
        requiredField: 'REQUIRED_FIELD',
        optionalApiKey: 'OPENAI_API_KEY', // This is optional
      };

      const mockSecrets = {
        REQUIRED_FIELD: undefined, // Required field missing
        OPENAI_API_KEY: undefined, // Optional field missing - should be OK
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      await expect(factory.createConfig<RequiredConfig>(configMap)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('REQUIRED_FIELD'),
        }),
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle InfisicalService failure gracefully', async () => {
      mockInfisicalService.getSecret.mockRejectedValue(new Error('Service unavailable'));

      await expect(factory.createDatabaseConfig()).rejects.toThrow('Service unavailable');
    });

    it('should validate configuration completeness correctly', async () => {
      // Test with partially missing required config
      const mockSecrets = {
        POSTGRES_HOST: 'host',
        POSTGRES_PORT: '5432',
        POSTGRES_USERNAME: undefined, // Missing required
        POSTGRES_PASSWORD: 'password',
        POSTGRES_DB: 'database',
      };

      mockInfisicalService.getSecrets.mockResolvedValue(mockSecrets);

      const error = await factory.createDatabaseConfig().catch((e) => e);

      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(error.missingKeys).toContain('POSTGRES_USERNAME');
    });
  });
});
