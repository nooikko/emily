import type { BaseMessage } from '@langchain/core/messages';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { catchError, debounceTime, filter, map, retry, takeUntil } from 'rxjs/operators';
import { RedisService } from '../redis/redis.service';

/**
 * LangGraph streaming event types
 */
export enum LangGraphStreamEventType {
  CONVERSATION_START = 'conversation:start',
  CONVERSATION_UPDATE = 'conversation:update',
  CONVERSATION_COMPLETE = 'conversation:complete',
  CONVERSATION_ERROR = 'conversation:error',
  MESSAGE_CHUNK = 'message:chunk',
  MESSAGE_COMPLETE = 'message:complete',
  STATE_UPDATE = 'state:update',
  TOOL_CALL_START = 'tool:call:start',
  TOOL_CALL_COMPLETE = 'tool:call:complete',
  AGENT_THINKING = 'agent:thinking',
  AGENT_RESPONSE = 'agent:response',
}

/**
 * Streaming event structure for LangGraph conversations
 */
export interface LangGraphStreamEvent {
  eventType: LangGraphStreamEventType;
  threadId: string;
  timestamp: number;
  data: {
    conversationId?: string;
    messageId?: string;
    chunk?: string;
    message?: BaseMessage;
    state?: Record<string, unknown>;
    toolCall?: {
      toolName: string;
      arguments: Record<string, unknown>;
      result?: unknown;
    };
    error?: {
      message: string;
      code?: string;
      stack?: string;
    };
    metadata?: Record<string, unknown>;
  };
}

/**
 * Conversation streaming state
 */
export interface ConversationStreamState {
  threadId: string;
  isActive: boolean;
  subscriberCount: number;
  lastActivity: number;
  metadata: Record<string, unknown>;
}

/**
 * LangGraph streaming service for real-time conversation updates
 *
 * This service provides Redis-based streaming capabilities optimized for LangGraph
 * conversation flows, enabling real-time updates for agent interactions, tool calls,
 * and conversation state changes.
 *
 * Key features:
 * - Real-time streaming of LangGraph conversation events
 * - Redis pub/sub for scalable message distribution
 * - Typed event system for different conversation phases
 * - Automatic cleanup and connection management
 * - Message chunking for large responses
 * - Error handling and reconnection logic
 */
@Injectable()
export class LangGraphStreamingService implements OnModuleDestroy {
  private readonly logger = new Logger(LangGraphStreamingService.name);
  private readonly destroy$ = new Subject<void>();
  private readonly conversationStreams = new Map<string, Subject<LangGraphStreamEvent>>();
  private readonly conversationStates = new Map<string, ConversationStreamState>();
  private readonly globalStream$ = new BehaviorSubject<LangGraphStreamEvent | null>(null);

  constructor(private readonly redisService: RedisService) {
    this.setupGlobalStreamListener();
  }

  async onModuleDestroy() {
    this.logger.debug('Shutting down LangGraph streaming service');
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up all conversation streams
    for (const [threadId, subject] of this.conversationStreams) {
      subject.complete();
      this.conversationStreams.delete(threadId);
    }
  }

  /**
   * Start streaming for a conversation thread
   */
  startConversationStream(threadId: string, metadata: Record<string, unknown> = {}): Observable<LangGraphStreamEvent> {
    this.logger.debug(`Starting conversation stream for thread: ${threadId}`);

    let subject = this.conversationStreams.get(threadId);
    if (!subject) {
      subject = new Subject<LangGraphStreamEvent>();
      this.conversationStreams.set(threadId, subject);

      // Initialize conversation state
      this.conversationStates.set(threadId, {
        threadId,
        isActive: true,
        subscriberCount: 0,
        lastActivity: Date.now(),
        metadata,
      });
    }

    // Update subscriber count
    const state = this.conversationStates.get(threadId)!;
    state.subscriberCount++;
    state.lastActivity = Date.now();

    // Emit conversation start event
    this.emitConversationEvent(threadId, LangGraphStreamEventType.CONVERSATION_START, {
      conversationId: threadId,
      metadata,
    });

    // Subscribe to Redis stream for this thread
    const _redisSubscription = this.redisService
      .subscribe(this.getThreadChannel(threadId))
      .pipe(
        map((message) => this.parseStreamEvent(message)),
        filter((event): event is LangGraphStreamEvent => event !== null),
        retry({ count: 3, delay: 1000 }),
        catchError((error) => {
          this.logger.error(`Redis subscription error for thread ${threadId}:`, error);
          return [];
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((event) => {
        subject!.next(event);
        this.globalStream$.next(event);
      });

    // Return observable with cleanup handling
    return subject.asObservable().pipe(
      takeUntil(this.destroy$),
      // Clean up when subscription ends
      map((event) => {
        this.updateConversationActivity(threadId);
        return event;
      }),
    );
  }

  /**
   * Stop streaming for a conversation thread
   */
  stopConversationStream(threadId: string): void {
    this.logger.debug(`Stopping conversation stream for thread: ${threadId}`);

    const subject = this.conversationStreams.get(threadId);
    const state = this.conversationStates.get(threadId);

    if (subject && state) {
      state.subscriberCount--;

      if (state.subscriberCount <= 0) {
        // Emit completion event
        this.emitConversationEvent(threadId, LangGraphStreamEventType.CONVERSATION_COMPLETE, {
          conversationId: threadId,
        });

        // Clean up
        subject.complete();
        this.conversationStreams.delete(threadId);
        this.conversationStates.delete(threadId);
      }
    }
  }

  /**
   * Emit a conversation event
   */
  async emitConversationEvent(threadId: string, eventType: LangGraphStreamEventType, data: LangGraphStreamEvent['data']): Promise<void> {
    const event: LangGraphStreamEvent = {
      eventType,
      threadId,
      timestamp: Date.now(),
      data,
    };

    try {
      // Publish to Redis
      await this.redisService.publish(this.getThreadChannel(threadId), JSON.stringify(event));

      // Also publish to global channel for monitoring
      await this.redisService.publish(this.getGlobalChannel(), JSON.stringify(event));

      this.logger.debug(`Emitted event ${eventType} for thread ${threadId}`);
    } catch (error) {
      this.logger.error(`Failed to emit event ${eventType} for thread ${threadId}:`, error);
    }
  }

  /**
   * Stream message chunks for real-time response display
   */
  async streamMessageChunks(threadId: string, messageId: string, chunks: AsyncIterable<string>): Promise<void> {
    this.logger.debug(`Streaming message chunks for ${messageId} in thread ${threadId}`);

    try {
      for await (const chunk of chunks) {
        await this.emitConversationEvent(threadId, LangGraphStreamEventType.MESSAGE_CHUNK, {
          messageId,
          chunk,
          metadata: { chunkSize: chunk.length },
        });
      }

      // Emit completion
      await this.emitConversationEvent(threadId, LangGraphStreamEventType.MESSAGE_COMPLETE, {
        messageId,
        metadata: { completed: true },
      });
    } catch (error) {
      this.logger.error('Error streaming message chunks:', error);
      await this.emitConversationEvent(threadId, LangGraphStreamEventType.CONVERSATION_ERROR, {
        messageId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown streaming error',
          code: 'STREAMING_ERROR',
        },
      });
    }
  }

  /**
   * Stream conversation state updates
   */
  async streamStateUpdate(threadId: string, state: Record<string, unknown>, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.emitConversationEvent(threadId, LangGraphStreamEventType.STATE_UPDATE, {
      state,
      metadata,
    });
  }

  /**
   * Stream tool call events
   */
  async streamToolCall(threadId: string, toolName: string, toolArguments: Record<string, unknown>, result?: unknown): Promise<void> {
    // Start event
    await this.emitConversationEvent(threadId, LangGraphStreamEventType.TOOL_CALL_START, {
      toolCall: { toolName, arguments: toolArguments },
    });

    // Complete event (if result provided)
    if (result !== undefined) {
      await this.emitConversationEvent(threadId, LangGraphStreamEventType.TOOL_CALL_COMPLETE, {
        toolCall: { toolName, arguments: toolArguments, result },
      });
    }
  }

  /**
   * Stream agent thinking/processing events
   */
  async streamAgentThinking(threadId: string, thinking: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.emitConversationEvent(threadId, LangGraphStreamEventType.AGENT_THINKING, {
      chunk: thinking,
      metadata,
    });
  }

  /**
   * Stream complete agent response
   */
  async streamAgentResponse(threadId: string, message: BaseMessage, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.emitConversationEvent(threadId, LangGraphStreamEventType.AGENT_RESPONSE, {
      message,
      metadata,
    });
  }

  /**
   * Get global stream for monitoring all conversations
   */
  getGlobalStream(): Observable<LangGraphStreamEvent> {
    return this.globalStream$.asObservable().pipe(
      filter((event): event is LangGraphStreamEvent => event !== null),
      takeUntil(this.destroy$),
    );
  }

  /**
   * Get conversation states for monitoring
   */
  getConversationStates(): ConversationStreamState[] {
    return Array.from(this.conversationStates.values());
  }

  /**
   * Get active conversation count
   */
  getActiveConversationCount(): number {
    return Array.from(this.conversationStates.values()).filter((state) => state.isActive).length;
  }

  /**
   * Cleanup inactive conversations
   */
  cleanupInactiveConversations(maxAge: number = 30 * 60 * 1000): void {
    const now = Date.now();
    const toCleanup: string[] = [];

    for (const [threadId, state] of this.conversationStates) {
      if (now - state.lastActivity > maxAge && state.subscriberCount === 0) {
        toCleanup.push(threadId);
      }
    }

    for (const threadId of toCleanup) {
      this.logger.debug(`Cleaning up inactive conversation: ${threadId}`);
      this.stopConversationStream(threadId);
    }
  }

  // Private methods

  private setupGlobalStreamListener(): void {
    // Subscribe to global channel for monitoring
    this.redisService
      .subscribe(this.getGlobalChannel())
      .pipe(
        map((message) => this.parseStreamEvent(message)),
        filter((event): event is LangGraphStreamEvent => event !== null),
        debounceTime(10), // Prevent spam
        takeUntil(this.destroy$),
      )
      .subscribe((event) => {
        this.globalStream$.next(event);
      });

    // Setup periodic cleanup
    setInterval(
      () => {
        this.cleanupInactiveConversations();
      },
      5 * 60 * 1000,
    ); // Every 5 minutes
  }

  /**
   * Type guard to validate LangGraphStreamEvent structure
   */
  private isValidLangGraphStreamEvent(obj: unknown): obj is LangGraphStreamEvent {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const event = obj as Record<string, unknown>;

    // Check required fields
    if (
      typeof event.eventType !== 'string' ||
      typeof event.threadId !== 'string' ||
      typeof event.timestamp !== 'number' ||
      typeof event.data !== 'object' ||
      event.data === null
    ) {
      return false;
    }

    // Validate eventType is one of the expected enum values
    if (!Object.values(LangGraphStreamEventType).includes(event.eventType as LangGraphStreamEventType)) {
      return false;
    }

    // Validate data structure
    const data = event.data as Record<string, unknown>;

    // Optional validation for specific data fields based on event type
    switch (event.eventType as LangGraphStreamEventType) {
      case LangGraphStreamEventType.MESSAGE_CHUNK:
        if (typeof data.chunk !== 'string' && data.chunk !== undefined) {
          return false;
        }
        break;
      case LangGraphStreamEventType.TOOL_CALL_START:
      case LangGraphStreamEventType.TOOL_CALL_COMPLETE:
        if (data.toolCall) {
          if (typeof data.toolCall !== 'object' || data.toolCall === null) {
            return false;
          }
          const toolCall = data.toolCall as Record<string, unknown>;
          if (typeof toolCall.toolName !== 'string' || typeof toolCall.arguments !== 'object' || toolCall.arguments === null) {
            return false;
          }
        }
        break;
      case LangGraphStreamEventType.CONVERSATION_ERROR:
        if (data.error) {
          if (typeof data.error !== 'object' || data.error === null) {
            return false;
          }
          const error = data.error as Record<string, unknown>;
          if (typeof error.message !== 'string') {
            return false;
          }
        }
        break;
    }

    return true;
  }

  private parseStreamEvent(message: string): LangGraphStreamEvent | null {
    try {
      const parsed: unknown = JSON.parse(message);

      if (this.isValidLangGraphStreamEvent(parsed)) {
        return parsed;
      }

      this.logger.warn('Invalid stream event structure', { message: message.substring(0, 200) });
      return null;
    } catch (error) {
      this.logger.warn('Failed to parse stream event JSON:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        message: message.substring(0, 200),
      });
      return null;
    }
  }

  private updateConversationActivity(threadId: string): void {
    const state = this.conversationStates.get(threadId);
    if (state) {
      state.lastActivity = Date.now();
    }
  }

  private getThreadChannel(threadId: string): string {
    return `langraph:thread:${threadId}`;
  }

  private getGlobalChannel(): string {
    return 'langraph:global';
  }
}
