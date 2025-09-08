import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface StreamingToken {
  content: string;
  timestamp: number;
  index: number;
  isComplete: boolean;
}

export interface StreamingEvent {
  type: 'token' | 'start' | 'end' | 'error' | 'chunk' | 'metadata';
  data: any;
  timestamp: number;
  streamId: string;
}

/**
 * Comprehensive StreamingCallbackHandler for real-time token streaming
 * Implements token-by-token streaming with proper buffering and error handling
 */
@Injectable()
export class StreamingCallbackHandler extends BaseCallbackHandler {
  name = 'StreamingCallbackHandler';
  private readonly logger = new Logger(StreamingCallbackHandler.name);
  private readonly emitter = new EventEmitter();
  private readonly buffers = new Map<string, StreamingToken[]>();
  private readonly streamMetadata = new Map<string, Record<string, any>>();
  private tokenIndex = 0;

  constructor(
    private readonly streamId: string = 'default',
    private readonly config: {
      bufferSize?: number;
      flushInterval?: number;
      enableMetrics?: boolean;
      onToken?: (token: StreamingToken) => void | Promise<void>;
      onComplete?: (tokens: StreamingToken[]) => void | Promise<void>;
      onError?: (error: Error) => void;
    } = {},
  ) {
    super();
    this.setupAutoFlush();
  }

  /**
   * Handle new LLM tokens as they're generated
   */
  async handleLLMNewToken(
    token: string,
    idx: any, // NewTokenIndices type from LangChain
    runId: string,
    parentRunId?: string,
    tags?: string[],
    fields?: any,
  ): Promise<void> {
    const streamingToken: StreamingToken = {
      content: token,
      timestamp: Date.now(),
      index: idx ?? this.tokenIndex++,
      isComplete: false,
    };

    // Buffer the token
    const bufferId = runId || this.streamId;
    if (!this.buffers.has(bufferId)) {
      this.buffers.set(bufferId, []);
    }
    this.buffers.get(bufferId)!.push(streamingToken);

    // Emit streaming event
    this.emitStreamingEvent({
      type: 'token',
      data: streamingToken,
      timestamp: Date.now(),
      streamId: bufferId,
    });

    // Call custom handler if provided
    if (this.config.onToken) {
      try {
        await this.config.onToken(streamingToken);
      } catch (error) {
        this.logger.error('Error in custom token handler:', error);
      }
    }

    // Check if buffer should be flushed
    const buffer = this.buffers.get(bufferId)!;
    if (buffer.length >= (this.config.bufferSize || 10)) {
      await this.flushBuffer(bufferId);
    }
  }

  /**
   * Handle LLM start event
   */
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    this.tokenIndex = 0;
    this.streamMetadata.set(runId, {
      llm: llm.name,
      startTime: Date.now(),
      promptCount: prompts.length,
      ...extraParams,
    });

    this.emitStreamingEvent({
      type: 'start',
      data: {
        llm: llm.name,
        promptCount: prompts.length,
        runId,
      },
      timestamp: Date.now(),
      streamId: runId,
    });

    this.logger.debug(`Streaming started for ${llm.name}`);
  }

  /**
   * Handle LLM end event
   */
  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string): Promise<void> {
    // Get tokens before flushing
    const tokens = [...(this.buffers.get(runId) || [])];

    // Flush any remaining buffered tokens
    await this.flushBuffer(runId);

    const metadata = this.streamMetadata.get(runId);
    const duration = metadata ? Date.now() - metadata.startTime : 0;

    this.emitStreamingEvent({
      type: 'end',
      data: {
        generationCount: output.generations.length,
        duration,
        tokenUsage: output.llmOutput?.tokenUsage,
        runId,
      },
      timestamp: Date.now(),
      streamId: runId,
    });

    // Call completion handler with saved tokens
    if (this.config.onComplete) {
      try {
        await this.config.onComplete(tokens);
      } catch (error) {
        this.logger.error('Error in completion handler:', error);
      }
    }

    // Cleanup
    this.buffers.delete(runId);
    this.streamMetadata.delete(runId);

    this.logger.debug(`Streaming completed for run ${runId}`);
  }

  /**
   * Handle LLM error
   */
  async handleLLMError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.emitStreamingEvent({
      type: 'error',
      data: {
        error: err.message,
        stack: err.stack,
        runId,
      },
      timestamp: Date.now(),
      streamId: runId,
    });

    if (this.config.onError) {
      this.config.onError(err);
    }

    // Cleanup on error
    this.buffers.delete(runId);
    this.streamMetadata.delete(runId);

    this.logger.error(`Streaming error for run ${runId}:`, err);
  }

  /**
   * Subscribe to streaming events
   */
  subscribe(event: 'token' | 'start' | 'end' | 'error' | 'chunk' | 'metadata', listener: (data: StreamingEvent) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Unsubscribe from streaming events
   */
  unsubscribe(event: 'token' | 'start' | 'end' | 'error' | 'chunk' | 'metadata', listener: (data: StreamingEvent) => void): void {
    this.emitter.off(event, listener);
  }

  /**
   * Get async iterator for streaming tokens
   */
  async *getTokenIterator(streamId?: string): AsyncGenerator<StreamingToken> {
    const targetStreamId = streamId || this.streamId;
    const buffer: StreamingToken[] = [];
    let isComplete = false;

    // Set up event listeners
    const tokenHandler = (event: StreamingEvent) => {
      if (event.streamId === targetStreamId && event.type === 'token') {
        buffer.push(event.data);
      }
    };

    const endHandler = (event: StreamingEvent) => {
      if (event.streamId === targetStreamId && event.type === 'end') {
        isComplete = true;
      }
    };

    this.emitter.on('token', tokenHandler);
    this.emitter.on('end', endHandler);

    try {
      while (!isComplete) {
        // Yield buffered tokens
        while (buffer.length > 0) {
          yield buffer.shift()!;
        }

        // Wait for more tokens
        if (!isComplete) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Yield any remaining tokens
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }
    } finally {
      this.emitter.off('token', tokenHandler);
      this.emitter.off('end', endHandler);
    }
  }

  /**
   * Flush buffered tokens
   */
  private async flushBuffer(streamId: string): Promise<void> {
    const buffer = this.buffers.get(streamId);
    if (!buffer || buffer.length === 0) {
      return;
    }

    // Emit chunk event with all buffered tokens
    this.emitStreamingEvent({
      type: 'chunk',
      data: {
        tokens: [...buffer],
        count: buffer.length,
      },
      timestamp: Date.now(),
      streamId,
    });

    // Clear the buffer after flushing
    buffer.length = 0;
  }

  /**
   * Setup automatic buffer flushing
   */
  private setupAutoFlush(): void {
    if (this.config.flushInterval) {
      setInterval(() => {
        for (const [streamId] of this.buffers) {
          this.flushBuffer(streamId).catch((error) => {
            this.logger.error(`Auto-flush error for ${streamId}:`, error);
          });
        }
      }, this.config.flushInterval);
    }
  }

  /**
   * Emit streaming event
   */
  private emitStreamingEvent(event: StreamingEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // Wildcard for all events

    // Prevent recursive metadata events
    if (this.config.enableMetrics && event.type !== 'metadata') {
      this.emitter.emit('metadata', {
        type: 'metadata',
        data: {
          bufferSize: this.buffers.get(event.streamId)?.length || 0,
          totalStreams: this.buffers.size,
        },
        timestamp: Date.now(),
        streamId: event.streamId,
      });
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.emitter.removeAllListeners();
    this.buffers.clear();
    this.streamMetadata.clear();
  }
}
