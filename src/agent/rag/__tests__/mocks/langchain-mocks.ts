import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import type { BasePromptValue } from '@langchain/core/prompt_values';
import type { BaseRetriever } from '@langchain/core/retrievers';

/**
 * Mock implementation of BaseLanguageModel that properly extends the base class
 */
export class MockLanguageModel implements Partial<BaseLanguageModel> {
  _modelType = 'base_llm' as const;
  _llmType = 'mock' as const;

  // Mock call method for legacy compatibility
  call = jest.fn().mockResolvedValue('Mock LLM response');

  // Mock _generate method (required by BaseLanguageModel)
  _generate = jest.fn().mockImplementation(async (messages: BaseMessage[]) => {
    return {
      generations: [
        [
          {
            text: 'Mock LLM response',
            message: new AIMessage('Mock LLM response'),
          },
        ],
      ],
      llmOutput: {},
    };
  });

  // Mock invoke method for Runnable interface
  invoke = jest.fn().mockImplementation(async (input: BasePromptValue | string) => {
    const content = typeof input === 'string' ? input : 'Mock LLM response';
    return new AIMessage(content);
  });

  // Mock generate method
  generate = jest.fn().mockImplementation(async (messages: BaseMessage[][]) => {
    return {
      generations: messages.map(() => [
        {
          text: 'Mock LLM response',
          message: new AIMessage('Mock LLM response'),
        },
      ]),
      llmOutput: {},
    };
  });

  // Mock generatePrompt method
  generatePrompt = jest.fn().mockImplementation(async (promptValues: BasePromptValue[]) => {
    return {
      generations: promptValues.map(() => [
        {
          text: 'Mock LLM response',
          message: new AIMessage('Mock LLM response'),
        },
      ]),
      llmOutput: {},
    };
  });

  // Mock _generateUncached method
  _generateUncached = jest.fn().mockImplementation(async (messages: BaseMessage[], options?: any, runManager?: CallbackManagerForLLMRun) => {
    return {
      generations: [
        [
          {
            text: 'Mock LLM response',
            message: new AIMessage('Mock LLM response'),
          },
        ],
      ],
      llmOutput: {},
    };
  });

  // Mock getNumTokens method
  getNumTokens = jest.fn().mockResolvedValue(10);
}

/**
 * Mock implementation of BaseRetriever that properly extends the base class
 */
export class MockRetriever implements Partial<BaseRetriever> {
  // Mock getRelevantDocuments method (required by BaseRetriever)
  getRelevantDocuments = jest.fn().mockResolvedValue([
    new Document({
      pageContent: 'Test document content',
      metadata: { source: 'test.txt', score: 0.8 },
    }),
    new Document({
      pageContent: 'Another test document',
      metadata: { source: 'test2.txt', score: 0.6 },
    }),
  ]);

  // Mock invoke method for Runnable interface
  invoke = jest.fn().mockImplementation(async (query: string) => {
    return this.getRelevantDocuments(query);
  });

  // Mock _getRelevantDocuments method
  _getRelevantDocuments = jest.fn().mockImplementation(async (query: string) => {
    return [
      new Document({
        pageContent: `Document about: ${query}`,
        metadata: { source: 'dynamic.txt', score: 0.9 },
      }),
    ];
  });
}

/**
 * Create mock LLM instance
 */
export function createMockLLM(): MockLanguageModel {
  return new MockLanguageModel();
}

/**
 * Create mock retriever instance
 */
export function createMockRetriever(): MockRetriever {
  return new MockRetriever();
}

/**
 * Mock PromptTemplate that supports both constructor and static methods
 */
export const MockPromptTemplate = {
  // Static fromTemplate method
  fromTemplate: jest.fn().mockImplementation((template: string) => ({
    format: jest.fn().mockResolvedValue(template.replace(/\{(\w+)\}/g, 'mock_$1')),
    formatPromptValue: jest.fn().mockResolvedValue({
      toString: () => template.replace(/\{(\w+)\}/g, 'mock_$1'),
    }),
    template,
  })),

  // Constructor mock
  new: jest.fn().mockImplementation(({ template }: { template: string }) => ({
    format: jest.fn().mockResolvedValue(template.replace(/\{(\w+)\}/g, 'mock_$1')),
    formatPromptValue: jest.fn().mockResolvedValue({
      toString: () => template.replace(/\{(\w+)\}/g, 'mock_$1'),
    }),
    template,
  })),
};

/**
 * Mock ChatPromptTemplate
 */
export const MockChatPromptTemplate = {
  fromMessages: jest.fn().mockImplementation((messages: any[]) => ({
    format: jest.fn().mockResolvedValue('Mock formatted chat prompt'),
    formatPromptValue: jest.fn().mockResolvedValue({
      toChatMessages: () => messages.map((m) => new AIMessage('Mock message')),
    }),
  })),
  fromTemplate: jest.fn().mockImplementation((template: string) => ({
    format: jest.fn().mockResolvedValue(template.replace(/\{(\w+)\}/g, 'mock_$1')),
    formatPromptValue: jest.fn().mockResolvedValue({
      toChatMessages: () => [new AIMessage(template)],
    }),
  })),
};

/**
 * Mock RunnableSequence
 */
export const MockRunnableSequence = {
  from: jest.fn().mockImplementation((steps: any[]) => ({
    invoke: jest.fn().mockResolvedValue({
      text: 'Mock chain response',
      sourceDocuments: [
        new Document({
          pageContent: 'Mock chained document',
          metadata: { source: 'chain.txt' },
        }),
      ],
    }),
    batch: jest.fn().mockImplementation(async (inputs: any[]) =>
      inputs.map(() => ({
        text: 'Mock batch response',
        sourceDocuments: [],
      })),
    ),
  })),
};
