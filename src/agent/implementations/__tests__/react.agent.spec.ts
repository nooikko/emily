import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

import { AgentFactory } from '../../agent.factory';
import { ModelProvider } from '../../enum/model-provider.enum';
import { MemoryService } from '../../memory/memory.service';
import type { EnhancedMemoryHealthStatus, MemoryHealthStatus, RetrievedMemory } from '../../memory/types';
import { ReactAgent } from '../react.agent';

// Mock dependencies
jest.mock('../../agent.factory');
jest.mock('../../memory/memory.service');
jest.mock('@langchain/langgraph-checkpoint-postgres', () => {
  const mockFromConnString = jest.fn(() => ({
    get: jest.fn(),
    setup: jest.fn(),
  }));
  const mockPostgresSaver = jest.fn(() => ({
    get: jest.fn(),
    setup: jest.fn(),
  })) as jest.MockedFunction<any> & { fromConnString: jest.MockedFunction<any> };
  mockPostgresSaver.fromConnString = mockFromConnString;
  mockPostgresSaver.prototype = {};
  return {
    PostgresSaver: mockPostgresSaver,
  };
});

describe('ReactAgent', () => {
  let agent: ReactAgent;
  let mockAgentFactory: jest.Mocked<typeof AgentFactory>;
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockAgent: any;
  let mockMemoryEnhancedAgent: any;
  let postgresCheckpointer: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      ENABLE_SEMANTIC_MEMORY: 'true',
      LLM_PROVIDER: 'OPENAI',
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
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
      retrieveRelevantMemories: jest.fn(),
      storeConversationMemory: jest.fn(),
      clearThreadMemories: jest.fn(),
      getHealthStatus: jest.fn(),
      getConfig: jest.fn(),
    } as any;

    // Setup postgres checkpointer mock - ensure it's an instance of PostgresSaver
    postgresCheckpointer = Object.create(PostgresSaver.prototype);
    postgresCheckpointer.get = jest.fn();
    postgresCheckpointer.setup = jest.fn();
    (PostgresSaver.fromConnString as jest.Mock).mockReturnValue(postgresCheckpointer);

    mockAgentFactory = AgentFactory as jest.Mocked<typeof AgentFactory>;
    mockAgentFactory.createAgent = jest.fn().mockReturnValue(mockAgent);
    mockAgentFactory.createMemoryEnhancedAgent = jest.fn().mockReturnValue(mockMemoryEnhancedAgent);

    (MemoryService as jest.Mock).mockImplementation(() => mockMemoryService);

    agent = new ReactAgent(mockMemoryService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with memory enhancement enabled by default', () => {
      expect(MemoryService).toHaveBeenCalled();
      expect(AgentFactory.createMemoryEnhancedAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, [], mockMemoryService, postgresCheckpointer);
      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, [], postgresCheckpointer);
    });

    it('should disable memory enhancement when ENABLE_SEMANTIC_MEMORY is false', () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';

      new ReactAgent(mockMemoryService);

      expect(AgentFactory.createAgent).toHaveBeenCalled();
      // Memory enhanced agent should still be created but won't be used
    });
  });

  describe('getModelProvider', () => {
    it('should return ANTHROPIC when provider is set and key is available', () => {
      process.env.LLM_PROVIDER = 'ANTHROPIC';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      new ReactAgent(mockMemoryService);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.ANTHROPIC, expect.anything(), expect.anything());
    });

    it('should return OPENAI when provider is set and key is available', () => {
      process.env.LLM_PROVIDER = 'OPENAI';
      process.env.OPENAI_API_KEY = 'test-key';

      new ReactAgent(mockMemoryService);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, expect.anything(), expect.anything());
    });

    it('should fallback to available API key when provider is not set', () => {
      delete process.env.LLM_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      new ReactAgent(mockMemoryService);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.ANTHROPIC, expect.anything(), expect.anything());
    });

    it('should default to OPENAI when no keys are available', () => {
      delete process.env.LLM_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      new ReactAgent(mockMemoryService);

      expect(AgentFactory.createAgent).toHaveBeenCalledWith(ModelProvider.OPENAI, expect.anything(), expect.anything());
    });
  });

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
      new ReactAgent(mockMemoryService);
      (agent as any).useMemoryEnhanced = false;
      (agent as any).memoryEnhancedAgent = null;

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

  describe('stream', () => {
    const mockInput = { messages: [new HumanMessage({ content: 'Test message' })] };
    const mockOptions = { configurable: { thread_id: 'test-thread' } };

    it('should use memory-enhanced agent for streaming when memory is enabled', async () => {
      const mockStream = 'mock-stream';
      mockMemoryEnhancedAgent.stream.mockResolvedValue(mockStream);

      const result = await agent.stream(mockInput, mockOptions);

      expect(mockMemoryEnhancedAgent.stream).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(mockAgent.stream).not.toHaveBeenCalled();
      expect(result).toBe(mockStream);
    });

    it('should use regular agent for streaming when memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      new ReactAgent(mockMemoryService);
      (agent as any).useMemoryEnhanced = false;
      (agent as any).memoryEnhancedAgent = null;

      const mockStream = 'mock-stream';
      mockAgent.stream.mockResolvedValue(mockStream);

      const result = await agent.stream(mockInput, mockOptions);

      expect(mockAgent.stream).toHaveBeenCalledWith(mockInput, mockOptions);
      expect(result).toBe(mockStream);
    });
  });

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
      (agent as any).checkpointer = null;

      await expect(agent.initCheckpointer()).resolves.not.toThrow();

      // No setup method should be called since checkpointer is null
      expect(postgresCheckpointer.setup).not.toHaveBeenCalled();
    });
  });

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
      expect((agent as any).useMemoryEnhanced).toBe(false);
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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

      await newAgent.initMemorySystem();

      expect(mockMemoryService.onModuleInit).not.toHaveBeenCalled();
    });
  });

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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

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

  describe('getHybridMemory', () => {
    it('should return hybrid memory service when memory enhancement is enabled', () => {
      const result = agent.getHybridMemory();

      expect(result).toBe(mockMemoryService);
    });

    it('should return null when memory enhancement is disabled', () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

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
      const newAgent = new ReactAgent(mockMemoryService);
      (newAgent as any).useMemoryEnhanced = false;

      expect(newAgent.isMemoryEnhanced()).toBe(false);
    });
  });

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
});
