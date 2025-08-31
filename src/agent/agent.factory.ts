import type { StructuredToolInterface } from '@langchain/core/tools';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import * as dotenv from 'dotenv';
import { ReactAgentBuilder } from './agent.builder';
import { ModelProvider } from './enum/model-provider.enum';

dotenv.config();

export class AgentFactory {
  public static createAgent(modelProvider: ModelProvider, tools: StructuredToolInterface[], checkpointer?: PostgresSaver) {
    if (!modelProvider) {
      throw new Error('Model provider is required');
    }

    switch (modelProvider) {
      // OpenAI
      case ModelProvider.OPENAI: {
        return new ReactAgentBuilder(
          tools,
          new ChatOpenAI({
            model: process.env.OPENAI_MODEL,
            // Add any additional OpenAI configuration here
          }),
        ).build(checkpointer);
      }

      /// Add other model providers here as needed
    }
    throw new Error(`Unsupported model provider: ${modelProvider}`);
  }
}
