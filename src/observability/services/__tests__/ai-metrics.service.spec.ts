import { Counter, Histogram, metrics, UpDownCounter } from '@opentelemetry/api';
import { AIMetricsService } from '../ai-metrics.service';
import { LogLevel, StructuredLoggerService } from '../structured-logger.service';

// Mock OpenTelemetry API
jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: jest.fn(),
  },
}));

jest.mock('../structured-logger.service');

describe('AIMetricsService', () => {
  let service: AIMetricsService;
  let mockMeter: any;
  let mockLogger: jest.Mocked<StructuredLoggerService>;

  // Mock metric instruments
  let mockCounter: jest.Mocked<Counter>;
  let mockHistogram: jest.Mocked<Histogram>;
  let mockUpDownCounter: jest.Mocked<UpDownCounter>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock metric instruments
    mockCounter = {
      add: jest.fn(),
    } as any;

    mockHistogram = {
      record: jest.fn(),
    } as any;

    mockUpDownCounter = {
      add: jest.fn(),
    } as any;

    // Mock meter that creates instruments
    mockMeter = {
      createCounter: jest.fn().mockReturnValue(mockCounter),
      createHistogram: jest.fn().mockReturnValue(mockHistogram),
      createUpDownCounter: jest.fn().mockReturnValue(mockUpDownCounter),
    };

    // Mock logger
    mockLogger = {
      logInfo: jest.fn(),
      logConversation: jest.fn(),
      logData: jest.fn(),
    } as any;

    // Setup mocks
    (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);
    (StructuredLoggerService as jest.Mock).mockImplementation(() => mockLogger);

    service = new AIMetricsService();
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create meter with correct name and version', () => {
      expect(metrics.getMeter).toHaveBeenCalledWith('emily-ai-metrics', '1.0.0');
    });

    it('should create structured logger with correct context', () => {
      expect(StructuredLoggerService).toHaveBeenCalledWith('AIMetrics');
    });

    it('should initialize all required metrics on module init', async () => {
      // Verify all metric instruments were created
      expect(mockMeter.createCounter).toHaveBeenCalled();
      expect(mockMeter.createHistogram).toHaveBeenCalled();
      expect(mockMeter.createUpDownCounter).toHaveBeenCalled();

      expect(mockLogger.logInfo).toHaveBeenCalledWith('AI Metrics Service initialized');
    });

    it('should create conversation metrics with correct configuration', () => {
      expect(mockMeter.createCounter).toHaveBeenCalledWith('emily_conversations_total', {
        description: 'Total number of conversations by event type',
      });

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('emily_conversation_duration_ms', {
        description: 'Duration of complete conversations',
        unit: 'ms',
      });

      expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith('emily_active_conversations', {
        description: 'Number of currently active conversations',
      });
    });

    it('should create token and cost metrics', () => {
      expect(mockMeter.createHistogram).toHaveBeenCalledWith('emily_tokens_consumed', {
        description: 'Number of tokens consumed by model operations',
        unit: 'tokens',
      });

      expect(mockMeter.createHistogram).toHaveBeenCalledWith('emily_cost_estimate_usd', {
        description: 'Estimated cost of model operations',
        unit: 'usd',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('emily_tokens_by_model_total', {
        description: 'Total tokens consumed by model',
        unit: 'tokens',
      });
    });

    it('should create memory system metrics', () => {
      expect(mockMeter.createHistogram).toHaveBeenCalledWith('emily_memory_operation_duration_ms', {
        description: 'Duration of memory operations',
        unit: 'ms',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('emily_memories_stored_total', {
        description: 'Total number of memories stored',
      });

      expect(mockMeter.createCounter).toHaveBeenCalledWith('emily_memory_searches_total', {
        description: 'Total number of memory searches performed',
      });
    });
  });

  describe('Conversation Metrics', () => {
    it('should record conversation start event', () => {
      service.recordConversationStart('thread-123');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        event: 'started',
        thread_id: 'thread-123',
      });

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(1, {
        thread_id: 'thread-123',
      });

      expect(mockLogger.logConversation).toHaveBeenCalledWith('started', 'thread-123', 1);
    });

    it('should record conversation end event', () => {
      service.recordConversationEnd('thread-123', 15, 300000);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        event: 'ended',
        thread_id: 'thread-123',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(300000, {
        thread_id: 'thread-123',
        message_count: 15,
      });

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(-1, {
        thread_id: 'thread-123',
      });

      expect(mockLogger.logConversation).toHaveBeenCalledWith('ended', 'thread-123', 15, {
        total_duration: 300000,
      });
    });
  });

  describe('Token Consumption Metrics', () => {
    it('should record token consumption with all parameters', () => {
      service.recordTokenConsumption(150, 'openai', 'gpt-4', 'chain_invoke', 'thread-123', 0.003);

      expect(mockHistogram.record).toHaveBeenCalledWith(150, {
        model_provider: 'openai',
        model_name: 'gpt-4',
        operation: 'chain_invoke',
        thread_id: 'thread-123',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(150, {
        model_provider: 'openai',
        model_name: 'gpt-4',
      });

      // Should record cost estimate
      expect(mockHistogram.record).toHaveBeenCalledWith(0.003, {
        model_provider: 'openai',
        model_name: 'gpt-4',
        operation: 'chain_invoke',
      });
    });

    it('should record token consumption without optional parameters', () => {
      service.recordTokenConsumption(100, 'anthropic', 'claude-3', 'llm_invoke');

      expect(mockHistogram.record).toHaveBeenCalledWith(100, {
        model_provider: 'anthropic',
        model_name: 'claude-3',
        operation: 'llm_invoke',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(100, {
        model_provider: 'anthropic',
        model_name: 'claude-3',
      });

      // Should not record cost estimate
      expect(mockHistogram.record).toHaveBeenCalledTimes(1); // Only token histogram
    });

    it('should record token consumption with zero cost estimate', () => {
      service.recordTokenConsumption(50, 'local', 'llama-2', 'test', undefined, 0);

      // Should record cost estimate even when it's 0
      expect(mockHistogram.record).toHaveBeenCalledWith(0, {
        model_provider: 'local',
        model_name: 'llama-2',
        operation: 'test',
      });
    });
  });

  describe('Memory Operation Metrics', () => {
    it('should record successful memory retrieval operation', () => {
      service.recordMemoryOperation('retrieve', 250, true, 'thread-123', 'semantic', 5);

      expect(mockHistogram.record).toHaveBeenCalledWith(250, {
        operation: 'retrieve',
        memory_type: 'semantic',
        status: 'success',
        thread_id: 'thread-123',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        memory_type: 'semantic',
        success: 'true',
        thread_id: 'thread-123',
        result_count: 5,
      });

      // Should record hit rate (successful search)
      expect(mockHistogram.record).toHaveBeenCalledWith(1, {
        memory_type: 'semantic',
        thread_id: 'thread-123',
      });
    });

    it('should record failed memory search with zero results', () => {
      service.recordMemoryOperation('search', 150, false, 'thread-456', 'checkpointer', 0);

      expect(mockHistogram.record).toHaveBeenCalledWith(150, {
        operation: 'search',
        memory_type: 'checkpointer',
        status: 'error',
        thread_id: 'thread-456',
      });

      // Should record hit rate (failed search)
      expect(mockHistogram.record).toHaveBeenCalledWith(0, {
        memory_type: 'checkpointer',
        thread_id: 'thread-456',
      });
    });

    it('should record memory store operation', () => {
      service.recordMemoryOperation('store', 180, true, 'thread-789');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        memory_type: 'semantic', // default
        success: 'true',
        thread_id: 'thread-789',
      });
    });

    it('should handle search operations without result count', () => {
      service.recordMemoryOperation('search', 200, true, 'thread-111', 'semantic');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        memory_type: 'semantic',
        success: 'true',
        thread_id: 'thread-111',
      });

      // Should not record hit rate without result count
      expect(mockHistogram.record).toHaveBeenCalledTimes(1); // Only duration histogram
    });
  });

  describe('Personality Consistency Metrics', () => {
    it('should record personality consistency score', () => {
      const context = { evaluationMethod: 'semantic_similarity' };

      service.recordPersonalityConsistency(0.85, 'thread-123', context);

      expect(mockHistogram.record).toHaveBeenCalledWith(0.85, {
        thread_id: 'thread-123',
      });

      expect(mockLogger.logData).toHaveBeenCalledWith(LogLevel.INFO, 'Personality consistency evaluated', {
        thread_id: 'thread-123',
        consistency_score: 0.85,
        evaluationMethod: 'semantic_similarity',
      });
    });

    it('should record personality consistency without context', () => {
      service.recordPersonalityConsistency(0.92, 'thread-456');

      expect(mockLogger.logData).toHaveBeenCalledWith(LogLevel.INFO, 'Personality consistency evaluated', {
        thread_id: 'thread-456',
        consistency_score: 0.92,
      });
    });
  });

  describe('Suggestion System Metrics', () => {
    it('should record suggestion generation event with response time', () => {
      service.recordSuggestionEvent('generated', 'quick_reply', 'thread-123', 150);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        event: 'generated',
        suggestion_type: 'quick_reply',
        thread_id: 'thread-123',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(150, {
        operation: 'suggestion_generation',
        thread_id: 'thread-123',
      });
    });

    it('should record suggestion acceptance without response time', () => {
      service.recordSuggestionEvent('accepted', 'action_item', 'thread-456');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        event: 'accepted',
        suggestion_type: 'action_item',
        thread_id: 'thread-456',
      });

      // Should not record response time
      expect(mockHistogram.record).not.toHaveBeenCalled();
    });

    it('should record suggestion rejection', () => {
      service.recordSuggestionEvent('rejected', 'follow_up', 'thread-789');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        event: 'rejected',
        suggestion_type: 'follow_up',
        thread_id: 'thread-789',
      });
    });
  });

  describe('User Satisfaction Metrics', () => {
    it('should record user satisfaction with category', () => {
      service.recordUserSatisfaction(4.5, 'thread-123', 'response_quality');

      expect(mockHistogram.record).toHaveBeenCalledWith(4.5, {
        thread_id: 'thread-123',
        category: 'response_quality',
      });
    });

    it('should record user satisfaction without category', () => {
      service.recordUserSatisfaction(3.8, 'thread-456');

      expect(mockHistogram.record).toHaveBeenCalledWith(3.8, {
        thread_id: 'thread-456',
      });
    });
  });

  describe('Agent Execution Metrics', () => {
    it('should record successful agent execution', () => {
      service.recordAgentExecution(1200, true, 'react_agent', 'thread-123', 3);

      expect(mockHistogram.record).toHaveBeenCalledWith(1200, {
        agent_type: 'react_agent',
        status: 'success',
        thread_id: 'thread-123',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(3, {
        agent_type: 'react_agent',
        thread_id: 'thread-123',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        agent_type: 'react_agent',
        status: 'success',
        thread_id: 'thread-123',
      });
    });

    it('should record failed agent execution with error', () => {
      service.recordAgentExecution(800, false, 'plan_execute', 'thread-456', 1, 'TimeoutError');

      expect(mockHistogram.record).toHaveBeenCalledWith(800, {
        agent_type: 'plan_execute',
        status: 'error',
        thread_id: 'thread-456',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'TimeoutError',
        operation: 'agent_execution',
        thread_id: 'thread-456',
      });
    });

    it('should record agent execution without tools', () => {
      service.recordAgentExecution(500, true, 'simple_agent', 'thread-789');

      // Should not record tool invocations when toolsUsed is 0
      const toolInvocationCalls = mockCounter.add.mock.calls.filter((call) => call[1] && call[1].agent_type === 'simple_agent' && call[0] === 0);
      expect(toolInvocationCalls.length).toBe(0);
    });
  });

  describe('Tool Execution Metrics', () => {
    it('should record successful tool execution', () => {
      service.recordToolExecution('search_tool', 300, true, 'thread-123');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: 'search_tool',
        status: 'success',
        thread_id: 'thread-123',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(1.0, {
        tool_name: 'search_tool',
        thread_id: 'thread-123',
      });
    });

    it('should record failed tool execution with error', () => {
      service.recordToolExecution('database_tool', 150, false, 'thread-456', 'ConnectionError');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        tool_name: 'database_tool',
        status: 'error',
        thread_id: 'thread-456',
      });

      expect(mockHistogram.record).toHaveBeenCalledWith(0.0, {
        tool_name: 'database_tool',
        thread_id: 'thread-456',
      });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'ConnectionError',
        operation: 'tool_execution',
        tool_name: 'database_tool',
        thread_id: 'thread-456',
      });
    });
  });

  describe('Error Recovery Metrics', () => {
    it('should record error recovery success', () => {
      service.recordErrorRecovery('TimeoutError', 'llm_invoke', true, 'thread-123');

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'TimeoutError',
        operation: 'llm_invoke',
        thread_id: 'thread-123',
      });

      // Should record recovery counter
      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'TimeoutError',
        operation: 'llm_invoke',
        thread_id: 'thread-123',
      });
    });

    it('should record error without recovery', () => {
      service.recordErrorRecovery('ValidationError', 'user_input', false);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'ValidationError',
        operation: 'user_input',
      });

      // Should not record recovery when recovered is false
      expect(mockCounter.add).toHaveBeenCalledTimes(1);
    });

    it('should record error recovery without thread ID', () => {
      service.recordErrorRecovery('NetworkError', 'api_call', true);

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'NetworkError',
        operation: 'api_call',
      });
    });
  });

  describe('Metrics Snapshot', () => {
    it('should return metrics snapshot structure', async () => {
      const snapshot = await service.getMetricsSnapshot();

      expect(snapshot).toEqual({
        conversationCount: 0,
        conversationDuration: 0,
        tokensConsumed: 0,
        memoryRetrievalLatency: 0,
        memoryHitRate: 0,
        personalityConsistencyScore: 0,
        suggestionSuccessRate: 0,
      });
    });

    it('should be extensible for real implementation', async () => {
      // This test documents that the current implementation is simplified
      // and would need to collect actual metric values in a real scenario
      const snapshot = await service.getMetricsSnapshot();
      expect(typeof snapshot.conversationCount).toBe('number');
      expect(typeof snapshot.tokensConsumed).toBe('number');
    });
  });

  describe('Edge Cases and Input Validation', () => {
    it('should handle zero values correctly', () => {
      service.recordTokenConsumption(0, 'test', 'model', 'operation');
      service.recordPersonalityConsistency(0, 'thread');
      service.recordUserSatisfaction(0, 'thread');

      expect(mockHistogram.record).toHaveBeenCalledWith(0, expect.any(Object));
      expect(mockCounter.add).toHaveBeenCalledWith(0, expect.any(Object));
    });

    it('should handle negative duration values', () => {
      // This could happen due to clock drift or measurement errors
      service.recordMemoryOperation('retrieve', -50, true, 'thread-test');

      expect(mockHistogram.record).toHaveBeenCalledWith(-50, expect.any(Object));
    });

    it('should handle very large metric values', () => {
      const largeValue = Number.MAX_SAFE_INTEGER;
      service.recordTokenConsumption(largeValue, 'test', 'model', 'operation');

      expect(mockHistogram.record).toHaveBeenCalledWith(largeValue, expect.any(Object));
    });
  });
});
