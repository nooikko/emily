import type { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseRetriever } from '@langchain/core/retrievers';
import type { VectorStore } from '@langchain/core/vectorstores';

/**
 * Configuration for conversational retrieval
 */
export interface ConversationalRetrievalConfig {
  /** The retriever to use for document retrieval */
  retriever: BaseRetriever;
  /** The LLM to use for generating responses */
  llm: BaseLanguageModel;
  /** Memory window size for conversation history */
  memoryWindowSize?: number;
  /** Whether to return source documents */
  returnSourceDocuments?: boolean;
  /** Maximum number of tokens for the conversation context */
  maxContextTokens?: number;
  /** Custom prompt template for the chain */
  qaTemplate?: string;
  /** Custom prompt template for question generation */
  questionGeneratorTemplate?: string;
}

/**
 * Configuration for QA retrieval with sources
 */
export interface QARetrievalConfig {
  /** The retriever to use for document retrieval */
  retriever: BaseRetriever;
  /** The LLM to use for generating responses */
  llm: BaseLanguageModel;
  /** Chain type - either 'stuff', 'map_reduce', 'refine', or 'map_rerank' */
  chainType?: 'stuff' | 'map_reduce' | 'refine' | 'map_rerank';
  /** Custom prompt template */
  prompt?: string;
  /** Whether to return intermediate steps */
  returnIntermediateSteps?: boolean;
}

/**
 * Configuration for ensemble retriever
 */
export interface EnsembleRetrieverConfig {
  /** Array of retrievers to combine */
  retrievers: BaseRetriever[];
  /** Weights for each retriever (must sum to 1.0) */
  weights?: number[];
  /** Method for combining scores */
  combineMethod?: 'weighted_sum' | 'max' | 'min' | 'average';
  /** Whether to remove duplicate documents */
  removeDuplicates?: boolean;
  /** Function to determine document similarity for deduplication */
  similarityThreshold?: number;
}

/**
 * Configuration for contextual compression retriever
 */
export interface CompressionRetrieverConfig {
  /** Base retriever to compress results from */
  baseRetriever: BaseRetriever;
  /** The LLM to use for compression */
  llm: BaseLanguageModel;
  /** Document compressor to use */
  compressorType?: 'llm_chain_extractor' | 'llm_chain_filter' | 'document_compressor';
  /** Maximum number of documents to return after compression */
  maxDocs?: number;
  /** Relevance threshold for filtering */
  relevanceThreshold?: number;
  /** Custom prompt for the compressor */
  compressorPrompt?: string;
}

/**
 * Configuration for parent document retriever
 */
export interface ParentDocumentRetrieverConfig {
  /** Vector store for child documents */
  vectorStore: VectorStore;
  /** Document store for parent documents */
  docstore: unknown; // DocumentStore interface
  /** Child splitter for creating smaller chunks */
  childSplitter?: unknown; // TextSplitter interface
  /** Parent splitter for creating parent documents */
  parentSplitter?: unknown; // TextSplitter interface
  /** ID key to use for parent documents */
  idKey?: string;
  /** Search type for retrieval */
  searchType?: 'similarity' | 'mmr';
  /** Search kwargs for the retriever */
  searchKwargs?: Record<string, unknown>;
}

/**
 * Configuration for self-query retriever
 */
export interface SelfQueryRetrieverConfig {
  /** Vector store to query */
  vectorStore: VectorStore;
  /** The LLM to use for query construction */
  llm: BaseLanguageModel;
  /** Document content description */
  documentContents: string;
  /** Metadata field information */
  metadataFieldInfo?: Array<{
    name: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'date';
  }>;
  /** Whether to enable query validation */
  enableQueryValidation?: boolean;
  /** Custom prompt for query generation */
  queryGeneratorPrompt?: string;
}

/**
 * Configuration for reranking
 */
export interface RerankingConfig {
  /** Base retriever to rerank results from */
  baseRetriever: BaseRetriever;
  /** The LLM to use for reranking */
  llm: BaseLanguageModel;
  /** Reranking method */
  rerankingMethod?: 'mmr' | 'llm_chain_ranker' | 'cross_encoder';
  /** Lambda parameter for MMR (diversity vs relevance) */
  mmrLambda?: number;
  /** Number of documents to consider for reranking */
  topK?: number;
  /** Final number of documents to return after reranking */
  finalK?: number;
  /** Custom reranking prompt */
  rerankingPrompt?: string;
}

/**
 * Result from conversational retrieval
 */
export interface ConversationalRetrievalResult {
  /** The generated answer */
  answer: string;
  /** Source documents used */
  sourceDocuments?: Document[];
  /** Generated question (if using question generation) */
  generatedQuestion?: string;
  /** Chat history used */
  chatHistory?: BaseMessage[];
}

/**
 * Result from QA retrieval
 */
export interface QARetrievalResult {
  /** The generated answer */
  answer: string;
  /** Source documents with metadata */
  sources: Array<{
    document: Document;
    score?: number;
    metadata?: Record<string, unknown>;
  }>;
  /** Intermediate steps (if enabled) */
  intermediateSteps?: Array<{
    step: string;
    output: unknown;
  }>;
}

/**
 * Search result with reranking information
 */
export interface RerankedResult {
  /** The document */
  document: Document;
  /** Original retrieval score */
  originalScore: number;
  /** Reranked score */
  rerankedScore: number;
  /** Rank position */
  rank: number;
  /** Reranking method used */
  rerankingMethod: string;
}

/**
 * Document with parent-child relationship information
 */
export interface HierarchicalDocument extends Document {
  /** Parent document ID */
  parentId?: string;
  /** Child document IDs */
  childIds?: string[];
  /** Hierarchy level (0 = root) */
  level?: number;
  /** Document type */
  documentType?: 'parent' | 'child';
}

/**
 * Metadata for ensemble retrieval results
 */
export interface EnsembleRetrievalMetadata {
  /** Scores from each retriever */
  retrieverScores: Array<{
    retrieverId: string;
    score: number;
    weight: number;
  }>;
  /** Final combined score */
  combinedScore: number;
  /** Combination method used */
  combineMethod: string;
  /** Whether this document was deduplicated */
  isDeduplicated?: boolean;
}

/**
 * Query analysis result for self-query retriever
 */
export interface QueryAnalysisResult {
  /** The structured query */
  query: string;
  /** Extracted filter conditions */
  filter?: Record<string, unknown>;
  /** Query type classification */
  queryType?: 'semantic' | 'filter' | 'hybrid';
  /** Confidence score for the query analysis */
  confidence?: number;
  /** Generated filter explanation */
  filterExplanation?: string;
}

/**
 * Configuration for document chunking and hierarchy
 */
export interface DocumentChunkingConfig {
  /** Chunk size for child documents */
  childChunkSize?: number;
  /** Overlap between child chunks */
  childChunkOverlap?: number;
  /** Parent chunk size */
  parentChunkSize?: number;
  /** Overlap between parent chunks */
  parentChunkOverlap?: number;
  /** Separator for splitting */
  separators?: string[];
  /** Whether to keep separator in chunks */
  keepSeparator?: boolean;
}

/**
 * Interface for document compression results
 */
export interface CompressionResult {
  /** Compressed documents */
  documents: Document[];
  /** Compression ratio (compressed size / original size) */
  compressionRatio: number;
  /** Number of documents removed */
  documentsRemoved: number;
  /** Compression method used */
  compressionMethod: string;
  /** Token count before compression */
  originalTokenCount?: number;
  /** Token count after compression */
  compressedTokenCount?: number;
}

/**
 * Performance metrics for RAG operations
 */
export interface RAGMetrics {
  /** Retrieval latency in milliseconds */
  retrievalLatency: number;
  /** Generation latency in milliseconds */
  generationLatency: number;
  /** Total latency in milliseconds */
  totalLatency: number;
  /** Number of documents retrieved */
  documentsRetrieved: number;
  /** Number of documents used in final answer */
  documentsUsed: number;
  /** Token count for input */
  inputTokens: number;
  /** Token count for output */
  outputTokens: number;
  /** Relevance score (if available) */
  relevanceScore?: number;
}
