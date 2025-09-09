import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BasePromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LangGraphStreamingService } from '../../messaging/services/langraph-streaming.service';
import { AsyncIteratorCallbackHandler } from '../callbacks/async-iterator-callback.handler';
import { SSECallbackHandler } from '../callbacks/sse-callback.handler';
import { StreamingCallbackHandler } from '../callbacks/streaming-callback.handler';
import { WebSocketCallbackHandler } from '../callbacks/websocket-callback.handler';
import { StreamingLLMChain } from '../chains/streaming-llm.chain';
import { AsyncStreamHandler } from './async-stream.handler';

export interface StreamingOptions {
  type: 'token' | 'sse' | 'websocket' | 'iterator' | 'langgraph';
  response?: Response;
  wsUrl?: string;
  threadId?: string;
  bufferSize?: number;
  enablePartialResults?: boolean;
  includeMetadata?: boolean;
}

/**
 * Unified streaming integration service
 * Coordinates all streaming callback handlers and chains
 */
@Injectable()
export class StreamingIntegrationService {
  private readonly logger = new Logger(StreamingIntegrationService.name);
  private readonly activeHandlers = new Map<string, BaseCallbackHandler>();
  private readonly sseHandler: SSECallbackHandler;
  private readonly wsHandler: WebSocketCallbackHandler;

  constructor(
    private readonly asyncStreamHandler: AsyncStreamHandler,
    private readonly langGraphStreamingService: LangGraphStreamingService,
  ) {
    this.sseHandler = new SSECallbackHandler({
      heartbeatInterval: 30000,
      enableCompression: true,
      includeMetadata: true,
      flushOnToken: true,
    });

    this.wsHandler = new WebSocketCallbackHandler({
      reconnectInterval: 5000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableCompression: true,
      bufferMessages: true,
    });
  }

  /**
   * Create appropriate callback handler based on streaming type
   */
  createStreamingHandler(options: StreamingOptions): BaseCallbackHandler {
    const handlerId = `handler-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    switch (options.type) {
      case 'token': {
        const tokenHandler = new StreamingCallbackHandler(handlerId, {
          bufferSize: options.bufferSize || 10,
          flushInterval: 100,
          enableMetrics: true,
        });
        this.activeHandlers.set(handlerId, tokenHandler);
        return tokenHandler;
      }

      case 'sse': {
        if (!options.response) {
          throw new Error('Response object required for SSE streaming');
        }
        const streamId = this.sseHandler.attachToResponse(options.response);
        this.logger.debug(`Created SSE stream: ${streamId}`);
        return this.sseHandler;
      }

      case 'websocket':
        if (options.wsUrl) {
          this.wsHandler.connect(options.wsUrl).catch((error) => {
            this.logger.error('WebSocket connection failed:', error);
          });
        }
        return this.wsHandler;

      case 'iterator': {
        const iteratorHandler = new AsyncIteratorCallbackHandler({
          queueSize: 1000,
          includeMetadata: options.includeMetadata !== false,
        });
        this.activeHandlers.set(handlerId, iteratorHandler);
        return iteratorHandler;
      }

      case 'langgraph':
        if (!options.threadId) {
          throw new Error('Thread ID required for LangGraph streaming');
        }
        // Return a custom handler that integrates with LangGraphStreamingService
        return this.createLangGraphHandler(options.threadId);

      default:
        throw new Error(`Unknown streaming type: ${options.type}`);
    }
  }

  /**
   * Create streaming chain with optimizations
   */
  createStreamingChain(llm: BaseLanguageModel, prompt: BasePromptTemplate, streamingOptions?: StreamingOptions): StreamingLLMChain {
    const chain = new StreamingLLMChain(
      { llm, prompt },
      {
        streamingEnabled: true,
        partialResultHandling: streamingOptions?.enablePartialResults !== false,
        bufferSize: streamingOptions?.bufferSize || 10,
        flushInterval: 100,
        enableCaching: true,
        cacheSize: 100,
        parallelProcessing: true,
        maxConcurrent: 3,
      },
    );

    return chain;
  }

  /**
   * Stream response with SSE
   */
  async streamSSEResponse(response: Response, llm: BaseLanguageModel, prompt: BasePromptTemplate, input: Record<string, any>): Promise<void> {
    const streamId = this.sseHandler.attachToResponse(response);

    try {
      const chain = this.createStreamingChain(llm, prompt, {
        type: 'sse',
        response,
        enablePartialResults: true,
      });

      // Add SSE handler to chain callbacks
      const _callbacks = [this.sseHandler];

      // Stream partial results
      for await (const partial of chain.streamPartialResults(input)) {
        // Partial results are automatically sent via SSE handler
        if (partial.isComplete) {
          break;
        }
      }

      // Send completion event
      this.sseHandler.sendSSEEvent(streamId, {
        event: 'complete',
        data: { timestamp: Date.now() },
      });
    } catch (error) {
      this.logger.error('SSE streaming error:', error);
      this.sseHandler.sendSSEEvent(streamId, {
        event: 'error',
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    } finally {
      this.sseHandler.closeStream(streamId);
    }
  }

  /**
   * Stream response with WebSocket
   */
  async streamWebSocketResponse(wsUrl: string, llm: BaseLanguageModel, prompt: BasePromptTemplate, input: Record<string, any>): Promise<void> {
    await this.wsHandler.connect(wsUrl);

    try {
      const chain = this.createStreamingChain(llm, prompt, {
        type: 'websocket',
        wsUrl,
        enablePartialResults: true,
      });

      // Add WebSocket handler to chain callbacks
      const _callbacks = [this.wsHandler];

      // Stream tokens
      for await (const _token of chain.streamTokens(input)) {
        // Tokens are automatically sent via WebSocket handler
      }
    } catch (error) {
      this.logger.error('WebSocket streaming error:', error);
    }
  }

  /**
   * Get async iterator for streaming
   */
  async *getStreamingIterator(llm: BaseLanguageModel, prompt: BasePromptTemplate, input: Record<string, any>): AsyncGenerator<any> {
    const handler = new AsyncIteratorCallbackHandler({
      includeMetadata: true,
    });

    const chain = this.createStreamingChain(llm, prompt, {
      type: 'iterator',
      enablePartialResults: true,
    });

    // Start chain with handler
    const chainPromise = chain._call(input, {
      callbacks: [handler],
    } as any);

    try {
      // Yield events as they arrive
      for await (const event of handler) {
        yield event;
      }

      // Wait for chain completion
      await chainPromise;
    } finally {
      handler.dispose();
    }
  }

  /**
   * Stream with LangGraph integration
   */
  async streamWithLangGraph(threadId: string, llm: BaseLanguageModel, prompt: BasePromptTemplate, input: Record<string, any>): Promise<void> {
    const _stream = this.langGraphStreamingService.startConversationStream(threadId, { source: 'streaming-integration' });

    const chain = this.createStreamingChain(llm, prompt, {
      type: 'langgraph',
      threadId,
      enablePartialResults: true,
    });

    try {
      // Stream message chunks
      const chunks: string[] = [];
      for await (const token of chain.streamTokens(input)) {
        chunks.push(token.content);
      }

      // Stream to LangGraph
      await this.langGraphStreamingService.streamMessageChunks(
        threadId,
        `msg-${Date.now()}`,
        (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
      );
    } catch (error) {
      this.logger.error('LangGraph streaming error:', error);
      await this.langGraphStreamingService.emitConversationEvent(threadId, 'conversation:error' as any, {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'STREAMING_ERROR',
        },
      });
    }
  }

  /**
   * Create enhanced async stream with backpressure
   */
  async *createEnhancedStream<T>(source: AsyncIterable<T>, streamId: string, config?: any): AsyncGenerator<any> {
    yield* this.asyncStreamHandler.createEnhancedStream(source, streamId, config);
  }

  /**
   * Merge multiple streams
   */
  async *mergeStreams<T>(...sources: AsyncIterable<T>[]): AsyncGenerator<any> {
    yield* this.asyncStreamHandler.mergeStreams(...sources);
  }

  /**
   * Create pausable stream
   */
  createPausableStream<T>(source: AsyncIterable<T>, streamId: string) {
    return this.asyncStreamHandler.createPausableStream(source, streamId);
  }

  /**
   * Create LangGraph callback handler
   */
  private createLangGraphHandler(threadId: string): BaseCallbackHandler {
    const service = this.langGraphStreamingService;

    return {
      name: 'LangGraphStreamingHandler',

      async handleLLMNewToken(token: string): Promise<void> {
        await service.streamMessageChunks(
          threadId,
          `token-${Date.now()}`,
          (async function* () {
            yield token;
          })(),
        );
      },

      async handleLLMStart(): Promise<void> {
        await service.streamAgentThinking(threadId, 'Processing...', {});
      },

      async handleLLMEnd(): Promise<void> {
        // No-op
      },

      async handleLLMError(err: Error): Promise<void> {
        await service.emitConversationEvent(threadId, 'conversation:error' as any, {
          error: {
            message: err.message,
            code: 'LLM_ERROR',
            stack: err.stack,
          },
        });
      },
    } as unknown as BaseCallbackHandler;
  }

  /**
   * Get active handler count
   */
  getActiveHandlerCount(): number {
    return this.activeHandlers.size + this.sseHandler.getActiveStreamCount() + (this.wsHandler.isConnected ? 1 : 0);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    for (const [_id, handler] of this.activeHandlers) {
      if ('dispose' in handler && typeof handler.dispose === 'function') {
        (handler as any).dispose();
      }
    }
    this.activeHandlers.clear();

    this.sseHandler.dispose();
    this.wsHandler.dispose();
  }

  onModuleDestroy() {
    this.cleanup();
  }
}
