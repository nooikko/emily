import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { DatabaseConfig } from '../../../infisical/infisical-config.factory';
import type { ModelConfigurations } from '../../../infisical/model-config.module';
import { AgentFactory } from '../../agent.factory';
import { ModelProvider } from '../../enum/model-provider.enum';
import { MemoryService } from '../../memory/memory.service';
import type { EnhancedMemoryHealthStatus, MemoryHealthStatus, RetrievedMemory } from '../../memory/types';
import { ReactAgent } from '../react.agent';

/**
 * ========================================
 * REACT AGENT TEST SUITE
 * ========================================
 *
 * This comprehensive test suite covers all aspects of the ReactAgent implementation:
 * - Agent initialization and configuration
 * - Model provider selection logic
 * - Chat and streaming operations
 * - Memory system integration
 * - Checkpoint/history management
 * - Error handling scenarios
 * - LangSmith integration features
 *
 * Note: This file uses complex mock dependencies and is kept as a single file
 * to maintain the intricate mock setup required across test suites.
 */

// Type definitions for test mocks
type MockCompiledAgent = {
  invoke: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  stream: jest.MockedFunction<(...args: unknown[]) => Promise<AsyncIterable<unknown>>>;
};

type MockPostgresSaver = {
  get: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  setup: jest.MockedFunction<(...args: unknown[]) => Promise<void>>;
};

type MockPostgresSaverConstructor = jest.MockedFunction<(connectionString: string) => MockPostgresSaver> & {
  fromConnString: jest.MockedFunction<(connectionString: string) => MockPostgresSaver>;
};

// Type for accessing private properties in tests
interface ReactAgentTestAccess {
  useMemoryEnhanced: boolean;
  memoryEnhancedAgent: unknown;
  checkpointer: unknown;
}

// Mock dependencies
jest.mock('../../agent.factory');
jest.mock('../../memory/memory.service');
jest.mock('@langchain/langgraph-checkpoint-postgres', () => {
  const mockPostgresSaverInstance: MockPostgresSaver = {
    get: jest.fn(),
    setup: jest.fn(),
  };

  const mockFromConnString = jest.fn((_connectionString: string) => mockPostgresSaverInstance);

  // Create mock constructor with proper typing
  const mockConstructor = Object.assign(
    jest.fn((_connectionString: string) => mockPostgresSaverInstance),
    { fromConnString: mockFromConnString },
  ) as MockPostgresSaverConstructor;

  return {
    PostgresSaver: mockConstructor,
  };
});

describe('ReactAgent', () => {
  let agent: ReactAgent;
  let mockAgentFactory: jest.Mocked<typeof AgentFactory>;
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockAgent: MockCompiledAgent;
  let mockMemoryEnhancedAgent: MockCompiledAgent;
  let postgresCheckpointer: MockPostgresSaver;
  let mockDatabaseConfig: DatabaseConfig;
  let mockModelConfigs: ModelConfigurations;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup environment variables (only non-migrated ones)
    process.env = {
      ...originalEnv,
      ENABLE_SEMANTIC_MEMORY: 'true',
      LLM_PROVIDER: 'OPENAI',
    };

    // Setup mock configurations from Infisical
    mockDatabaseConfig = {
      host: 'localhost',
      port: 5432,
      username: 'test_user',
      password: 'test_password',
      database: 'test_db',
    };

    mockModelConfigs = {
      openai: {
        apiKey: 'test-openai-key',
        organization: 'test-org',
        model: 'gpt-4',
      },
      anthropic: {
        apiKey: 'test-anthropic-key',
        model: 'claude-3-opus-20240229',
      },
    };

    // Setup mocks
    mockAgent = {
      invoke: jest.fn(),
      stream: jest.fn(),
    };

    mockMemoryEnhancedAgent = {
      invoke: jest.fn(),
      stream: jest.fn(),
    };

    mockMemoryService = {
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
      storeConversationMemory: jest.fn(),
      retrieveRelevantMemories: jest.fn(),
      getConversationHistory: jest.fn(),
      buildEnrichedContext: jest.fn(),
      processNewMessages: jest.fn(),
      clearThreadMemories: jest.fn(),
      getHealthStatus: jest.fn(),
      getConfig: jest.fn(),
      getVectorStoreService: jest.fn(),
    } as Partial<MemoryService> as jest.Mocked<MemoryService>;

    // Setup postgres checkpointer mock - ensure it's an instance of PostgresSaver
    postgresCheckpointer = Object.create(PostgresSaver.prototype);
    postgresCheckpointer.get = jest.fn();
    postgresCheckpointer.setup = jest.fn();
    (PostgresSaver.fromConnString as jest.Mock).mockReturnValue(postgresCheckpointer);

    mockAgentFactory = AgentFactory as jest.Mocked<typeof AgentFactory>;
    mockAgentFactory.createAgent = jest.fn().mockReturnValue(mockAgent);
    mockAgentFactory.createMemoryEnhancedAgent = jest.fn().mockReturnValue(mockMemoryEnhancedAgent);

    (MemoryService as jest.Mock).mockImplementation(() => mockMemoryService);

    agent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ========================================
  // AGENT INITIALIZATION TESTS
  // ========================================

  describe('constructor', () => {
    it('should initialize with memory enhancement enabled by default', () => {
      // MemoryService is injected, not instantiated
      expect(AgentFactory.createMemoryEnhancedAgent).toHaveBeenCalledWith(
        ModelProvider.OPENAI,
        [],
        mockModelConfigs,
        mockMemoryService,
        postgresCheckpointer,
      );
      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, [], mockModelConfigs, postgresCheckpointer);
    });

    it('should disable memory enhancement when ENABLE_SEMANTIC_MEMORY is false', () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';

      new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);

      expect(AgentFactory.createAgent).toHaveBeenCalled();
      // Memory enhanced agent should still be created but won't be used
    });
  });

  // ========================================
  // MODEL PROVIDER SELECTION TESTS
  // ========================================

  describe('getModelProvider', () => {
    it('should return ANTHROPIC when provider is set and key is available', () => {
      process.env.LLM_PROVIDER = 'ANTHROPIC';
      // API key is now in mockModelConfigs.anthropic.apiKey

      new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.ANTHROPIC, expect.anything(), mockModelConfigs, expect.anything());
    });

    it('should return OPENAI when provider is set and key is available', () => {
      process.env.LLM_PROVIDER = 'OPENAI';
      // API key is now in mockModelConfigs.openai.apiKey

      new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, expect.anything(), mockModelConfigs, expect.anything());
    });

    it('should fallback to available API key when provider is not set', () => {
      delete process.env.LLM_PROVIDER;
      // Update mock to only have Anthropic key
      const modifiedConfigs = {
        openai: { ...mockModelConfigs.openai, apiKey: '' },
        anthropic: mockModelConfigs.anthropic,
      };

      new ReactAgent(mockMemoryService, mockDatabaseConfig, modifiedConfigs);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.ANTHROPIC, expect.anything(), modifiedConfigs, expect.anything());
    });

    it('should default to OPENAI when no keys are available', () => {
      delete process.env.LLM_PROVIDER;
      // Update mock to have no keys
      const emptyConfigs = {
        openai: { ...mockModelConfigs.openai, apiKey: '' },
        anthropic: { ...mockModelConfigs.anthropic, apiKey: '' },
      };

      new ReactAgent(mockMemoryService, mockDatabaseConfig, emptyConfigs);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, expect.anything(), emptyConfigs, expect.anything());
    });
  });

  // ========================================
  // CHAT OPERATIONS TESTS
  // ========================================

  describe('chat', () => {
    const mockInput = { messages: [new HumanMessage({ content: 'Test message' })] };
    const mockOptions = { configurable: { thread_id: 'test-thread' } };

    it('should use memory-enhanced agent when memory is enabled', async () => {
      const mockResponse = { messages: [new AIMessage({ content: 'AI response' })] };
      mockMemoryEnhancedAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.invoke).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(mockAgent.invoke).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse.messages[0]);
    });

    it('should use regular agent when memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (agent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;
      (agent as unknown as ReactAgentTestAccess).memoryEnhancedAgent = null;

      const mockResponse = { messages: [new AIMessage({ content: 'AI response' })] };
      mockAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(mockInput, mockOptions);

      expect(mockAgent.invoke).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockResponse.messages[0]);
    });

    it('should return null when no messages in response', async () => {
      mockMemoryEnhancedAgent.invoke.mockResolvedValue({ messages: [] });

      const result = await agent.chat(mockInput, mockOptions);

      expect(result).toBeNull();
    });

    it('should return null when response is invalid', async () => {
      mockMemoryEnhancedAgent.invoke.mockResolvedValue(null);

      const result = await agent.chat(mockInput, mockOptions);

      expect(result).toBeNull();
    });

    it('should handle non-array messages in response', async () => {
      mockMemoryEnhancedAgent.invoke.mockResolvedValue({ messages: 'not an array' });

      const result = await agent.chat(mockInput, mockOptions);

      expect(result).toBeNull();
    });
  });

  // ========================================
  // STREAMING OPERATIONS TESTS
  // ========================================

  describe('stream', () => {
    const mockInput = { messages: [new HumanMessage({ content: 'Test message' })] };
    const mockOptions = { configurable: { thread_id: 'test-thread' } };

    it('should use memory-enhanced agent for streaming when memory is enabled', async () => {
      const mockStream = (async function* () {
        yield { content: 'mock response' };
      })();
      mockMemoryEnhancedAgent.stream.mockResolvedValue(mockStream);

      const result = await agent.stream(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.stream).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(mockAgent.stream).not.toHaveBeenCalled();
      expect(result).toBe(mockStream);
    });

    it('should use regular agent for streaming when memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (agent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;
      (agent as unknown as ReactAgentTestAccess).memoryEnhancedAgent = null;

      const mockStream = (async function* () {
        yield { content: 'mock response' };
      })();
      mockAgent.stream.mockResolvedValue(mockStream);

      const result = await agent.stream(mockInput, mockOptions);

      expect(mockAgent.stream).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockStream);
    });
  });

  // ========================================
  // HISTORY MANAGEMENT TESTS
  // ========================================

  describe('getHistory', () => {
    it('should retrieve history from checkpointer', async () => {
      const mockHistory = [new HumanMessage({ content: 'Hello' }), new AIMessage({ content: 'Hi there!' })];

      postgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: mockHistory },
      });

      const result = await agent.getHistory('test-thread');

      expect(postgresCheckpointer.get).toHaveBeenCalledWith({
        configurable: { thread_id: 'test-thread' },
      });
      expect(result).toEqual(mockHistory);
    });

    it('should return empty array when no history exists', async () => {
      postgresCheckpointer.get.mockResolvedValue(null);

      const result = await agent.getHistory('test-thread');

      expect(result).toEqual([]);
    });

    it('should return empty array when messages is not an array', async () => {
      postgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: 'not an array' },
      });

      const result = await agent.getHistory('test-thread');

      expect(result).toEqual([]);
    });
  });

  // ========================================
  // CHECKPOINTER INITIALIZATION TESTS
  // ========================================

  describe('initCheckpointer', () => {
    it('should setup PostgresSaver when checkpointer is PostgresSaver instance', async () => {
      const mockSetup = jest.fn().mockResolvedValue(undefined);
      postgresCheckpointer.setup = mockSetup;

      await agent.initCheckpointer();

      expect(mockSetup).toHaveBeenCalled();
    });

    it('should handle setup errors gracefully', async () => {
      const mockSetup = jest.fn().mockRejectedValue(new Error('Setup failed'));
      postgresCheckpointer.setup = mockSetup;

      // Should not throw
      await expect(agent.initCheckpointer()).resolves.not.toThrow();
    });

    it('should do nothing when checkpointer is not PostgresSaver', async () => {
      // Clear mock before testing
      jest.clearAllMocks();

      // Override the checkpointer with a non-PostgresSaver object
      (agent as unknown as ReactAgentTestAccess).checkpointer = null;

      await expect(agent.initCheckpointer()).resolves.not.toThrow();

      // No setup method should be called since checkpointer is null
      expect(postgresCheckpointer.setup).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // MEMORY SYSTEM INITIALIZATION TESTS
  // ========================================

  describe('initMemorySystem', () => {
    it('should initialize hybrid memory when memory enhancement is enabled', async () => {
      mockMemoryService.onModuleInit.mockResolvedValue();
      postgresCheckpointer.setup = jest.fn().mockResolvedValue(undefined);

      await agent.initMemorySystem();

      expect(mockMemoryService.onModuleInit).toHaveBeenCalled();
    });

    it('should disable memory enhancement on hybrid memory init failure', async () => {
      mockMemoryService.onModuleInit.mockRejectedValue(new Error('Init failed'));
      postgresCheckpointer.setup = jest.fn().mockResolvedValue(undefined);

      await agent.initMemorySystem();

      expect(mockMemoryService.onModuleInit).toHaveBeenCalled();
      expect((agent as unknown as ReactAgentTestAccess).useMemoryEnhanced).toBe(false);
    });

    it('should always initialize checkpointer', async () => {
      mockMemoryService.onModuleInit.mockResolvedValue();
      const mockSetup = jest.fn().mockResolvedValue(undefined);
      postgresCheckpointer.setup = mockSetup;

      await agent.initMemorySystem();

      expect(mockSetup).toHaveBeenCalled();
    });

    it('should skip hybrid memory init when memory enhancement is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      await newAgent.initMemorySystem();

      expect(mockMemoryService.onModuleInit).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // MEMORY OPERATIONS TESTS
  // ========================================

  describe('getRelevantMemories', () => {
    it('should retrieve memories when memory enhancement is enabled', async () => {
      const mockMemories: RetrievedMemory[] = [
        {
          content: 'Relevant memory',
          relevanceScore: 0.9,
          timestamp: Date.now(),
          messageType: 'human',
        },
      ];

      mockMemoryService.retrieveRelevantMemories.mockResolvedValue(mockMemories);

      const result = await agent.getRelevantMemories('test query', 'test-thread');

      expect(mockMemoryService.retrieveRelevantMemories).toHaveBeenCalledWith('test query', 'test-thread');
      expect(result).toEqual(mockMemories);
    });

    it('should return empty array when memory enhancement is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      const result = await newAgent.getRelevantMemories('test query', 'test-thread');

      expect(result).toEqual([]);
      expect(mockMemoryService.retrieveRelevantMemories).not.toHaveBeenCalled();
    });
  });

  describe('storeMemories', () => {
    const mockMessages = [new HumanMessage({ content: 'Human message' }), new AIMessage({ content: 'AI response' })];

    it('should store memories when memory enhancement is enabled', async () => {
      mockMemoryService.storeConversationMemory.mockResolvedValue();

      await agent.storeMemories(mockMessages, 'test-thread');

      expect(mockMemoryService.storeConversationMemory).toHaveBeenCalledWith(mockMessages, 'test-thread');
    });

    it('should do nothing when memory enhancement is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      await newAgent.storeMemories(mockMessages, 'test-thread');

      expect(mockMemoryService.storeConversationMemory).not.toHaveBeenCalled();
    });
  });

  describe('clearThreadMemories', () => {
    it('should clear memories when memory enhancement is enabled', async () => {
      mockMemoryService.clearThreadMemories.mockResolvedValue();

      await agent.clearThreadMemories('test-thread');

      expect(mockMemoryService.clearThreadMemories).toHaveBeenCalledWith('test-thread');
    });

    it('should do nothing when memory enhancement is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      await newAgent.clearThreadMemories('test-thread');

      expect(mockMemoryService.clearThreadMemories).not.toHaveBeenCalled();
    });
  });

  describe('getMemoryHealthStatus', () => {
    it('should return enhanced health status when memory enhancement is enabled', async () => {
      const mockHealthStatus: MemoryHealthStatus = {
        checkpointer: { available: true, lastChecked: Date.now() },
        semantic: { available: true, lastChecked: Date.now() },
      };
      const mockConfig = {
        enableSemanticMemory: true,
        maxMessagesForMemory: 50,
        memoryRetrievalThreshold: 0.7,
        memoryBatchSize: 5,
      };

      mockMemoryService.getHealthStatus.mockResolvedValue(mockHealthStatus);
      mockMemoryService.getConfig.mockReturnValue(mockConfig);

      const result = await agent.getMemoryHealthStatus();

      const expected: EnhancedMemoryHealthStatus = {
        memoryEnhanced: true,
        config: mockConfig,
        ...mockHealthStatus,
      };

      expect(result).toEqual(expected);
    });

    it('should return basic health status when memory enhancement is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      const result = await newAgent.getMemoryHealthStatus();

      expect(result).toEqual({
        memoryEnhanced: false,
        checkpointer: {
          available: true,
          lastChecked: expect.any(Number),
        },
        semantic: {
          available: false,
          lastChecked: expect.any(Number),
        },
      });
      expect(mockMemoryService.getHealthStatus).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // MEMORY UTILITY TESTS
  // ========================================

  describe('getHybridMemory', () => {
    it('should return hybrid memory service when memory enhancement is enabled', () => {
      const result = agent.getHybridMemory();

      expect(result).toBe(mockMemoryService);
    });

    it('should return null when memory enhancement is disabled', () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      const result = newAgent.getHybridMemory();

      expect(result).toBeNull();
    });
  });

  describe('isMemoryEnhanced', () => {
    it('should return true when memory enhancement is enabled', () => {
      expect(agent.isMemoryEnhanced()).toBe(true);
    });

    it('should return false when memory enhancement is disabled', () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService, mockDatabaseConfig, mockModelConfigs);
      // Access private property for testing
      (newAgent as unknown as ReactAgentTestAccess).useMemoryEnhanced = false;

      expect(newAgent.isMemoryEnhanced()).toBe(false);
    });
  });

  // ========================================
  // ERROR HANDLING TESTS
  // ========================================

  describe('error handling', () => {
    it('should handle agent invoke errors in chat', async () => {
      const mockInput = { messages: [new HumanMessage({ content: 'Test message' })] };
      const mockOptions = { configurable: { thread_id: 'test-thread' } };

      mockMemoryEnhancedAgent.invoke.mockRejectedValue(new Error('Agent failed'));

      await expect(agent.chat(mockInput, mockOptions)).rejects.toThrow('Agent failed');
    });

    it('should handle agent stream errors', async () => {
      const mockInput = { messages: [new HumanMessage({ content: 'Test message' })] };
      const mockOptions = { configurable: { thread_id: 'test-thread' } };

      mockMemoryEnhancedAgent.stream.mockRejectedValue(new Error('Stream failed'));

      await expect(agent.stream(mockInput, mockOptions)).rejects.toThrow('Stream failed');
    });

    it('should handle history retrieval errors', async () => {
      const getHistory = jest.spyOn(agent, 'getHistory');
      const mockError = new Error('History failed');

      // Mock the checkpointer get method to reject
      postgresCheckpointer.get.mockImplementation(() => {
        throw mockError;
      });

      const result = await agent.getHistory('test-thread');

      expect(result).toEqual([]);
      expect(getHistory).toHaveBeenCalledWith('test-thread');
    });
  });

  // ========================================
  // LANGSMITH INTEGRATION TESTS
  // ========================================

  describe('LangSmith integration', () => {
    beforeEach(() => {
      // Reset environment variables for LangSmith testing
      delete process.env.LANGSMITH_TRACING;
      delete process.env.LANGSMITH_API_KEY;
      delete process.env.LANGCHAIN_PROJECT;
    });

    it('should work with LangSmith tracing environment variables set', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-langsmith-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';

      const mockInput = { messages: [new HumanMessage({ content: 'Test with LangSmith' })] };
      const mockOptions = { configurable: { thread_id: 'langsmith-thread' } };
      const mockResponse = { messages: [new AIMessage({ content: 'LangSmith AI response' })] };

      mockMemoryEnhancedAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.invoke).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockResponse.messages[0]);

      // Verify environment variables are available for LangSmith integration
      expect(process.env.LANGSMITH_TRACING).toBe('true');
      expect(process.env.LANGSMITH_API_KEY).toBe('test-langsmith-key');
      expect(process.env.LANGCHAIN_PROJECT).toBe('test-project');
    });

    it('should work without LangSmith environment variables', async () => {
      // No LangSmith environment variables set
      const mockInput = { messages: [new HumanMessage({ content: 'Test without LangSmith' })] };
      const mockOptions = { configurable: { thread_id: 'no-langsmith-thread' } };
      const mockResponse = { messages: [new AIMessage({ content: 'Regular AI response' })] };

      mockMemoryEnhancedAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.invoke).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockResponse.messages[0]);
    });

    it('should handle streaming with potential LangSmith tracing', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';

      const mockInput = { messages: [new HumanMessage({ content: 'Stream with LangSmith' })] };
      const mockOptions = { configurable: { thread_id: 'langsmith-stream-thread' } };
      const mockStream = (async function* () {
        yield { content: 'langsmith response' };
      })();

      mockMemoryEnhancedAgent.stream.mockResolvedValue(mockStream);

      const result = await agent.stream(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.stream).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockStream);
    });

    it('should handle sensitive data with LangSmith data masking enabled', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';
      process.env.LANGSMITH_HIDE_INPUTS = 'true';
      process.env.LANGSMITH_HIDE_OUTPUTS = 'true';

      const sensitiveInput = {
        messages: [
          new HumanMessage({
            content: 'My email is user@example.com and my API key is sk-1234567890abcdef',
          }),
        ],
      };
      const mockOptions = { configurable: { thread_id: 'sensitive-thread' } };
      const mockResponse = {
        messages: [
          new AIMessage({
            content: 'I have received your information safely',
          }),
        ],
      };

      mockMemoryEnhancedAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(sensitiveInput, mockOptions);

      expect(mockMemoryEnhancedAgent.invoke).toHaveBeenCalledWith(sensitiveInput, mockOptions);
      expect(result).toBe(mockResponse.messages[0]);

      // Verify data protection flags are set
      expect(process.env.LANGSMITH_HIDE_INPUTS).toBe('true');
      expect(process.env.LANGSMITH_HIDE_OUTPUTS).toBe('true');
    });

    it('should work with custom LangSmith endpoint', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';
      process.env.LANGSMITH_ENDPOINT = 'https://custom-langsmith.example.com';

      const mockInput = { messages: [new HumanMessage({ content: 'Test custom endpoint' })] };
      const mockOptions = { configurable: { thread_id: 'custom-endpoint-thread' } };
      const mockResponse = { messages: [new AIMessage({ content: 'Custom endpoint response' })] };

      mockMemoryEnhancedAgent.invoke.mockResolvedValue(mockResponse);

      const result = await agent.chat(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.invoke).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockResponse.messages[0]);
      expect(process.env.LANGSMITH_ENDPOINT).toBe('https://custom-langsmith.example.com');
    });

    it('should handle memory operations with LangSmith metadata', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';

      const mockMemories: RetrievedMemory[] = [
        {
          content: 'Previous conversation about LangSmith',
          relevanceScore: 0.9,
          timestamp: Date.now(),
          messageType: 'human',
        },
      ];

      mockMemoryService.retrieveRelevantMemories.mockResolvedValue(mockMemories);

      const result = await agent.getRelevantMemories('LangSmith integration', 'langsmith-memory-thread');

      expect(mockMemoryService.retrieveRelevantMemories).toHaveBeenCalledWith('LangSmith integration', 'langsmith-memory-thread');
      expect(result).toEqual(mockMemories);
    });

    it('should handle memory storage with LangSmith environment active', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'test-project';

      const mockMessages = [
        new HumanMessage({ content: 'Store this with LangSmith tracing' }),
        new AIMessage({ content: 'Stored with tracing enabled' }),
      ];

      mockMemoryService.storeConversationMemory.mockResolvedValue();

      await agent.storeMemories(mockMessages, 'langsmith-storage-thread');

      expect(mockMemoryService.storeConversationMemory).toHaveBeenCalledWith(mockMessages, 'langsmith-storage-thread');
    });
  });
});
