import type { BaseMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable } from '@nestjs/common';
import { AgentFactory } from '../agent.factory';
import { ModelProvider } from '../enum/model-provider.enum';
import type { MemoryService } from '../memory/memory.service';
import type { EnhancedMemoryHealthStatus, HybridMemoryServiceInterface, MemoryEnhancedAgent, RetrievedMemory } from '../memory/types';

@Injectable()
export class ReactAgent implements MemoryEnhancedAgent {
  private readonly agent: ReturnType<typeof AgentFactory.createAgent>;
  private readonly memoryEnhancedAgent: ReturnType<typeof AgentFactory.createMemoryEnhancedAgent>;
  private readonly checkpointer: PostgresSaver;
  private readonly hybridMemory: HybridMemoryServiceInterface;
  private readonly useMemoryEnhanced: boolean;

  constructor(memoryService: MemoryService) {
    const provider = this.getModelProvider();

    // Create PostgreSQL checkpointer
    this.checkpointer = this.createPostgresCheckpointer();

    // Use injected memory service
    this.hybridMemory = memoryService;

    // Determine if we should use memory-enhanced mode
    this.useMemoryEnhanced = process.env.ENABLE_SEMANTIC_MEMORY !== 'false';

    if (this.useMemoryEnhanced) {
      this.memoryEnhancedAgent = AgentFactory.createMemoryEnhancedAgent(provider, [], this.hybridMemory, this.checkpointer);
    }

    // Keep fallback agent for compatibility
    this.agent = AgentFactory.createAgent(provider, [], this.checkpointer);
  }

  private createPostgresCheckpointer(): PostgresSaver {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5433';
    const username = process.env.DB_USERNAME || 'postgres';
    const password = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_NAME || 'agent_db';

    const connectionString = `postgresql://${username}:${password}@${host}:${port}/${dbName}${
      process.env.DB_SSLMODE ? `?sslmode=${process.env.DB_SSLMODE}` : ''
    }`;

    return PostgresSaver.fromConnString(connectionString);
  }

  private getModelProvider(): ModelProvider {
    // Check environment variable for provider preference
    const providerEnv = process.env.LLM_PROVIDER?.toUpperCase();

    // Map environment value to enum
    if (providerEnv === 'ANTHROPIC' && process.env.ANTHROPIC_API_KEY) {
      return ModelProvider.ANTHROPIC;
    }
    if (providerEnv === 'OPENAI' && process.env.OPENAI_API_KEY) {
      return ModelProvider.OPENAI;
    }

    // Default fallback logic based on available API keys
    if (process.env.ANTHROPIC_API_KEY) {
      return ModelProvider.ANTHROPIC;
    }
    if (process.env.OPENAI_API_KEY) {
      return ModelProvider.OPENAI;
    }

    // Final fallback to OpenAI for backwards compatibility
    return ModelProvider.OPENAI;
  }

  async chat(input: { messages: BaseMessage[] }, chatOptions: { configurable: { thread_id: string } }): Promise<BaseMessage | null> {
    const activeAgent = this.useMemoryEnhanced && this.memoryEnhancedAgent ? this.memoryEnhancedAgent : this.agent;
    const response = await activeAgent.invoke(input, chatOptions);
    const messages =
      response && Array.isArray((response as { messages: BaseMessage[] }).messages) ? (response as { messages: BaseMessage[] }).messages : null;
    return messages && messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async stream(input: { messages: BaseMessage[] }, chatOptions: Record<string, unknown>) {
    const activeAgent = this.useMemoryEnhanced && this.memoryEnhancedAgent ? this.memoryEnhancedAgent : this.agent;
    return activeAgent.stream(input, chatOptions);
  }

  async getHistory(threadId: string): Promise<BaseMessage[]> {
    try {
      const history = await this.checkpointer.get({
        configurable: { thread_id: threadId },
      });
      return Array.isArray(history?.channel_values?.messages) ? history.channel_values.messages : [];
    } catch {
      // Return empty array if history retrieval fails
      return [];
    }
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

  /**
   * Initializes the hybrid memory system (Qdrant + checkpointer)
   */
  async initMemorySystem(): Promise<void> {
    if (this.useMemoryEnhanced) {
      try {
        // Initialize memory if it has an init method
        if ('onModuleInit' in this.hybridMemory && typeof this.hybridMemory.onModuleInit === 'function') {
          await this.hybridMemory.onModuleInit();
        }
        console.log('Hybrid memory system initialized successfully');
      } catch (err) {
        console.error('Error initializing hybrid memory system:', err);
        // Fall back to non-memory mode
        (this as any).useMemoryEnhanced = false;
      }
    }

    // Always initialize checkpointer
    await this.initCheckpointer();
  }

  /**
   * Gets relevant memories for a given query and thread
   */
  async getRelevantMemories(query: string, threadId: string): Promise<RetrievedMemory[]> {
    if (!this.useMemoryEnhanced) {
      return [];
    }

    return await this.hybridMemory.retrieveRelevantMemories(query, threadId);
  }

  /**
   * Stores conversation memories manually if needed
   */
  async storeMemories(messages: BaseMessage[], threadId: string): Promise<void> {
    if (!this.useMemoryEnhanced) {
      return;
    }

    await this.hybridMemory.storeConversationMemory(messages, threadId);
  }

  /**
   * Clears all memories for a specific thread
   */
  async clearThreadMemories(threadId: string): Promise<void> {
    if (this.useMemoryEnhanced) {
      await this.hybridMemory.clearThreadMemories(threadId);
    }
  }

  /**
   * Gets the health status of all memory systems
   */
  async getMemoryHealthStatus(): Promise<EnhancedMemoryHealthStatus> {
    if (!this.useMemoryEnhanced) {
      return {
        memoryEnhanced: false,
        checkpointer: {
          available: true,
          lastChecked: Date.now(),
        },
        semantic: {
          available: false,
          lastChecked: Date.now(),
        },
      };
    }

    const status = await this.hybridMemory.getHealthStatus();
    return {
      memoryEnhanced: true,
      config: this.hybridMemory.getConfig(),
      ...status,
    };
  }

  /**
   * Gets the hybrid memory service for advanced usage
   */
  getHybridMemory(): HybridMemoryServiceInterface | null {
    return this.useMemoryEnhanced ? this.hybridMemory : null;
  }

  /**
   * Checks if memory enhancement is enabled
   */
  isMemoryEnhanced(): boolean {
    return this.useMemoryEnhanced;
  }
}
