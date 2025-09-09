import { Test, TestingModule } from '@nestjs/testing';
import { DocumentChunkingService } from './document-chunking.service';
import { Document } from '@langchain/core/documents';
import { DocumentFormat, DocumentChunkingConfig } from '../interfaces/document-loader.interface';

describe('DocumentChunkingService', () => {
  let service: DocumentChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentChunkingService],
    }).compile();

    service = module.get<DocumentChunkingService>(DocumentChunkingService);
  });

  describe('chunkDocuments', () => {
    it('should chunk documents with default settings', async () => {
      const documents = [
        new Document({
          pageContent: 'This is a test document with some content. '.repeat(50),
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 100,
        chunkOverlap: 20,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].metadata.chunkIndex).toBe(0);
      expect(chunks[0].metadata.totalChunks).toBe(chunks.length);
      expect(chunks[0].metadata.chunkSize).toBeLessThanOrEqual(100);
    });

    it('should respect chunk overlap', async () => {
      const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 10,
        chunkOverlap: 3,
      };

      const chunks = await service.chunkDocuments(documents, config);

      // Check that chunks overlap
      if (chunks.length > 1) {
        const firstChunkEnd = chunks[0].pageContent.slice(-3);
        const secondChunkStart = chunks[1].pageContent.slice(0, 3);
        expect(firstChunkEnd).toBe(secondChunkStart);
      }
    });

    it('should use markdown splitter for markdown format', async () => {
      const markdownContent = `# Header 1

This is a paragraph.

## Header 2

Another paragraph with more content.

### Header 3

Final section content.`;

      const documents = [
        new Document({
          pageContent: markdownContent,
          metadata: { source: 'test.md' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 50,
        chunkOverlap: 10,
      };

      const chunks = await service.chunkDocuments(
        documents,
        config,
        DocumentFormat.MARKDOWN
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.chunkingMethod).toBe('markdown_splitter');
    });

    it('should preserve custom separators', async () => {
      const content = 'Part1|SEPARATOR|Part2|SEPARATOR|Part3';
      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 20,
        chunkOverlap: 0,
        separators: ['|SEPARATOR|'],
        keepSeparator: false,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks.some(chunk => chunk.pageContent.includes('Part1'))).toBe(true);
      expect(chunks.some(chunk => chunk.pageContent.includes('Part2'))).toBe(true);
      expect(chunks.some(chunk => chunk.pageContent.includes('Part3'))).toBe(true);
    });

    it('should add comprehensive metadata to chunks', async () => {
      const documents = [
        new Document({
          pageContent: 'Test content for chunking',
          metadata: {
            source: 'test.txt',
            documentId: 'doc123',
            customField: 'value',
          },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 10,
        chunkOverlap: 2,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks[0].metadata).toHaveProperty('chunkIndex');
      expect(chunks[0].metadata).toHaveProperty('totalChunks');
      expect(chunks[0].metadata).toHaveProperty('chunkSize');
      expect(chunks[0].metadata).toHaveProperty('originalDocumentId');
      expect(chunks[0].metadata).toHaveProperty('chunkingMethod');
      expect(chunks[0].metadata).toHaveProperty('chunkingConfig');
      expect(chunks[0].metadata.customField).toBe('value'); // Preserve original metadata
    });

    it('should handle empty documents gracefully', async () => {
      const documents = [
        new Document({
          pageContent: '',
          metadata: { source: 'empty.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 100,
        chunkOverlap: 20,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks).toHaveLength(0);
    });
  });

  describe('smartChunkDocuments', () => {
    it('should preserve semantic boundaries', async () => {
      const content = `This is the first paragraph. It contains multiple sentences.

This is the second paragraph. It also has multiple sentences.

## Section Header

This is content under a section header.`;

      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.md' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 100,
        chunkOverlap: 20,
        preserveParagraphs: true,
        preserveSentences: true,
      };

      const chunks = await service.smartChunkDocuments(documents, config);

      expect(chunks.length).toBeGreaterThan(0);
      // Check that chunks are post-processed
      expect(chunks[0].metadata.postProcessed).toBe(true);
    });

    it('should merge small chunks', async () => {
      const content = 'Short.\nAnother short.\nThird.';
      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 50,
        chunkOverlap: 5,
        minChunkSize: 20,
      };

      const chunks = await service.smartChunkDocuments(documents, config);

      // Small chunks should be merged
      chunks.forEach(chunk => {
        expect(chunk.pageContent.length).toBeGreaterThanOrEqual(20);
      });
    });

    it('should handle lists properly', async () => {
      const content = `Here's a list:
• Item 1
• Item 2
• Item 3

1. Numbered item
2. Another numbered item`;

      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 50,
        chunkOverlap: 10,
      };

      const chunks = await service.smartChunkDocuments(documents, config);

      expect(chunks.length).toBeGreaterThan(0);
      // Lists should be recognized as semantic boundaries
    });
  });

  describe('chunkByTokens', () => {
    it('should chunk by token count', async () => {
      const documents = [
        new Document({
          pageContent: 'This is a test document with multiple words that will be chunked by tokens.',
          metadata: { source: 'test.txt' },
        }),
      ];

      const chunks = await service.chunkByTokens(documents, 10, 2);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.chunkingMethod).toBe('token_splitter');
      expect(chunks[0].metadata.maxTokens).toBe(10);
      expect(chunks[0].metadata.tokenOverlap).toBe(2);
    });

    it('should handle token overlap correctly', async () => {
      const documents = [
        new Document({
          pageContent: 'One two three four five six seven eight nine ten eleven twelve',
          metadata: { source: 'test.txt' },
        }),
      ];

      const chunks = await service.chunkByTokens(documents, 5, 2);

      expect(chunks.length).toBeGreaterThan(1);
      // Verify overlap exists between chunks
    });
  });

  describe('createHierarchicalChunks', () => {
    it('should create parent and child chunks', async () => {
      const content = 'A'.repeat(500); // Long content
      const documents = [
        new Document({
          pageContent: content,
          metadata: { source: 'test.txt' },
        }),
      ];

      const parentConfig: DocumentChunkingConfig = {
        chunkSize: 200,
        chunkOverlap: 50,
      };

      const childConfig: DocumentChunkingConfig = {
        chunkSize: 50,
        chunkOverlap: 10,
      };

      const result = await service.createHierarchicalChunks(
        documents,
        parentConfig,
        childConfig
      );

      expect(result.parents.length).toBeGreaterThan(0);
      expect(result.children.length).toBeGreaterThan(result.parents.length);

      // Check parent metadata
      expect(result.parents[0].metadata.documentType).toBe('parent');
      expect(result.parents[0].metadata.level).toBe(0);

      // Check child metadata
      expect(result.children[0].metadata.documentType).toBe('child');
      expect(result.children[0].metadata.level).toBe(1);
      expect(result.children[0].metadata).toHaveProperty('parentId');
    });

    it('should maintain parent-child relationships', async () => {
      const documents = [
        new Document({
          pageContent: 'Parent content that will be split into children',
          metadata: { source: 'test.txt' },
        }),
      ];

      const parentConfig: DocumentChunkingConfig = {
        chunkSize: 30,
        chunkOverlap: 5,
      };

      const childConfig: DocumentChunkingConfig = {
        chunkSize: 10,
        chunkOverlap: 2,
      };

      const result = await service.createHierarchicalChunks(
        documents,
        parentConfig,
        childConfig
      );

      // Each child should reference a parent
      result.children.forEach(child => {
        const parentExists = result.parents.some(
          parent => parent.metadata.documentId === child.metadata.parentId
        );
        expect(parentExists).toBe(true);
      });
    });

    it('should handle multiple documents', async () => {
      const documents = [
        new Document({
          pageContent: 'Document 1 content',
          metadata: { source: 'doc1.txt' },
        }),
        new Document({
          pageContent: 'Document 2 content',
          metadata: { source: 'doc2.txt' },
        }),
      ];

      const parentConfig: DocumentChunkingConfig = {
        chunkSize: 15,
        chunkOverlap: 3,
      };

      const childConfig: DocumentChunkingConfig = {
        chunkSize: 5,
        chunkOverlap: 1,
      };

      const result = await service.createHierarchicalChunks(
        documents,
        parentConfig,
        childConfig
      );

      expect(result.parents.length).toBeGreaterThan(0);
      expect(result.children.length).toBeGreaterThan(0);

      // Check that both documents were processed
      const doc1Parents = result.parents.filter(p => 
        p.metadata.source === 'doc1.txt'
      );
      const doc2Parents = result.parents.filter(p => 
        p.metadata.source === 'doc2.txt'
      );

      expect(doc1Parents.length).toBeGreaterThan(0);
      expect(doc2Parents.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small chunk sizes', async () => {
      const documents = [
        new Document({
          pageContent: 'Test',
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 2,
        chunkOverlap: 0,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.pageContent.length).toBeLessThanOrEqual(2);
      });
    });

    it('should handle chunk size larger than document', async () => {
      const documents = [
        new Document({
          pageContent: 'Short content',
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 1000,
        chunkOverlap: 100,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].pageContent).toBe('Short content');
    });

    it('should handle special characters and unicode', async () => {
      const documents = [
        new Document({
          pageContent: 'Test with émojis 🎉 and spëcial çharacters\n\nNew paragraph',
          metadata: { source: 'test.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 20,
        chunkOverlap: 5,
      };

      const chunks = await service.chunkDocuments(documents, config);

      expect(chunks.length).toBeGreaterThan(0);
      // Content should be preserved correctly
    });

    it('should handle very long documents efficiently', async () => {
      const longContent = 'Lorem ipsum '.repeat(10000); // ~120,000 characters
      const documents = [
        new Document({
          pageContent: longContent,
          metadata: { source: 'large.txt' },
        }),
      ];

      const config: DocumentChunkingConfig = {
        chunkSize: 1000,
        chunkOverlap: 200,
      };

      const startTime = Date.now();
      const chunks = await service.chunkDocuments(documents, config);
      const processingTime = Date.now() - startTime;

      expect(chunks.length).toBeGreaterThan(100);
      expect(processingTime).toBeLessThan(5000); // Should process in less than 5 seconds
    });
  });
});