import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BaseRetriever } from '@langchain/core/retrievers';
import type { RunnableSequence } from '@langchain/core/runnables';

/**
 * Type override utilities for test files to handle mock type compatibility
 * This provides a bridge between Jest mocks and strict LangChain types
 */

// Override interface for test mocks to be compatible with LangChain types
export interface MockLLMInterface extends Partial<BaseLanguageModel> {
  call: jest.MockedFunction<(prompt: string) => Promise<string>>;
  _modelType: string;
  _llmType: string;
  invoke?: jest.MockedFunction<(input: any) => Promise<any>>;
  stream?: jest.MockedFunction<(input: any) => AsyncGenerator<any>>;
}

export interface MockRetrieverInterface extends Partial<BaseRetriever> {
  getRelevantDocuments: jest.MockedFunction<(query: string) => Promise<any[]>>;
  _getType?: jest.MockedFunction<() => string>;
}

export interface MockChainInterface extends Partial<RunnableSequence<any, any>> {
  invoke: jest.MockedFunction<(input: any, config?: any) => Promise<any>>;
}

/**
 * Type assertion helpers for test files
 */
export const asMockLLM = (mock: any): BaseLanguageModel => mock as BaseLanguageModel;
export const asMockRetriever = (mock: any): BaseRetriever => mock as BaseRetriever;
export const asMockChain = (mock: any): RunnableSequence<any, any> => mock as RunnableSequence<any, any>;

/**
 * Type-safe mock creators
 */
export const createTestLLMMock = (): MockLLMInterface => ({
  call: jest.fn().mockResolvedValue('Mock LLM response'),
  _modelType: 'base_llm',
  _llmType: 'mock',
  invoke: jest.fn().mockResolvedValue({ content: 'Mock LLM response' }),
  stream: jest.fn().mockImplementation(async function* () {
    yield { content: 'Mock response' };
  }),
});

export const createTestRetrieverMock = (documents?: any[]): MockRetrieverInterface => ({
  getRelevantDocuments: jest.fn().mockResolvedValue(documents || []),
  _getType: jest.fn().mockReturnValue('mock_retriever'),
});

export const createTestChainMock = (response?: any): MockChainInterface => ({
  invoke: jest.fn().mockResolvedValue(response || { text: 'Mock chain response' }),
});
