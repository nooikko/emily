import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationSummaryMemory, ConversationSummaryOptions } from '../../agent/memory/conversation-summary.memory';
import { MetricMemory } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { ConversationThread, ThreadStatus } from '../entities/conversation-thread.entity';
import { MessageSender, ThreadMessage } from '../entities/thread-message.entity';
import { ConversationStateService } from './conversation-state.service';

/**
 * Summarization strategy types for different conversation contexts
 */
export enum SummarizationStrategy {
  /** Quick, basic summarization for short conversations */
  BASIC = 'basic',
  /** Detailed summarization preserving key decisions and context */
  DETAILED = 'detailed',
  /** Technical summarization focusing on code and technical decisions */
  TECHNICAL = 'technical',
  /** Creative summarization for brainstorming sessions */
  CREATIVE = 'creative',
  /** Support-focused summarization for customer service conversations */
  SUPPORT = 'support',
  /** Educational summarization for learning conversations */
  EDUCATIONAL = 'educational',
}

/**
 * Configuration for different summarization strategies
 */
export interface StrategyConfig {
  maxMessagesBeforeSummary: number;
  maxSummaryTokens: number;
  includeSystemMessages: boolean;
  customPrompt: string;
  preserveDetails: string[];
  focusAreas: string[];
}

/**
 * Thread summary metadata for tracking summarization state
 */
export interface ThreadSummaryMetadata {
  lastSummarizedAt: Date;
  messageCountAtLastSummary: number;
  summarizationStrategy: SummarizationStrategy;
  summaryVersion: number;
  keyTopics: string[];
  keyDecisions: string[];
  unresolvedQuestions: string[];
}

/**
 * Summary retrieval options for filtering and searching
 */
export interface SummaryRetrievalOptions {
  includeFullHistory?: boolean;
  maxHistoryMessages?: number;
  filterByTopic?: string[];
  filterByDateRange?: { start: Date; end: Date };
  includeBranchSummaries?: boolean;
}

/**
 * ThreadSummaryService integrates ConversationSummaryMemory with the thread system
 *
 * This service provides:
 * - Automatic conversation summarization based on configurable triggers
 * - Multiple summarization strategies for different conversation types
 * - Summary persistence in thread entities
 * - Summary-based retrieval for long conversations
 * - Cross-thread summary aggregation for merged threads
 */
@Injectable()
export class ThreadSummaryService {
  private readonly logger = new Logger(ThreadSummaryService.name);
  private readonly strategyConfigs: Map<SummarizationStrategy, StrategyConfig>;
  private activeSummarizations = new Set<string>();

  constructor(
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
    @InjectRepository(ThreadMessage)
    private readonly messageRepository: Repository<ThreadMessage>,
    private readonly conversationSummaryMemory: ConversationSummaryMemory,
    private readonly conversationStateService: ConversationStateService,
    @Optional() @Inject('BaseChatModel') private readonly llm?: BaseChatModel,
  ) {
    this.strategyConfigs = this.initializeStrategyConfigs();

    // Initialize ConversationSummaryMemory with LLM if provided
    // Note: We can't directly set the llm property, but it's initialized via constructor
  }

  /**
   * Initialize configuration for different summarization strategies
   */
  private initializeStrategyConfigs(): Map<SummarizationStrategy, StrategyConfig> {
    const configs = new Map<SummarizationStrategy, StrategyConfig>();

    configs.set(SummarizationStrategy.BASIC, {
      maxMessagesBeforeSummary: 20,
      maxSummaryTokens: 300,
      includeSystemMessages: false,
      customPrompt: 'Provide a brief summary of the conversation, focusing on the main topic and outcome:',
      preserveDetails: ['main_topic', 'outcome'],
      focusAreas: ['general'],
    });

    configs.set(SummarizationStrategy.DETAILED, {
      maxMessagesBeforeSummary: 15,
      maxSummaryTokens: 800,
      includeSystemMessages: true,
      customPrompt: 'Create a comprehensive summary preserving all key decisions, action items, and important context:',
      preserveDetails: ['decisions', 'action_items', 'context', 'participants'],
      focusAreas: ['decisions', 'actions', 'context'],
    });

    configs.set(SummarizationStrategy.TECHNICAL, {
      maxMessagesBeforeSummary: 10,
      maxSummaryTokens: 600,
      includeSystemMessages: true,
      customPrompt: 'Summarize the technical discussion, including code snippets, architecture decisions, and implementation details:',
      preserveDetails: ['code', 'architecture', 'implementation', 'technologies', 'errors'],
      focusAreas: ['technical', 'code', 'architecture'],
    });

    configs.set(SummarizationStrategy.CREATIVE, {
      maxMessagesBeforeSummary: 25,
      maxSummaryTokens: 500,
      includeSystemMessages: false,
      customPrompt: 'Capture the creative ideas, brainstorming outcomes, and innovative solutions discussed:',
      preserveDetails: ['ideas', 'concepts', 'solutions', 'alternatives'],
      focusAreas: ['creative', 'brainstorming', 'innovation'],
    });

    configs.set(SummarizationStrategy.SUPPORT, {
      maxMessagesBeforeSummary: 15,
      maxSummaryTokens: 400,
      includeSystemMessages: true,
      customPrompt: 'Summarize the support interaction, including the issue, troubleshooting steps, and resolution:',
      preserveDetails: ['issue', 'steps', 'resolution', 'customer_satisfaction'],
      focusAreas: ['support', 'troubleshooting', 'resolution'],
    });

    configs.set(SummarizationStrategy.EDUCATIONAL, {
      maxMessagesBeforeSummary: 20,
      maxSummaryTokens: 600,
      includeSystemMessages: false,
      customPrompt: 'Summarize the learning conversation, highlighting key concepts, explanations, and understanding checkpoints:',
      preserveDetails: ['concepts', 'explanations', 'examples', 'questions', 'understanding'],
      focusAreas: ['education', 'learning', 'teaching'],
    });

    return configs;
  }

  /**
   * Determine the appropriate summarization strategy based on conversation content
   */
  @TraceAI({
    name: 'thread.determine_strategy',
    operation: 'strategy_selection',
  })
  async determineSummarizationStrategy(threadId: string): Promise<SummarizationStrategy> {
    try {
      const thread = await this.threadRepository.findOne({ where: { id: threadId } });
      if (!thread) {
        return SummarizationStrategy.BASIC;
      }

      // Check thread metadata for hints
      const metadata = thread.metadata;
      if (metadata?.conversationType) {
        switch (metadata.conversationType) {
          case 'technical':
            return SummarizationStrategy.TECHNICAL;
          case 'support':
            return SummarizationStrategy.SUPPORT;
          case 'creative':
            return SummarizationStrategy.CREATIVE;
          case 'educational':
            return SummarizationStrategy.EDUCATIONAL;
        }
      }

      // Analyze tags for strategy hints
      const tags = thread.tags || [];
      if (tags.some((tag) => ['code', 'programming', 'technical', 'debug'].includes(tag.toLowerCase()))) {
        return SummarizationStrategy.TECHNICAL;
      }
      if (tags.some((tag) => ['help', 'support', 'issue', 'problem'].includes(tag.toLowerCase()))) {
        return SummarizationStrategy.SUPPORT;
      }
      if (tags.some((tag) => ['idea', 'brainstorm', 'creative', 'design'].includes(tag.toLowerCase()))) {
        return SummarizationStrategy.CREATIVE;
      }
      if (tags.some((tag) => ['learn', 'teach', 'tutorial', 'explain'].includes(tag.toLowerCase()))) {
        return SummarizationStrategy.EDUCATIONAL;
      }

      // Analyze recent messages for content type
      const recentMessages = await this.messageRepository.find({
        where: { threadId, isDeleted: false },
        order: { createdAt: 'DESC' },
        take: 10,
      });

      const messageContent = (recentMessages || [])
        .map((m) => m.content)
        .join(' ')
        .toLowerCase();

      // Check for technical indicators
      if (messageContent.includes('```') || messageContent.includes('function') || messageContent.includes('error')) {
        return SummarizationStrategy.TECHNICAL;
      }

      // Check for support indicators
      if (messageContent.includes('help') || messageContent.includes('issue') || messageContent.includes('problem')) {
        return SummarizationStrategy.SUPPORT;
      }

      // Default to detailed for longer conversations
      if (thread.messageCount > 30) {
        return SummarizationStrategy.DETAILED;
      }

      return SummarizationStrategy.BASIC;
    } catch (error) {
      this.logger.error(`Failed to determine summarization strategy for thread ${threadId}:`, error);
      return SummarizationStrategy.BASIC;
    }
  }

  /**
   * Summarize a thread's conversation using the appropriate strategy
   */
  @TraceAI({
    name: 'thread.summarize',
    operation: 'conversation_summarization',
  })
  @MetricMemory({
    memoryType: 'thread_summary',
    operation: 'summarize',
    measureDuration: true,
  })
  async summarizeThread(threadId: string, strategy?: SummarizationStrategy, forceUpdate = false): Promise<string> {
    // Prevent concurrent summarizations of the same thread
    if (this.activeSummarizations.has(threadId)) {
      this.logger.warn(`Summarization already in progress for thread ${threadId}`);
      return '';
    }

    this.activeSummarizations.add(threadId);

    try {
      const thread = await this.threadRepository.findOne({ where: { id: threadId } });
      if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
      }

      // Determine strategy if not provided
      const selectedStrategy = strategy || (await this.determineSummarizationStrategy(threadId));
      const config = this.strategyConfigs.get(selectedStrategy)!;

      // Check if summarization is needed
      if (!forceUpdate && !this.shouldSummarize(thread, config)) {
        this.logger.debug(`Thread ${threadId} does not need summarization yet`);
        return thread.summary || '';
      }

      // Get thread messages
      const messages = await this.conversationStateService['getThreadMessages'](threadId);

      // Initialize conversation summary memory for this thread if needed
      if (!this.conversationSummaryMemory.getSummaryState(threadId)) {
        this.conversationSummaryMemory.initializeThread(threadId);
      }

      // Create summarization options from strategy config
      const summaryOptions: ConversationSummaryOptions = {
        maxMessagesBeforeSummary: config.maxMessagesBeforeSummary,
        maxSummaryTokens: config.maxSummaryTokens,
        includeSystemMessages: config.includeSystemMessages,
        customSummaryPrompt: config.customPrompt,
      };

      // Add messages to summary memory
      await this.conversationSummaryMemory.addMessages(threadId, messages, summaryOptions);

      // Force summarization
      const summary = await this.conversationSummaryMemory.forceSummarize(threadId, summaryOptions);

      // Extract key information from summary
      const summaryMetadata = await this.extractSummaryMetadata(summary, selectedStrategy);

      // Update thread with new summary
      thread.summary = summary;
      thread.metadata = {
        ...thread.metadata,
        summaryLastUpdated: new Date().toISOString(),
        summaryMessageCount: thread.messageCount,
        summaryStrategy: selectedStrategy,
        summaryVersion: ((thread.metadata?.summaryVersion as number) || 0) + 1,
        summaryKeyTopics: summaryMetadata.keyTopics?.join(','),
        summaryKeyDecisions: summaryMetadata.keyDecisions?.join('|||'),
        summaryUnresolvedQuestions: summaryMetadata.unresolvedQuestions?.join('|||'),
      };

      await this.threadRepository.save(thread);

      this.logger.debug(`Successfully summarized thread ${threadId} using ${selectedStrategy} strategy`);
      return summary;
    } catch (error) {
      this.logger.error(`Failed to summarize thread ${threadId}:`, error);
      throw error;
    } finally {
      this.activeSummarizations.delete(threadId);
    }
  }

  /**
   * Check if a thread should be summarized based on configuration
   */
  private shouldSummarize(thread: ConversationThread, config: StrategyConfig): boolean {
    const summaryMessageCount = thread.metadata?.summaryMessageCount as number | undefined;

    // No summary exists yet
    if (!thread.summary || !summaryMessageCount) {
      return thread.messageCount >= config.maxMessagesBeforeSummary;
    }

    // Check if enough new messages have been added
    const newMessages = thread.messageCount - summaryMessageCount;
    return newMessages >= config.maxMessagesBeforeSummary;
  }

  /**
   * Extract metadata from summary content
   */
  private async extractSummaryMetadata(summary: string, strategy: SummarizationStrategy): Promise<Partial<ThreadSummaryMetadata>> {
    const metadata: Partial<ThreadSummaryMetadata> = {
      keyTopics: [],
      keyDecisions: [],
      unresolvedQuestions: [],
    };

    // Extract key topics (simple keyword extraction)
    const topics = summary.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    metadata.keyTopics = [...new Set(topics.slice(0, 5))];

    // Extract decisions (look for decision-related keywords)
    if (summary.toLowerCase().includes('decided') || summary.toLowerCase().includes('decision')) {
      const decisionPatterns = summary.match(/(?:decided|decision|agreed|chosen|selected).*?[.!]/gi) || [];
      metadata.keyDecisions = decisionPatterns.slice(0, 3).map((d) => d.trim());
    }

    // Extract unresolved questions
    const questions = summary.match(/\?[^.!?]*[.!?]/g) || [];
    metadata.unresolvedQuestions = questions.slice(0, 3).map((q) => q.trim());

    return metadata;
  }

  /**
   * Retrieve thread context with summary for long conversations
   */
  @TraceAI({
    name: 'thread.retrieve_with_summary',
    operation: 'summary_retrieval',
  })
  async retrieveThreadContextWithSummary(
    threadId: string,
    options: SummaryRetrievalOptions = {},
  ): Promise<{
    summary: string | null;
    recentMessages: BaseMessage[];
    metadata: ThreadSummaryMetadata | null;
    branchSummaries?: Array<{ threadId: string; summary: string }>;
  }> {
    try {
      const thread = await this.threadRepository.findOne({ where: { id: threadId } });
      if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
      }

      // Get summary state from memory
      const summaryState = this.conversationSummaryMemory.getSummaryState(threadId);

      // Get context messages
      const contextMessages = await this.conversationSummaryMemory.getContext(threadId, options.includeFullHistory || false);

      // Get recent messages if requested
      let recentMessages: BaseMessage[] = [];
      if (options.maxHistoryMessages && options.maxHistoryMessages > 0) {
        const messages = await this.conversationStateService['getThreadMessages'](threadId);
        recentMessages = messages.slice(-options.maxHistoryMessages);
      } else {
        recentMessages = summaryState?.pendingMessages || [];
      }

      // Filter by topic if requested
      if (options.filterByTopic && options.filterByTopic.length > 0) {
        const keyTopicsStr = thread.metadata?.summaryKeyTopics as string | undefined;
        if (keyTopicsStr) {
          const keyTopics = keyTopicsStr.split(',');
          const hasMatchingTopic = options.filterByTopic.some((topic) => keyTopics.includes(topic));
          if (!hasMatchingTopic) {
            return {
              summary: null,
              recentMessages: [],
              metadata: null,
            };
          }
        }
      }

      // Get branch summaries if requested
      let branchSummaries: Array<{ threadId: string; summary: string }> | undefined;
      if (options.includeBranchSummaries) {
        const branches = await this.conversationStateService.getThreadBranches(threadId);
        branchSummaries = await Promise.all(
          branches.map(async (branch) => ({
            threadId: branch.id,
            summary: branch.summary || (await this.summarizeThread(branch.id)),
          })),
        );
      }

      // Reconstruct ThreadSummaryMetadata from flat metadata
      const metadata: ThreadSummaryMetadata | null = thread.metadata?.summaryLastUpdated
        ? {
            lastSummarizedAt: new Date(thread.metadata.summaryLastUpdated as string),
            messageCountAtLastSummary: thread.metadata.summaryMessageCount as number,
            summarizationStrategy: thread.metadata.summaryStrategy as SummarizationStrategy,
            summaryVersion: thread.metadata.summaryVersion as number,
            keyTopics: thread.metadata.summaryKeyTopics ? (thread.metadata.summaryKeyTopics as string).split(',') : [],
            keyDecisions: thread.metadata.summaryKeyDecisions ? (thread.metadata.summaryKeyDecisions as string).split('|||') : [],
            unresolvedQuestions: thread.metadata.summaryUnresolvedQuestions
              ? (thread.metadata.summaryUnresolvedQuestions as string).split('|||')
              : [],
          }
        : null;

      return {
        summary: thread.summary || summaryState?.summary || null,
        recentMessages,
        metadata,
        branchSummaries,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve thread context with summary for ${threadId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate summaries from multiple threads (useful for merged threads)
   */
  @TraceAI({
    name: 'thread.aggregate_summaries',
    operation: 'summary_aggregation',
  })
  async aggregateThreadSummaries(threadIds: string[]): Promise<string> {
    try {
      const summaries: string[] = [];

      for (const threadId of threadIds) {
        const thread = await this.threadRepository.findOne({ where: { id: threadId } });
        if (thread?.summary) {
          summaries.push(`Thread "${thread.title}":\n${thread.summary}`);
        }
      }

      if (summaries.length === 0) {
        return 'No summaries available for aggregation.';
      }

      // If we have an LLM, create a meta-summary
      if (this.llm) {
        const aggregationPrompt = `Combine the following thread summaries into a coherent overall summary:\n\n${summaries.join('\n\n')}`;

        const response = await this.llm.invoke([
          { role: 'system', content: 'You are a helpful assistant that creates concise meta-summaries from multiple conversation summaries.' },
          { role: 'user', content: aggregationPrompt },
        ]);

        return response.content.toString();
      }

      // Fallback to simple concatenation
      return summaries.join('\n\n---\n\n');
    } catch (error) {
      this.logger.error('Failed to aggregate thread summaries:', error);
      throw error;
    }
  }

  /**
   * Update summary when threads are merged
   */
  async updateMergedThreadSummary(targetThreadId: string, sourceThreadIds: string[]): Promise<string> {
    try {
      // Get all thread IDs including target
      const allThreadIds = [targetThreadId, ...sourceThreadIds];

      // Aggregate summaries from all threads
      const aggregatedSummary = await this.aggregateThreadSummaries(allThreadIds);

      // Update target thread with aggregated summary
      const targetThread = await this.threadRepository.findOne({ where: { id: targetThreadId } });
      if (targetThread) {
        targetThread.summary = aggregatedSummary;
        targetThread.metadata = {
          ...targetThread.metadata,
          summaryLastUpdated: new Date().toISOString(),
          summaryMessageCount: targetThread.messageCount,
          summaryStrategy: SummarizationStrategy.DETAILED,
          summaryVersion: ((targetThread.metadata?.summaryVersion as number) || 0) + 1,
          summaryKeyTopics: '',
          summaryKeyDecisions: '',
          summaryUnresolvedQuestions: '',
        };

        await this.threadRepository.save(targetThread);
      }

      return aggregatedSummary;
    } catch (error) {
      this.logger.error(`Failed to update merged thread summary for ${targetThreadId}:`, error);
      throw error;
    }
  }

  /**
   * Periodic task to summarize active threads
   */
  @Cron(CronExpression.EVERY_HOUR)
  async periodicSummarization(): Promise<void> {
    this.logger.debug('Starting periodic thread summarization');

    try {
      // Find active threads that might need summarization
      const activeThreads = await this.threadRepository.find({
        where: { status: ThreadStatus.ACTIVE },
        order: { lastActivityAt: 'DESC' },
        take: 100, // Process up to 100 threads at a time
      });

      let summarizedCount = 0;
      for (const thread of activeThreads) {
        const config = this.strategyConfigs.get(SummarizationStrategy.BASIC)!;

        if (this.shouldSummarize(thread, config)) {
          try {
            await this.summarizeThread(thread.id);
            summarizedCount++;
          } catch (error) {
            this.logger.error(`Failed to summarize thread ${thread.id} during periodic task:`, error);
          }
        }
      }

      this.logger.debug(`Periodic summarization completed. Summarized ${summarizedCount} threads.`);
    } catch (error) {
      this.logger.error('Failed to complete periodic summarization:', error);
    }
  }

  /**
   * Get summarization statistics for monitoring
   */
  async getSummarizationStatistics(): Promise<{
    totalThreadsWithSummaries: number;
    averageSummaryLength: number;
    strategiesUsed: Record<SummarizationStrategy, number>;
    lastSummarizationTime: Date | null;
  }> {
    try {
      const threadsWithSummaries = await this.threadRepository.createQueryBuilder('thread').where('thread.summary IS NOT NULL').getMany();

      const stats = {
        totalThreadsWithSummaries: threadsWithSummaries.length,
        averageSummaryLength: 0,
        strategiesUsed: {} as Record<SummarizationStrategy, number>,
        lastSummarizationTime: null as Date | null,
      };

      if (threadsWithSummaries.length > 0) {
        // Calculate average summary length
        const totalLength = threadsWithSummaries.reduce((sum, thread) => sum + (thread.summary?.length || 0), 0);
        stats.averageSummaryLength = Math.round(totalLength / threadsWithSummaries.length);

        // Count strategies used
        for (const thread of threadsWithSummaries) {
          const strategy = (thread.metadata?.summaryStrategy as SummarizationStrategy) || SummarizationStrategy.BASIC;
          stats.strategiesUsed[strategy] = (stats.strategiesUsed[strategy] || 0) + 1;
        }

        // Find most recent summarization
        const mostRecent = threadsWithSummaries.reduce(
          (latest, thread) => {
            const threadTimeStr = thread.metadata?.summaryLastUpdated as string | undefined;
            if (!threadTimeStr) return latest;
            const threadTime = new Date(threadTimeStr);
            if (!latest || threadTime > latest) {
              return threadTime;
            }
            return latest;
          },
          null as Date | null,
        );

        stats.lastSummarizationTime = mostRecent;
      }

      // Get memory statistics from ConversationSummaryMemory
      const memoryStats = this.conversationSummaryMemory.getStatistics();

      this.logger.debug('Summarization statistics:', { ...stats, memoryStats });
      return stats;
    } catch (error) {
      this.logger.error('Failed to get summarization statistics:', error);
      throw error;
    }
  }
}
