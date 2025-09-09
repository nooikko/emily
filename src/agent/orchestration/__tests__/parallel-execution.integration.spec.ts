import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseConfig } from '../../../infisical/infisical-config.factory';
import { ModelConfigurations } from '../../../infisical/model-config.module';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { MemoryService } from '../../memory/memory.service';
import { AgentRole, SpecialistAgentsFactory } from '../specialist-agents.factory';
import { SpecialistAgentsService } from '../specialist-agents.service';
import { SupervisorGraph } from '../supervisor.graph';
import { AgentOutput, AgentResult, AgentTask, SupervisorState } from '../supervisor.state';

// Type helper for accessing private methods in tests
type TestableSupervisorGraph = SupervisorGraph & {
  identifyParallelizableTasks: (pendingTasks: AgentTask[], state: SupervisorState) => AgentTask[];
  executeParallelAgents: (state: SupervisorState) => Promise<AgentResult[]>;
  synchronizeParallelResults: (state: SupervisorState) => Promise<{
    synchronizedCount: number;
    conflicts: Array<{ type: string; agents: string[]; details: string }>;
  }>;
  detectConflict: (result1: AgentResult, result2: AgentResult) => boolean;
  resolveConflict: (
    result1: AgentResult,
    result2: AgentResult,
  ) => {
    winner: string;
    reason: string;
  };
  routeFromSupervisor: (state: SupervisorState) => Promise<string>;
  routeFromParallelExecution: (state: SupervisorState) => string;
  routeFromSynchronization: (state: SupervisorState) => string;
};

// Helper function to create text AgentOutput
function textOutput(content: string): AgentOutput {
  return { type: 'text', content };
}

describe('Parallel Agent Execution Integration', () => {
  let supervisorGraph: SupervisorGraph;
  let specialistAgentsService: SpecialistAgentsService;
  let module: TestingModule;

  // Mock configurations
  const mockDatabaseConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    username: 'test',
    password: 'test',
    database: 'test_db',
  };

  const mockModelConfigs: ModelConfigurations = {
    openai: {
      apiKey: 'test-openai-key',
      model: 'gpt-4',
    },
    anthropic: {
      apiKey: 'test-anthropic-key',
      model: 'claude-3-sonnet-20240229',
    },
  };

  const createMockState = (overrides: Partial<SupervisorState> = {}): SupervisorState => {
    return {
      messages: [],
      objective: 'Test parallel execution',
      context: 'Integration test context',
      availableAgents: [
        {
          id: 'agent-1',
          name: 'Research Agent',
          role: AgentRole.RESEARCHER,
          description: 'Research specialist',
          status: 'idle',
        },
        {
          id: 'agent-2',
          name: 'Analysis Agent',
          role: AgentRole.ANALYZER,
          description: 'Analysis specialist',
          status: 'idle',
        },
        {
          id: 'agent-3',
          name: 'Writing Agent',
          role: AgentRole.WRITER,
          description: 'Content writer',
          status: 'idle',
        },
      ],
      activeAgents: new Set(),
      agentTasks: [],
      agentResults: [],
      currentPhase: 'planning',
      consensusRequired: false,
      consensusThreshold: 0.7,
      consensusResults: new Map(),
      errors: [],
      retryCount: 0,
      maxRetries: 3,
      maxParallelAgents: 3,
      agentTimeout: 5000,
      startTime: new Date(),
      checkpointCount: 0,
      sessionId: 'test-session',
      metadata: {},
      ...overrides,
    };
  };

  beforeEach(async () => {
    const mockMemoryService = {
      retrieveRelevantMemories: jest.fn().mockResolvedValue([]),
      storeConversationMemory: jest.fn().mockResolvedValue(undefined),
      clearThreadMemories: jest.fn().mockResolvedValue(undefined),
      getHealthStatus: jest.fn().mockResolvedValue({ available: true }),
      getConfig: jest.fn().mockReturnValue({}),
      onModuleInit: jest.fn().mockResolvedValue(undefined),
    };

    const mockLangSmithService = {
      isEnabled: jest.fn().mockReturnValue(false),
    };

    module = await Test.createTestingModule({
      providers: [
        {
          provide: SupervisorGraph,
          useFactory: (specialistAgentsService: SpecialistAgentsService) => {
            return new SupervisorGraph(specialistAgentsService);
          },
          inject: [SpecialistAgentsService],
        },
        {
          provide: SpecialistAgentsService,
          useFactory: (
            databaseConfig: DatabaseConfig,
            modelConfigs: ModelConfigurations,
            memoryService: MemoryService,
            langsmithService: LangSmithService,
          ) => {
            return new SpecialistAgentsService(databaseConfig, modelConfigs, memoryService, langsmithService);
          },
          inject: ['DATABASE_CONFIG', 'MODEL_CONFIGS', MemoryService, LangSmithService],
        },
        {
          provide: SpecialistAgentsFactory,
          useFactory: (databaseConfig: DatabaseConfig, modelConfigs: ModelConfigurations, langsmithService: LangSmithService) => {
            return new SpecialistAgentsFactory(databaseConfig, modelConfigs, langsmithService);
          },
          inject: ['DATABASE_CONFIG', 'MODEL_CONFIGS', LangSmithService],
        },
        {
          provide: 'DATABASE_CONFIG',
          useValue: mockDatabaseConfig,
        },
        {
          provide: 'MODEL_CONFIGS',
          useValue: mockModelConfigs,
        },
        {
          provide: MemoryService,
          useValue: mockMemoryService,
        },
        {
          provide: LangSmithService,
          useValue: mockLangSmithService,
        },
      ],
    }).compile();

    supervisorGraph = module.get<SupervisorGraph>(SupervisorGraph);
    specialistAgentsService = module.get<SpecialistAgentsService>(SpecialistAgentsService);

    // Mock the specialist agent service execution
    jest.spyOn(specialistAgentsService, 'executeAgentTask').mockImplementation(async (agentId, task, _messages, _threadId) => ({
      agentId,
      taskId: task.taskId,
      output: textOutput(`Parallel output from ${agentId} for ${task.description}`),
      confidence: 0.85 + Math.random() * 0.1,
      metadata: {
        executionTime: 100 + Math.random() * 200,
        timestamp: new Date().toISOString(),
        parallelExecution: true,
      },
    }));
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Parallel Task Identification', () => {
    it('should identify independent tasks for parallel execution', () => {
      const pendingTasks: AgentTask[] = [
        {
          taskId: 'task-1',
          agentId: 'agent-1',
          description: 'Research task',
          priority: 'high',
          status: 'pending',
        },
        {
          taskId: 'task-2',
          agentId: 'agent-2',
          description: 'Analysis task',
          priority: 'high',
          status: 'pending',
        },
        {
          taskId: 'task-3',
          agentId: 'agent-3',
          description: 'Writing task',
          priority: 'medium',
          status: 'pending',
        },
      ];

      const state = createMockState();
      const identifyParallelizableTasks = (supervisorGraph as unknown as TestableSupervisorGraph).identifyParallelizableTasks.bind(supervisorGraph);
      const parallelTasks = identifyParallelizableTasks(pendingTasks, state);

      expect(parallelTasks).toHaveLength(3);
      expect(parallelTasks.map((t: AgentTask) => t.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('should exclude tasks with dependencies from parallel execution', () => {
      const pendingTasks: AgentTask[] = [
        {
          taskId: 'task-1',
          agentId: 'agent-1',
          description: 'Research task',
          priority: 'high',
          status: 'pending',
        },
        {
          taskId: 'task-2',
          agentId: 'agent-2',
          description: 'Analysis task',
          priority: 'high',
          status: 'pending',
          dependencies: ['task-1'], // Depends on task-1
        },
        {
          taskId: 'task-3',
          agentId: 'agent-3',
          description: 'Writing task',
          priority: 'medium',
          status: 'pending',
        },
      ];

      const state = createMockState();
      const identifyParallelizableTasks = (supervisorGraph as unknown as TestableSupervisorGraph).identifyParallelizableTasks.bind(supervisorGraph);
      const parallelTasks = identifyParallelizableTasks(pendingTasks, state);

      // Only task-1 and task-3 can run in parallel (task-2 depends on task-1)
      expect(parallelTasks).toHaveLength(2);
      expect(parallelTasks.map((t: AgentTask) => t.taskId)).toEqual(['task-1', 'task-3']);
    });

    it('should respect maxParallelAgents limit', () => {
      const pendingTasks: AgentTask[] = Array.from({ length: 10 }, (_, i) => ({
        taskId: `task-${i + 1}`,
        agentId: `agent-${i + 1}`,
        description: `Task ${i + 1}`,
        priority: 'medium' as const,
        status: 'pending' as const,
      }));

      const state = createMockState({ maxParallelAgents: 3 });
      const identifyParallelizableTasks = (supervisorGraph as unknown as TestableSupervisorGraph).identifyParallelizableTasks.bind(supervisorGraph);
      const parallelTasks = identifyParallelizableTasks(pendingTasks, state);

      expect(parallelTasks).toHaveLength(3);
    });

    it('should prioritize high priority tasks for parallel execution', () => {
      const pendingTasks: AgentTask[] = [
        {
          taskId: 'task-low',
          agentId: 'agent-1',
          description: 'Low priority task',
          priority: 'low',
          status: 'pending',
        },
        {
          taskId: 'task-high',
          agentId: 'agent-2',
          description: 'High priority task',
          priority: 'high',
          status: 'pending',
        },
        {
          taskId: 'task-medium',
          agentId: 'agent-3',
          description: 'Medium priority task',
          priority: 'medium',
          status: 'pending',
        },
        {
          taskId: 'task-high-2',
          agentId: 'agent-4',
          description: 'Another high priority task',
          priority: 'high',
          status: 'pending',
        },
      ];

      const state = createMockState({ maxParallelAgents: 2 });
      const identifyParallelizableTasks = (supervisorGraph as unknown as TestableSupervisorGraph).identifyParallelizableTasks.bind(supervisorGraph);
      const parallelTasks = identifyParallelizableTasks(pendingTasks, state);

      expect(parallelTasks).toHaveLength(2);
      expect(parallelTasks[0].priority).toBe('high');
      expect(parallelTasks[1].priority).toBe('high');
    });
  });

  describe('Parallel Execution', () => {
    it('should execute multiple agents in parallel successfully', async () => {
      const state = createMockState({
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Research task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Analysis task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
        ],
      });

      const executeParallelAgents = (supervisorGraph as unknown as TestableSupervisorGraph).executeParallelAgents.bind(supervisorGraph);
      const results = await executeParallelAgents(state);

      expect(results).toHaveLength(2);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[1].agentId).toBe('agent-2');
      expect(results[0].metadata?.parallelExecution).toBe(true);
      expect(results[1].metadata?.parallelExecution).toBe(true);
    });

    it('should handle agent timeout during parallel execution', async () => {
      // Mock one agent to take too long
      jest.spyOn(specialistAgentsService, 'executeAgentTask').mockImplementation(async (agentId, task, _messages, _threadId) => {
        if (agentId === 'agent-1') {
          // Simulate timeout
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
        return {
          agentId,
          taskId: task.taskId,
          output: textOutput(`Output from ${agentId}`),
          confidence: 0.9,
          metadata: { executionTime: 100, timestamp: new Date().toISOString() },
        };
      });

      const state = createMockState({
        agentTimeout: 100, // Very short timeout
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Slow task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Fast task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
        ],
      });

      const executeParallelAgents = (supervisorGraph as unknown as TestableSupervisorGraph).executeParallelAgents.bind(supervisorGraph);
      const results = await executeParallelAgents(state);

      expect(results).toHaveLength(2);

      // First agent should have timeout error
      const timeoutResult = results.find((r: AgentResult) => r.agentId === 'agent-1');
      expect(timeoutResult?.error).toContain('timeout');

      // Second agent should succeed
      const successResult = results.find((r: AgentResult) => r.agentId === 'agent-2');
      expect(successResult?.error).toBeUndefined();
      expect(successResult?.output.type).toBe('text');
      if (successResult?.output.type === 'text') {
        expect(successResult.output.content).toContain('Output from agent-2');
      }
    });

    it('should handle agent failures during parallel execution', async () => {
      // Mock one agent to fail
      jest.spyOn(specialistAgentsService, 'executeAgentTask').mockImplementation(async (agentId, task, _messages, _threadId) => {
        if (agentId === 'agent-1') {
          throw new Error('Agent execution failed');
        }
        return {
          agentId,
          taskId: task.taskId,
          output: textOutput(`Output from ${agentId}`),
          confidence: 0.9,
          metadata: { executionTime: 100, timestamp: new Date().toISOString() },
        };
      });

      const state = createMockState({
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Failing task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Successful task',
            priority: 'high',
            status: 'in-progress',
            startedAt: new Date(),
          },
        ],
      });

      const executeParallelAgents = (supervisorGraph as unknown as TestableSupervisorGraph).executeParallelAgents.bind(supervisorGraph);
      const results = await executeParallelAgents(state);

      expect(results).toHaveLength(2);

      // First agent should have error
      const failedResult = results.find((r: AgentResult) => r.agentId === 'agent-1');
      expect(failedResult?.error).toBe('Agent execution failed');

      // Second agent should succeed
      const successResult = results.find((r: AgentResult) => r.agentId === 'agent-2');
      expect(successResult?.error).toBeUndefined();
    });
  });

  describe('Result Synchronization', () => {
    it('should synchronize parallel execution results', async () => {
      const state = createMockState({
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: textOutput('Research findings'),
            confidence: 0.9,
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: textOutput('Analysis results'),
            confidence: 0.85,
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
        ],
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Research task',
            priority: 'high',
            status: 'in-progress',
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Analysis task',
            priority: 'high',
            status: 'in-progress',
          },
        ],
      });

      const synchronizeParallelResults = (supervisorGraph as unknown as TestableSupervisorGraph).synchronizeParallelResults.bind(supervisorGraph);
      const syncResult = await synchronizeParallelResults(state);

      expect(syncResult.synchronizedCount).toBe(2);
      expect(syncResult.conflicts).toHaveLength(0);

      // Tasks should be marked as completed
      expect(state.agentTasks[0].status).toBe('completed');
      expect(state.agentTasks[1].status).toBe('completed');
    });

    it('should detect and resolve conflicts in parallel results', async () => {
      // Create a custom AgentOutput that will work with detectConflict's toString() logic
      const positiveOutput = {
        type: 'text' as const,
        content: 'positive result',
        toString: () => 'positive result',
      };

      const negativeOutput = {
        type: 'text' as const,
        content: 'negative result',
        toString: () => 'negative result',
      };

      const state = createMockState({
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: positiveOutput,
            confidence: 0.8,
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: negativeOutput,
            confidence: 0.9,
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
        ],
      });

      const detectConflict = (supervisorGraph as unknown as TestableSupervisorGraph).detectConflict.bind(supervisorGraph);
      const hasConflict = detectConflict(state.agentResults[0], state.agentResults[1]);

      expect(hasConflict).toBe(true);

      const resolveConflict = (supervisorGraph as unknown as TestableSupervisorGraph).resolveConflict.bind(supervisorGraph);
      const resolution = resolveConflict(state.agentResults[0], state.agentResults[1]);

      expect(resolution.winner).toBe('agent-2'); // Higher confidence wins
      expect(resolution.reason).toBe('higher_confidence');
    });

    it('should handle synchronization with failed tasks', async () => {
      const state = createMockState({
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: textOutput(''),
            error: 'Execution failed',
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: textOutput('Success'),
            confidence: 0.9,
            metadata: { parallelExecution: true, timestamp: new Date().toISOString() },
          },
        ],
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Failed task',
            priority: 'high',
            status: 'in-progress',
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Successful task',
            priority: 'high',
            status: 'in-progress',
          },
        ],
      });

      const synchronizeParallelResults = (supervisorGraph as unknown as TestableSupervisorGraph).synchronizeParallelResults.bind(supervisorGraph);
      const syncResult = await synchronizeParallelResults(state);

      expect(syncResult.synchronizedCount).toBe(2);
      expect(state.agentTasks[0].status).toBe('failed');
      expect(state.agentTasks[1].status).toBe('completed');
    });
  });

  describe('Routing Logic', () => {
    it('should route to parallel execution when multiple independent tasks exist', async () => {
      const state = createMockState({
        currentPhase: 'execution',
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Task 1',
            priority: 'high',
            status: 'pending',
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            description: 'Task 2',
            priority: 'high',
            status: 'pending',
          },
        ],
      });

      const routeFromSupervisor = (supervisorGraph as unknown as TestableSupervisorGraph).routeFromSupervisor.bind(supervisorGraph);
      const route = await routeFromSupervisor(state);

      expect(route).toBe('parallel_execution');
      // Tasks should be marked as in-progress
      expect(state.agentTasks[0].status).toBe('in-progress');
      expect(state.agentTasks[1].status).toBe('in-progress');
    });

    it('should route from parallel execution to synchronization on success', () => {
      const state = createMockState({
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: textOutput('Success'),
            metadata: { parallelExecution: true },
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: textOutput('Success'),
            metadata: { parallelExecution: true },
          },
        ],
      });

      const routeFromParallelExecution = (supervisorGraph as unknown as TestableSupervisorGraph).routeFromParallelExecution.bind(supervisorGraph);
      const route = routeFromParallelExecution(state);

      expect(route).toBe('synchronization');
    });

    it('should route from parallel execution to error handler on critical failures', () => {
      const state = createMockState({
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: textOutput(''),
            error: 'Critical failure',
            metadata: { parallelExecution: true },
          },
        ],
      });

      const routeFromParallelExecution = (supervisorGraph as unknown as TestableSupervisorGraph).routeFromParallelExecution.bind(supervisorGraph);
      const route = routeFromParallelExecution(state);

      expect(route).toBe('error_handler');
    });

    it('should route from synchronization to consensus when required', () => {
      const state = createMockState({
        consensusRequired: true,
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: textOutput('Result 1'),
            metadata: { parallelExecution: true },
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: textOutput('Result 2'),
            metadata: { parallelExecution: true },
          },
        ],
      });

      const routeFromSynchronization = (supervisorGraph as unknown as TestableSupervisorGraph).routeFromSynchronization.bind(supervisorGraph);
      const route = routeFromSynchronization(state);

      expect(route).toBe('consensus');
    });
  });
});
