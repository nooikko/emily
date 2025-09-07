import { Document } from '@langchain/core/documents';
import type { Logger } from '@nestjs/common';
import type { QdrantService } from '../qdrant.service';
import { VectorStoreService } from '../vector-store.service';

// Mock QdrantService type for better type safety while maintaining test flexibility
type MockQdrantService = {
  addDocuments: jest.MockedFunction<(docs: readonly unknown[], collection: string) => Promise<void>>;
  similaritySearch: jest.MockedFunction<(query: string, k: number, collection: string, options?: unknown) => Promise<unknown[]>>;
  getHealthStatus: jest.MockedFunction<() => Promise<unknown>>;
  cleanup: jest.MockedFunction<() => Promise<void>>;
} & Record<string, unknown>;

// Type for accessing protected properties in tests
interface VectorStoreServiceTestAccess {
  logger: Logger;
}

describe('VectorStoreService - Retrieval Operations', () => {
  let service: VectorStoreService;
  let mockQdrantService: MockQdrantService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock QdrantService with proper typing
    mockQdrantService = {
      addDocuments: jest.fn(),
      similaritySearch: jest.fn(),
      getHealthStatus: jest.fn(),
      cleanup: jest.fn(),
    } as MockQdrantService;

    // Create service directly with mock
    service = new VectorStoreService(mockQdrantService as unknown as QdrantService);

    // Mock console methods to avoid output during tests
    jest.spyOn(console, 'debug').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  describe('retrieveRelevantMemories', () => {
    const mockSearchResults = [
      {
        content: 'Relevant memory 1',
        metadata: { threadId: 'thread-123', messageType: 'user' },
        score: 0.95,
      },
      {
        content: 'Relevant memory 2',
        metadata: { threadId: 'thread-123', messageType: 'assistant' },
        score: 0.85,
      },
      {
        content: 'Low relevance memory',
        metadata: { threadId: 'thread-123', messageType: 'user' },
        score: 0.65,
      },
    ];

    it('should retrieve relevant memories without thread filter', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemories('test query');

      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith('test query', 5, 'memory', undefined);
      expect(results).toHaveLength(2); // Only results above 0.7 threshold
      expect(results[0]).toBeInstanceOf(Document);
      expect(results[0].pageContent).toBe('Relevant memory 1');
    });

    it('should retrieve memories with thread filter', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      await service.retrieveRelevantMemories('test query', 'thread-123');

      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith('test query', 5, 'memory', { filter: { threadId: 'thread-123' } });
    });

    it('should apply custom limit and score threshold', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemories('test query', 'thread-123', {
        limit: 10,
        scoreThreshold: 0.9,
      });

      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith('test query', 10, 'memory', { filter: { threadId: 'thread-123' } });
      expect(results).toHaveLength(1); // Only one result above 0.9 threshold
      expect(results[0].pageContent).toBe('Relevant memory 1');
    });

    it('should return empty array when no results meet threshold', async () => {
      const lowScoreResults = mockSearchResults.map((result) => ({ ...result, score: 0.5 }));
      mockQdrantService.similaritySearch.mockResolvedValueOnce(lowScoreResults);

      const results = await service.retrieveRelevantMemories('test query');

      expect(results).toHaveLength(0);
    });

    it('should log retrieval debug information', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);
      const debugSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'debug');

      await service.retrieveRelevantMemories('test query', 'thread-123');

      expect(debugSpy).toHaveBeenCalledWith('Retrieved 2 relevant memories', {
        query: 'test query',
        threadId: 'thread-123',
        totalResults: 3,
        filteredResults: 2,
      });
    });

    it('should truncate long queries in debug logs', async () => {
      const longQuery = 'a'.repeat(200);
      mockQdrantService.similaritySearch.mockResolvedValueOnce([]);
      const debugSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'debug');

      await service.retrieveRelevantMemories(longQuery);

      expect(debugSpy).toHaveBeenCalledWith(
        'Retrieved 0 relevant memories',
        expect.objectContaining({
          query: longQuery.substring(0, 100),
        }),
      );
    });

    it('should handle retrieval errors', async () => {
      const retrievalError = new Error('Search failed');
      mockQdrantService.similaritySearch.mockRejectedValueOnce(retrievalError);
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      await expect(service.retrieveRelevantMemories('test query')).rejects.toThrow('Search failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to retrieve memories:', retrievalError);
    });

    it('should convert results to Document objects with correct structure', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce([mockSearchResults[0]]);

      const results = await service.retrieveRelevantMemories('test query');

      expect(results[0]).toBeInstanceOf(Document);
      expect(results[0].pageContent).toBe('Relevant memory 1');
      expect(results[0].metadata).toEqual({
        threadId: 'thread-123',
        messageType: 'user',
      });
    });
  });

  describe('retrieveRelevantMemoriesWithScore', () => {
    const mockSearchResults = [
      {
        content: 'High score memory',
        metadata: { threadId: 'thread-123' },
        score: 0.95,
      },
      {
        content: 'Medium score memory',
        metadata: { threadId: 'thread-123' },
        score: 0.8,
      },
    ];

    it('should return memories with scores as tuples', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemoriesWithScore('test query');

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(2); // [Document, score] tuple
      expect(results[0][0]).toBeInstanceOf(Document);
      expect(results[0][1]).toBe(0.95);
      expect(results[1][1]).toBe(0.8);
    });

    it('should apply score threshold correctly', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemoriesWithScore('test query', 'thread-123', {
        scoreThreshold: 0.9,
      });

      expect(results).toHaveLength(1);
      expect(results[0][1]).toBe(0.95);
    });

    it('should log debug information with scores', async () => {
      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);
      const debugSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'debug');

      await service.retrieveRelevantMemoriesWithScore('test query');

      expect(debugSpy).toHaveBeenCalledWith(
        'Retrieved 2 relevant memories with scores',
        expect.objectContaining({
          totalResults: 2,
          filteredResults: 2,
        }),
      );
    });

    it('should handle errors in score retrieval', async () => {
      const retrievalError = new Error('Score retrieval failed');
      mockQdrantService.similaritySearch.mockRejectedValueOnce(retrievalError);
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      await expect(service.retrieveRelevantMemoriesWithScore('test')).rejects.toThrow('Score retrieval failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to retrieve memories with scores:', retrievalError);
    });
  });
});
