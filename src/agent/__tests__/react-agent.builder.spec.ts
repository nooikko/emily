import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ReactAgentBuilder } from '../agent.builder';
import type { MemoryService } from '../memory/memory.service';
import { REACT_AGENT_SYSTEM_PROMPT } from '../prompts';

// Mock dependencies
jest.mock('@langchain/langgraph/prebuilt');

describe('ReactAgentBuilder', () => {
  let builder: ReactAgentBuilder;
  let mockLlm: jest.Mocked<BaseChatModel>;
  let mockHybridMemory: jest.Mocked<MemoryService>;
  let mockTool: jest.Mocked<StructuredToolInterface>;
  let mockToolNode: jest.Mocked<ToolNode>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockLlm = {
      bindTools: jest.fn().mockReturnThis(),
      invoke: jest.fn(),
    } as any;

    mockHybridMemory = {
      buildEnrichedContext: jest.fn(),
      processNewMessages: jest.fn(),
    } as any;

    mockTool = {
      name: 'test-tool',
      description: 'A test tool',
      schema: {},
    } as any;

    mockToolNode = {} as any;

    (ToolNode as unknown as jest.Mock).mockImplementation(() => mockToolNode);
  });

  describe('constructor', () => {
    it('should initialize with valid parameters (basic mode)', () => {
      builder = new ReactAgentBuilder([mockTool], mockLlm);

      expect(builder).toBeDefined();
      expect(builder.isMemoryEnhanced()).toBe(false);
      expect(builder.getHybridMemory()).toBe(null);
      expect(ToolNode).toHaveBeenCalledWith([mockTool]);
    });

    it('should initialize with valid parameters (memory enhanced)', () => {
      builder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);

      expect(builder).toBeDefined();
      expect(builder.isMemoryEnhanced()).toBe(true);
      expect(builder.getHybridMemory()).toBe(mockHybridMemory);
      expect(ToolNode).toHaveBeenCalledWith([mockTool]);
    });

    it('should initialize with empty tools array', () => {
      builder = new ReactAgentBuilder([], mockLlm, mockHybridMemory);

      expect(builder).toBeDefined();
      expect(ToolNode).toHaveBeenCalledWith([]);
    });

    it('should initialize with null tools', () => {
      builder = new ReactAgentBuilder(null as any, mockLlm, mockHybridMemory);

      expect(builder).toBeDefined();
      expect(ToolNode).toHaveBeenCalledWith([]);
    });

    it('should throw error when llm is missing', () => {
      expect(() => new ReactAgentBuilder([mockTool], null as any, mockHybridMemory)).toThrow('Language model (llm) is required');
    });

    it('should work without hybridMemory (basic mode)', () => {
      expect(() => new ReactAgentBuilder([mockTool], mockLlm)).not.toThrow();
    });
  });

  describe('shouldContinue', () => {
    beforeEach(() => {
      builder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);
    });

    it('should return "tools" when message has tool calls', () => {
      const state = {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'test-tool', args: {}, id: 'call-1' }],
          }),
        ],
      };

      const result = (builder as any).shouldContinue(state);

      expect(result).toBe('tools');
    });

    it('should return END when message has no tool calls', () => {
      const state = {
        messages: [new AIMessage({ content: 'Final response' })],
      };

      const result = (builder as any).shouldContinue(state);

      expect(result).toBe(END);
    });

    it('should return END when tool_calls is empty array', () => {
      const state = {
        messages: [
          new AIMessage({
            content: 'Response',
            tool_calls: [],
          }),
        ],
      };

      const result = (builder as any).shouldContinue(state);

      expect(result).toBe(END);
    });

    it('should return END when message has no tool_calls property', () => {
      const state = {
        messages: [new HumanMessage({ content: 'Human message' })],
      };

      const result = (builder as any).shouldContinue(state);

      expect(result).toBe(END);
    });
  });

  describe('callModel - Memory Enhanced Mode', () => {
    beforeEach(() => {
      builder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);
    });

    it('should throw error when llm is missing', async () => {
      // Create a builder without proper LLM but bypass constructor check for this test
      const builderWithoutLlm = Object.create(ReactAgentBuilder.prototype);
      builderWithoutLlm.model = null;
      builderWithoutLlm.hybridMemory = mockHybridMemory;
      const state = { messages: [new HumanMessage({ content: 'Test' })] };

      await expect((builderWithoutLlm as any).callModel(state)).rejects.toThrow('Invalid or missing language model (llm)');
    });

    it('should throw error when llm has no bindTools method', async () => {
      // Create a builder with invalid LLM but bypass constructor check for this test
      const builderWithInvalidLlm = Object.create(ReactAgentBuilder.prototype);
      builderWithInvalidLlm.model = { invoke: jest.fn() };
      builderWithInvalidLlm.hybridMemory = mockHybridMemory;
      const state = { messages: [new HumanMessage({ content: 'Test' })] };

      await expect((builderWithInvalidLlm as any).callModel(state)).rejects.toThrow('Invalid or missing language model (llm)');
    });

    it('should use enriched context when thread_id is provided', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const enrichedMessages = [
        new SystemMessage('Context from memory'),
        new HumanMessage({ content: 'Previous message' }),
        new HumanMessage({ content: 'Test message' }),
      ];
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockHybridMemory.buildEnrichedContext.mockResolvedValue(enrichedMessages);
      mockLlm.invoke.mockResolvedValue(mockResponse);
      mockHybridMemory.processNewMessages.mockResolvedValue();

      const result = await (builder as any).callModel(state, config);

      expect(mockHybridMemory.buildEnrichedContext).toHaveBeenCalledWith(state.messages, 'test-thread', {
        maxHistoryMessages: 15,
        includeSemanticMemories: true,
      });
      expect(mockLlm.invoke).toHaveBeenCalledWith(enrichedMessages);
      expect(mockHybridMemory.processNewMessages).toHaveBeenCalledWith([...state.messages, mockResponse], 'test-thread', { batchStore: true });
      expect(result).toEqual({ messages: mockResponse });
    });

    it('should add system prompt when not in enriched messages', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const enrichedMessages = [new HumanMessage({ content: 'Previous message' }), new HumanMessage({ content: 'Test message' })];
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockHybridMemory.buildEnrichedContext.mockResolvedValue(enrichedMessages);
      mockLlm.invoke.mockResolvedValue(mockResponse);
      mockHybridMemory.processNewMessages.mockResolvedValue();

      await (builder as any).callModel(state, config);

      const invokeCall = mockLlm.invoke.mock.calls[0][0];
      expect(invokeCall[0]).toBeInstanceOf(SystemMessage);
      expect(invokeCall[0].content).toBe(REACT_AGENT_SYSTEM_PROMPT);
    });

    it('should not duplicate system prompt when already present', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const enrichedMessages = [
        new SystemMessage('You are a helpful assistant and have access to tools'),
        new HumanMessage({ content: 'Test message' }),
      ];
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockHybridMemory.buildEnrichedContext.mockResolvedValue(enrichedMessages);
      mockLlm.invoke.mockResolvedValue(mockResponse);
      mockHybridMemory.processNewMessages.mockResolvedValue();

      await (builder as any).callModel(state, config);

      const invokeCall = mockLlm.invoke.mock.calls[0][0];
      expect(invokeCall).toEqual(enrichedMessages);
    });

    it('should handle memory processing errors gracefully', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const enrichedMessages = [new HumanMessage({ content: 'Test message' })];
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockHybridMemory.buildEnrichedContext.mockResolvedValue(enrichedMessages);
      mockLlm.invoke.mockResolvedValue(mockResponse);
      // Mock processNewMessages to reject, but the method should handle this gracefully
      mockHybridMemory.processNewMessages.mockRejectedValue(new Error('Memory error'));

      // Should not throw error even if memory processing fails
      await expect((builder as any).callModel(state, config)).resolves.toEqual({ messages: mockResponse });
    });

    it('should handle context building errors gracefully', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      // Mock buildEnrichedContext to reject, should fall back to basic context
      mockHybridMemory.buildEnrichedContext.mockRejectedValue(new Error('Context error'));
      mockLlm.invoke.mockResolvedValue(mockResponse);

      // Should not throw error and fall back to basic context
      await expect((builder as any).callModel(state, config)).resolves.toEqual({ messages: mockResponse });

      const invokeCall = mockLlm.invoke.mock.calls[0][0];
      expect(invokeCall[0]).toBeInstanceOf(SystemMessage);
      expect(invokeCall[0].content).toBe(REACT_AGENT_SYSTEM_PROMPT);
    });

    it('should use basic context when no thread_id is provided', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockLlm.invoke.mockResolvedValue(mockResponse);

      const result = await (builder as any).callModel(state);

      expect(mockHybridMemory.buildEnrichedContext).not.toHaveBeenCalled();
      expect(mockHybridMemory.processNewMessages).not.toHaveBeenCalled();

      const invokeCall = mockLlm.invoke.mock.calls[0][0];
      expect(invokeCall[0]).toBeInstanceOf(SystemMessage);
      expect(invokeCall[0].content).toBe(REACT_AGENT_SYSTEM_PROMPT);
      expect((invokeCall as any[]).length).toBe(2); // System + user message
      expect((invokeCall as any[])[1]).toEqual(state.messages[0]);
      expect(result).toEqual({ messages: mockResponse });
    });
  });

  describe('callModel - Basic Mode (without memory)', () => {
    beforeEach(() => {
      builder = new ReactAgentBuilder([mockTool], mockLlm); // No hybrid memory
    });

    it('should use basic context when no memory system is available', async () => {
      const state = { messages: [new HumanMessage({ content: 'Test message' })] };
      const config = { configurable: { thread_id: 'test-thread' } };
      const mockResponse = new AIMessageChunk({ content: 'AI response' });

      mockLlm.invoke.mockResolvedValue(mockResponse);

      const result = await (builder as any).callModel(state, config);

      // Should use basic context even with thread_id since no memory system
      const invokeCall = mockLlm.invoke.mock.calls[0][0];
      expect(invokeCall[0]).toBeInstanceOf(SystemMessage);
      expect(invokeCall[0].content).toBe(REACT_AGENT_SYSTEM_PROMPT);
      expect((invokeCall as any[]).length).toBe(2); // System + user message
      expect((invokeCall as any[])[1]).toEqual(state.messages[0]);
      expect(result).toEqual({ messages: mockResponse });
    });
  });

  describe('build', () => {
    beforeEach(() => {
      builder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);
    });

    it('should compile graph without checkpointer', () => {
      const mockCompile = jest.fn().mockReturnValue('compiled-graph');
      const mockStateGraph = {
        compile: mockCompile,
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
      };

      // Mock the state graph
      (builder as any).stateGraph = mockStateGraph;

      const result = builder.build();

      expect(mockCompile).toHaveBeenCalledWith({});
      expect(result).toBe('compiled-graph');
    });

    it('should compile graph with checkpointer', () => {
      const mockCheckpointer = { save: jest.fn(), get: jest.fn() };
      const mockCompile = jest.fn().mockReturnValue('compiled-graph');
      const mockStateGraph = {
        compile: mockCompile,
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
      };

      // Mock the state graph
      (builder as any).stateGraph = mockStateGraph;

      const result = builder.build(mockCheckpointer as any);

      expect(mockCompile).toHaveBeenCalledWith({
        checkpointer: mockCheckpointer,
      });
      expect(result).toBe('compiled-graph');
    });
  });

  describe('memory methods', () => {
    it('should return hybrid memory service when memory enhanced', () => {
      builder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);

      const result = builder.getHybridMemory();
      expect(result).toBe(mockHybridMemory);
      expect(builder.isMemoryEnhanced()).toBe(true);
    });

    it('should return null when not memory enhanced', () => {
      builder = new ReactAgentBuilder([mockTool], mockLlm);

      const result = builder.getHybridMemory();
      expect(result).toBe(null);
      expect(builder.isMemoryEnhanced()).toBe(false);
    });
  });

  describe('integration test', () => {
    it('should properly initialize graph nodes and edges', () => {
      // This test verifies the builder initializes correctly
      // The graph setup happens in initializeGraph() called by constructor
      const testBuilder = new ReactAgentBuilder([mockTool], mockLlm, mockHybridMemory);

      // Verify builder was created successfully
      expect(testBuilder).toBeDefined();
      expect(testBuilder.isMemoryEnhanced()).toBe(true);
    });
  });
});
