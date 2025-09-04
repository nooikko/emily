import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as Joi from 'joi';
import { InfisicalService } from '../../infisical/infisical.service';
import { InfisicalConfigFactory } from '../../infisical/infisical-config.factory';
import { createLangSmithConfig } from '../config/langsmith.config';
import { langsmithConfigSchema } from '../config/langsmith-config.validation';
import { LangSmithConfigModule } from '../langsmith-config.module';
import type { LangSmithConfig } from '../types/langsmith-config.interface';

// Mock the config functions
jest.mock('../config/langsmith.config');
jest.mock('../config/langsmith-config.validation');

// Mock InfisicalService to prevent it from overriding test values
jest.mock('../../infisical/infisical.service');

const mockCreateLangSmithConfig = createLangSmithConfig as jest.MockedFunction<typeof createLangSmithConfig>;
const mockLangsmithConfigSchema = langsmithConfigSchema as jest.Mocked<Joi.ObjectSchema>;

describe('LangSmithConfigModule', () => {
  let module: TestingModule;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let _mockInfisicalService: jest.Mocked<InfisicalService>;
  let mockInfisicalConfigFactory: jest.Mocked<Pick<InfisicalConfigFactory, 'createLangSmithConfig'>>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear all mocks
    jest.clearAllMocks();

    // Mock ConfigService with partial typing to avoid missing properties
    mockConfigService = {
      get: jest.fn(),
    } as jest.Mocked<Pick<ConfigService, 'get'>>;

    // Mock InfisicalService to prevent it from interfering with tests
    _mockInfisicalService = {
      onModuleInit: jest.fn(),
      getSecret: jest.fn(),
      getSecrets: jest.fn().mockResolvedValue({}),
      getConfig: jest.fn(),
      isOperational: jest.fn().mockReturnValue(false),
      clearCache: jest.fn(),
      isReady: jest.fn().mockReturnValue(true),
      waitForReady: jest.fn().mockResolvedValue(undefined),
    } as Partial<InfisicalService> as jest.Mocked<InfisicalService>;

    // Create a mock InfisicalConfigFactory
    mockInfisicalConfigFactory = {
      createLangSmithConfig: jest.fn().mockResolvedValue({
        apiKey: 'test-api-key-12345',
        tracingEnabled: true,
        projectName: 'test-project',
        endpoint: 'https://test.langsmith.com',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: { environment: 'test' },
      }),
    };

    // Mock langsmith config schema validation
    mockLangsmithConfigSchema.validate = jest.fn();
  });

  // Helper function to create a testing module with proper mocks
  const createTestModule = () => {
    return Test.createTestingModule({
      imports: [LangSmithConfigModule],
      providers: [ConfigService],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(InfisicalConfigFactory)
      .useValue(mockInfisicalConfigFactory)
      .compile();
  };

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up module
    if (module) {
      await module.close();
    }
  });

  describe('module compilation with valid configuration', () => {
    beforeEach(() => {
      // Setup valid environment
      process.env = {
        ...originalEnv,
        INFISICAL_ENABLED: 'false', // Disable Infisical in tests to use mocked values
        LANGSMITH_API_KEY: 'test-api-key-12345',
        LANGSMITH_TRACING: 'true',
        LANGCHAIN_PROJECT: 'test-project',
        LANGSMITH_ENDPOINT: 'https://test.langsmith.com',
        LANGCHAIN_CALLBACKS_BACKGROUND: 'true',
        LANGSMITH_HIDE_INPUTS: 'false',
        LANGSMITH_HIDE_OUTPUTS: 'false',
        NODE_ENV: 'test',
      };

      // Mock successful validation
      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: undefined,
        value: process.env,
      });

      // Mock config creation
      const mockConfig: LangSmithConfig = {
        apiKey: 'test-api-key-12345',
        tracingEnabled: true,
        projectName: 'test-project',
        endpoint: 'https://test.langsmith.com',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: { environment: 'test' },
      };
      mockCreateLangSmithConfig.mockReturnValue(mockConfig);
    });

    it('should compile successfully with valid configuration', async () => {
      module = await createTestModule();

      expect(module).toBeDefined();
      expect(module.get('LANGSMITH_CONFIG')).toBeDefined();
    });

    it('should validate environment variables', async () => {
      module = await createTestModule();

      expect(mockLangsmithConfigSchema.validate).toHaveBeenCalledWith(process.env, {
        allowUnknown: true,
        abortEarly: false,
      });
    });

    it('should create LangSmith configuration using ConfigService', async () => {
      module = await createTestModule();

      expect(mockInfisicalConfigFactory.createLangSmithConfig).toHaveBeenCalled();
    });

    it('should provide LANGSMITH_CONFIG token', async () => {
      const expectedConfig: LangSmithConfig = {
        apiKey: 'test-api-key-12345',
        tracingEnabled: true,
        projectName: 'test-project',
        endpoint: 'https://test.langsmith.com',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: { environment: 'test' },
      };
      mockCreateLangSmithConfig.mockReturnValue(expectedConfig);

      module = await createTestModule();

      const config = module.get<LangSmithConfig>('LANGSMITH_CONFIG');
      expect(config).toEqual(expectedConfig);
    });
  });

  describe('validation error scenarios', () => {
    it('should throw error when required environment variables are missing', async () => {
      process.env = {
        ...originalEnv,
        // Missing required variables
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGSMITH_API_KEY is required for LangSmith integration',
            path: ['LANGSMITH_API_KEY'],
            type: 'any.required',
            context: { key: 'LANGSMITH_API_KEY', label: 'LANGSMITH_API_KEY' },
          },
          {
            message: 'LANGCHAIN_PROJECT is required to organize your traces',
            path: ['LANGCHAIN_PROJECT'],
            type: 'any.required',
            context: { key: 'LANGCHAIN_PROJECT', label: 'LANGCHAIN_PROJECT' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow(
        'LangSmith configuration validation failed:\nLANGSMITH_API_KEY is required for LangSmith integration\nLANGCHAIN_PROJECT is required to organize your traces',
      );
    });

    it('should throw error when LANGSMITH_API_KEY is empty', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: '', // Empty string
        LANGCHAIN_PROJECT: 'test-project',
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGSMITH_API_KEY is required for LangSmith integration',
            path: ['LANGSMITH_API_KEY'],
            type: 'string.empty',
            context: { key: 'LANGSMITH_API_KEY', label: 'LANGSMITH_API_KEY', value: '' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('LANGSMITH_API_KEY is required for LangSmith integration');
    });

    it('should throw error when LANGCHAIN_PROJECT is empty', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: '', // Empty string
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGCHAIN_PROJECT is required to organize your traces',
            path: ['LANGCHAIN_PROJECT'],
            type: 'string.empty',
            context: { key: 'LANGCHAIN_PROJECT', label: 'LANGCHAIN_PROJECT', value: '' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('LANGCHAIN_PROJECT is required to organize your traces');
    });

    it('should throw error when LANGSMITH_ENDPOINT is invalid', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
        LANGSMITH_ENDPOINT: 'invalid-url', // Invalid URL
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGSMITH_ENDPOINT must be a valid URL',
            path: ['LANGSMITH_ENDPOINT'],
            type: 'string.uri',
            context: { key: 'LANGSMITH_ENDPOINT', label: 'LANGSMITH_ENDPOINT', value: 'invalid-url' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('LANGSMITH_ENDPOINT must be a valid URL');
    });

    it('should throw error when boolean flags have invalid values', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
        LANGSMITH_TRACING: 'maybe', // Invalid boolean
        LANGCHAIN_CALLBACKS_BACKGROUND: 'yes', // Invalid boolean
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGSMITH_TRACING must be either "true" or "false"',
            path: ['LANGSMITH_TRACING'],
            type: 'any.only',
            context: { key: 'LANGSMITH_TRACING', label: 'LANGSMITH_TRACING', value: 'maybe' },
          },
          {
            message: 'LANGCHAIN_CALLBACKS_BACKGROUND must be either "true" or "false"',
            path: ['LANGCHAIN_CALLBACKS_BACKGROUND'],
            type: 'any.only',
            context: { key: 'LANGCHAIN_CALLBACKS_BACKGROUND', label: 'LANGCHAIN_CALLBACKS_BACKGROUND', value: 'yes' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('LANGSMITH_TRACING must be either "true" or "false"');
    });

    it('should throw error when NODE_ENV has invalid value', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
        NODE_ENV: 'staging', // Invalid NODE_ENV value
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'NODE_ENV must be one of: development, test, production',
            path: ['NODE_ENV'],
            type: 'any.only',
            context: { key: 'NODE_ENV', label: 'NODE_ENV', value: 'staging' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('NODE_ENV must be one of: development, test, production');
    });

    it('should handle multiple validation errors', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_TRACING: 'invalid',
        LANGSMITH_ENDPOINT: 'not-a-url',
        NODE_ENV: 'invalid-env',
      };

      const validationError = new Joi.ValidationError(
        'Validation failed',
        [
          {
            message: 'LANGSMITH_API_KEY is required for LangSmith integration',
            path: ['LANGSMITH_API_KEY'],
            type: 'any.required',
            context: { key: 'LANGSMITH_API_KEY', label: 'LANGSMITH_API_KEY' },
          },
          {
            message: 'LANGCHAIN_PROJECT is required to organize your traces',
            path: ['LANGCHAIN_PROJECT'],
            type: 'any.required',
            context: { key: 'LANGCHAIN_PROJECT', label: 'LANGCHAIN_PROJECT' },
          },
          {
            message: 'LANGSMITH_TRACING must be either "true" or "false"',
            path: ['LANGSMITH_TRACING'],
            type: 'any.only',
            context: { key: 'LANGSMITH_TRACING', label: 'LANGSMITH_TRACING', value: 'invalid' },
          },
          {
            message: 'LANGSMITH_ENDPOINT must be a valid URL',
            path: ['LANGSMITH_ENDPOINT'],
            type: 'string.uri',
            context: { key: 'LANGSMITH_ENDPOINT', label: 'LANGSMITH_ENDPOINT', value: 'not-a-url' },
          },
          {
            message: 'NODE_ENV must be one of: development, test, production',
            path: ['NODE_ENV'],
            type: 'any.only',
            context: { key: 'NODE_ENV', label: 'NODE_ENV', value: 'invalid-env' },
          },
        ],
        process.env,
      );

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: validationError,
        value: undefined,
      });

      const expectedErrorMessage = [
        'LangSmith configuration validation failed:',
        'LANGSMITH_API_KEY is required for LangSmith integration',
        'LANGCHAIN_PROJECT is required to organize your traces',
        'LANGSMITH_TRACING must be either "true" or "false"',
        'LANGSMITH_ENDPOINT must be a valid URL',
        'NODE_ENV must be one of: development, test, production',
      ].join('\n');

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow(expectedErrorMessage);
    });
  });

  describe('default value scenarios', () => {
    it('should work with minimal configuration (only required fields)', async () => {
      process.env = {
        ...originalEnv,
        INFISICAL_ENABLED: 'false', // Disable Infisical in tests to use mocked values
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
        // All other values should get defaults
      };

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: undefined,
        value: process.env,
      });

      const expectedConfig: LangSmithConfig = {
        apiKey: 'test-key',
        tracingEnabled: true, // Default
        projectName: 'test-project',
        backgroundCallbacks: true, // Default
        hideInputs: false, // Default
        hideOutputs: false, // Default
        defaultMetadata: { environment: 'development' }, // Default NODE_ENV
      };
      mockCreateLangSmithConfig.mockReturnValue(expectedConfig);
      mockInfisicalConfigFactory.createLangSmithConfig.mockResolvedValue(expectedConfig);

      module = await createTestModule();

      const config = module.get<LangSmithConfig>('LANGSMITH_CONFIG');
      expect(config).toEqual(expectedConfig);
    });

    it('should apply production defaults when NODE_ENV is production', async () => {
      process.env = {
        ...originalEnv,
        INFISICAL_ENABLED: 'false', // Disable Infisical in tests to use mocked values
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
        NODE_ENV: 'production',
      };

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: undefined,
        value: process.env,
      });

      const expectedConfig: LangSmithConfig = {
        apiKey: 'test-key',
        tracingEnabled: true,
        projectName: 'test-project',
        backgroundCallbacks: true,
        hideInputs: true, // Should be true in production
        hideOutputs: true, // Should be true in production
        defaultMetadata: { environment: 'production' },
      };
      mockCreateLangSmithConfig.mockReturnValue(expectedConfig);
      mockInfisicalConfigFactory.createLangSmithConfig.mockResolvedValue(expectedConfig);

      module = await createTestModule();

      const config = module.get<LangSmithConfig>('LANGSMITH_CONFIG');
      expect(config).toEqual(expectedConfig);
    });
  });

  describe('module exports', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        INFISICAL_ENABLED: 'false', // Disable Infisical in tests to use mocked values
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
      };

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: undefined,
        value: process.env,
      });

      const mockConfig: LangSmithConfig = {
        apiKey: 'test-key',
        tracingEnabled: true,
        projectName: 'test-project',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
      };
      mockCreateLangSmithConfig.mockReturnValue(mockConfig);
    });

    it('should export LANGSMITH_CONFIG provider', async () => {
      module = await createTestModule();

      // Verify the token is available for injection
      expect(() => module.get('LANGSMITH_CONFIG')).not.toThrow();
    });

    it('should make LANGSMITH_CONFIG available for other modules', async () => {
      // Create a consumer module that imports LangSmithConfigModule
      class TestConsumerService {
        constructor(public readonly config: LangSmithConfig) {}
      }

      const TestConsumerModule = Test.createTestingModule({
        imports: [LangSmithConfigModule],
        providers: [
          ConfigService,
          {
            provide: TestConsumerService,
            useFactory: (config: LangSmithConfig) => new TestConsumerService(config),
            inject: ['LANGSMITH_CONFIG'],
          },
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .overrideProvider(InfisicalConfigFactory)
        .useValue(mockInfisicalConfigFactory);

      const consumerModule = await TestConsumerModule.compile();
      const consumerService = consumerModule.get(TestConsumerService);

      expect(consumerService.config).toBeDefined();
      expect(consumerService.config.apiKey).toBe('test-api-key-12345');
      expect(consumerService.config.projectName).toBe('test-project');

      await consumerModule.close();
    });
  });

  describe('error handling edge cases', () => {
    it('should handle validation schema throwing unexpected errors', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
      };

      // Mock schema validation to throw an unexpected error
      mockLangsmithConfigSchema.validate.mockImplementation(() => {
        throw new Error('Unexpected validation error');
      });

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('Unexpected validation error');
    });

    it('should handle createLangSmithConfig throwing errors', async () => {
      process.env = {
        ...originalEnv,
        LANGSMITH_API_KEY: 'test-key',
        LANGCHAIN_PROJECT: 'test-project',
      };

      mockLangsmithConfigSchema.validate.mockReturnValue({
        error: undefined,
        value: process.env,
      });

      // Mock config creation to throw an error
      mockCreateLangSmithConfig.mockImplementation(() => {
        throw new Error('Failed to create configuration');
      });
      mockInfisicalConfigFactory.createLangSmithConfig.mockRejectedValue(new Error('Failed to create configuration'));

      await expect(
        Test.createTestingModule({
          imports: [LangSmithConfigModule],
          providers: [ConfigService],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .overrideProvider(InfisicalConfigFactory)
          .useValue(mockInfisicalConfigFactory)
          .compile(),
      ).rejects.toThrow('Failed to create configuration');
    });
  });
});
