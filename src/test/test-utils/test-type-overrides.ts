import type { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BaseRetriever } from '@langchain/core/retrievers';
import type { RunnableConfig, RunnableSequence } from '@langchain/core/runnables';

/**
 * Common test input types
 */
export type TestLLMInput = string | { messages: unknown[] } | { content: string };

/**
 * Common test response types
 */
export type TestLLMResponse = string | { content: string; [key: string]: unknown };

/**
 * Test chain input/output types
 */
export type TestChainInput = Record<string, unknown> | string;
export type TestChainResponse = { text: string; [key: string]: unknown } | string;

/**
 * Type override utilities for test files to handle mock type compatibility
 * This provides a bridge between Jest mocks and strict LangChain types
 */

// Override interface for test mocks to be compatible with LangChain types
export interface MockLLMInterface extends Partial<BaseLanguageModel> {
  call: jest.MockedFunction<(prompt: string) => Promise<string>>;
  _modelType: string;
  _llmType: string;
  invoke?: jest.MockedFunction<(input: TestLLMInput) => Promise<TestLLMResponse>>;
  stream?: jest.MockedFunction<(input: TestLLMInput) => AsyncGenerator<TestLLMResponse>>;
}

export interface MockRetrieverInterface extends Partial<BaseRetriever> {
  getRelevantDocuments: jest.MockedFunction<(query: string) => Promise<Document[]>>;
  _getType?: jest.MockedFunction<() => string>;
}

export interface MockChainInterface extends Partial<RunnableSequence<TestChainInput, TestChainResponse>> {
  invoke: jest.MockedFunction<(input: TestChainInput, config?: RunnableConfig) => Promise<TestChainResponse>>;
}

/**
 * Type assertion helpers for test files
 */
export const asMockLLM = (mock: MockLLMInterface): BaseLanguageModel => mock as unknown as BaseLanguageModel;
export const asMockRetriever = (mock: MockRetrieverInterface): BaseRetriever => mock as unknown as BaseRetriever;
export const asMockChain = (mock: MockChainInterface): RunnableSequence<TestChainInput, TestChainResponse> =>
  mock as unknown as RunnableSequence<TestChainInput, TestChainResponse>;

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

export const createTestRetrieverMock = (documents?: Document[]): MockRetrieverInterface => ({
  getRelevantDocuments: jest.fn().mockResolvedValue(documents || []),
  _getType: jest.fn().mockReturnValue('mock_retriever'),
});

export const createTestChainMock = (response?: TestChainResponse): MockChainInterface => ({
  invoke: jest.fn().mockResolvedValue(response || { text: 'Mock chain response' }),
});
