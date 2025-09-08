import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';

export interface IteratorEvent {
  type: 'token' | 'message' | 'tool' | 'agent' | 'chain' | 'error' | 'complete';
  content: any;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * AsyncIteratorCallbackHandler for async iteration over streaming events
 * Provides async iterator interface for consuming LangChain events
 */
@Injectable()
export class AsyncIteratorCallbackHandler extends BaseCallbackHandler {
  name = 'AsyncIteratorCallbackHandler';
  private readonly logger = new Logger(AsyncIteratorCallbackHandler.name);

  private eventQueue: IteratorEvent[] = [];
  private resolvers: ((value: IteratorResult<IteratorEvent>) => void)[] = [];
  private isComplete = false;
  private error: Error | null = null;

  constructor(
    private readonly config: {
      queueSize?: number;
      includeMetadata?: boolean;
      filterTypes?: IteratorEvent['type'][];
    } = {},
  ) {
    super();
  }

  /**
   * Get async iterator for events
   */
  async *[Symbol.asyncIterator](): AsyncIterator<IteratorEvent> {
    while (!this.isComplete || this.eventQueue.length > 0) {
      // If we have events in queue, yield them
      if (this.eventQueue.length > 0) {
        yield this.eventQueue.shift()!;
        continue;
      }

      // If error occurred, throw it
      if (this.error) {
        throw this.error;
      }

      // If complete and no more events, return
      if (this.isComplete) {
        return;
      }

      // Wait for next event
      const event = await this.waitForNextEvent();
      if (event) {
        yield event;
      }
    }
  }

  /**
   * Alternative method to get async iterator
   */
  getAsyncIterator(): AsyncIterableIterator<IteratorEvent> {
    const handler = this;
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next(): Promise<IteratorResult<IteratorEvent>> {
        // Check for queued events
        if (handler.eventQueue.length > 0) {
          return {
            value: handler.eventQueue.shift()!,
            done: false,
          };
        }

        // Check if complete
        if (handler.isComplete) {
          return { value: undefined, done: true };
        }

        // Check for errors
        if (handler.error) {
          throw handler.error;
        }

        // Wait for next event
        const event = await handler.waitForNextEvent();
        if (event) {
          return { value: event, done: false };
        }

        return { value: undefined, done: true };
      },
    };
  }

  /**
   * Handle new LLM tokens
   */
  async handleLLMNewToken(token: string, idx: any, runId: string, parentRunId?: string, tags?: string[], fields?: any): Promise<void> {
    this.enqueueEvent({
      type: 'token',
      content: token,
      metadata: this.config.includeMetadata ? { idx, runId, parentRunId, tags, ...fields } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle chat model start
   */
  async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    for (const messageGroup of messages) {
      for (const message of messageGroup) {
        this.enqueueEvent({
          type: 'message',
          content: {
            role: message._getType(),
            content: message.content,
          },
          metadata: this.config.includeMetadata ? { runId, parentRunId, ...extraParams } : undefined,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Handle agent actions
   */
  async handleAgentAction(action: AgentAction, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'agent',
      content: {
        action: 'tool_use',
        tool: action.tool,
        toolInput: action.toolInput,
        log: action.log,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle agent finish
   */
  async handleAgentFinish(finish: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'agent',
      content: {
        action: 'finish',
        returnValues: finish.returnValues,
        log: finish.log,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle tool start
   */
  async handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'tool',
      content: {
        action: 'start',
        tool: tool.name,
        input,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle tool end
   */
  async handleToolEnd(output: string, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'tool',
      content: {
        action: 'end',
        output,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle tool error
   */
  async handleToolError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'tool',
      content: {
        action: 'error',
        error: err.message,
        stack: err.stack,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle chain start
   */
  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.enqueueEvent({
      type: 'chain',
      content: {
        action: 'start',
        chain: chain.name,
        inputKeys: Object.keys(inputs),
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId, tags, ...metadata } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle chain end
   */
  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'chain',
      content: {
        action: 'end',
        outputKeys: Object.keys(outputs),
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle chain error
   */
  async handleChainError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'error',
      content: {
        source: 'chain',
        error: err.message,
        stack: err.stack,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });

    this.error = err;
  }

  /**
   * Handle LLM error
   */
  async handleLLMError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'error',
      content: {
        source: 'llm',
        error: err.message,
        stack: err.stack,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });

    this.error = err;
  }

  /**
   * Handle LLM end
   */
  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string): Promise<void> {
    this.enqueueEvent({
      type: 'complete',
      content: {
        source: 'llm',
        generationCount: output.generations.length,
        tokenUsage: output.llmOutput?.tokenUsage,
      },
      metadata: this.config.includeMetadata ? { runId, parentRunId } : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Mark iteration as complete
   */
  complete(): void {
    this.isComplete = true;
    this.notifyResolvers();
  }

  /**
   * Reset the iterator state
   */
  reset(): void {
    this.eventQueue = [];
    this.resolvers = [];
    this.isComplete = false;
    this.error = null;
  }

  /**
   * Enqueue an event
   */
  private enqueueEvent(event: IteratorEvent): void {
    // Apply type filter if configured
    if (this.config.filterTypes && !this.config.filterTypes.includes(event.type)) {
      return;
    }

    // Check queue size limit
    if (this.config.queueSize && this.eventQueue.length >= this.config.queueSize) {
      this.logger.warn(`Event queue full (${this.config.queueSize}), dropping oldest event`);
      this.eventQueue.shift();
    }

    this.eventQueue.push(event);
    this.notifyResolvers();
  }

  /**
   * Wait for next event
   */
  private async waitForNextEvent(): Promise<IteratorEvent | null> {
    return new Promise<IteratorEvent | null>((resolve) => {
      // Check if we already have an event
      if (this.eventQueue.length > 0) {
        resolve(this.eventQueue.shift()!);
        return;
      }

      // Check if complete
      if (this.isComplete) {
        resolve(null);
        return;
      }

      // Wait for next event
      this.resolvers.push((result) => {
        if (result.done) {
          resolve(null);
        } else {
          resolve(result.value);
        }
      });
    });
  }

  /**
   * Notify waiting resolvers
   */
  private notifyResolvers(): void {
    while (this.resolvers.length > 0 && (this.eventQueue.length > 0 || this.isComplete)) {
      const resolver = this.resolvers.shift()!;

      if (this.eventQueue.length > 0) {
        resolver({ value: this.eventQueue.shift()!, done: false });
      } else if (this.isComplete) {
        resolver({ value: undefined, done: true });
      }
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.complete();
    this.eventQueue = [];
    this.resolvers = [];
  }
}
