import { BaseMessage } from '@langchain/core/messages';
import { StateGraphArgs } from '@langchain/langgraph';

/**
 * Represents an individual agent in the multi-agent system
 */
export interface Agent {
  id: string;
  name: string;
  role?: string;
  type?: 'researcher' | 'analyzer' | 'writer' | 'reviewer' | 'custom';
  description: string;
  capabilities?: string[];
  tools?: string[];
  priority?: number;
  status?: 'idle' | 'busy' | 'error';
  maxIterations?: number;
  temperature?: number;
}

/**
 * Task result type with proper discriminated union
 */
export type TaskResult =
  | { type: 'success'; data: unknown; summary?: string }
  | { type: 'error'; error: string; code?: string }
  | { type: 'partial'; progress: number; data?: unknown; message?: string };

/**
 * Represents a task assignment to an agent
 */
export interface AgentTask {
  taskId: string;
  agentId: string;
  description: string;
  context?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependencies?: string[];
  result?: TaskResult;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Agent output type for structured results
 */
export type AgentOutput =
  | { type: 'text'; content: string }
  | { type: 'structured'; data: Record<string, unknown> }
  | { type: 'binary'; mimeType: string; data: string }
  | { type: 'error'; message: string; code?: string };

/**
 * Represents the result of an agent's work
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
 * The state schema for the supervisor graph
 */
export interface SupervisorState {
  // Core message history
  messages: BaseMessage[];

  // Current objective and context
  objective: string;
  context: string;

  // Agent management
  availableAgents: Agent[];
  activeAgents: Set<string>;
  agentTasks: AgentTask[];
  agentResults: AgentResult[];

  // Workflow control
  currentPhase: 'planning' | 'execution' | 'parallel_execution' | 'synchronization' | 'consensus' | 'review' | 'complete';
  nextAgent?: string;
  routingDecision?: string;
  maxParallelAgents?: number;
  agentTimeout?: number;

  // Consensus and coordination
  consensusRequired: boolean;
  consensusThreshold: number;
  consensusResults?: Map<string, AgentOutput>;

  // Error handling and recovery
  errors: Array<{ agentId: string; error: string; timestamp: Date }>;
  retryCount: number;
  maxRetries: number;

  // Performance metrics
  startTime: Date;
  endTime?: Date;
  checkpointCount: number;

  // Metadata
  sessionId: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

/**
 * State graph configuration for the supervisor
 */
export const supervisorStateConfig: StateGraphArgs<SupervisorState>['channels'] = {
  messages: {
    value: (left?: BaseMessage[], right?: BaseMessage[]) => {
      if (!left) {
        return right || [];
      }
      if (!right) {
        return left;
      }
      return [...left, ...right];
    },
    default: () => [],
  },

  objective: {
    value: (left?: string, right?: string) => right || left || '',
    default: () => '',
  },

  context: {
    value: (left?: string, right?: string) => right || left || '',
    default: () => '',
  },

  availableAgents: {
    value: (left?: Agent[], right?: Agent[]) => right || left || [],
    default: () => [],
  },

  activeAgents: {
    value: (left?: Set<string>, right?: Set<string>) => right || left || new Set(),
    default: () => new Set(),
  },

  agentTasks: {
    value: (left?: AgentTask[], right?: AgentTask[]) => {
      if (!left) {
        return right || [];
      }
      if (!right) {
        return left;
      }
      return [...left, ...right];
    },
    default: () => [],
  },

  agentResults: {
    value: (left?: AgentResult[], right?: AgentResult[]) => {
      if (!left) {
        return right || [];
      }
      if (!right) {
        return left;
      }
      return [...left, ...right];
    },
    default: () => [],
  },

  currentPhase: {
    value: (left?: SupervisorState['currentPhase'], right?: SupervisorState['currentPhase']) =>
      right || left || ('planning' as SupervisorState['currentPhase']),
    default: () => 'planning' as SupervisorState['currentPhase'],
  },

  nextAgent: {
    value: (left?: string, right?: string) => right || left,
    default: () => undefined,
  },

  routingDecision: {
    value: (left?: string, right?: string) => right || left,
    default: () => undefined,
  },

  consensusRequired: {
    value: (left?: boolean, right?: boolean) => right ?? left ?? false,
    default: () => false,
  },

  consensusThreshold: {
    value: (left?: number, right?: number) => right ?? left ?? 0.7,
    default: () => 0.7,
  },

  consensusResults: {
    value: (left?: Map<string, AgentOutput>, right?: Map<string, AgentOutput>) => right || left || new Map(),
    default: () => new Map(),
  },

  errors: {
    value: (
      left?: Array<{ agentId: string; error: string; timestamp: Date }>,
      right?: Array<{ agentId: string; error: string; timestamp: Date }>,
    ) => {
      if (!left) {
        return right || [];
      }
      if (!right) {
        return left;
      }
      return [...left, ...right];
    },
    default: () => [],
  },

  retryCount: {
    value: (left?: number, right?: number) => right ?? left ?? 0,
    default: () => 0,
  },

  maxRetries: {
    value: (left?: number, right?: number) => right ?? left ?? 3,
    default: () => 3,
  },

  maxParallelAgents: {
    value: (left?: number, right?: number) => right ?? left ?? 3,
    default: () => 3,
  },

  agentTimeout: {
    value: (left?: number, right?: number) => right ?? left ?? 30000,
    default: () => 30000,
  },

  startTime: {
    value: (left?: Date, right?: Date) => right || left || new Date(),
    default: () => new Date(),
  },

  endTime: {
    value: (left?: Date, right?: Date) => right || left,
    default: () => undefined,
  },

  checkpointCount: {
    value: (left?: number, right?: number) => right ?? left ?? 0,
    default: () => 0,
  },

  sessionId: {
    value: (left?: string, right?: string) => right || left || '',
    default: () => '',
  },

  userId: {
    value: (left?: string, right?: string) => right || left,
    default: () => undefined,
  },

  metadata: {
    value: (left?: Record<string, unknown>, right?: Record<string, unknown>) => ({
      ...(left || {}),
      ...(right || {}),
    }),
    default: () => ({}),
  },
};

/**
 * Type guard to check if a phase is valid
 */
export function isValidPhase(phase: string): phase is SupervisorState['currentPhase'] {
  return ['planning', 'execution', 'parallel_execution', 'synchronization', 'consensus', 'review', 'complete'].includes(phase);
}

/**
 * Helper to create initial supervisor state
 */
export function createInitialSupervisorState(
  objective: string,
  availableAgents: Agent[],
  sessionId: string,
  userId?: string,
): Partial<SupervisorState> {
  return {
    objective,
    availableAgents,
    sessionId,
    userId,
    currentPhase: 'planning',
    messages: [],
    activeAgents: new Set(),
    agentTasks: [],
    agentResults: [],
    errors: [],
    retryCount: 0,
    maxRetries: 3,
    consensusRequired: false,
    consensusThreshold: 0.7,
    checkpointCount: 0,
    startTime: new Date(),
    metadata: {},
  };
}
