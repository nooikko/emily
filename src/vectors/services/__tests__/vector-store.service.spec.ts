import { Document } from '@langchain/core/documents';
import type { Logger } from '@nestjs/common';
import type { QdrantService } from '../qdrant.service';
import { type MemoryDocument, VectorStoreService } from '../vector-store.service';

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

describe('VectorStoreService', () => {
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

  describe('storeMemory', () => {
    const mockMemory: MemoryDocument = {
      content: 'Test memory content',
      metadata: {
        threadId: 'thread-123',
        messageId: 'msg-456',
        timestamp: Date.now(),
        messageType: 'user',
      },
    };

    it('should store a single memory document successfully', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(mockMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: mockMemory.content,
            metadata: mockMemory.metadata,
          },
        ],
        'memory',
      );
    });

    it('should log successful memory storage with debug info', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);
      const debugSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'debug');

      await service.storeMemory(mockMemory);

      expect(debugSpy).toHaveBeenCalledWith(`Stored memory for thread ${mockMemory.metadata.threadId}`, {
        contentLength: mockMemory.content.length,
        messageType: mockMemory.metadata.messageType,
      });
    });

    it('should handle storage errors and rethrow them', async () => {
      const storageError = new Error('Failed to store document');
      mockQdrantService.addDocuments.mockRejectedValueOnce(storageError);
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      await expect(service.storeMemory(mockMemory)).rejects.toThrow('Failed to store document');
      expect(errorSpy).toHaveBeenCalledWith('Failed to store memory:', storageError);
    });

    it('should work with different message types', async () => {
      const assistantMemory: MemoryDocument = {
        content: 'Assistant response',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'assistant',
        },
      };
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(assistantMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith([expect.objectContaining({ content: 'Assistant response' })], 'memory');
    });

    it('should preserve readonly metadata properties', async () => {
      const memoryWithCustomMetadata: MemoryDocument = {
        content: 'Test content',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'system',
          customProperty: 'custom value',
          numericProperty: 42,
          booleanProperty: true,
        },
      };
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(memoryWithCustomMetadata);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            metadata: expect.objectContaining({
              customProperty: 'custom value',
              numericProperty: 42,
              booleanProperty: true,
            }),
          }),
        ],
        'memory',
      );
    });
  });

  describe('storeMemories', () => {
    const mockMemories: MemoryDocument[] = [
      {
        content: 'First memory',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'user',
        },
      },
      {
        content: 'Second memory',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now() + 1000,
          messageType: 'assistant',
        },
      },
    ];

    it('should store multiple memories in batch', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemories(mockMemories);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: 'First memory',
            metadata: mockMemories[0].metadata,
          },
          {
            content: 'Second memory',
            metadata: mockMemories[1].metadata,
          },
        ],
        'memory',
      );
    });

    it('should log batch storage success', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);
      const debugSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'debug');

      await service.storeMemories(mockMemories);

      expect(debugSpy).toHaveBeenCalledWith('Stored 2 memories in batch');
    });

    it('should handle empty memories array', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemories([]);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith([], 'memory');
    });

    it('should handle batch storage errors', async () => {
      const batchError = new Error('Batch storage failed');
      mockQdrantService.addDocuments.mockRejectedValueOnce(batchError);
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      await expect(service.storeMemories(mockMemories)).rejects.toThrow('Batch storage failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to store memories in batch:', batchError);
    });
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

  describe('clearThreadMemories', () => {
    it('should log warning for unimplemented functionality', async () => {
      const warnSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'warn');

      await service.clearThreadMemories('thread-123');

      expect(warnSpy).toHaveBeenCalledWith('Clear thread memories not yet implemented for thread thread-123');
    });

    it('should handle errors in clear operation', async () => {
      // Mock logger.warn to throw an error to simulate a future implementation
      jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'warn').mockImplementationOnce(() => {
        throw new Error('Clear operation failed');
      });
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      await expect(service.clearThreadMemories('thread-123')).rejects.toThrow('Clear operation failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to clear memories for thread thread-123:', expect.any(Error));
    });
  });

  describe('getHealthStatus', () => {
    it('should delegate to QdrantService health check', async () => {
      const mockHealthStatus = {
        available: true,
        connected: true,
      };
      mockQdrantService.getHealthStatus.mockResolvedValueOnce(mockHealthStatus);

      const result = await service.getHealthStatus();

      expect(mockQdrantService.getHealthStatus).toHaveBeenCalled();
      expect(result).toEqual(mockHealthStatus);
    });

    it('should return error status from QdrantService', async () => {
      const mockErrorStatus = {
        available: false,
        connected: false,
        error: 'Connection failed',
      };
      mockQdrantService.getHealthStatus.mockResolvedValueOnce(mockErrorStatus);

      const result = await service.getHealthStatus();

      expect(result).toEqual(mockErrorStatus);
    });
  });

  describe('cleanup', () => {
    it('should delegate cleanup to QdrantService', async () => {
      mockQdrantService.cleanup.mockResolvedValueOnce(undefined);
      const logSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'log');

      await service.cleanup();

      expect(logSpy).toHaveBeenCalledWith('Cleaning up Vector Store service...');
      expect(mockQdrantService.cleanup).toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      const cleanupError = new Error('Cleanup failed');
      mockQdrantService.cleanup.mockRejectedValueOnce(cleanupError);

      await expect(service.cleanup()).rejects.toThrow('Cleanup failed');
    });
  });

  describe('MemoryDocument interface compliance', () => {
    it('should work with readonly properties', () => {
      const memory: MemoryDocument = {
        content: 'test content',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      // This test verifies that the interface allows readonly properties
      expect(memory.content).toBe('test content');
      expect(memory.metadata.threadId).toBe('thread-123');
      expect(memory.metadata.messageType).toBe('user');
    });

    it('should support optional messageId in metadata', async () => {
      const memoryWithoutMessageId: MemoryDocument = {
        content: 'test content',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'system',
        },
      };
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(memoryWithoutMessageId);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            metadata: expect.not.objectContaining({
              messageId: expect.anything(),
            }),
          }),
        ],
        'memory',
      );
    });

    it('should support extended metadata properties', async () => {
      const extendedMemory: MemoryDocument = {
        content: 'test content',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'user',
          customField: 'custom value',
          customNumber: 42,
        },
      };
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(extendedMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            metadata: expect.objectContaining({
              customField: 'custom value',
              customNumber: 42,
            }),
          }),
        ],
        'memory',
      );
    });
  });

  describe('default collection name', () => {
    it('should use "memory" as default collection name for all operations', async () => {
      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);
      mockQdrantService.similaritySearch.mockResolvedValueOnce([]);

      const memory: MemoryDocument = {
        content: 'test',
        metadata: {
          threadId: 'thread-123',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      await service.storeMemory(memory);
      await service.retrieveRelevantMemories('query');

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(expect.any(Array), 'memory');
      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 'memory', undefined);
    });
  });

  describe('LangSmith tracing integration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment variables for each test
      process.env = { ...originalEnv };
      delete process.env.LANGSMITH_TRACING;
      delete process.env.LANGSMITH_API_KEY;
      delete process.env.LANGCHAIN_PROJECT;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should work with LangSmith tracing enabled', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-langsmith-key';
      process.env.LANGCHAIN_PROJECT = 'vector-store-project';

      const mockMemory: MemoryDocument = {
        content: 'Memory with LangSmith tracing enabled',
        metadata: {
          threadId: 'langsmith-thread-123',
          messageId: 'langsmith-msg-456',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(mockMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: mockMemory.content,
            metadata: mockMemory.metadata,
          },
        ],
        'memory',
      );

      // Verify LangSmith environment variables are available for tracing
      expect(process.env.LANGSMITH_TRACING).toBe('true');
      expect(process.env.LANGSMITH_API_KEY).toBe('test-langsmith-key');
      expect(process.env.LANGCHAIN_PROJECT).toBe('vector-store-project');
    });

    it('should handle memory retrieval with LangSmith tracing', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'retrieval-project';

      const mockSearchResults = [
        {
          content: 'Traced memory result',
          metadata: { threadId: 'traced-thread', messageType: 'assistant' },
          score: 0.95,
        },
      ];

      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemories('traced query', 'traced-thread');

      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith('traced query', 5, 'memory', { filter: { threadId: 'traced-thread' } });
      expect(results).toHaveLength(1);
      expect(results[0].pageContent).toBe('Traced memory result');
    });

    it('should handle batch operations with LangSmith tracing', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'batch-project';

      const mockMemories: MemoryDocument[] = [
        {
          content: 'First traced memory',
          metadata: {
            threadId: 'batch-thread',
            timestamp: Date.now(),
            messageType: 'user',
          },
        },
        {
          content: 'Second traced memory',
          metadata: {
            threadId: 'batch-thread',
            timestamp: Date.now() + 1000,
            messageType: 'assistant',
          },
        },
      ];

      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemories(mockMemories);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: 'First traced memory',
            metadata: mockMemories[0].metadata,
          },
          {
            content: 'Second traced memory',
            metadata: mockMemories[1].metadata,
          },
        ],
        'memory',
      );
    });

    it('should work with data masking when LangSmith security flags are set', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'security-project';
      process.env.LANGSMITH_HIDE_INPUTS = 'true';
      process.env.LANGSMITH_HIDE_OUTPUTS = 'true';

      const sensitiveMemory: MemoryDocument = {
        content: 'User email is test@example.com and API key is sk-1234567890abcdef',
        metadata: {
          threadId: 'sensitive-thread',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(sensitiveMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: sensitiveMemory.content,
            metadata: sensitiveMemory.metadata,
          },
        ],
        'memory',
      );

      // Verify security flags are set
      expect(process.env.LANGSMITH_HIDE_INPUTS).toBe('true');
      expect(process.env.LANGSMITH_HIDE_OUTPUTS).toBe('true');
    });

    it('should handle similarity search with scores when tracing is enabled', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'scores-project';

      const mockSearchResults = [
        {
          content: 'High score traced result',
          metadata: { threadId: 'scores-thread' },
          score: 0.95,
        },
        {
          content: 'Medium score traced result',
          metadata: { threadId: 'scores-thread' },
          score: 0.8,
        },
      ];

      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemoriesWithScore('traced score query');

      expect(mockQdrantService.similaritySearch).toHaveBeenCalledWith('traced score query', 5, 'memory', undefined);
      expect(results).toHaveLength(2);
      expect(results[0][1]).toBe(0.95); // First result score
      expect(results[1][1]).toBe(0.8); // Second result score
    });

    it('should work without LangSmith tracing (baseline functionality)', async () => {
      // No LangSmith environment variables set
      const mockMemory: MemoryDocument = {
        content: 'Memory without tracing',
        metadata: {
          threadId: 'no-trace-thread',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(mockMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: mockMemory.content,
            metadata: mockMemory.metadata,
          },
        ],
        'memory',
      );

      // Verify no LangSmith environment variables are set
      expect(process.env.LANGSMITH_TRACING).toBeUndefined();
      expect(process.env.LANGSMITH_API_KEY).toBeUndefined();
      expect(process.env.LANGCHAIN_PROJECT).toBeUndefined();
    });

    it('should handle error scenarios with LangSmith tracing enabled', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'error-project';

      const storageError = new Error('Vector store failed with tracing');
      mockQdrantService.addDocuments.mockRejectedValueOnce(storageError);
      const errorSpy = jest.spyOn((service as unknown as VectorStoreServiceTestAccess).logger, 'error');

      const mockMemory: MemoryDocument = {
        content: 'Memory that will fail',
        metadata: {
          threadId: 'error-thread',
          timestamp: Date.now(),
          messageType: 'user',
        },
      };

      await expect(service.storeMemory(mockMemory)).rejects.toThrow('Vector store failed with tracing');
      expect(errorSpy).toHaveBeenCalledWith('Failed to store memory:', storageError);
    });

    it('should handle custom LangSmith endpoint configuration', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'custom-endpoint-project';
      process.env.LANGSMITH_ENDPOINT = 'https://custom-langsmith.example.com';

      const mockMemory: MemoryDocument = {
        content: 'Memory with custom endpoint',
        metadata: {
          threadId: 'custom-endpoint-thread',
          timestamp: Date.now(),
          messageType: 'assistant',
        },
      };

      mockQdrantService.addDocuments.mockResolvedValueOnce(undefined);

      await service.storeMemory(mockMemory);

      expect(mockQdrantService.addDocuments).toHaveBeenCalledWith(
        [
          {
            content: mockMemory.content,
            metadata: mockMemory.metadata,
          },
        ],
        'memory',
      );
      expect(process.env.LANGSMITH_ENDPOINT).toBe('https://custom-langsmith.example.com');
    });

    it('should handle background callbacks configuration', async () => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'test-key';
      process.env.LANGCHAIN_PROJECT = 'background-project';
      process.env.LANGCHAIN_CALLBACKS_BACKGROUND = 'true';

      const mockSearchResults = [
        {
          content: 'Background callback result',
          metadata: { threadId: 'background-thread' },
          score: 0.88,
        },
      ];

      mockQdrantService.similaritySearch.mockResolvedValueOnce(mockSearchResults);

      const results = await service.retrieveRelevantMemories('background query');

      expect(results).toHaveLength(1);
      expect(results[0].pageContent).toBe('Background callback result');
      expect(process.env.LANGCHAIN_CALLBACKS_BACKGROUND).toBe('true');
    });
  });
});
