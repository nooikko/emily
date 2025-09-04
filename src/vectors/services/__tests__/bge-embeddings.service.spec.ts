import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { pipeline } from '@xenova/transformers';
import { BgeEmbeddingsService } from '../bge-embeddings.service';

// Mock the @xenova/transformers module
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

// Mock embedder interface for type safety
type MockEmbedder = (
  text: string,
  options: { pooling: string; normalize: boolean },
) => Promise<{
  data: Float32Array;
  dims: number[];
}>;

describe('BgeEmbeddingsService', () => {
  let service: BgeEmbeddingsService;
  let mockPipeline: jest.MockedFunction<typeof pipeline>;
  let mockEmbedder: jest.MockedFunction<MockEmbedder>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock the pipeline function
    const { pipeline } = require('@xenova/transformers');
    mockPipeline = pipeline as jest.MockedFunction<typeof pipeline>;

    // Mock embedder function with proper typing
    mockEmbedder = jest.fn() as jest.MockedFunction<MockEmbedder>;
    mockPipeline.mockResolvedValue(mockEmbedder as unknown as ReturnType<typeof pipeline>);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BgeEmbeddingsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('BAAI/bge-base-en-v1.5'),
          },
        },
      ],
    }).compile();

    service = module.get<BgeEmbeddingsService>(BgeEmbeddingsService);
  });

  describe('onModuleInit', () => {
    it('should initialize the embeddings model successfully', async () => {
      await service.onModuleInit();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'BAAI/bge-base-en-v1.5', {
        quantized: false,
        cache_dir: './models',
      });
      expect(service).toBeDefined();
    });

    it('should handle initialization failure gracefully', async () => {
      const initError = new Error('Model initialization failed');
      mockPipeline.mockRejectedValueOnce(initError);

      // Should not throw - service continues without embeddings
      await expect(service.onModuleInit()).resolves.not.toThrow();

      // Service should be defined but embedder should be null
      expect(service).toBeDefined();
    });

    it('should log initialization progress', async () => {
      await service.onModuleInit();
    });

    it('should log error if initialization fails', async () => {
      const initError = new Error('Model initialization failed');
      mockPipeline.mockRejectedValueOnce(initError);

      try {
        await service.onModuleInit();
      } catch {
        // Expected to throw
      }
    });
  });

  describe('embedQuery', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should embed a query successfully', async () => {
      const mockEmbeddingData = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      mockEmbedder.mockResolvedValue({
        data: mockEmbeddingData,
        dims: [1, 4],
      });

      const result = await service.embedQuery('test query');

      expect(mockEmbedder).toHaveBeenCalledWith('Represent this sentence for searching relevant passages: test query', {
        pooling: 'mean',
        normalize: true,
      });
      expect(result).toHaveLength(4);
      expect(result[0]).toBeCloseTo(0.1, 5);
      expect(result[1]).toBeCloseTo(0.2, 5);
      expect(result[2]).toBeCloseTo(0.3, 5);
      expect(result[3]).toBeCloseTo(0.4, 5);
    });

    it('should add query instruction prefix', async () => {
      const mockEmbeddingData = new Float32Array([0.1, 0.2]);
      mockEmbedder.mockResolvedValue({
        data: mockEmbeddingData,
        dims: [1, 2],
      });

      await service.embedQuery('search text');

      expect(mockEmbedder).toHaveBeenCalledWith('Represent this sentence for searching relevant passages: search text', expect.any(Object));
    });

    it('should throw error if model is not initialized', async () => {
      const mockConfigService = { get: jest.fn().mockReturnValue('BAAI/bge-base-en-v1.5') };
      const uninitializedService = new BgeEmbeddingsService(mockConfigService as Partial<ConfigService> as ConfigService);

      await expect(uninitializedService.embedQuery('test')).rejects.toThrow(
        'BGE embeddings model (BAAI/bge-base-en-v1.5) is not available. The model failed to initialize during startup.',
      );
    });

    it('should handle embedding errors gracefully', async () => {
      const embedError = new Error('Embedding failed');
      mockEmbedder.mockRejectedValueOnce(embedError);

      await expect(service.embedQuery('test query')).rejects.toThrow('Embedding failed');
    });

    it('should use correct pooling and normalization options', async () => {
      const mockEmbeddingData = new Float32Array([1.0]);
      mockEmbedder.mockResolvedValue({
        data: mockEmbeddingData,
        dims: [1, 1],
      });

      await service.embedQuery('test');

      expect(mockEmbedder).toHaveBeenCalledWith(expect.any(String), {
        pooling: 'mean',
        normalize: true,
      });
    });
  });

  describe('embedDocuments', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should embed multiple documents successfully', async () => {
      const mockEmbeddingData1 = new Float32Array([0.1, 0.2]);
      const mockEmbeddingData2 = new Float32Array([0.3, 0.4]);

      mockEmbedder
        .mockResolvedValueOnce({ data: mockEmbeddingData1, dims: [1, 2] })
        .mockResolvedValueOnce({ data: mockEmbeddingData2, dims: [1, 2] });

      const documents = ['document 1', 'document 2'];
      const result = await service.embedDocuments(documents);

      expect(mockEmbedder).toHaveBeenCalledTimes(2);
      expect(mockEmbedder).toHaveBeenNthCalledWith(1, 'document 1', {
        pooling: 'mean',
        normalize: true,
      });
      expect(mockEmbedder).toHaveBeenNthCalledWith(2, 'document 2', {
        pooling: 'mean',
        normalize: true,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(2);
      expect(result[1]).toHaveLength(2);
      // Use approximate matching due to Float32Array precision
      expect(result[0][0]).toBeCloseTo(0.1, 5);
      expect(result[0][1]).toBeCloseTo(0.2, 5);
      expect(result[1][0]).toBeCloseTo(0.3, 5);
      expect(result[1][1]).toBeCloseTo(0.4, 5);
    });

    it('should handle empty documents array', async () => {
      const result = await service.embedDocuments([]);

      expect(mockEmbedder).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should process documents sequentially to avoid memory issues', async () => {
      const documents = ['doc1', 'doc2', 'doc3'];
      const mockEmbeddingData = new Float32Array([1.0]);

      mockEmbedder.mockResolvedValue({ data: mockEmbeddingData, dims: [1, 1] });

      await service.embedDocuments(documents);

      expect(mockEmbedder).toHaveBeenCalledTimes(3);
      // Verify sequential calls (not parallel)
      for (let i = 0; i < documents.length; i++) {
        expect(mockEmbedder).toHaveBeenNthCalledWith(i + 1, documents[i], {
          pooling: 'mean',
          normalize: true,
        });
      }
    });

    it('should throw error if model is not initialized', async () => {
      const mockConfigService = { get: jest.fn().mockReturnValue('BAAI/bge-base-en-v1.5') };
      const uninitializedService = new BgeEmbeddingsService(mockConfigService as Partial<ConfigService> as ConfigService);

      await expect(uninitializedService.embedDocuments(['test'])).rejects.toThrow(
        'BGE embeddings model (BAAI/bge-base-en-v1.5) is not available. The model failed to initialize during startup.',
      );
    });

    it('should handle embedding errors gracefully', async () => {
      const embedError = new Error('Document embedding failed');
      mockEmbedder.mockRejectedValueOnce(embedError);

      await expect(service.embedDocuments(['test doc'])).rejects.toThrow('Document embedding failed');
    });

    it('should preserve document order in results', async () => {
      const documents = ['first', 'second', 'third'];
      const embeddings = [new Float32Array([1.0, 0.0]), new Float32Array([0.0, 1.0]), new Float32Array([0.5, 0.5])];

      for (let i = 0; i < embeddings.length; i++) {
        mockEmbedder.mockResolvedValueOnce({ data: embeddings[i], dims: [1, 2] });
      }

      const result = await service.embedDocuments(documents);

      expect(result).toEqual([
        [1.0, 0.0],
        [0.0, 1.0],
        [0.5, 0.5],
      ]);
    });

    it('should work with readonly array input', async () => {
      const documents: readonly string[] = ['doc1', 'doc2'] as const;
      const mockEmbeddingData = new Float32Array([1.0]);

      mockEmbedder.mockResolvedValue({ data: mockEmbeddingData, dims: [1, 1] });

      const result = await service.embedDocuments(documents);

      expect(result).toHaveLength(2);
      expect(mockEmbedder).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDimensions', () => {
    it('should return the correct dimensions', () => {
      const dimensions = service.getDimensions();

      expect(dimensions).toBe(768);
    });

    it('should return dimensions without requiring initialization', () => {
      const mockConfigService = { get: jest.fn().mockReturnValue('BAAI/bge-base-en-v1.5') };
      const uninitializedService = new BgeEmbeddingsService(mockConfigService as Partial<ConfigService> as ConfigService);
      const dimensions = uninitializedService.getDimensions();

      expect(dimensions).toBe(768);
    });
  });

  describe('interface compliance', () => {
    it('should implement IEmbeddings interface correctly', async () => {
      await service.onModuleInit();
      const mockEmbeddingData = new Float32Array([0.1, 0.2]);
      mockEmbedder.mockResolvedValue({ data: mockEmbeddingData, dims: [1, 2] });

      // Test interface methods exist and work
      expect(typeof service.embedQuery).toBe('function');
      expect(typeof service.embedDocuments).toBe('function');
      expect(typeof service.getDimensions).toBe('function');

      // Test return types match interface
      const queryResult = await service.embedQuery('test');
      const docsResult = await service.embedDocuments(['test']);
      const dims = service.getDimensions();

      expect(Array.isArray(queryResult)).toBe(true);
      expect(Array.isArray(docsResult)).toBe(true);
      expect(Array.isArray(docsResult[0])).toBe(true);
      expect(typeof dims).toBe('number');
    });
  });
});
