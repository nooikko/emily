import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  DocumentFormat,
  type DocumentChunkingConfig,
} from '../interfaces/document-loader.interface';

// Import text splitters - fallback to simple implementation if not available
let RecursiveCharacterTextSplitter: any;
let TokenTextSplitter: any;
let MarkdownTextSplitter: any;

try {
  const splitters = require('@langchain/textsplitters');
  RecursiveCharacterTextSplitter = splitters.RecursiveCharacterTextSplitter;
  TokenTextSplitter = splitters.TokenTextSplitter;
  MarkdownTextSplitter = splitters.MarkdownTextSplitter;
} catch {
  // Fallback implementations
  RecursiveCharacterTextSplitter = class {
    constructor(private config: any) {}
    async splitDocuments(docs: Document[]): Promise<Document[]> {
      return docs.flatMap(doc => this.splitText(doc));
    }
    private splitText(doc: Document): Document[] {
      const { chunkSize, chunkOverlap } = this.config;
      const text = doc.pageContent;
      const chunks: Document[] = [];
      
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        const chunk = text.slice(i, i + chunkSize);
        if (chunk) {
          chunks.push(new Document({
            pageContent: chunk,
            metadata: doc.metadata,
          }));
        }
      }
      return chunks;
    }
  };
  
  TokenTextSplitter = RecursiveCharacterTextSplitter;
  MarkdownTextSplitter = RecursiveCharacterTextSplitter;
}

/**
 * Document chunking service for splitting documents into manageable pieces
 */
@Injectable()
export class DocumentChunkingService {
  private readonly logger = new Logger(DocumentChunkingService.name);

  /**
   * Chunk documents using appropriate splitter based on format and configuration
   */
  @TraceAI({ name: 'document_chunking.chunk' })
  async chunkDocuments(
    documents: Document[],
    config: DocumentChunkingConfig,
    format?: DocumentFormat
  ): Promise<Document[]> {
    const startTime = Date.now();

    try {
      // Select appropriate splitter based on format
      const splitter = this.getSplitter(config, format);

      // Process documents
      const chunkedDocuments: Document[] = [];
      
      for (const doc of documents) {
        const chunks = await splitter.splitDocuments([doc]);
        
        // Enhance chunk metadata
        const enhancedChunks = chunks.map((chunk: Document, index: number) => {
          return new Document({
            pageContent: chunk.pageContent,
            metadata: {
              ...doc.metadata,
              ...chunk.metadata,
              chunkIndex: index,
              totalChunks: chunks.length,
              chunkSize: chunk.pageContent.length,
              originalDocumentId: doc.metadata.documentId || doc.metadata.source,
              chunkingMethod: this.getChunkingMethod(format),
              chunkingConfig: {
                chunkSize: config.chunkSize,
                chunkOverlap: config.chunkOverlap,
              },
              processingTime: Date.now() - startTime,
            },
          });
        });

        chunkedDocuments.push(...enhancedChunks);
      }

      this.logger.log(
        `Chunked ${documents.length} documents into ${chunkedDocuments.length} chunks`
      );

      return chunkedDocuments;
    } catch (error) {
      this.logger.error(`Failed to chunk documents: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get appropriate text splitter based on format and configuration
   */
  private getSplitter(
    config: DocumentChunkingConfig,
    format?: DocumentFormat
  ): any {
    // Use Markdown splitter for markdown documents
    if (format === DocumentFormat.MARKDOWN) {
      return new MarkdownTextSplitter({
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap,
      });
    }

    // Use token splitter if specified
    if (config.separators && config.separators.includes('token')) {
      return new TokenTextSplitter({
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap,
      });
    }

    // Default to RecursiveCharacterTextSplitter
    return new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: config.separators || this.getDefaultSeparators(format),
      keepSeparator: config.keepSeparator !== false,
    });
  }

  /**
   * Get default separators based on document format
   */
  private getDefaultSeparators(format?: DocumentFormat): string[] {
    switch (format) {
      case DocumentFormat.MARKDOWN:
        return ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', ' ', ''];
      case DocumentFormat.HTML:
        return ['</div>', '</p>', '</h1>', '</h2>', '</h3>', '<br>', '\n\n', '\n', ' ', ''];
      case DocumentFormat.JSON:
        return ['}', ']', ',', '\n', ' ', ''];
      case DocumentFormat.CSV:
        return ['\n', ',', ';', '\t', ' ', ''];
      default:
        // Default separators for general text
        return ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''];
    }
  }

  /**
   * Get chunking method name based on format
   */
  private getChunkingMethod(format?: DocumentFormat): string {
    if (format === DocumentFormat.MARKDOWN) {
      return 'markdown_splitter';
    }
    return 'recursive_character_splitter';
  }

  /**
   * Smart chunking that preserves semantic boundaries
   */
  @TraceAI({ name: 'document_chunking.smart_chunk' })
  async smartChunkDocuments(
    documents: Document[],
    config: DocumentChunkingConfig
  ): Promise<Document[]> {
    const enhancedConfig = {
      ...config,
      preserveParagraphs: true,
      preserveSentences: true,
    };

    // Create a custom splitter that respects semantic boundaries
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: this.getSemanticSeparators(config),
      keepSeparator: true,
      lengthFunction: (text: string) => text.length,
    });

    const chunkedDocuments: Document[] = [];

    for (const doc of documents) {
      // Pre-process document to identify semantic boundaries
      const processedContent = await this.preprocessForSemanticChunking(
        doc.pageContent,
        enhancedConfig
      );

      const tempDoc = new Document({
        pageContent: processedContent,
        metadata: doc.metadata,
      });

      const chunks = await splitter.splitDocuments([tempDoc]);

      // Post-process chunks to ensure quality
      const processedChunks = await this.postProcessChunks(chunks, config);

      chunkedDocuments.push(...processedChunks);
    }

    return chunkedDocuments;
  }

  /**
   * Get semantic-aware separators
   */
  private getSemanticSeparators(config: DocumentChunkingConfig): string[] {
    const separators: string[] = [];

    // Paragraph boundaries
    if (config.preserveParagraphs !== false) {
      separators.push('\n\n\n', '\n\n');
    }

    // Sentence boundaries
    if (config.preserveSentences !== false) {
      separators.push('. ', '! ', '? ');
      separators.push('.\n', '!\n', '?\n');
    }

    // List item boundaries
    separators.push('\n• ', '\n- ', '\n* ', '\n1. ', '\n2. ', '\n3. ');

    // Section boundaries
    separators.push('\n# ', '\n## ', '\n### ', '\n#### ');

    // Fallback separators
    separators.push('\n', '; ', ', ', ' ', '');

    return separators;
  }

  /**
   * Preprocess content for semantic chunking
   */
  private async preprocessForSemanticChunking(
    content: string,
    config: DocumentChunkingConfig
  ): Promise<string> {
    let processed = content;

    // Normalize whitespace
    processed = processed.replace(/\r\n/g, '\n');
    processed = processed.replace(/\t/g, '  ');

    // Mark section boundaries
    processed = processed.replace(/^(#{1,6})\s+(.+)$/gm, '\n$1 $2\n');

    // Mark list boundaries
    processed = processed.replace(/^(\s*[-*•])\s+(.+)$/gm, '\n$1 $2');
    processed = processed.replace(/^(\s*\d+\.)\s+(.+)$/gm, '\n$1 $2');

    // Ensure paragraph separation
    if (config.preserveParagraphs) {
      processed = processed.replace(/([.!?])\n([A-Z])/g, '$1\n\n$2');
    }

    return processed;
  }

  /**
   * Post-process chunks to ensure quality
   */
  private async postProcessChunks(
    chunks: Document[],
    config: DocumentChunkingConfig
  ): Promise<Document[]> {
    const processedChunks: Document[] = [];
    const minSize = config.minChunkSize || 100;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let content = chunk.pageContent.trim();

      // Skip empty chunks
      if (!content) continue;

      // Merge small chunks with adjacent ones
      if (content.length < minSize && i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        content = content + '\n\n' + nextChunk.pageContent.trim();
        i++; // Skip the next chunk since we merged it
      }

      // Clean up the content
      content = this.cleanChunkContent(content);

      processedChunks.push(new Document({
        pageContent: content,
        metadata: {
          ...chunk.metadata,
          chunkIndex: processedChunks.length,
          chunkSize: content.length,
          postProcessed: true,
        },
      }));
    }

    return processedChunks;
  }

  /**
   * Clean chunk content
   */
  private cleanChunkContent(content: string): string {
    // Remove excessive whitespace
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.replace(/\s+$/gm, '');
    content = content.replace(/^\s+/gm, '');

    // Fix incomplete sentences at boundaries
    if (!content.match(/[.!?]$/)) {
      // Try to complete the sentence if it's cut off
      const lastPeriod = content.lastIndexOf('.');
      if (lastPeriod > content.length * 0.8) {
        content = content.substring(0, lastPeriod + 1);
      }
    }

    return content;
  }

  /**
   * Chunk by specific token count (useful for LLM contexts)
   */
  @TraceAI({ name: 'document_chunking.chunk_by_tokens' })
  async chunkByTokens(
    documents: Document[],
    maxTokens: number,
    overlap: number = 0
  ): Promise<Document[]> {
    const splitter = new TokenTextSplitter({
      chunkSize: maxTokens,
      chunkOverlap: overlap,
    });

    const chunkedDocuments: Document[] = [];

    for (const doc of documents) {
      const chunks = await splitter.splitDocuments([doc]);
      
      const enhancedChunks = chunks.map((chunk: Document, index: number) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          chunkIndex: index,
          chunkingMethod: 'token_splitter',
          maxTokens,
          tokenOverlap: overlap,
        },
      }));

      chunkedDocuments.push(...enhancedChunks);
    }

    return chunkedDocuments;
  }

  /**
   * Create hierarchical chunks (parent-child relationships)
   */
  @TraceAI({ name: 'document_chunking.hierarchical_chunk' })
  async createHierarchicalChunks(
    documents: Document[],
    parentConfig: DocumentChunkingConfig,
    childConfig: DocumentChunkingConfig
  ): Promise<{ parents: Document[]; children: Document[] }> {
    // Create parent chunks
    const parentSplitter = this.getSplitter(parentConfig);
    const parents: Document[] = [];
    const children: Document[] = [];

    for (const doc of documents) {
      const parentChunks = await parentSplitter.splitDocuments([doc]);

      for (const parent of parentChunks) {
        const parentId = `${doc.metadata.source || 'doc'}_parent_${parents.length}`;
        
        // Add parent with ID
        const parentDoc = new Document({
          pageContent: parent.pageContent,
          metadata: {
            ...parent.metadata,
            documentId: parentId,
            documentType: 'parent',
            level: 0,
          },
        });
        parents.push(parentDoc);

        // Create child chunks from parent
        const childSplitter = this.getSplitter(childConfig);
        const childChunks = await childSplitter.splitDocuments([parent]);

        for (const child of childChunks) {
          const childDoc = new Document({
            pageContent: child.pageContent,
            metadata: {
              ...child.metadata,
              parentId,
              documentType: 'child',
              level: 1,
              documentId: `${parentId}_child_${children.length}`,
            },
          });
          children.push(childDoc);
        }
      }
    }

    return { parents, children };
  }
}