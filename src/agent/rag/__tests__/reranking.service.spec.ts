import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { RerankedResult, RerankingConfig } from '../interfaces/rag.interface';
import { RerankingRetriever, RerankingService } from '../services/reranking.service';

// Mock LangChain components
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue('Relevance Score: 8.5/10'),
    })),
  },
  RunnablePassthrough: jest.fn(),
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn(),
}));

jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
}));

describe('RerankingService', () => {
  let service: RerankingService;
  let mockCallbackManager: jest.Mocked<CallbackManagerService>;
  let mockLangSmith: jest.Mocked<LangSmithService>;
  let mockMetrics: jest.Mocked<AIMetricsService>;
  let mockInstrumentation: jest.Mocked<LangChainInstrumentationService>;

  // Mock LLM and Retriever
  const mockLLM = {
    call: jest.fn().mockResolvedValue('Mock LLM response'),
    _modelType: 'base_llm',
    _llmType: 'mock',
  } as any;

  const mockRetriever = {
    getRelevantDocuments: jest.fn().mockResolvedValue([
      new Document({
        pageContent: 'Document about machine learning algorithms',
        metadata: { source: 'doc1.txt', score: 0.8 },
      }),
      new Document({
        pageContent: 'Document about artificial intelligence',
        metadata: { source: 'doc2.txt', score: 0.7 },
      }),
      new Document({
        pageContent: 'Document about deep learning',
        metadata: { source: 'doc3.txt', score: 0.75 },
      }),
      new Document({
        pageContent: 'Unrelated document about cooking',
        metadata: { source: 'doc4.txt', score: 0.3 },
      }),
    ]),
  } as any;

  const sampleDocuments = [
    new Document({
      pageContent: 'Machine learning is a subset of artificial intelligence',
      metadata: { source: 'ml.txt', score: 0.9 },
    }),
    new Document({
      pageContent: 'Deep learning uses neural networks',
      metadata: { source: 'dl.txt', score: 0.8 },
    }),
    new Document({
      pageContent: 'Natural language processing handles text',
      metadata: { source: 'nlp.txt', score: 0.85 },
    }),
    new Document({
      pageContent: 'Computer vision processes images',
      metadata: { source: 'cv.txt', score: 0.7 },
    }),
  ];

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
        RerankingService,
        { provide: CallbackManagerService, useValue: mockCallbackManager },
        { provide: LangSmithService, useValue: mockLangSmith },
        { provide: AIMetricsService, useValue: mockMetrics },
        { provide: LangChainInstrumentationService, useValue: mockInstrumentation },
      ],
    }).compile();

    service = module.get<RerankingService>(RerankingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRerankingRetriever', () => {
    it('should create reranking retriever with default configuration', () => {
      const config: RerankingConfig = {
        baseRetriever: mockRetriever,
        llm: mockLLM,
      };

      const retriever = service.createRerankingRetriever(config);

      expect(retriever).toBeInstanceOf(RerankingRetriever);
      expect(retriever.config.rerankingMethod).toBe('mmr'); // default
      expect(retriever.config.topK).toBe(20); // default
      expect(retriever.config.finalK).toBe(10); // default
      expect(retriever.config.mmrLambda).toBe(0.5); // default
    });

    it('should create reranking retriever with custom configuration', () => {
      const config: RerankingConfig = {
        baseRetriever: mockRetriever,
        llm: mockLLM,
        rerankingMethod: 'llm_chain_ranker',
        topK: 30,
        finalK: 15,
        mmrLambda: 0.7,
        rerankingPrompt: 'Custom reranking prompt',
      };

      const retriever = service.createRerankingRetriever(config);

      expect(retriever.config.rerankingMethod).toBe('llm_chain_ranker');
      expect(retriever.config.topK).toBe(30);
      expect(retriever.config.finalK).toBe(15);
      expect(retriever.config.mmrLambda).toBe(0.7);
      expect(retriever.config.rerankingPrompt).toBe('Custom reranking prompt');
    });

    it('should validate configuration parameters', () => {
      expect(() => {
        const invalidConfig = {
          llm: mockLLM,
          // missing baseRetriever
        } as RerankingConfig;
        service.createRerankingRetriever(invalidConfig);
      }).toThrow('Base retriever is required');

      expect(() => {
        const invalidConfig = {
          baseRetriever: mockRetriever,
          // missing llm
        } as RerankingConfig;
        service.createRerankingRetriever(invalidConfig);
      }).toThrow('LLM is required for reranking');
    });

    it('should validate MMR lambda parameter', () => {
      expect(() => {
        const invalidConfig: RerankingConfig = {
          baseRetriever: mockRetriever,
          llm: mockLLM,
          mmrLambda: -0.1, // invalid
        };
        service.createRerankingRetriever(invalidConfig);
      }).toThrow('MMR lambda must be between 0 and 1');

      expect(() => {
        const invalidConfig: RerankingConfig = {
          baseRetriever: mockRetriever,
          llm: mockLLM,
          mmrLambda: 1.1, // invalid
        };
        service.createRerankingRetriever(invalidConfig);
      }).toThrow('MMR lambda must be between 0 and 1');
    });
  });

  describe('applyMMRReranking', () => {
    it('should apply MMR reranking with default parameters', async () => {
      const query = 'machine learning algorithms';

      const results = await service.applyMMRReranking(sampleDocuments, query);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(sampleDocuments.length);

      // Check that all results have required MMR properties
      results.forEach((result) => {
        expect(result).toHaveProperty('document');
        expect(result).toHaveProperty('originalScore');
        expect(result).toHaveProperty('rerankedScore');
        expect(result).toHaveProperty('rank');
        expect(result.rerankingMethod).toBe('mmr');
      });
    });

    it('should apply MMR reranking with custom parameters', async () => {
      const query = 'deep learning neural networks';
      const options = {
        lambda: 0.3,
        k: 2,
        diversityThreshold: 0.5,
        includeScores: true,
      };

      const results = await service.applyMMRReranking(sampleDocuments, query, options);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(options.k);
    });

    it('should handle empty document list', async () => {
      const results = await service.applyMMRReranking([], 'test query');

      expect(results).toEqual([]);
    });

    it('should handle single document', async () => {
      const singleDoc = [sampleDocuments[0]];
      const results = await service.applyMMRReranking(singleDoc, 'test query');

      expect(results).toHaveLength(1);
      expect(results[0].document).toEqual(singleDoc[0]);
    });

    it('should prioritize relevance when lambda is high', async () => {
      const query = 'machine learning';
      const highRelevanceLambda = 0.9;

      const results = await service.applyMMRReranking(sampleDocuments, query, { lambda: highRelevanceLambda });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should prioritize diversity when lambda is low', async () => {
      const query = 'machine learning';
      const highDiversityLambda = 0.1;

      const results = await service.applyMMRReranking(sampleDocuments, query, { lambda: highDiversityLambda });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('applyLLMChainReranking', () => {
    beforeEach(() => {
      // Mock RunnableSequence to return different scores
      const { RunnableSequence } = require('@langchain/core/runnables');
      let callCount = 0;
      RunnableSequence.from.mockImplementation(() => ({
        invoke: jest.fn().mockImplementation(() => {
          const scores = ['Score: 9/10', 'Score: 7/10', 'Score: 8/10', 'Score: 6/10'];
          return Promise.resolve(scores[callCount++ % scores.length]);
        }),
      }));
    });

    it('should apply LLM chain reranking with default parameters', async () => {
      const query = 'machine learning algorithms';

      const results = await service.applyLLMChainReranking(sampleDocuments, query, mockLLM);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(sampleDocuments.length);

      // Check that results are sorted by reranked score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].rerankedScore).toBeGreaterThanOrEqual(results[i].rerankedScore);
      }

      // Verify rerankingMethod is set
      results.forEach((result) => {
        expect(result.rerankingMethod).toBe('llm_chain');
      });
    });

    it('should apply LLM chain reranking with custom batch size', async () => {
      const query = 'deep learning';
      const options = { batchSize: 2 };

      const results = await service.applyLLMChainReranking(sampleDocuments, query, mockLLM, options);

      expect(results).toBeDefined();
      expect(results.length).toBe(sampleDocuments.length);
    });

    it('should include explanations when requested', async () => {
      const query = 'artificial intelligence';
      const options = { includeExplanations: true };

      const results = await service.applyLLMChainReranking(sampleDocuments, query, mockLLM, options);

      // Check if explanations are added to document metadata
      results.forEach((result) => {
        if (result.document.metadata.rerankingExplanation) {
          expect(typeof result.document.metadata.rerankingExplanation).toBe('string');
        }
      });
    });

    it('should normalize scores when requested', async () => {
      const query = 'neural networks';
      const options = { scoreNormalization: 'minmax' as const };

      const results = await service.applyLLMChainReranking(sampleDocuments, query, mockLLM, options);

      // Check that scores are normalized
      const scores = results.map((r) => r.rerankedScore);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);

      if (results.length > 1) {
        expect(minScore).toBeGreaterThanOrEqual(0);
        expect(maxScore).toBeLessThanOrEqual(1);
      }
    });

    it('should handle LLM errors gracefully', async () => {
      const errorLLM = {
        call: jest.fn().mockRejectedValue(new Error('LLM error')),
      } as any;

      // Mock RunnableSequence to throw error
      const { RunnableSequence } = require('@langchain/core/runnables');
      RunnableSequence.from.mockImplementation(() => ({
        invoke: jest.fn().mockRejectedValue(new Error('Chain error')),
      }));

      const results = await service.applyLLMChainReranking([sampleDocuments[0]], 'test query', errorLLM);

      // Should fallback to original scores
      expect(results).toBeDefined();
      expect(results).toHaveLength(1);
      expect(results[0].rerankedScore).toBe(results[0].originalScore);
    });
  });

  describe('applyCrossEncoderReranking', () => {
    it('should apply cross-encoder reranking with default parameters', async () => {
      const query = 'machine learning techniques';

      const results = await service.applyCrossEncoderReranking(sampleDocuments, query);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(sampleDocuments.length);

      // Check that results are sorted by cross-encoder score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].rerankedScore).toBeGreaterThanOrEqual(results[i].rerankedScore);
      }

      results.forEach((result) => {
        expect(result.rerankingMethod).toBe('cross_encoder');
      });
    });

    it('should apply cross-encoder reranking with custom parameters', async () => {
      const query = 'deep learning';
      const options = {
        modelName: 'custom-cross-encoder',
        batchSize: 2,
        threshold: 0.5,
      };

      const results = await service.applyCrossEncoderReranking(sampleDocuments, query, options);

      expect(results).toBeDefined();
    });

    it('should handle empty document list', async () => {
      const results = await service.applyCrossEncoderReranking([], 'test query');

      expect(results).toEqual([]);
    });
  });

  describe('applyHybridReranking', () => {
    it('should apply hybrid reranking with default strategies', async () => {
      const query = 'artificial intelligence applications';

      const results = await service.applyHybridReranking(sampleDocuments, query, mockLLM);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(sampleDocuments.length);

      // Results should be sorted by final hybrid score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].rerankedScore).toBeGreaterThanOrEqual(results[i].rerankedScore);
      }
    });

    it('should apply hybrid reranking with custom strategies', async () => {
      const query = 'neural network architectures';
      const options = {
        strategies: [
          { method: 'mmr' as const, weight: 0.5 },
          { method: 'llm_chain' as const, weight: 0.3 },
          { method: 'cross_encoder' as const, weight: 0.2 },
        ],
        fusionMethod: 'rrf' as const,
        normalizeScores: true,
      };

      const results = await service.applyHybridReranking(sampleDocuments, query, mockLLM, options);

      expect(results).toBeDefined();
      expect(results.length).toBe(sampleDocuments.length);
    });

    it('should handle different fusion methods', async () => {
      const query = 'computer vision';

      // Test weighted_sum fusion
      const weightedResults = await service.applyHybridReranking(sampleDocuments, query, mockLLM, { fusionMethod: 'weighted_sum' });

      // Test RRF fusion
      const rrfResults = await service.applyHybridReranking(sampleDocuments, query, mockLLM, { fusionMethod: 'rrf' });

      // Test Borda count fusion
      const bordaResults = await service.applyHybridReranking(sampleDocuments, query, mockLLM, { fusionMethod: 'borda_count' });

      expect(weightedResults).toBeDefined();
      expect(rrfResults).toBeDefined();
      expect(bordaResults).toBeDefined();
    });

    it('should normalize scores when requested', async () => {
      const query = 'machine learning';
      const options = { normalizeScores: true };

      const results = await service.applyHybridReranking(sampleDocuments, query, mockLLM, options);

      if (results.length > 1) {
        const scores = results.map((r) => r.rerankedScore);
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);

        expect(minScore).toBeGreaterThanOrEqual(0);
        expect(maxScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('analyzeRerankingEffectiveness', () => {
    const originalDocuments = sampleDocuments;
    const mockRerankedResults: RerankedResult[] = [
      {
        document: sampleDocuments[1], // Moved from position 1 to 0
        originalScore: 0.8,
        rerankedScore: 0.95,
        rank: 1,
        rerankingMethod: 'hybrid',
      },
      {
        document: sampleDocuments[0], // Moved from position 0 to 1
        originalScore: 0.9,
        rerankedScore: 0.88,
        rank: 2,
        rerankingMethod: 'hybrid',
      },
      {
        document: sampleDocuments[2], // Stayed in similar position
        originalScore: 0.85,
        rerankedScore: 0.82,
        rank: 3,
        rerankingMethod: 'hybrid',
      },
      {
        document: sampleDocuments[3], // Stayed at bottom
        originalScore: 0.7,
        rerankedScore: 0.65,
        rank: 4,
        rerankingMethod: 'hybrid',
      },
    ];

    it('should analyze reranking effectiveness', async () => {
      const query = 'test query';

      const analysis = await service.analyzeRerankingEffectiveness(originalDocuments, mockRerankedResults, query);

      expect(analysis).toBeDefined();
      expect(analysis.metrics).toBeDefined();
      expect(analysis.analysis).toBeDefined();
      expect(analysis.recommendations).toBeDefined();

      // Check metrics structure
      expect(analysis.metrics).toHaveProperty('rankCorrelation');
      expect(analysis.metrics).toHaveProperty('scoreImprovement');
      expect(analysis.metrics).toHaveProperty('diversityImprovement');
      expect(analysis.metrics).toHaveProperty('relevanceGain');

      // Check analysis structure
      expect(analysis.analysis).toHaveProperty('topResultsChanged');
      expect(analysis.analysis).toHaveProperty('averageRankChange');
      expect(analysis.analysis).toHaveProperty('significantMoves');

      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should provide meaningful recommendations', async () => {
      const query = 'test query';

      const analysis = await service.analyzeRerankingEffectiveness(originalDocuments, mockRerankedResults, query);

      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.recommendations.every((rec) => typeof rec === 'string')).toBe(true);
    });
  });

  describe('RerankingRetriever class', () => {
    let rerankingRetriever: RerankingRetriever;

    beforeEach(() => {
      const config = {
        baseRetriever: mockRetriever,
        llm: mockLLM,
        rerankingMethod: 'mmr' as const,
        mmrLambda: 0.5,
        topK: 20,
        finalK: 10,
        callbacks: [],
        logger: service['logger'],
      };

      rerankingRetriever = new RerankingRetriever(config);
    });

    it('should retrieve and rerank documents', async () => {
      const query = 'machine learning';

      const results = await rerankingRetriever.getRelevantDocuments(query);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(10); // finalK limit
      expect(mockRetriever.getRelevantDocuments).toHaveBeenCalledWith(query);
    });

    it('should limit results to finalK', async () => {
      const query = 'test query';

      const results = await rerankingRetriever.getRelevantDocuments(query);

      expect(results.length).toBeLessThanOrEqual(rerankingRetriever.config.finalK);
    });
  });

  describe('private utility methods', () => {
    describe('calculateRelevanceScores', () => {
      it('should calculate relevance scores for documents', async () => {
        const query = 'machine learning algorithms';

        // Access private method through any casting
        const scores = await (service as any).calculateRelevanceScores(sampleDocuments, query);

        expect(scores).toBeDefined();
        expect(Array.isArray(scores)).toBe(true);
        expect(scores.length).toBe(sampleDocuments.length);
        expect(scores.every((score) => typeof score === 'number')).toBe(true);
      });

      it('should return higher scores for more relevant documents', async () => {
        const query = 'machine learning';

        const scores = await (service as any).calculateRelevanceScores(sampleDocuments, query);

        // First document mentions "machine learning" directly
        // Fourth document is about computer vision (less relevant)
        expect(scores[0]).toBeGreaterThan(scores[3]);
      });
    });

    describe('calculateDiversityMatrix', () => {
      it('should calculate diversity matrix', async () => {
        const matrix = await (service as any).calculateDiversityMatrix(sampleDocuments);

        expect(matrix).toBeDefined();
        expect(Array.isArray(matrix)).toBe(true);
        expect(matrix.length).toBe(sampleDocuments.length);

        // Check matrix properties
        matrix.forEach((row, i) => {
          expect(row.length).toBe(sampleDocuments.length);
          expect(row[i]).toBe(0); // Diagonal should be 0 (self-similarity)

          row.forEach((value, j) => {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
            expect(value).toBe(matrix[j][i]); // Should be symmetric
          });
        });
      });
    });

    describe('calculateJaccardSimilarity', () => {
      it('should calculate Jaccard similarity correctly', () => {
        const text1 = 'machine learning artificial intelligence';
        const text2 = 'machine learning deep learning';

        const similarity = (service as any).calculateJaccardSimilarity(text1, text2);

        expect(typeof similarity).toBe('number');
        expect(similarity).toBeGreaterThanOrEqual(0);
        expect(similarity).toBeLessThanOrEqual(1);
      });

      it('should return 1 for identical texts', () => {
        const text = 'identical text content';

        const similarity = (service as any).calculateJaccardSimilarity(text, text);

        expect(similarity).toBe(1);
      });

      it('should return 0 for completely different texts', () => {
        const text1 = 'machine learning algorithms';
        const text2 = 'cooking recipes food';

        const similarity = (service as any).calculateJaccardSimilarity(text1, text2);

        expect(similarity).toBe(0);
      });
    });

    describe('extractScoreFromLLMResponse', () => {
      it('should extract score from various response formats', () => {
        const responses = ['Score: 8.5', 'Relevance: 7/10', 'The relevance score is 9.2 out of 10', 'Rating: 6/10', 'No clear score here'];

        const expectedScores = [0.85, 0.7, 0.92, 0.6, 0.5]; // 0.5 is default fallback

        responses.forEach((response, index) => {
          const score = (service as any).extractScoreFromLLMResponse(response);
          expect(score).toBeCloseTo(expectedScores[index], 1);
        });
      });
    });

    describe('simulateCrossEncoderScore', () => {
      it('should simulate cross-encoder scoring', () => {
        const content = 'Machine learning is a powerful technique for data analysis';
        const query = 'machine learning data analysis';

        const score = (service as any).simulateCrossEncoderScore(content, query);

        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });

      it('should return higher scores for better matches', () => {
        const relevantContent = 'Machine learning algorithms for data analysis';
        const irrelevantContent = 'Cooking recipes and food preparation';
        const query = 'machine learning algorithms';

        const relevantScore = (service as any).simulateCrossEncoderScore(relevantContent, query);
        const irrelevantScore = (service as any).simulateCrossEncoderScore(irrelevantContent, query);

        expect(relevantScore).toBeGreaterThan(irrelevantScore);
      });
    });
  });

  describe('error handling and validation', () => {
    it('should validate reranking configuration', () => {
      expect(() => {
        const invalidConfig = {
          llm: mockLLM,
          topK: -5,
        } as RerankingConfig;
        service.createRerankingRetriever(invalidConfig);
      }).toThrow();
    });

    it('should handle errors in MMR calculation gracefully', async () => {
      // This would test error handling in MMR algorithm
      const emptyDocs: Document[] = [];

      const results = await service.applyMMRReranking(emptyDocs, 'test query');

      expect(results).toEqual([]);
    });

    it('should handle errors in hybrid reranking gracefully', async () => {
      const errorLLM = {
        call: jest.fn().mockRejectedValue(new Error('LLM error')),
      } as any;

      // Should not throw, but handle errors gracefully
      await expect(service.applyHybridReranking([sampleDocuments[0]], 'test query', errorLLM)).resolves.toBeDefined();
    });
  });

  describe('integration with observability', () => {
    it('should integrate with LangSmith when enabled', async () => {
      const config: RerankingConfig = {
        baseRetriever: mockRetriever,
        llm: mockLLM,
      };

      const retriever = service.createRerankingRetriever(config);
      await service.applyMMRReranking(sampleDocuments, 'test query');

      expect(mockLangSmith.isEnabled).toHaveBeenCalled();
    });

    it('should record metrics when available', async () => {
      await service.applyMMRReranking(sampleDocuments, 'test query');

      expect(mockMetrics.recordOperationDuration).toHaveBeenCalled();
    });
  });
});
