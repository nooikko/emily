import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { UnstructuredLoader } from '@langchain/community/document_loaders/fs/unstructured';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  DocumentFormat,
  type DocumentLoaderConfig,
  type DocumentLoadResult,
  type DocumentValidationResult,
  type IDocumentLoader,
  type UnstructuredLoaderOptions,
} from '../interfaces/document-loader.interface';

/**
 * Unstructured document loader service for various file types
 * Supports DOCX, XLSX, PPTX, and other complex formats
 */
@Injectable()
export class UnstructuredLoaderService implements IDocumentLoader {
  private readonly logger = new Logger(UnstructuredLoaderService.name);
  
  // Supported file extensions
  private readonly supportedExtensions = [
    'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
    'odt', 'ods', 'odp', 'rtf', 'epub', 'xml'
  ];

  /**
   * Load unstructured documents
   */
  @TraceAI({ name: 'unstructured_loader.load' })
  async load(config: DocumentLoaderConfig): Promise<DocumentLoadResult> {
    const startTime = Date.now();
    const options = config.loaderOptions as UnstructuredLoaderOptions || {};

    try {
      let filePath: string;
      let tempFile = false;
      let detectedFormat: DocumentFormat | null = null;

      // Handle buffer input by writing to temp file
      if (Buffer.isBuffer(config.source)) {
        // Try to detect format from buffer
        detectedFormat = await this.detectFormatFromBuffer(config.source);
        const ext = this.getExtensionForFormat(detectedFormat || DocumentFormat.UNSTRUCTURED);
        filePath = `/tmp/unstructured_${Date.now()}.${ext}`;
        await fs.writeFile(filePath, config.source);
        tempFile = true;
      } else {
        filePath = config.source;
        const ext = path.extname(filePath).toLowerCase().slice(1);
        detectedFormat = this.getFormatFromExtension(ext);
      }

      try {
        // Get file stats
        const stats = await fs.stat(filePath);

        // If API is configured, use API-based loading
        if (options.apiUrl && options.apiKey) {
          return await this.loadWithAPI(filePath, config, options, stats, startTime);
        }

        // Otherwise, use local processing (requires unstructured package)
        return await this.loadLocally(filePath, config, options, stats, detectedFormat, startTime);
      } finally {
        // Clean up temp file if created
        if (tempFile) {
          await fs.unlink(filePath).catch(err => 
            this.logger.warn(`Failed to delete temp file: ${err.message}`)
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load unstructured document: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Load document using local processing
   */
  private async loadLocally(
    filePath: string,
    config: DocumentLoaderConfig,
    options: UnstructuredLoaderOptions,
    stats: any,
    detectedFormat: DocumentFormat | null,
    startTime: number
  ): Promise<DocumentLoadResult> {
    try {
      // Create UnstructuredLoader instance
      const loader = new UnstructuredLoader(filePath, {
        apiUrl: undefined, // Use local processing
        strategy: options.strategy || 'fast',
      });

      // Load documents
      const documents = await loader.load();

      // Extract structured elements if available
      const structuredElements = await this.extractStructuredElements(documents);

      // Enhance documents with metadata
      const enhancedDocuments = documents.map((doc, index) => {
        const metadata: Record<string, any> = {
          ...doc.metadata,
          ...config.metadata,
          source: typeof config.source === 'string' ? config.source : 'buffer',
          format: detectedFormat || DocumentFormat.UNSTRUCTURED,
          fileSize: stats.size,
          documentIndex: index,
          totalDocuments: documents.length,
          loadedAt: new Date().toISOString(),
        };

        // Add structured elements if found
        if (structuredElements[index]) {
          metadata.structuredElements = structuredElements[index];
        }

        return new Document({
          pageContent: doc.pageContent,
          metadata,
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
          format: detectedFormat || DocumentFormat.UNSTRUCTURED,
          documentCount: enhancedDocuments.length,
          totalCharacters,
          fileSize: stats.size,
          loadingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Fallback to simple text extraction if UnstructuredLoader fails
      this.logger.warn(`UnstructuredLoader failed, falling back to simple extraction: ${error.message}`);
      return await this.fallbackExtraction(filePath, config, stats, detectedFormat, startTime);
    }
  }

  /**
   * Load document using Unstructured API
   */
  private async loadWithAPI(
    filePath: string,
    config: DocumentLoaderConfig,
    options: UnstructuredLoaderOptions,
    stats: any,
    startTime: number
  ): Promise<DocumentLoadResult> {
    try {
      // Create UnstructuredLoader with API configuration
      const loader = new UnstructuredLoader(filePath, {
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        strategy: options.strategy || 'hi_res',
      });

      // Load documents
      const documents = await loader.load();

      // Enhance documents with metadata
      const enhancedDocuments = documents.map((doc, index) => {
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            ...config.metadata,
            source: typeof config.source === 'string' ? config.source : 'buffer',
            format: config.format || DocumentFormat.UNSTRUCTURED,
            fileSize: stats.size,
            documentIndex: index,
            totalDocuments: documents.length,
            processedWith: 'unstructured-api',
            strategy: options.strategy || 'hi_res',
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
          format: config.format || DocumentFormat.UNSTRUCTURED,
          documentCount: enhancedDocuments.length,
          totalCharacters,
          fileSize: stats.size,
          loadingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logger.error(`API-based loading failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fallback extraction for when UnstructuredLoader is not available
   */
  private async fallbackExtraction(
    filePath: string,
    config: DocumentLoaderConfig,
    stats: any,
    detectedFormat: DocumentFormat | null,
    startTime: number
  ): Promise<DocumentLoadResult> {
    // For now, just read as text if possible
    // In production, you might want to use other libraries like mammoth for DOCX, xlsx for Excel, etc.
    const content = await fs.readFile(filePath, 'utf-8').catch(() => 
      'Unable to extract text content from this file. Consider using the Unstructured API for better results.'
    );

    const document = new Document({
      pageContent: content,
      metadata: {
        ...config.metadata,
        source: typeof config.source === 'string' ? config.source : 'buffer',
        format: detectedFormat || DocumentFormat.UNSTRUCTURED,
        fileSize: stats.size,
        extractionMethod: 'fallback',
        warning: 'Used fallback extraction method. Install unstructured package for better results.',
        loadedAt: new Date().toISOString(),
      },
    });

    return {
      documents: [document],
      metadata: {
        source: typeof config.source === 'string' ? config.source : 'buffer',
        format: detectedFormat || DocumentFormat.UNSTRUCTURED,
        documentCount: 1,
        totalCharacters: content.length,
        fileSize: stats.size,
        loadingTime: Date.now() - startTime,
        warnings: ['Used fallback extraction method'],
      },
    };
  }

  /**
   * Extract structured elements from documents
   */
  private async extractStructuredElements(documents: Document[]): Promise<Array<Record<string, any> | null>> {
    return documents.map(doc => {
      const elements: Record<string, any> = {};
      
      // Extract tables (simple heuristic)
      const tablePattern = /\|.*\|/g;
      const tables = doc.pageContent.match(tablePattern);
      if (tables) {
        elements.tables = tables.length;
      }

      // Extract lists
      const bulletPattern = /^[\*\-\•]\s+/gm;
      const numberedPattern = /^\d+\.\s+/gm;
      const bullets = doc.pageContent.match(bulletPattern);
      const numbered = doc.pageContent.match(numberedPattern);
      if (bullets || numbered) {
        elements.lists = {
          bulleted: bullets?.length || 0,
          numbered: numbered?.length || 0,
        };
      }

      // Extract headers (common patterns)
      const headerPattern = /^#{1,6}\s+.+$/gm;
      const headers = doc.pageContent.match(headerPattern);
      if (headers) {
        elements.headers = headers.length;
      }

      return Object.keys(elements).length > 0 ? elements : null;
    });
  }

  /**
   * Validate unstructured document
   */
  @TraceAI({ name: 'unstructured_loader.validate' })
  async validate(source: string | Buffer): Promise<DocumentValidationResult> {
    const errors: string[] = [];

    try {
      let fileSize: number;
      let detectedFormat: DocumentFormat | null = null;

      if (typeof source === 'string') {
        const stats = await fs.stat(source);
        fileSize = stats.size;
        
        // Check file extension
        const ext = path.extname(source).toLowerCase().slice(1);
        if (!this.supportedExtensions.includes(ext) && ext !== '') {
          // It's okay if we don't recognize the extension
          this.logger.debug(`Unrecognized file extension: ${ext}`);
        }
        detectedFormat = this.getFormatFromExtension(ext);
      } else {
        fileSize = source.length;
        detectedFormat = await this.detectFormatFromBuffer(source);
      }

      // Check file size (max 100MB by default)
      const maxSize = 100 * 1024 * 1024;
      if (fileSize > maxSize) {
        errors.push(`File size (${fileSize} bytes) exceeds maximum (${maxSize} bytes)`);
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        detectedFormat: detectedFormat || DocumentFormat.UNSTRUCTURED,
        fileSize,
        mimeType: this.getMimeType(detectedFormat),
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Detect format from buffer content
   */
  private async detectFormatFromBuffer(buffer: Buffer): Promise<DocumentFormat | null> {
    // Check for Office Open XML (DOCX, XLSX, PPTX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      // It's a ZIP file, could be Office document
      // Would need to inspect the ZIP structure to determine exact type
      return DocumentFormat.UNSTRUCTURED;
    }

    // Check for older Office formats
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf) {
      // OLE2 format (older Office documents)
      return DocumentFormat.UNSTRUCTURED;
    }

    // Check for RTF
    if (buffer.toString('utf-8', 0, 5) === '{\\rtf') {
      return DocumentFormat.UNSTRUCTURED;
    }

    // Check for XML
    if (buffer.toString('utf-8', 0, 5) === '<?xml') {
      return DocumentFormat.UNSTRUCTURED;
    }

    return DocumentFormat.UNSTRUCTURED;
  }

  /**
   * Get format from file extension
   */
  private getFormatFromExtension(ext: string): DocumentFormat | null {
    switch (ext) {
      case 'docx':
      case 'doc':
        return DocumentFormat.DOCX;
      case 'xlsx':
      case 'xls':
        return DocumentFormat.XLSX;
      default:
        return this.supportedExtensions.includes(ext) 
          ? DocumentFormat.UNSTRUCTURED 
          : null;
    }
  }

  /**
   * Get file extension for format
   */
  private getExtensionForFormat(format: DocumentFormat): string {
    switch (format) {
      case DocumentFormat.DOCX:
        return 'docx';
      case DocumentFormat.XLSX:
        return 'xlsx';
      default:
        return 'bin';
    }
  }

  /**
   * Get MIME type for format
   */
  private getMimeType(format: DocumentFormat | null): string {
    switch (format) {
      case DocumentFormat.DOCX:
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case DocumentFormat.XLSX:
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Detect if source is an unstructured document
   */
  async detectFormat(source: string | Buffer): Promise<DocumentFormat | null> {
    try {
      const validation = await this.validate(source);
      return validation.detectedFormat || null;
    } catch {
      return null;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return [
      DocumentFormat.DOCX,
      DocumentFormat.XLSX,
      DocumentFormat.UNSTRUCTURED,
    ];
  }
}