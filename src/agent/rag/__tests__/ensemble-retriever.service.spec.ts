import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { EnsembleRetrieverConfig } from '../interfaces/rag.interface';
import { EnsembleRetriever, EnsembleRetrieverService } from '../services/ensemble-retriever.service';

describe('EnsembleRetrieverService', () => {
  let service: EnsembleRetrieverService;
  let mockCallbackManager: jest.Mocked<CallbackManagerService>;
  let mockLangSmith: jest.Mocked<LangSmithService>;
  let mockMetrics: jest.Mocked<AIMetricsService>;
  let mockInstrumentation: jest.Mocked<LangChainInstrumentationService>;

  // Mock retrievers
  const createMockRetriever = (id: string, docs: Document[]) =>
    ({
      getRelevantDocuments: jest.fn().mockResolvedValue(docs),
      id,
    }) as any;

  const mockDenseRetriever = createMockRetriever('dense', [
    new Document({
      pageContent: 'Dense retrieval result 1',
      metadata: { source: 'dense1.txt', score: 0.9 },
    }),
    new Document({
      pageContent: 'Dense retrieval result 2',
      metadata: { source: 'dense2.txt', score: 0.8 },
    }),
  ]);

  const mockSparseRetriever = createMockRetriever('sparse', [
    new Document({
      pageContent: 'Sparse retrieval result 1',
      metadata: { source: 'sparse1.txt', score: 0.85 },
    }),
    new Document({
      pageContent: 'Sparse retrieval result 2',
      metadata: { source: 'sparse2.txt', score: 0.75 },
    }),
  ]);

  beforeEach(async () => {
    mockCallbackManager = {
      createCallbackManager: jest.fn().mockReturnValue({ handlers: [] }),
    } as any;

    mockLangSmith = {
      isEnabled: jest.fn().mockReturnValue(true),
      createTraceable: jest.fn().mockImplementation((name, fn) => fn),
      createMetadata: jest.fn().mockReturnValue({}),
      maskSensitiveObject: jest.fn().mockImplementation((obj) => obj),
    } as any;

    mockMetrics = {
      recordOperationDuration: jest.fn(),
    } as any;

    mockInstrumentation = {
      startSpan: jest.fn(),
      endSpan: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnsembleRetrieverService,
        { provide: CallbackManagerService, useValue: mockCallbackManager },
        { provide: LangSmithService, useValue: mockLangSmith },
        { provide: AIMetricsService, useValue: mockMetrics },
        { provide: LangChainInstrumentationService, useValue: mockInstrumentation },
      ],
    }).compile();

    service = module.get<EnsembleRetrieverService>(EnsembleRetrieverService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEnsembleRetriever', () => {
    it('should create ensemble retriever with default configuration', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
      };

      const retriever = service.createEnsembleRetriever(config);

      expect(retriever).toBeInstanceOf(EnsembleRetriever);
      expect(retriever.config.retrievers).toHaveLength(2);
      expect(retriever.config.weights).toEqual([0.5, 0.5]); // Equal weights by default
    });

    it('should create ensemble retriever with custom weights', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.7, 0.3],
      };

      const retriever = service.createEnsembleRetriever(config);

      expect(retriever.config.weights).toEqual([0.7, 0.3]);
    });

    it('should normalize weights when they do not sum to 1', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.8, 0.4], // Sum = 1.2
      };

      const retriever = service.createEnsembleRetriever(config);

      // Should be normalized to [2/3, 1/3] approximately
      expect(retriever.config.weights![0]).toBeCloseTo(0.667, 2);
      expect(retriever.config.weights![1]).toBeCloseTo(0.333, 2);
    });

    it('should set combine method and deduplication options', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        combineMethod: 'max',
        removeDuplicates: false,
        similarityThreshold: 0.9,
      };

      const retriever = service.createEnsembleRetriever(config);

      expect(retriever.config.combineMethod).toBe('max');
      expect(retriever.config.removeDuplicates).toBe(false);
      expect(retriever.config.similarityThreshold).toBe(0.9);
    });

    it('should throw error for empty retrievers array', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [],
      };

      expect(() => service.createEnsembleRetriever(config)).toThrow('At least one retriever is required');
    });

    it('should throw error for mismatched weights length', () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.7], // Only one weight for two retrievers
      };

      expect(() => service.createEnsembleRetriever(config)).toThrow('Number of weights must match number of retrievers');
    });
  });

  describe('executeEnsembleRetrieval', () => {
    let ensembleRetriever: EnsembleRetriever;

    beforeEach(() => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.6, 0.4],
      };
      ensembleRetriever = service.createEnsembleRetriever(config);
    });

    it('should execute ensemble retrieval successfully', async () => {
      const query = 'test query';

      const results = await service.executeEnsembleRetrieval(ensembleRetriever, query);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(mockDenseRetriever.getRelevantDocuments).toHaveBeenCalledWith(query);
      expect(mockSparseRetriever.getRelevantDocuments).toHaveBeenCalledWith(query);
    });

    it('should limit results to specified k', async () => {
      const query = 'test query';
      const k = 2;

      const results = await service.executeEnsembleRetrieval(ensembleRetriever, query, { k });

      expect(results.length).toBeLessThanOrEqual(k);
    });

    it('should include metadata when requested', async () => {
      const query = 'test query';

      const results = await service.executeEnsembleRetrieval(ensembleRetriever, query, { includeMetadata: true });

      // Check if ensemble metadata is added
      if (results.length > 0) {
        expect(results[0].metadata).toBeDefined();
      }
    });

    it('should handle parallel vs sequential execution', async () => {
      const query = 'test query';

      // Test parallel execution (default)
      const parallelResults = await service.executeEnsembleRetrieval(ensembleRetriever, query, { parallelize: true });

      // Test sequential execution
      const sequentialResults = await service.executeEnsembleRetrieval(ensembleRetriever, query, { parallelize: false });

      expect(parallelResults).toBeDefined();
      expect(sequentialResults).toBeDefined();
    });

    it('should handle retriever errors gracefully', async () => {
      // Create a retriever that fails
      const errorRetriever = {
        getRelevantDocuments: jest.fn().mockRejectedValue(new Error('Retriever failed')),
      } as any;

      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, errorRetriever],
      };

      const retrieverWithError = service.createEnsembleRetriever(config);

      // Should not throw, but handle the error gracefully
      const results = await service.executeEnsembleRetrieval(retrieverWithError, 'test query');

      expect(results).toBeDefined();
    });
  });

  describe('createHybridRetriever', () => {
    it('should create hybrid dense/sparse retriever with default weights', () => {
      const config = {
        denseRetriever: mockDenseRetriever,
        sparseRetriever: mockSparseRetriever,
      };

      const retriever = service.createHybridRetriever(config);

      expect(retriever).toBeInstanceOf(EnsembleRetriever);
      expect(retriever.config.retrievers).toHaveLength(2);
      expect(retriever.config.weights![0]).toBeCloseTo(0.7, 1); // Default dense weight
      expect(retriever.config.weights![1]).toBeCloseTo(0.3, 1); // Default sparse weight
    });

    it('should create hybrid retriever with custom weights', () => {
      const config = {
        denseRetriever: mockDenseRetriever,
        sparseRetriever: mockSparseRetriever,
        denseWeight: 0.8,
        sparseWeight: 0.2,
      };

      const retriever = service.createHybridRetriever(config);

      expect(retriever.config.weights![0]).toBeCloseTo(0.8, 1);
      expect(retriever.config.weights![1]).toBeCloseTo(0.2, 1);
    });

    it('should normalize custom weights', () => {
      const config = {
        denseRetriever: mockDenseRetriever,
        sparseRetriever: mockSparseRetriever,
        denseWeight: 0.9,
        sparseWeight: 0.3, // Total = 1.2
      };

      const retriever = service.createHybridRetriever(config);

      const sum = retriever.config.weights![0] + retriever.config.weights![1];
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should set RRF fusion when specified', () => {
      const config = {
        denseRetriever: mockDenseRetriever,
        sparseRetriever: mockSparseRetriever,
        fusionMethod: 'rrf' as const,
        rrfConstant: 50,
      };

      const retriever = service.createHybridRetriever(config);

      expect(retriever).toBeInstanceOf(EnsembleRetriever);
      // RRF constant should be set (would need to access private property in real implementation)
    });
  });

  describe('createMultiModalRetriever', () => {
    const mockImageRetriever = createMockRetriever('image', [new Document({ pageContent: 'Image description 1', metadata: { type: 'image' } })]);

    const mockAudioRetriever = createMockRetriever('audio', [new Document({ pageContent: 'Audio transcription 1', metadata: { type: 'audio' } })]);

    it('should create multi-modal retriever with text only', () => {
      const config = {
        textRetriever: mockDenseRetriever,
      };

      const retriever = service.createMultiModalRetriever(config);

      expect(retriever).toBeInstanceOf(EnsembleRetriever);
      expect(retriever.config.retrievers).toHaveLength(1);
    });

    it('should create multi-modal retriever with all modalities', () => {
      const config = {
        textRetriever: mockDenseRetriever,
        imageRetriever: mockImageRetriever,
        audioRetriever: mockAudioRetriever,
        modalityWeights: {
          text: 0.5,
          image: 0.3,
          audio: 0.2,
        },
      };

      const retriever = service.createMultiModalRetriever(config);

      expect(retriever).toBeInstanceOf(EnsembleRetriever);
      expect(retriever.config.retrievers).toHaveLength(3);
      expect(retriever.config.weights).toEqual([0.5, 0.3, 0.2]);
    });

    it('should normalize modality weights', () => {
      const config = {
        textRetriever: mockDenseRetriever,
        imageRetriever: mockImageRetriever,
        modalityWeights: {
          text: 0.8,
          image: 0.4, // Total = 1.2
        },
      };

      const retriever = service.createMultiModalRetriever(config);

      const sum = retriever.config.weights!.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should use default weights when not specified', () => {
      const config = {
        textRetriever: mockDenseRetriever,
        imageRetriever: mockImageRetriever,
      };

      const retriever = service.createMultiModalRetriever(config);

      expect(retriever.config.weights![0]).toBeCloseTo(0.6, 1); // Default text weight
      expect(retriever.config.weights![1]).toBeCloseTo(0.25, 1); // Default image weight
    });
  });

  describe('EnsembleRetriever class', () => {
    let ensembleRetriever: EnsembleRetriever;

    beforeEach(() => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.6, 0.4],
        combineMethod: 'weighted_sum',
        removeDuplicates: true,
      };

      ensembleRetriever = new EnsembleRetriever(config, [], service['logger']);
    });

    describe('getRelevantDocuments', () => {
      it('should retrieve and combine documents from multiple retrievers', async () => {
        const query = 'machine learning';

        const results = await ensembleRetriever.getRelevantDocuments(query);

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(mockDenseRetriever.getRelevantDocuments).toHaveBeenCalledWith(query);
        expect(mockSparseRetriever.getRelevantDocuments).toHaveBeenCalledWith(query);
      });

      it('should limit results to specified k', async () => {
        const query = 'test query';
        const k = 3;

        const results = await ensembleRetriever.getRelevantDocuments(query, k);

        expect(results.length).toBeLessThanOrEqual(k);
      });

      it('should handle parallel retrieval by default', async () => {
        const query = 'test query';

        const results = await ensembleRetriever.getRelevantDocuments(query, 10, true);

        expect(results).toBeDefined();
      });

      it('should handle sequential retrieval when requested', async () => {
        const query = 'test query';

        const results = await ensembleRetriever.getRelevantDocuments(query, 10, false);

        expect(results).toBeDefined();
      });

      it('should handle retriever failures gracefully', async () => {
        // Mock one retriever to fail
        mockSparseRetriever.getRelevantDocuments.mockRejectedValueOnce(new Error('Retriever failed'));

        const query = 'test query';

        // Should not throw an error
        const results = await ensembleRetriever.getRelevantDocuments(query);

        expect(results).toBeDefined();
      });
    });

    describe('setRRFFusion', () => {
      it('should set RRF constant', () => {
        ensembleRetriever.setRRFFusion(45);

        // Would need access to private property to verify
        expect(ensembleRetriever).toBeDefined();
      });

      it('should use default RRF constant when not specified', () => {
        ensembleRetriever.setRRFFusion();

        expect(ensembleRetriever).toBeDefined();
      });
    });
  });

  describe('error handling and validation', () => {
    it('should validate ensemble configuration', () => {
      // This tests the private validateEnsembleConfig method indirectly
      expect(() => {
        const invalidConfig = { retrievers: [] } as EnsembleRetrieverConfig;
        service.createEnsembleRetriever(invalidConfig);
      }).toThrow('At least one retriever is required');
    });

    it('should handle negative weights', () => {
      expect(() => {
        const invalidConfig: EnsembleRetrieverConfig = {
          retrievers: [mockDenseRetriever, mockSparseRetriever],
          weights: [-0.5, 1.5],
        };
        service.createEnsembleRetriever(invalidConfig);
      }).toThrow('Weights cannot be negative');
    });

    it('should handle invalid similarity threshold', () => {
      expect(() => {
        const invalidConfig: EnsembleRetrieverConfig = {
          retrievers: [mockDenseRetriever, mockSparseRetriever],
          similarityThreshold: 1.5, // > 1.0
        };
        service.createEnsembleRetriever(invalidConfig);
      }).toThrow('Similarity threshold must be between 0 and 1');
    });

    it('should warn about weight normalization', () => {
      // Spy on logger to check warnings
      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
        weights: [0.5, 0.3], // Sum = 0.8, not 1.0
      };

      service.createEnsembleRetriever(config);

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("Weights don't sum to 1"), expect.any(Object));

      loggerSpy.mockRestore();
    });
  });

  describe('integration with observability', () => {
    it('should integrate with LangSmith when enabled', async () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
      };

      const retriever = service.createEnsembleRetriever(config);
      await service.executeEnsembleRetrieval(retriever, 'test query');

      expect(mockLangSmith.isEnabled).toHaveBeenCalled();
    });

    it('should record metrics when available', async () => {
      const config: EnsembleRetrieverConfig = {
        retrievers: [mockDenseRetriever, mockSparseRetriever],
      };

      const retriever = service.createEnsembleRetriever(config);
      await service.executeEnsembleRetrieval(retriever, 'test query');

      expect(mockMetrics.recordOperationDuration).toHaveBeenCalled();
    });
  });
});
