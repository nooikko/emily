import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';
import type { LangSmithConfig } from '../../types/langsmith-config.interface';
import { LangSmithService } from '../langsmith.service';

// Mock the langsmith module
jest.mock('langsmith');
jest.mock('langsmith/traceable');

describe('LangSmith Tracing Integration Tests', () => {
  let service: LangSmithService;
  let mockClient: jest.Mocked<Client>;
  let module: TestingModule;

  const mockConfig: LangSmithConfig = {
    apiKey: 'test-api-key',
    projectName: 'test-project',
    endpoint: 'https://test.endpoint.com',
    tracingEnabled: true,
    backgroundCallbacks: true,
    hideInputs: false,
    hideOutputs: false,
    defaultMetadata: { environment: 'test' },
  };

  beforeEach(async () => {
    // Create mock client
    mockClient = {
      createRun: jest.fn().mockResolvedValue({ id: 'run-123' }),
      updateRun: jest.fn().mockResolvedValue(undefined),
      readProject: jest.fn().mockResolvedValue({ id: 'project-123' }),
    } as any;

    // Mock Client constructor
    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);

    // Mock traceable to capture the options and make them available for testing
    (traceable as jest.Mock).mockImplementation((fn, options) => {
      // Store the options for test access
      const wrappedFn = (...args: any[]) => fn(...args);
      wrappedFn.processInputs = options?.processInputs;
      wrappedFn.processOutputs = options?.processOutputs;
      return wrappedFn;
    });

    module = await Test.createTestingModule({
      providers: [
        LangSmithService,
        {
          provide: 'LANGSMITH_CONFIG',
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<LangSmithService>(LangSmithService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGCHAIN_PROJECT;
  });

  describe('Initialization and Configuration', () => {
    it('should initialize LangSmith service correctly', async () => {
      await service.onModuleInit();

      expect(service.isEnabled()).toBe(true);
      expect(Client).toHaveBeenCalledWith({
        apiKey: mockConfig.apiKey,
        apiUrl: mockConfig.endpoint,
        hideInputs: mockConfig.hideInputs,
        hideOutputs: mockConfig.hideOutputs,
        autoBatchTracing: mockConfig.backgroundCallbacks,
      });
    });

    it('should set environment variables for LangChain tracing', async () => {
      await service.onModuleInit();

      expect(process.env.LANGSMITH_TRACING).toBe('true');
      expect(process.env.LANGSMITH_API_KEY).toBe(mockConfig.apiKey);
      expect(process.env.LANGCHAIN_PROJECT).toBe(mockConfig.projectName);
      expect(process.env.LANGSMITH_ENDPOINT).toBe(mockConfig.endpoint);
      expect(process.env.LANGCHAIN_CALLBACKS_BACKGROUND).toBe('true');
    });

    it('should handle initialization failures gracefully', async () => {
      mockClient.readProject.mockRejectedValue(new Error('Connection failed'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.isEnabled()).toBe(true); // Still enabled but with warning
    });
  });

  describe('Traceable Function Creation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create traceable functions with proper configuration', () => {
      const testFn = jest.fn().mockResolvedValue('result');
      const metadata = { operation: 'test' };

      const _traced = service.createTraceable('test-operation', testFn, metadata);

      expect(traceable).toHaveBeenCalledWith(
        testFn,
        expect.objectContaining({
          name: 'test-operation',
          project_name: mockConfig.projectName,
          metadata: expect.objectContaining({
            ...mockConfig.defaultMetadata,
            ...metadata,
            timestamp: expect.any(String),
          }),
        }),
      );
    });

    it('should mask sensitive data in traceable inputs', () => {
      const testFn = jest.fn();
      const sensitiveData = {
        apiKey: 'secret-key-123',
        password: 'my-password',
        data: 'normal-data',
      };

      const tracedFn = service.createTraceable('test', testFn);

      // Verify masking function was provided and works correctly
      const maskedInput = (tracedFn as any).processInputs(sensitiveData);

      expect(maskedInput.apiKey).toBe('***REDACTED***');
      expect(maskedInput.password).toBe('***REDACTED***');
      expect(maskedInput.data).toBe('normal-data');
    });

    it('should mask sensitive data in traceable outputs', () => {
      const testFn = jest.fn();
      const sensitiveOutput = {
        token: 'bearer-token-456',
        result: 'success',
      };

      const tracedFn = service.createTraceable('test', testFn);

      const maskedOutput = (tracedFn as any).processOutputs(sensitiveOutput);

      expect(maskedOutput.token).toBe('***REDACTED***');
      expect(maskedOutput.result).toBe('success');
    });

    it('should return original function when tracing is disabled', () => {
      const disabledConfig = { ...mockConfig, tracingEnabled: false };
      const disabledService = new LangSmithService(disabledConfig as any);

      const testFn = jest.fn();
      const result = disabledService.createTraceable('test', testFn);

      expect(result).toBe(testFn);
      expect(traceable).not.toHaveBeenCalled();
    });
  });

  describe('LangChain Callback Handler', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create LangChain callback handler', () => {
      const handler = service.getCallbackHandler();

      expect(handler).toBeInstanceOf(LangChainTracer);
      expect(handler).toBeDefined();
    });

    it('should return null when disabled', () => {
      const disabledConfig = { ...mockConfig, tracingEnabled: false };
      const disabledService = new LangSmithService(disabledConfig as any);

      const handler = disabledService.getCallbackHandler();
      expect(handler).toBeNull();
    });
  });

  describe('Run Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should start a new tracing run', async () => {
      const runName = 'test-chain';
      const metadata = { userId: 'user-123' };

      const run = await service.startRun(runName, 'chain', metadata);

      expect(mockClient.createRun).toHaveBeenCalledWith({
        name: runName,
        run_type: 'chain',
        project_name: mockConfig.projectName,
        extra: expect.objectContaining({
          ...mockConfig.defaultMetadata,
          ...metadata,
        }),
        inputs: undefined,
      });

      expect(run).toEqual({ id: 'run-123' });
    });

    it('should mask sensitive inputs when starting run', async () => {
      const inputs = {
        message: 'Hello',
        apiKey: 'secret-123',
      };

      await service.startRun('test', 'llm', { inputs });

      expect(mockClient.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: {
            message: 'Hello',
            apiKey: '***REDACTED***',
          },
        }),
      );
    });

    it('should update run with outputs', async () => {
      const runId = 'run-123';
      const outputs = { result: 'success' };

      await service.updateRun(runId, outputs);

      expect(mockClient.updateRun).toHaveBeenCalledWith(
        runId,
        expect.objectContaining({
          outputs,
          end_time: expect.any(String),
        }),
      );
    });

    it('should update run with error', async () => {
      const runId = 'run-123';
      const error = new Error('Test error');

      await service.updateRun(runId, null, error);

      expect(mockClient.updateRun).toHaveBeenCalledWith(
        runId,
        expect.objectContaining({
          error: 'Test error',
          end_time: expect.any(String),
        }),
      );
    });

    it('should handle run creation failures gracefully', async () => {
      mockClient.createRun.mockRejectedValue(new Error('API error'));

      const run = await service.startRun('test', 'chain');

      expect(run).toBeNull();
    });

    it('should handle run update failures gracefully', async () => {
      mockClient.updateRun.mockRejectedValue(new Error('API error'));

      await expect(service.updateRun('run-123', { result: 'test' })).resolves.not.toThrow();
    });
  });

  describe('Traced Runnable Creation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create traced runnable with automatic integration', () => {
      const mockRunnable = {
        invoke: jest.fn().mockResolvedValue('result'),
      };

      const tracedRunnable = service.createTracedRunnable('test-runnable', mockRunnable, { meta: 'data' });

      expect(tracedRunnable).toHaveProperty('invoke');
      expect(tracedRunnable.invoke).not.toBe(mockRunnable.invoke);
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should check health successfully', async () => {
      const health = await service.checkHealth();

      expect(health).toEqual({
        connected: true,
        endpoint: mockConfig.endpoint,
        lastChecked: expect.any(Number),
      });
    });

    it('should report health check failures', async () => {
      mockClient.readProject.mockRejectedValue(new Error('Connection failed'));

      const health = await service.checkHealth();

      expect(health).toEqual({
        connected: false,
        endpoint: mockConfig.endpoint,
        lastChecked: expect.any(Number),
        error: 'Connection failed',
      });
    });

    it('should handle missing client', async () => {
      const serviceWithoutClient = new LangSmithService(mockConfig as any);

      const health = await serviceWithoutClient.checkHealth();

      expect(health.connected).toBe(false);
      expect(health.error).toBe('LangSmith client not initialized');
    });
  });

  describe('Metadata and Logging', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create metadata with defaults and custom values', () => {
      const customMeta = { userId: 'user-123' };
      const metadata = service.createMetadata(customMeta);

      expect(metadata).toEqual({
        ...mockConfig.defaultMetadata,
        ...customMeta,
        timestamp: expect.any(String),
      });
    });

    it('should log tracing status', () => {
      const logSpy = jest.spyOn(service.logger, 'log');

      service.logTracingStatus();

      expect(logSpy).toHaveBeenCalledWith(
        'LangSmith Tracing Status',
        expect.objectContaining({
          enabled: true,
          project: mockConfig.projectName,
          endpoint: mockConfig.endpoint,
          backgroundCallbacks: true,
          dataProtection: {
            hideInputs: false,
            hideOutputs: false,
            maskingEnabled: true,
          },
        }),
      );
    });
  });

  describe('End-to-End Tracing Flow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should trace a complete operation flow', async () => {
      // Start a run
      const run = await service.startRun('e2e-test', 'chain', {
        inputs: { query: 'test query' },
      });

      expect(run).toEqual({ id: 'run-123' });

      // Simulate operation
      const operation = async (input: string) => {
        return `Processed: ${input}`;
      };

      const tracedOp = service.createTraceable('process', operation);
      const result = await tracedOp('test input');

      // Update run with result
      await service.updateRun('run-123', { result });

      // Verify complete flow
      expect(mockClient.createRun).toHaveBeenCalledTimes(1);
      expect(mockClient.updateRun).toHaveBeenCalledTimes(1);
      expect(result).toBe('Processed: test input');
    });

    it('should handle complex nested operations', async () => {
      const _parentRun = await service.startRun('parent', 'chain');

      // Create nested operations
      const childOp1 = service.createTraceable('child1', async () => 'result1');
      const childOp2 = service.createTraceable('child2', async () => 'result2');

      const results = await Promise.all([childOp1(), childOp2()]);

      await service.updateRun('run-123', { results });

      expect(results).toEqual(['result1', 'result2']);
      expect(mockClient.updateRun).toHaveBeenCalledWith(
        'run-123',
        expect.objectContaining({
          outputs: { results: ['result1', 'result2'] },
        }),
      );
    });
  });
});
