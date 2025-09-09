import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
// Using built-in CSV parsing instead of csv-parse package
import { TraceAI } from '../../observability/decorators/trace.decorator';
import {
  type CSVLoaderOptions,
  DocumentFormat,
  type DocumentLoaderConfig,
  type DocumentLoadResult,
  type DocumentValidationResult,
  type IDocumentLoader,
} from '../interfaces/document-loader.interface';

/**
 * CSV document loader service using LangChain's CSVLoader
 */
@Injectable()
export class CSVLoaderService implements IDocumentLoader {
  private readonly logger = new Logger(CSVLoaderService.name);

  /**
   * Load CSV documents
   */
  @TraceAI({ name: 'csv_loader.load' })
  async load(config: DocumentLoaderConfig): Promise<DocumentLoadResult> {
    const startTime = Date.now();
    const options = (config.loaderOptions as CSVLoaderOptions) || {};

    try {
      let filePath: string;
      let tempFile = false;

      // Handle buffer input by writing to temp file
      if (Buffer.isBuffer(config.source)) {
        filePath = `/tmp/csv_${Date.now()}.csv`;
        await fs.writeFile(filePath, config.source);
        tempFile = true;
      } else {
        filePath = config.source;
      }

      try {
        // Get file stats
        const stats = await fs.stat(filePath);

        // Determine columns if not specified
        let contentColumns = options.contentColumns;
        let metadataColumns = options.metadataColumns;

        if (!contentColumns || !metadataColumns) {
          const headers = await this.detectHeaders(filePath, options);
          if (!contentColumns) {
            contentColumns = headers;
          }
          if (!metadataColumns) {
            metadataColumns = [];
          }
        }

        // Create CSVLoader instance
        const loader = new CSVLoader(filePath, {
          column: contentColumns?.[0], // Primary content column
          separator: options.delimiter || ',',
        });

        // Load documents
        const documents = await loader.load();

        // If we need more complex handling, parse manually
        if (contentColumns && contentColumns.length > 1) {
          const enhancedDocs = await this.parseWithMultipleColumns(filePath, contentColumns, metadataColumns || [], options);

          // Enhance documents with metadata
          const enhancedDocuments = enhancedDocs.map((doc, index) => {
            return new Document({
              pageContent: doc.pageContent,
              metadata: {
                ...doc.metadata,
                ...config.metadata,
                source: typeof config.source === 'string' ? config.source : 'buffer',
                format: DocumentFormat.CSV,
                rowNumber: index + 1,
                totalRows: enhancedDocs.length,
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
              format: DocumentFormat.CSV,
              documentCount: enhancedDocuments.length,
              totalCharacters,
              fileSize: stats.size,
              loadingTime: Date.now() - startTime,
            },
          };
        }

        // Enhance documents with metadata
        const enhancedDocuments = documents.map((doc, index) => {
          return new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              ...config.metadata,
              source: typeof config.source === 'string' ? config.source : 'buffer',
              format: DocumentFormat.CSV,
              rowNumber: index + 1,
              totalRows: documents.length,
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
            format: DocumentFormat.CSV,
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
      this.logger.error(`Failed to load CSV: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Parse CSV with multiple content columns
   */
  private async parseWithMultipleColumns(
    filePath: string,
    contentColumns: string[],
    metadataColumns: string[],
    options: CSVLoaderOptions,
  ): Promise<Document[]> {
    const documents: Document[] = [];
    const fileContent = await fs.readFile(filePath, options.encoding || 'utf-8');

    // Simple CSV parsing without external dependency
    const lines = fileContent.split('\n');
    const delimiter = options.delimiter || ',';
    const quote = options.quoteChar || '"';

    if (lines.length === 0) {
      return documents;
    }

    // Parse headers if present
    let headers: string[] = [];
    let dataStartIndex = 0;

    if (options.hasHeaders !== false) {
      headers = this.parseCSVLine(lines[0], delimiter, quote);
      dataStartIndex = 1;
    }

    // Parse data rows
    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = this.parseCSVLine(line, delimiter, quote);
      const record: Record<string, any> = {};

      if (headers.length > 0) {
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });
      } else {
        values.forEach((value, index) => {
          record[`column_${index}`] = value;
        });
      }

      // Combine content columns
      const content = contentColumns
        .map((col) => record[col])
        .filter((val) => val !== undefined && val !== null)
        .join('\n');

      // Extract metadata columns
      const metadata: Record<string, any> = {};
      for (const col of metadataColumns) {
        if (record[col] !== undefined) {
          metadata[col] = record[col];
        }
      }

      // Add all columns as metadata for reference
      metadata.allColumns = record;

      documents.push(
        new Document({
          pageContent: content,
          metadata,
        }),
      );
    }

    return documents;
  }

  /**
   * Parse a single CSV line handling quotes
   */
  private parseCSVLine(line: string, delimiter: string, quote: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === quote) {
        if (inQuotes && line[i + 1] === quote) {
          // Escaped quote
          current += quote;
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last field
    result.push(current);

    return result;
  }

  /**
   * Detect headers from CSV file
   */
  private async detectHeaders(filePath: string, options: CSVLoaderOptions): Promise<string[]> {
    const fileContent = await fs.readFile(filePath, options.encoding || 'utf-8');
    const lines = fileContent.split('\n');

    if (lines.length === 0) {
      return [];
    }

    const delimiter = options.delimiter || ',';
    const firstLine = lines[0];
    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));

    return headers;
  }

  /**
   * Validate CSV document
   */
  @TraceAI({ name: 'csv_loader.validate' })
  async validate(source: string | Buffer): Promise<DocumentValidationResult> {
    const errors: string[] = [];

    try {
      let fileSize: number;
      let content: string;

      if (typeof source === 'string') {
        const stats = await fs.stat(source);
        fileSize = stats.size;
        // Read first few lines to check format
        const fileContent = await fs.readFile(source, 'utf-8');
        content = fileContent.substring(0, 1000);
      } else {
        fileSize = source.length;
        content = source.toString('utf-8', 0, Math.min(1000, source.length));
      }

      // Check if it looks like CSV
      const lines = content.split('\n').filter((line) => line.trim());
      if (lines.length === 0) {
        errors.push('File appears to be empty');
      } else {
        // Check for consistent column count
        const delimiters = [',', '\t', ';', '|'];
        let validDelimiter = false;

        for (const delimiter of delimiters) {
          const counts = lines.slice(0, 5).map((line) => line.split(delimiter).length);
          if (counts.length > 1 && counts.every((count) => count > 1 && count === counts[0])) {
            validDelimiter = true;
            break;
          }
        }

        if (!validDelimiter && lines.length > 1) {
          errors.push('Could not detect consistent CSV structure');
        }
      }

      // Check file size (max 100MB by default)
      const maxSize = 100 * 1024 * 1024;
      if (fileSize > maxSize) {
        errors.push(`File size (${fileSize} bytes) exceeds maximum (${maxSize} bytes)`);
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        detectedFormat: DocumentFormat.CSV,
        fileSize,
        mimeType: 'text/csv',
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Detect if source is a CSV
   */
  async detectFormat(source: string | Buffer): Promise<DocumentFormat | null> {
    try {
      const validation = await this.validate(source);
      return validation.isValid ? DocumentFormat.CSV : null;
    } catch {
      return null;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[] {
    return [DocumentFormat.CSV];
  }
}
