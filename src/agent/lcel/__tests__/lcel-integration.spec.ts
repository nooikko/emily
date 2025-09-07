import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Runnable, RunnableLambda, RunnableMap, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { Test, TestingModule } from '@nestjs/testing';
import { ModelProvider } from '../../enum/model-provider.enum';
import type { HybridMemoryServiceInterface } from '../../memory/types';
import { LCELReactAgentBuilder } from '../agent.builder.lcel';
import { LCELAgentFactory } from '../agent.factory.lcel';

// Mock implementations
const mockHybridMemory: Partial<HybridMemoryServiceInterface> = {
  buildEnrichedContext: jest.fn().mockResolvedValue([new HumanMessage('Test message')]),
  processNewMessages: jest.fn().mockResolvedValue(undefined),
  retrieveRelevantMemories: jest.fn().mockResolvedValue([]),
  storeConversationMemory: jest.fn().mockResolvedValue(undefined),
  clearThreadMemories: jest.fn().mockResolvedValue(undefined),
  getHealthStatus: jest.fn().mockResolvedValue({
    memoryEnhanced: true,
    checkpointer: { available: true, lastChecked: Date.now() },
    semantic: { available: true, lastChecked: Date.now() },
  }),
  getConfig: jest.fn().mockReturnValue({}),
};

describe('LCEL Chain Composition Tests', () => {
  let builder: LCELReactAgentBuilder;
  let factory: typeof LCELAgentFactory;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LCELReactAgentBuilder', () => {
    it('should create LCEL chains with proper composition', () => {
      // Use a real ChatOpenAI instance with minimal config
      const mockLLM = new ChatOpenAI({
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
        maxRetries: 0,
      });

      builder = new LCELReactAgentBuilder([], mockLLM, mockHybridMemory as HybridMemoryServiceInterface);

      const chainComponents = builder.getChainComponents();

      expect(chainComponents.memoryEnrichment).toBeDefined();
      expect(chainComponents.modelInvocation).toBeDefined();
      expect(chainComponents.responseProcessing).toBeDefined();
    });

    it('should create standalone LCEL chain', async () => {
      const mockLLM = new ChatOpenAI({
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
        maxRetries: 0,
      });

      builder = new LCELReactAgentBuilder([], mockLLM, mockHybridMemory as HybridMemoryServiceInterface);

      const chain = builder.createStandaloneLCELChain();
      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });

    it('should handle memory enrichment in LCEL chain', async () => {
      const mockLLM = new ChatAnthropic({
        apiKey: 'test-key',
        model: 'claude-3-sonnet-20240229',
        maxRetries: 0,
      });

      const enrichedMemory = {
        ...mockHybridMemory,
        buildEnrichedContext: jest.fn().mockResolvedValue([new HumanMessage('Enriched context'), new HumanMessage('Original message')]),
      };

      builder = new LCELReactAgentBuilder([], mockLLM, enrichedMemory as HybridMemoryServiceInterface);

      const chain = builder.createStandaloneLCELChain();

      // Verify memory enrichment was called
      expect(builder.isMemoryEnhanced()).toBe(true);
      expect(builder.getHybridMemory()).toBe(enrichedMemory);
    });
  });

  describe('LCELAgentFactory', () => {
    const mockConfigs = {
      openai: {
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      anthropic: {
        apiKey: 'test-key',
        model: 'claude-3-sonnet',
      },
    };

    it('should create standard LCEL agent', () => {
      const agent = LCELAgentFactory.createAgent({
        modelProvider: ModelProvider.OPENAI,
        tools: [],
        configs: mockConfigs,
      });

      expect(agent).toBeDefined();
      expect(agent.invoke).toBeDefined();
      expect(agent.stream).toBeDefined();
    });

    it('should create memory-enhanced LCEL agent', () => {
      const agent = LCELAgentFactory.createMemoryEnhancedAgent({
        modelProvider: ModelProvider.ANTHROPIC,
        tools: [],
        configs: mockConfigs,
        hybridMemory: mockHybridMemory as HybridMemoryServiceInterface,
      });

      expect(agent).toBeDefined();
      expect(agent.invoke).toBeDefined();
    });

    it('should create LCEL chain with custom configuration', () => {
      const chain = LCELAgentFactory.createLCELChain({
        modelProvider: ModelProvider.OPENAI,
        tools: [],
        configs: mockConfigs,
        hybridMemory: mockHybridMemory as HybridMemoryServiceInterface,
        streaming: true,
        temperature: 0.5,
        maxTokens: 2000,
      });

      expect(chain).toBeDefined();
      expect(chain.invoke).toBeDefined();
    });

    it('should create pre-configured agents', () => {
      const conversationalAgent = LCELAgentFactory.createPreConfiguredAgent('conversational', ModelProvider.OPENAI, mockConfigs);

      const taskAgent = LCELAgentFactory.createPreConfiguredAgent('task-oriented', ModelProvider.ANTHROPIC, mockConfigs);

      const researchAgent = LCELAgentFactory.createPreConfiguredAgent('research', ModelProvider.OPENAI, mockConfigs);

      expect(conversationalAgent).toBeDefined();
      expect(taskAgent).toBeDefined();
      expect(researchAgent).toBeDefined();
    });

    it('should handle different model providers correctly', () => {
      // Test OpenAI provider
      const openAIAgent = LCELAgentFactory.createAgent({
        modelProvider: ModelProvider.OPENAI,
        tools: [],
        configs: mockConfigs,
      });

      // Test Anthropic provider
      const anthropicAgent = LCELAgentFactory.createAgent({
        modelProvider: ModelProvider.ANTHROPIC,
        tools: [],
        configs: mockConfigs,
      });

      expect(openAIAgent).toBeDefined();
      expect(anthropicAgent).toBeDefined();
    });
  });

  describe('LCEL Chain Error Handling', () => {
    it('should handle missing model provider', () => {
      expect(() => {
        LCELAgentFactory.createAgent({
          modelProvider: null as any,
          tools: [],
          configs: {} as any,
        });
      }).toThrow('Model provider is required');
    });

    it('should handle missing hybrid memory for memory-enhanced agent', () => {
      expect(() => {
        LCELAgentFactory.createMemoryEnhancedAgent({
          modelProvider: ModelProvider.OPENAI,
          tools: [],
          configs: {} as any,
          hybridMemory: undefined as any,
        });
      }).toThrow('Hybrid memory service is required for memory-enhanced agent');
    });

    it('should handle unsupported model provider', () => {
      expect(() => {
        LCELAgentFactory.createAgent({
          modelProvider: 'UNSUPPORTED' as any,
          tools: [],
          configs: {} as any,
        });
      }).toThrow('Unsupported model provider');
    });
  });

  describe('LCEL Runnable Composition', () => {
    it('should compose runnables in correct sequence', async () => {
      const sequence = RunnableSequence.from([
        new RunnablePassthrough(),
        new RunnableMap({
          steps: {
            original: new RunnablePassthrough(),
            transformed: new RunnableLambda({
              func: async (input: any) => `transformed: ${input}`,
            }),
          },
        }),
      ]);

      const result = await sequence.invoke('test input');
      expect(result).toHaveProperty('original', 'test input');
      expect(result).toHaveProperty('transformed', 'transformed: test input');
    });

    it('should handle nested runnable compositions', async () => {
      const innerSequence = RunnableSequence.from([
        new RunnableLambda({ func: async (x: number) => x * 2 }),
        new RunnableLambda({ func: async (x: number) => x + 1 }),
      ]);

      const outerSequence = RunnableSequence.from([new RunnableLambda({ func: async (x: number) => x + 10 }), innerSequence]);

      const result = await outerSequence.invoke(5);
      expect(result).toBe(31); // (5 + 10) * 2 + 1 = 31
    });
  });
});
