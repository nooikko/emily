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

describe('VectorStoreService - Storage Operations', () => {
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
});
