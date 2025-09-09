import * as fs from 'node:fs/promises';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  DocumentFormat,
  type DocumentLoaderConfig,
  type DocumentLoadResult,
  type DocumentValidationResult,
  type IDocumentLoader,
  type PDFLoaderOptions,
} from '../interfaces/document-loader.interface';

/**
 * PDF document loader service using LangChain's PDFLoader
 */
@Injectable()
export class PDFLoaderService implements IDocumentLoader {
  private readonly logger = new Logger(PDFLoaderService.name);

  /**
   * Load PDF documents
   */
  @TraceAI({ name: 'pdf_loader.load' })
  async load(config: DocumentLoaderConfig): Promise<DocumentLoadResult> {
    const startTime = Date.now();
    const options = (config.loaderOptions as PDFLoaderOptions) || {};

    try {
      let filePath: string;
      let tempFile = false;

      // Handle buffer input by writing to temp file
      if (Buffer.isBuffer(config.source)) {
        filePath = `/tmp/pdf_${Date.now()}.pdf`;
        await fs.writeFile(filePath, config.source);
        tempFile = true;
      } else {
        filePath = config.source;
      }

      try {
        // Create PDFLoader instance
        const loader = new PDFLoader(filePath, {
          splitPages: options.splitPages !== false, // Default to true
        });

        // Load documents
        const documents = await loader.load();

        // Get file stats
        const stats = await fs.stat(filePath);

        // Enhance documents with metadata
        const enhancedDocuments = documents.map((doc, index) => {
          const pageNumber = options.splitPages !== false ? index + 1 : undefined;

          return new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              ...config.metadata,
              source: typeof config.source === 'string' ? config.source : 'buffer',
              format: DocumentFormat.PDF,
              pageNumber,
              totalPages: documents.length,
              fileSize: stats.size,
              loadedAt: new Date().toISOString(),
            },
          });
        });

        // Calculate total characters
        const totalCharacters = enhancedDocuments.reduce((sum, doc) => sum + doc.pageContent.length, 0);

        return {
          documents: enhancedDocuments,
          metadata: {
            source: typeof config.source === 'string' ? config.source : 'buffer',
            format: DocumentFormat.PDF,
            documentCount: enhancedDocuments.length,
            totalCharacters,
            fileSize: stats.size,
            loadingTime: Date.now() - startTime,
          },
        };
      } finally {
        // Clean up temp file if created
        if (tempFile) {
          await fs.unlink(filePath).catch((err) => this.logger.warn(`Failed to delete temp file: ${err.message}`));
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load PDF: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate PDF document
   */
  @TraceAI({ name: 'pdf_loader.validate' })
  async validate(source: string | Buffer): Promise<DocumentValidationResult> {
    const errors: string[] = [];

    try {
      let fileSize: number;
      let content: Buffer;

      if (typeof source === 'string') {
        const stats = await fs.stat(source);
        fileSize = stats.size;
        // Read first few bytes to check signature
        const fd = await fs.open(source, 'r');
        content = Buffer.alloc(10);
        await fd.read(content, 0, 10, 0);
        await fd.close();
      } else {
        fileSize = source.length;
        content = source;
      }

      // Check PDF signature
      const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      if (!content.subarray(0, 4).equals(pdfSignature)) {
        errors.push('Invalid PDF signature');
      }

      // Check file size (max 100MB by default)
      const maxSize = 100 * 1024 * 1024;
      if (fileSize > maxSize) {
        errors.push(`File size (${fileSize} bytes) exceeds maximum (${maxSize} bytes)`);
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        detectedFormat: DocumentFormat.PDF,
        fileSize,
        mimeType: 'application/pdf',
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Detect if source is a PDF
   */
  async detectFormat(source: string | Buffer): Promise<DocumentFormat | null> {
    try {
      const validation = await this.validate(source);
      return validation.isValid ? DocumentFormat.PDF : null;
    } catch {
      return null;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return [DocumentFormat.PDF];
  }
}
