import type { Document } from '@langchain/core/documents';
import type { BaseMessage } from '@langchain/core/messages';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { MetricsCollector } from '../../decorators/metric.decorator';
import { addSpanAttribute, addSpanEvent, setSpanStatus } from '../../decorators/trace.decorator';
import { LangChainInstrumentationContext, LangChainInstrumentationService } from '../langchain-instrumentation.service';
import { StructuredLoggerService } from '../structured-logger.service';

// Mock dependencies
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(),
  },
  SpanKind: {
    CLIENT: 'client',
    INTERNAL: 'internal',
  },
  SpanStatusCode: {
    OK: 'ok',
    ERROR: 'error',
  },
}));

jest.mock('../../decorators/metric.decorator', () => ({
  MetricsCollector: {
    recordTokenConsumption: jest.fn(),
    recordHistogram: jest.fn(),
    updateActiveConversations: jest.fn(),
    incrementCounter: jest.fn(),
    recordMemoryRetrieval: jest.fn(),
    updateGauge: jest.fn(),
  },
}));

jest.mock('../../decorators/trace.decorator', () => ({
  addSpanAttribute: jest.fn(),
  addSpanEvent: jest.fn(),
  setSpanStatus: jest.fn(),
}));

jest.mock('../structured-logger.service');

describe('LangChainInstrumentationService', () => {
  let service: LangChainInstrumentationService;
  let mockTracer: any;
  let mockSpan: any;
  let mockLogger: jest.Mocked<StructuredLoggerService>;

  const mockContext: LangChainInstrumentationContext = {
    operation: 'chain_invoke',
    chainType: 'llm_chain',
    modelProvider: 'openai',
    modelName: 'gpt-4',
    threadId: 'thread-123',
    tokenCount: 150,
    cost: 0.003,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock span
    mockSpan = {
      setAttributes: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
    };

    // Mock tracer
    mockTracer = {
      startActiveSpan: jest.fn(),
    };

    // Mock logger
    mockLogger = {
      logAIOperation: jest.fn(),
      logConversation: jest.fn(),
      logMemoryOperation: jest.fn(),
      logData: jest.fn(),
    } as any;

    // Setup mocks
    (trace.getTracer as jest.Mock).mockReturnValue(mockTracer);
    (StructuredLoggerService as jest.Mock).mockImplementation(() => mockLogger);

    service = new LangChainInstrumentationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create tracer with correct name and version', () => {
      expect(trace.getTracer).toHaveBeenCalledWith('langchain-instrumentation', '1.0.0');
    });

    it('should create structured logger with correct context', () => {
      expect(StructuredLoggerService).toHaveBeenCalledWith('LangChainInstrumentation');
    });
  });

  describe('instrumentOperation', () => {
    it('should instrument successful operation with span', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success result');

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const result = await service.instrumentOperation('chain_invoke', mockContext, mockOperation);

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'langchain.chain_invoke',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'langchain.operation': 'chain_invoke',
            'langchain.version': '1.0.0',
            'langchain.chain_type': 'llm_chain',
            'langchain.model.provider': 'openai',
            'langchain.model.name': 'gpt-4',
            'langchain.thread_id': 'thread-123',
          },
        },
        expect.any(Function),
      );

      expect(mockOperation).toHaveBeenCalled();
      expect(result).toBe('success result');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record token consumption and cost metrics', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      await service.instrumentOperation('llm_invoke', mockContext, mockOperation);

      expect(addSpanAttribute).toHaveBeenCalledWith('langchain.tokens.consumed', 150);
      expect(addSpanAttribute).toHaveBeenCalledWith('langchain.cost.estimate', 0.003);
      expect(MetricsCollector.recordTokenConsumption).toHaveBeenCalledWith(150, {
        operation: 'llm_invoke',
        model_provider: 'openai',
        model_name: 'gpt-4',
      });
    });

    it('should handle operation failure with error recording', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      await expect(service.instrumentOperation('chain_invoke', mockContext, mockOperation)).rejects.toThrow('Operation failed');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(setSpanStatus).toHaveBeenCalledWith(SpanStatusCode.ERROR, 'Operation failed');
      expect(mockLogger.logAIOperation).toHaveBeenCalledWith(
        'chain_invoke',
        expect.any(Number),
        false,
        expect.objectContaining({
          chainType: 'llm_chain',
          modelProvider: 'openai',
          error: 'Operation failed',
        }),
        error,
      );
    });

    it('should add span events for operation lifecycle', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      await service.instrumentOperation('tool_execute', mockContext, mockOperation);

      expect(addSpanEvent).toHaveBeenCalledWith(
        'operation.started',
        expect.objectContaining({
          operation: 'tool_execute',
          timestamp: expect.any(Number),
        }),
      );
      expect(addSpanEvent).toHaveBeenCalledWith(
        'operation.completed',
        expect.objectContaining({
          duration: expect.any(Number),
          success: true,
        }),
      );
    });

    it('should handle operations without optional context fields', async () => {
      const minimalContext: LangChainInstrumentationContext = {
        operation: 'embedding_generate',
      };
      const mockOperation = jest.fn().mockResolvedValue('result');

      mockTracer.startActiveSpan.mockImplementation((_name: any, _options: any, callback: any) => {
        return callback(mockSpan);
      });

      const result = await service.instrumentOperation('embedding_generate', minimalContext, mockOperation);

      expect(result).toBe('result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'langchain.embedding_generate',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'langchain.operation': 'embedding_generate',
            'langchain.version': '1.0.0',
          },
        },
        expect.any(Function),
      );
    });
  });

  describe('instrumentChainInvoke', () => {
    it('should instrument chain invocation with message token estimation', async () => {
      const messages: BaseMessage[] = [
        { content: 'Hello world', type: 'human' } as unknown as unknown as BaseMessage,
        { content: 'Hi there!', type: 'ai' } as unknown as unknown as BaseMessage,
      ];
      const mockOperation = jest.fn().mockResolvedValue('chain result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockResolvedValue('chain result');

      const result = await service.instrumentChainInvoke('llm_chain', 'openai', 'gpt-4', messages, mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'chain_invoke',
        {
          operation: 'chain_invoke',
          chainType: 'llm_chain',
          modelProvider: 'openai',
          modelName: 'gpt-4',
          tokenCount: expect.any(Number), // Token estimation
        },
        mockOperation,
      );
      expect(result).toBe('chain result');
    });

    it('should estimate token count from messages correctly', async () => {
      const longMessage = 'A'.repeat(400); // Should estimate ~100 tokens
      const messages: BaseMessage[] = [{ content: longMessage, type: 'human' } as unknown as BaseMessage];
      const mockOperation = jest.fn().mockResolvedValue('result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockResolvedValue('result');

      await service.instrumentChainInvoke('llm_chain', 'openai', 'gpt-4', messages, mockOperation);

      const callArgs = instrumentSpy.mock.calls[0][1];
      expect(callArgs.tokenCount).toBeGreaterThan(90); // Should be around 100
    });

    it('should handle complex message content', async () => {
      const complexMessage: BaseMessage = {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', image_url: 'data:...' },
        ],
        type: 'human',
      } as any;
      const messages = [complexMessage];
      const mockOperation = jest.fn().mockResolvedValue('result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockResolvedValue('result');

      await service.instrumentChainInvoke('llm_chain', 'openai', 'gpt-4', messages, mockOperation);

      expect(instrumentSpy).toHaveBeenCalled();
      const callArgs = instrumentSpy.mock.calls[0][1];
      expect(callArgs.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('instrumentAgentExecute', () => {
    it('should instrument agent execution with thread context', async () => {
      const mockOperation = jest.fn().mockResolvedValue('agent result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockResolvedValue('agent result');

      const result = await service.instrumentAgentExecute('react_agent', 'anthropic', 'claude-3', 'thread-456', mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'agent_execute',
        {
          operation: 'agent_execute',
          chainType: 'react_agent',
          modelProvider: 'anthropic',
          modelName: 'claude-3',
          threadId: 'thread-456',
        },
        mockOperation,
      );
      expect(result).toBe('agent result');
    });
  });

  describe('instrumentMemoryRetrieval', () => {
    it('should instrument memory retrieval with performance logging', async () => {
      const mockOperation = jest.fn().mockResolvedValue('memory result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockImplementation(async (_operation, _context, operationFn) => {
        return await operationFn();
      });

      const result = await service.instrumentMemoryRetrieval('semantic', 'thread-789', mockOperation, 'search query');

      expect(instrumentSpy).toHaveBeenCalledWith(
        'memory_retrieve',
        {
          operation: 'memory_retrieve',
          threadId: 'thread-789',
        },
        expect.any(Function),
      );

      expect(mockLogger.logMemoryOperation).toHaveBeenCalledWith('retrieve', 'thread-789', expect.any(Number), true, {
        memoryType: 'semantic',
        queryLength: 12, // Length of 'search query'
      });

      expect(MetricsCollector.recordHistogram).toHaveBeenCalledWith('emily_memory_retrieval_duration', expect.any(Number), {
        labels: { memory_type: 'semantic', thread_id: 'thread-789' },
      });

      expect(result).toBe('memory result');
    });

    it('should handle memory retrieval without query parameter', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const _instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockImplementation(async (_operation, _context, operationFn) => {
        return await operationFn();
      });

      await service.instrumentMemoryRetrieval('checkpointer', 'thread-999', mockOperation);

      expect(mockLogger.logMemoryOperation).toHaveBeenCalledWith('retrieve', 'thread-999', expect.any(Number), true, {
        memoryType: 'checkpointer',
        queryLength: 0,
      });
    });
  });

  describe('instrumentMemoryStorage', () => {
    it('should instrument memory storage operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('storage result');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockImplementation(async (_operation, _context, operationFn) => {
        return await operationFn();
      });

      const result = await service.instrumentMemoryStorage('semantic', 'thread-321', 5, mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'memory_store',
        {
          operation: 'memory_store',
          threadId: 'thread-321',
          documentCount: 5,
        },
        expect.any(Function),
      );

      expect(mockLogger.logMemoryOperation).toHaveBeenCalledWith('store', 'thread-321', expect.any(Number), true, {
        memoryType: 'semantic',
        messageCount: 5,
      });

      expect(result).toBe('storage result');
    });
  });

  describe('instrumentToolExecution', () => {
    it('should instrument tool execution with input/output size tracking', async () => {
      const inputData = { query: 'test query', options: { limit: 10 } };
      const outputData = { results: ['result1', 'result2'] };
      const mockOperation = jest.fn().mockResolvedValue(outputData);

      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockImplementation(async (_operation, _context, operationFn) => {
        return await operationFn();
      });

      const result = await service.instrumentToolExecution('search_tool', inputData, mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'tool_execute',
        {
          operation: 'tool_execute',
          toolName: 'search_tool',
        },
        expect.any(Function),
      );

      expect(addSpanAttribute).toHaveBeenCalledWith('tool.input.size', expect.any(Number));
      expect(addSpanAttribute).toHaveBeenCalledWith('tool.output.size', expect.any(Number));

      expect(result).toBe(outputData);
    });
  });

  describe('instrumentDocumentProcessing', () => {
    it('should instrument document processing with size metrics', async () => {
      const documents: Document[] = [
        { pageContent: 'Document 1 content here', metadata: {} },
        { pageContent: 'Document 2 with more content here', metadata: {} },
      ];
      const mockOperation = jest.fn().mockResolvedValue('processed documents');

      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockImplementation(async (_operation, _context, operationFn) => {
        return await operationFn();
      });

      const result = await service.instrumentDocumentProcessing(documents, 'split', mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'document_process',
        {
          operation: 'document_process',
          documentCount: 2,
        },
        expect.any(Function),
      );

      expect(addSpanAttribute).toHaveBeenCalledWith('document.total_size', expect.any(Number));
      expect(addSpanAttribute).toHaveBeenCalledWith('document.operation', 'split');

      expect(result).toBe('processed documents');
    });
  });

  describe('instrumentEmbedding', () => {
    it('should instrument embedding generation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('embeddings');
      const instrumentSpy = jest.spyOn(service, 'instrumentOperation').mockResolvedValue('embeddings');

      const result = await service.instrumentEmbedding('openai', 'text-embedding-ada-002', 3, mockOperation);

      expect(instrumentSpy).toHaveBeenCalledWith(
        'embedding_generate',
        {
          operation: 'embedding_generate',
          modelProvider: 'openai',
          modelName: 'text-embedding-ada-002',
          documentCount: 3,
        },
        mockOperation,
      );

      expect(result).toBe('embeddings');
    });
  });

  describe('Conversation Logging', () => {
    it('should log conversation start events', () => {
      service.logConversationStart('thread-abc', 2);

      expect(mockLogger.logConversation).toHaveBeenCalledWith('started', 'thread-abc', 2);
      expect(MetricsCollector.updateActiveConversations).toHaveBeenCalledWith(1, { thread_id: 'thread-abc' });
    });

    it('should log conversation start with default message count', () => {
      service.logConversationStart('thread-def');

      expect(mockLogger.logConversation).toHaveBeenCalledWith('started', 'thread-def', 1);
    });

    it('should log conversation end events', () => {
      service.logConversationEnd('thread-ghi', 15, 300000);

      expect(mockLogger.logConversation).toHaveBeenCalledWith('ended', 'thread-ghi', 15, {
        total_duration: 300000,
      });
      expect(MetricsCollector.updateActiveConversations).toHaveBeenCalledWith(-1, { thread_id: 'thread-ghi' });
    });
  });

  describe('Personality Consistency Logging', () => {
    it('should log personality consistency evaluation', () => {
      const context = { evaluationMethod: 'semantic_similarity' };

      service.logPersonalityConsistency('thread-jkl', 0.85, context);

      expect(mockLogger.logData).toHaveBeenCalledWith('info', 'Personality consistency evaluated', {
        thread_id: 'thread-jkl',
        consistency_score: 0.85,
        evaluationMethod: 'semantic_similarity',
      });

      expect(MetricsCollector.recordHistogram).toHaveBeenCalledWith('emily_personality_consistency_score', 0.85, {
        description: 'Personality consistency score',
        labels: { thread_id: 'thread-jkl' },
      });
    });

    it('should log personality consistency without context', () => {
      service.logPersonalityConsistency('thread-mno', 0.92);

      expect(mockLogger.logData).toHaveBeenCalledWith('info', 'Personality consistency evaluated', {
        thread_id: 'thread-mno',
        consistency_score: 0.92,
      });
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens correctly for simple string messages', () => {
      const messages: BaseMessage[] = [{ content: 'Hello world!', type: 'human' } as unknown as BaseMessage];

      // Use private method through service instance
      const service2 = service as any;
      const tokenCount = service2.estimateTokenCount(messages);

      expect(tokenCount).toBe(Math.ceil('Hello world!'.length / 4));
    });

    it('should estimate tokens for complex object content', () => {
      const complexContent = { text: 'Hello', metadata: { type: 'greeting' } };
      const messages: BaseMessage[] = [{ content: complexContent, type: 'human' } as any];

      const service2 = service as any;
      const tokenCount = service2.estimateTokenCount(messages);

      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBe(Math.ceil(JSON.stringify(complexContent).length / 4));
    });

    it('should handle empty messages array', () => {
      const messages: BaseMessage[] = [];

      const service2 = service as any;
      const tokenCount = service2.estimateTokenCount(messages);

      expect(tokenCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle span creation failures gracefully', async () => {
      mockTracer.startActiveSpan.mockImplementation(() => {
        throw new Error('Span creation failed');
      });

      const mockOperation = jest.fn().mockResolvedValue('result');

      await expect(service.instrumentOperation('chain_invoke', mockContext, mockOperation)).rejects.toThrow('Span creation failed');
    });
  });
});
