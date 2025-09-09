import type { Document } from '@langchain/core/documents';
import type { BaseLanguageModel, BaseLanguageModelCallOptions } from '@langchain/core/language_models/base';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseRetriever } from '@langchain/core/retrievers';
import type { RunnableConfig } from '@langchain/core/runnables';

/**
 * Mock implementation of BaseLanguageModel for testing
 */
export class MockBaseLanguageModel extends BaseLanguageModel<any, BaseLanguageModelCallOptions> {
  _llmType(): string {
    return 'mock_llm';
  }

  _modelType(): string {
    return 'base_llm';
  }

  async _generate(
    messages: BaseMessage[][],
    options: this['ParsedCallOptions'],
    runManager?: any,
  ): Promise<any> {
    return {
      generations: messages.map(() => [{ text: 'Mock LLM response' }]),
    };
  }

  // Mock implementations for common methods
  async call(prompt: string): Promise<string> {
    return 'Mock LLM response';
  }

  async invoke(input: any, config?: RunnableConfig): Promise<any> {
    return { content: 'Mock LLM response' };
  }

  async *stream(input: any, config?: RunnableConfig): AsyncGenerator<any> {
    yield { content: 'Mock response' };
  }
}

/**
 * Mock implementation of BaseRetriever for testing
 */
export class MockBaseRetriever extends BaseRetriever {
  lc_namespace = ['test', 'retrievers'];

  private mockDocuments: Document[];

  constructor(mockDocuments?: Document[]) {
    super();
    this.mockDocuments = mockDocuments || [
      new Document({
        pageContent: 'Test document content',
        metadata: { source: 'test.txt', score: 0.85 },
      }),
    ];
  }

  async _getRelevantDocuments(query: string, runManager?: any): Promise<Document[]> {
    return this.mockDocuments;
  }

  _getType(): string {
    return 'mock_retriever';
  }

  // Add support for updating mock documents during tests
  setMockDocuments(documents: Document[]): void {
    this.mockDocuments = documents;
  }
}

/**
 * Mock implementation of Runnable chains for testing
 */
export class MockRunnableChain {
  private mockResponse: any;

  constructor(mockResponse: any = { text: 'Mock chain response' }) {
    this.mockResponse = mockResponse;
  }

  async invoke(input: any, config?: RunnableConfig): Promise<any> {
    return this.mockResponse;
  }

  setMockResponse(response: any): void {
    this.mockResponse = response;
  }
}

/**
 * Factory functions for creating mocked LangChain components
 */
export const createMockLLM = (responses?: Partial<MockBaseLanguageModel>): MockBaseLanguageModel => {
  const mockLLM = new MockBaseLanguageModel({});
  
  // Override methods if custom responses are provided
  if (responses?.call) {
    mockLLM.call = responses.call;
  }
  if (responses?.invoke) {
    mockLLM.invoke = responses.invoke;
  }
  if (responses?.stream) {
    mockLLM.stream = responses.stream;
  }

  return mockLLM;
};

export const createMockRetriever = (documents?: Document[]): MockBaseRetriever => {
  return new MockBaseRetriever(documents);
};

export const createMockChain = (response?: any): MockRunnableChain => {
  return new MockRunnableChain(response);
};

/**
 * Jest-compatible mock types for services
 */
export type MockedService<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any 
    ? jest.MockedFunction<T[K]> 
    : T[K];
};

/**
 * Helper to create partial mocked services
 */
export const createMockService = <T extends Record<string, any>>(
  partialMock: Partial<MockedService<T>>
): jest.Mocked<T> => {
  return partialMock as jest.Mocked<T>;
};

/**
 * Mock implementations for common LangChain service dependencies
 */
export const createMockCallbackManager = () => createMockService({
  createCallbackManager: jest.fn().mockReturnValue({ handlers: [] }),
  createHandler: jest.fn(),
  getHandler: jest.fn(),
  getGlobalHandler: jest.fn(),
  removeHandler: jest.fn(),
  onModuleDestroy: jest.fn(),
});

export const createMockLangSmithService = () => createMockService({
  onModuleInit: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue(null),
  isEnabled: jest.fn().mockReturnValue(true),
  getConfig: jest.fn().mockReturnValue({}),
  createTraceable: jest.fn().mockImplementation((name: string, fn: Function) => fn),
  createMetadata: jest.fn().mockReturnValue({}),
  maskSensitiveData: jest.fn(),
  maskSensitiveObject: jest.fn().mockImplementation((obj: any) => obj),
  createRunTree: jest.fn(),
  submitRunTree: jest.fn(),
  updateRunTree: jest.fn(),
});

export const createMockAIMetricsService = () => createMockService({
  onModuleInit: jest.fn(),
  recordConversationStart: jest.fn(),
  recordConversationEnd: jest.fn(),
  recordTokenConsumption: jest.fn(),
  recordAgentExecution: jest.fn(),
  recordToolUsage: jest.fn(),
  recordErrorOccurrence: jest.fn(),
  recordCacheHit: jest.fn(),
  recordCacheMiss: jest.fn(),
  recordModelLatency: jest.fn(),
  recordOperationDuration: jest.fn(),
  getMetrics: jest.fn(),
  exportMetrics: jest.fn(),
  getConversationMetrics: jest.fn(),
  resetMetrics: jest.fn(),
});

export const createMockLangChainInstrumentationService = () => createMockService({
  instrumentOperation: jest.fn(),
  instrumentChainInvoke: jest.fn(),
  instrumentAgentExecute: jest.fn(),
  instrumentMemoryRetrieval: jest.fn(),
  instrumentToolExecution: jest.fn(),
  instrumentPromptFormatting: jest.fn(),
  instrumentEmbeddingGeneration: jest.fn(),
  instrumentVectorStoreQuery: jest.fn(),
  recordLatency: jest.fn(),
  recordTokenUsage: jest.fn(),
  startSpan: jest.fn(),
  endSpan: jest.fn(),
});

/**
 * Mock PromptTemplate that supports both constructor and static methods
 */
export class MockPromptTemplate {
  template: string;
  inputVariables: string[];

  constructor(config: { template: string; inputVariables?: string[] }) {
    this.template = config.template;
    this.inputVariables = config.inputVariables || [];
  }

  format = jest.fn().mockReturnValue('formatted prompt');
  formatPromptValue = jest.fn().mockResolvedValue({ text: 'formatted prompt' });
  invoke = jest.fn().mockResolvedValue('formatted prompt');
  _getPromptType = jest.fn().mockReturnValue('prompt');

  static fromTemplate = jest.fn().mockImplementation((template: string) => 
    new MockPromptTemplate({ template, inputVariables: [] })
  );
}