import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string | object;
  retry?: number;
}

export interface SSEStreamConfig {
  heartbeatInterval?: number;
  enableCompression?: boolean;
  includeMetadata?: boolean;
  flushOnToken?: boolean;
  formatPartialResults?: boolean;
}

/**
 * SSECallbackHandler for Server-Sent Events streaming
 * Implements SSE protocol for real-time streaming to HTTP clients
 */
@Injectable()
export class SSECallbackHandler extends BaseCallbackHandler {
  name = 'SSECallbackHandler';
  private readonly logger = new Logger(SSECallbackHandler.name);

  private readonly streams = new Map<string, Subject<SSEEvent>>();
  private readonly responses = new Map<string, Response>();
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private eventCounter = 0;

  constructor(private readonly config: SSEStreamConfig = {}) {
    super();
  }

  /**
   * Create SSE stream for a client response
   */
  createStream(streamId: string, response: Response): Observable<SSEEvent> {
    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      ...(this.config.enableCompression ? {} : { 'Content-Encoding': 'identity' }),
    });

    // Create subject for this stream
    const subject = new Subject<SSEEvent>();
    this.streams.set(streamId, subject);
    this.responses.set(streamId, response);

    // Send initial connection event
    this.sendSSEEvent(streamId, {
      event: 'connected',
      data: { streamId, timestamp: Date.now() },
    });

    // Setup heartbeat
    if (this.config.heartbeatInterval) {
      this.startHeartbeat(streamId);
    }

    // Handle client disconnect
    response.on('close', () => {
      this.handleClientDisconnect(streamId);
    });

    // Return observable
    return subject.asObservable();
  }

  /**
   * Attach to existing Express response for SSE streaming
   */
  attachToResponse(response: Response, streamId?: string): string {
    const id = streamId || this.generateStreamId();

    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Store response
    this.responses.set(id, response);

    // Create event stream
    const subject = new Subject<SSEEvent>();
    this.streams.set(id, subject);

    // Subscribe to stream and write to response
    subject.subscribe({
      next: (event) => {
        this.writeSSEToResponse(response, event);
      },
      error: (err) => {
        this.sendSSEEvent(id, {
          event: 'error',
          data: { error: err.message },
        });
        response.end();
      },
      complete: () => {
        this.sendSSEEvent(id, {
          event: 'complete',
          data: { timestamp: Date.now() },
        });
        response.end();
      },
    });

    // Setup heartbeat
    if (this.config.heartbeatInterval) {
      this.startHeartbeat(id);
    }

    // Handle disconnect
    response.on('close', () => {
      this.handleClientDisconnect(id);
    });

    // Send initial event
    this.sendSSEEvent(id, {
      event: 'connected',
      data: { streamId: id, timestamp: Date.now() },
    });

    return id;
  }

  /**
   * Send SSE event to a specific stream
   */
  sendSSEEvent(streamId: string, event: SSEEvent): void {
    const subject = this.streams.get(streamId);
    const response = this.responses.get(streamId);

    if (!subject || !response) {
      this.logger.warn(`Stream ${streamId} not found`);
      return;
    }

    // Add event ID if not provided
    if (!event.id) {
      event.id = String(++this.eventCounter);
    }

    // Send to subject
    subject.next(event);

    // Write directly to response
    this.writeSSEToResponse(response, event);
  }

  /**
   * Write SSE event to HTTP response
   */
  private writeSSEToResponse(response: Response, event: SSEEvent): void {
    if (response.writableEnded) {
      return;
    }

    let output = '';

    if (event.id) {
      output += `id: ${event.id}\n`;
    }

    if (event.event) {
      output += `event: ${event.event}\n`;
    }

    if (event.retry) {
      output += `retry: ${event.retry}\n`;
    }

    const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);

    // Split data by newlines for proper SSE format
    const lines = data.split('\n');
    for (const line of lines) {
      output += `data: ${line}\n`;
    }

    output += '\n';

    response.write(output);

    // Flush if configured
    if (this.config.flushOnToken !== false) {
      // Note: Express Response doesn't have flush, but write handles buffering
      // Some custom implementations may add flush, so we check for it
      (response as any).flush?.();
    }
  }

  /**
   * Start heartbeat for a stream
   */
  private startHeartbeat(streamId: string): void {
    const timer = setInterval(() => {
      this.sendSSEEvent(streamId, {
        event: 'heartbeat',
        data: { timestamp: Date.now() },
      });
    }, this.config.heartbeatInterval!);

    this.heartbeatTimers.set(streamId, timer);
  }

  /**
   * Stop heartbeat for a stream
   */
  private stopHeartbeat(streamId: string): void {
    const timer = this.heartbeatTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(streamId);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(streamId: string): void {
    this.logger.debug(`Client disconnected: ${streamId}`);

    // Stop heartbeat
    this.stopHeartbeat(streamId);

    // Complete and clean up stream
    const subject = this.streams.get(streamId);
    if (subject) {
      subject.complete();
      this.streams.delete(streamId);
    }

    // Remove response
    this.responses.delete(streamId);
  }

  /**
   * Generate unique stream ID
   */
  private generateStreamId(): string {
    return `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // LangChain callback implementations

  async handleLLMNewToken(token: string, idx: any, runId: string, parentRunId?: string): Promise<void> {
    // Send token to all active streams
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'token',
        data: {
          content: token,
          index: idx,
          runId,
          parentRunId,
          timestamp: Date.now(),
        },
      });
    }
  }

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'llm_start',
        data: {
          llm: llm.name,
          promptCount: prompts.length,
          runId,
          parentRunId,
          ...(this.config.includeMetadata ? extraParams : {}),
        },
      });
    }
  }

  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'llm_end',
        data: {
          generationCount: output.generations.length,
          tokenUsage: output.llmOutput?.tokenUsage,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleLLMError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'llm_error',
        data: {
          error: err.message,
          stack: this.config.includeMetadata ? err.stack : undefined,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'chain_start',
        data: {
          chain: chain.name,
          inputKeys: Object.keys(inputs),
          runId,
          parentRunId,
          ...(this.config.includeMetadata ? { tags, ...metadata } : {}),
        },
      });
    }
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'chain_end',
        data: {
          outputKeys: Object.keys(outputs),
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleChainError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'chain_error',
        data: {
          error: err.message,
          stack: this.config.includeMetadata ? err.stack : undefined,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'tool_start',
        data: {
          tool: tool.name,
          inputLength: input.length,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'tool_end',
        data: {
          outputLength: output.length,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleToolError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'tool_error',
        data: {
          error: err.message,
          stack: this.config.includeMetadata ? err.stack : undefined,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleAgentAction(action: AgentAction, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'agent_action',
        data: {
          tool: action.tool,
          toolInput: action.toolInput,
          log: this.config.includeMetadata ? action.log : undefined,
          runId,
          parentRunId,
        },
      });
    }
  }

  async handleAgentFinish(finish: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.sendSSEEvent(streamId, {
        event: 'agent_finish',
        data: {
          returnValues: finish.returnValues,
          log: this.config.includeMetadata ? finish.log : undefined,
          runId,
          parentRunId,
        },
      });
    }
  }

  /**
   * Format partial results for streaming
   */
  formatPartialResult(partial: any): string {
    if (!this.config.formatPartialResults) {
      return JSON.stringify(partial);
    }

    // Custom formatting logic
    if (typeof partial === 'string') {
      return partial;
    }

    if (partial.content) {
      return partial.content;
    }

    return JSON.stringify(partial);
  }

  /**
   * Close a specific stream
   */
  closeStream(streamId: string): void {
    const subject = this.streams.get(streamId);
    const response = this.responses.get(streamId);

    if (subject) {
      subject.complete();
    }

    if (response && !response.writableEnded) {
      this.sendSSEEvent(streamId, {
        event: 'stream_close',
        data: { timestamp: Date.now() },
      });
      response.end();
    }

    this.handleClientDisconnect(streamId);
  }

  /**
   * Close all streams
   */
  closeAllStreams(): void {
    const streamIds = Array.from(this.streams.keys());
    for (const streamId of streamIds) {
      this.closeStream(streamId);
    }
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount(): number {
    return this.streams.size;
  }

  /**
   * Get stream IDs
   */
  getStreamIds(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.closeAllStreams();

    const timers = Array.from(this.heartbeatTimers.values());
    for (const timer of timers) {
      clearInterval(timer);
    }

    this.heartbeatTimers.clear();
    this.streams.clear();
    this.responses.clear();
  }
}
