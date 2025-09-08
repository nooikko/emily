import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DatabaseConfig } from '../../infisical/infisical-config.factory';
import type { ModelConfigurations } from '../../infisical/model-config.module';
import { LangSmithService } from '../../langsmith/services/langsmith.service';
import { ModelProvider } from '../enum/model-provider.enum';
import { MemoryService } from '../memory/memory.service';
import type { HybridMemoryServiceInterface } from '../memory/types';
import { AgentRole, SpecialistAgentsFactory } from './specialist-agents.factory';
import type { Agent, AgentResult, AgentTask } from './supervisor.state';

/**
 * Service for managing specialist agents within the multi-agent orchestration system
 */
@Injectable()
export class SpecialistAgentsService implements OnModuleInit {
  private readonly specialistFactory: SpecialistAgentsFactory;
  private readonly agentInstances: Map<AgentRole, any> = new Map();
  private readonly modelProvider: ModelProvider;
  private readonly hybridMemory: HybridMemoryServiceInterface;

  constructor(
    private readonly databaseConfig: DatabaseConfig,
    private readonly modelConfigs: ModelConfigurations,
    private readonly memoryService: MemoryService,
    private readonly langsmithService?: LangSmithService,
  ) {
    this.specialistFactory = new SpecialistAgentsFactory(databaseConfig, modelConfigs, langsmithService);

    this.modelProvider = this.determineModelProvider();
    this.hybridMemory = this.memoryService;
  }

  async onModuleInit(): Promise<void> {
    await this.initializeSpecialistAgents();
  }

  /**
   * Initialize all specialist agents
   */
  private async initializeSpecialistAgents(): Promise<void> {
    try {
      // Get additional tools that might be shared across agents
      const sharedTools = this.getSharedTools();

      // Create all specialist agent instances
      const agents = this.specialistFactory.createAllSpecialistAgents(this.modelProvider, sharedTools, this.hybridMemory);

      // Store the instances for later use
      for (const [role, agent] of agents.entries()) {
        this.agentInstances.set(role, agent);
      }

      // Initialize checkpointers if needed
      await this.initializeCheckpointers();
    } catch (error) {
      console.warn('Failed to initialize some specialist agents:', error);
    }
  }

  /**
   * Get shared tools available to all agents
   */
  private getSharedTools(): StructuredToolInterface[] {
    // In a real implementation, this would return actual tool instances
    // For now, returning empty array - tools would be injected based on requirements
    return [];
  }

  /**
   * Initialize PostgreSQL checkpointers for all agents
   */
  private async initializeCheckpointers(): Promise<void> {
    for (const [role, agent] of this.agentInstances.entries()) {
      try {
        if (agent && typeof agent.setup === 'function') {
          await agent.setup();
        }
      } catch (error) {
        console.warn(`Failed to initialize checkpointer for ${role}:`, error);
      }
    }
  }

  /**
   * Determine the appropriate model provider based on configuration
   */
  private determineModelProvider(): ModelProvider {
    const providerEnv = process.env.LLM_PROVIDER?.toUpperCase();

    if (providerEnv === 'ANTHROPIC' && this.modelConfigs.anthropic.apiKey) {
      return ModelProvider.ANTHROPIC;
    }
    if (providerEnv === 'OPENAI' && this.modelConfigs.openai.apiKey) {
      return ModelProvider.OPENAI;
    }

    // Default fallback logic
    if (this.modelConfigs.anthropic.apiKey) {
      return ModelProvider.ANTHROPIC;
    }
    if (this.modelConfigs.openai.apiKey) {
      return ModelProvider.OPENAI;
    }

    return ModelProvider.OPENAI; // Final fallback
  }

  /**
   * Execute a task using a specific specialist agent
   */
  async executeAgentTask(agentId: string, task: AgentTask, messages: BaseMessage[], threadId: string): Promise<AgentResult> {
    // Map agent ID to role
    const role = this.getAgentRoleById(agentId);
    if (!role) {
      throw new Error(`Unknown agent ID: ${agentId}`);
    }

    const agent = this.agentInstances.get(role);
    if (!agent) {
      throw new Error(`Agent not initialized for role: ${role}`);
    }

    try {
      // Execute the task with the specialist agent
      const startTime = Date.now();

      // Create the input for the agent
      const input = {
        messages: [
          ...messages,
          {
            role: 'human',
            content: `Task: ${task.description}\n\nContext: ${task.context || ''}`,
          },
        ],
      };

      const config = {
        configurable: { thread_id: threadId },
      };

      // Invoke the agent
      const response = await agent.invoke(input, config);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract the result from the response
      const output = this.extractAgentOutput(response);

      return {
        agentId,
        taskId: task.taskId,
        output,
        confidence: this.calculateConfidence(output, duration),
        metadata: {
          executionTime: duration,
          modelProvider: this.modelProvider,
          agentRole: role,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Return error result
      return {
        agentId,
        taskId: task.taskId,
        output: `Error executing task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTime: 0,
          modelProvider: this.modelProvider,
          agentRole: role,
          timestamp: new Date().toISOString(),
          error: true,
        },
      };
    }
  }

  /**
   * Get agent role by agent ID
   */
  private getAgentRoleById(agentId: string): AgentRole | undefined {
    for (const role of this.specialistFactory.getAvailableRoles()) {
      const config = this.specialistFactory.getAgentConfig(role);
      if (config?.id === agentId) {
        return role;
      }
    }
    return undefined;
  }

  /**
   * Extract meaningful output from agent response
   */
  private extractAgentOutput(response: any): string {
    if (typeof response === 'string') {
      return response;
    }

    if (response?.messages && Array.isArray(response.messages)) {
      const lastMessage = response.messages[response.messages.length - 1];
      if (typeof lastMessage?.content === 'string') {
        return lastMessage.content;
      }
    }

    if (response?.content) {
      return response.content;
    }

    return JSON.stringify(response);
  }

  /**
   * Calculate confidence score based on output quality and execution time
   */
  private calculateConfidence(output: string, duration: number): number {
    // Simple heuristic - in a real implementation this would be more sophisticated
    let confidence = 0.8; // Base confidence

    // Adjust based on output length (too short or too long might indicate issues)
    if (output.length < 10) {
      confidence -= 0.3;
    } else if (output.length > 5000) {
      confidence -= 0.1;
    }

    // Adjust based on execution time (too fast might indicate errors)
    if (duration < 100) {
      confidence -= 0.2;
    }

    // Check for error indicators
    if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
      confidence -= 0.4;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get all available specialist agents as Agent metadata
   */
  getAvailableAgents(): Agent[] {
    return this.specialistFactory.getAvailableRoles().map((role) => this.specialistFactory.createAgentMetadata(role));
  }

  /**
   * Get a specific agent by role
   */
  getAgentByRole(role: AgentRole): any {
    return this.agentInstances.get(role);
  }

  /**
   * Check if an agent is available for a specific role
   */
  isAgentAvailable(role: AgentRole): boolean {
    return this.agentInstances.has(role) && this.agentInstances.get(role) !== undefined;
  }

  /**
   * Add tools to a specific agent role
   */
  addToolsToAgent(role: AgentRole, tools: StructuredToolInterface[]): void {
    this.specialistFactory.addToolsToRole(role, tools);

    // Recreate the agent instance with new tools
    const sharedTools = this.getSharedTools();
    const agent = this.specialistFactory.createSpecialistAgent(role, this.modelProvider, [...sharedTools, ...tools], this.hybridMemory);

    this.agentInstances.set(role, agent);
  }

  /**
   * Get agent configuration by role
   */
  getAgentConfig(role: AgentRole) {
    return this.specialistFactory.getAgentConfig(role);
  }

  /**
   * Update agent configuration
   */
  updateAgentConfig(role: AgentRole, updates: any): void {
    this.specialistFactory.updateAgentConfig(role, updates);

    // Recreate the agent instance with updated config
    const sharedTools = this.getSharedTools();
    const agent = this.specialistFactory.createSpecialistAgent(role, this.modelProvider, sharedTools, this.hybridMemory);

    this.agentInstances.set(role, agent);
  }

  /**
   * Get health status of all specialist agents
   */
  async getHealthStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {};

    for (const [role, agent] of this.agentInstances.entries()) {
      status[role] = {
        initialized: !!agent,
        available: this.isAgentAvailable(role),
        config: this.getAgentConfig(role),
      };
    }

    return {
      specialistAgents: status,
      totalAgents: this.agentInstances.size,
      availableRoles: this.specialistFactory.getAvailableRoles(),
      modelProvider: this.modelProvider,
    };
  }
}
