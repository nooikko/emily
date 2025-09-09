import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { MetadataExtractionConfig } from '../interfaces/document-loader.interface';
import { MetadataExtractionService } from './metadata-extraction.service';

jest.mock('fs/promises');

describe('MetadataExtractionService', () => {
  let service: MetadataExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetadataExtractionService],
    }).compile();

    service = module.get<MetadataExtractionService>(MetadataExtractionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract file properties from document', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: {
          source: '/test/file.txt',
          format: 'text',
          mimeType: 'text/plain',
        },
      });

      const mockStats = {
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02'),
        isFile: () => true,
      };
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);

      const result = await service.extractMetadata(document, {
        extractFileProperties: true,
        extractContentMetadata: false,
      });

      expect(result.fileProperties).toBeDefined();
      expect(result.fileProperties?.fileName).toBe('file.txt');
      expect(result.fileProperties?.fileSize).toBe(1024);
      expect(result.fileProperties?.format).toBe('text');
      expect(result.fileProperties?.checksum).toBeDefined();
    });

    it('should extract content metadata from document', async () => {
      const document = new Document({
        pageContent: '# Test Document\n\nThis is a test document with some content. It contains good information and is very helpful.',
        metadata: {},
      });

      const result = await service.extractMetadata(document, {
        extractContentMetadata: true,
        extractFileProperties: false,
      });

      expect(result.contentMetadata).toBeDefined();
      expect(result.contentMetadata?.title).toBe('Test Document');
      expect(result.contentMetadata?.language).toBe('en');
      expect(result.contentMetadata?.sentiment).toBe('positive');
      expect(result.contentMetadata?.readabilityScore).toBeGreaterThan(0);
    });

    it('should extract structural metadata from document', async () => {
      const document = new Document({
        pageContent: `First paragraph.

Second paragraph with more text.

Third paragraph. This has multiple sentences. Each one is important.

\`\`\`javascript
const code = "example";
\`\`\`

![image](image.png)

| Header | Value |
|--------|-------|
| Test   | Data  |`,
        metadata: {},
      });

      const result = await service.extractMetadata(document);

      expect(result.structuralMetadata).toBeDefined();
      expect(result.structuralMetadata?.paragraphCount).toBe(6);
      expect(result.structuralMetadata?.sentenceCount).toBeGreaterThan(3);
      expect(result.structuralMetadata?.hasCode).toBe(true);
      expect(result.structuralMetadata?.codeLanguages).toContain('javascript');
      expect(result.structuralMetadata?.hasImages).toBe(true);
      expect(result.structuralMetadata?.hasTables).toBe(true);
    });

    it('should extract keywords from document', async () => {
      const document = new Document({
        pageContent:
          'Machine learning is a subset of artificial intelligence. Machine learning algorithms learn from data. Data science uses machine learning for predictions.',
        metadata: {},
      });

      const result = await service.extractMetadata(document, {
        extractKeywords: true,
        extractContentMetadata: false,
      });

      expect(result.contentMetadata?.keywords).toBeDefined();
      expect(result.contentMetadata?.keywords).toContain('machine');
      expect(result.contentMetadata?.keywords).toContain('learning');
      expect(result.contentMetadata?.keywords?.length).toBeGreaterThan(0);
      expect(result.contentMetadata?.keywords?.length).toBeLessThanOrEqual(10);
    });

    it('should generate summary when requested', async () => {
      const document = new Document({
        pageContent: 'This is the first sentence. Here is some middle content that provides context. The document ends with this final statement.',
        metadata: {},
      });

      const result = await service.extractMetadata(document, {
        generateSummary: true,
        extractContentMetadata: false,
      });

      expect(result.contentMetadata?.summary).toBeDefined();
      expect(result.contentMetadata?.summary).toContain('first sentence');
      expect(result.contentMetadata?.summary?.length).toBeLessThanOrEqual(500);
    });

    it('should classify document type', async () => {
      const testCases = [
        {
          content: 'function test() { return "hello"; } class MyClass { constructor() {} }',
          expectedCategory: 'code',
        },
        {
          content: 'API endpoint /users returns a JSON response with user data. REST API documentation.',
          expectedCategory: 'technical-api',
        },
        {
          content: 'Meeting agenda for 2024-01-15. Discussion points: budget review, project timeline.',
          expectedCategory: 'meeting-notes',
        },
        {
          content: 'User story: As a user, I want to login. Requirement: System shall provide authentication.',
          expectedCategory: 'requirements',
        },
        {
          content: 'Error: NullPointerException at line 42. Stack trace shows issue in main function.',
          expectedCategory: 'bug-report',
        },
      ];

      for (const testCase of testCases) {
        const document = new Document({
          pageContent: testCase.content,
          metadata: {},
        });

        const result = await service.extractMetadata(document, {
          classifyDocument: true,
          extractContentMetadata: false,
        });

        expect(result.contentMetadata?.category).toBe(testCase.expectedCategory);
      }
    });

    it('should run custom extractors', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: {},
      });

      const customExtractor = jest.fn().mockResolvedValue({ custom: 'value' });

      const result = await service.extractMetadata(document, {
        customExtractors: [
          {
            name: 'customTest',
            extractor: customExtractor,
          },
        ],
      });

      expect(customExtractor).toHaveBeenCalledWith(document);
      expect(result.customMetadata).toBeDefined();
      expect(result.customMetadata?.customTest).toEqual({ custom: 'value' });
    });

    it('should handle extraction errors gracefully', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: {},
      });

      const failingExtractor = jest.fn().mockRejectedValue(new Error('Extraction failed'));

      const result = await service.extractMetadata(document, {
        customExtractors: [
          {
            name: 'failingTest',
            extractor: failingExtractor,
          },
        ],
      });

      expect(result.customMetadata?.failingTest).toEqual({ error: 'Extraction failed' });
    });

    it('should extract all metadata types in parallel', async () => {
      const document = new Document({
        pageContent:
          '# Technical Document\n\nThis document contains code:\n```js\nconsole.log("test");\n```\n\nIt has multiple paragraphs and good content.',
        metadata: {
          source: '/test/doc.md',
          format: 'markdown',
        },
      });

      (fs.stat as jest.Mock).mockResolvedValue({
        size: 2048,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02'),
        isFile: () => true,
      });

      const result = await service.extractMetadata(document, {
        extractFileProperties: true,
        extractContentMetadata: true,
        extractKeywords: true,
        generateSummary: true,
        classifyDocument: true,
      });

      expect(result.fileProperties).toBeDefined();
      expect(result.contentMetadata).toBeDefined();
      expect(result.structuralMetadata).toBeDefined();
      expect(result.contentMetadata?.keywords).toBeDefined();
      expect(result.contentMetadata?.keywords?.length).toBeGreaterThan(0);
      expect(result.contentMetadata?.summary).toBeDefined();
      expect(result.contentMetadata?.category).toBeDefined();
    });
  });

  describe('enrichDocument', () => {
    it('should enrich document with extracted metadata', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: { existing: 'value' },
      });

      const extractedMetadata = {
        fileProperties: {
          fileName: 'test.txt',
          fileSize: 1024,
        },
        contentMetadata: {
          title: 'Test Document',
          keywords: ['test', 'document'],
        },
        structuralMetadata: {
          wordCount: 100,
          sentenceCount: 5,
        },
      };

      const enrichedDoc = await service.enrichDocument(document, extractedMetadata);

      expect(enrichedDoc.pageContent).toBe(document.pageContent);
      expect(enrichedDoc.metadata.existing).toBe('value');
      expect(enrichedDoc.metadata.file_fileName).toBe('test.txt');
      expect(enrichedDoc.metadata.file_fileSize).toBe(1024);
      expect(enrichedDoc.metadata.title).toBe('Test Document');
      expect(enrichedDoc.metadata.keywords).toEqual(['test', 'document']);
      expect(enrichedDoc.metadata.structure_wordCount).toBe(100);
      expect(enrichedDoc.metadata.enrichedAt).toBeDefined();
    });

    it('should flatten entity metadata correctly', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: {},
      });

      const extractedMetadata = {
        contentMetadata: {
          entities: [
            { text: 'John Doe', type: 'person' as const },
            { text: 'Acme Corp', type: 'organization' as const },
            { text: 'New York', type: 'location' as const },
          ],
        },
      };

      const enrichedDoc = await service.enrichDocument(document, extractedMetadata);

      expect(enrichedDoc.metadata.entities).toBe('John Doe, Acme Corp, New York');
      expect(enrichedDoc.metadata.entityTypes).toBe('person, organization, location');
    });
  });

  describe('createEnrichmentChain', () => {
    it('should create a working enrichment chain', async () => {
      const config: MetadataExtractionConfig = {
        extractKeywords: true,
        generateSummary: false,
        extractContentMetadata: false,
      };

      const chain = service.createEnrichmentChain(config);

      const document = new Document({
        pageContent: 'Test document with important keywords like machine learning and data science.',
        metadata: {},
      });

      const enrichedDoc = await chain(document);

      expect(enrichedDoc.metadata.keywords).toBeDefined();
      expect(enrichedDoc.metadata.keywords).toContain('machine');
      expect(enrichedDoc.metadata.enrichedAt).toBeDefined();
    });
  });

  describe('batchExtractMetadata', () => {
    it('should process documents in batches', async () => {
      const documents = Array.from(
        { length: 10 },
        (_, i) =>
          new Document({
            pageContent: `Document ${i} content with some important keywords`,
            metadata: { index: i },
          }),
      );

      const config: MetadataExtractionConfig = {
        extractKeywords: true,
        extractContentMetadata: false,
      };

      const results = await service.batchExtractMetadata(documents, config, 3);

      expect(results).toHaveLength(10);
      results.forEach((doc, i) => {
        expect(doc.metadata.index).toBe(i);
        expect(doc.metadata.keywords).toBeDefined();
        expect(doc.metadata.enrichedAt).toBeDefined();
      });
    });

    it('should handle batch processing errors gracefully', async () => {
      const documents = [
        new Document({ pageContent: 'Valid document', metadata: {} }),
        new Document({ pageContent: '', metadata: {} }), // This might cause issues
        new Document({ pageContent: 'Another valid document', metadata: {} }),
      ];

      const results = await service.batchExtractMetadata(documents, {}, 2);

      expect(results).toHaveLength(3);
      expect(results[0].metadata.enrichedAt).toBeDefined();
      expect(results[2].metadata.enrichedAt).toBeDefined();
    });
  });

  describe('language detection', () => {
    it('should detect different languages', async () => {
      const testCases = [
        { content: 'The quick brown fox jumps over the lazy dog', expected: 'en' },
        { content: 'El rápido zorro marrón salta sobre el perro perezoso', expected: 'es' },
        { content: 'Le rapide renard brun saute sur le chien paresseux', expected: 'fr' },
        { content: 'Der schnelle braune Fuchs springt über den faulen Hund', expected: 'de' },
        { content: '你好世界，这是一个测试文档', expected: 'zh' },
        { content: 'こんにちは世界、これはテスト文書です', expected: 'ja' },
        { content: '안녕하세요 세계, 이것은 테스트 문서입니다', expected: 'ko' },
      ];

      for (const testCase of testCases) {
        const document = new Document({
          pageContent: testCase.content,
          metadata: {},
        });

        const result = await service.extractMetadata(document, {
          extractContentMetadata: true,
        });

        expect(result.contentMetadata?.language).toBe(testCase.expected);
      }
    });
  });

  describe('sentiment analysis', () => {
    it('should analyze sentiment correctly', async () => {
      const testCases = [
        {
          content: 'This is amazing! I love it! Excellent work, fantastic results!',
          expected: 'positive',
        },
        {
          content: 'This is terrible. I hate it. Awful experience, poor quality.',
          expected: 'negative',
        },
        {
          content: 'This is a document. It contains information. Facts are presented.',
          expected: 'neutral',
        },
        {
          content: 'Some parts are good and excellent, but other parts are bad and terrible.',
          expected: 'mixed',
        },
      ];

      for (const testCase of testCases) {
        const document = new Document({
          pageContent: testCase.content,
          metadata: {},
        });

        const result = await service.extractMetadata(document, {
          extractContentMetadata: true,
        });

        expect(result.contentMetadata?.sentiment).toBe(testCase.expected);
      }
    });
  });

  describe('readability scoring', () => {
    it('should calculate readability scores', async () => {
      const testCases = [
        {
          content: 'The cat sat on the mat. The dog ran fast. Birds fly high.',
          minScore: 80, // Simple sentences, high readability
        },
        {
          content:
            'The implementation of sophisticated algorithms necessitates comprehensive understanding of computational complexity theory and advanced mathematical concepts.',
          maxScore: 50, // Complex sentence, lower readability
        },
      ];

      for (const testCase of testCases) {
        const document = new Document({
          pageContent: testCase.content,
          metadata: {},
        });

        const result = await service.extractMetadata(document, {
          extractContentMetadata: true,
        });

        expect(result.contentMetadata?.readabilityScore).toBeDefined();
        if (testCase.minScore) {
          expect(result.contentMetadata?.readabilityScore).toBeGreaterThanOrEqual(testCase.minScore);
        }
        if (testCase.maxScore) {
          expect(result.contentMetadata?.readabilityScore).toBeLessThanOrEqual(testCase.maxScore);
        }
      }
    });
  });

  describe('entity extraction', () => {
    it('should extract named entities', async () => {
      const document = new Document({
        pageContent: 'John Smith works at Microsoft Inc. in Seattle. The meeting is scheduled for 2024-03-15. Contact: john.smith@example.com',
        metadata: {},
      });

      const result = await service.extractMetadata(document, {
        extractContentMetadata: true,
      });

      const entities = result.contentMetadata?.entities || [];

      expect(entities.some((e) => e.text === 'John Smith' && e.type === 'person')).toBe(true);
      expect(entities.some((e) => e.text === 'Microsoft Inc' && e.type === 'organization')).toBe(true);
      expect(entities.some((e) => e.text === '2024-03-15' && e.type === 'date')).toBe(true);
      expect(entities.some((e) => e.text === 'john smith' && e.type === 'person')).toBe(true);
    });
  });

  describe('checksum generation', () => {
    it('should generate consistent checksums', async () => {
      const content = 'Test content for checksum';
      const document1 = new Document({ pageContent: content, metadata: {} });
      const document2 = new Document({ pageContent: content, metadata: {} });

      const result1 = await service.extractMetadata(document1, {
        extractFileProperties: true,
      });
      const result2 = await service.extractMetadata(document2, {
        extractFileProperties: true,
      });

      expect(result1.fileProperties?.checksum).toBe(result2.fileProperties?.checksum);
      expect(result1.fileProperties?.checksum).toHaveLength(16);
    });

    it('should generate different checksums for different content', async () => {
      const document1 = new Document({ pageContent: 'Content A', metadata: {} });
      const document2 = new Document({ pageContent: 'Content B', metadata: {} });

      const result1 = await service.extractMetadata(document1, {
        extractFileProperties: true,
      });
      const result2 = await service.extractMetadata(document2, {
        extractFileProperties: true,
      });

      expect(result1.fileProperties?.checksum).not.toBe(result2.fileProperties?.checksum);
    });
  });
});
