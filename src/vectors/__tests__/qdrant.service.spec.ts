import type { CollectionInfo, SearchResult, VectorDocument } from '../interfaces/embeddings.interface';
import type { BgeEmbeddingsService } from '../services/bge-embeddings.service';
import { QdrantService, VectorStoreError } from '../services/qdrant.service';

// Mock external dependencies
jest.mock('@qdrant/js-client-rest');

// Mock types for better type safety - using Record<string, any> for flexibility while maintaining some structure
type MockQdrantClient = {
  getCollections: jest.MockedFunction<() => Promise<unknown>>;
  getCollection: jest.MockedFunction<(name: string) => Promise<unknown>>;
  createCollection: jest.MockedFunction<(name: string, config: unknown) => Promise<void>>;
  delete: jest.MockedFunction<(args: unknown) => Promise<void>>;
  deleteCollection: jest.MockedFunction<(name: string) => Promise<void>>;
  upsert: jest.MockedFunction<(name: string, config: unknown) => Promise<void>>;
  search: jest.MockedFunction<(name: string, args: unknown) => Promise<unknown[]>>;
} & Record<string, unknown>;

type MockEmbeddings = {
  embedQuery: jest.MockedFunction<(text: string) => Promise<number[]>>;
  embedDocuments: jest.MockedFunction<(documents: readonly string[]) => Promise<number[][]>>;
  getDimensions: jest.MockedFunction<() => number>;
  onModuleInit: jest.MockedFunction<() => Promise<void>>;
} & Record<string, unknown>;

describe('QdrantService', () => {
  let service: QdrantService;
  let mockQdrantClient: MockQdrantClient;
  let mockEmbeddings: MockEmbeddings;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      QDRANT_URL: 'http://test-qdrant',
      QDRANT_PORT: '6333',
      QDRANT_API_KEY: 'test-api-key',
      QDRANT_COLLECTION_PREFIX: 'test',
    };

    // Setup mocks with proper typing
    mockQdrantClient = {
      getCollections: jest.fn().mockResolvedValue({}),
      getCollection: jest.fn(),
      createCollection: jest.fn(),
      delete: jest.fn(),
      deleteCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
    } as MockQdrantClient;

    mockEmbeddings = {
      embedQuery: jest.fn().mockResolvedValue(new Array(768).fill(0)),
      embedDocuments: jest.fn().mockResolvedValue([new Array(768).fill(0)]),
      getDimensions: jest.fn().mockReturnValue(768),
      onModuleInit: jest.fn(),
    } as MockEmbeddings;

    const { QdrantClient } = require('@qdrant/js-client-rest');
    (QdrantClient as jest.MockedClass<typeof QdrantClient>).mockImplementation(() => mockQdrantClient);

    // Create service directly with mock
    service = new QdrantService(mockEmbeddings as unknown as BgeEmbeddingsService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor and configuration', () => {
    it('should initialize with default configuration', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize successfully', async () => {
      await service.onModuleInit();

      expect(require('@qdrant/js-client-rest').QdrantClient).toHaveBeenCalledWith({
        url: 'http://test-qdrant',
        port: 6333,
        apiKey: 'test-api-key',
      });
      expect(mockQdrantClient.getCollections).toHaveBeenCalled();
    });
  });

  describe('addDocuments', () => {
    it('should add documents to collection', async () => {
      const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
      mockQdrantClient.getCollection.mockResolvedValue(mockCollectionResponse);
      mockQdrantClient.upsert.mockResolvedValue(undefined);

      const documents = [
        { content: 'Test content 1', metadata: { key: 'value1' } },
        { content: 'Test content 2', metadata: { key: 'value2' } },
      ];

      await service.onModuleInit();
      await service.addDocuments(documents, 'memory');

      expect(mockEmbeddings.embedDocuments).toHaveBeenCalledWith(['Test content 1', 'Test content 2']);
      expect(mockQdrantClient.upsert).toHaveBeenCalled();
    });

    it('should create collection if it does not exist', async () => {
      mockQdrantClient.getCollection.mockRejectedValueOnce({ status: 404 });
      mockQdrantClient.createCollection.mockResolvedValue(undefined);
      mockQdrantClient.upsert.mockResolvedValue(undefined);

      const documents = [{ content: 'Test content', metadata: {} }];

      await service.onModuleInit();
      await service.addDocuments(documents, 'memory');

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test_memory', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
    });
  });

  describe('similaritySearch', () => {
    it('should perform similarity search', async () => {
      const mockSearchResults = [
        {
          id: 1,
          version: 1,
          score: 0.95,
          payload: { content: 'Result 1', metadata: { key: 'value1' } },
        },
        {
          id: 2,
          version: 1,
          score: 0.85,
          payload: { content: 'Result 2', metadata: { key: 'value2' } },
        },
      ];

      mockQdrantClient.search.mockResolvedValue(mockSearchResults);

      await service.onModuleInit();
      const results = await service.similaritySearch('test query', 5, 'memory');

      expect(mockEmbeddings.embedQuery).toHaveBeenCalledWith('test query');
      expect(mockQdrantClient.search).toHaveBeenCalledWith('test_memory', {
        vector: expect.any(Array),
        limit: 5,
        filter: undefined,
        with_payload: true,
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        content: 'Result 1',
        metadata: { content: 'Result 1', metadata: { key: 'value1' } },
        score: 0.95,
      });
    });

    it('should apply filters when provided', async () => {
      mockQdrantClient.search.mockResolvedValue([]);

      await service.onModuleInit();
      await service.similaritySearch('test query', 5, 'memory', { filter: { threadId: 'test-thread' } });

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test_memory', {
        vector: expect.any(Array),
        limit: 5,
        filter: {
          must: [
            {
              key: 'threadId',
              match: { value: 'test-thread' },
            },
          ],
        },
        with_payload: true,
      });
    });
  });

  describe('deleteCollection', () => {
    it('should delete collection', async () => {
      await service.onModuleInit();
      await service.deleteCollection('memory');

      expect(mockQdrantClient.deleteCollection).toHaveBeenCalledWith('test_memory');
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when connected', async () => {
      await service.onModuleInit();
      const status = await service.getHealthStatus();

      expect(status).toEqual({
        available: true,
        connected: true,
      });
    });

    it('should return unhealthy status when not initialized', async () => {
      const uninitializedService = new QdrantService(mockEmbeddings as unknown as BgeEmbeddingsService);
      const status = await uninitializedService.getHealthStatus();

      expect(status).toEqual({
        available: false,
        connected: false,
        error: 'Qdrant client not initialized',
      });
    });
  });

  describe('VectorStoreError handling', () => {
    it('should create VectorStoreError with correct properties', () => {
      const originalError = new Error('Original error message');
      const vectorError = new VectorStoreError('Test error message', 'COLLECTION_ERROR', originalError);

      expect(vectorError).toBeInstanceOf(Error);
      expect(vectorError).toBeInstanceOf(VectorStoreError);
      expect(vectorError.name).toBe('VectorStoreError');
      expect(vectorError.message).toBe('Test error message');
      expect(vectorError.code).toBe('COLLECTION_ERROR');
      expect(vectorError.originalError).toBe(originalError);
    });

    it('should handle VectorStoreError without original error', () => {
      const vectorError = new VectorStoreError('Test error without original', 'CLIENT_NOT_READY');

      expect(vectorError.originalError).toBeUndefined();
      expect(vectorError.code).toBe('CLIENT_NOT_READY');
    });

    it('should support all error codes', () => {
      const errorCodes = ['INITIALIZATION_FAILED', 'CLIENT_NOT_READY', 'COLLECTION_ERROR', 'SEARCH_ERROR', 'UNKNOWN'] as const;

      errorCodes.forEach((code) => {
        const error = new VectorStoreError('Test message', code);
        expect(error.code).toBe(code);
      });
    });

    it('should throw VectorStoreError in getCollectionInfo when collection operation fails', async () => {
      const collectionError = new Error('Collection not found');
      // Mock both calls to reject with the same error
      mockQdrantClient.getCollection.mockRejectedValue(collectionError);

      await service.onModuleInit();

      await expect(service.getCollectionInfo('nonexistent')).rejects.toThrow(VectorStoreError);
      await expect(service.getCollectionInfo('nonexistent')).rejects.toThrow('Failed to get collection info');
    });
  });

  describe('TypeScript interface compliance', () => {
    describe('VectorDocument interface', () => {
      it('should work with properly typed VectorDocument', async () => {
        const typedDocument: VectorDocument = {
          content: 'Test content',
          metadata: {
            key1: 'string value',
            key2: 42,
            key3: true,
            key4: null,
            key5: undefined,
          },
        };

        const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
        mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionResponse);
        mockQdrantClient.upsert.mockResolvedValueOnce(undefined);

        await service.onModuleInit();
        await expect(service.addDocuments([typedDocument], 'test')).resolves.not.toThrow();
      });

      it('should work with VectorDocument without metadata', async () => {
        const documentWithoutMetadata: VectorDocument = {
          content: 'Content without metadata',
        };

        const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
        mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionResponse);
        mockQdrantClient.upsert.mockResolvedValueOnce(undefined);

        await service.onModuleInit();
        await expect(service.addDocuments([documentWithoutMetadata], 'test')).resolves.not.toThrow();
      });

      it('should handle readonly array of VectorDocuments', async () => {
        const readonlyDocuments: readonly VectorDocument[] = [
          { content: 'Document 1', metadata: { type: 'test' } },
          { content: 'Document 2', metadata: { type: 'test' } },
        ] as const;

        const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
        mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionResponse);
        mockQdrantClient.upsert.mockResolvedValueOnce(undefined);

        await service.onModuleInit();
        await expect(service.addDocuments(readonlyDocuments, 'test')).resolves.not.toThrow();
      });
    });

    describe('SearchResult interface', () => {
      it('should return properly typed SearchResult objects', async () => {
        const mockSearchResults = [
          {
            id: 1,
            version: 1,
            score: 0.95,
            payload: {
              content: 'Search result content',
              stringValue: 'test',
              numberValue: 123,
              booleanValue: true,
              nullValue: null,
            },
          },
        ];

        mockQdrantClient.search.mockResolvedValueOnce(mockSearchResults);

        await service.onModuleInit();
        const results = await service.similaritySearch('test query', 5, 'memory');

        expect(results).toHaveLength(1);
        const result: SearchResult = results[0];

        // Verify SearchResult interface compliance
        expect(typeof result.content).toBe('string');
        expect(typeof result.score).toBe('number');
        expect(result.metadata).toBeDefined();
        expect(result.metadata?.stringValue).toBe('test');
        expect(result.metadata?.numberValue).toBe(123);
        expect(result.metadata?.booleanValue).toBe(true);
        expect(result.metadata?.nullValue).toBeNull();
      });

      it('should handle SearchResult with undefined metadata', async () => {
        const mockSearchResults = [
          {
            id: 1,
            version: 1,
            score: 0.8,
            payload: {
              content: 'Content without metadata',
            },
          },
        ];

        mockQdrantClient.search.mockResolvedValueOnce(mockSearchResults);

        await service.onModuleInit();
        const results = await service.similaritySearch('test query', 5, 'memory');

        expect(results).toHaveLength(1);
        const result: SearchResult = results[0];
        expect(result.content).toBe('Content without metadata');
        expect(result.score).toBe(0.8);
        // Metadata should be properly handled when undefined in payload
      });

      it('should return readonly array of SearchResults', async () => {
        mockQdrantClient.search.mockResolvedValueOnce([]);

        await service.onModuleInit();
        const results: readonly SearchResult[] = await service.similaritySearch('test', 5, 'memory');

        // This test verifies that the return type is properly readonly
        expect(Array.isArray(results)).toBe(true);
      });
    });

    describe('CollectionInfo interface', () => {
      it('should return properly typed CollectionInfo', async () => {
        const mockCollectionData = {
          vectors_count: 100,
          indexed_vectors_count: 95,
          points_count: 100,
          segments_count: 2,
          config: {
            params: {
              vectors: {
                size: 768,
                distance: 'Cosine',
              },
            },
          },
          status: 'green',
        };

        mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionData);

        await service.onModuleInit();
        const collectionInfo: CollectionInfo = await service.getCollectionInfo('test');

        // Verify CollectionInfo interface compliance
        expect(typeof collectionInfo.name).toBe('string');
        expect(typeof collectionInfo.vectorsCount).toBe('number');
        expect(typeof collectionInfo.indexedVectorsCount).toBe('number');
        expect(typeof collectionInfo.pointsCount).toBe('number');
        expect(typeof collectionInfo.segmentsCount).toBe('number');
        expect(collectionInfo.config).toBeDefined();
        expect(typeof collectionInfo.config.vectorSize).toBe('number');
        expect(['Cosine', 'Dot', 'Euclid']).toContain(collectionInfo.config.distance);
        expect(['green', 'yellow', 'red']).toContain(collectionInfo.status);
      });
    });

    describe('IVectorStore interface compliance', () => {
      it('should implement all IVectorStore methods with correct signatures', async () => {
        await service.onModuleInit();

        // Verify method existence and basic types
        expect(typeof service.addDocuments).toBe('function');
        expect(typeof service.similaritySearch).toBe('function');
        expect(typeof service.deleteCollection).toBe('function');
        expect(typeof service.getCollectionInfo).toBe('function');

        // Test method signatures work with interface types
        const documents: readonly VectorDocument[] = [{ content: 'test', metadata: { key: 'value' } }];

        const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
        mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionResponse);
        mockQdrantClient.upsert.mockResolvedValueOnce(undefined);
        mockQdrantClient.search.mockResolvedValueOnce([]);
        mockQdrantClient.deleteCollection.mockResolvedValueOnce(undefined);

        // These should compile and run without type errors
        await expect(service.addDocuments(documents, 'test')).resolves.not.toThrow();

        const searchResults: readonly SearchResult[] = await service.similaritySearch('query', 5, 'test', { filter: { key: 'value' } });
        expect(Array.isArray(searchResults)).toBe(true);

        await expect(service.deleteCollection('test')).resolves.not.toThrow();
      });
    });
  });

  describe('enhanced error scenarios', () => {
    it('should handle initialization failure with structured error', async () => {
      const initError = new Error('Connection timeout');
      mockQdrantClient.getCollections.mockRejectedValueOnce(initError);

      await expect(service.onModuleInit()).rejects.toThrow('Qdrant initialization failed: Connection timeout');
    });

    it('should throw specific errors for uninitialized client operations', async () => {
      const uninitializedService = new QdrantService(mockEmbeddings as unknown as BgeEmbeddingsService);

      await expect(uninitializedService.addDocuments([], 'test')).rejects.toThrow('Qdrant client not initialized');
      await expect(uninitializedService.similaritySearch('query', 5, 'test')).rejects.toThrow('Qdrant client not initialized');
      await expect(uninitializedService.deleteCollection('test')).rejects.toThrow('Qdrant client not initialized');
      await expect(uninitializedService.getCollectionInfo('test')).rejects.toThrow('Qdrant client not initialized');
    });

    it('should handle collection creation errors gracefully', async () => {
      mockQdrantClient.getCollection.mockRejectedValueOnce({ status: 404 });
      mockQdrantClient.createCollection.mockRejectedValueOnce(new Error('Collection creation failed'));

      const documents: VectorDocument[] = [{ content: 'Test content' }];

      await service.onModuleInit();
      await expect(service.addDocuments(documents, 'memory')).rejects.toThrow('Collection creation failed');
    });

    it('should handle search errors with proper error propagation', async () => {
      const searchError = new Error('Search service unavailable');
      mockQdrantClient.search.mockRejectedValueOnce(searchError);

      await service.onModuleInit();
      await expect(service.similaritySearch('query', 5, 'memory')).rejects.toThrow('Search service unavailable');
    });

    it('should handle embedding service errors during document addition', async () => {
      const embeddingError = new Error('Embedding service down');
      mockEmbeddings.embedDocuments.mockRejectedValueOnce(embeddingError);
      const mockCollectionResponse = { status: 'green', config: { params: { vectors: { size: 768, distance: 'Cosine' as const } } } };
      mockQdrantClient.getCollection.mockResolvedValueOnce(mockCollectionResponse);

      const documents: VectorDocument[] = [{ content: 'Test content' }];

      await service.onModuleInit();
      await expect(service.addDocuments(documents, 'memory')).rejects.toThrow('Embedding service down');
    });

    it('should handle embedding service errors during similarity search', async () => {
      const embeddingError = new Error('Query embedding failed');
      mockEmbeddings.embedQuery.mockRejectedValueOnce(embeddingError);

      await service.onModuleInit();
      await expect(service.similaritySearch('query', 5, 'memory')).rejects.toThrow('Query embedding failed');
    });
  });

  describe('cleanup method', () => {
    it('should have cleanup method for graceful shutdown', async () => {
      await service.onModuleInit();

      expect(typeof service.cleanup).toBe('function');
      await expect(service.cleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup when client is not initialized', async () => {
      const uninitializedService = new QdrantService(mockEmbeddings as unknown as BgeEmbeddingsService);

      await expect(uninitializedService.cleanup()).resolves.not.toThrow();
    });
  });
});
