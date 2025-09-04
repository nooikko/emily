import type { Document } from '@langchain/core/documents';
import type { BaseMessage } from '@langchain/core/messages';
import type { VectorStoreRetriever } from '@langchain/core/vectorstores';
import type { QdrantVectorStore } from '@langchain/qdrant';

/**
 * Type for LangGraph state updates in streaming
 * This represents the actual return type from LangGraph streaming
 */
export type StreamChunk = 
  | { messages: BaseMessage[] } // State update with messages
  | Record<string, unknown> // Other state updates
  | BaseMessage; // Direct message updates

/**
 * Configuration for chat operations
 */
export interface ChatConfig {
  /** Configurable options including thread_id */
  configurable: {
    thread_id: string;
    [key: string]: unknown;
  };
  /** Additional streaming configuration */
  streamMode?: 'messages' | 'updates' | 'values';
  /** Other configuration options */
  [key: string]: unknown;
}

/**
 * Configuration interface for Qdrant vector store
 */
export interface QdrantConfig {
  /** Qdrant server URL */
  url: string;
  /** Qdrant server port */
  port?: number;
  /** API key for authentication */
  apiKey?: string;
  /** Collection name for storing vectors */
  collectionName: string;
}

/**
 * Metadata for memory documents stored in Qdrant
 */
export interface MemoryMetadata {
  /** Thread/conversation ID */
  threadId: string;
  /** Timestamp when the message was created */
  timestamp: number;
  /** Type of message (human or AI) */
  messageType: 'human' | 'ai';
  /** Optional importance score for the message */
  importance?: number;
  /** Optional summary of the message content */
  summary?: string;
  /** Optional tags for categorization */
  tags?: string[];
  /** Optional source information */
  source?: string;
}

/**
 * Document interface for memory storage in Qdrant
 */
export interface MemoryDocument {
  /** The actual content/text of the memory */
  content: string;
  /** Metadata associated with the memory */
  metadata: MemoryMetadata;
}

/**
 * Retrieved memory with relevance information
 */
export interface RetrievedMemory {
  /** The content of the retrieved memory */
  content: string;
  /** Relevance score (0-1, higher is more relevant) */
  relevanceScore: number;
  /** Timestamp when the memory was created */
  timestamp: number;
  /** Type of message that created this memory */
  messageType: 'human' | 'ai';
  /** Optional metadata from the memory */
  metadata?: Partial<MemoryMetadata>;
}

/**
 * Configuration for hybrid memory system
 */
export interface HybridMemoryConfig {
  /** Whether to enable semantic memory (Qdrant) */
  enableSemanticMemory: boolean;
  /** Maximum number of messages to process for memory storage */
  maxMessagesForMemory: number;
  /** Threshold score for memory retrieval (0-1) */
  memoryRetrievalThreshold: number;
  /** Number of memories to retrieve in batch */
  memoryBatchSize: number;
  /** Whether to enable cross-thread memory search */
  enableGlobalMemorySearch?: boolean;
  /** Minimum content length to store in memory */
  minContentLength?: number;
}

/**
 * Options for storing conversation memories
 */
export interface StoreMemoryOptions {
  /** Whether to store memories in batch for better performance */
  batchStore?: boolean;
  /** Importance score for the memories (affects retrieval priority) */
  importance?: number;
  /** Optional tags to categorize the memories */
  tags?: string[];
  /** Whether to generate summaries for long content */
  generateSummary?: boolean;
}

/**
 * Options for retrieving relevant memories
 */
export interface RetrieveMemoryOptions {
  /** Maximum number of memories to retrieve */
  limit?: number;
  /** Whether to include memories from other threads */
  includeGlobalMemories?: boolean;
  /** Minimum relevance score for returned memories */
  minRelevanceScore?: number;
  /** Optional time range for memory search */
  timeRange?: {
    start: number;
    end: number;
  };
  /** Optional tags to filter memories */
  tags?: string[];
  /** Whether to boost recent memories */
  boostRecent?: boolean;
}

/**
 * Options for building enriched conversation context
 */
export interface BuildContextOptions {
  /** Maximum number of history messages to include */
  maxHistoryMessages?: number;
  /** Whether to include semantic memories */
  includeSemanticMemories?: boolean;
  /** Custom query for semantic memory retrieval */
  semanticQuery?: string;
  /** Maximum total context length (in tokens, approximate) */
  maxContextTokens?: number;
  /** Whether to prioritize recent messages */
  prioritizeRecent?: boolean;
}

/**
 * Health status for memory systems
 */
export interface MemoryHealthStatus {
  /** Whether the checkpointer is available and functional */
  checkpointer: {
    available: boolean;
    error?: string;
    lastChecked?: number;
  };
  /** Whether the semantic memory (Qdrant) is available and functional */
  semantic: {
    available: boolean;
    connected?: boolean;
    collectionExists?: boolean;
    error?: string;
    lastChecked?: number;
    collectionInfo?: {
      pointsCount?: number;
      vectorsCount?: number;
      status?: string;
    };
  };
}

/**
 * Enhanced health status including memory enhancement info
 */
export interface EnhancedMemoryHealthStatus extends MemoryHealthStatus {
  /** Whether memory enhancement is enabled */
  memoryEnhanced: boolean;
  /** Configuration details */
  config?: HybridMemoryConfig;
}

/**
 * Qdrant search filter interface
 */
export interface QdrantFilter {
  must?: Array<{
    key: string;
    match?: {
      value: string | number | boolean;
    };
    range?: {
      gte?: number;
      lte?: number;
      gt?: number;
      lt?: number;
    };
  }>;
  should?: Array<{
    key: string;
    match: {
      value: string | number | boolean;
    };
  }>;
  must_not?: Array<{
    key: string;
    match: {
      value: string | number | boolean;
    };
  }>;
}

/**
 * Qdrant retriever options
 */
export interface QdrantRetrieverOptions {
  /** Number of documents to retrieve */
  k?: number;
  /** Score threshold for similarity search */
  scoreThreshold?: number;
  /** Optional thread ID to filter results */
  threadId?: string;
  /** Custom filter for advanced querying */
  filter?: QdrantFilter;
}

/**
 * Memory service interface for dependency injection
 */
export interface MemoryService {
  /** Initialize the memory service */
  initialize(): Promise<void>;

  /** Store a single memory document */
  storeMemory(memory: MemoryDocument): Promise<void>;

  /** Store multiple memory documents */
  storeMemories(memories: MemoryDocument[]): Promise<void>;

  /** Retrieve relevant memories based on query */
  retrieveRelevantMemories(query: string, threadId?: string, options?: RetrieveMemoryOptions): Promise<Document[]>;

  /** Create a retriever for LangChain integration */
  asRetriever(options?: QdrantRetrieverOptions): VectorStoreRetriever<QdrantVectorStore>;

  /** Clear memories for a specific thread */
  clearThreadMemories(threadId: string): Promise<void>;

  /** Get health status */
  getHealthStatus(): Promise<MemoryHealthStatus['semantic']>;

  /** Cleanup resources */
  cleanup(): Promise<void>;
}

/**
 * Hybrid memory service interface
 */
export interface HybridMemoryServiceInterface {
  /** Store conversation memory */
  storeConversationMemory(messages: BaseMessage[], threadId: string, options?: StoreMemoryOptions): Promise<void>;

  /** Retrieve relevant memories */
  retrieveRelevantMemories(query: string, threadId: string, options?: RetrieveMemoryOptions): Promise<RetrievedMemory[]>;

  /** Get conversation history from checkpointer */
  getConversationHistory(threadId: string): Promise<BaseMessage[]>;

  /** Build enriched context combining history and memories */
  buildEnrichedContext(currentMessages: BaseMessage[], threadId: string, options?: BuildContextOptions): Promise<BaseMessage[]>;

  /** Process new messages for memory storage */
  processNewMessages(messages: BaseMessage[], threadId: string, options?: StoreMemoryOptions): Promise<void>;

  /** Clear all memories for a thread */
  clearThreadMemories(threadId: string): Promise<void>;

  /** Get comprehensive health status */
  getHealthStatus(): Promise<MemoryHealthStatus>;

  /** Get configuration */
  getConfig(): HybridMemoryConfig;
}

/**
 * Agent interface with memory capabilities
 */
export interface MemoryEnhancedAgent {
  /** Standard chat method */
  chat(input: { messages: BaseMessage[] }, chatOptions: { configurable: { thread_id: string } }): Promise<BaseMessage | null>;

  /** 
   * Streaming chat method
   * @returns AsyncIterable of unknown because LangGraph stream returns complex union types
   * that vary based on configuration. Consumers should handle type checking at runtime.
   */
  stream(input: { messages: BaseMessage[] }, chatOptions: ChatConfig): Promise<AsyncIterable<unknown>>;

  /** Get conversation history */
  getHistory(threadId: string): Promise<BaseMessage[]>;

  /** Initialize memory systems */
  initMemorySystem(): Promise<void>;

  /** Get relevant memories */
  getRelevantMemories(query: string, threadId: string): Promise<RetrievedMemory[]>;

  /** Store memories manually */
  storeMemories(messages: BaseMessage[], threadId: string): Promise<void>;

  /** Clear thread memories */
  clearThreadMemories(threadId: string): Promise<void>;

  /** Get memory health status */
  getMemoryHealthStatus(): Promise<EnhancedMemoryHealthStatus>;

  /** Check if memory enhancement is enabled */
  isMemoryEnhanced(): boolean;

  /** Get hybrid memory service */
  getHybridMemory(): HybridMemoryServiceInterface | null;
}

/**
 * Type guards for message types
 */
export const isHumanMessage = (message: BaseMessage): message is BaseMessage => {
  return message?.constructor && message.constructor.name === 'HumanMessage';
};

export const isAIMessage = (message: BaseMessage): message is BaseMessage => {
  return message?.constructor && (message.constructor.name === 'AIMessage' || message.constructor.name === 'ChatMessage');
};

export const isSystemMessage = (message: BaseMessage): message is BaseMessage => {
  return message?.constructor && message.constructor.name === 'SystemMessage';
};

/**
 * Type guard for validating QdrantConfig
 */
export const isValidQdrantConfig = (config: unknown): config is QdrantConfig => {
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof (config as QdrantConfig).url === 'string' &&
    typeof (config as QdrantConfig).collectionName === 'string' &&
    ((config as QdrantConfig).port === undefined || typeof (config as QdrantConfig).port === 'number') &&
    ((config as QdrantConfig).apiKey === undefined || typeof (config as QdrantConfig).apiKey === 'string')
  );
};

/**
 * Type guard for validating MemoryMetadata
 */
export const isValidMemoryMetadata = (metadata: unknown): metadata is MemoryMetadata => {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    typeof (metadata as MemoryMetadata).threadId === 'string' &&
    typeof (metadata as MemoryMetadata).timestamp === 'number' &&
    ((metadata as MemoryMetadata).messageType === 'human' || (metadata as MemoryMetadata).messageType === 'ai')
  );
};

/**
 * Type guard for validating MemoryDocument
 */
export const isValidMemoryDocument = (doc: unknown): doc is MemoryDocument => {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    typeof (doc as MemoryDocument).content === 'string' &&
    isValidMemoryMetadata((doc as MemoryDocument).metadata)
  );
};

/**
 * Utility type for memory document with optional fields
 */
export type PartialMemoryDocument = Omit<MemoryDocument, 'metadata'> & {
  metadata: Partial<MemoryMetadata> & Pick<MemoryMetadata, 'threadId'>;
};

/**
 * Type for memory search results with score
 */
export type MemorySearchResult = [Document, number];

/**
 * Configuration for memory-enhanced agent builder
 */
export interface MemoryEnhancedAgentConfig {
  /** Whether to enable semantic memory */
  enableSemanticMemory: boolean;
  /** Hybrid memory service instance */
  hybridMemory: HybridMemoryServiceInterface;
  /** Maximum context messages to include */
  maxContextMessages: number;
  /** Whether to include system prompt automatically */
  includeSystemPrompt: boolean;
}
