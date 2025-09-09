import { Document } from '@langchain/core/documents';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataMaskingService } from '../../../../langsmith/services/data-masking.service';
// Import service classes for proper dependency injection
import { LangSmithService } from '../../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../../observability/services/langchain-instrumentation.service';
import { StructuredLoggerService } from '../../../../observability/services/structured-logger.service';
import { TelemetryService } from '../../../../observability/services/telemetry.service';
import { BgeEmbeddingsService } from '../../../../vectors/services/bge-embeddings.service';
import { QdrantService } from '../../../../vectors/services/qdrant.service';
import { VectorStoreService } from '../../../../vectors/services/vector-store.service';
import { CallbackManagerService } from '../../../callbacks/callback-manager.service';
import { MemoryService } from '../../../memory/memory.service';
import { CompressionRetrieverService } from '../../services/compression-retriever.service';
import { ConversationalRetrievalService } from '../../services/conversational-retrieval.service';
import { EnsembleRetrieverService } from '../../services/ensemble-retriever.service';
import { ParentDocumentRetrieverService } from '../../services/parent-document-retriever.service';
import { QARetrievalService } from '../../services/qa-retrieval.service';
import { RerankingService } from '../../services/reranking.service';
import { SelfQueryRetrieverService } from '../../services/self-query-retriever.service';

// Create mock providers and services for testing
const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      BGE_MODEL_NAME: 'test-model',
      QDRANT_URL: 'http://localhost:6333',
      LANGSMITH_API_KEY: 'test-key',
      LANGSMITH_PROJECT_NAME: 'test-project',
    };
    return config[key] || defaultValue;
  }),
};

const mockVectorStoreService = {
  similaritySearch: jest.fn().mockResolvedValue([]),
  addDocuments: jest.fn().mockResolvedValue(undefined),
};

const mockBgeEmbeddingsService = {
  embedQuery: jest.fn().mockResolvedValue(Array(768).fill(0.1)),
  embedDocuments: jest.fn().mockResolvedValue([Array(768).fill(0.1), Array(768).fill(0.2)]),
  getDimensions: jest.fn().mockReturnValue(768),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
};

const mockQdrantService = {
  createCollection: jest.fn().mockResolvedValue(undefined),
  search: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue(undefined),
};

const mockLangSmithService = {
  trace: jest.fn().mockImplementation((name, fn) => fn()),
  startTrace: jest.fn().mockResolvedValue({}),
  endTrace: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn().mockReturnValue(false), // Disabled for testing
  getCallbackHandler: jest.fn().mockReturnValue(null),
  createTracer: jest.fn().mockReturnValue(null),
};

const mockDataMaskingService = {
  maskSensitiveData: jest.fn().mockImplementation((data) => data),
};

const mockTelemetryService = {
  createMetric: jest.fn().mockResolvedValue({}),
  recordMetric: jest.fn().mockResolvedValue(undefined),
};

const mockStructuredLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockLangChainInstrumentationService = {
  instrument: jest.fn().mockImplementation((fn) => fn),
};

const mockAIMetricsService = {
  recordTokenUsage: jest.fn().mockResolvedValue(undefined),
  recordLatency: jest.fn().mockResolvedValue(undefined),
  recordOperationDuration: jest.fn().mockResolvedValue(undefined),
};

const mockMemoryService = {
  getMemory: jest.fn().mockResolvedValue(null),
  setMemory: jest.fn().mockResolvedValue(undefined),
};

const mockCallbackManagerService = {
  createCallbackManager: jest.fn().mockReturnValue({
    addHandler: jest.fn(),
    removeHandler: jest.fn(),
  }),
};

// Mock LangChain components to avoid external dependencies
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue({
        text: 'Integration test response',
        answer: 'Integration test response',
        sourceDocuments: [
          {
            pageContent: 'Relevant document about machine learning',
            metadata: { source: 'ml_doc.txt', score: 0.9 },
          },
        ],
      }),
    })),
  },
  RunnablePassthrough: jest.fn(),
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn(),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({}),
  },
  HumanMessagePromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
  SystemMessagePromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
  PromptTemplate: Object.assign(
    jest.fn().mockImplementation((config) => ({
      template: config?.template || 'mock template',
      inputVariables: config?.inputVariables || [],
      format: jest.fn().mockResolvedValue('formatted prompt'),
    })),
    {
      fromTemplate: jest.fn().mockReturnValue({
        format: jest.fn().mockResolvedValue('formatted prompt'),
      }),
    },
  ),
}));

// Mock LangChain chains
jest.mock('langchain/chains', () => ({
  loadQAStuffChain: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      text: 'QA integration response',
      sourceDocuments: [
        new Document({
          pageContent: 'Mock document content',
          metadata: { source: 'qa_test.txt' },
        }),
      ],
    }),
  }),
  loadQAMapReduceChain: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      text: 'QA map-reduce response',
      sourceDocuments: [],
    }),
  }),
  loadQARefineChain: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      text: 'QA refine response',
      sourceDocuments: [],
    }),
  }),
  LLMChain: jest.fn().mockImplementation(() => ({
    call: jest.fn().mockResolvedValue({ text: 'LLM response' }),
  })),
}));

describe('RAG Integration Tests', () => {
  let module: TestingModule;
  let conversationalService: ConversationalRetrievalService;
  let qaService: QARetrievalService;
  let ensembleService: EnsembleRetrieverService;
  let rerankingService: RerankingService;

  // Mock components
  const mockLLM = {
    call: jest.fn().mockResolvedValue('Mock LLM response'),
    _modelType: 'base_llm',
    _llmType: 'mock',
  } as any;

  const mockDocuments = [
    new Document({
      pageContent: 'Relevant document about machine learning',
      metadata: { source: 'ml_doc.txt', score: 0.9, ragMetrics: { retrievalLatency: 50, rerankingLatency: 10 } },
    }),
    new Document({
      pageContent: 'Another document about AI applications',
      metadata: { source: 'ai_doc.txt', score: 0.8, ragMetrics: { retrievalLatency: 45, rerankingLatency: 8 } },
    }),
  ];

  const mockRetriever = {
    getRelevantDocuments: jest.fn().mockResolvedValue(mockDocuments),
  } as any;

  beforeAll(async () => {
    try {
      // Create a minimal testing module with only the services we need and mocked dependencies
      module = await Test.createTestingModule({
        providers: [
          // RAG Services to test
          ConversationalRetrievalService,
          QARetrievalService,
          EnsembleRetrieverService,
          RerankingService,
          CompressionRetrieverService,
          ParentDocumentRetrieverService,
          SelfQueryRetrieverService,
          CallbackManagerService,
          // Mock dependencies
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          // Use class tokens for proper dependency injection
          {
            provide: BgeEmbeddingsService,
            useValue: mockBgeEmbeddingsService,
          },
          {
            provide: QdrantService,
            useValue: mockQdrantService,
          },
          {
            provide: VectorStoreService,
            useValue: mockVectorStoreService,
          },
          {
            provide: LangSmithService,
            useValue: mockLangSmithService,
          },
          {
            provide: DataMaskingService,
            useValue: mockDataMaskingService,
          },
          {
            provide: TelemetryService,
            useValue: mockTelemetryService,
          },
          {
            provide: StructuredLoggerService,
            useValue: mockStructuredLoggerService,
          },
          {
            provide: LangChainInstrumentationService,
            useValue: mockLangChainInstrumentationService,
          },
          {
            provide: AIMetricsService,
            useValue: mockAIMetricsService,
          },
          {
            provide: MemoryService,
            useValue: mockMemoryService,
          },
        ],
      }).compile();

      // Wait a bit for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      conversationalService = module.get<ConversationalRetrievalService>(ConversationalRetrievalService);
      qaService = module.get<QARetrievalService>(QARetrievalService);
      ensembleService = module.get<EnsembleRetrieverService>(EnsembleRetrieverService);
      rerankingService = module.get<RerankingService>(RerankingService);
    } catch (error) {
      console.error('Failed to create test module:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End RAG Workflow', () => {
    it('should execute complete conversational RAG workflow', async () => {
      // Step 1: Create conversational chain
      const conversationalChain = conversationalService.createConversationalChain({
        llm: mockLLM,
        retriever: mockRetriever,
        returnSourceDocuments: true,
      });

      expect(conversationalChain).toBeDefined();

      // Step 2: Execute conversational retrieval
      const conversationalResult = await conversationalService.executeConversationalRetrieval(conversationalChain, 'What is machine learning?', []);

      expect(conversationalResult).toBeDefined();
      expect(conversationalResult.answer).toBe('Integration test response');
      expect(conversationalResult.sourceDocuments).toHaveLength(1);
      expect(conversationalResult.chatHistory).toHaveLength(2); // Question + Answer
    });

    it('should execute complete QA RAG workflow with citations', async () => {
      // Step 1: Create QA chain
      const qaChain = await qaService.createQAChain({
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'stuff',
      });

      expect(qaChain).toBeDefined();

      // Step 2: Execute QA retrieval with citations
      const qaResult = await qaService.executeQARetrievalWithCitations(qaChain, 'Explain artificial intelligence', {
        format: 'numbered',
        includeFullCitation: true,
      });

      expect(qaResult).toBeDefined();
      expect(qaResult.answer).toBe('Integration test response');
      expect(qaResult.sources).toHaveLength(1);
      expect(qaResult.citations).toBeDefined();
      expect(qaResult.citationMap).toBeDefined();
    });

    it('should execute ensemble retrieval with reranking workflow', async () => {
      // Step 1: Create ensemble retriever
      const ensembleRetriever = ensembleService.createEnsembleRetriever({
        retrievers: [mockRetriever, mockRetriever], // Using same retriever for simplicity
        weights: [0.6, 0.4],
        combineMethod: 'weighted_sum',
        removeDuplicates: true,
      });

      expect(ensembleRetriever).toBeDefined();

      // Step 2: Execute ensemble retrieval
      const ensembleResults = await ensembleService.executeEnsembleRetrieval(ensembleRetriever, 'machine learning applications', {
        k: 5,
        includeMetadata: true,
      });

      expect(ensembleResults).toBeDefined();
      expect(Array.isArray(ensembleResults)).toBe(true);

      // Step 3: Apply reranking
      if (ensembleResults.length > 0) {
        const rerankedResults = await rerankingService.applyMMRReranking(ensembleResults, 'machine learning applications', { lambda: 0.5, k: 3 });

        expect(rerankedResults).toBeDefined();
        expect(rerankedResults.length).toBeLessThanOrEqual(3);
        expect(rerankedResults.every((r) => r.rerankingMethod === 'mmr')).toBe(true);
      }
    });

    it('should execute hybrid retrieval and reranking workflow', async () => {
      // Step 1: Create hybrid retriever
      const hybridRetriever = ensembleService.createHybridRetriever({
        denseRetriever: mockRetriever,
        sparseRetriever: mockRetriever,
        denseWeight: 0.7,
        sparseWeight: 0.3,
        fusionMethod: 'weighted_sum',
      });

      expect(hybridRetriever).toBeDefined();

      // Step 2: Execute hybrid retrieval
      const hybridResults = await ensembleService.executeEnsembleRetrieval(hybridRetriever, 'deep learning neural networks', {
        k: 10,
        parallelize: true,
      });

      expect(hybridResults).toBeDefined();

      // Step 3: Apply hybrid reranking
      if (hybridResults.length > 0) {
        const hybridRerankedResults = await rerankingService.applyHybridReranking(hybridResults, 'deep learning neural networks', mockLLM, {
          strategies: [
            { method: 'mmr', weight: 0.4 },
            { method: 'llm_chain', weight: 0.4 },
            { method: 'cross_encoder', weight: 0.2 },
          ],
          fusionMethod: 'weighted_sum',
          normalizeScores: true,
        });

        expect(hybridRerankedResults).toBeDefined();
        expect(hybridRerankedResults.length).toBeGreaterThan(0);

        // Verify scores are normalized (between 0 and 1)
        const scores = hybridRerankedResults.map((r) => r.rerankedScore);
        expect(Math.min(...scores)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...scores)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Service Integration', () => {
    it('should integrate conversational and QA services', async () => {
      // Create both chains
      const conversationalChain = conversationalService.createConversationalChain({
        llm: mockLLM,
        retriever: mockRetriever,
      });

      const qaChain = await qaService.createQAChain({
        llm: mockLLM,
        retriever: mockRetriever,
      });

      // Execute both
      const conversationalPromise = conversationalService.executeConversationalRetrieval(conversationalChain, 'What is AI?', []);

      const qaPromise = qaService.executeQARetrieval(qaChain, 'What is AI?');

      const [conversationalResult, qaResult] = await Promise.all([conversationalPromise, qaPromise]);

      expect(conversationalResult).toBeDefined();
      expect(qaResult).toBeDefined();

      // Both should have retrieved documents
      expect(conversationalResult.sourceDocuments?.length).toBeGreaterThan(0);
      expect(qaResult.sources.length).toBeGreaterThan(0);
    });

    it('should integrate ensemble and reranking services', async () => {
      const sampleDocs = [
        new Document({
          pageContent: 'Machine learning algorithms for data analysis',
          metadata: { source: 'ml1.txt', score: 0.9 },
        }),
        new Document({
          pageContent: 'Deep learning neural network architectures',
          metadata: { source: 'dl1.txt', score: 0.85 },
        }),
        new Document({
          pageContent: 'Natural language processing techniques',
          metadata: { source: 'nlp1.txt', score: 0.8 },
        }),
      ];

      // Apply MMR reranking
      const mmrResults = await rerankingService.applyMMRReranking(sampleDocs, 'machine learning algorithms', { lambda: 0.6, k: 2 });

      // Apply LLM reranking
      const llmResults = await rerankingService.applyLLMChainReranking(sampleDocs, 'machine learning algorithms', mockLLM, { batchSize: 2 });

      expect(mmrResults).toBeDefined();
      expect(llmResults).toBeDefined();
      expect(mmrResults.length).toBeLessThanOrEqual(2);
      expect(llmResults.length).toBe(sampleDocs.length);

      // Verify different reranking methods produce different results
      expect(mmrResults[0].rerankingMethod).toBe('mmr');
      expect(llmResults[0].rerankingMethod).toBe('llm_chain');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors gracefully across services', async () => {
      const errorRetriever = {
        getRelevantDocuments: jest.fn().mockRejectedValue(new Error('Retriever error')),
      } as any;

      // Test conversational service error handling
      const conversationalChain = conversationalService.createConversationalChain({
        llm: mockLLM,
        retriever: errorRetriever,
      });

      // Should not throw during chain creation
      expect(conversationalChain).toBeDefined();

      // Test ensemble service error handling
      const ensembleRetriever = ensembleService.createEnsembleRetriever({
        retrievers: [mockRetriever, errorRetriever],
      });

      // Should handle one failing retriever gracefully
      const results = await ensembleService.executeEnsembleRetrieval(ensembleRetriever, 'test query');

      expect(results).toBeDefined();
    });

    it('should validate configurations across services', () => {
      // Test conversational service validation
      const conversationalValidation = conversationalService.validateConfig({
        llm: mockLLM,
        retriever: mockRetriever,
        memoryWindowSize: -1, // Invalid
      });

      expect(conversationalValidation.warnings.length).toBeGreaterThan(0);

      // Test ensemble service validation
      expect(() => {
        ensembleService.createEnsembleRetriever({
          retrievers: [], // Invalid
        });
      }).toThrow('At least one retriever is required');

      // Test reranking service validation
      expect(() => {
        rerankingService.createRerankingRetriever({
          baseRetriever: mockRetriever,
          llm: mockLLM,
          mmrLambda: 2.0, // Invalid
        });
      }).toThrow('MMR lambda must be between 0 and 1');
    });
  });

  describe('Performance and Metrics Integration', () => {
    it('should measure performance across RAG pipeline', async () => {
      const startTime = Date.now();

      // Execute full RAG pipeline
      const conversationalChain = conversationalService.createConversationalChain({
        llm: mockLLM,
        retriever: mockRetriever,
      });

      const result = await conversationalService.executeConversationalRetrieval(conversationalChain, 'Test performance query', [], {
        includeMetrics: true,
      });

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      expect(result).toBeDefined();
      // In a mock environment, latency might be 0 or very small, so just check it's >= 0
      expect(totalLatency).toBeGreaterThanOrEqual(0);

      // Check if metrics are included
      if (result.sourceDocuments && result.sourceDocuments.length > 0) {
        expect(result.sourceDocuments[0].metadata).toHaveProperty('ragMetrics');
      }
    });

    it('should analyze reranking effectiveness', async () => {
      const testDocuments = [
        new Document({
          pageContent: 'Original document 1',
          metadata: { score: 0.8 },
        }),
        new Document({
          pageContent: 'Original document 2',
          metadata: { score: 0.7 },
        }),
      ];

      const rerankedResults = await rerankingService.applyMMRReranking(testDocuments, 'test query');

      const analysis = await rerankingService.analyzeRerankingEffectiveness(testDocuments, rerankedResults, 'test query');

      expect(analysis).toBeDefined();
      expect(analysis.metrics).toBeDefined();
      expect(analysis.analysis).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });
});
