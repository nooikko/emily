/**
 * Common Mock Utilities for LangChain Services
 * 
 * This file provides reusable mock implementations for complex LangChain
 * and NestJS dependencies that are commonly used across test suites.
 * 
 * Usage:
 * ```typescript
 * import { createMockCallbackManagerService, createMockLangSmithService } from '../../../test-utils/langchain-test-mocks';
 * 
 * // In your test providers
 * {
 *   provide: CallbackManagerService,
 *   useValue: createMockCallbackManagerService(),
 * }
 * ```
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Creates a mock CallbackManagerService with all required methods
 */
export function createMockCallbackManagerService() {
  return {
    getCallbacks: jest.fn(),
    createCallbacks: jest.fn(),
    createCallbackManager: jest.fn().mockReturnValue({
      handlers: [],
      addHandler: jest.fn(),
      removeHandler: jest.fn(),
      setHandlers: jest.fn(),
    }),
    getHandler: jest.fn(),
    createHandler: jest.fn(),
    removeHandler: jest.fn(), // Called in onModuleDestroy
  };
}

/**
 * Creates a mock LangSmithService with observability features disabled
 */
export function createMockLangSmithService() {
  return {
    getClient: jest.fn(),
    trace: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(false), // Disable tracing in tests
    createTraceable: jest.fn().mockImplementation((name, fn) => fn),
  };
}

/**
 * Creates a mock AIMetricsService for performance tracking
 */
export function createMockAIMetricsService() {
  return {
    recordLatency: jest.fn(),
    recordTokenUsage: jest.fn(),
    recordOperationDuration: jest.fn(), // Used in LangChainBaseService
    recordOperationCount: jest.fn(),
  };
}

/**
 * Creates a mock LangChainInstrumentationService
 */
export function createMockLangChainInstrumentationService() {
  return {
    startTrace: jest.fn(),
    endTrace: jest.fn(),
    recordMetric: jest.fn(),
    startSpan: jest.fn(), // Used in LangChainBaseService
    endSpan: jest.fn(),   // Used in LangChainBaseService
  };
}

/**
 * Creates a mock VectorStoreService for vector operations
 */
export function createMockVectorStoreService() {
  return {
    getVectorStore: jest.fn(),
    search: jest.fn(),
    addDocuments: jest.fn(),
    similaritySearch: jest.fn(),
    similaritySearchWithScore: jest.fn(),
  };
}

/**
 * Creates a mock BgeEmbeddingsService
 */
export function createMockBgeEmbeddingsService() {
  return {
    embedQuery: jest.fn(),
    embedDocuments: jest.fn(),
  };
}

/**
 * Creates a mock QdrantService for vector database operations
 */
export function createMockQdrantService() {
  return {
    getClient: jest.fn(),
    search: jest.fn(),
    upsert: jest.fn(),
    createCollection: jest.fn(),
    deleteCollection: jest.fn(),
  };
}

/**
 * Creates a mock BaseChatModel for LLM operations
 */
export function createMockBaseChatModel(): Partial<BaseChatModel> {
  return {
    invoke: jest.fn(),
    stream: jest.fn(),
    batch: jest.fn(),
  };
}

/**
 * Mock provider configurations for common NestJS testing scenarios
 */
export const COMMON_LANGCHAIN_TEST_PROVIDERS = [
  {
    provide: 'CallbackManagerService',
    useValue: createMockCallbackManagerService(),
  },
  {
    provide: 'LangSmithService',
    useValue: createMockLangSmithService(),
  },
  {
    provide: 'AIMetricsService',
    useValue: createMockAIMetricsService(),
  },
  {
    provide: 'LangChainInstrumentationService',
    useValue: createMockLangChainInstrumentationService(),
  },
  {
    provide: 'VectorStoreService',
    useValue: createMockVectorStoreService(),
  },
  {
    provide: 'BgeEmbeddingsService',
    useValue: createMockBgeEmbeddingsService(),
  },
  {
    provide: 'QdrantService',
    useValue: createMockQdrantService(),
  },
  {
    provide: 'BaseChatModel',
    useValue: createMockBaseChatModel(),
  },
];

/**
 * Creates a complete testing module configuration for LangChain services
 */
export function createLangChainTestModuleConfig() {
  return {
    imports: [
      // Basic configuration
      require('@nestjs/config').ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: [],
        load: [
          () => ({
            BGE_MODEL_NAME: 'test-model',
            QDRANT_URL: 'http://localhost:6333',
            LANGSMITH_API_KEY: 'test-key',
            LANGSMITH_PROJECT_NAME: 'test-project',
          }),
        ],
      }),
      // In-memory SQLite for testing
      require('@nestjs/typeorm').TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        entities: [],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
    ],
    providers: COMMON_LANGCHAIN_TEST_PROVIDERS,
  };
}