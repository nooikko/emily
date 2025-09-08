import { Test, TestingModule } from '@nestjs/testing';
import { QARetrievalService } from '../services/qa-retrieval.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { Document } from '@langchain/core/documents';
import type { QARetrievalConfig } from '../interfaces/rag.interface';

// Mock LangChain components
jest.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue('Mock QA response')
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

describe('QARetrievalService', () => {
  let service: QARetrievalService;
  let mockCallbackManager: jest.Mocked<CallbackManagerService>;
  let mockLangSmith: jest.Mocked<LangSmithService>;
  let mockMetrics: jest.Mocked<AIMetricsService>;
  let mockInstrumentation: jest.Mocked<LangChainInstrumentationService>;

  // Mock LLM and Retriever
  const mockLLM = {
    call: jest.fn().mockResolvedValue('Mock LLM response'),
    _modelType: 'base_llm',
    _llmType: 'mock'
  } as any;

  const mockRetriever = {
    getRelevantDocuments: jest.fn().mockResolvedValue([
      new Document({ 
        pageContent: 'Test document content',
        metadata: { source: 'test.txt', score: 0.85 }
      })
    ])
  } as any;

  beforeEach(async () => {
    // Create mocks
    mockCallbackManager = {
      createCallbackManager: jest.fn().mockReturnValue({
        handlers: []
      })
    } as any;

    mockLangSmith = {
      isEnabled: jest.fn().mockReturnValue(true),
      createTraceable: jest.fn().mockImplementation((name, fn) => fn),
      createMetadata: jest.fn().mockReturnValue({}),
      maskSensitiveObject: jest.fn().mockImplementation(obj => obj)
    } as any;

    mockMetrics = {
      recordOperationDuration: jest.fn()
    } as any;

    mockInstrumentation = {
      startSpan: jest.fn(),
      endSpan: jest.fn()
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QARetrievalService,
        { provide: CallbackManagerService, useValue: mockCallbackManager },
        { provide: LangSmithService, useValue: mockLangSmith },
        { provide: AIMetricsService, useValue: mockMetrics },
        { provide: LangChainInstrumentationService, useValue: mockInstrumentation }
      ]
    }).compile();

    service = module.get<QARetrievalService>(QARetrievalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createQAChain', () => {
    it('should create QA chain with default stuff type', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever
      };

      const chain = await service.createQAChain(config);
      
      expect(chain).toBeDefined();
      // Verify RunnableSequence.from was called
      const { RunnableSequence } = require('@langchain/core/runnables');
      expect(RunnableSequence.from).toHaveBeenCalled();
    });

    it('should create QA chain with map_reduce type', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'map_reduce'
      };

      const chain = await service.createQAChain(config);
      
      expect(chain).toBeDefined();
    });

    it('should create QA chain with refine type', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'refine'
      };

      const chain = await service.createQAChain(config);
      
      expect(chain).toBeDefined();
    });

    it('should create QA chain with map_rerank type', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'map_rerank'
      };

      const chain = await service.createQAChain(config);
      
      expect(chain).toBeDefined();
    });

    it('should throw error for unsupported chain type', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'unsupported_type'
      } as any;

      await expect(service.createQAChain(config)).rejects.toThrow('Unsupported chain type: unsupported_type');
    });

    it('should create chain with custom prompt', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        prompt: 'Custom prompt: {context}\nQuestion: {question}\nAnswer:',
        returnIntermediateSteps: true
      };

      const chain = await service.createQAChain(config);
      
      expect(chain).toBeDefined();
    });
  });

  describe('executeQARetrieval', () => {
    let mockChain: any;

    beforeEach(() => {
      mockChain = {
        invoke: jest.fn().mockResolvedValue('This is the QA answer')
      };

      // Mock retriever to return documents for source tracking
      mockRetriever.getRelevantDocuments.mockResolvedValue([
        new Document({ 
          pageContent: 'Source 1 content',
          metadata: { source: 'doc1.txt', score: 0.9 }
        }),
        new Document({ 
          pageContent: 'Source 2 content',
          metadata: { source: 'doc2.txt', score: 0.8 }
        })
      ]);
    });

    it('should execute QA retrieval successfully', async () => {
      const question = 'What is machine learning?';

      const result = await service.executeQARetrieval(mockChain, question);

      expect(result).toBeDefined();
      expect(result.answer).toBe('This is the QA answer');
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].document.pageContent).toBe('Source 1 content');
      expect(result.sources[0].score).toBe(0.9);
      expect(result.sources[0].metadata?.retrievalRank).toBe(1);
      
      expect(mockChain.invoke).toHaveBeenCalledWith(
        { question },
        expect.any(Object)
      );
    });

    it('should include intermediate steps when available', async () => {
      const question = 'Test question';

      const result = await service.executeQARetrieval(mockChain, question);

      expect(result.intermediateSteps).toBeDefined();
      expect(result.intermediateSteps).toHaveLength(2);
      expect(result.intermediateSteps![0]).toEqual({
        step: 'step_1',
        output: { step: 'retrieval', output: 'Retrieved documents' }
      });
    });

    it('should include metrics when requested', async () => {
      const question = 'Test question with metrics';

      const result = await service.executeQARetrieval(
        mockChain, 
        question, 
        { includeMetrics: true }
      );

      expect(result.sources[0].metadata).toHaveProperty('ragMetrics');
      expect(result.sources[0].metadata?.ragMetrics).toHaveProperty('totalLatency');
      expect(result.sources[0].metadata?.ragMetrics).toHaveProperty('documentsRetrieved');
    });

    it('should handle chain without source documents', async () => {
      const chainWithoutSources = {
        invoke: jest.fn().mockResolvedValue('Answer without sources')
      } as any;

      // Mock retriever to return empty results
      mockRetriever.getRelevantDocuments.mockResolvedValueOnce([]);

      const result = await service.executeQARetrieval(chainWithoutSources, 'Test question');

      expect(result.answer).toBe('Answer without sources');
      expect(result.sources).toHaveLength(0);
    });

    it('should handle chain errors gracefully', async () => {
      const errorChain = {
        invoke: jest.fn().mockRejectedValue(new Error('Chain execution failed'))
      } as any;

      await expect(
        service.executeQARetrieval(errorChain, 'Test question')
      ).rejects.toThrow('QA retrieval failed: Chain execution failed');
    });

    it('should handle empty query', async () => {
      const result = await service.executeQARetrieval(mockChain, '');

      expect(result).toBeDefined();
      expect(mockChain.invoke).toHaveBeenCalledWith({ question: '' }, expect.any(Object));
    });
  });

  describe('createCitationQAChain', () => {
    it('should create citation QA chain with numbered format', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        citationFormat: 'numbered' as const
      };

      const chain = await service.createCitationQAChain(config);
      
      expect(chain).toBeDefined();
    });

    it('should create citation QA chain with author_year format', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever,
        citationFormat: 'author_year' as const
      };

      const chain = await service.createCitationQAChain(config);
      
      expect(chain).toBeDefined();
    });

    it('should use default numbered format when not specified', async () => {
      const config = {
        llm: mockLLM,
        retriever: mockRetriever
      };

      const chain = await service.createCitationQAChain(config);
      
      expect(chain).toBeDefined();
    });
  });

  describe('executeQARetrievalWithCitations', () => {
    let mockChain: any;

    beforeEach(() => {
      mockChain = {
        invoke: jest.fn().mockResolvedValue('Answer with citations [1][2]')
      };

      // Mock retriever for citations
      mockRetriever.getRelevantDocuments.mockResolvedValue([
        new Document({ 
          pageContent: 'Document 1 content',
          metadata: { source: 'doc1.txt', title: 'Document 1', author: 'Author 1', year: 2023 }
        }),
        new Document({ 
          pageContent: 'Document 2 content',
          metadata: { source: 'doc2.txt', title: 'Document 2', url: 'http://example.com/doc2' }
        })
      ]);
    });

    it('should execute QA retrieval with numbered citations', async () => {
      const citationConfig = { format: 'numbered' as const, includeFullCitation: true };

      const result = await service.executeQARetrievalWithCitations(
        mockChain, 
        'Test question',
        citationConfig
      );

      expect(result.answer).toBe('Answer with citations [1][2]');
      expect(result.citations).toBeDefined();
      expect(result.citations[0]).toContain('[1]');
      expect(result.citations[0]).toContain('Document 1');
      expect(result.citationMap).toBeDefined();
      expect(result.citationMap.citation_1).toBeDefined();
    });

    it('should execute QA retrieval with author-year citations', async () => {
      const citationConfig = { format: 'author_year' as const };

      const result = await service.executeQARetrievalWithCitations(
        mockChain,
        'Test question',
        citationConfig
      );

      expect(result.citations[0]).toContain('(Author 1, 2023)');
    });

    it('should limit citations when maxCitations specified', async () => {
      const citationConfig = { format: 'numbered' as const, maxCitations: 1 };

      const result = await service.executeQARetrievalWithCitations(
        mockChain,
        'Test question',
        citationConfig
      );

      expect(result.citations).toHaveLength(1);
    });
  });

  describe('validateSources', () => {
    const mockSources = [
      {
        document: new Document({
          pageContent: 'High quality document with good content that is relevant to machine learning',
          metadata: { source: 'doc1.txt' }
        }),
        score: 0.85
      },
      {
        document: new Document({
          pageContent: 'Short',
          metadata: { source: 'doc2.txt' }
        }),
        score: 0.9
      },
      {
        document: new Document({
          pageContent: 'Low relevance document about cooking recipes and food preparation',
          metadata: { source: 'doc3.txt' }
        }),
        score: 0.4
      }
    ];

    it('should validate sources with default threshold', () => {
      const question = 'What is machine learning?';
      
      const validation = service.validateSources(mockSources, question);

      expect(validation.validSources.length).toBeGreaterThan(0);
      expect(validation.invalidSources.length).toBeGreaterThan(0);
      expect(validation.qualityScore).toBeGreaterThan(0);
      expect(validation.qualityScore).toBeLessThanOrEqual(1);
    });

    it('should validate sources with custom threshold', () => {
      const question = 'What is machine learning?';
      const threshold = 0.9;
      
      const validation = service.validateSources(mockSources, question, threshold);

      // With high threshold, fewer sources should be valid
      expect(validation.validSources.length).toBeLessThanOrEqual(mockSources.length);
      expect(validation.invalidSources.some(invalid => 
        invalid.reason.includes('Score')
      )).toBe(true);
    });

    it('should identify short content as invalid', () => {
      const question = 'What is machine learning?';
      
      const validation = service.validateSources(mockSources, question);

      const shortContentInvalid = validation.invalidSources.find(invalid =>
        invalid.reason.includes('too short')
      );
      expect(shortContentInvalid).toBeDefined();
    });

    it('should handle empty sources array', () => {
      const validation = service.validateSources([], 'Test question');

      expect(validation.validSources).toHaveLength(0);
      expect(validation.invalidSources).toHaveLength(0);
      expect(validation.qualityScore).toBe(0);
    });
  });

  describe('chain type specific methods', () => {
    it('should create stuff chain with default prompt', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'stuff'
      };

      // Access private method through service
      const chain = await service.createQAChain(config);
      expect(chain).toBeDefined();
    });

    it('should create map-reduce chain', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'map_reduce'
      };

      const chain = await service.createQAChain(config);
      expect(chain).toBeDefined();
    });

    it('should create refine chain', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever,
        chainType: 'refine'
      };

      const chain = await service.createQAChain(config);
      expect(chain).toBeDefined();
    });
  });

  describe('private utility methods', () => {
    describe('calculateRelevance', () => {
      it('should calculate relevance correctly', () => {
        const content = 'Machine learning is a subset of artificial intelligence';
        const question = 'What is machine learning?';
        
        // Access private method
        const relevance = (service as any).calculateRelevance(content, question);
        
        expect(relevance).toBeGreaterThan(0);
        expect(relevance).toBeLessThanOrEqual(1);
      });

      it('should return low relevance for unrelated content', () => {
        const content = 'Cooking recipes and food preparation techniques';
        const question = 'What is machine learning?';
        
        const relevance = (service as any).calculateRelevance(content, question);
        
        expect(relevance).toBeLessThan(0.5);
      });
    });

    describe('generateCitations', () => {
      const mockSources = [
        {
          document: new Document({
            pageContent: 'Document content 1',
            metadata: { title: 'AI Research Paper', author: 'John Doe', year: 2023, url: 'http://example.com/paper1' }
          })
        },
        {
          document: new Document({
            pageContent: 'Document content 2',
            metadata: { title: 'ML Tutorial', url: 'http://example.com/tutorial' }
          })
        }
      ];

      it('should generate numbered citations', () => {
        const config = { format: 'numbered' as const };
        
        const citations = (service as any).generateCitations(mockSources, config);
        
        expect(citations[0]).toBe('[1] AI Research Paper');
        expect(citations[1]).toBe('[2] ML Tutorial');
      });

      it('should generate author-year citations', () => {
        const config = { format: 'author_year' as const };
        
        const citations = (service as any).generateCitations(mockSources, config);
        
        expect(citations[0]).toBe('(John Doe, 2023)');
        expect(citations[1]).toBe('(Unknown, n.d.)');
      });

      it('should limit citations when maxCitations specified', () => {
        const config = { format: 'numbered' as const, maxCitations: 1 };
        
        const citations = (service as any).generateCitations(mockSources, config);
        
        expect(citations).toHaveLength(1);
      });
    });

    describe('estimateTokens', () => {
      it('should estimate tokens correctly', () => {
        const text = 'This is a test message with multiple words';
        
        const tokens = (service as any).estimateTokens(text);
        
        expect(tokens).toBe(Math.ceil(text.length / 4));
      });

      it('should handle empty strings', () => {
        const tokens = (service as any).estimateTokens('');
        
        expect(tokens).toBe(0);
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed chain responses', async () => {
      const malformedChain = {
        invoke: jest.fn().mockResolvedValue(null) // Simulate malformed response
      } as any;

      const result = await service.executeQARetrieval(malformedChain, 'Test question');

      expect(result.answer).toBe('');
      expect(result.sources).toHaveLength(0);
    });

    it('should handle retriever errors during chain creation', async () => {
      const errorRetriever = {
        getRelevantDocuments: jest.fn().mockRejectedValue(new Error('Retriever error'))
      } as any;

      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: errorRetriever
      };

      // Chain creation should succeed even if retriever might fail later
      const chain = await service.createQAChain(config);
      expect(chain).toBeDefined();
    });
  });

  describe('integration with observability', () => {
    it('should integrate with LangSmith when enabled', async () => {
      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever
      };

      const chain = await service.createQAChain(config);
      await service.executeQARetrieval(chain, 'Test question');

      expect(mockLangSmith.isEnabled).toHaveBeenCalled();
      expect(mockLangSmith.createTraceable).toHaveBeenCalled();
    });

    it('should work without LangSmith', async () => {
      mockLangSmith.isEnabled.mockReturnValue(false);

      const config: QARetrievalConfig = {
        llm: mockLLM,
        retriever: mockRetriever
      };

      const chain = await service.createQAChain(config);
      const result = await service.executeQARetrieval(chain, 'Test question');

      expect(result).toBeDefined();
      expect(mockLangSmith.createTraceable).not.toHaveBeenCalled();
    });
  });
});