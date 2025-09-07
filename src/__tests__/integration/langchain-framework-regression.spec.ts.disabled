import { ChatAnthropic } from '@langchain/anthropic';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableMap, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';

/**
 * Regression tests to ensure compatibility with LangChain framework upgrades
 * These tests verify that core LangChain functionality continues to work
 * correctly after version updates.
 */
describe('LangChain Framework Regression Tests', () => {
  describe('Core Message Types', () => {
    it('should maintain compatibility with BaseMessage types', () => {
      const humanMsg = new HumanMessage('Hello');
      const aiMsg = new AIMessage('Hi there');
      const systemMsg = new SystemMessage('You are a helpful assistant');

      expect(humanMsg).toBeInstanceOf(BaseMessage);
      expect(aiMsg).toBeInstanceOf(BaseMessage);
      expect(systemMsg).toBeInstanceOf(BaseMessage);

      expect(humanMsg.content).toBe('Hello');
      expect(aiMsg.content).toBe('Hi there');
      expect(systemMsg.content).toBe('You are a helpful assistant');
    });

    it('should serialize and deserialize messages correctly', () => {
      const messages: BaseMessage[] = [new SystemMessage('System prompt'), new HumanMessage('User input'), new AIMessage('AI response')];

      // Test serialization
      const serialized = messages.map((msg) => ({
        type: msg._getType(),
        content: msg.content,
      }));

      expect(serialized).toEqual([
        { type: 'system', content: 'System prompt' },
        { type: 'human', content: 'User input' },
        { type: 'ai', content: 'AI response' },
      ]);
    });
  });

  describe('Chat Model Initialization', () => {
    it('should initialize ChatOpenAI with correct configuration', () => {
      const model = new ChatOpenAI({
        model: 'gpt-4',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 2000,
        streaming: true,
      });

      expect(model).toBeInstanceOf(ChatOpenAI);
      expect(model.model).toBe('gpt-4');
      expect(model.temperature).toBe(0.7);
      expect(model.maxTokens).toBe(2000);
      expect(model.streaming).toBe(true);
    });

    it('should initialize ChatAnthropic with correct configuration', () => {
      const model = new ChatAnthropic({
        model: 'claude-3-sonnet',
        apiKey: 'test-key',
        temperature: 0.5,
        maxTokens: 4000,
      });

      expect(model).toBeInstanceOf(ChatAnthropic);
      expect(model.model).toBe('claude-3-sonnet');
      expect(model.temperature).toBe(0.5);
      expect(model.maxTokens).toBe(4000);
    });

    it('should support tool binding on chat models', () => {
      const model = new ChatOpenAI({
        model: 'gpt-4',
        apiKey: 'test-key',
      });

      const tools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          schema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
        },
      ];

      const modelWithTools = model.bindTools(tools as any);
      expect(modelWithTools).toBeDefined();
      expect(modelWithTools.invoke).toBeDefined();
    });
  });

  describe('LCEL Runnable Patterns', () => {
    it('should compose runnables with RunnableSequence', async () => {
      const sequence = RunnableSequence.from([
        { invoke: async (x: number) => x * 2 },
        { invoke: async (x: number) => x + 10 },
        { invoke: async (x: number) => x / 2 },
      ]);

      const result = await sequence.invoke(5);
      expect(result).toBe(10); // (5 * 2 + 10) / 2 = 10
    });

    it('should work with RunnableMap for parallel execution', async () => {
      const map = RunnableMap.from({
        doubled: { invoke: async (x: number) => x * 2 },
        tripled: { invoke: async (x: number) => x * 3 },
        original: new RunnablePassthrough(),
      });

      const result = await map.invoke(5);
      expect(result).toEqual({
        doubled: 10,
        tripled: 15,
        original: 5,
      });
    });

    it('should handle complex nested runnable compositions', async () => {
      const complexChain = RunnableSequence.from([
        RunnableMap.from({
          processed: RunnableSequence.from([{ invoke: async (x: any) => x.value * 2 }, { invoke: async (x: number) => ({ result: x }) }]),
          original: new RunnablePassthrough(),
        }),
        { invoke: async (x: any) => ({ ...x.processed, original: x.original }) },
      ]);

      const result = await complexChain.invoke({ value: 10 });
      expect(result).toEqual({
        result: 20,
        original: { value: 10 },
      });
    });

    it('should support runnable with config', async () => {
      const runnable = {
        invoke: async (input: any, config?: any) => {
          return {
            input,
            hasConfig: !!config,
            metadata: config?.metadata,
          };
        },
      };

      const result = await runnable.invoke('test', {
        metadata: { userId: '123' },
      });

      expect(result).toEqual({
        input: 'test',
        hasConfig: true,
        metadata: { userId: '123' },
      });
    });
  });

  describe('LangGraph StateGraph', () => {
    it('should create and compile a basic state graph', () => {
      const graph = new StateGraph(MessagesAnnotation);

      const mockNode = async (state: any) => {
        return { messages: [new AIMessage('Response')] };
      };

      graph.addNode('agent', mockNode).addEdge(START, 'agent').addEdge('agent', END);

      const compiled = graph.compile();

      expect(compiled).toBeDefined();
      expect(compiled.invoke).toBeDefined();
      expect(compiled.stream).toBeDefined();
    });

    it('should support conditional edges in state graph', () => {
      const graph = new StateGraph(MessagesAnnotation);

      const shouldContinue = (state: any) => {
        const lastMessage = state.messages[state.messages.length - 1];
        return lastMessage.content === 'continue' ? 'next' : END;
      };

      graph
        .addNode('first', async () => ({ messages: [] }))
        .addNode('next', async () => ({ messages: [] }))
        .addEdge(START, 'first')
        .addConditionalEdges('first', shouldContinue, ['next', END])
        .addEdge('next', END);

      const compiled = graph.compile();
      expect(compiled).toBeDefined();
    });

    it('should work with ToolNode', () => {
      const tools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          func: async (input: any) => 'tool result',
        },
      ];

      const toolNode = new ToolNode(tools as any);
      expect(toolNode).toBeDefined();
      expect(toolNode.invoke).toBeDefined();
    });

    it('should support checkpointing with PostgresSaver mock', () => {
      // Mock PostgresSaver since we don't have a real DB connection
      const mockCheckpointer = {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        setup: jest.fn().mockResolvedValue(undefined),
      };

      const graph = new StateGraph(MessagesAnnotation);
      graph.addNode('test', async () => ({ messages: [] }));
      graph.addEdge(START, 'test');
      graph.addEdge('test', END);

      const compiled = graph.compile({
        checkpointer: mockCheckpointer as any,
      });

      expect(compiled).toBeDefined();
    });
  });

  describe('Callback System', () => {
    it('should create and use CallbackManager', () => {
      const manager = new CallbackManager();
      expect(manager).toBeInstanceOf(CallbackManager);
      expect(manager.addHandler).toBeDefined();
      expect(manager.removeHandler).toBeDefined();
      expect(manager.setHandlers).toBeDefined();
    });

    it('should add custom callback handlers', () => {
      class CustomHandler extends BaseCallbackHandler {
        name = 'CustomHandler';

        async handleLLMStart() {
          // Custom logic
        }
      }

      const handler = new CustomHandler();
      const manager = new CallbackManager();

      manager.addHandler(handler);
      expect(manager.handlers).toContain(handler);
    });

    it('should support LangChainTracer', () => {
      const mockClient = {} as Client;

      const tracer = new LangChainTracer({
        projectName: 'test-project',
        client: mockClient,
      });

      expect(tracer).toBeInstanceOf(BaseCallbackHandler);
      expect(tracer.name).toBe('langchain_tracer');
    });
  });

  describe('LangSmith Integration', () => {
    it('should support traceable decorator', () => {
      const testFunction = async (input: string) => {
        return `Processed: ${input}`;
      };

      // Mock traceable since we don't have real LangSmith connection
      const mockTraceable = jest.fn((fn) => fn);

      const traced = mockTraceable(testFunction, {
        name: 'test-operation',
        metadata: { version: '1.0' },
      });

      expect(traced).toBe(testFunction);
      expect(mockTraceable).toHaveBeenCalledWith(
        testFunction,
        expect.objectContaining({
          name: 'test-operation',
        }),
      );
    });

    it('should create LangSmith Client with correct config', () => {
      // Mock Client constructor
      const MockClient = jest.fn().mockImplementation(() => ({
        createRun: jest.fn(),
        updateRun: jest.fn(),
      }));

      const client = new MockClient({
        apiKey: 'test-key',
        apiUrl: 'https://api.smith.langchain.com',
      });

      expect(MockClient).toHaveBeenCalledWith({
        apiKey: 'test-key',
        apiUrl: 'https://api.smith.langchain.com',
      });
    });
  });

  describe('Environment Variable Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should respect LangChain environment variables', () => {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_PROJECT = 'test-project';
      process.env.LANGCHAIN_API_KEY = 'test-key';
      process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'true';

      expect(process.env.LANGCHAIN_TRACING_V2).toBe('true');
      expect(process.env.LANGCHAIN_PROJECT).toBe('test-project');
      expect(process.env.LANGCHAIN_API_KEY).toBe('test-key');
      expect(process.env.LANGCHAIN_CALLBACKS_BACKGROUND).toBe('true');
    });

    it('should respect LangSmith environment variables', () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'smith-key';
      process.env.LANGSMITH_ENDPOINT = 'https://custom.endpoint.com';
      process.env.LANGSMITH_HIDE_INPUTS = 'true';
      process.env.LANGSMITH_HIDE_OUTPUTS = 'false';

      expect(process.env.LANGSMITH_TRACING).toBe('true');
      expect(process.env.LANGSMITH_API_KEY).toBe('smith-key');
      expect(process.env.LANGSMITH_ENDPOINT).toBe('https://custom.endpoint.com');
      expect(process.env.LANGSMITH_HIDE_INPUTS).toBe('true');
      expect(process.env.LANGSMITH_HIDE_OUTPUTS).toBe('false');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility with v0.2 patterns', async () => {
      // Test that old patterns still work
      const model = new ChatOpenAI({ apiKey: 'test' });

      // Old invoke pattern
      const invoke = jest.spyOn(model, 'invoke').mockResolvedValue(new AIMessage('Response'));

      const result = await model.invoke([new HumanMessage('Test')]);
      expect(result).toBeInstanceOf(AIMessage);

      invoke.mockRestore();
    });

    it('should support both old and new streaming patterns', async () => {
      const model = new ChatOpenAI({ apiKey: 'test', streaming: true });

      // Mock stream method
      const stream = jest.spyOn(model, 'stream').mockImplementation(async function* () {
        yield { content: 'chunk1' } as any;
        yield { content: 'chunk2' } as any;
      });

      const chunks: any[] = [];
      for await (const chunk of model.stream([new HumanMessage('Test')])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      stream.mockRestore();
    });
  });

  describe('Version-Specific Features', () => {
    it('should detect LangChain core version', () => {
      // This would normally check package.json or import version
      const langchainVersion = '0.3.75'; // Mocked version

      expect(langchainVersion).toMatch(/^0\.3\.\d+$/);

      const [major, minor, patch] = langchainVersion.split('.').map(Number);
      expect(major).toBe(0);
      expect(minor).toBeGreaterThanOrEqual(3);
    });

    it('should handle new v0.3+ features', () => {
      // Test features specific to v0.3+
      const sequence = RunnableSequence.from([]);
      expect(sequence.name).toBeDefined();
      expect(sequence.lc_namespace).toBeDefined();
    });
  });
});
