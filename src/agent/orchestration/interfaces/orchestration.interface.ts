import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';

/**
 * Base agent output interface
 */
export interface AgentOutput {
  type: 'text' | 'structured' | 'error' | 'binary';
  content?: string;
  data?: Record<string, unknown>;
  message?: string;
  code?: string;
  mimeType?: string;
}

/**
 * Agent result interface
 */
export interface AgentResult {
  agentId: string;
  taskId: string;
  output: AgentOutput;
  confidence?: number;
  reasoning?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent task definition
 */
export interface AgentTask {
  taskId: string;
  agentId: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  context?: string;
  dependencies?: string[];
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Agent definition
 */
export interface Agent {
  id: string;
  name: string;
  role?: string;
  type?: string;
  status: 'idle' | 'busy' | 'error';
  priority?: number;
  tools?: StructuredToolInterface[];
  capabilities?: string[];
}

/**
 * Supervisor state for orchestration
 */
export interface SupervisorState {
  objective: string;
  currentPhase: 'planning' | 'execution' | 'parallel_execution' | 'synchronization' | 'consensus' | 'review' | 'complete';
  messages: BaseMessage[];
  agentResults: AgentResult[];
  agentTasks: AgentTask[];
  availableAgents: Agent[];
  nextAgent?: string;
  routingDecision?: string;
  errors: Array<{
    agentId: string;
    error: string;
    timestamp: Date;
  }>;
  retryCount: number;
  maxRetries: number;
  consensusRequired: boolean;
  consensusThreshold: number;
  consensusResults?: Map<string, unknown>;
  sessionId?: string;
  userId?: string;
  maxParallelAgents?: number;
  agentTimeout?: number;
}

/**
 * Conflict detection interface
 */
export interface ConflictDetection {
  type: 'contradiction' | 'inconsistency' | 'divergence';
  agents: string[];
  details: string;
  severity?: 'low' | 'medium' | 'high';
  timestamp?: Date;
}

/**
 * Conflict resolution interface
 */
export interface ConflictResolution {
  conflict: ConflictDetection;
  resolution: string;
  method: 'priority-based' | 'averaging' | 'rule-based' | 'escalation' | 'voting';
  resolvedBy?: string;
  timestamp?: Date;
  confidence?: number;
}

/**
 * Voting result interface
 */
export interface VotingResult {
  winner: AgentOutput | null;
  votes: Map<string, number>;
  method: 'majority' | 'weighted' | 'ranked';
  totalVotes: number;
  winnerScore?: number;
}

/**
 * Consensus building results
 */
export interface ConsensusResults {
  results: Map<
    string,
    AgentOutput | number | VotingResult | ConflictResolution[] | ConflictDetection[] | AgentResult[] | Record<string, AgentResult[]> | string | null
  >;
  agreement: number;
  method: string;
  timestamp: Date;
  participatingAgents: string[];
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  sessionId: string;
  taskId: string;
  agentId: string;
  startTime: Date;
  timeout?: number;
  metadata?: Record<string, unknown>;
  parentContext?: string;
}

/**
 * Task orchestration strategy
 */
export type OrchestrationStrategy = 'sequential' | 'parallel' | 'adaptive' | 'priority-based';

/**
 * Coordination protocol types
 */
export interface CoordinationProtocol {
  type: 'centralized' | 'decentralized' | 'hybrid';
  resourceAllocation: Map<string, string[]>;
  taskPrioritization: AgentTask[];
  coordinationStrategy: string;
  syncFrequency?: number;
}

/**
 * Performance metrics for orchestration
 */
export interface OrchestrationMetrics {
  totalExecutionTime: number;
  agentUtilization: Map<string, number>;
  taskCompletionRate: number;
  errorRate: number;
  consensusTime?: number;
  parallelizationEfficiency?: number;
}

/**
 * Agent handoff context
 */
export interface AgentHandoffContext {
  fromAgent?: string;
  toAgent: string;
  handoffReason: string;
  contextData: Record<string, unknown>;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
}
