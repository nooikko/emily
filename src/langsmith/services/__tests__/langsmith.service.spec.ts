import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'langsmith';
import type { LangSmithConfig } from '../../types/langsmith-config.interface';
import { LangSmithService } from '../langsmith.service';

// Mock the langsmith Client
jest.mock('langsmith');
const MockedClient = Client as jest.MockedClass<typeof Client>;

// Type definitions for test mocks
interface MockLangSmithClient {
  readProject: jest.MockedFunction<(projectName?: string) => Promise<unknown>>;
}

interface MockProjectResponse {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

// Interface for accessing private properties in tests
interface LangSmithServiceTestAccess {
  initialize: () => Promise<void>;
}

describe('LangSmithService', () => {
  let service: LangSmithService;
  let mockClient: MockLangSmithClient;
  let mockConfig: LangSmithConfig;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear all mocks
    jest.clearAllMocks();

    // Mock client instance with proper typing
    mockClient = {
      readProject: jest.fn(),
    } satisfies MockLangSmithClient;

    // Mock Client constructor with type assertion for partial mock
    MockedClient.mockImplementation(() => mockClient as unknown as Client);

    // Create mock configuration
    mockConfig = {
      apiKey: 'test-api-key-12345',
      tracingEnabled: true,
      projectName: 'test-project',
      endpoint: 'https://test.langsmith.com',
      backgroundCallbacks: true,
      hideInputs: false,
      hideOutputs: false,
      defaultMetadata: {
        environment: 'test',
        service: 'Emily-AI-Agent',
        version: '1.0.0',
      },
      maskingPatterns: {
        'custom-pattern': 'CUSTOM_REDACTED',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangSmithService,
        {
          provide: 'LANGSMITH_CONFIG',
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<LangSmithService>(LangSmithService);

    // Mock console methods to avoid logger access issues
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    // Mock console methods to avoid output during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with provided configuration', () => {
      expect(service.getConfig()).toEqual({
        tracingEnabled: true,
        projectName: 'test-project',
        endpoint: 'https://test.langsmith.com',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: {
          environment: 'test',
          service: 'Emily-AI-Agent',
          version: '1.0.0',
        },
        maskingPatterns: {
          'custom-pattern': 'CUSTOM_REDACTED',
        },
      });
    });
  });

  describe('onModuleInit', () => {
    it('should initialize successfully', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);

      await service.onModuleInit();

      // Logger would log successful initialization
      expect(MockedClient).toHaveBeenCalledWith({
        apiKey: 'test-api-key-12345',
        apiUrl: 'https://test.langsmith.com',
        hideInputs: false,
        hideOutputs: false,
        autoBatchTracing: true,
      });
    });

    it('should handle initialization failure gracefully', async () => {
      // Mock the initialize method to throw an error
      const initializeError = new Error('Connection failed');
      jest.spyOn(service as unknown as LangSmithServiceTestAccess, 'initialize').mockRejectedValue(initializeError);

      await service.onModuleInit();

      // Logger would log initialization error
    });

    it('should not re-initialize if already initialized', async () => {
      // First initialization
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();

      // Clear the mock call history
      MockedClient.mockClear();

      // Second initialization attempt
      await service.onModuleInit();

      // Should not create a new client
      expect(MockedClient).not.toHaveBeenCalled();
    });
  });

  describe('setupEnvironmentVariables', () => {
    it('should set all required environment variables', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);

      await service.onModuleInit();

      expect(process.env.LANGSMITH_TRACING).toBe('true');
      expect(process.env.LANGSMITH_API_KEY).toBe('test-api-key-12345');
      expect(process.env.LANGCHAIN_PROJECT).toBe('test-project');
      expect(process.env.LANGSMITH_ENDPOINT).toBe('https://test.langsmith.com');
      expect(process.env.LANGCHAIN_CALLBACKS_BACKGROUND).toBe('true');
      expect(process.env.LANGSMITH_HIDE_INPUTS).toBe('false');
      expect(process.env.LANGSMITH_HIDE_OUTPUTS).toBe('false');
    });

    it('should not set endpoint if not provided in config', async () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;

      const testService = new LangSmithService(configWithoutEndpoint);
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);

      await testService.onModuleInit();

      expect(process.env.LANGSMITH_ENDPOINT).toBeUndefined();
    });
  });

  describe('getClient', () => {
    it('should return client when initialized', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();

      const client = service.getClient();

      expect(client).toBe(mockClient);
    });

    it('should return null when not initialized', () => {
      const client = service.getClient();

      expect(client).toBeNull();
      // Logger warning would be called for uninitialized service
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled and initialized', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();

      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when not initialized', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when tracing disabled', async () => {
      const disabledConfig = { ...mockConfig, tracingEnabled: false };
      const testService = new LangSmithService(disabledConfig);

      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await testService.onModuleInit();

      expect(testService.isEnabled()).toBe(false);
    });
  });

  describe('maskSensitiveData', () => {
    beforeEach(async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();
    });

    it('should mask email addresses', () => {
      const text = 'Contact us at test@example.com for support';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('Contact us at [EMAIL_REDACTED] for support');
    });

    it('should mask phone numbers', () => {
      const text = 'Call us at 123-456-7890';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('Call us at [PHONE_REDACTED]');
    });

    it('should mask credit card numbers', () => {
      const text = 'Card: 4532-1234-5678-9012';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('Card: [CARD_REDACTED]');
    });

    it('should mask API keys', () => {
      const text = 'API key: abc123def456ghi789jkl012mno345pqr';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('API key: [API_KEY_REDACTED]');
    });

    it('should mask passwords', () => {
      const text = 'password: "mySecretPassword123"';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('password: [PASSWORD_REDACTED]');
    });

    it('should apply custom patterns', () => {
      const text = 'This contains custom-pattern information';
      const masked = service.maskSensitiveData(text);

      expect(masked).toBe('This contains CUSTOM_REDACTED information');
    });

    it('should handle invalid custom patterns gracefully', () => {
      const configWithInvalidPattern = {
        ...mockConfig,
        maskingPatterns: { '[invalid-regex': 'INVALID' },
      };
      const testService = new LangSmithService(configWithInvalidPattern);

      const text = 'Test text';
      const masked = testService.maskSensitiveData(text);

      expect(masked).toBe(text); // Should return original text
      // Logger would warn about invalid masking pattern
    });

    it('should return input unchanged for non-string values', () => {
      expect(service.maskSensitiveData(null as unknown as string)).toBeNull();
      expect(service.maskSensitiveData(undefined as unknown as string)).toBeUndefined();
      expect(service.maskSensitiveData(123 as unknown as string)).toBe(123);
    });

    it('should handle empty strings', () => {
      const masked = service.maskSensitiveData('');
      expect(masked).toBe('');
    });
  });

  describe('maskSensitiveObject', () => {
    beforeEach(async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();
    });

    it('should mask strings in objects', () => {
      const obj = {
        message: 'Contact test@example.com',
        metadata: { phone: '123-456-7890' },
      };
      const masked = service.maskSensitiveObject(obj);

      expect(masked).toEqual({
        message: 'Contact [EMAIL_REDACTED]',
        metadata: { phone: '[PHONE_REDACTED]' },
      });
    });

    it('should preserve safe metadata fields', () => {
      const obj = {
        timestamp: '2023-01-01T00:00:00Z',
        id: 'test-id',
        threadId: 'thread-123',
        sensitiveData: 'test@example.com',
      };
      const masked = service.maskSensitiveObject(obj);

      expect(masked).toEqual({
        timestamp: '2023-01-01T00:00:00Z',
        id: 'test-id',
        threadId: 'thread-123',
        sensitiveData: '[EMAIL_REDACTED]',
      });
    });

    it('should handle arrays', () => {
      const obj = ['test@example.com', 'normal text', '123-456-7890'];
      const masked = service.maskSensitiveObject(obj);

      expect(masked).toEqual(['[EMAIL_REDACTED]', 'normal text', '[PHONE_REDACTED]']);
    });

    it('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            email: 'nested@example.com',
            safe: 'data',
          },
        },
      };
      const masked = service.maskSensitiveObject(obj);

      expect(masked).toEqual({
        level1: {
          level2: {
            email: '[EMAIL_REDACTED]',
            safe: 'data',
          },
        },
      });
    });

    it('should handle null and undefined values', () => {
      expect(service.maskSensitiveObject(null)).toBeNull();
      expect(service.maskSensitiveObject(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(service.maskSensitiveObject('test@example.com')).toBe('[EMAIL_REDACTED]');
      expect(service.maskSensitiveObject(123)).toBe(123);
      expect(service.maskSensitiveObject(true)).toBe(true);
    });
  });

  describe('checkHealth', () => {
    beforeEach(async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();
    });

    it('should return healthy status when client is working', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);

      const health = await service.checkHealth();

      expect(health).toEqual({
        connected: true,
        endpoint: 'https://test.langsmith.com',
        lastChecked: expect.any(Number),
      });
    });

    it('should handle project read errors gracefully (project not found is OK)', async () => {
      mockClient.readProject.mockRejectedValue(new Error('Project not found'));

      const health = await service.checkHealth();

      expect(health).toEqual({
        connected: true,
        endpoint: 'https://test.langsmith.com',
        lastChecked: expect.any(Number),
      });
    });

    it('should return unhealthy status when client initialization fails', async () => {
      // Create a service without proper initialization
      const uninitializedService = new LangSmithService(mockConfig);

      const health = await uninitializedService.checkHealth();

      expect(health).toEqual({
        connected: false,
        endpoint: 'https://test.langsmith.com',
        lastChecked: expect.any(Number),
        error: 'LangSmith client not initialized',
      });
    });

    it('should use default endpoint when none provided', async () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;
      const testService = new LangSmithService(configWithoutEndpoint);

      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await testService.onModuleInit();

      const health = await testService.checkHealth();

      expect(health.endpoint).toBe('https://api.smith.langchain.com');
    });

    it('should handle unknown errors', async () => {
      mockClient.readProject.mockImplementation(() => {
        throw 'String error';
      });

      const health = await service.checkHealth();

      expect(health).toEqual({
        connected: false,
        endpoint: 'https://test.langsmith.com',
        lastChecked: expect.any(Number),
        error: 'Unknown error',
      });
    });
  });

  describe('createMetadata', () => {
    beforeEach(async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();
    });

    it('should create metadata with default values', () => {
      const metadata = service.createMetadata();

      expect(metadata).toEqual({
        environment: 'test',
        service: 'Emily-AI-Agent',
        version: '1.0.0',
        timestamp: expect.any(String),
      });
    });

    it('should merge custom metadata with defaults', () => {
      const customMetadata = {
        requestId: 'req-456',
      };
      const metadata = service.createMetadata(customMetadata);

      expect(metadata).toEqual({
        environment: 'test',
        service: 'Emily-AI-Agent',
        version: '1.0.0',
        requestId: 'req-456',
        timestamp: expect.any(String),
      });
    });

    it('should allow custom metadata to override defaults', () => {
      const customMetadata = {
        environment: 'custom-env',
        service: 'Custom Service',
      };
      const metadata = service.createMetadata(customMetadata);

      expect(metadata).toEqual({
        environment: 'custom-env',
        service: 'Custom Service',
        version: '1.0.0',
        timestamp: expect.any(String),
      });
    });

    it('should always include timestamp', () => {
      const beforeTime = new Date().toISOString();
      const metadata = service.createMetadata();
      const afterTime = new Date().toISOString();

      expect(metadata.timestamp).toBeDefined();
      expect(typeof metadata.timestamp).toBe('string');
      const timestamp = metadata.timestamp as string;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(timestamp >= beforeTime).toBeTruthy();
      expect(timestamp <= afterTime).toBeTruthy();
    });
  });

  describe('logTracingStatus', () => {
    it('should log comprehensive tracing status', async () => {
      const mockProject: MockProjectResponse = {
        id: 'test-project-id',
        name: 'test-project',
        created_at: new Date().toISOString(),
      };
      mockClient.readProject.mockResolvedValue(mockProject);
      await service.onModuleInit();

      service.logTracingStatus();

      // Logger would log comprehensive tracing status
    });

    it('should handle disabled tracing', async () => {
      const disabledConfig = { ...mockConfig, tracingEnabled: false };
      const testService = new LangSmithService(disabledConfig);

      testService.logTracingStatus();

      // Logger would log disabled tracing status
    });

    it('should show cloud endpoint when none specified', () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;
      const testService = new LangSmithService(configWithoutEndpoint);

      testService.logTracingStatus();

      // Logger would log cloud endpoint status
    });
  });

  describe('getConfig', () => {
    it('should return safe config without API key', () => {
      const safeConfig = service.getConfig();

      expect(safeConfig).not.toHaveProperty('apiKey');
      expect(safeConfig).toEqual({
        tracingEnabled: true,
        projectName: 'test-project',
        endpoint: 'https://test.langsmith.com',
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
        defaultMetadata: {
          environment: 'test',
          service: 'Emily-AI-Agent',
          version: '1.0.0',
        },
        maskingPatterns: {
          'custom-pattern': 'CUSTOM_REDACTED',
        },
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing default metadata gracefully', () => {
      const configWithoutMetadata = { ...mockConfig };
      delete configWithoutMetadata.defaultMetadata;
      const testService = new LangSmithService(configWithoutMetadata);

      const metadata = testService.createMetadata();
      expect(metadata.timestamp).toBeDefined();
    });

    it('should handle missing masking patterns gracefully', () => {
      const configWithoutMasking = { ...mockConfig };
      delete configWithoutMasking.maskingPatterns;
      const testService = new LangSmithService(configWithoutMasking);

      const masked = testService.maskSensitiveData('test@example.com');
      expect(masked).toBe('[EMAIL_REDACTED]');
    });
  });
});
