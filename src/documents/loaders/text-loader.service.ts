import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs/promises';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  DocumentFormat,
  type DocumentLoaderConfig,
  type DocumentLoadResult,
  type DocumentValidationResult,
  type IDocumentLoader,
  type TextLoaderOptions,
} from '../interfaces/document-loader.interface';

/**
 * Text document loader service using LangChain's TextLoader
 */
@Injectable()
export class TextLoaderService implements IDocumentLoader {
  private readonly logger = new Logger(TextLoaderService.name);

  /**
   * Load text documents
   */
  @TraceAI({ name: 'text_loader.load' })
  async load(config: DocumentLoaderConfig): Promise<DocumentLoadResult> {
    const startTime = Date.now();
    const options = config.loaderOptions as TextLoaderOptions || {};

    try {
      let filePath: string;
      let tempFile = false;
      let content: string;

      // Handle buffer input
      if (Buffer.isBuffer(config.source)) {
        filePath = `/tmp/text_${Date.now()}.txt`;
        content = config.source.toString(options.encoding || 'utf-8');
        await fs.writeFile(filePath, content, options.encoding || 'utf-8');
        tempFile = true;
      } else {
        filePath = config.source;
        content = await fs.readFile(filePath, options.encoding || 'utf-8');
      }

      try {
        // Get file stats
        const stats = await fs.stat(filePath);

        // Process line breaks if needed
        if (options.lineSeparator && options.lineSeparator !== '\n') {
          content = content.split(options.lineSeparator).join('\n');
        }

        // Handle line break preservation
        if (options.preserveLineBreaks === false) {
          content = content.replace(/\n+/g, ' ').trim();
        }

        // Load documents directly as we don't have TextLoader
        const documents = [new Document({
          pageContent: content,
          metadata: {
            source: filePath,
          },
        })];

        // Split by custom separators if needed
        let processedDocuments: Document[] = documents;
        
        if (options.lineSeparator && options.preserveLineBreaks !== false) {
          // Split content into separate documents by line separator
          const lines = content.split(options.lineSeparator || '\n');
          processedDocuments = lines
            .filter(line => line.trim())
            .map((line, index) => new Document({
              pageContent: line,
              metadata: {
                lineNumber: index + 1,
                source: filePath,
              },
            }));
        }

        // Extract basic text statistics
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        const lineCount = content.split('\n').length;
        const paragraphCount = content.split(/\n\n+/).filter(p => p.trim()).length;

        // Enhance documents with metadata
        const enhancedDocuments = processedDocuments.map((doc, index) => {
          return new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              ...config.metadata,
              source: typeof config.source === 'string' ? config.source : 'buffer',
              format: DocumentFormat.TEXT,
              encoding: options.encoding || 'utf-8',
              fileSize: stats.size,
              wordCount: doc === processedDocuments[0] ? wordCount : undefined,
              lineCount: doc === processedDocuments[0] ? lineCount : undefined,
              paragraphCount: doc === processedDocuments[0] ? paragraphCount : undefined,
              documentIndex: index,
              totalDocuments: processedDocuments.length,
              loadedAt: new Date().toISOString(),
            },
          });
        });

        // Calculate total characters
        const totalCharacters = enhancedDocuments.reduce(
          (sum, doc) => sum + doc.pageContent.length,
          0
        );

        return {
          documents: enhancedDocuments,
          metadata: {
            source: typeof config.source === 'string' ? config.source : 'buffer',
            format: DocumentFormat.TEXT,
            documentCount: enhancedDocuments.length,
            totalCharacters,
            fileSize: stats.size,
            loadingTime: Date.now() - startTime,
          },
        };
      } finally {
        // Clean up temp file if created
        if (tempFile) {
          await fs.unlink(filePath).catch(err => 
            this.logger.warn(`Failed to delete temp file: ${err.message}`)
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load text document: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate text document
   */
  @TraceAI({ name: 'text_loader.validate' })
  async validate(source: string | Buffer): Promise<DocumentValidationResult> {
    const errors: string[] = [];

    try {
      let fileSize: number;
      let content: Buffer;

      if (typeof source === 'string') {
        const stats = await fs.stat(source);
        fileSize = stats.size;
        // Read first part to check encoding
        const fd = await fs.open(source, 'r');
        content = Buffer.alloc(Math.min(1000, fileSize));
        await fd.read(content, 0, content.length, 0);
        await fd.close();
      } else {
        fileSize = source.length;
        content = source;
      }

      // Check if it's valid UTF-8 (or specified encoding)
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(content);
      } catch {
        // Try other common encodings
        const encodings = ['latin1', 'utf-16le', 'utf-16be'];
        let validEncoding = false;
        
        for (const encoding of encodings) {
          try {
            const decoder = new TextDecoder(encoding, { fatal: true });
            decoder.decode(content);
            validEncoding = true;
            break;
          } catch {
            // Continue to next encoding
          }
        }

        if (!validEncoding) {
          errors.push('File does not appear to be valid text (encoding issue)');
        }
      }

      // Check file size (max 100MB by default)
      const maxSize = 100 * 1024 * 1024;
      if (fileSize > maxSize) {
        errors.push(`File size (${fileSize} bytes) exceeds maximum (${maxSize} bytes)`);
      }

      // Detect if it's actually another format
      const contentStr = content.toString('utf-8', 0, Math.min(100, content.length));
      if (contentStr.startsWith('%PDF')) {
        errors.push('File appears to be PDF, not plain text');
      } else if (contentStr.startsWith('PK')) {
        errors.push('File appears to be a compressed archive, not plain text');
      } else if (contentStr.includes('<html') || contentStr.includes('<!DOCTYPE')) {
        // This is okay, could be HTML text
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        detectedFormat: DocumentFormat.TEXT,
        fileSize,
        mimeType: 'text/plain',
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Detect if source is a text document
   */
  async detectFormat(source: string | Buffer): Promise<DocumentFormat | null> {
    try {
      const validation = await this.validate(source);
      return validation.isValid ? DocumentFormat.TEXT : null;
    } catch {
      return null;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return [DocumentFormat.TEXT, DocumentFormat.MARKDOWN];
  }
}