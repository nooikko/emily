import type { Document } from '@langchain/core/documents';
import type { BaseMessage } from '@langchain/core/messages';
import { Injectable } from '@nestjs/common';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { MetricsCollector } from '../decorators/metric.decorator';
import { addSpanAttribute, addSpanEvent, setSpanStatus } from '../decorators/trace.decorator';
import type { AIModelProvider, LangChainOperation, MemorySystemType } from '../types/telemetry.types';
import { LogLevel, StructuredLoggerService } from './structured-logger.service';

/**
 * Type guard to check if a value is an Error
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if a value has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string';
}

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasMessage(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Safely extract error constructor name from unknown error
 */
function getErrorType(error: unknown): string {
  if (isError(error)) {
    return error.constructor.name;
  }
  if (typeof error === 'object' && error !== null && error.constructor) {
    return error.constructor.name;
  }
  return typeof error;
}

// Types moved to telemetry.types.ts for better organization

/**
 * LangChain instrumentation context with improved typing
 */
export interface LangChainInstrumentationContext {
  readonly operation: LangChainOperation;
  readonly chainType?: string;
  readonly modelProvider?: AIModelProvider;
  readonly modelName?: string;
  readonly threadId?: string;
  readonly toolName?: string;
  readonly documentCount?: number;
  readonly tokenCount?: number;
  readonly cost?: number;
}

/**
 * Service that provides comprehensive instrumentation for LangChain operations
 * Enhances the existing LangChain setup with detailed observability without replacing LangSmith
 */
@Injectable()
export class LangChainInstrumentationService {
  private readonly logger = new StructuredLoggerService('LangChainInstrumentation');
  private readonly tracer = trace.getTracer('langchain-instrumentation', '1.0.0');

  /**
   * Instruments a LangChain operation with comprehensive observability
   */
  async instrumentOperation<T>(operation: LangChainOperation, context: LangChainInstrumentationContext, operationFn: () => Promise<T>): Promise<T> {
    const spanName = `langchain.${operation}`;
    const startTime = Date.now();

    return this.tracer.startActiveSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'langchain.operation': operation,
          'langchain.version': '1.0.0',
          ...(context.chainType && { 'langchain.chain_type': context.chainType }),
          ...(context.modelProvider && { 'langchain.model.provider': context.modelProvider }),
          ...(context.modelName && { 'langchain.model.name': context.modelName }),
          ...(context.threadId && { 'langchain.thread_id': context.threadId }),
          ...(context.toolName && { 'langchain.tool.name': context.toolName }),
          ...(context.documentCount && { 'langchain.document.count': context.documentCount }),
        },
      },
      async (span) => {
        try {
          addSpanEvent('operation.started', {
            operation,
            timestamp: startTime,
          });

          // Execute the operation
          const result = await operationFn();
          const duration = Date.now() - startTime;

          // Record success metrics
          this.recordOperationMetrics(operation, context, duration, true);

          // Update span with result information
          if (context.tokenCount) {
            addSpanAttribute('langchain.tokens.consumed', context.tokenCount);
            MetricsCollector.recordTokenConsumption(context.tokenCount, {
              operation,
              model_provider: context.modelProvider || 'unknown',
              model_name: context.modelName || 'unknown',
            });
          }

          if (context.cost) {
            addSpanAttribute('langchain.cost.estimate', context.cost);
          }

          addSpanEvent('operation.completed', {
            duration,
            success: true,
          });

          setSpanStatus(SpanStatusCode.OK);

          // Log successful operation
          this.logger.logAIOperation(operation, duration, true, {
            chainType: context.chainType,
            modelProvider: context.modelProvider,
            modelName: context.modelName,
            threadId: context.threadId,
            tokenCount: context.tokenCount,
            cost: context.cost,
          });

          return result;
        } catch (error: unknown) {
          const duration = Date.now() - startTime;
          const errorMessage = getErrorMessage(error);
          const errorType = getErrorType(error);

          // Record failure metrics (pass Error object if available, otherwise undefined)
          this.recordOperationMetrics(operation, context, duration, false, isError(error) ? error : undefined);

          // Update span with error information
          if (isError(error)) {
            span.recordException(error);
          }
          setSpanStatus(SpanStatusCode.ERROR, errorMessage);

          addSpanEvent('operation.failed', {
            duration,
            error: errorMessage,
            error_type: errorType,
          });

          // Log failed operation
          this.logger.logAIOperation(
            operation,
            duration,
            false,
            {
              chainType: context.chainType,
              modelProvider: context.modelProvider,
              modelName: context.modelName,
              threadId: context.threadId,
              error: errorMessage,
            },
            isError(error) ? error : undefined,
          );

          throw isError(error) ? error : new Error(errorMessage);
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Instruments chain invocation with message tracking
   */
  async instrumentChainInvoke<T>(
    chainType: string,
    modelProvider: string,
    modelName: string,
    messages: BaseMessage[],
    operationFn: () => Promise<T>,
  ): Promise<T> {
    const tokenEstimate = this.estimateTokenCount(messages);

    return this.instrumentOperation(
      'chain_invoke',
      {
        operation: 'chain_invoke',
        chainType,
        modelProvider,
        modelName,
        tokenCount: tokenEstimate,
      },
      operationFn,
    );
  }

  /**
   * Instruments agent execution with tool tracking
   */
  async instrumentAgentExecute<T>(
    agentType: string,
    modelProvider: string,
    modelName: string,
    threadId: string,
    operationFn: () => Promise<T>,
  ): Promise<T> {
    return this.instrumentOperation(
      'agent_execute',
      {
        operation: 'agent_execute',
        chainType: agentType,
        modelProvider,
        modelName,
        threadId,
      },
      operationFn,
    );
  }

  /**
   * Instruments memory retrieval operations
   */
  async instrumentMemoryRetrieval<T>(memoryType: MemorySystemType, threadId: string, operationFn: () => Promise<T>, query?: string): Promise<T> {
    const context: LangChainInstrumentationContext = {
      operation: 'memory_retrieve',
      threadId,
    };

    return this.instrumentOperation('memory_retrieve', context, async () => {
      const startTime = Date.now();
      const result = await operationFn();
      const duration = Date.now() - startTime;

      // Log memory operation
      this.logger.logMemoryOperation('retrieve', threadId, duration, true, {
        memoryType,
        queryLength: query?.length || 0,
      });

      // Record memory-specific metrics
      MetricsCollector.recordHistogram('emily_memory_retrieval_duration', duration, {
        labels: { memory_type: memoryType, thread_id: threadId },
      });

      return result;
    });
  }

  /**
   * Instruments memory storage operations
   */
  async instrumentMemoryStorage<T>(
    memoryType: 'semantic' | 'checkpointer',
    threadId: string,
    messageCount: number,
    operationFn: () => Promise<T>,
  ): Promise<T> {
    return this.instrumentOperation(
      'memory_store',
      {
        operation: 'memory_store',
        threadId,
        documentCount: messageCount,
      },
      async () => {
        const startTime = Date.now();
        const result = await operationFn();
        const duration = Date.now() - startTime;

        // Log memory operation
        this.logger.logMemoryOperation('store', threadId, duration, true, {
          memoryType,
          messageCount,
        });

        return result;
      },
    );
  }

  /**
   * Instruments tool execution
   */
  async instrumentToolExecution<T>(toolName: string, inputData: unknown, operationFn: () => Promise<T>): Promise<T> {
    return this.instrumentOperation(
      'tool_execute',
      {
        operation: 'tool_execute',
        toolName,
      },
      async () => {
        addSpanAttribute('tool.input.size', JSON.stringify(inputData).length);

        const result = await operationFn();

        addSpanAttribute('tool.output.size', JSON.stringify(result).length);

        return result;
      },
    );
  }

  /**
   * Instruments document processing operations
   */
  async instrumentDocumentProcessing<T>(documents: Document[], operation: 'split' | 'embed' | 'store', operationFn: () => Promise<T>): Promise<T> {
    return this.instrumentOperation(
      'document_process',
      {
        operation: 'document_process',
        documentCount: documents.length,
      },
      async () => {
        const totalSize = documents.reduce((sum, doc) => sum + doc.pageContent.length, 0);

        addSpanAttribute('document.total_size', totalSize);
        addSpanAttribute('document.operation', operation);

        const result = await operationFn();

        return result;
      },
    );
  }

  /**
   * Instruments embedding generation
   */
  async instrumentEmbedding<T>(provider: string, model: string, textCount: number, operationFn: () => Promise<T>): Promise<T> {
    return this.instrumentOperation(
      'embedding_generate',
      {
        operation: 'embedding_generate',
        modelProvider: provider,
        modelName: model,
        documentCount: textCount,
      },
      operationFn,
    );
  }

  /**
   * Records operation-specific metrics
   */
  private recordOperationMetrics(
    operation: LangChainOperation,
    context: LangChainInstrumentationContext,
    duration: number,
    success: boolean,
    error?: Error,
  ): void {
    const labels: Record<string, string | number> = {
      operation,
      status: success ? 'success' : 'error',
      ...(context.modelProvider && { model_provider: context.modelProvider }),
      ...(context.modelName && { model_name: context.modelName }),
      ...(context.chainType && { chain_type: context.chainType }),
      ...(error && { error_type: error.constructor.name }),
    };

    // Record duration
    MetricsCollector.recordHistogram('emily_langchain_operation_duration', duration, {
      description: 'Duration of LangChain operations',
      unit: 'ms',
      labels,
    });

    // Record operation count
    MetricsCollector.incrementCounter('emily_langchain_operations_total', 1, {
      description: 'Total number of LangChain operations',
      labels,
    });
  }

  /**
   * Estimates token count from messages (rough approximation)
   */
  private estimateTokenCount(messages: BaseMessage[]): number {
    return messages.reduce((total, message) => {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      // Rough approximation: 1 token per 4 characters
      return total + Math.ceil(content.length / 4);
    }, 0);
  }

  /**
   * Creates a conversation start event
   */
  logConversationStart(threadId: string, initialMessageCount = 1): void {
    this.logger.logConversation('started', threadId, initialMessageCount);
    MetricsCollector.updateActiveConversations(1, { thread_id: threadId });
  }

  /**
   * Creates a conversation end event
   */
  logConversationEnd(threadId: string, totalMessages: number, duration: number): void {
    this.logger.logConversation('ended', threadId, totalMessages, {
      total_duration: duration,
    });
    MetricsCollector.updateActiveConversations(-1, { thread_id: threadId });
  }

  /**
   * Logs personality consistency checks
   */
  logPersonalityConsistency(threadId: string, score: number, context: Record<string, unknown> = {}): void {
    this.logger.logData(LogLevel.INFO, 'Personality consistency evaluated', {
      thread_id: threadId,
      consistency_score: score,
      ...context,
    });

    MetricsCollector.recordHistogram('emily_personality_consistency_score', score, {
      description: 'Personality consistency score',
      labels: { thread_id: threadId },
    });
  }

  /**
   * Start a span for tracking operations
   */
  startSpan(spanName: string, attributes: Record<string, any> = {}): void {
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
    // Store span in context or a map for later retrieval
    // For simplicity, we'll just end it immediately in this stub
    span.end();
  }

  /**
   * End a span with optional error flag
   */
  endSpan(spanName: string, options: { error?: boolean } = {}): void {
    // In a real implementation, we would retrieve the span from storage
    // For now, this is a stub
    if (options.error) {
      this.logger.logData(LogLevel.ERROR, `Span ${spanName} ended with error`, {});
    }
  }
}
