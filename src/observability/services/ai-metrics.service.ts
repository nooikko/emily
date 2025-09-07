import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram, metrics, UpDownCounter } from '@opentelemetry/api';
import type { AIMetrics, AIModelProvider, MemoryOperationType, MemorySystemType } from '../types/telemetry.types';
import { LogLevel, StructuredLoggerService } from './structured-logger.service';

/**
 * Specialized metrics collection service for AI operations
 * Provides comprehensive metrics tracking for Emily's AI capabilities
 */
@Injectable()
export class AIMetricsService implements OnModuleInit {
  private readonly logger = new StructuredLoggerService('AIMetrics');
  private readonly meter = metrics.getMeter('emily-ai-metrics', '1.0.0');

  // Conversation metrics
  private conversationCounter!: Counter;
  private conversationDuration!: Histogram;
  private activeConversationsGauge!: UpDownCounter;

  // Token and cost metrics
  private tokenConsumptionHistogram!: Histogram;
  private costEstimateHistogram!: Histogram;
  private tokensPerModelCounter!: Counter;

  // Memory system metrics
  private memoryRetrievalLatency!: Histogram;
  private memoryHitRateGauge!: Histogram;
  private memoriesStoredCounter!: Counter;
  private memorySearchCounter!: Counter;

  // AI quality metrics
  private personalityConsistencyGauge!: Histogram;
  private suggestionSuccessCounter!: Counter;
  private userSatisfactionGauge!: Histogram;

  // Agent performance metrics
  private agentResponseTime!: Histogram;
  private toolInvocationCounter!: Counter;
  private toolSuccessRate!: Histogram;
  private chainExecutionCounter!: Counter;

  // Error tracking
  private aiErrorCounter!: Counter;
  private recoveryCounter!: Counter;

  // Request tracking
  private requestCounter!: Counter;

  onModuleInit(): void {
    this.initializeMetrics();
    this.logger.logInfo('AI Metrics Service initialized');
  }

  /**
   * Records a conversation start event
   */
  recordConversationStart(threadId: string): void {
    this.conversationCounter.add(1, {
      event: 'started',
      thread_id: threadId,
    });

    this.activeConversationsGauge.add(1, {
      thread_id: threadId,
    });

    this.logger.logConversation('started', threadId, 1);
  }

  /**
   * Records a conversation end event with total duration and message count
   */
  recordConversationEnd(threadId: string, totalMessages: number, totalDuration: number): void {
    this.conversationCounter.add(1, {
      event: 'ended',
      thread_id: threadId,
    });

    this.conversationDuration.record(totalDuration, {
      thread_id: threadId,
      message_count: totalMessages,
    });

    this.activeConversationsGauge.add(-1, {
      thread_id: threadId,
    });

    this.logger.logConversation('ended', threadId, totalMessages, {
      total_duration: totalDuration,
    });
  }

  /**
   * Records token consumption for model invocations
   */
  recordTokenConsumption(
    tokens: number,
    modelProvider: AIModelProvider,
    modelName: string,
    operation: string,
    threadId?: string,
    costEstimate?: number,
  ): void {
    this.tokenConsumptionHistogram.record(tokens, {
      model_provider: modelProvider,
      model_name: modelName,
      operation,
      ...(threadId && { thread_id: threadId }),
    });

    this.tokensPerModelCounter.add(tokens, {
      model_provider: modelProvider,
      model_name: modelName,
    });

    if (costEstimate !== undefined) {
      this.costEstimateHistogram.record(costEstimate, {
        model_provider: modelProvider,
        model_name: modelName,
        operation,
      });
    }
  }

  /**
   * Records memory system performance
   */
  recordMemoryOperation(
    operation: MemoryOperationType,
    duration: number,
    success: boolean,
    threadId: string,
    memoryType: MemorySystemType = 'semantic',
    resultCount?: number,
  ): void {
    this.memoryRetrievalLatency.record(duration, {
      operation,
      memory_type: memoryType,
      status: success ? 'success' : 'error',
      thread_id: threadId,
    });

    if (operation === 'store') {
      this.memoriesStoredCounter.add(1, {
        memory_type: memoryType,
        success: success.toString(),
        thread_id: threadId,
      });
    } else if (operation === 'search' || operation === 'retrieve') {
      this.memorySearchCounter.add(1, {
        memory_type: memoryType,
        success: success.toString(),
        thread_id: threadId,
        ...(resultCount !== undefined && { result_count: resultCount }),
      });

      // Calculate hit rate for searches
      if (resultCount !== undefined) {
        const hitRate = resultCount > 0 ? 1 : 0;
        this.memoryHitRateGauge.record(hitRate, {
          memory_type: memoryType,
          thread_id: threadId,
        });
      }
    }
  }

  /**
   * Records personality consistency evaluation
   */
  recordPersonalityConsistency(score: number, threadId: string, context?: Record<string, unknown>): void {
    this.personalityConsistencyGauge.record(score, {
      thread_id: threadId,
    });

    this.logger.logData(LogLevel.INFO, 'Personality consistency evaluated', {
      thread_id: threadId,
      consistency_score: score,
      ...context,
    });
  }

  /**
   * Records suggestion system performance
   */
  recordSuggestionEvent(event: 'generated' | 'accepted' | 'rejected', suggestionType: string, threadId: string, responseTime?: number): void {
    this.suggestionSuccessCounter.add(1, {
      event,
      suggestion_type: suggestionType,
      thread_id: threadId,
    });

    if (responseTime !== undefined && event === 'generated') {
      this.agentResponseTime.record(responseTime, {
        operation: 'suggestion_generation',
        thread_id: threadId,
      });
    }
  }

  /**
   * Records user satisfaction metrics
   */
  recordUserSatisfaction(rating: number, threadId: string, category?: string): void {
    this.userSatisfactionGauge.record(rating, {
      thread_id: threadId,
      ...(category && { category }),
    });
  }

  /**
   * Records agent performance metrics
   */
  recordAgentExecution(duration: number, success: boolean, agentType: string, threadId: string, toolsUsed = 0, error?: string): void {
    this.agentResponseTime.record(duration, {
      agent_type: agentType,
      status: success ? 'success' : 'error',
      thread_id: threadId,
    });

    if (toolsUsed > 0) {
      this.toolInvocationCounter.add(toolsUsed, {
        agent_type: agentType,
        thread_id: threadId,
      });
    }

    this.chainExecutionCounter.add(1, {
      agent_type: agentType,
      status: success ? 'success' : 'error',
      thread_id: threadId,
    });

    if (!success && error) {
      this.aiErrorCounter.add(1, {
        error_type: error,
        operation: 'agent_execution',
        thread_id: threadId,
      });
    }
  }

  /**
   * Records tool execution metrics
   */
  recordToolExecution(toolName: string, _duration: number, success: boolean, threadId: string, error?: string): void {
    this.toolInvocationCounter.add(1, {
      tool_name: toolName,
      status: success ? 'success' : 'error',
      thread_id: threadId,
    });

    const successRate = success ? 1.0 : 0.0;
    this.toolSuccessRate.record(successRate, {
      tool_name: toolName,
      thread_id: threadId,
    });

    if (!success && error) {
      this.aiErrorCounter.add(1, {
        error_type: error,
        operation: 'tool_execution',
        tool_name: toolName,
        thread_id: threadId,
      });
    }
  }

  /**
   * Records error and recovery metrics
   */
  recordErrorRecovery(errorType: string, operation: string, recovered: boolean, threadId?: string): void {
    this.aiErrorCounter.add(1, {
      error_type: errorType,
      operation,
      ...(threadId && { thread_id: threadId }),
    });

    if (recovered) {
      this.recoveryCounter.add(1, {
        error_type: errorType,
        operation,
        ...(threadId && { thread_id: threadId }),
      });
    }
  }

  /**
   * Gets comprehensive AI metrics snapshot
   */
  async getMetricsSnapshot(): Promise<AIMetrics> {
    // Note: In a real implementation, you would collect current metric values
    // This is a simplified version showing the structure
    return {
      conversationCount: 0, // Would get from conversation counter
      conversationDuration: 0, // Would get average from histogram
      tokensConsumed: 0, // Would get from token consumption counter
      memoryRetrievalLatency: 0, // Would get average from memory latency histogram
      memoryHitRate: 0, // Would get from memory hit rate gauge
      personalityConsistencyScore: 0, // Would get from consistency gauge
      suggestionSuccessRate: 0, // Would calculate from suggestion counters
    };
  }

  /**
   * Initializes all metric instruments
   */
  private initializeMetrics(): void {
    // Conversation metrics
    this.conversationCounter = this.meter.createCounter('emily_conversations_total', {
      description: 'Total number of conversations by event type',
    });

    this.conversationDuration = this.meter.createHistogram('emily_conversation_duration_ms', {
      description: 'Duration of complete conversations',
      unit: 'ms',
    });

    this.activeConversationsGauge = this.meter.createUpDownCounter('emily_active_conversations', {
      description: 'Number of currently active conversations',
    });

    // Token and cost metrics
    this.tokenConsumptionHistogram = this.meter.createHistogram('emily_tokens_consumed', {
      description: 'Number of tokens consumed by model operations',
      unit: 'tokens',
    });

    this.costEstimateHistogram = this.meter.createHistogram('emily_cost_estimate_usd', {
      description: 'Estimated cost of model operations',
      unit: 'usd',
    });

    this.tokensPerModelCounter = this.meter.createCounter('emily_tokens_by_model_total', {
      description: 'Total tokens consumed by model',
      unit: 'tokens',
    });

    // Memory system metrics
    this.memoryRetrievalLatency = this.meter.createHistogram('emily_memory_operation_duration_ms', {
      description: 'Duration of memory operations',
      unit: 'ms',
    });

    this.memoryHitRateGauge = this.meter.createHistogram('emily_memory_hit_rate', {
      description: 'Memory search hit rate (0-1)',
    });

    this.memoriesStoredCounter = this.meter.createCounter('emily_memories_stored_total', {
      description: 'Total number of memories stored',
    });

    this.memorySearchCounter = this.meter.createCounter('emily_memory_searches_total', {
      description: 'Total number of memory searches performed',
    });

    // AI quality metrics
    this.personalityConsistencyGauge = this.meter.createHistogram('emily_personality_consistency_score', {
      description: 'Personality consistency score (0-1)',
    });

    this.suggestionSuccessCounter = this.meter.createCounter('emily_suggestions_total', {
      description: 'Total suggestion events by type and outcome',
    });

    this.userSatisfactionGauge = this.meter.createHistogram('emily_user_satisfaction_rating', {
      description: 'User satisfaction ratings',
    });

    // Agent performance metrics
    this.agentResponseTime = this.meter.createHistogram('emily_agent_response_time_ms', {
      description: 'Agent response time for various operations',
      unit: 'ms',
    });

    this.toolInvocationCounter = this.meter.createCounter('emily_tool_invocations_total', {
      description: 'Total number of tool invocations',
    });

    this.toolSuccessRate = this.meter.createHistogram('emily_tool_success_rate', {
      description: 'Tool execution success rate (0-1)',
    });

    this.chainExecutionCounter = this.meter.createCounter('emily_chain_executions_total', {
      description: 'Total number of chain executions',
    });

    // Error tracking
    this.aiErrorCounter = this.meter.createCounter('emily_ai_errors_total', {
      description: 'Total number of AI system errors',
    });

    this.recoveryCounter = this.meter.createCounter('emily_error_recoveries_total', {
      description: 'Total number of successful error recoveries',
    });

    // Request tracking
    this.requestCounter = this.meter.createCounter('emily_requests_total', {
      description: 'Total number of requests by provider and status',
    });
  }

  /**
   * Increment token usage metrics
   */
  incrementTokenUsage(provider: string, type: 'input' | 'output', count: number): void {
    this.tokensPerModelCounter.add(count, {
      provider,
      type,
    });
  }

  /**
   * Increment request count metrics
   */
  incrementRequestCount(provider: string, status: 'success' | 'error'): void {
    this.requestCounter.add(1, {
      provider,
      status,
    });
  }

  /**
   * Record operation duration
   */
  recordOperationDuration(service: string, operation: string, duration: number, status: 'success' | 'error'): void {
    this.agentResponseTime.record(duration, {
      service,
      operation,
      status,
    });
  }
}
