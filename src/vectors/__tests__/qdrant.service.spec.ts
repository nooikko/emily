import { Test, type TestingModule } from '@nestjs/testing';
import { QdrantClient } from '@qdrant/js-client-rest';
import { BgeEmbeddingsService } from '../services/bge-embeddings.service';
import { QdrantService } from '../services/qdrant.service';

// Mock external dependencies
jest.mock('@qdrant/js-client-rest');

describe('QdrantService', () => {
  let service: QdrantService;
  let mockQdrantClient: jest.Mocked<QdrantClient>;
  let mockEmbeddings: jest.Mocked<BgeEmbeddingsService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      QDRANT_URL: 'http://test-qdrant',
      QDRANT_PORT: '6333',
      QDRANT_API_KEY: 'test-api-key',
      QDRANT_COLLECTION_PREFIX: 'test',
    };

    // Setup mocks
    mockQdrantClient = {
      getCollections: jest.fn().mockResolvedValue({}),
      getCollection: jest.fn(),
      createCollection: jest.fn(),
      delete: jest.fn(),
      deleteCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
    } as any;

    mockEmbeddings = {
      embedQuery: jest.fn().mockResolvedValue(new Array(768).fill(0)),
      embedDocuments: jest.fn().mockResolvedValue([new Array(768).fill(0)]),
      getDimensions: jest.fn().mockReturnValue(768),
      onModuleInit: jest.fn(),
    } as any;

    (QdrantClient as jest.Mock).mockImplementation(() => mockQdrantClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantService,
        {
          provide: BgeEmbeddingsService,
          useValue: mockEmbeddings,
        },
      ],
    }).compile();

    service = module.get<QdrantService>(QdrantService);
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

      expect(QdrantClient).toHaveBeenCalledWith({
        url: 'http://test-qdrant',
        port: 6333,
        apiKey: 'test-api-key',
      });
      expect(mockQdrantClient.getCollections).toHaveBeenCalled();
    });
  });

  describe('addDocuments', () => {
    it('should add documents to collection', async () => {
      mockQdrantClient.getCollection.mockResolvedValue({} as any);
      mockQdrantClient.upsert.mockResolvedValue({} as any);

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
      mockQdrantClient.createCollection.mockResolvedValue({} as any);
      mockQdrantClient.upsert.mockResolvedValue({} as any);

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
      await service.similaritySearch('test query', 5, 'memory', { threadId: 'test-thread' });

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
      const uninitializedService = new QdrantService(mockEmbeddings);
      const status = await uninitializedService.getHealthStatus();

      expect(status).toEqual({
        available: false,
        connected: false,
        error: 'Qdrant client not initialized',
      });
    });
  });
});
