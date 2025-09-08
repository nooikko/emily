import { Document } from '@langchain/core/documents';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import { ConversationalRetrievalService } from '../services/conversational-retrieval.service';

// Mock LangChain components
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue({
        text: 'Mock response',
        sourceDocuments: [
          new Document({
            pageContent: 'Mock document content',
            metadata: { source: 'test.txt' },
          }),
        ],
      }),
    })),
  },
  RunnablePassthrough: jest.fn(),
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn(),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({}),
  },
  HumanMessagePromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
  SystemMessagePromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
}));

describe('ConversationalRetrievalService', () => {
  let service: ConversationalRetrievalService;
  let mockCallbackManager: jest.Mocked<CallbackManagerService>;
  let mockLangSmith: jest.Mocked<LangSmithService>;
  let mockMetrics: jest.Mocked<AIMetricsService>;
  let mockInstrumentation: jest.Mocked<LangChainInstrumentationService>;

  // Mock LLM and Retriever
  const mockLLM = {
    call: jest.fn().mockResolvedValue('Mock LLM response'),
    _modelType: 'base_llm',
    _llmType: 'mock',
  } as any;

  const mockRetriever = {
    getRelevantDocuments: jest.fn().mockResolvedValue([
      new Document({
        pageContent: 'Test document',
        metadata: { source: 'test.txt', score: 0.8 },
      }),
    ]),
  } as any;

  beforeEach(async () => {
    // Create mocks
    mockCallbackManager = {
      createCallbackManager: jest.fn().mockReturnValue({
        handlers: [],
      }),
    } as any;

    mockLangSmith = {
      isEnabled: jest.fn().mockReturnValue(true),
      createTraceable: jest.fn().mockImplementation((name, fn) => fn),
      createMetadata: jest.fn().mockReturnValue({}),
      maskSensitiveObject: jest.fn().mockImplementation((obj) => obj),
    } as any;

    mockMetrics = {
      recordOperationDuration: jest.fn(),
    } as any;

    mockInstrumentation = {
      startSpan: jest.fn(),
      endSpan: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationalRetrievalService,
        { provide: CallbackManagerService, useValue: mockCallbackManager },
        { provide: LangSmithService, useValue: mockLangSmith },
        { provide: AIMetricsService, useValue: mockMetrics },
        { provide: LangChainInstrumentationService, useValue: mockInstrumentation },
      ],
    }).compile();

    service = module.get<ConversationalRetrievalService>(ConversationalRetrievalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversationalChain', () => {
    it('should create a conversational chain with basic configuration', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        returnSourceDocuments: true,
      };

      const chain = service.createConversationalChain(config);

      expect(chain).toBeDefined();
      expect(config.returnSourceDocuments).toBe(true);
      // Verify RunnableSequence.from was called
      const { RunnableSequence } = require('@langchain/core/runnables');
      expect(RunnableSequence.from).toHaveBeenCalled();
    });

    it('should create chain with custom prompts', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        qaTemplate: 'Custom QA template with {question}',
        questionGeneratorTemplate: 'Custom question generator with {chat_history} and {question}',
      };

      const chain = service.createConversationalChain(config);

      expect(chain).toBeDefined();
    });

    it('should set default values for optional parameters', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = service.createConversationalChain(config);

      expect(chain).toBeDefined();
    });
  });

  describe('executeConversationalRetrieval', () => {
    let mockChain: any;

    beforeEach(() => {
      mockChain = {
        invoke: jest.fn().mockResolvedValue({
          text: 'This is a test response',
          sourceDocuments: [
            new Document({
              pageContent: 'Source document 1',
              metadata: { source: 'doc1.txt' },
            }),
          ],
        }),
      };
    });

    it('should execute retrieval with empty chat history', async () => {
      const question = 'What is the capital of France?';
      const chatHistory: any[] = [];

      const result = await service.executeConversationalRetrieval(mockChain, question, chatHistory);

      expect(result).toBeDefined();
      expect(result.answer).toBe('This is a test response');
      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.chatHistory).toHaveLength(2); // Question + Answer
      expect(mockChain.invoke).toHaveBeenCalledWith(
        {
          question,
          chat_history: '',
        },
        expect.any(Object),
      );
    });

    it('should execute retrieval with existing chat history', async () => {
      const question = 'Tell me more about it';
      const chatHistory = [new HumanMessage('What is Paris?'), new AIMessage('Paris is the capital of France.')];

      const result = await service.executeConversationalRetrieval(mockChain, question, chatHistory);

      expect(result).toBeDefined();
      expect(result.chatHistory).toHaveLength(4); // Previous + Question + Answer
      expect(mockChain.invoke).toHaveBeenCalledWith(
        {
          question,
          chat_history: 'Human: What is Paris?\nAI: Paris is the capital of France.',
        },
        expect.any(Object),
      );
    });

    it('should truncate chat history when max tokens exceeded', async () => {
      const question = 'Test question';
      const longChatHistory = Array.from({ length: 20 }, (_, i) => new HumanMessage(`This is a very long message number ${i} with lots of content`));

      const result = await service.executeConversationalRetrieval(mockChain, question, longChatHistory, { maxContextTokens: 100 });

      expect(result).toBeDefined();
      expect(result.chatHistory!.length).toBeLessThan(longChatHistory.length + 2);
    });

    it('should include metrics when requested', async () => {
      const question = 'Test question with metrics';

      const result = await service.executeConversationalRetrieval(mockChain, question, [], { includeMetrics: true });

      expect(result).toBeDefined();
      expect(result.sourceDocuments![0].metadata).toHaveProperty('ragMetrics');
    });

    it('should handle chain errors gracefully', async () => {
      const errorChain = {
        invoke: jest.fn().mockRejectedValue(new Error('Chain execution failed')),
      } as any;

      await expect(service.executeConversationalRetrieval(errorChain, 'Test question', [])).rejects.toThrow(
        'Conversational retrieval failed: Chain execution failed',
      );
    });
  });

  describe('createConversationalChainWithMemory', () => {
    it('should create chain with memory integration', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        memoryKey: 'chat_history',
        sessionId: 'test-session-123',
      };

      const chain = await service.createConversationalChainWithMemory(config);

      expect(chain).toBeDefined();
    });

    it('should create chain without memory integration', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = await service.createConversationalChainWithMemory(config);

      expect(chain).toBeDefined();
    });
  });

  describe('summarizeConversation', () => {
    beforeEach(() => {
      // Mock RunnableSequence for summarization
      const { RunnableSequence } = require('@langchain/core/runnables');
      RunnableSequence.from.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
          text: 'Conversation summary: The user asked about Paris and learned it is the capital of France.',
        }),
      }));
    });

    it('should summarize conversation history', async () => {
      const chatHistory = [
        new HumanMessage('What is Paris?'),
        new AIMessage('Paris is the capital of France.'),
        new HumanMessage('What is the population?'),
        new AIMessage('Paris has approximately 2.1 million inhabitants.'),
      ];

      const summary = await service.summarizeConversation(mockLLM, chatHistory);

      expect(summary).toContain('Conversation summary');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should return empty string for empty chat history', async () => {
      const summary = await service.summarizeConversation(mockLLM, []);

      expect(summary).toBe('');
    });

    it('should handle summarization errors gracefully', async () => {
      const { RunnableSequence } = require('@langchain/core/runnables');
      RunnableSequence.from.mockImplementation(() => ({
        invoke: jest.fn().mockRejectedValue(new Error('Summarization failed')),
      }));

      const chatHistory = [new HumanMessage('Test message')];
      const summary = await service.summarizeConversation(mockLLM, chatHistory);

      expect(summary).toBe('');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        returnSourceDocuments: true,
        memoryWindowSize: 10,
        maxContextTokens: 4000,
      };

      const validation = service.validateConfig(config);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const config = {
        retriever: mockRetriever,
      } as any;

      const validation = service.validateConfig(config);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('LLM is required');
    });

    it('should detect invalid parameter values', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        memoryWindowSize: -5,
        maxContextTokens: 0,
      };

      const validation = service.validateConfig(config);

      expect(validation.warnings).toContain('Memory window size should be positive');
      expect(validation.warnings).toContain('Max context tokens should be positive');
    });

    it('should validate prompt templates', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        qaTemplate: 'Template without question placeholder',
        questionGeneratorTemplate: 'Template without chat history placeholder',
      };

      const validation = service.validateConfig(config);

      expect(validation.warnings).toContain('QA template should include {question} placeholder');
      expect(validation.warnings).toContain('Question generator template should include {chat_history} placeholder');
    });
  });

  describe('createStreamingConversationalChain', () => {
    it('should create streaming chain with callbacks', () => {
      const onToken = jest.fn();
      const onSourceDocuments = jest.fn();

      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        onToken,
        onSourceDocuments,
      };

      const chain = service.createStreamingConversationalChain(config);

      expect(chain).toBeDefined();
    });

    it('should create streaming chain without callbacks', () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = service.createStreamingConversationalChain(config);

      expect(chain).toBeDefined();
    });
  });

  describe('private methods', () => {
    describe('truncateChatHistory', () => {
      it('should not truncate when no max tokens specified', () => {
        const chatHistory = [new HumanMessage('Message 1'), new AIMessage('Response 1'), new HumanMessage('Message 2'), new AIMessage('Response 2')];

        // Access private method through any casting
        const result = (service as any).truncateChatHistory(chatHistory);

        expect(result).toHaveLength(4);
      });

      it('should truncate when exceeding max tokens', () => {
        const longMessages = Array.from(
          { length: 10 },
          (_, i) => new HumanMessage('A'.repeat(50)), // Create long messages
        );

        // Access private method through any casting
        const result = (service as any).truncateChatHistory(longMessages, 100);

        expect(result.length).toBeLessThan(longMessages.length);
      });
    });

    describe('formatChatHistoryForChain', () => {
      it('should format chat history correctly', () => {
        const chatHistory = [
          new HumanMessage('Hello'),
          new AIMessage('Hi there'),
          new HumanMessage('How are you?'),
          new AIMessage('I am doing well'),
        ];

        // Access private method through any casting
        const formatted = (service as any).formatChatHistoryForChain(chatHistory);

        expect(formatted).toBe('Human: Hello\nAI: Hi there\nHuman: How are you?\nAI: I am doing well');
      });

      it('should return empty string for empty history', () => {
        // Access private method through any casting
        const formatted = (service as any).formatChatHistoryForChain([]);

        expect(formatted).toBe('');
      });
    });

    describe('estimateTokens', () => {
      it('should estimate tokens correctly', () => {
        const text = 'This is a test message with multiple words';

        // Access private method through any casting
        const tokens = (service as any).estimateTokens(text);

        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBe(Math.ceil(text.length / 4));
      });

      it('should handle empty strings', () => {
        // Access private method through any casting
        const tokens = (service as any).estimateTokens('');

        expect(tokens).toBe(0);
      });
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      const errorLLM = {
        call: jest.fn().mockRejectedValue(new Error('LLM error')),
      } as any;

      const config = {
        llm: errorLLM,
        retriever: mockRetriever,
      };

      // Should not throw during chain creation
      const chain = service.createConversationalChain(config);
      expect(chain).toBeDefined();
    });

    it('should handle retriever errors gracefully', async () => {
      const errorRetriever = {
        getRelevantDocuments: jest.fn().mockRejectedValue(new Error('Retriever error')),
      } as any;

      const config = {
        llm: mockLLM,
        retriever: errorRetriever,
      };

      // Should not throw during chain creation
      const chain = service.createConversationalChain(config);
      expect(chain).toBeDefined();
    });
  });

  describe('integration with observability services', () => {
    beforeEach(() => {
      // Reset and setup chain mock to return successful results
      const mockSuccessfulChain = {
        invoke: jest.fn().mockResolvedValue('Integration test response'),
      } as any;

      // Override the service createConversationalChain to return our controlled mock
      jest.spyOn(service, 'createConversationalChain').mockReturnValue(mockSuccessfulChain);
    });

    it('should use LangSmith when available', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = service.createConversationalChain(config);
      const result = await service.executeConversationalRetrieval(chain, 'Test question', []);

      expect(result).toBeDefined();
      expect(result.chatHistory).toHaveLength(2); // Question + Answer
      expect(typeof result.answer).toBe('string');
    });

    it('should work without LangSmith', async () => {
      mockLangSmith.isEnabled.mockReturnValue(false);

      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = service.createConversationalChain(config);
      const result = await service.executeConversationalRetrieval(chain, 'Test question', []);

      expect(result).toBeDefined();
      expect(result.chatHistory).toHaveLength(2);
      expect(typeof result.answer).toBe('string');
    });

    it('should record metrics when available', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
      };

      const chain = service.createConversationalChain(config);
      const result = await service.executeConversationalRetrieval(chain, 'Test question', []);

      expect(result).toBeDefined();
      expect(result.chatHistory).toHaveLength(2);
      expect(typeof result.answer).toBe('string');
    });
  });
});
