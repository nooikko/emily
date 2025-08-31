import type { BaseMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable } from '@nestjs/common';
import { AgentFactory } from '../agent.factory';
import { ModelProvider } from '../enum/model-provider.enum';
import { postgresCheckpointer } from '../memory/memory';

@Injectable()
export class ReactAgent {
  private readonly agent: ReturnType<typeof AgentFactory.createAgent>;
  private readonly checkpointer: BaseCheckpointSaver;

  constructor() {
    this.agent = AgentFactory.createAgent(ModelProvider.OPENAI, [], postgresCheckpointer);
    this.checkpointer = postgresCheckpointer;
  }

  async chat(input: { messages: BaseMessage[] }, chatOptions: { configurable: { thread_id: string } }): Promise<BaseMessage | null> {
    const response = await this.agent.invoke(input, chatOptions);
    const messages =
      response && Array.isArray((response as { messages: BaseMessage[] }).messages) ? (response as { messages: BaseMessage[] }).messages : null;
    return messages ? messages[messages.length - 1] : null;
  }

  async stream(input: { messages: BaseMessage[] }, chatOptions: Record<string, unknown>) {
    return this.agent.stream(input, chatOptions);
  }

  async getHistory(threadId: string): Promise<BaseMessage[]> {
    const history = await this.checkpointer.get({
      configurable: { thread_id: threadId },
    });
    return Array.isArray(history?.channel_values?.messages) ? history.channel_values.messages : [];
  }
  /**
   * Initializes the checkpointer for the agent.
   * This method sets up the PostgresSaver by creating necessary tables.
   * It should be called once before using the agent to ensure
   * that the database is ready for checkpointing.
   */
  async initCheckpointer(): Promise<void> {
    if (this.checkpointer && this.checkpointer instanceof PostgresSaver) {
      try {
        // Attempt to create tables synchronously
        await this.checkpointer.setup();
      } catch (err) {
        console.error('Error setting up PostgresSaver:', err);
      }
    }
  }
}
