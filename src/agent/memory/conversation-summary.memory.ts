import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable, Logger } from '@nestjs/common';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { MetricMemory } from '../../observability/decorators/metric.decorator';

/**
 * Options for conversation summarization
 */
export interface ConversationSummaryOptions {
  /** Maximum number of messages to keep in raw form before summarizing */
  maxMessagesBeforeSummary?: number;
  /** Maximum tokens in summary (approximate) */
  maxSummaryTokens?: number;
  /** Whether to include system messages in summary */
  includeSystemMessages?: boolean;
  /** Custom prompt for summarization */
  customSummaryPrompt?: string;
}

/**
 * Conversation summary state
 */
export interface ConversationSummaryState {
  /** Current summary of the conversation */
  summary: string;
  /** Number of messages summarized */
  messagesSummarized: number;
  /** Timestamp of last summary update */
  lastSummaryUpdate: number;
  /** Raw messages that haven't been summarized yet */
  pendingMessages: BaseMessage[];
}

/**
 * ConversationSummaryMemory implementation for LangChain
 * This memory type progressively summarizes conversations to maintain context
 * while reducing token usage for long conversations.
 */
@Injectable()
export class ConversationSummaryMemory {
  private readonly logger = new Logger(ConversationSummaryMemory.name);
  private summaryStates: Map<string, ConversationSummaryState> = new Map();
  private readonly defaultOptions: Required<ConversationSummaryOptions> = {
    maxMessagesBeforeSummary: 10,
    maxSummaryTokens: 500,
    includeSystemMessages: false,
    customSummaryPrompt: `Summarize the following conversation, preserving key information, decisions, and context:`,
  };

  constructor(private readonly llm?: BaseChatModel) {}

  /**
   * Initialize or reset summary state for a thread
   */
  initializeThread(threadId: string): void {
    this.summaryStates.set(threadId, {
      summary: '',
      messagesSummarized: 0,
      lastSummaryUpdate: Date.now(),
      pendingMessages: [],
    });
    this.logger.debug(`Initialized conversation summary for thread ${threadId}`);
  }

  /**
   * Get the current summary state for a thread
   */
  getSummaryState(threadId: string): ConversationSummaryState | undefined {
    return this.summaryStates.get(threadId);
  }

  /**
   * Add messages to the conversation and potentially trigger summarization
   */
  @TraceAI({
    name: 'memory.add_to_summary',
    operation: 'memory_summarize',
  })
  @MetricMemory({
    memoryType: 'summary',
    operation: 'add',
    measureDuration: true,
  })
  async addMessages(
    threadId: string,
    messages: BaseMessage[],
    options: ConversationSummaryOptions = {},
  ): Promise<void> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // Initialize if needed
    if (!this.summaryStates.has(threadId)) {
      this.initializeThread(threadId);
    }

    const state = this.summaryStates.get(threadId)!;
    
    // Filter messages based on options
    const filteredMessages = mergedOptions.includeSystemMessages
      ? messages
      : messages.filter(msg => !(msg instanceof SystemMessage));

    // Add to pending messages
    state.pendingMessages.push(...filteredMessages);

    // Check if we should summarize
    if (state.pendingMessages.length >= mergedOptions.maxMessagesBeforeSummary) {
      await this.summarizeConversation(threadId, mergedOptions);
    }

    this.logger.debug(`Added ${filteredMessages.length} messages to thread ${threadId}`, {
      pendingCount: state.pendingMessages.length,
      shouldSummarize: state.pendingMessages.length >= mergedOptions.maxMessagesBeforeSummary,
    });
  }

  /**
   * Force summarization of pending messages
   */
  @TraceAI({
    name: 'memory.force_summarize',
    operation: 'memory_summarize',
  })
  async forceSummarize(
    threadId: string,
    options: ConversationSummaryOptions = {},
  ): Promise<string> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    return await this.summarizeConversation(threadId, mergedOptions);
  }

  /**
   * Perform the actual summarization
   */
  private async summarizeConversation(
    threadId: string,
    options: Required<ConversationSummaryOptions>,
  ): Promise<string> {
    const state = this.summaryStates.get(threadId);
    if (!state || state.pendingMessages.length === 0) {
      return state?.summary || '';
    }

    if (!this.llm) {
      this.logger.warn('No LLM provided for summarization, concatenating messages instead');
      return this.fallbackSummarization(state);
    }

    try {
      // Prepare the conversation for summarization
      const conversationText = this.formatMessagesForSummary(state.pendingMessages);
      
      // Create the summarization prompt
      const summaryPrompt = state.summary
        ? `${options.customSummaryPrompt}\n\nPrevious summary:\n${state.summary}\n\nNew messages:\n${conversationText}\n\nProvide an updated summary that incorporates both the previous summary and new messages:`
        : `${options.customSummaryPrompt}\n\n${conversationText}`;

      // Call LLM for summarization
      const response = await this.llm.invoke([
        new SystemMessage('You are a helpful assistant that creates concise conversation summaries.'),
        new HumanMessage(summaryPrompt),
      ]);

      // Update state
      const newSummary = response.content.toString();
      state.summary = newSummary;
      state.messagesSummarized += state.pendingMessages.length;
      state.pendingMessages = [];
      state.lastSummaryUpdate = Date.now();

      this.logger.debug(`Summarized ${state.messagesSummarized} messages for thread ${threadId}`);
      return newSummary;
    } catch (error) {
      this.logger.error('Failed to summarize conversation with LLM', error);
      return this.fallbackSummarization(state);
    }
  }

  /**
   * Fallback summarization when LLM is not available
   */
  private fallbackSummarization(state: ConversationSummaryState): string {
    const messagesText = this.formatMessagesForSummary(state.pendingMessages);
    
    // Simple concatenation with truncation
    const combinedText = state.summary
      ? `${state.summary}\n\n${messagesText}`
      : messagesText;

    // Update state
    state.summary = combinedText.substring(0, 2000); // Truncate to prevent unlimited growth
    state.messagesSummarized += state.pendingMessages.length;
    state.pendingMessages = [];
    state.lastSummaryUpdate = Date.now();

    return state.summary;
  }

  /**
   * Format messages for summary
   */
  private formatMessagesForSummary(messages: BaseMessage[]): string {
    return messages
      .map(msg => {
        const role = msg instanceof HumanMessage ? 'Human' : msg instanceof AIMessage ? 'AI' : 'System';
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n');
  }

  /**
   * Get context for the agent including summary and recent messages
   */
  @TraceAI({
    name: 'memory.get_summary_context',
    operation: 'memory_retrieve',
  })
  async getContext(
    threadId: string,
    includeRecentMessages = true,
  ): Promise<BaseMessage[]> {
    const state = this.summaryStates.get(threadId);
    if (!state) {
      return [];
    }

    const contextMessages: BaseMessage[] = [];

    // Add summary as a system message if exists
    if (state.summary) {
      contextMessages.push(
        new SystemMessage(
          `Previous conversation summary (${state.messagesSummarized} messages):\n${state.summary}`,
        ),
      );
    }

    // Add recent pending messages if requested
    if (includeRecentMessages && state.pendingMessages.length > 0) {
      contextMessages.push(...state.pendingMessages);
    }

    return contextMessages;
  }

  /**
   * Clear summary for a thread
   */
  clearThread(threadId: string): void {
    this.summaryStates.delete(threadId);
    this.logger.debug(`Cleared conversation summary for thread ${threadId}`);
  }

  /**
   * Get statistics about summaries
   */
  getStatistics(): {
    totalThreads: number;
    totalMessagesSummarized: number;
    averageMessagesPerThread: number;
  } {
    const threads = Array.from(this.summaryStates.values());
    const totalMessages = threads.reduce((sum, state) => sum + state.messagesSummarized, 0);
    
    return {
      totalThreads: threads.length,
      totalMessagesSummarized: totalMessages,
      averageMessagesPerThread: threads.length > 0 ? totalMessages / threads.length : 0,
    };
  }
}