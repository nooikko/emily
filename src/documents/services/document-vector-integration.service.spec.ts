import { Test, TestingModule } from '@nestjs/testing';
import { Document } from '@langchain/core/documents';
import { DocumentVectorIntegrationService } from './document-vector-integration.service';
import { QdrantService } from '../../vectors/services/qdrant.service';
import { DocumentTransformationService } from './document-transformation.service';
import { MetadataExtractionService } from './metadata-extraction.service';

describe('DocumentVectorIntegrationService', () => {
  let service: DocumentVectorIntegrationService;
  let qdrantService: jest.Mocked<QdrantService>;
  let transformationService: jest.Mocked<DocumentTransformationService>;
  let metadataService: jest.Mocked<MetadataExtractionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentVectorIntegrationService,
        {
          provide: QdrantService,
          useValue: {
            addDocuments: jest.fn(),
            similaritySearch: jest.fn(),
            getCollectionInfo: jest.fn(),
            deleteCollection: jest.fn(),
          },
        },
        {
          provide: DocumentTransformationService,
          useValue: {
            createPreprocessingChain: jest.fn(),
            createEnrichmentChain: jest.fn(),
            createCustomTransformation: jest.fn(),
          },
        },
        {
          provide: MetadataExtractionService,
          useValue: {
            extractMetadata: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentVectorIntegrationService>(DocumentVectorIntegrationService);
    qdrantService = module.get(QdrantService);
    transformationService = module.get(DocumentTransformationService);
    metadataService = module.get(MetadataExtractionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize without errors', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('indexDocument', () => {
    const testDocument = new Document({
      pageContent: 'This is a test document for indexing.',
      metadata: { id: 'test-doc-1', source: 'test' },
    });

    beforeEach(() => {
      // Setup mocks
      transformationService.createPreprocessingChain.mockResolvedValue({
        invoke: jest.fn().mockResolvedValue(testDocument),
      } as any);

      metadataService.extractMetadata.mockResolvedValue({
        language: 'en',
        wordCount: 7,
      });

      qdrantService.addDocuments.mockResolvedValue(undefined);
    });

    it('should successfully index a document', async () => {
      const result = await service.indexDocument(testDocument);

      expect(result).toMatchObject({
        documentId: 'test-doc-1',
        status: 'success',
        chunks: expect.any(Number),
        vectorsStored: expect.any(Number),
      });
      expect(result.chunks).toBeGreaterThan(0);
      expect(result.vectorsStored).toBeGreaterThan(0);
      expect(qdrantService.addDocuments).toHaveBeenCalled();
    });

    it('should apply preprocessing transformations', async () => {
      await service.indexDocument(testDocument);

      expect(transformationService.createPreprocessingChain).toHaveBeenCalled();
      expect(metadataService.extractMetadata).toHaveBeenCalled();
    });

    it('should handle indexing errors', async () => {
      qdrantService.addDocuments.mockRejectedValue(new Error('Storage failed'));

      await expect(service.indexDocument(testDocument)).rejects.toThrow('Storage failed');
    });

    it('should use custom configuration', async () => {
      const config = {
        chunkSize: 500,
        chunkOverlap: 100,
        collectionName: 'custom-collection',
      };

      await service.indexDocument(testDocument, config);

      expect(qdrantService.addDocuments).toHaveBeenCalledWith(
        expect.any(Array),
        'custom-collection'
      );
    });
  });

  describe('indexDocumentBatch', () => {
    const testDocuments = [
      new Document({
        pageContent: 'First document content.',
        metadata: { id: 'doc-1' },
      }),
      new Document({
        pageContent: 'Second document content.',
        metadata: { id: 'doc-2' },
      }),
      new Document({
        pageContent: 'Third document content.',
        metadata: { id: 'doc-3' },
      }),
    ];

    beforeEach(() => {
      transformationService.createPreprocessingChain.mockResolvedValue({
        invoke: jest.fn().mockImplementation(({ document }) => Promise.resolve(document)),
      } as any);

      metadataService.extractMetadata.mockResolvedValue({
        language: 'en',
        wordCount: 3,
      });

      qdrantService.addDocuments.mockResolvedValue(undefined);
    });

    it('should process multiple documents in batch', async () => {
      const result = await service.indexDocumentBatch(testDocuments);

      expect(result).toMatchObject({
        totalDocuments: 3,
        successfulDocuments: 3,
        failedDocuments: 0,
        totalChunks: expect.any(Number),
        totalVectors: expect.any(Number),
      });
      expect(result.results).toHaveLength(3);
    });

    it('should handle batch size configuration', async () => {
      const config = { batchSize: 2 };
      
      await service.indexDocumentBatch(testDocuments, config);

      // Should process in 2 batches (2 docs, then 1 doc)
      expect(qdrantService.addDocuments).toHaveBeenCalledTimes(3);
    });

    it('should retry failed documents', async () => {
      qdrantService.addDocuments
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(undefined);

      const config = { maxRetries: 2, retryDelay: 10 };
      const result = await service.indexDocumentBatch([testDocuments[0]], config);

      expect(result.successfulDocuments).toBe(1);
      expect(result.failedDocuments).toBe(0);
    });

    it('should mark documents as failed after max retries', async () => {
      qdrantService.addDocuments.mockRejectedValue(new Error('Persistent failure'));

      const config = { maxRetries: 2, retryDelay: 10 };
      const result = await service.indexDocumentBatch([testDocuments[0]], config);

      expect(result.successfulDocuments).toBe(0);
      expect(result.failedDocuments).toBe(1);
      expect(result.results[0].status).toBe('failed');
    });
  });

  describe('createIndexingPipeline', () => {
    it('should create a custom indexing pipeline', async () => {
      const pipelineConfig = {
        name: 'custom-pipeline',
        steps: [
          { name: 'transform', type: 'transform' as const },
          { name: 'enrich', type: 'enrich' as const },
          { name: 'chunk', type: 'chunk' as const },
          { name: 'index', type: 'index' as const },
        ],
      };

      transformationService.createCustomTransformation.mockResolvedValue({
        invoke: jest.fn().mockImplementation(({ document }) => Promise.resolve(document)),
      } as any);

      transformationService.createEnrichmentChain.mockResolvedValue({
        invoke: jest.fn().mockImplementation(({ document }) => Promise.resolve(document)),
      } as any);

      transformationService.createPreprocessingChain.mockResolvedValue({
        invoke: jest.fn().mockImplementation(({ document }) => Promise.resolve(document)),
      } as any);

      metadataService.extractMetadata.mockResolvedValue({});
      qdrantService.addDocuments.mockResolvedValue(undefined);

      const pipeline = await service.createIndexingPipeline(pipelineConfig);
      const testDoc = new Document({ pageContent: 'Test content' });
      
      const result = await pipeline([testDoc]);

      expect(result).toMatchObject({
        totalDocuments: expect.any(Number),
        successfulDocuments: expect.any(Number),
      });
    });
  });

  describe('retrieveDocuments', () => {
    it('should retrieve documents based on query', async () => {
      const mockResults = [
        {
          content: 'Relevant content 1',
          metadata: { id: 'doc-1' },
          score: 0.9,
        },
        {
          content: 'Relevant content 2',
          metadata: { id: 'doc-2' },
          score: 0.8,
        },
      ];

      qdrantService.similaritySearch.mockResolvedValue(mockResults);

      const documents = await service.retrieveDocuments({
        query: 'test query',
        limit: 10,
        scoreThreshold: 0.7,
      });

      expect(documents).toHaveLength(2);
      expect(documents[0]).toBeInstanceOf(Document);
      expect(documents[0].pageContent).toBe('Relevant content 1');
    });

    it('should filter by score threshold', async () => {
      const mockResults = [
        {
          content: 'High relevance',
          metadata: { id: 'doc-1' },
          score: 0.9,
        },
        {
          content: 'Low relevance',
          metadata: { id: 'doc-2' },
          score: 0.5,
        },
      ];

      qdrantService.similaritySearch.mockResolvedValue(mockResults);

      const documents = await service.retrieveDocuments({
        query: 'test query',
        scoreThreshold: 0.7,
      });

      expect(documents).toHaveLength(1);
      expect(documents[0].pageContent).toBe('High relevance');
    });

    it('should use custom collection name', async () => {
      qdrantService.similaritySearch.mockResolvedValue([]);

      await service.retrieveDocuments({
        query: 'test query',
        collectionName: 'custom-collection',
      });

      expect(qdrantService.similaritySearch).toHaveBeenCalledWith(
        'test query',
        10,
        'custom-collection',
        expect.any(Object)
      );
    });
  });

  describe('retrieveDocumentsWithScores', () => {
    it('should retrieve documents with similarity scores', async () => {
      const mockResults = [
        {
          content: 'Content 1',
          metadata: { id: 'doc-1' },
          score: 0.95,
        },
        {
          content: 'Content 2',
          metadata: { id: 'doc-2' },
          score: 0.85,
        },
      ];

      qdrantService.similaritySearch.mockResolvedValue(mockResults);

      const documentsWithScores = await service.retrieveDocumentsWithScores({
        query: 'test query',
      });

      expect(documentsWithScores).toHaveLength(2);
      expect(documentsWithScores[0][0]).toBeInstanceOf(Document);
      expect(documentsWithScores[0][1]).toBe(0.95);
      expect(documentsWithScores[1][1]).toBe(0.85);
    });
  });

  describe('metrics and monitoring', () => {
    it('should track indexing metrics', async () => {
      const testDoc = new Document({
        pageContent: 'Test content',
        metadata: { id: 'test-1' },
      });

      transformationService.createPreprocessingChain.mockResolvedValue({
        invoke: jest.fn().mockResolvedValue(testDoc),
      } as any);

      metadataService.extractMetadata.mockResolvedValue({});
      qdrantService.addDocuments.mockResolvedValue(undefined);

      await service.indexDocument(testDoc);
      
      const metrics = service.getIndexingMetrics();

      expect(metrics.totalDocumentsProcessed).toBe(1);
      expect(metrics.totalChunksCreated).toBeGreaterThan(0);
      expect(metrics.totalVectorsStored).toBeGreaterThan(0);
    });

    it('should reset metrics', () => {
      service.resetMetrics();
      const metrics = service.getIndexingMetrics();

      expect(metrics.totalDocumentsProcessed).toBe(0);
      expect(metrics.totalChunksCreated).toBe(0);
      expect(metrics.totalVectorsStored).toBe(0);
    });
  });

  describe('collection management', () => {
    it('should get collection statistics', async () => {
      const mockInfo = {
        name: 'documents',
        vectorsCount: 1000,
        indexedVectorsCount: 1000,
        pointsCount: 1000,
        segmentsCount: 2,
        status: 'green' as const,
        config: {
          vectorSize: 768,
          distance: 'Cosine' as const,
        },
      };

      qdrantService.getCollectionInfo.mockResolvedValue(mockInfo);

      const stats = await service.getCollectionStats();

      expect(stats).toMatchObject({
        name: 'documents',
        vectorsCount: 1000,
        status: 'green',
      });
    });

    it('should clear collection', async () => {
      await service.clearCollection('test-collection');

      expect(qdrantService.deleteCollection).toHaveBeenCalledWith('test-collection');
    });

    it('should use default collection name when not specified', async () => {
      await service.clearCollection();

      expect(qdrantService.deleteCollection).toHaveBeenCalledWith('documents');
    });
  });
});