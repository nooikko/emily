import type { Document } from '@langchain/core/documents';

/**
 * Supported document formats for loading
 */
export enum DocumentFormat {
  PDF = 'pdf',
  TEXT = 'text',
  CSV = 'csv',
  JSON = 'json',
  MARKDOWN = 'markdown',
  HTML = 'html',
  DOCX = 'docx',
  XLSX = 'xlsx',
  UNSTRUCTURED = 'unstructured',
}

/**
 * Document loader configuration
 */
export interface DocumentLoaderConfig {
  /** File path or buffer to load */
  source: string | Buffer;
  /** Document format (auto-detected if not provided) */
  format?: DocumentFormat;
  /** Custom metadata to add to all documents */
  metadata?: Record<string, any>;
  /** Options specific to the loader type */
  loaderOptions?: Record<string, any>;
  /** Whether to validate the document before loading */
  validate?: boolean;
  /** Maximum file size in bytes (default: 100MB) */
  maxFileSize?: number;
}

/**
 * PDF-specific loader options
 */
export interface PDFLoaderOptions {
  /** Whether to split by pages */
  splitPages?: boolean;
  /** Extract images from PDF */
  extractImages?: boolean;
  /** Password for protected PDFs */
  password?: string;
  /** OCR configuration for scanned PDFs */
  ocr?: {
    enabled: boolean;
    language?: string;
  };
}

/**
 * CSV-specific loader options
 */
export interface CSVLoaderOptions {
  /** Column delimiter */
  delimiter?: string;
  /** Quote character */
  quoteChar?: string;
  /** Columns to use as content */
  contentColumns?: string[];
  /** Columns to use as metadata */
  metadataColumns?: string[];
  /** Whether first row contains headers */
  hasHeaders?: boolean;
  /** Encoding of the CSV file */
  encoding?: BufferEncoding;
}

/**
 * Text-specific loader options
 */
export interface TextLoaderOptions {
  /** Encoding of the text file */
  encoding?: BufferEncoding;
  /** Line separator */
  lineSeparator?: string;
  /** Whether to preserve line breaks */
  preserveLineBreaks?: boolean;
}

/**
 * Unstructured loader options for various file types
 */
export interface UnstructuredLoaderOptions {
  /** Strategy for processing */
  strategy?: 'hi_res' | 'ocr_only' | 'fast';
  /** Languages for OCR */
  languages?: string[];
  /** Whether to extract metadata */
  includeMetadata?: boolean;
  /** API endpoint for unstructured.io (if using API) */
  apiUrl?: string;
  /** API key for unstructured.io */
  apiKey?: string;
}

/**
 * Document loading result
 */
export interface DocumentLoadResult {
  /** Loaded documents */
  documents: Document[];
  /** Loading metadata */
  metadata: {
    /** Source file path or identifier */
    source: string;
    /** Detected or specified format */
    format: DocumentFormat;
    /** Number of documents loaded */
    documentCount: number;
    /** Total character count */
    totalCharacters: number;
    /** File size in bytes */
    fileSize: number;
    /** Loading duration in milliseconds */
    loadingTime: number;
    /** Any warnings during loading */
    warnings?: string[];
  };
}

/**
 * Document validation result
 */
export interface DocumentValidationResult {
  /** Whether the document is valid */
  isValid: boolean;
  /** Validation errors if any */
  errors?: string[];
  /** Detected format */
  detectedFormat?: DocumentFormat;
  /** File size in bytes */
  fileSize?: number;
  /** MIME type if detected */
  mimeType?: string;
}

/**
 * Interface for document loader implementations
 */
export interface IDocumentLoader {
  /**
   * Load documents from source
   */
  load(config: DocumentLoaderConfig): Promise<DocumentLoadResult>;

  /**
   * Validate document before loading
   */
  validate(source: string | Buffer): Promise<DocumentValidationResult>;

  /**
   * Detect document format
   */
  detectFormat(source: string | Buffer): Promise<DocumentFormat | null>;

  /**
   * Get supported formats
   */
  getSupportedFormats(): DocumentFormat[];
}

/**
 * Document chunking configuration
 */
export interface DocumentChunkingConfig {
  /** Maximum chunk size in characters */
  chunkSize: number;
  /** Overlap between chunks in characters */
  chunkOverlap: number;
  /** Separators to use for splitting (in order of preference) */
  separators?: string[];
  /** Whether to keep separators in chunks */
  keepSeparator?: boolean;
  /** Whether to preserve paragraphs */
  preserveParagraphs?: boolean;
  /** Whether to preserve sentences */
  preserveSentences?: boolean;
  /** Minimum chunk size (chunks smaller than this will be merged) */
  minChunkSize?: number;
}

/**
 * Document metadata extraction configuration
 */
export interface MetadataExtractionConfig {
  /** Extract file properties (size, dates, etc.) */
  extractFileProperties?: boolean;
  /** Extract content-based metadata (title, author, etc.) */
  extractContentMetadata?: boolean;
  /** Extract keywords */
  extractKeywords?: boolean;
  /** Generate summary */
  generateSummary?: boolean;
  /** Classify document type */
  classifyDocument?: boolean;
  /** Custom extractors */
  customExtractors?: Array<{
    name: string;
    extractor: (document: Document) => Promise<Record<string, any>>;
  }>;
}

/**
 * Document versioning configuration
 */
export interface DocumentVersioningConfig {
  /** Enable versioning */
  enabled: boolean;
  /** Version strategy */
  strategy: 'timestamp' | 'hash' | 'incremental';
  /** Store previous versions */
  storePreviousVersions?: boolean;
  /** Maximum versions to keep */
  maxVersions?: number;
  /** Compare with previous version */
  trackChanges?: boolean;
}

/**
 * Document transformation configuration
 */
export interface DocumentTransformationConfig {
  /** Preprocessing transformations */
  preprocessing?: Array<{
    name: string;
    transformer: (document: Document) => Promise<Document>;
  }>;
  /** Content cleaning */
  cleaning?: {
    /** Remove extra whitespace */
    removeExtraWhitespace?: boolean;
    /** Remove special characters */
    removeSpecialCharacters?: boolean;
    /** Normalize unicode */
    normalizeUnicode?: boolean;
    /** Convert to lowercase */
    toLowerCase?: boolean;
  };
  /** Content enrichment */
  enrichment?: {
    /** Add timestamps */
    addTimestamps?: boolean;
    /** Add document ID */
    addDocumentId?: boolean;
    /** Add source information */
    addSourceInfo?: boolean;
    /** Custom enrichers */
    customEnrichers?: Array<{
      name: string;
      enricher: (document: Document) => Promise<Document>;
    }>;
  };
}