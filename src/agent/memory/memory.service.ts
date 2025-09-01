import type { Document } from '@langchain/core/documents';
import type { BaseMessage } from '@langchain/core/messages';
import { SystemMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import * as dotenv from 'dotenv';
import type { MemoryDocument as VectorMemoryDocument, VectorStoreService } from '../../vectors/services/vector-store.service';
import type {
  BuildContextOptions,
  HybridMemoryConfig,
  HybridMemoryServiceInterface,
  MemoryHealthStatus,
  RetrievedMemory,
  RetrieveMemoryOptions,
  StoreMemoryOptions,
} from './types';
import { isHumanMessage, isSystemMessage } from './types';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

/**
 * MemoryService combines PostgreSQL checkpointing with Qdrant semantic memory.
 *
 * - PostgreSQL checkpointer: Manages conversation state and immediate context
 * - Qdrant: Stores semantic memories for long-term context retrieval
 *
 * This service provides a unified interface for both memory systems and handles
 * the automatic storage and retrieval of conversation context.
 */
@Injectable()
export class MemoryService implements OnModuleInit, OnModuleDestroy, HybridMemoryServiceInterface {
  private readonly logger = new Logger(MemoryService.name);
  private readonly config: HybridMemoryConfig;
  private readonly postgresCheckpointer: PostgresSaver;

  constructor(private readonly vectorStoreService: VectorStoreService) {
    this.config = this.loadConfig();
    this.postgresCheckpointer = this.createPostgresMemory();
  }

  /**
   * Creates a PostgresSaver instance using environment variables
   * @returns PostgresSaver instance
   */
  private createPostgresMemory(): PostgresSaver {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5433';
    const username = process.env.DB_USERNAME || 'postgres';
    const password = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_NAME || 'agent_db';

    const connectionString = `postgresql://${username}:${password}@${host}:${port}/${dbName}${
      process.env.DB_SSLMODE ? `?sslmode=${process.env.DB_SSLMODE}` : ''
    }`;

    return PostgresSaver.fromConnString(connectionString);
  }

  async onModuleInit() {
    if (this.config.enableSemanticMemory) {
      try {
        // VectorStoreService initializes automatically via OnModuleInit
        this.logger.log('Memory service initialized with semantic memory enabled');
      } catch (error) {
        this.logger.warn('Failed to initialize semantic memory, continuing with checkpointing only:', error);
        this.config.enableSemanticMemory = false;
      }
    } else {
      this.logger.log('Memory service initialized with checkpointing only');
    }
  }

  async onModuleDestroy() {
    if (this.config.enableSemanticMemory) {
      await this.vectorStoreService.cleanup();
    }
  }

  private loadConfig(): HybridMemoryConfig {
    return {
      enableSemanticMemory: process.env.ENABLE_SEMANTIC_MEMORY !== 'false',
      maxMessagesForMemory: Number.parseInt(process.env.MAX_MESSAGES_FOR_MEMORY || '50', 10),
      memoryRetrievalThreshold: Number.parseFloat(process.env.MEMORY_RETRIEVAL_THRESHOLD || '0.7'),
      memoryBatchSize: Number.parseInt(process.env.MEMORY_BATCH_SIZE || '5', 10),
    };
  }

  /**
   * Stores conversation messages in semantic memory for long-term retrieval
   */
  async storeConversationMemory(messages: BaseMessage[], threadId: string, options: StoreMemoryOptions = {}): Promise<void> {
    if (!this.config.enableSemanticMemory || !messages.length) {
      return;
    }

    try {
      const memoryDocuments: VectorMemoryDocument[] = [];
      const timestamp = Date.now();

      for (const message of messages) {
        // Skip system messages from memory storage
        if (isSystemMessage(message)) {
          continue;
        }

        const messageType: 'user' | 'assistant' | 'system' = isHumanMessage(message) ? 'user' : 'assistant';
        const messageContent = (message as any).content;
        const content: string =
          typeof messageContent === 'string'
            ? messageContent
            : Array.isArray(messageContent)
              ? messageContent.map((c: any) => (typeof c === 'string' ? c : JSON.stringify(c))).join(' ')
              : JSON.stringify(messageContent);

        // Only store meaningful messages (not empty or too short)
        if (content && content.trim().length > 10) {
          memoryDocuments.push({
            content,
            metadata: {
              threadId,
              timestamp,
              messageType,
              importance: options.importance,
              summary: options.generateSummary && content.length > 500 ? `${content.substring(0, 100)}...` : undefined,
              tags: options.tags,
            },
          });
        }
      }

      if (memoryDocuments.length > 0) {
        if (options.batchStore) {
          await this.vectorStoreService.storeMemories(memoryDocuments);
        } else {
          for (const memory of memoryDocuments) {
            await this.vectorStoreService.storeMemory(memory);
          }
        }

        this.logger.debug(`Stored ${memoryDocuments.length} messages in semantic memory for thread ${threadId}`);
      }
    } catch (error) {
      this.logger.error('Failed to store conversation memory:', error);
      // Don't throw - memory storage failures shouldn't break the conversation
    }
  }

  /**
   * Retrieves relevant memories based on the current conversation context
   */
  async retrieveRelevantMemories(query: string, threadId: string, options: RetrieveMemoryOptions = {}): Promise<RetrievedMemory[]> {
    if (!this.config.enableSemanticMemory) {
      return [];
    }

    const { limit = this.config.memoryBatchSize, includeGlobalMemories = false, minRelevanceScore = this.config.memoryRetrievalThreshold } = options;

    try {
      // First, try to get thread-specific memories with scores
      let memoriesWithScores = await this.vectorStoreService.retrieveRelevantMemoriesWithScore(query, threadId, {
        limit,
        scoreThreshold: minRelevanceScore,
      });

      // If not enough thread-specific memories and global search is enabled
      if (memoriesWithScores.length < limit && includeGlobalMemories) {
        const globalMemoriesWithScores = await this.vectorStoreService.retrieveRelevantMemoriesWithScore(
          query,
          undefined, // No thread filter
          {
            limit: limit - memoriesWithScores.length,
            scoreThreshold: minRelevanceScore * 0.9, // Slightly lower threshold for global
          },
        );

        memoriesWithScores = [...memoriesWithScores, ...globalMemoriesWithScores];
      }

      const retrievedMemories: RetrievedMemory[] = memoriesWithScores.map(([doc, score]: [Document, number]) => ({
        content: doc.pageContent,
        relevanceScore: Math.max(0, Math.min(1, score)), // Normalize score to 0-1 range
        timestamp: doc.metadata.timestamp || Date.now(),
        messageType: doc.metadata.messageType || 'assistant',
      }));

      this.logger.debug(`Retrieved ${retrievedMemories.length} relevant memories for query`, {
        queryLength: query.length,
        threadId,
        totalMemories: retrievedMemories.length,
      });

      return retrievedMemories;
    } catch (error) {
      this.logger.error('Failed to retrieve memories:', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Gets the conversation history from checkpointer
   */
  async getConversationHistory(threadId: string): Promise<BaseMessage[]> {
    try {
      const history = await this.postgresCheckpointer.get({
        configurable: { thread_id: threadId },
      });

      return Array.isArray(history?.channel_values?.messages) ? history.channel_values.messages : [];
    } catch (error) {
      this.logger.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Creates a context-enriched message list by combining checkpointer history
   * with relevant semantic memories
   */
  async buildEnrichedContext(currentMessages: BaseMessage[], threadId: string, options: BuildContextOptions = {}): Promise<BaseMessage[]> {
    const { maxHistoryMessages = 20, includeSemanticMemories = true, semanticQuery } = options;

    try {
      // Get recent conversation history from checkpointer
      const history = await this.getConversationHistory(threadId);
      const recentHistory = history.slice(-maxHistoryMessages);

      // Build the query for semantic memory retrieval
      let query = semanticQuery;
      if (!query && currentMessages.length > 0) {
        const lastMessage = currentMessages[currentMessages.length - 1];
        const messageContent = (lastMessage as any).content;
        query = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
      }

      const enrichedMessages: BaseMessage[] = [...recentHistory];

      // Add semantic memories if enabled and we have a query
      if (includeSemanticMemories && query && this.config.enableSemanticMemory) {
        const relevantMemories = await this.retrieveRelevantMemories(query, threadId, { includeGlobalMemories: true });

        if (relevantMemories.length > 0) {
          // Create a system message with the relevant memories
          const memoryContext = relevantMemories.map((memory) => `[${new Date(memory.timestamp).toISOString()}] ${memory.content}`).join('\n\n');

          const memorySystemMessage = new SystemMessage(
            `Relevant context from previous conversations:\n\n${memoryContext}\n\nUse this context to provide more informed and consistent responses.`,
          );

          enrichedMessages.unshift(memorySystemMessage);
        }
      }

      // Add current messages
      enrichedMessages.push(...currentMessages);

      this.logger.debug(`Built enriched context with ${enrichedMessages.length} messages`, {
        historyMessages: recentHistory.length,
        semanticMemories: includeSemanticMemories ? 'enabled' : 'disabled',
        threadId,
      });

      return enrichedMessages;
    } catch (error) {
      this.logger.error('Failed to build enriched context, using current messages only:', error);
      return currentMessages;
    }
  }

  /**
   * Processes new messages after agent response to update memory systems
   */
  async processNewMessages(messages: BaseMessage[], threadId: string, options: StoreMemoryOptions = {}): Promise<void> {
    const { batchStore = true, importance } = options;

    // Store in semantic memory by default
    await this.storeConversationMemory(messages, threadId, {
      batchStore,
      importance,
    });

    // Checkpointer storage is handled automatically by the agent
  }

  /**
   * Clears all memories for a specific thread
   */
  async clearThreadMemories(threadId: string): Promise<void> {
    try {
      // Clear semantic memories
      if (this.config.enableSemanticMemory) {
        await this.vectorStoreService.clearThreadMemories(threadId);
      }

      // Clear checkpointer state - this is more complex as it requires accessing
      // the specific checkpoint configuration. For now, we log the intention.
      this.logger.warn(`Manual checkpointer clearing not implemented for thread ${threadId}`);

      this.logger.log(`Cleared memories for thread ${threadId}`);
    } catch (error) {
      this.logger.error(`Failed to clear memories for thread ${threadId}:`, error);
      throw error;
    }
  }

  /**
   * Gets the health status of both memory systems
   */
  async getHealthStatus(): Promise<MemoryHealthStatus> {
    const lastChecked = Date.now();
    const status: MemoryHealthStatus = {
      checkpointer: {
        available: false,
        lastChecked,
      },
      semantic: {
        available: false,
        lastChecked,
      },
    };

    // Test checkpointer
    try {
      await this.postgresCheckpointer.get({ configurable: { thread_id: 'health-check' } });
      status.checkpointer = {
        available: true,
        lastChecked,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      status.checkpointer = {
        available: false,
        error: errorMessage,
        lastChecked,
      };
    }

    // Test semantic memory
    if (this.config.enableSemanticMemory) {
      try {
        const vectorHealth = await this.vectorStoreService.getHealthStatus();
        status.semantic = {
          available: vectorHealth.available,
          connected: vectorHealth.connected,
          error: vectorHealth.error,
          lastChecked: lastChecked,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        status.semantic = {
          available: false,
          error: errorMessage,
          lastChecked,
        };
      }
    }

    return status;
  }

  /**
   * Gets the Vector Store service for direct access when needed
   */
  getVectorStoreService(): VectorStoreService {
    return this.vectorStoreService;
  }

  /**
   * Gets the configuration
   */
  getConfig(): HybridMemoryConfig {
    return { ...this.config };
  }
}
