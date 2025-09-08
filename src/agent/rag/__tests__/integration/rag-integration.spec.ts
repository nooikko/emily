import { Test, TestingModule } from '@nestjs/testing';
import { Document } from '@langchain/core/documents';
import { ConversationalRetrievalService } from '../../services/conversational-retrieval.service';
import { QARetrievalService } from '../../services/qa-retrieval.service';
import { EnsembleRetrieverService } from '../../services/ensemble-retriever.service';
import { RerankingService } from '../../services/reranking.service';
import { RAGModule } from '../../rag.module';

// Mock LangChain components to avoid external dependencies
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue('Integration test response')
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
  PromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({}),
  },
}));
            metadata: { source: 'qa_test.txt' }
          })
        ]
      })
    })
  },
  loadQAStuffChain: jest.fn().mockReturnValue({}),
  loadQAMapReduceChain: jest.fn().mockReturnValue({}),
  loadQARefineChain: jest.fn().mockReturnValue({}),
  LLMChain: jest.fn().mockReturnValue({
    call: jest.fn().mockResolvedValue({ text: 'LLM response' })
  })
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
    _llmType: 'mock'
  } as any;

  const mockRetriever = {
    getRelevantDocuments: jest.fn().mockResolvedValue([
      new Document({
        pageContent: 'Relevant document about machine learning',
        metadata: { source: 'ml_doc.txt', score: 0.9 }
      }),
      new Document({
        pageContent: 'Another document about AI applications',
        metadata: { source: 'ai_doc.txt', score: 0.8 }
      })
    ])
  } as any;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [RAGModule],
    }).compile();

    conversationalService = module.get<ConversationalRetrievalService>(ConversationalRetrievalService);
    qaService = module.get<QARetrievalService>(QARetrievalService);
    ensembleService = module.get<EnsembleRetrieverService>(EnsembleRetrieverService);
    rerankingService = module.get<RerankingService>(RerankingService);
  });

  afterAll(async () => {
    await module.close();
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
        returnSourceDocuments: true
      });

      expect(conversationalChain).toBeDefined();

      // Step 2: Execute conversational retrieval
      const conversationalResult = await conversationalService.executeConversationalRetrieval(
        conversationalChain,
        'What is machine learning?',
        []
      );

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
        chainType: 'stuff'
      });

      expect(qaChain).toBeDefined();

      // Step 2: Execute QA retrieval with citations
      const qaResult = await qaService.executeQARetrievalWithCitations(
        qaChain,
        'Explain artificial intelligence',
        { format: 'numbered', includeFullCitation: true }
      );

      expect(qaResult).toBeDefined();
      expect(qaResult.answer).toBe('QA integration response');
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
        removeDuplicates: true
      });

      expect(ensembleRetriever).toBeDefined();

      // Step 2: Execute ensemble retrieval
      const ensembleResults = await ensembleService.executeEnsembleRetrieval(
        ensembleRetriever,
        'machine learning applications',
        { k: 5, includeMetadata: true }
      );

      expect(ensembleResults).toBeDefined();
      expect(Array.isArray(ensembleResults)).toBe(true);

      // Step 3: Apply reranking
      if (ensembleResults.length > 0) {
        const rerankedResults = await rerankingService.applyMMRReranking(
          ensembleResults,
          'machine learning applications',
          { lambda: 0.5, k: 3 }
        );

        expect(rerankedResults).toBeDefined();
        expect(rerankedResults.length).toBeLessThanOrEqual(3);
        expect(rerankedResults.every(r => r.rerankingMethod === 'mmr')).toBe(true);
      }
    });

    it('should execute hybrid retrieval and reranking workflow', async () => {
      // Step 1: Create hybrid retriever
      const hybridRetriever = ensembleService.createHybridRetriever({
        denseRetriever: mockRetriever,
        sparseRetriever: mockRetriever,
        denseWeight: 0.7,
        sparseWeight: 0.3,
        fusionMethod: 'weighted_sum'
      });

      expect(hybridRetriever).toBeDefined();

      // Step 2: Execute hybrid retrieval
      const hybridResults = await ensembleService.executeEnsembleRetrieval(
        hybridRetriever,
        'deep learning neural networks',
        { k: 10, parallelize: true }
      );

      expect(hybridResults).toBeDefined();

      // Step 3: Apply hybrid reranking
      if (hybridResults.length > 0) {
        const hybridRerankedResults = await rerankingService.applyHybridReranking(
          hybridResults,
          'deep learning neural networks',
          mockLLM,
          {
            strategies: [
              { method: 'mmr', weight: 0.4 },
              { method: 'llm_chain', weight: 0.4 },
              { method: 'cross_encoder', weight: 0.2 }
            ],
            fusionMethod: 'weighted_sum',
            normalizeScores: true
          }
        );

        expect(hybridRerankedResults).toBeDefined();
        expect(hybridRerankedResults.length).toBeGreaterThan(0);

        // Verify scores are normalized (between 0 and 1)
        const scores = hybridRerankedResults.map(r => r.rerankedScore);
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
        retriever: mockRetriever
      });

      const qaChain = await qaService.createQAChain({
        llm: mockLLM,
        retriever: mockRetriever
      });

      // Execute both
      const conversationalPromise = conversationalService.executeConversationalRetrieval(
        conversationalChain,
        'What is AI?',
        []
      );

      const qaPromise = qaService.executeQARetrieval(qaChain, 'What is AI?');

      const [conversationalResult, qaResult] = await Promise.all([
        conversationalPromise,
        qaPromise
      ]);

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
          metadata: { source: 'ml1.txt', score: 0.9 }
        }),
        new Document({
          pageContent: 'Deep learning neural network architectures',
          metadata: { source: 'dl1.txt', score: 0.85 }
        }),
        new Document({
          pageContent: 'Natural language processing techniques',
          metadata: { source: 'nlp1.txt', score: 0.8 }
        })
      ];

      // Apply MMR reranking
      const mmrResults = await rerankingService.applyMMRReranking(
        sampleDocs,
        'machine learning algorithms',
        { lambda: 0.6, k: 2 }
      );

      // Apply LLM reranking
      const llmResults = await rerankingService.applyLLMChainReranking(
        sampleDocs,
        'machine learning algorithms',
        mockLLM,
        { batchSize: 2 }
      );

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
        getRelevantDocuments: jest.fn().mockRejectedValue(new Error('Retriever error'))
      } as any;

      // Test conversational service error handling
      const conversationalChain = conversationalService.createConversationalChain({
        llm: mockLLM,
        retriever: errorRetriever
      });

      // Should not throw during chain creation
      expect(conversationalChain).toBeDefined();

      // Test ensemble service error handling
      const ensembleRetriever = ensembleService.createEnsembleRetriever({
        retrievers: [mockRetriever, errorRetriever]
      });

      // Should handle one failing retriever gracefully
      const results = await ensembleService.executeEnsembleRetrieval(
        ensembleRetriever,
        'test query'
      );

      expect(results).toBeDefined();
    });

    it('should validate configurations across services', () => {
      // Test conversational service validation
      const conversationalValidation = conversationalService.validateConfig({
        llm: mockLLM,
        retriever: mockRetriever,
        memoryWindowSize: -1 // Invalid
      });

      expect(conversationalValidation.warnings.length).toBeGreaterThan(0);

      // Test ensemble service validation
      expect(() => {
        ensembleService.createEnsembleRetriever({
          retrievers: [] // Invalid
        });
      }).toThrow('At least one retriever is required');

      // Test reranking service validation
      expect(() => {
        rerankingService.createRerankingRetriever({
          baseRetriever: mockRetriever,
          llm: mockLLM,
          mmrLambda: 2.0 // Invalid
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
        retriever: mockRetriever
      });

      const result = await conversationalService.executeConversationalRetrieval(
        conversationalChain,
        'Test performance query',
        [],
        { includeMetrics: true }
      );

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      expect(result).toBeDefined();
      expect(totalLatency).toBeGreaterThan(0);

      // Check if metrics are included
      if (result.sourceDocuments && result.sourceDocuments.length > 0) {
        expect(result.sourceDocuments[0].metadata).toHaveProperty('ragMetrics');
      }
    });

    it('should analyze reranking effectiveness', async () => {
      const testDocuments = [
        new Document({
          pageContent: 'Original document 1',
          metadata: { score: 0.8 }
        }),
        new Document({
          pageContent: 'Original document 2',
          metadata: { score: 0.7 }
        })
      ];

      const rerankedResults = await rerankingService.applyMMRReranking(
        testDocuments,
        'test query'
      );

      const analysis = await rerankingService.analyzeRerankingEffectiveness(
        testDocuments,
        rerankedResults,
        'test query'
      );

      expect(analysis).toBeDefined();
      expect(analysis.metrics).toBeDefined();
      expect(analysis.analysis).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });
});