import { Injectable, Logger } from '@nestjs/common';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Runnable } from '@langchain/core/runnables';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { SupervisorGraph } from './supervisor.graph';
import { 
  SupervisorState, 
  Agent, 
  AgentTask, 
  AgentResult,
  createInitialSupervisorState 
} from './supervisor.state';

/**
 * Configuration for supervisor execution
 */
export interface SupervisorConfig {
  sessionId: string;
  userId?: string;
  checkpointEnabled?: boolean;
  maxRecursion?: number;
  consensusRequired?: boolean;
  consensusThreshold?: number;
  timeout?: number;
}

/**
 * Result of supervisor execution
 */
export interface SupervisorResult {
  success: boolean;
  state: SupervisorState;
  messages: BaseMessage[];
  results: AgentResult[];
  errors?: string[];
  executionTime: number;
}

/**
 * Service for managing multi-agent orchestration
 */
@Injectable()
export class SupervisorService {
  private readonly logger = new Logger(SupervisorService.name);
  private compiledGraph: Runnable;
  private checkpointer?: PostgresSaver;
  private defaultAgents: Agent[] = [];
  
  constructor(
    private readonly supervisorGraph: SupervisorGraph,
  ) {
    this.compiledGraph = this.supervisorGraph.compile();
    this.initializeDefaultAgents();
  }
  
  /**
   * Initialize checkpointing with PostgreSQL
   */
  public async initializeCheckpointing(databaseUrl: string): Promise<void> {
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
      });
      
      this.checkpointer = new PostgresSaver(pool);
      await this.checkpointer.setup();
      
      // Recompile graph with checkpointer
      const graph = this.supervisorGraph.getGraph();
      this.compiledGraph = graph.compile({
        checkpointer: this.checkpointer,
      });
      
      this.logger.log('Checkpointing initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize checkpointing', error);
      throw error;
    }
  }
  
  /**
   * Initialize default specialist agents
   */
  private initializeDefaultAgents(): void {
    this.defaultAgents = [
      {
        id: 'researcher',
        name: 'Research Specialist',
        type: 'researcher',
        description: 'Specializes in gathering and synthesizing information from various sources',
        tools: ['web_search', 'document_retrieval', 'fact_checking'],
        temperature: 0.3,
        maxIterations: 5,
      },
      {
        id: 'analyzer',
        name: 'Analysis Specialist',
        type: 'analyzer',
        description: 'Performs deep analysis, pattern recognition, and data interpretation',
        tools: ['data_analysis', 'statistical_tools', 'comparison'],
        temperature: 0.2,
        maxIterations: 10,
      },
      {
        id: 'writer',
        name: 'Content Writer',
        type: 'writer',
        description: 'Creates well-structured, coherent content based on research and analysis',
        tools: ['text_generation', 'formatting', 'citation'],
        temperature: 0.7,
        maxIterations: 3,
      },
      {
        id: 'reviewer',
        name: 'Quality Reviewer',
        type: 'reviewer',
        description: 'Reviews and validates results for accuracy, completeness, and quality',
        tools: ['validation', 'fact_checking', 'quality_metrics'],
        temperature: 0.1,
        maxIterations: 2,
      },
      {
        id: 'custom',
        name: 'Custom Specialist',
        type: 'custom',
        description: 'Adaptable agent for specialized tasks',
        tools: [],
        temperature: 0.5,
        maxIterations: 5,
      },
    ];
  }
  
  /**
   * Execute supervisor orchestration
   */
  public async execute(
    objective: string,
    config: SupervisorConfig,
    customAgents?: Agent[],
  ): Promise<SupervisorResult> {
    const startTime = Date.now();
    
    try {
      // Prepare agents
      const agents = customAgents && customAgents.length > 0 
        ? customAgents 
        : this.defaultAgents;
      
      // Create initial state
      const initialState = createInitialSupervisorState(
        objective,
        agents,
        config.sessionId,
        config.userId,
      ) as SupervisorState;
      
      // Apply configuration
      if (config.consensusRequired !== undefined) {
        initialState.consensusRequired = config.consensusRequired;
      }
      if (config.consensusThreshold !== undefined) {
        initialState.consensusThreshold = config.consensusThreshold;
      }
      
      // Add initial human message
      initialState.messages = [
        new HumanMessage({
          content: objective,
          additional_kwargs: {
            sessionId: config.sessionId,
            userId: config.userId,
          },
        }),
      ];
      
      // Execute graph
      const invokeConfig: any = {
        recursionLimit: config.maxRecursion || 50,
        configurable: {
          thread_id: config.sessionId,
        },
      };
      
      if (config.timeout) {
        invokeConfig.timeout = config.timeout;
      }
      
      this.logger.log(`Starting supervisor execution for session ${config.sessionId}`);
      
      const finalState = await this.compiledGraph.invoke(
        initialState,
        invokeConfig,
      ) as SupervisorState;
      
      const executionTime = Date.now() - startTime;
      
      this.logger.log(`Supervisor execution completed in ${executionTime}ms`);
      
      return {
        success: finalState.currentPhase === 'complete',
        state: finalState,
        messages: finalState.messages,
        results: finalState.agentResults,
        errors: finalState.errors.map(e => e.error),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error('Supervisor execution failed', error);
      
      return {
        success: false,
        state: {} as SupervisorState,
        messages: [],
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        executionTime,
      };
    }
  }
  
  /**
   * Resume execution from a checkpoint
   */
  public async resume(
    sessionId: string,
    additionalInput?: Partial<SupervisorState>,
  ): Promise<SupervisorResult> {
    if (!this.checkpointer) {
      throw new Error('Checkpointing not initialized');
    }
    
    const startTime = Date.now();
    
    try {
      this.logger.log(`Resuming supervisor execution for session ${sessionId}`);
      
      // Get checkpoint
      const checkpoint = await this.checkpointer.get({
        configurable: { thread_id: sessionId },
      });
      
      if (!checkpoint) {
        throw new Error(`No checkpoint found for session ${sessionId}`);
      }
      
      // Resume with additional input if provided
      const resumeState = additionalInput 
        ? { ...checkpoint.channel_values, ...additionalInput }
        : checkpoint.channel_values;
      
      const finalState = await this.compiledGraph.invoke(
        resumeState,
        {
          recursionLimit: 50,
          configurable: {
            thread_id: sessionId,
          },
        },
      ) as SupervisorState;
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: finalState.currentPhase === 'complete',
        state: finalState,
        messages: finalState.messages,
        results: finalState.agentResults,
        errors: finalState.errors.map(e => e.error),
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error('Failed to resume supervisor execution', error);
      
      return {
        success: false,
        state: {} as SupervisorState,
        messages: [],
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        executionTime,
      };
    }
  }
  
  /**
   * Get execution history for a session
   */
  public async getHistory(sessionId: string): Promise<any[]> {
    if (!this.checkpointer) {
      throw new Error('Checkpointing not initialized');
    }
    
    const history: any[] = [];
    const checkpoints = this.checkpointer.list({
      configurable: { thread_id: sessionId },
    });
    
    for await (const checkpoint of checkpoints) {
      history.push(checkpoint);
    }
    
    return history;
  }
  
  /**
   * Get available agents
   */
  public getAvailableAgents(): Agent[] {
    return [...this.defaultAgents];
  }
  
  /**
   * Add custom agent
   */
  public addCustomAgent(agent: Agent): void {
    const existingIndex = this.defaultAgents.findIndex(a => a.id === agent.id);
    
    if (existingIndex >= 0) {
      this.defaultAgents[existingIndex] = agent;
      this.logger.log(`Updated agent ${agent.id}`);
    } else {
      this.defaultAgents.push(agent);
      this.logger.log(`Added new agent ${agent.id}`);
    }
  }
  
  /**
   * Remove agent
   */
  public removeAgent(agentId: string): boolean {
    const index = this.defaultAgents.findIndex(a => a.id === agentId);
    
    if (index >= 0) {
      this.defaultAgents.splice(index, 1);
      this.logger.log(`Removed agent ${agentId}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get supervisor graph structure
   */
  public getGraphStructure(): string {
    return this.supervisorGraph.getGraphStructure();
  }
  
  /**
   * Validate objective can be handled
   */
  public canHandleObjective(objective: string): {
    canHandle: boolean;
    requiredAgents: string[];
    confidence: number;
  } {
    const objectiveLower = objective.toLowerCase();
    const requiredAgents: string[] = [];
    
    // Determine required agents based on objective
    if (objectiveLower.includes('research') || objectiveLower.includes('find') || objectiveLower.includes('search')) {
      requiredAgents.push('researcher');
    }
    
    if (objectiveLower.includes('analyze') || objectiveLower.includes('compare') || objectiveLower.includes('evaluate')) {
      requiredAgents.push('analyzer');
    }
    
    if (objectiveLower.includes('write') || objectiveLower.includes('create') || objectiveLower.includes('generate')) {
      requiredAgents.push('writer');
    }
    
    if (objectiveLower.includes('review') || objectiveLower.includes('validate') || objectiveLower.includes('check')) {
      requiredAgents.push('reviewer');
    }
    
    // Always include reviewer for quality assurance
    if (!requiredAgents.includes('reviewer')) {
      requiredAgents.push('reviewer');
    }
    
    // Check if we have the required agents
    const availableAgentIds = this.defaultAgents.map(a => a.id);
    const canHandle = requiredAgents.every(id => availableAgentIds.includes(id));
    
    // Calculate confidence based on agent coverage
    const confidence = requiredAgents.length > 0 
      ? requiredAgents.filter(id => availableAgentIds.includes(id)).length / requiredAgents.length
      : 0.5;
    
    return {
      canHandle,
      requiredAgents,
      confidence,
    };
  }
  
  /**
   * Get task status for a session
   */
  public async getTaskStatus(sessionId: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
  }> {
    if (!this.checkpointer) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        failed: 0,
      };
    }
    
    try {
      const checkpoint = await this.checkpointer.get({
        configurable: { thread_id: sessionId },
      });
      
      if (!checkpoint || !checkpoint.channel_values) {
        return {
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          failed: 0,
        };
      }
      
      const state = checkpoint.channel_values as SupervisorState;
      const tasks = state.agentTasks || [];
      
      return {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        failed: tasks.filter(t => t.status === 'failed').length,
      };
    } catch (error) {
      this.logger.error(`Failed to get task status for session ${sessionId}`, error);
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        failed: 0,
      };
    }
  }
}