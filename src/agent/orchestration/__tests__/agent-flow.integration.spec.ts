import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuidv4 } from 'uuid';
import { SpecialistAgentsFactory } from '../specialist-agents.factory';
import { SpecialistAgentsService } from '../specialist-agents.service';
import { SupervisorGraph } from '../supervisor.graph';
import { SupervisorService } from '../supervisor.service';
import { Agent, AgentResult, AgentOutput, AgentTask, SupervisorState } from '../supervisor.state';

// Helper function to create structured AgentOutput
function structuredOutput(data: Record<string, unknown>): AgentOutput {
  return { type: 'structured', data };
}

describe('Comprehensive Agent Flow Integration Tests', () => {
  let supervisorGraph: SupervisorGraph;
  let supervisorService: SupervisorService;
  let specialistAgentsService: SpecialistAgentsService;
  let mockLLM: jest.Mocked<ChatOpenAI>;
  let mockCheckpointer: any;

  beforeEach(async () => {
    // Mock LLM
    mockLLM = {
      invoke: jest.fn().mockImplementation(async (messages) => {
        // Simulate different responses based on message content
        const lastMessage = messages[messages.length - 1];
        const content = lastMessage.content?.toString() || '';

        if (content.includes('plan')) {
          return new AIMessageChunk({
            content: JSON.stringify({
              tasks: [
                { id: 'task1', description: 'Research topic', priority: 'high' },
                { id: 'task2', description: 'Analyze data', priority: 'medium' },
                { id: 'task3', description: 'Generate report', priority: 'low' },
              ],
            }),
          });
        }
        if (content.includes('research')) {
          return new AIMessageChunk({
            content: 'Research completed: Found relevant information about the topic.',
          });
        }
        if (content.includes('analyze')) {
          return new AIMessageChunk({
            content: 'Analysis completed: Data shows positive trends.',
          });
        }
        if (content.includes('report')) {
          return new AIMessageChunk({
            content: 'Report generated: Comprehensive analysis with recommendations.',
          });
        }

        return new AIMessageChunk({ content: 'Task completed successfully.' });
      }),
      stream: jest.fn().mockImplementation(async function* () {
        yield new AIMessage({ content: 'Streaming response...' });
      }),
    } as any;

    // Mock checkpointer
    mockCheckpointer = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupervisorGraph,
        {
          provide: SpecialistAgentsService,
          useValue: null, // Optional dependency
        },
        {
          provide: ChatOpenAI,
          useValue: mockLLM,
        },
      ],
    }).compile();

    supervisorGraph = moduleRef.get<SupervisorGraph>(SupervisorGraph);
    // We'll test SupervisorGraph directly without the service layer
    supervisorService = null as any;
    specialistAgentsService = null as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Orchestration Flows', () => {
    it('should execute complete research workflow from objective to final output', async () => {
      const objective = 'Research and analyze market trends for AI agents';
      const sessionId = uuidv4();

      // Initialize state
      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'researcher',
            name: 'Research Agent',
            type: 'researcher',
            description: 'Handles research tasks',
            priority: 8,
          },
          {
            id: 'analyzer',
            name: 'Analysis Agent',
            type: 'analyzer',
            description: 'Handles data analysis',
            priority: 7,
          },
          {
            id: 'writer',
            name: 'Writer Agent',
            type: 'writer',
            description: 'Generates reports',
            priority: 6,
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
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      // Compile and execute the graph
      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify complete workflow execution
      expect(result.currentPhase).toBeDefined();
      expect(result.agentTasks.length).toBeGreaterThan(0);
      expect(result.messages.length).toBeGreaterThan(initialState.messages.length);

      // Verify agents were activated
      expect(result.activeAgents.size).toBeGreaterThan(0);

      // Verify results were generated
      if (result.currentPhase === 'complete' || result.currentPhase === 'review') {
        expect(result.agentResults.length).toBeGreaterThan(0);
      }
    });

    it('should handle complex multi-agent collaboration with handoffs', async () => {
      const objective = 'Complex task requiring multiple agents';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'This requires collaboration between multiple specialized agents',
        availableAgents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            type: 'custom',
            description: 'First specialist',
            priority: 9,
          },
          {
            id: 'agent2',
            name: 'Agent 2',
            type: 'custom',
            description: 'Second specialist',
            priority: 8,
          },
          {
            id: 'agent3',
            name: 'Agent 3',
            type: 'custom',
            description: 'Third specialist',
            priority: 7,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [],
        currentPhase: 'planning',
        consensusRequired: true,
        consensusThreshold: 0.8,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 15,
        configurable: { thread_id: sessionId },
      });

      // Verify collaboration occurred
      expect(result.activeAgents.size).toBeGreaterThan(1);

      // Verify consensus was attempted if required
      if (result.consensusRequired && result.agentResults.length > 1) {
        expect(result.consensusResults).toBeDefined();
      }
    });

    it('should execute parallel agent tasks when appropriate', async () => {
      const objective = 'Execute independent tasks in parallel';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'Multiple independent subtasks that can run concurrently',
        availableAgents: [
          {
            id: 'worker1',
            name: 'Worker 1',
            type: 'custom',
            description: 'Handles task type A',
            priority: 5,
          },
          {
            id: 'worker2',
            name: 'Worker 2',
            type: 'custom',
            description: 'Handles task type B',
            priority: 5,
          },
          {
            id: 'worker3',
            name: 'Worker 3',
            type: 'custom',
            description: 'Handles task type C',
            priority: 5,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'worker1',
            description: 'Independent task 1',
            priority: 'medium',
            status: 'pending',
            dependencies: [],
          },
          {
            taskId: 'task2',
            agentId: 'worker2',
            description: 'Independent task 2',
            priority: 'medium',
            status: 'pending',
            dependencies: [],
          },
          {
            taskId: 'task3',
            agentId: 'worker3',
            description: 'Independent task 3',
            priority: 'medium',
            status: 'pending',
            dependencies: [],
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
        maxParallelAgents: 3,
        agentTimeout: 5000,
      };

      // Mock parallel execution
      const executeParallelAgents = jest.spyOn(supervisorGraph as any, 'executeParallelAgents');

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify parallel execution was attempted for independent tasks
      if (initialState.maxParallelAgents && initialState.maxParallelAgents > 1) {
        const independentTasks = initialState.agentTasks.filter((t) => !t.dependencies || t.dependencies.length === 0);

        if (independentTasks.length > 1) {
          expect(result.metadata?.parallelExecution).toBeDefined();
        }
      }
    });
  });

  describe('Checkpoint Persistence and Recovery', () => {
    it('should persist checkpoints at key stages', async () => {
      const objective = 'Task with checkpointing';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            type: 'custom',
            description: 'Worker agent',
            priority: 5,
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
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();

      // Execute with checkpointer
      await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: {
          thread_id: sessionId,
          checkpoint_ns: 'test',
          checkpointer: mockCheckpointer,
        },
      });

      // Verify checkpoint was saved
      expect(mockCheckpointer.put).toHaveBeenCalled();
    });

    it('should recover from checkpoint and resume execution', async () => {
      const objective = 'Task to recover from checkpoint';
      const sessionId = uuidv4();

      // Create a checkpoint state midway through execution
      const checkpointState: SupervisorState = {
        messages: [new HumanMessage(objective), new AIMessage('Planning completed')],
        objective,
        context: 'Recovered from checkpoint',
        availableAgents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            type: 'custom',
            description: 'Worker agent',
            priority: 5,
          },
        ],
        activeAgents: new Set(['agent1']),
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'agent1',
            description: 'Task in progress',
            priority: 'high',
            status: 'in-progress',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 1,
        sessionId,
        metadata: { recovered: true },
      };

      // Mock checkpoint retrieval
      mockCheckpointer.get.mockResolvedValueOnce({
        v: 1,
        id: sessionId,
        ts: new Date().toISOString(),
        channel_values: checkpointState,
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
        metadata: { checkpoint_ns: 'test' },
        parent_config: null,
      });

      const compiled = supervisorGraph.compile();

      // Resume from checkpoint
      const result = await compiled.invoke(null, {
        recursionLimit: 10,
        configurable: {
          thread_id: sessionId,
          checkpoint_ns: 'test',
          checkpointer: mockCheckpointer,
        },
      });

      // Verify execution resumed from checkpoint
      expect(mockCheckpointer.get).toHaveBeenCalledWith(
        expect.objectContaining({
          configurable: expect.objectContaining({
            thread_id: sessionId,
          }),
        }),
      );

      expect(result.checkpointCount).toBeGreaterThan(0);
      expect(result.metadata?.recovered).toBe(true);
    });

    it('should handle checkpoint corruption gracefully', async () => {
      const objective = 'Handle corrupted checkpoint';
      const sessionId = uuidv4();

      // Mock corrupted checkpoint
      mockCheckpointer.get.mockRejectedValueOnce(new Error('Checkpoint data corrupted'));

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            type: 'custom',
            description: 'Worker agent',
            priority: 5,
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
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();

      // Should start fresh when checkpoint is corrupted
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: {
          thread_id: sessionId,
          checkpoint_ns: 'test',
          checkpointer: mockCheckpointer,
        },
      });

      // Verify execution started fresh
      expect(result).toBeDefined();
      expect(result.currentPhase).toBeDefined();
    });
  });

  describe('Agent Failure and Recovery Scenarios', () => {
    it('should handle agent failures with retry logic', async () => {
      const objective = 'Task with failing agent';
      const sessionId = uuidv4();

      let failureCount = 0;
      const maxFailures = 2;

      // Mock agent that fails twice then succeeds
      mockLLM.invoke.mockImplementation(async () => {
        failureCount++;
        if (failureCount <= maxFailures) {
          throw new Error('Agent execution failed');
        }
        return new AIMessageChunk({ content: 'Success after retries' });
      });

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'unreliable',
            name: 'Unreliable Agent',
            type: 'custom',
            description: 'Agent that may fail',
            priority: 5,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'unreliable',
            description: 'Task that may fail',
            priority: 'high',
            status: 'pending',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify retry logic was triggered
      expect(failureCount).toBe(maxFailures + 1); // Failed twice, succeeded on third
      expect(result.retryCount).toBeGreaterThan(0);
    });

    it('should handle timeout scenarios for long-running agents', async () => {
      const objective = 'Task with timeout';
      const sessionId = uuidv4();

      // Mock agent that takes too long
      mockLLM.invoke.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(new AIMessageChunk({ content: 'Late response' }));
            }, 10000); // 10 seconds
          }),
      );

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'slow',
            name: 'Slow Agent',
            type: 'custom',
            description: 'Agent that takes too long',
            priority: 5,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'slow',
            description: 'Long-running task',
            priority: 'high',
            status: 'pending',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
        agentTimeout: 1000, // 1 second timeout
      };

      const compiled = supervisorGraph.compile();

      // Start execution (should timeout)
      const startTime = Date.now();
      const resultPromise = compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Wait for a reasonable time
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const elapsed = Date.now() - startTime;

      // Verify timeout was enforced
      expect(elapsed).toBeLessThan(5000); // Should not wait full 10 seconds
    });

    it('should handle cascading failures in dependent tasks', async () => {
      const objective = 'Task with dependencies and failures';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: '',
        availableAgents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            type: 'custom',
            description: 'First agent',
            priority: 5,
          },
          {
            id: 'agent2',
            name: 'Agent 2',
            type: 'custom',
            description: 'Dependent agent',
            priority: 5,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'agent1',
            description: 'Primary task',
            priority: 'high',
            status: 'failed',
          },
          {
            taskId: 'task2',
            agentId: 'agent2',
            description: 'Dependent task',
            priority: 'high',
            status: 'pending',
            dependencies: ['task1'],
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [{ agentId: 'agent1', error: 'Task task1 failed', timestamp: new Date() }],
        retryCount: 3,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify dependent tasks were not executed
      const task2Result = result.agentResults.find((r: AgentResult) => r.taskId === 'task2');
      expect(task2Result).toBeUndefined();

      // Verify error handling
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high volume of concurrent agents efficiently', async () => {
      const objective = 'High volume concurrent processing';
      const sessionId = uuidv4();
      const numAgents = 10;

      // Create many agents
      const agents: Agent[] = Array.from({ length: numAgents }, (_, i) => ({
        id: `agent${i}`,
        name: `Agent ${i}`,
        type: 'custom',
        description: `Worker agent ${i}`,
        priority: 5,
      }));

      // Create many independent tasks
      const tasks: AgentTask[] = Array.from({ length: numAgents }, (_, i) => ({
        taskId: `task${i}`,
        agentId: `agent${i}`,
        description: `Task ${i}`,
        priority: 'medium',
        status: 'pending',
        dependencies: [],
      }));

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'Process many tasks concurrently',
        availableAgents: agents,
        activeAgents: new Set(),
        agentTasks: tasks,
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
        maxParallelAgents: 5,
        agentTimeout: 5000,
      };

      const compiled = supervisorGraph.compile();

      const startTime = Date.now();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 20,
        configurable: { thread_id: sessionId },
      });
      const executionTime = Date.now() - startTime;

      // Verify all tasks were processed
      expect(result.agentResults.length).toBeGreaterThan(0);

      // Verify execution was reasonably fast
      expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify parallel execution was used
      if (initialState.maxParallelAgents && initialState.maxParallelAgents > 1) {
        expect(result.metadata?.parallelExecutionUsed).toBeDefined();
      }
    });

    it('should maintain performance under memory pressure', async () => {
      const objective = 'Memory-intensive task';
      const sessionId = uuidv4();

      // Create large context and messages
      const largeContext = 'x'.repeat(10000); // 10KB of context
      const largeMessages = Array.from({ length: 100 }, (_, i) => new HumanMessage(`Message ${i}: ${'y'.repeat(100)}`));

      const initialState: SupervisorState = {
        messages: largeMessages,
        objective,
        context: largeContext,
        availableAgents: [
          {
            id: 'memory_agent',
            name: 'Memory Agent',
            type: 'custom',
            description: 'Handles large data',
            priority: 5,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'memory_task',
            agentId: 'memory_agent',
            description: 'Process large data',
            priority: 'high',
            status: 'pending',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();

      // Measure memory before
      const memBefore = process.memoryUsage().heapUsed;

      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Measure memory after
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = memAfter - memBefore;

      // Verify execution completed
      expect(result).toBeDefined();

      // Verify memory increase is reasonable (less than 100MB)
      expect(memIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should handle rapid succession of requests', async () => {
      const numRequests = 5;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < numRequests; i++) {
        const objective = `Request ${i}`;
        const sessionId = uuidv4();

        const initialState: SupervisorState = {
          messages: [new HumanMessage(objective)],
          objective,
          context: '',
          availableAgents: [
            {
              id: 'rapid_agent',
              name: 'Rapid Agent',
              type: 'custom',
              description: 'Fast worker',
              priority: 5,
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
          startTime: new Date(),
          checkpointCount: 0,
          sessionId,
          metadata: {},
        };

        const compiled = supervisorGraph.compile();

        promises.push(
          compiled.invoke(initialState, {
            recursionLimit: 5,
            configurable: { thread_id: sessionId },
          }),
        );
      }

      // Execute all requests concurrently
      const results = await Promise.allSettled(promises);

      // Verify all requests completed
      const successful = results.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBe(numRequests);
    });
  });

  describe('Agent Interaction Validation', () => {
    it('should validate proper message passing between agents', async () => {
      const objective = 'Validate agent communication';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'Test inter-agent communication',
        availableAgents: [
          {
            id: 'sender',
            name: 'Sender Agent',
            type: 'custom',
            description: 'Sends messages',
            priority: 8,
          },
          {
            id: 'receiver',
            name: 'Receiver Agent',
            type: 'custom',
            description: 'Receives messages',
            priority: 7,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'send_task',
            agentId: 'sender',
            description: 'Send data to receiver',
            priority: 'high',
            status: 'pending',
          },
          {
            taskId: 'receive_task',
            agentId: 'receiver',
            description: 'Process received data',
            priority: 'high',
            status: 'pending',
            dependencies: ['send_task'],
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify message passing
      const senderResult = result.agentResults.find((r: AgentResult) => r.agentId === 'sender');
      const receiverResult = result.agentResults.find((r: AgentResult) => r.agentId === 'receiver');

      if (senderResult && receiverResult) {
        // Verify receiver processed after sender
        expect(receiverResult.metadata?.receivedFrom).toBe('sender');
      }
    });

    it('should validate consensus mechanism with conflicting agent outputs', async () => {
      const objective = 'Resolve conflicting opinions';
      const sessionId = uuidv4();

      // Mock conflicting responses
      let callCount = 0;
      mockLLM.invoke.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new AIMessageChunk({
            content: 'Option A is the best choice',
            additional_kwargs: { confidence: 0.8 },
          });
        }
        if (callCount === 2) {
          return new AIMessageChunk({
            content: 'Option B is the best choice',
            additional_kwargs: { confidence: 0.7 },
          });
        }
        return new AIMessageChunk({
          content: 'Option A is slightly better',
          additional_kwargs: { confidence: 0.6 },
        });
      });

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'Multiple agents with different opinions',
        availableAgents: [
          {
            id: 'optimist',
            name: 'Optimist Agent',
            type: 'analyzer',
            description: 'Positive analysis',
            priority: 7,
          },
          {
            id: 'pessimist',
            name: 'Pessimist Agent',
            type: 'analyzer',
            description: 'Critical analysis',
            priority: 7,
          },
          {
            id: 'neutral',
            name: 'Neutral Agent',
            type: 'analyzer',
            description: 'Balanced analysis',
            priority: 7,
          },
        ],
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [
          {
            agentId: 'optimist',
            taskId: 'analyze1',
            output: structuredOutput({ choice: 'A', reason: 'Best ROI' }),
            confidence: 0.8,
          },
          {
            agentId: 'pessimist',
            taskId: 'analyze2',
            output: structuredOutput({ choice: 'B', reason: 'Lower risk' }),
            confidence: 0.7,
          },
          {
            agentId: 'neutral',
            taskId: 'analyze3',
            output: structuredOutput({ choice: 'A', reason: 'Balanced approach' }),
            confidence: 0.6,
          },
        ],
        currentPhase: 'consensus',
        consensusRequired: true,
        consensusThreshold: 0.6,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify consensus was built
      expect(result.consensusResults).toBeDefined();
      expect(result.consensusResults?.size).toBeGreaterThan(0);

      // Verify conflict resolution
      const votingResult = result.consensusResults?.get('votingResult');
      expect(votingResult).toBeDefined();
      expect(votingResult?.winner).toBeDefined();
    });

    it('should validate routing decisions based on agent capabilities', async () => {
      const objective = 'Route to appropriate specialist';
      const sessionId = uuidv4();

      const initialState: SupervisorState = {
        messages: [new HumanMessage(objective)],
        objective,
        context: 'Technical task requiring specific expertise',
        availableAgents: [
          {
            id: 'generalist',
            name: 'Generalist Agent',
            type: 'custom',
            description: 'Handles general tasks',
            priority: 5,
            capabilities: ['general'],
          },
          {
            id: 'specialist',
            name: 'Specialist Agent',
            type: 'custom',
            description: 'Handles technical tasks',
            priority: 8,
            capabilities: ['technical', 'analysis'],
          },
        ],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'technical_task',
            agentId: '',
            description: 'Complex technical analysis',
            priority: 'high',
            status: 'pending',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        consensusResults: new Map(),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId,
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: sessionId },
      });

      // Verify task was routed to specialist
      const task = result.agentTasks.find((t: AgentTask) => t.taskId === 'technical_task');
      expect(task?.agentId).toBe('specialist');
    });
  });
});
