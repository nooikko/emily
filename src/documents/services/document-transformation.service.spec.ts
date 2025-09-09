import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentTransformationService } from './document-transformation.service';

describe('DocumentTransformationService', () => {
  let service: DocumentTransformationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentTransformationService],
    }).compile();

    service = module.get<DocumentTransformationService>(DocumentTransformationService);
  });

  describe('default chains initialization', () => {
    it('should initialize default transformation chains', () => {
      const chains = [
        'text-cleaner',
        'whitespace-normalizer',
        'unicode-normalizer',
        'header-footer-remover',
        'language-detector',
        'structure-analyzer',
      ];

      for (const chainName of chains) {
        const chain = service['transformationChains'].get(chainName);
        expect(chain).toBeDefined();
        expect(chain?.name).toBe(chainName);
        expect(chain?.chain).toBeDefined();
      }
    });
  });

  describe('registerChain', () => {
    it('should register a custom transformation chain', () => {
      const customChain = {
        name: 'custom-chain',
        description: 'Custom transformation',
        type: 'custom' as const,
        chain: RunnableLambda.from((doc: Document) => doc),
      };

      service.registerChain(customChain);
      const registered = service['transformationChains'].get('custom-chain');

      expect(registered).toBeDefined();
      expect(registered?.name).toBe('custom-chain');
    });
  });

  describe('text cleaning transformations', () => {
    it('should clean text by removing special characters', async () => {
      const document = new Document({
        pageContent: 'Test @#$% content with special chars!',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'text-cleaner');

      expect(result.transformed.pageContent).toBe('Test content with special chars!');
      expect(result.transformed.metadata.cleaned).toBe(true);
      expect(result.metadata.success).toBe(true);
    });

    it('should normalize whitespace', async () => {
      const document = new Document({
        pageContent: 'Test\t\tcontent   with\n\n\n\nmultiple    spaces',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'whitespace-normalizer');

      expect(result.transformed.pageContent).toContain('Test content with');
      expect(result.transformed.pageContent).not.toContain('\t');
      expect(result.transformed.pageContent).not.toContain('\n\n\n\n');
      expect(result.transformed.metadata.whitespaceNormalized).toBe(true);
    });

    it('should normalize unicode characters', async () => {
      const document = new Document({
        pageContent: 'Test "smart quotes" and — dashes… ellipsis',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'unicode-normalizer');

      expect(result.transformed.pageContent).toBe('Test "smart quotes" and - dashes... ellipsis');
      expect(result.transformed.metadata.unicodeNormalized).toBe(true);
    });

    it('should remove headers and footers', async () => {
      const document = new Document({
        pageContent: 'Page 1\nContent line 1\nContent line 2\nPage 1\nMore content\nPage 1\nAnother line\nPage 1',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'header-footer-remover');

      // Page 1 appears 4 times, so it should be detected as a header/footer and removed
      expect(result.transformed.pageContent).not.toContain('Page 1');
      expect(result.transformed.metadata.headersFootersRemoved).toBe(true);
      expect(result.transformed.metadata.removedLines).toBeGreaterThan(0);
    });
  });

  describe('enrichment transformations', () => {
    it('should detect document language', async () => {
      const document = new Document({
        pageContent: 'The quick brown fox jumps over the lazy dog. This is an English text with common words.',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'language-detector');

      expect(result.transformed.metadata.language).toBe('English');
      expect(result.transformed.metadata.languageCode).toBe('en');
      expect(result.transformed.metadata.languageConfidence).toBeDefined();
    });

    it('should analyze document structure', async () => {
      const document = new Document({
        pageContent: '# Heading\n\n- List item\n\n```code block```\n\n| Table | Cell |\n\n[Link](url)',
        metadata: {},
      });

      const result = await service.transformDocument(document, 'structure-analyzer');

      expect(result.transformed.metadata.structure).toBeDefined();
      expect(result.transformed.metadata.structure.hasHeadings).toBe(true);
      expect(result.transformed.metadata.structure.hasList).toBe(true);
      expect(result.transformed.metadata.structure.hasCodeBlocks).toBe(true);
      expect(result.transformed.metadata.structure.hasTables).toBe(true);
      expect(result.transformed.metadata.structure.hasLinks).toBe(true);
      expect(result.transformed.metadata.structure.estimatedReadingTime).toBeGreaterThan(0);
    });
  });

  describe('createPreprocessingChain', () => {
    it('should create a preprocessing chain with specified cleaners', async () => {
      const config = {
        cleaning: {
          removeExtraWhitespace: true,
          normalizeUnicode: true,
          removeSpecialCharacters: true,
        },
      };

      const chain = await service.createPreprocessingChain(config);
      expect(chain).toBeDefined();

      const document = new Document({
        pageContent: 'Test   "content"   with    spaces',
        metadata: {},
      });

      const result = await chain.invoke(document);
      expect(result).toBeDefined();
    });

    it('should include custom preprocessors', async () => {
      const config = {
        preprocessing: [
          {
            name: 'uppercase',
            transformer: async (doc: Document) =>
              new Document({
                pageContent: doc.pageContent.toUpperCase(),
                metadata: { ...doc.metadata, uppercased: true },
              }),
          },
        ],
      };

      const chain = await service.createPreprocessingChain(config);
      const document = new Document({ pageContent: 'test content' });
      const result = (await chain.invoke(document)) as Document;

      expect(result.pageContent).toBe('TEST CONTENT');
      expect(result.metadata.uppercased).toBe(true);
    });
  });

  describe('createEnrichmentChain', () => {
    it('should create enrichment chain with timestamps', async () => {
      const config = {
        enrichment: {
          addTimestamps: true,
          addDocumentId: true,
          addSourceInfo: true,
        },
      };

      const chain = await service.createEnrichmentChain(config);
      const document = new Document({ pageContent: 'Test content' });
      const result = await chain.invoke(document);

      expect(result).toBeDefined();
    });

    it('should include custom enrichers', async () => {
      const config = {
        enrichment: {
          customEnrichers: [
            {
              name: 'word-counter',
              enricher: async (doc: Document) =>
                new Document({
                  pageContent: doc.pageContent,
                  metadata: { ...doc.metadata, wordCount: doc.pageContent.split(' ').length },
                }),
            },
          ],
        },
      };

      const chain = await service.createEnrichmentChain(config);
      const document = new Document({ pageContent: 'One two three four' });
      const result = await chain.invoke(document);

      expect(result).toBeDefined();
    });
  });

  describe('createCompositeChain', () => {
    it('should create a composite chain from multiple chains', async () => {
      const chains = ['whitespace-normalizer', 'unicode-normalizer'];
      const composite = await service.createCompositeChain(chains);

      const document = new Document({
        pageContent: 'Test\t"content"   with—dashes',
        metadata: {},
      });

      const result = (await composite.invoke(document)) as Document;
      expect(result.pageContent).not.toContain('\t');
      expect(result.pageContent).toContain('"');
      expect(result.pageContent).toContain('-');
    });

    it('should throw error for invalid chain names', async () => {
      await expect(service.createCompositeChain(['non-existent'])).rejects.toThrow('No valid chains provided for composite chain');
    });
  });

  describe('transformDocument', () => {
    it('should transform document and track metadata', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: { source: 'test.txt' },
      });

      const result = await service.transformDocument(document, 'text-cleaner');

      expect(result.original).toBe(document);
      expect(result.transformed).toBeDefined();
      expect(result.chainName).toBe('text-cleaner');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata.success).toBe(true);
      expect(result.metadata.transformationId).toBeDefined();
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
      expect(result.metadata.stats).toBeDefined();
    });

    it('should handle transformation errors gracefully', async () => {
      // Register a failing chain
      service.registerChain({
        name: 'failing-chain',
        description: 'Chain that fails',
        type: 'custom',
        chain: RunnableLambda.from(async () => {
          throw new Error('Transformation failed');
        }),
      });

      const document = new Document({ pageContent: 'Test' });
      const result = await service.transformDocument(document, 'failing-chain');

      expect(result.metadata.success).toBe(false);
      expect(result.metadata.error).toBe('Transformation failed');
      expect(result.transformed).toBe(document); // Returns original on error
    });

    it('should throw error for non-existent chain', async () => {
      const document = new Document({ pageContent: 'Test' });
      await expect(service.transformDocument(document, 'non-existent')).rejects.toThrow("Transformation chain 'non-existent' not found");
    });
  });

  describe('transformBatch', () => {
    it('should transform multiple documents', async () => {
      const documents = [
        new Document({ pageContent: 'Doc 1   content' }),
        new Document({ pageContent: 'Doc 2\tcontent' }),
        new Document({ pageContent: 'Doc 3\n\n\ncontent' }),
      ];

      const results = await service.transformBatch(documents, 'whitespace-normalizer');

      expect(results).toHaveLength(3);
      expect(results[0].metadata.success).toBe(true);
      expect(results[1].metadata.success).toBe(true);
      expect(results[2].metadata.success).toBe(true);
    });
  });

  describe('executePipeline', () => {
    it('should execute sequential pipeline', async () => {
      const document = new Document({
        pageContent: 'Test\t"content"   with—special@chars',
        metadata: {},
      });

      const pipelineConfig = {
        chains: [
          { name: 'whitespace-normalizer', chain: service['transformationChains'].get('whitespace-normalizer')!.chain },
          { name: 'unicode-normalizer', chain: service['transformationChains'].get('unicode-normalizer')!.chain },
          { name: 'text-cleaner', chain: service['transformationChains'].get('text-cleaner')!.chain },
        ],
        parallel: false,
        stopOnError: true,
      };

      const result = await service.executePipeline(document, pipelineConfig);

      expect(result.pageContent).not.toContain('\t');
      expect(result.pageContent).not.toContain('@');
      expect(result.metadata.cleaned).toBe(true);
    });

    it('should execute parallel pipeline', async () => {
      const document = new Document({
        pageContent: 'The quick brown fox jumps over the lazy dog',
        metadata: {},
      });

      const pipelineConfig = {
        chains: [
          { name: 'language-detector', chain: service['transformationChains'].get('language-detector')!.chain },
          { name: 'structure-analyzer', chain: service['transformationChains'].get('structure-analyzer')!.chain },
        ],
        parallel: true,
      };

      const result = await service.executePipeline(document, pipelineConfig);

      expect(result.metadata).toBeDefined();
    });

    it('should handle pipeline errors based on configuration', async () => {
      // Register a failing chain
      service.registerChain({
        name: 'failing-chain',
        description: 'Chain that fails',
        type: 'custom',
        chain: RunnableLambda.from(async () => {
          throw new Error('Pipeline error');
        }),
      });

      const document = new Document({ pageContent: 'Test' });

      // Test stopOnError = false
      const pipelineConfig1 = {
        chains: [
          { name: 'failing-chain', chain: service['transformationChains'].get('failing-chain')!.chain },
          { name: 'text-cleaner', chain: service['transformationChains'].get('text-cleaner')!.chain },
        ],
        parallel: false,
        stopOnError: false,
      };

      const result1 = await service.executePipeline(document, pipelineConfig1);
      expect(result1.metadata.pipelineErrors).toBeDefined();
      expect(result1.metadata.pipelineErrors).toContain('failing-chain: Pipeline error');

      // Test stopOnError = true
      const pipelineConfig2 = {
        chains: [{ name: 'failing-chain', chain: service['transformationChains'].get('failing-chain')!.chain }],
        parallel: false,
        stopOnError: true,
      };

      await expect(service.executePipeline(document, pipelineConfig2)).rejects.toThrow('Pipeline error');
    });

    it('should retry failed transformations', async () => {
      let attempts = 0;
      service.registerChain({
        name: 'flaky-chain',
        description: 'Chain that fails once',
        type: 'custom',
        chain: RunnableLambda.from(async (doc: Document) => {
          attempts++;
          if (attempts === 1) {
            throw new Error('First attempt failed');
          }
          return doc;
        }),
      });

      const document = new Document({ pageContent: 'Test' });
      const pipelineConfig = {
        chains: [{ name: 'flaky-chain', chain: service['transformationChains'].get('flaky-chain')!.chain }],
        parallel: false,
        retryCount: 2,
      };

      const result = await service.executePipeline(document, pipelineConfig);
      expect(result).toBeDefined();
      expect(attempts).toBe(2);
    });
  });

  describe('transformation statistics', () => {
    it('should calculate transformation statistics', async () => {
      const original = new Document({
        pageContent: 'Original content with some text',
        metadata: { key1: 'value1' },
      });

      const transformed = new Document({
        pageContent: 'Modified content',
        metadata: { key1: 'value1', key2: 'value2', key3: 'value3' },
      });

      const stats = service['calculateTransformationStats'](original, transformed);

      expect(stats.originalLength).toBe(original.pageContent.length);
      expect(stats.transformedLength).toBe(transformed.pageContent.length);
      expect(stats.lengthChange).toBe(transformed.pageContent.length - original.pageContent.length);
      expect(stats.compressionRatio).toBeLessThan(1);
      expect(stats.metadataKeysAdded).toBe(2);
    });
  });
});
