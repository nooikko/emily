import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import type { QdrantService } from './qdrant.service';

export interface MemoryDocument {
  content: string;
  metadata: {
    threadId: string;
    messageId?: string;
    timestamp: number;
    messageType: 'user' | 'assistant' | 'system';
    [key: string]: any;
  };
}

/**
 * VectorStoreService provides a high-level abstraction for vector storage operations.
 * It handles conversation memory and document storage using the underlying Qdrant service.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly defaultCollectionName = 'memory';

  constructor(private readonly qdrantService: QdrantService) {}

  /**
   * Stores a memory document in the vector store
   */
  async storeMemory(memory: MemoryDocument): Promise<void> {
    try {
      await this.qdrantService.addDocuments(
        [
          {
            content: memory.content,
            metadata: memory.metadata,
          },
        ],
        this.defaultCollectionName,
      );

      this.logger.debug(`Stored memory for thread ${memory.metadata.threadId}`, {
        contentLength: memory.content.length,
        messageType: memory.metadata.messageType,
      });
    } catch (error) {
      this.logger.error('Failed to store memory:', error);
      throw error;
    }
  }

  /**
   * Stores multiple memory documents in batch
   */
  async storeMemories(memories: MemoryDocument[]): Promise<void> {
    try {
      const documents = memories.map((memory) => ({
        content: memory.content,
        metadata: memory.metadata,
      }));

      await this.qdrantService.addDocuments(documents, this.defaultCollectionName);

      this.logger.debug(`Stored ${memories.length} memories in batch`);
    } catch (error) {
      this.logger.error('Failed to store memories in batch:', error);
      throw error;
    }
  }

  /**
   * Retrieves relevant memories based on similarity search
   */
  async retrieveRelevantMemories(
    query: string,
    threadId?: string,
    options: {
      limit?: number;
      scoreThreshold?: number;
    } = {},
  ): Promise<Document[]> {
    const { limit = 5, scoreThreshold = 0.7 } = options;

    try {
      // Create filter for thread-specific search if threadId is provided
      const filter = threadId ? { threadId } : undefined;

      const results = await this.qdrantService.similaritySearch(query, limit, this.defaultCollectionName, filter);

      // Filter by score threshold and convert to Documents
      const filteredResults = results
        .filter((result) => result.score >= scoreThreshold)
        .map(
          (result) =>
            new Document({
              pageContent: result.content,
              metadata: result.metadata,
            }),
        );

      this.logger.debug(`Retrieved ${filteredResults.length} relevant memories`, {
        query: query.substring(0, 100),
        threadId,
        totalResults: results.length,
        filteredResults: filteredResults.length,
      });

      return filteredResults;
    } catch (error) {
      this.logger.error('Failed to retrieve memories:', error);
      throw error;
    }
  }

  /**
   * Retrieves relevant memories with their similarity scores
   */
  async retrieveRelevantMemoriesWithScore(
    query: string,
    threadId?: string,
    options: {
      limit?: number;
      scoreThreshold?: number;
    } = {},
  ): Promise<[Document, number][]> {
    const { limit = 5, scoreThreshold = 0.7 } = options;

    try {
      // Create filter for thread-specific search if threadId is provided
      const filter = threadId ? { threadId } : undefined;

      const results = await this.qdrantService.similaritySearch(query, limit, this.defaultCollectionName, filter);

      // Filter by score threshold and convert to [Document, score] tuples
      const filteredResults = results
        .filter((result) => result.score >= scoreThreshold)
        .map(
          (result) =>
            [
              new Document({
                pageContent: result.content,
                metadata: result.metadata,
              }),
              result.score,
            ] as [Document, number],
        );

      this.logger.debug(`Retrieved ${filteredResults.length} relevant memories with scores`, {
        query: query.substring(0, 100),
        threadId,
        totalResults: results.length,
        filteredResults: filteredResults.length,
      });

      return filteredResults;
    } catch (error) {
      this.logger.error('Failed to retrieve memories with scores:', error);
      throw error;
    }
  }

  /**
   * Clears memories for a specific thread
   */
  async clearThreadMemories(threadId: string): Promise<void> {
    try {
      // Note: This would need to be implemented in QdrantService as a filtered delete
      // For now, we'll log a warning
      this.logger.warn(`Clear thread memories not yet implemented for thread ${threadId}`);
    } catch (error) {
      this.logger.error(`Failed to clear memories for thread ${threadId}:`, error);
      throw error;
    }
  }

  /**
   * Gets the health status of the vector store
   */
  async getHealthStatus(): Promise<{
    available: boolean;
    connected?: boolean;
    error?: string;
  }> {
    return this.qdrantService.getHealthStatus();
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    this.logger.log('Cleaning up Vector Store service...');
    await this.qdrantService.cleanup();
  }
}
