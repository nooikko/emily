import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  DocumentFormat,
  type DocumentLoaderConfig,
  type DocumentLoadResult,
  type DocumentValidationResult,
  type IDocumentLoader,
} from '../interfaces/document-loader.interface';

/**
 * Base document loader service providing common functionality
 * for all document loaders
 */
@Injectable()
export class DocumentLoaderService implements IDocumentLoader {
  protected readonly logger = new Logger(DocumentLoaderService.name);
  protected readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB default
  
  private readonly loaderRegistry = new Map<DocumentFormat, IDocumentLoader>();

  constructor() {
    this.logger.log('DocumentLoaderService initialized');
  }

  /**
   * Register a document loader for a specific format
   */
  registerLoader(format: DocumentFormat, loader: IDocumentLoader): void {
    this.loaderRegistry.set(format, loader);
    this.logger.debug(`Registered loader for format: ${format}`);
  }

  /**
   * Load documents from source
   */
  @TraceAI({ name: 'document_loader.load' })
  async load(config: DocumentLoaderConfig): Promise<DocumentLoadResult> {
    const startTime = Date.now();

    try {
      // Validate the document first
      const validation = await this.validate(config.source);
      if (!validation.isValid) {
        throw new Error(`Document validation failed: ${validation.errors?.join(', ')}`);
      }

      // Detect format if not provided
      const format = config.format || validation.detectedFormat;
      if (!format) {
        throw new Error('Unable to detect document format');
      }

      // Get the appropriate loader
      const loader = this.loaderRegistry.get(format);
      if (!loader) {
        // Fall back to base implementation for simple formats
        return await this.loadWithBaseImplementation(config, format, startTime);
      }

      // Use the specialized loader
      return await loader.load(config);
    } catch (error) {
      this.logger.error(`Failed to load document: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Base implementation for simple document formats
   */
  private async loadWithBaseImplementation(
    config: DocumentLoaderConfig,
    format: DocumentFormat,
    startTime: number,
  ): Promise<DocumentLoadResult> {
    let content: string;
    let fileSize: number;

    if (typeof config.source === 'string') {
      // Load from file path
      const stats = await fs.stat(config.source);
      fileSize = stats.size;
      content = await fs.readFile(config.source, 'utf-8');
    } else {
      // Load from buffer
      fileSize = config.source.length;
      content = config.source.toString('utf-8');
    }

    // Create document with metadata
    const metadata = {
      ...config.metadata,
      source: typeof config.source === 'string' ? config.source : 'buffer',
      format,
      fileSize,
      loadedAt: new Date().toISOString(),
    };

    const document = new Document({
      pageContent: content,
      metadata,
    });

    return {
      documents: [document],
      metadata: {
        source: typeof config.source === 'string' ? config.source : 'buffer',
        format,
        documentCount: 1,
        totalCharacters: content.length,
        fileSize,
        loadingTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Validate document before loading
   */
  @TraceAI({ name: 'document_loader.validate' })
  async validate(source: string | Buffer): Promise<DocumentValidationResult> {
    const errors: string[] = [];

    try {
      let fileSize: number;
      let mimeType: string | undefined;

      if (typeof source === 'string') {
        // Validate file path
        try {
          const stats = await fs.stat(source);
          fileSize = stats.size;

          if (!stats.isFile()) {
            errors.push('Source is not a file');
            return { isValid: false, errors };
          }

          if (fileSize > (this.MAX_FILE_SIZE)) {
            errors.push(`File size (${fileSize} bytes) exceeds maximum allowed (${this.MAX_FILE_SIZE} bytes)`);
          }
        } catch (error) {
          errors.push(`File not found or inaccessible: ${error.message}`);
          return { isValid: false, errors };
        }
      } else {
        // Validate buffer
        fileSize = source.length;
        if (fileSize > this.MAX_FILE_SIZE) {
          errors.push(`Buffer size (${fileSize} bytes) exceeds maximum allowed (${this.MAX_FILE_SIZE} bytes)`);
        }
      }

      // Detect format
      const detectedFormat = await this.detectFormat(source);

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        detectedFormat: detectedFormat || undefined,
        fileSize,
        mimeType,
      };
    } catch (error) {
      this.logger.error(`Validation error: ${error.message}`, error.stack);
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Detect document format from source
   */
  @TraceAI({ name: 'document_loader.detect_format' })
  async detectFormat(source: string | Buffer): Promise<DocumentFormat | null> {
    try {
      if (typeof source === 'string') {
        // Detect by file extension
        const ext = path.extname(source).toLowerCase().slice(1);
        return this.getFormatFromExtension(ext);
      } else {
        // Detect by content analysis
        return this.detectFormatFromContent(source);
      }
    } catch (error) {
      this.logger.warn(`Format detection failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get format from file extension
   */
  private getFormatFromExtension(ext: string): DocumentFormat | null {
    const extensionMap: Record<string, DocumentFormat> = {
      pdf: DocumentFormat.PDF,
      txt: DocumentFormat.TEXT,
      text: DocumentFormat.TEXT,
      csv: DocumentFormat.CSV,
      json: DocumentFormat.JSON,
      md: DocumentFormat.MARKDOWN,
      markdown: DocumentFormat.MARKDOWN,
      html: DocumentFormat.HTML,
      htm: DocumentFormat.HTML,
      docx: DocumentFormat.DOCX,
      xlsx: DocumentFormat.XLSX,
    };

    return extensionMap[ext] || null;
  }

  /**
   * Detect format from content
   */
  private detectFormatFromContent(buffer: Buffer): DocumentFormat | null {
    // Check for common file signatures (magic numbers)
    const signatures: Array<{ bytes: number[]; format: DocumentFormat }> = [
      { bytes: [0x25, 0x50, 0x44, 0x46], format: DocumentFormat.PDF }, // %PDF
      { bytes: [0x50, 0x4b, 0x03, 0x04], format: DocumentFormat.DOCX }, // PK.. (ZIP-based)
      { bytes: [0x7b], format: DocumentFormat.JSON }, // { (JSON start)
      { bytes: [0x3c, 0x68, 0x74, 0x6d, 0x6c], format: DocumentFormat.HTML }, // <html
      { bytes: [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45], format: DocumentFormat.HTML }, // <!DOCTYPE
    ];

    for (const sig of signatures) {
      if (this.bufferStartsWith(buffer, sig.bytes)) {
        return sig.format;
      }
    }

    // Try to detect text-based formats
    const text = buffer.toString('utf-8', 0, Math.min(1000, buffer.length));
    
    // Check for CSV patterns
    if (this.looksLikeCSV(text)) {
      return DocumentFormat.CSV;
    }

    // Check for Markdown patterns
    if (this.looksLikeMarkdown(text)) {
      return DocumentFormat.MARKDOWN;
    }

    // Default to text if it's valid UTF-8
    if (this.isValidUTF8(buffer)) {
      return DocumentFormat.TEXT;
    }

    return DocumentFormat.UNSTRUCTURED;
  }

  /**
   * Check if buffer starts with specific bytes
   */
  private bufferStartsWith(buffer: Buffer, bytes: number[]): boolean {
    if (buffer.length < bytes.length) return false;
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[i] !== bytes[i]) return false;
    }
    return true;
  }

  /**
   * Check if text looks like CSV
   */
  private looksLikeCSV(text: string): boolean {
    const lines = text.split('\n').slice(0, 5);
    if (lines.length < 2) return false;

    const delimiters = [',', '\t', ';', '|'];
    for (const delimiter of delimiters) {
      const counts = lines.map(line => line.split(delimiter).length);
      if (counts.every(count => count > 1 && count === counts[0])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if text looks like Markdown
   */
  private looksLikeMarkdown(text: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s+/m, // Headers
      /^\* .+/m, // Unordered lists
      /^\d+\. .+/m, // Ordered lists
      /\[.+\]\(.+\)/, // Links
      /!\[.+\]\(.+\)/, // Images
      /```[\s\S]*```/, // Code blocks
      /\*\*.+\*\*/, // Bold
      /\*.+\*/, // Italic
    ];

    let matchCount = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(text)) matchCount++;
    }

    return matchCount >= 2;
  }

  /**
   * Check if buffer contains valid UTF-8
   */
  private isValidUTF8(buffer: Buffer): boolean {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      decoder.decode(buffer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return [
      DocumentFormat.TEXT,
      DocumentFormat.JSON,
      DocumentFormat.MARKDOWN,
      DocumentFormat.HTML,
      ...Array.from(this.loaderRegistry.keys()),
    ];
  }

  /**
   * Generate document ID based on content
   */
  protected generateDocumentId(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Extract basic metadata from content
   */
  protected extractBasicMetadata(content: string): Record<string, any> {
    const lines = content.split('\n');
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const lineCount = lines.length;
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lineCount;

    return {
      wordCount,
      lineCount,
      characterCount: content.length,
      avgLineLength: Math.round(avgLineLength),
      hasNumbers: /\d/.test(content),
      hasUrls: /https?:\/\/\S+/.test(content),
      hasEmails: /\S+@\S+\.\S+/.test(content),
    };
  }
}