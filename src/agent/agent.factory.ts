import { ChatAnthropic } from '@langchain/anthropic';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import * as dotenv from 'dotenv';
import type { AnthropicConfig, OpenAIConfig } from '../infisical/infisical-config.factory';
import { ReactAgentBuilder } from './agent.builder';
import { ModelProvider } from './enum/model-provider.enum';
import type { HybridMemoryServiceInterface } from './memory/types';

dotenv.config();

export interface ModelProviderConfigs {
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
}

export class AgentFactory {
  public static createAgent(
    modelProvider: ModelProvider,
    tools: StructuredToolInterface[],
    configs: ModelProviderConfigs,
    checkpointer?: PostgresSaver,
  ) {
    if (!modelProvider) {
      throw new Error('Model provider is required');
    }

    switch (modelProvider) {
      // OpenAI
      case ModelProvider.OPENAI: {
        return new ReactAgentBuilder(
          tools,
          new ChatOpenAI({
            model: configs.openai.model,
            apiKey: configs.openai.apiKey,
            // Add any additional OpenAI configuration here
          }),
        ).build(checkpointer);
      }

      // Anthropic
      case ModelProvider.ANTHROPIC: {
        return new ReactAgentBuilder(
          tools,
          new ChatAnthropic({
            model: configs.anthropic.model,
            apiKey: configs.anthropic.apiKey,
            // Add any additional Anthropic configuration here
          }),
        ).build(checkpointer);
      }

      /// Add other model providers here as needed
    }
    throw new Error(`Unsupported model provider: ${modelProvider}`);
  }

  /**
   * Creates a memory-enhanced agent with hybrid memory capabilities
   */
  public static createMemoryEnhancedAgent(
    modelProvider: ModelProvider,
    tools: StructuredToolInterface[],
    configs: ModelProviderConfigs,
    hybridMemory: HybridMemoryServiceInterface,
    checkpointer?: PostgresSaver,
  ) {
    if (!modelProvider) {
      throw new Error('Model provider is required');
    }
    if (!hybridMemory) {
      throw new Error('Hybrid memory service is required');
    }

    switch (modelProvider) {
      // OpenAI
      case ModelProvider.OPENAI: {
        return new ReactAgentBuilder(
          tools,
          new ChatOpenAI({
            model: configs.openai.model,
            apiKey: configs.openai.apiKey,
            // Add any additional OpenAI configuration here
          }),
          hybridMemory,
        ).build(checkpointer);
      }

      // Anthropic
      case ModelProvider.ANTHROPIC: {
        return new ReactAgentBuilder(
          tools,
          new ChatAnthropic({
            model: configs.anthropic.model,
            apiKey: configs.anthropic.apiKey,
            // Add any additional Anthropic configuration here
          }),
          hybridMemory,
        ).build(checkpointer);
      }

      /// Add other model providers here as needed
    }
    throw new Error(`Unsupported model provider: ${modelProvider}`);
  }
}
