import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread, ThreadBranchType, ThreadStatus } from '../entities/conversation-thread.entity';
import { MessageContentType, MessageSender, ThreadMessage, ThreadMessageMetadata } from '../entities/thread-message.entity';
import { ThreadsService } from './threads.service';

/**
 * Typed error interface for conversation state operations
 * Provides structured error information with proper TypeScript typing
 */
export interface ConversationStateError {
  /** Error code for programmatic handling */
  code: 'THREAD_NOT_FOUND' | 'INVALID_MESSAGE' | 'STATE_PERSISTENCE_FAILED' | 'GRAPH_EXECUTION_FAILED' | 'DATABASE_ERROR' | 'UNKNOWN_ERROR';
  /** Human-readable error message */
  message: string;
  /** Optional error details for debugging */
  details?: {
    threadId?: string;
    messageId?: string;
    operation?: string;
    originalError?: unknown;
    timestamp?: number;
  };
}

/**
 * Strongly typed conversation context interface
 * Replaces unsafe Record<string, any> usage with specific typed fields
 */
export interface ConversationContext {
  /** User session information */
  session?: {
    id?: string;
    userId?: string;
    source?: 'web' | 'api' | 'mobile' | 'cli';
    userAgent?: string;
    ipAddress?: string;
  };
  /** AI model configuration and preferences */
  modelConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  /** Current conversation metadata */
  conversation?: {
    language?: string;
    topic?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    category?: string;
    tags?: string[];
  };
  /** Tool and capability context */
  capabilities?: {
    availableTools?: string[];
    restrictedActions?: string[];
    featureFlags?: Record<string, boolean>;
  };
  /** Processing and performance tracking */
  processing?: {
    startTime?: number;
    stepCount?: number;
    tokenUsage?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  };
  /** Custom application-specific context */
  custom?: {
    /** String values for simple custom data */
    strings?: Record<string, string>;
    /** Numeric values for metrics and counters */
    numbers?: Record<string, number>;
    /** Boolean flags for feature toggles and states */
    booleans?: Record<string, boolean>;
    /** Complex structured data (use sparingly and with clear intent) */
    objects?: Record<string, Record<string, unknown>>;
  };
}

/**
 * LangGraph conversation state annotation
 * Defines the structure of state that flows through conversation nodes
 */
export const ConversationState = Annotation.Root({
  // Core conversation metadata
  threadId: Annotation<string>(),
  thread: Annotation<ConversationThread | null>({
    default: () => null,
    reducer: (current, update) => update ?? current,
  }),

  // Message history and current processing
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: (current, update) => [...current, ...update],
  }),
  currentMessage: Annotation<BaseMessage | null>({
    default: () => null,
    reducer: (current, update) => update ?? current,
  }),

  // Conversation flow control
  conversationPhase: Annotation<'initialization' | 'active' | 'tool_use' | 'completion' | 'error'>({
    default: () => 'initialization',
    reducer: (current, update) => update ?? current,
  }),

  // Context management
  context: Annotation<ConversationContext>({
    default: () => ({}),
    reducer: (current, update) => ({ ...current, ...update }),
  }),

  // Error handling
  error: Annotation<string | null>({
    default: () => null,
    reducer: (current, update) => update ?? current,
  }),
});

export type ConversationStateType = typeof ConversationState.State;

/**
 * Generic type constraint for LangGraph state annotations
 * Ensures type safety for state graph operations
 */
export type StateGraphNode<TState extends Record<string, unknown>> = (state: TState) => Promise<Partial<TState>>;

/**
 * Type-safe conditional edge function for LangGraph
 */
export type ConditionalEdgeFunction<TState extends Record<string, unknown>> = (state: TState) => string;

/**
 * LangGraph-compatible conversation state manager for ThreadsModule
 *
 * This service provides LangGraph state management integration with the ThreadsModule,
 * enabling sophisticated conversation flows and state persistence through PostgreSQL.
 *
 * Key features:
 * - LangGraph state annotation and flow management
 * - Automatic conversation initialization and thread management
 * - Message persistence with conversation context
 * - State transitions and error handling
 * - Integration with existing ThreadsService patterns
 */
@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);
  private stateGraphs = new Map<string, StateGraph<any>>();

  constructor(
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
    @InjectRepository(ThreadMessage)
    private readonly messageRepository: Repository<ThreadMessage>,
    private readonly threadsService: ThreadsService,
  ) {}

  /**
   * Initialize a conversation state graph for a thread
   */
  async initializeConversationGraph(threadId: string): Promise<StateGraph<any>> {
    this.logger.debug(`Initializing conversation graph for thread: ${threadId}`);

    // Return existing graph if already initialized
    const existingGraph = this.stateGraphs.get(threadId);
    if (existingGraph) {
      return existingGraph;
    }

    const stateGraph = new StateGraph(ConversationState);

    // Define conversation flow nodes
    stateGraph
      .addNode('initializeThread', this.initializeThreadNode.bind(this))
      .addNode('processMessage', this.processMessageNode.bind(this))
      .addNode('persistState', this.persistStateNode.bind(this))
      .addNode('finalize', this.finalizeNode.bind(this))
      .addNode('handleError', this.handleErrorNode.bind(this));

    // Define conversation flow edges - using type assertions for LangGraph compatibility
    (stateGraph as any)
      .addEdge(START, 'initializeThread')
      .addConditionalEdges('initializeThread', this.shouldProcessMessage.bind(this), {
        process: 'processMessage',
        error: 'handleError',
      })
      .addEdge('processMessage', 'persistState')
      .addConditionalEdges('persistState', this.shouldFinalize.bind(this), {
        finalize: 'finalize',
        continue: 'processMessage',
        error: 'handleError',
      })
      .addEdge('finalize', END)
      .addEdge('handleError', END);

    this.stateGraphs.set(threadId, stateGraph);
    return stateGraph;
  }

  /**
   * Execute conversation state flow for a thread
   */
  async executeConversationFlow(threadId: string, initialMessage: BaseMessage, context: ConversationContext = {}): Promise<ConversationStateType> {
    this.logger.debug(`Executing conversation flow for thread: ${threadId}`);

    const stateGraph = this.stateGraphs.get(threadId) || (await this.initializeConversationGraph(threadId));
    const compiledGraph = stateGraph.compile();

    const initialState: ConversationStateType = {
      threadId,
      thread: null,
      messages: [initialMessage],
      currentMessage: initialMessage,
      conversationPhase: 'initialization',
      context,
      error: null,
    };

    try {
      const result = await compiledGraph.invoke(initialState, {
        configurable: { thread_id: threadId },
      });

      this.logger.debug(`Conversation flow completed for thread: ${threadId}`);
      return result as ConversationStateType;
    } catch (error) {
      const stateError: ConversationStateError = {
        code: 'GRAPH_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Conversation flow execution failed',
        details: {
          threadId,
          operation: 'executeConversationFlow',
          originalError: error,
          timestamp: Date.now(),
        },
      };
      this.logger.error(`Conversation flow failed for thread: ${threadId}`, stateError);
      throw new Error(JSON.stringify(stateError));
    }
  }

  /**
   * Add a message to an existing conversation flow
   */
  async addMessageToConversation(threadId: string, message: BaseMessage, context: ConversationContext = {}): Promise<ConversationStateType> {
    this.logger.debug(`Adding message to conversation: ${threadId}`);

    // Load existing conversation state
    const thread = await this.threadsService.findThreadById(threadId);
    if (!thread) {
      const stateError: ConversationStateError = {
        code: 'THREAD_NOT_FOUND',
        message: `Thread not found: ${threadId}`,
        details: {
          threadId,
          operation: 'addMessageToConversation',
          timestamp: Date.now(),
        },
      };
      throw new Error(JSON.stringify(stateError));
    }

    const existingMessages = await this.getThreadMessages(threadId);

    const _currentState: ConversationStateType = {
      threadId,
      thread: await this.threadRepository.findOne({ where: { id: threadId } }),
      messages: [...existingMessages, message],
      currentMessage: message,
      conversationPhase: 'active',
      context,
      error: null,
    };

    return this.executeConversationFlow(threadId, message, context);
  }

  /**
   * Convert ThreadMessage entities to LangChain BaseMessage format
   */
  private async getThreadMessages(threadId: string): Promise<BaseMessage[]> {
    const threadMessages = await this.messageRepository.find({
      where: { threadId, isDeleted: false },
      order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
    });

    return threadMessages.map(this.convertToBaseMessage);
  }

  /**
   * Convert ThreadMessage to BaseMessage
   */
  private convertToBaseMessage(threadMessage: ThreadMessage): BaseMessage {
    switch (threadMessage.sender) {
      case MessageSender.HUMAN:
        return new HumanMessage({
          content: threadMessage.content,
          additional_kwargs: {
            messageId: threadMessage.id,
            metadata: threadMessage.metadata,
            contentType: threadMessage.contentType,
            rawContent: threadMessage.rawContent,
          },
        });
      case MessageSender.ASSISTANT:
        return new AIMessage({
          content: threadMessage.content,
          additional_kwargs: {
            messageId: threadMessage.id,
            metadata: threadMessage.metadata,
            contentType: threadMessage.contentType,
            model: threadMessage.model,
            temperature: threadMessage.temperature,
          },
        });
      case MessageSender.SYSTEM:
        return new SystemMessage({
          content: threadMessage.content,
          additional_kwargs: {
            messageId: threadMessage.id,
            metadata: threadMessage.metadata,
          },
        });
      default:
        throw new Error(`Unknown message sender: ${threadMessage.sender}`);
    }
  }

  /**
   * Convert BaseMessage to ThreadMessage entity
   */
  private convertToThreadMessage(message: BaseMessage, threadId: string, sequenceNumber: number): Partial<ThreadMessage> {
    let sender: MessageSender;
    let role: string | undefined;

    if (message instanceof HumanMessage) {
      sender = MessageSender.HUMAN;
      role = 'user';
    } else if (message instanceof AIMessage) {
      sender = MessageSender.ASSISTANT;
      role = 'assistant';
    } else if (message instanceof SystemMessage) {
      sender = MessageSender.SYSTEM;
      role = 'system';
    } else {
      throw new Error(`Unsupported message type: ${message.constructor.name}`);
    }

    const contentString = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    return {
      threadId,
      sender,
      contentType: MessageContentType.TEXT,
      content: contentString,
      role,
      sequenceNumber,
      metadata: message.additional_kwargs?.metadata as ThreadMessageMetadata | undefined,
      model: typeof message.additional_kwargs?.model === 'string' ? message.additional_kwargs.model : undefined,
      temperature: typeof message.additional_kwargs?.temperature === 'number' ? message.additional_kwargs.temperature : undefined,
      rawContent: Array.isArray(message.additional_kwargs?.rawContent)
        ? (message.additional_kwargs.rawContent as Array<{
            type: 'text' | 'image_url' | 'file' | 'audio' | 'video';
            text?: string;
            imageUrl?: string;
            fileUrl?: string;
            audioUrl?: string;
            videoUrl?: string;
            detail?: 'auto' | 'low' | 'high';
          }>)
        : undefined,
    };
  }

  // State graph node implementations

  /**
   * Initialize thread node - ensures thread exists and is ready
   */
  private async initializeThreadNode(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
    this.logger.debug(`Initializing thread node: ${state.threadId}`);

    try {
      let thread = await this.threadRepository.findOne({
        where: { id: state.threadId },
      });

      // Auto-create thread if it doesn't exist
      if (!thread) {
        const initialContent = state.currentMessage?.content || '';
        const contentString = typeof initialContent === 'string' ? initialContent : JSON.stringify(initialContent);

        const threadResponse = await this.threadsService.autoCreateThread({ initialContent: contentString }, state.threadId);

        thread = await this.threadRepository.findOne({
          where: { id: threadResponse.id },
        });
      }

      if (!thread || thread.status === ThreadStatus.DELETED) {
        return {
          conversationPhase: 'error',
          error: 'Thread not available or deleted',
        };
      }

      return {
        thread,
        conversationPhase: 'active',
        error: null,
      };
    } catch (error) {
      this.logger.error(`Failed to initialize thread: ${state.threadId}`, error);
      const stateError: ConversationStateError = {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Thread initialization failed',
        details: {
          threadId: state.threadId,
          operation: 'initializeThread',
          originalError: error instanceof Error ? error : {},
          timestamp: Date.now(),
        },
      };
      return {
        conversationPhase: 'error',
        error: JSON.stringify(stateError),
      };
    }
  }

  /**
   * Process message node - handles message processing and validation
   */
  private async processMessageNode(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
    this.logger.debug(`Processing message node: ${state.threadId}`);

    try {
      if (!state.currentMessage) {
        return {
          conversationPhase: 'error',
          error: 'No current message to process',
        };
      }

      // Additional message processing logic can be added here
      // For example: content validation, enrichment, etc.

      return {
        conversationPhase: 'active',
        error: null,
      };
    } catch (error) {
      this.logger.error(`Failed to process message: ${state.threadId}`, error);
      const stateError: ConversationStateError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Message processing failed',
        details: {
          threadId: state.threadId,
          operation: 'processMessage',
          originalError: error,
          timestamp: Date.now(),
        },
      };
      return {
        conversationPhase: 'error',
        error: JSON.stringify(stateError),
      };
    }
  }

  /**
   * Persist state node - saves conversation state to database
   */
  private async persistStateNode(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
    this.logger.debug(`Persisting state node: ${state.threadId}`);

    try {
      if (!state.currentMessage || !state.thread) {
        return {
          conversationPhase: 'error',
          error: 'Missing message or thread for persistence',
        };
      }

      // Get next sequence number
      const lastMessage = await this.messageRepository.findOne({
        where: { threadId: state.threadId },
        order: { sequenceNumber: 'DESC' },
      });
      const sequenceNumber = (lastMessage?.sequenceNumber || 0) + 1;

      // Convert and save message
      const threadMessageData = this.convertToThreadMessage(state.currentMessage, state.threadId, sequenceNumber);

      const threadMessage = this.messageRepository.create(threadMessageData);
      await this.messageRepository.save(threadMessage);

      // Update thread activity
      const contentString =
        typeof state.currentMessage.content === 'string' ? state.currentMessage.content : JSON.stringify(state.currentMessage.content);

      await this.threadsService.updateThreadActivity(
        state.threadId,
        contentString.substring(0, 500),
        threadMessage.sender === MessageSender.HUMAN
          ? MessageSender.HUMAN
          : threadMessage.sender === MessageSender.ASSISTANT
            ? MessageSender.ASSISTANT
            : MessageSender.SYSTEM,
      );

      return {
        conversationPhase: 'completion',
        error: null,
      };
    } catch (error) {
      this.logger.error(`Failed to persist state: ${state.threadId}`, error);
      const stateError: ConversationStateError = {
        code: 'STATE_PERSISTENCE_FAILED',
        message: error instanceof Error ? error.message : 'State persistence failed',
        details: {
          threadId: state.threadId,
          operation: 'persistState',
          originalError: error,
          timestamp: Date.now(),
        },
      };
      return {
        conversationPhase: 'error',
        error: JSON.stringify(stateError),
      };
    }
  }

  /**
   * Finalize node - completes conversation processing
   */
  private async finalizeNode(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
    this.logger.debug(`Finalizing conversation: ${state.threadId}`);

    return {
      conversationPhase: 'completion',
      error: null,
    };
  }

  /**
   * Handle error node - manages error states
   */
  private async handleErrorNode(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
    this.logger.error(`Handling error in conversation: ${state.threadId}`, state.error);

    return {
      conversationPhase: 'error',
    };
  }

  // Conditional edge functions

  /**
   * Determines if message should be processed
   */
  private shouldProcessMessage(state: ConversationStateType): string {
    if (state.error) {
      return 'error';
    }
    if (state.conversationPhase === 'active') {
      return 'process';
    }
    return 'error';
  }

  /**
   * Determines if conversation should be finalized
   */
  private shouldFinalize(state: ConversationStateType): string {
    if (state.error) {
      return 'error';
    }
    if (state.conversationPhase === 'completion') {
      return 'finalize';
    }
    return 'continue';
  }

  /**
   * Get conversation state for a thread
   */
  async getConversationState(threadId: string): Promise<ConversationStateType | null> {
    try {
      const thread = await this.threadRepository.findOne({ where: { id: threadId } });
      if (!thread) {
        return null;
      }

      const messages = await this.getThreadMessages(threadId);

      return {
        threadId,
        thread,
        messages,
        currentMessage: messages[messages.length - 1] || null,
        conversationPhase: 'active',
        context: {} satisfies ConversationContext,
        error: null,
      };
    } catch (error) {
      this.logger.error(`Failed to get conversation state: ${threadId}`, error);
      return null;
    }
  }

  /**
   * Clean up state graph for a thread
   */
  cleanupConversationGraph(threadId: string): void {
    this.stateGraphs.delete(threadId);
    this.logger.debug(`Cleaned up conversation graph for thread: ${threadId}`);
  }

  // Thread branching and merging capabilities

  /**
   * Create a branch from an existing thread at a specific message point
   */
  async createThreadBranch(
    parentThreadId: string,
    branchPointMessageId: string,
    branchOptions: {
      title?: string;
      branchReason?: string;
      createdBy?: string;
      branchingStrategy?: 'fork' | 'continuation' | 'alternative';
      preserveContext?: boolean;
    } = {},
  ): Promise<ConversationThread> {
    this.logger.debug(`Creating thread branch from ${parentThreadId} at message ${branchPointMessageId}`);

    try {
      // Validate parent thread exists and is active
      const parentThread = await this.threadRepository.findOne({
        where: { id: parentThreadId, status: ThreadStatus.ACTIVE },
      });

      if (!parentThread) {
        const error: ConversationStateError = {
          code: 'THREAD_NOT_FOUND',
          message: `Parent thread not found or inactive: ${parentThreadId}`,
          details: {
            threadId: parentThreadId,
            operation: 'createThreadBranch',
            timestamp: Date.now(),
          },
        };
        throw new Error(JSON.stringify(error));
      }

      // Validate branch point message exists in the parent thread
      const branchPointMessage = await this.messageRepository.findOne({
        where: { id: branchPointMessageId, threadId: parentThreadId, isDeleted: false },
      });

      if (!branchPointMessage) {
        const error: ConversationStateError = {
          code: 'INVALID_MESSAGE',
          message: `Branch point message not found: ${branchPointMessageId}`,
          details: {
            threadId: parentThreadId,
            messageId: branchPointMessageId,
            operation: 'createThreadBranch',
            timestamp: Date.now(),
          },
        };
        throw new Error(JSON.stringify(error));
      }

      // Create branch data using the parent thread's helper method
      const branchData = parentThread.createBranch(branchPointMessageId, branchOptions);

      // Create the new branch thread
      const branchThread = this.threadRepository.create(branchData);
      const savedBranch = await this.threadRepository.save(branchThread);

      // Copy messages up to the branch point if preserveContext is true
      if (branchOptions.preserveContext !== false) {
        await this.copyMessagesToBranch(parentThreadId, savedBranch.id, branchPointMessage.sequenceNumber);
      }

      this.logger.debug(`Successfully created branch thread: ${savedBranch.id}`);
      return savedBranch;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('{')) {
        // Re-throw structured errors
        throw error;
      }

      const stateError: ConversationStateError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create thread branch',
        details: {
          threadId: parentThreadId,
          messageId: branchPointMessageId,
          operation: 'createThreadBranch',
          originalError: error,
          timestamp: Date.now(),
        },
      };
      this.logger.error(`Failed to create thread branch: ${parentThreadId}`, stateError);
      throw new Error(JSON.stringify(stateError));
    }
  }

  /**
   * Copy messages from parent thread to branch thread up to a specific sequence number
   */
  private async copyMessagesToBranch(parentThreadId: string, branchThreadId: string, maxSequenceNumber: number): Promise<void> {
    this.logger.debug(`Copying messages from ${parentThreadId} to ${branchThreadId} up to sequence ${maxSequenceNumber}`);

    const messagesToCopy = await this.messageRepository.find({
      where: {
        threadId: parentThreadId,
        isDeleted: false,
      },
      order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
    });

    const filteredMessages = messagesToCopy.filter((msg) => msg.sequenceNumber <= maxSequenceNumber);

    for (const message of filteredMessages) {
      const copiedMessage = this.messageRepository.create({
        ...message,
        id: undefined, // Let TypeORM generate new ID
        threadId: branchThreadId,
        metadata: {
          ...message.metadata,
          copiedFromMessage: message.id,
          copiedFromThread: parentThreadId,
        },
        createdAt: undefined, // Let TypeORM set current timestamp
        updatedAt: undefined,
      });

      await this.messageRepository.save(copiedMessage);
    }

    this.logger.debug(`Copied ${filteredMessages.length} messages to branch ${branchThreadId}`);
  }

  /**
   * Merge multiple threads into a target thread
   */
  async mergeThreads(
    targetThreadId: string,
    sourceThreadIds: string[],
    mergeOptions: {
      mergeStrategy?: 'sequential' | 'interleaved' | 'manual';
      conflictResolution?: 'manual' | 'automatic' | 'priority';
      mergedBy?: string;
      archiveSourceThreads?: boolean;
    } = {},
  ): Promise<ConversationThread> {
    this.logger.debug(`Merging threads ${sourceThreadIds.join(', ')} into ${targetThreadId}`);

    const { mergeStrategy = 'sequential', conflictResolution = 'automatic', mergedBy, archiveSourceThreads = true } = mergeOptions;

    try {
      // Validate target thread exists and is active
      const targetThread = await this.threadRepository.findOne({
        where: { id: targetThreadId, status: ThreadStatus.ACTIVE },
      });

      if (!targetThread) {
        const error: ConversationStateError = {
          code: 'THREAD_NOT_FOUND',
          message: `Target thread not found or inactive: ${targetThreadId}`,
          details: {
            threadId: targetThreadId,
            operation: 'mergeThreads',
            timestamp: Date.now(),
          },
        };
        throw new Error(JSON.stringify(error));
      }

      // Validate source threads exist and are active
      const sourceThreads = await this.threadRepository.find({
        where: sourceThreadIds.map((id) => ({ id, status: ThreadStatus.ACTIVE })),
      });

      if (sourceThreads.length !== sourceThreadIds.length) {
        const foundIds = sourceThreads.map((t) => t.id);
        const missingIds = sourceThreadIds.filter((id) => !foundIds.includes(id));
        const error: ConversationStateError = {
          code: 'THREAD_NOT_FOUND',
          message: `Source threads not found or inactive: ${missingIds.join(', ')}`,
          details: {
            threadId: targetThreadId,
            operation: 'mergeThreads',
            timestamp: Date.now(),
          },
        };
        throw new Error(JSON.stringify(error));
      }

      // Perform the merge based on strategy
      await this.performThreadMerge(targetThread, sourceThreads, mergeStrategy);

      // Mark target thread as merged
      targetThread.markAsMerged(sourceThreadIds, {
        mergeStrategy,
        conflictResolution,
        mergedBy,
      });

      // Update thread tags and summary
      const allTags = new Set([...targetThread.tags, ...sourceThreads.flatMap((t) => t.tags), 'merged']);
      targetThread.tags = Array.from(allTags);

      // Update message count
      const totalMessages = await this.messageRepository.count({
        where: { threadId: targetThreadId, isDeleted: false },
      });
      targetThread.messageCount = totalMessages;

      const mergedThread = await this.threadRepository.save(targetThread);

      // Archive or delete source threads if requested
      if (archiveSourceThreads) {
        await this.threadRepository.update(sourceThreadIds, {
          status: ThreadStatus.ARCHIVED,
          metadata: {
            mergedIntoThread: targetThreadId,
            mergedAt: new Date(),
          } as any,
        });
      }

      this.logger.debug(`Successfully merged threads into ${targetThreadId}`);
      return mergedThread;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('{')) {
        // Re-throw structured errors
        throw error;
      }

      const stateError: ConversationStateError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to merge threads',
        details: {
          threadId: targetThreadId,
          operation: 'mergeThreads',
          originalError: error,
          timestamp: Date.now(),
        },
      };
      this.logger.error(`Failed to merge threads: ${targetThreadId}`, stateError);
      throw new Error(JSON.stringify(stateError));
    }
  }

  /**
   * Perform the actual thread merge based on the selected strategy
   */
  private async performThreadMerge(
    targetThread: ConversationThread,
    sourceThreads: ConversationThread[],
    mergeStrategy: 'sequential' | 'interleaved' | 'manual',
  ): Promise<void> {
    this.logger.debug(`Performing ${mergeStrategy} merge for ${sourceThreads.length} threads`);

    switch (mergeStrategy) {
      case 'sequential':
        await this.performSequentialMerge(targetThread.id, sourceThreads);
        break;
      case 'interleaved':
        await this.performInterleavedMerge(targetThread.id, sourceThreads);
        break;
      case 'manual':
        // For manual merge, we just copy all messages and let the user handle ordering
        await this.performManualMerge(targetThread.id, sourceThreads);
        break;
      default:
        throw new Error(`Unsupported merge strategy: ${mergeStrategy}`);
    }
  }

  /**
   * Perform sequential merge - append messages from each thread in order
   */
  private async performSequentialMerge(targetThreadId: string, sourceThreads: ConversationThread[]): Promise<void> {
    let currentSequenceNumber = await this.getNextSequenceNumber(targetThreadId);

    for (const sourceThread of sourceThreads) {
      const sourceMessages = await this.messageRepository.find({
        where: { threadId: sourceThread.id, isDeleted: false },
        order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
      });

      for (const message of sourceMessages) {
        const mergedMessage = this.messageRepository.create({
          ...message,
          id: undefined, // Let TypeORM generate new ID
          threadId: targetThreadId,
          sequenceNumber: currentSequenceNumber++,
          metadata: {
            ...message.metadata,
            mergedFromMessage: message.id,
            mergedFromThread: sourceThread.id,
          },
          createdAt: undefined, // Let TypeORM set current timestamp
          updatedAt: undefined,
        });

        await this.messageRepository.save(mergedMessage);
      }
    }

    this.logger.debug(`Sequential merge completed. Total messages added: ${currentSequenceNumber}`);
  }

  /**
   * Perform interleaved merge - merge messages by timestamp to maintain chronological order
   */
  private async performInterleavedMerge(targetThreadId: string, sourceThreads: ConversationThread[]): Promise<void> {
    const allMessages: Array<ThreadMessage & { originalThreadId: string }> = [];

    // Collect all messages from source threads
    for (const sourceThread of sourceThreads) {
      const sourceMessages = await this.messageRepository.find({
        where: { threadId: sourceThread.id, isDeleted: false },
        order: { createdAt: 'ASC' },
      });

      allMessages.push(
        ...sourceMessages.map(
          (msg) =>
            ({
              ...msg,
              originalThreadId: sourceThread.id,
            }) as ThreadMessage & { originalThreadId: string },
        ),
      );
    }

    // Sort by creation timestamp
    allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let sequenceNumber = await this.getNextSequenceNumber(targetThreadId);

    for (const message of allMessages) {
      const mergedMessage = this.messageRepository.create({
        ...message,
        id: undefined, // Let TypeORM generate new ID
        threadId: targetThreadId,
        sequenceNumber: sequenceNumber++,
        metadata: {
          ...message.metadata,
          mergedFromMessage: message.id,
          mergedFromThread: message.originalThreadId,
        },
        createdAt: undefined, // Let TypeORM set current timestamp
        updatedAt: undefined,
      });

      await this.messageRepository.save(mergedMessage);
    }

    this.logger.debug(`Interleaved merge completed. Total messages added: ${allMessages.length}`);
  }

  /**
   * Perform manual merge - copy all messages with original timestamps for manual ordering
   */
  private async performManualMerge(targetThreadId: string, sourceThreads: ConversationThread[]): Promise<void> {
    let currentSequenceNumber = await this.getNextSequenceNumber(targetThreadId);

    for (const sourceThread of sourceThreads) {
      const sourceMessages = await this.messageRepository.find({
        where: { threadId: sourceThread.id, isDeleted: false },
        order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
      });

      for (const message of sourceMessages) {
        const mergedMessage = this.messageRepository.create({
          ...message,
          id: undefined, // Let TypeORM generate new ID
          threadId: targetThreadId,
          sequenceNumber: currentSequenceNumber++,
          metadata: {
            ...message.metadata,
            mergedFromMessage: message.id,
            mergedFromThread: sourceThread.id,
            requiresManualOrdering: true,
          },
          // Preserve original timestamps for manual merge
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        });

        await this.messageRepository.save(mergedMessage);
      }
    }

    this.logger.debug(`Manual merge completed. Total messages added: ${currentSequenceNumber}`);
  }

  /**
   * Get the next sequence number for a thread
   */
  private async getNextSequenceNumber(threadId: string): Promise<number> {
    const lastMessage = await this.messageRepository.findOne({
      where: { threadId },
      order: { sequenceNumber: 'DESC' },
    });
    return (lastMessage?.sequenceNumber || 0) + 1;
  }

  /**
   * Get all child threads (branches) of a parent thread
   */
  async getThreadBranches(parentThreadId: string): Promise<ConversationThread[]> {
    this.logger.debug(`Getting branches for thread: ${parentThreadId}`);

    try {
      const branches = await this.threadRepository.find({
        where: {
          parentThreadId,
          status: ThreadStatus.ACTIVE,
          branchType: ThreadBranchType.BRANCH,
        },
        order: { createdAt: 'ASC' },
      });

      return branches;
    } catch (error) {
      this.logger.error(`Failed to get thread branches: ${parentThreadId}`, error);
      return [];
    }
  }

  /**
   * Get thread hierarchy (parent and all branches)
   */
  async getThreadHierarchy(threadId: string): Promise<{
    root: ConversationThread | null;
    parent: ConversationThread | null;
    current: ConversationThread | null;
    children: ConversationThread[];
    siblings: ConversationThread[];
  }> {
    this.logger.debug(`Getting thread hierarchy for: ${threadId}`);

    try {
      const thread = await this.threadRepository.findOne({
        where: { id: threadId },
        relations: ['parentThread'],
      });

      if (!thread) {
        return {
          root: null,
          parent: null,
          current: null,
          children: [],
          siblings: [],
        };
      }

      // Find root thread
      let root = thread;
      while (root.parentThread) {
        root = await root.parentThread;
      }

      // Get children (direct branches)
      const children = await this.getThreadBranches(threadId);

      // Get siblings (other branches of the same parent)
      let siblings: ConversationThread[] = [];
      if (thread.parentThreadId) {
        const allSiblings = await this.getThreadBranches(thread.parentThreadId);
        siblings = allSiblings.filter((s) => s.id !== threadId);
      }

      // Resolve parent thread if it exists
      const parent = thread.parentThread ? await thread.parentThread : null;

      return {
        root: root.id === thread.id ? thread : root,
        parent,
        current: thread,
        children,
        siblings,
      };
    } catch (error) {
      this.logger.error(`Failed to get thread hierarchy: ${threadId}`, error);
      return {
        root: null,
        parent: null,
        current: null,
        children: [],
        siblings: [],
      };
    }
  }
}
