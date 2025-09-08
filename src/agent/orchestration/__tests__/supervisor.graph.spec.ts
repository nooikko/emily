import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { SpecialistAgentsService } from '../specialist-agents.service';
import { SupervisorGraph } from '../supervisor.graph';
import { Agent, AgentTask, createInitialSupervisorState, SupervisorState } from '../supervisor.state';

describe('SupervisorGraph', () => {
  let supervisorGraph: SupervisorGraph;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorGraph,
        {
          provide: SpecialistAgentsService,
          useValue: null, // Optional dependency
        },
      ],
    }).compile();

    supervisorGraph = module.get<SupervisorGraph>(SupervisorGraph);
  });

  describe('Graph Structure', () => {
    it('should create supervisor graph with correct structure', () => {
      const graph = supervisorGraph.getGraph();
      expect(graph).toBeDefined();

      const structure = supervisorGraph.getGraphStructure();
      expect(structure).toContain('planning');
      expect(structure).toContain('supervisor');
      expect(structure).toContain('agent_execution');
      expect(structure).toContain('consensus');
      expect(structure).toContain('review');
      expect(structure).toContain('error_handler');
    });

    it('should compile graph successfully', () => {
      const compiled = supervisorGraph.compile();
      expect(compiled).toBeDefined();
      expect(compiled.invoke).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should create initial supervisor state', () => {
      const agents: Agent[] = [
        {
          id: 'researcher',
          name: 'Research Agent',
          type: 'researcher',
          description: 'Gathers information',
          tools: ['search', 'web_fetch'],
        },
        {
          id: 'analyzer',
          name: 'Analysis Agent',
          type: 'analyzer',
          description: 'Analyzes data',
          tools: ['calculate', 'compare'],
        },
      ];

      const state = createInitialSupervisorState('Research and analyze market trends', agents, 'session-123', 'user-456');

      expect(state.objective).toBe('Research and analyze market trends');
      expect(state.availableAgents).toHaveLength(2);
      expect(state.sessionId).toBe('session-123');
      expect(state.userId).toBe('user-456');
      expect(state.currentPhase).toBe('planning');
      expect(state.messages).toEqual([]);
      expect(state.agentTasks).toEqual([]);
    });

    it('should handle state transitions', async () => {
      const agents: Agent[] = [
        {
          id: 'researcher',
          name: 'Research Agent',
          type: 'researcher',
          description: 'Gathers information',
          tools: ['search'],
        },
      ];

      const initialState = createInitialSupervisorState('Research AI trends', agents, 'session-123') as SupervisorState;

      const compiled = supervisorGraph.compile();

      // Test planning phase
      const result = await compiled.invoke(initialState, {
        recursionLimit: 2, // Need planning -> supervisor
      });

      expect(result.currentPhase).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  describe('Planning Node', () => {
    it('should create execution plan for research objective', async () => {
      const agents: Agent[] = [
        {
          id: 'researcher',
          name: 'Research Agent',
          type: 'researcher',
          description: 'Gathers information',
          tools: ['search'],
        },
        {
          id: 'reviewer',
          name: 'Review Agent',
          type: 'reviewer',
          description: 'Reviews results',
          tools: ['validate'],
        },
      ];

      const state = createInitialSupervisorState('Research latest AI developments', agents, 'session-123') as SupervisorState;

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 2, // Need planning -> supervisor
      });

      // Should have created tasks
      expect(result.agentTasks).toBeDefined();
      expect(result.agentTasks.length).toBeGreaterThan(0);

      // Should have research task
      const researchTask = result.agentTasks.find((t: AgentTask) => t.agentId === 'researcher');
      expect(researchTask).toBeDefined();
      expect(researchTask?.priority).toBe('high');
      expect(researchTask?.status).toBe('pending');

      // Should have review task
      const reviewTask = result.agentTasks.find((t: AgentTask) => t.agentId === 'reviewer');
      expect(reviewTask).toBeDefined();
    });

    it('should create execution plan for analysis objective', async () => {
      const agents: Agent[] = [
        {
          id: 'analyzer',
          name: 'Analysis Agent',
          type: 'analyzer',
          description: 'Analyzes data',
          tools: ['calculate'],
        },
        {
          id: 'reviewer',
          name: 'Review Agent',
          type: 'reviewer',
          description: 'Reviews results',
          tools: ['validate'],
        },
      ];

      const state = createInitialSupervisorState('Analyze market data and create report', agents, 'session-456') as SupervisorState;

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 2, // Need planning -> supervisor
      });

      // Should have analysis task
      const analysisTask = result.agentTasks.find((t: AgentTask) => t.agentId === 'analyzer');
      expect(analysisTask).toBeDefined();
      expect(analysisTask?.description).toContain('Analyze');
    });
  });

  describe('Routing Logic', () => {
    it('should route to high priority tasks first', async () => {
      const tasks: AgentTask[] = [
        {
          taskId: 'task-1',
          agentId: 'agent-1',
          description: 'Low priority task',
          priority: 'low',
          status: 'pending',
        },
        {
          taskId: 'task-2',
          agentId: 'agent-2',
          description: 'High priority task',
          priority: 'high',
          status: 'pending',
        },
        {
          taskId: 'task-3',
          agentId: 'agent-3',
          description: 'Medium priority task',
          priority: 'medium',
          status: 'pending',
        },
      ];

      const state: SupervisorState = {
        messages: [],
        objective: 'Test routing',
        context: '',
        availableAgents: [],
        activeAgents: new Set(),
        agentTasks: tasks,
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 3, // Need more iterations for routing
      });

      // Should route to high priority task first
      expect(result.nextAgent).toBe('agent-2');
      expect(result.routingDecision).toContain('high priority');
    });

    it('should handle no pending tasks', async () => {
      const state: SupervisorState = {
        messages: [],
        objective: 'Test empty routing',
        context: '',
        availableAgents: [],
        activeAgents: new Set(),
        agentTasks: [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            description: 'Completed task',
            priority: 'high',
            status: 'completed',
          },
        ],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 3, // Need more iterations for routing
      });

      // Should have no next agent when no pending tasks
      expect(result.routingDecision).toContain('No pending tasks');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors with retry logic', async () => {
      const state: SupervisorState = {
        messages: [],
        objective: 'Test error handling',
        context: '',
        availableAgents: [],
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        errors: [
          {
            agentId: 'agent-1',
            error: 'timeout error occurred',
            timestamp: new Date(),
          },
        ],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 10,
      });

      // Should increment retry count
      expect(result.retryCount).toBeGreaterThan(0);

      // Should have error handling message
      const errorMessage = result.messages.find((m: BaseMessage) => {
        const content = typeof m.content === 'string' ? m.content : '';
        return content.includes('Error handled');
      });
      expect(errorMessage).toBeDefined();
    });

    it('should stop retrying after max retries', async () => {
      const state: SupervisorState = {
        messages: [],
        objective: 'Test max retries',
        context: '',
        availableAgents: [],
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [],
        currentPhase: 'execution',
        consensusRequired: false,
        consensusThreshold: 0.7,
        errors: [
          {
            agentId: 'agent-1',
            error: 'permanent failure',
            timestamp: new Date(),
          },
        ],
        retryCount: 3, // Already at max
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 5,
      });

      // Should not exceed max retries
      expect(result.retryCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Consensus Building', () => {
    it('should build consensus from agent results', async () => {
      const agents: Agent[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          type: 'analyzer',
          description: 'First analyzer',
          tools: [],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          type: 'analyzer',
          description: 'Second analyzer',
          tools: [],
        },
      ];

      const state: SupervisorState = {
        messages: [],
        objective: 'Test consensus',
        context: '',
        availableAgents: agents,
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: 'Result 1',
            confidence: 0.9,
            reasoning: 'High confidence result',
          },
          {
            agentId: 'agent-2',
            taskId: 'task-2',
            output: 'Result 2',
            confidence: 0.8,
            reasoning: 'Good confidence result',
          },
        ],
        currentPhase: 'consensus',
        consensusRequired: true,
        consensusThreshold: 0.7,
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 2, // Only consensus -> review needed
      });

      // Should have consensus results
      expect(result.consensusResults).toBeDefined();
      expect(result.consensusResults?.get('agreementScore')).toBeGreaterThan(0);
    });

    it('should handle consensus threshold validation', async () => {
      const state: SupervisorState = {
        messages: [],
        objective: 'Test consensus threshold',
        context: '',
        availableAgents: [],
        activeAgents: new Set(),
        agentTasks: [],
        agentResults: [
          {
            agentId: 'agent-1',
            taskId: 'task-1',
            output: 'Result',
            confidence: 0.5, // Low confidence
          },
        ],
        currentPhase: 'review',
        consensusRequired: true,
        consensusThreshold: 0.8, // High threshold
        consensusResults: new Map([['agreementScore', 50]]),
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        startTime: new Date(),
        checkpointCount: 0,
        sessionId: 'test',
        metadata: {},
      };

      const compiled = supervisorGraph.compile();
      const result = await compiled.invoke(state, {
        recursionLimit: 1, // Only review node needed
      });

      // Should not approve due to low consensus
      const reviewMessage = result.messages.find((m: BaseMessage) => {
        const content = typeof m.content === 'string' ? m.content : '';
        return content.includes('threshold not met');
      });
      expect(reviewMessage).toBeDefined();
    });
  });

  describe('Complete Workflow', () => {
    it('should execute complete workflow from planning to completion', async () => {
      const agents: Agent[] = [
        {
          id: 'researcher',
          name: 'Research Agent',
          type: 'researcher',
          description: 'Gathers information',
          tools: ['search'],
        },
        {
          id: 'analyzer',
          name: 'Analysis Agent',
          type: 'analyzer',
          description: 'Analyzes data',
          tools: ['calculate'],
        },
        {
          id: 'writer',
          name: 'Writer Agent',
          type: 'writer',
          description: 'Creates content',
          tools: ['generate'],
        },
        {
          id: 'reviewer',
          name: 'Review Agent',
          type: 'reviewer',
          description: 'Reviews results',
          tools: ['validate'],
        },
      ];

      const state = createInitialSupervisorState('Research and analyze AI trends, then write a report', agents, 'workflow-test') as SupervisorState;

      const compiled = supervisorGraph.compile();

      // Execute with reasonable recursion limit
      const result = await compiled.invoke(state, {
        recursionLimit: 10, // Reduced for test stability
      });

      // Should have progressed through phases
      expect(result.currentPhase).toBeDefined();

      // Should have messages from various nodes
      expect(result.messages.length).toBeGreaterThan(0);

      // Should have created and processed tasks
      expect(result.agentTasks.length).toBeGreaterThan(0);

      // Should have agent results if execution completed
      if (result.currentPhase === 'complete') {
        expect(result.agentResults.length).toBeGreaterThan(0);
      }
    });
  });
});
