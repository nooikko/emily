import type { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import type { DatabaseConfig } from '../../infisical/infisical-config.factory';
import type { ModelConfigurations } from '../../infisical/model-config.module';
import { LangSmithService } from '../../langsmith/services/langsmith.service';
import { AgentFactory } from '../agent.factory';
import { ModelProvider } from '../enum/model-provider.enum';
import type { HybridMemoryServiceInterface } from '../memory/types';
import type { Agent } from './supervisor.state';

/**
 * Agent role definitions for specialist agents
 */
export enum AgentRole {
  RESEARCHER = 'researcher',
  ANALYZER = 'analyzer', 
  WRITER = 'writer',
  REVIEWER = 'reviewer',
  COORDINATOR = 'coordinator',
}

/**
 * Configuration for a specialist agent
 */
export interface SpecialistAgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  tools: StructuredToolInterface[];
  capabilities: string[];
  priority: number;
}

/**
 * Factory for creating specialist agents with role-specific configurations
 */
@Injectable()
export class SpecialistAgentsFactory {
  private readonly agentConfigs: Map<AgentRole, SpecialistAgentConfig> = new Map();

  constructor(
    private readonly databaseConfig: DatabaseConfig,
    private readonly modelConfigs: ModelConfigurations,
    private readonly langsmithService?: LangSmithService,
  ) {
    this.initializeAgentConfigs();
  }

  /**
   * Initialize default specialist agent configurations
   */
  private initializeAgentConfigs(): void {
    // Research Specialist
    this.agentConfigs.set(AgentRole.RESEARCHER, {
      id: 'specialist-researcher',
      role: AgentRole.RESEARCHER,
      name: 'Research Specialist',
      description: 'Specializes in gathering information, conducting research, and fact-checking',
      systemPrompt: `You are a research specialist agent focused on gathering comprehensive information and conducting thorough research.

Your responsibilities:
- Conduct in-depth research on assigned topics
- Gather information from multiple sources
- Verify facts and cross-reference data
- Provide well-structured research summaries
- Identify knowledge gaps that need further investigation

When conducting research:
1. Break down complex topics into manageable components
2. Use available tools to gather information systematically
3. Evaluate source credibility and information quality
4. Synthesize findings into clear, actionable insights
5. Highlight areas requiring additional research

Always provide sources, maintain objectivity, and structure your findings logically.`,
      tools: [], // Will be populated with research-specific tools
      capabilities: ['research', 'fact-checking', 'information-gathering', 'source-verification'],
      priority: 1,
    });

    // Analysis Specialist
    this.agentConfigs.set(AgentRole.ANALYZER, {
      id: 'specialist-analyzer',
      role: AgentRole.ANALYZER,
      name: 'Analysis Specialist',
      description: 'Specializes in data analysis, pattern recognition, and insight generation',
      systemPrompt: `You are an analysis specialist agent focused on examining data, identifying patterns, and generating insights.

Your responsibilities:
- Analyze complex datasets and information
- Identify patterns, trends, and correlations
- Generate actionable insights from data
- Perform statistical analysis when appropriate
- Create data-driven recommendations

When analyzing information:
1. Apply systematic analytical approaches
2. Use statistical methods when relevant
3. Look for patterns and anomalies
4. Consider multiple perspectives and variables
5. Present findings with supporting evidence

Focus on accuracy, methodology, and clear presentation of analytical results.`,
      tools: [], // Will be populated with analysis-specific tools
      capabilities: ['data-analysis', 'pattern-recognition', 'statistical-analysis', 'insight-generation'],
      priority: 2,
    });

    // Writing Specialist
    this.agentConfigs.set(AgentRole.WRITER, {
      id: 'specialist-writer',
      role: AgentRole.WRITER,
      name: 'Writing Specialist',
      description: 'Specializes in content creation, documentation, and communication',
      systemPrompt: `You are a writing specialist agent focused on creating clear, engaging, and well-structured content.

Your responsibilities:
- Create high-quality written content
- Structure information logically and clearly
- Adapt writing style to target audience
- Edit and refine existing content
- Ensure consistency in tone and messaging

When writing content:
1. Understand the target audience and purpose
2. Structure content with clear introduction, body, and conclusion
3. Use appropriate tone and style for the context
4. Ensure accuracy and clarity of information
5. Edit and proofread for quality and consistency

Focus on clarity, engagement, and effective communication of key messages.`,
      tools: [], // Will be populated with writing-specific tools
      capabilities: ['content-creation', 'editing', 'documentation', 'communication'],
      priority: 3,
    });

    // Review Specialist
    this.agentConfigs.set(AgentRole.REVIEWER, {
      id: 'specialist-reviewer',
      role: AgentRole.REVIEWER,
      name: 'Review Specialist',
      description: 'Specializes in quality assurance, validation, and feedback',
      systemPrompt: `You are a review specialist agent focused on quality assurance and validation of work products.

Your responsibilities:
- Review work products for quality and accuracy
- Validate information and conclusions
- Provide constructive feedback and suggestions
- Ensure adherence to standards and requirements
- Identify areas for improvement

When reviewing work:
1. Evaluate completeness and accuracy
2. Check for logical consistency and coherence
3. Assess alignment with requirements and objectives
4. Provide specific, actionable feedback
5. Suggest concrete improvements where needed

Focus on constructive criticism, quality enhancement, and maintaining high standards.`,
      tools: [], // Will be populated with review-specific tools
      capabilities: ['quality-assurance', 'validation', 'feedback', 'standards-compliance'],
      priority: 4,
    });

    // Coordination Specialist
    this.agentConfigs.set(AgentRole.COORDINATOR, {
      id: 'specialist-coordinator',
      role: AgentRole.COORDINATOR,
      name: 'Coordination Specialist',
      description: 'Specializes in project coordination, communication, and workflow management',
      systemPrompt: `You are a coordination specialist agent focused on managing workflows and facilitating collaboration.

Your responsibilities:
- Coordinate activities between different agents and systems
- Manage workflow dependencies and timelines
- Facilitate communication and information sharing
- Monitor progress and identify bottlenecks
- Optimize resource allocation and task distribution

When coordinating work:
1. Assess task dependencies and priorities
2. Optimize workflow sequences and parallel execution
3. Monitor progress and identify potential issues
4. Facilitate information exchange between stakeholders
5. Adjust plans based on changing requirements

Focus on efficiency, communication, and successful project outcomes.`,
      tools: [], // Will be populated with coordination-specific tools
      capabilities: ['workflow-management', 'coordination', 'communication', 'resource-optimization'],
      priority: 5,
    });
  }

  /**
   * Create a specialist agent for a specific role
   */
  public createSpecialistAgent(
    role: AgentRole,
    modelProvider: ModelProvider,
    additionalTools: StructuredToolInterface[] = [],
    hybridMemory?: HybridMemoryServiceInterface,
  ) {
    const config = this.agentConfigs.get(role);
    if (!config) {
      throw new Error(`Unknown agent role: ${role}`);
    }

    // Combine role-specific tools with additional tools
    const allTools = [...config.tools, ...additionalTools];

    // Create the agent using the existing AgentFactory
    if (hybridMemory) {
      return AgentFactory.createMemoryEnhancedAgent(
        modelProvider,
        allTools,
        this.modelConfigs,
        hybridMemory,
      );
    }

    return AgentFactory.createAgent(
      modelProvider,
      allTools,
      this.modelConfigs,
    );
  }

  /**
   * Get configuration for a specific agent role
   */
  public getAgentConfig(role: AgentRole): SpecialistAgentConfig | undefined {
    return this.agentConfigs.get(role);
  }

  /**
   * Get all available agent roles
   */
  public getAvailableRoles(): AgentRole[] {
    return Array.from(this.agentConfigs.keys());
  }

  /**
   * Create agent metadata for supervisor integration
   */
  public createAgentMetadata(role: AgentRole): Agent {
    const config = this.agentConfigs.get(role);
    if (!config) {
      throw new Error(`Unknown agent role: ${role}`);
    }

    return {
      id: config.id,
      name: config.name,
      role: config.role,
      description: config.description,
      capabilities: config.capabilities,
      priority: config.priority,
      status: 'idle',
    };
  }

  /**
   * Create all default specialist agents
   */
  public createAllSpecialistAgents(
    modelProvider: ModelProvider,
    additionalTools: StructuredToolInterface[] = [],
    hybridMemory?: HybridMemoryServiceInterface,
  ) {
    const agents = new Map();
    
    for (const role of this.getAvailableRoles()) {
      const agent = this.createSpecialistAgent(role, modelProvider, additionalTools, hybridMemory);
      agents.set(role, agent);
    }

    return agents;
  }

  /**
   * Update agent configuration
   */
  public updateAgentConfig(role: AgentRole, updates: Partial<SpecialistAgentConfig>): void {
    const existing = this.agentConfigs.get(role);
    if (!existing) {
      throw new Error(`Unknown agent role: ${role}`);
    }

    this.agentConfigs.set(role, { ...existing, ...updates });
  }

  /**
   * Add tools to a specific agent role
   */
  public addToolsToRole(role: AgentRole, tools: StructuredToolInterface[]): void {
    const config = this.agentConfigs.get(role);
    if (!config) {
      throw new Error(`Unknown agent role: ${role}`);
    }

    config.tools = [...config.tools, ...tools];
    this.agentConfigs.set(role, config);
  }
}