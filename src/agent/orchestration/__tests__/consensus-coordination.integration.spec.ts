import { Test } from '@nestjs/testing';
import { SupervisorGraph } from '../supervisor.graph';
import { SupervisorState, Agent, AgentTask, AgentResult } from '../supervisor.state';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { SpecialistAgentsService } from '../specialist-agents.service';

describe('Consensus and Coordination Integration', () => {
  let supervisorGraph: SupervisorGraph;
  let mockLLM: jest.Mocked<ChatOpenAI>;

  beforeEach(async () => {
    mockLLM = {
      invoke: jest.fn().mockResolvedValue(
        new AIMessage({
          content: 'Mock response',
          additional_kwargs: {},
        })
      ),
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
    // The graph is created in the constructor, just compile it
    supervisorGraph.compile();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create mock state
  const createMockState = (overrides?: Partial<SupervisorState>): SupervisorState => ({
    messages: [],
    objective: 'Test objective',
    context: 'Test context',
    availableAgents: [
      {
        id: 'agent1',
        name: 'Research Agent',
        description: 'Handles research tasks',
        type: 'researcher',
        priority: 8,
      },
      {
        id: 'agent2',
        name: 'Analysis Agent',
        description: 'Handles analysis tasks',
        type: 'analyzer',
        priority: 6,
      },
      {
        id: 'agent3',
        name: 'Writer Agent',
        description: 'Handles writing tasks',
        type: 'writer',
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
    sessionId: 'test-session',
    metadata: {},
    ...overrides,
  });

  describe('Voting Mechanisms', () => {
    it('should apply majority voting when no confidence scores are present', () => {
      const applyVotingMechanism = (supervisorGraph as any).applyVotingMechanism.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'option_a' },
        { agentId: 'agent2', taskId: 'task2', output: 'option_a' },
        { agentId: 'agent3', taskId: 'task3', output: 'option_b' },
      ];
      
      const state = createMockState();
      const voting = applyVotingMechanism(results, state);
      
      expect(voting.method).toBe('majority');
      expect(voting.winner).toBe('option_a');
      expect(voting.votes.get('"option_a"')).toBe(2);
      expect(voting.votes.get('"option_b"')).toBe(1);
    });

    it('should apply weighted voting when confidence scores are present', () => {
      const applyVotingMechanism = (supervisorGraph as any).applyVotingMechanism.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'option_a', confidence: 0.9 },
        { agentId: 'agent2', taskId: 'task2', output: 'option_b', confidence: 0.8 },
        { agentId: 'agent3', taskId: 'task3', output: 'option_b', confidence: 0.7 },
      ];
      
      const state = createMockState();
      const voting = applyVotingMechanism(results, state);
      
      expect(voting.method).toBe('weighted');
      expect(voting.winner).toBe('option_b');
      expect(voting.votes.get('"option_b"')).toBeCloseTo(1.5, 1);
      expect(voting.votes.get('"option_a"')).toBeCloseTo(0.9, 1);
    });

    it('should handle tie-breaking in voting', () => {
      const applyVotingMechanism = (supervisorGraph as any).applyVotingMechanism.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'option_a', confidence: 0.5 },
        { agentId: 'agent2', taskId: 'task2', output: 'option_b', confidence: 0.5 },
      ];
      
      const state = createMockState();
      const voting = applyVotingMechanism(results, state);
      
      expect(voting.method).toBe('weighted');
      expect(['option_a', 'option_b']).toContain(voting.winner);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect contradictory boolean outputs', () => {
      const detectConflicts = (supervisorGraph as any).detectConflicts.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: true },
        { agentId: 'agent2', taskId: 'task2', output: false },
      ];
      
      const conflicts = detectConflicts(results);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('contradiction');
      expect(conflicts[0].agents).toEqual(['agent1', 'agent2']);
    });

    it('should detect contradictory string outputs with opposite sentiments', () => {
      const detectConflicts = (supervisorGraph as any).detectConflicts.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'We should accept this proposal' },
        { agentId: 'agent2', taskId: 'task2', output: 'We must reject this proposal' },
      ];
      
      const conflicts = detectConflicts(results);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('contradiction');
    });

    it('should detect high confidence divergence', () => {
      const detectConflicts = (supervisorGraph as any).detectConflicts.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'result_a', confidence: 0.95 },
        { agentId: 'agent2', taskId: 'task2', output: 'result_b', confidence: 0.35 },
      ];
      
      const conflicts = detectConflicts(results);
      
      const divergenceConflict = conflicts.find((c: any) => c.type === 'divergence');
      expect(divergenceConflict).toBeDefined();
      expect(divergenceConflict?.details).toContain('0.60');
    });

    it('should not detect conflicts when outputs are consistent', () => {
      const detectConflicts = (supervisorGraph as any).detectConflicts.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'consistent_result', confidence: 0.8 },
        { agentId: 'agent2', taskId: 'task2', output: 'consistent_result', confidence: 0.75 },
      ];
      
      const conflicts = detectConflicts(results);
      
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve contradictions using agent priority', () => {
      const resolveConflicts = (supervisorGraph as any).resolveConflicts.bind(supervisorGraph);
      
      const conflicts = [{
        type: 'contradiction',
        agents: ['agent1', 'agent2'],
        details: 'Contradiction detected',
      }];
      
      const state = createMockState();
      const resolutions = resolveConflicts(conflicts, state);
      
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].method).toBe('priority-based');
      expect(resolutions[0].resolution).toContain('Research Agent');
    });

    it('should resolve divergence using averaging', () => {
      const resolveConflicts = (supervisorGraph as any).resolveConflicts.bind(supervisorGraph);
      
      const conflicts = [{
        type: 'divergence',
        agents: ['agent1', 'agent2'],
        details: 'High confidence divergence',
      }];
      
      const state = createMockState();
      const resolutions = resolveConflicts(conflicts, state);
      
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].method).toBe('averaging');
      expect(resolutions[0].resolution).toContain('weighted average');
    });

    it('should escalate when agents have no priority', () => {
      const resolveConflicts = (supervisorGraph as any).resolveConflicts.bind(supervisorGraph);
      
      const conflicts = [{
        type: 'contradiction',
        agents: ['unknown1', 'unknown2'],
        details: 'Contradiction detected',
      }];
      
      const state = createMockState({
        availableAgents: [
          { id: 'unknown1', name: 'Agent 1', description: 'Test' },
          { id: 'unknown2', name: 'Agent 2', description: 'Test' },
        ],
      });
      
      const resolutions = resolveConflicts(conflicts, state);
      
      expect(resolutions[0].method).toBe('escalation');
      expect(resolutions[0].resolution).toContain('human intervention');
    });
  });

  describe('Weighted Agreement Calculation', () => {
    it('should calculate weighted agreement based on priority and confidence', () => {
      const calculateWeightedAgreement = (supervisorGraph as any).calculateWeightedAgreement.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: { value: 'consensus' }, confidence: 0.9 },
        { agentId: 'agent2', taskId: 'task2', output: { value: 'consensus' }, confidence: 0.8 },
        { agentId: 'agent3', taskId: 'task3', output: { value: 'different' }, confidence: 0.3 },
      ];
      
      const state = createMockState();
      const agreement = calculateWeightedAgreement(results, state);
      
      expect(agreement).toBeGreaterThan(0);
      expect(agreement).toBeLessThanOrEqual(100);
    });

    it('should handle empty results', () => {
      const calculateWeightedAgreement = (supervisorGraph as any).calculateWeightedAgreement.bind(supervisorGraph);
      
      const results: AgentResult[] = [];
      const state = createMockState();
      const agreement = calculateWeightedAgreement(results, state);
      
      expect(agreement).toBe(0);
    });

    it('should handle single result', () => {
      const calculateWeightedAgreement = (supervisorGraph as any).calculateWeightedAgreement.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'result', confidence: 0.9 },
      ];
      
      const state = createMockState();
      const agreement = calculateWeightedAgreement(results, state);
      
      expect(agreement).toBe(100);
    });
  });

  describe('Collaborative Refinement', () => {
    it('should refine results using high-confidence inputs', () => {
      const collaborativeRefinement = (supervisorGraph as any).collaborativeRefinement.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { 
          agentId: 'agent1', 
          taskId: 'task1', 
          output: { data: 'base' }, 
          confidence: 0.6,
        },
        { 
          agentId: 'agent2', 
          taskId: 'task2', 
          output: { data: 'refined' }, 
          confidence: 0.85,
          reasoning: 'High quality analysis',
        },
        { 
          agentId: 'agent3', 
          taskId: 'task3', 
          output: { data: 'more refined' }, 
          confidence: 0.9,
          reasoning: 'Expert validation',
        },
      ];
      
      const votingResult = { winner: { data: 'base' } };
      const refined = collaborativeRefinement(results, votingResult);
      
      expect(refined).toBeDefined();
      expect(refined.reasoning).toContain('Expert validation');
      expect(refined.reasoning).toContain('High quality analysis');
    });

    it('should handle non-object outputs gracefully', () => {
      const collaborativeRefinement = (supervisorGraph as any).collaborativeRefinement.bind(supervisorGraph);
      
      const results: AgentResult[] = [
        { agentId: 'agent1', taskId: 'task1', output: 'string_output', confidence: 0.8 },
      ];
      
      const votingResult = { winner: 'string_output' };
      const refined = collaborativeRefinement(results, votingResult);
      
      expect(refined).toBe('string_output');
    });
  });

  describe('Resource Allocation', () => {
    it('should allocate resources based on agent type', () => {
      const allocateResources = (supervisorGraph as any).allocateResources.bind(supervisorGraph);
      
      const state = createMockState();
      const allocation = allocateResources(state);
      
      expect(allocation.get('agent1')).toContain('database-access');
      expect(allocation.get('agent1')).toContain('external-services');
      expect(allocation.get('agent2')).toContain('memory-store');
      expect(allocation.get('agent3')).toContain('file-system');
    });

    it('should allocate additional resources for high-priority agents', () => {
      const allocateResources = (supervisorGraph as any).allocateResources.bind(supervisorGraph);
      
      const state = createMockState({
        availableAgents: [
          {
            id: 'high-priority',
            name: 'Priority Agent',
            description: 'High priority agent',
            type: 'analyzer',
            priority: 10,
          },
        ],
      });
      
      const allocation = allocateResources(state);
      
      expect(allocation.get('high-priority')).toContain('api-calls');
    });
  });

  describe('Task Prioritization', () => {
    it('should prioritize tasks by multiple criteria', () => {
      const prioritizeTasks = (supervisorGraph as any).prioritizeTasks.bind(supervisorGraph);
      
      const state = createMockState({
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'agent1',
            description: 'Low priority task',
            priority: 'low',
            status: 'pending',
            dependencies: ['dep1', 'dep2'],
          },
          {
            taskId: 'task2',
            agentId: 'agent2',
            description: 'High priority task',
            priority: 'high',
            status: 'pending',
            dependencies: [],
          },
          {
            taskId: 'task3',
            agentId: 'agent3',
            description: 'Medium priority in-progress',
            priority: 'medium',
            status: 'in-progress',
            dependencies: [],
          },
        ],
      });
      
      const consensus = { results: new Map(), agreement: 70 };
      const prioritized = prioritizeTasks(state, consensus);
      
      expect(prioritized[0].taskId).toBe('task2'); // High priority, no deps
      expect(prioritized[1].taskId).toBe('task3'); // Medium but in-progress
      expect(prioritized[2].taskId).toBe('task1'); // Low priority with deps
    });

    it('should consider agent confidence in prioritization', () => {
      const prioritizeTasks = (supervisorGraph as any).prioritizeTasks.bind(supervisorGraph);
      
      const state = createMockState({
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'agent1',
            description: 'Task 1',
            priority: 'medium',
            status: 'pending',
          },
          {
            taskId: 'task2',
            agentId: 'agent2',
            description: 'Task 2',
            priority: 'medium',
            status: 'pending',
          },
        ],
        agentResults: [
          { agentId: 'agent1', taskId: 'task1', output: 'result', confidence: 0.5 },
          { agentId: 'agent2', taskId: 'task2', output: 'result', confidence: 0.9 },
        ],
      });
      
      const consensus = { results: new Map(), agreement: 70 };
      const prioritized = prioritizeTasks(state, consensus);
      
      expect(prioritized[0].taskId).toBe('task2'); // Higher confidence
    });
  });

  describe('Coordination Strategy', () => {
    it('should select decentralized strategy for high agreement', () => {
      const determineCoordinationStrategy = (supervisorGraph as any).determineCoordinationStrategy.bind(supervisorGraph);
      
      const state = createMockState();
      const strategy = determineCoordinationStrategy(state, 85);
      
      expect(strategy).toBe('decentralized-autonomous');
    });

    it('should select hybrid strategy for medium agreement', () => {
      const determineCoordinationStrategy = (supervisorGraph as any).determineCoordinationStrategy.bind(supervisorGraph);
      
      const state = createMockState();
      const strategy = determineCoordinationStrategy(state, 65);
      
      expect(strategy).toBe('hybrid-supervised');
    });

    it('should select centralized strategy for low agreement', () => {
      const determineCoordinationStrategy = (supervisorGraph as any).determineCoordinationStrategy.bind(supervisorGraph);
      
      const state = createMockState();
      const strategy = determineCoordinationStrategy(state, 30);
      
      expect(strategy).toBe('centralized-controlled');
    });
  });

  describe('Consensus Building Integration', () => {
    it('should build comprehensive consensus from agent results', async () => {
      const buildConsensus = (supervisorGraph as any).buildConsensus.bind(supervisorGraph);
      
      const state = createMockState({
        agentResults: [
          { 
            agentId: 'agent1', 
            taskId: 'task1', 
            output: { decision: 'approve' }, 
            confidence: 0.85,
            reasoning: 'Strong evidence',
          },
          { 
            agentId: 'agent2', 
            taskId: 'task2', 
            output: { decision: 'approve' }, 
            confidence: 0.75,
            reasoning: 'Good analysis',
          },
          { 
            agentId: 'agent3', 
            taskId: 'task3', 
            output: { decision: 'reject' }, 
            confidence: 0.4,
            reasoning: 'Concerns identified',
          },
        ],
      });
      
      const consensus = await buildConsensus(state);
      
      expect(consensus.results).toBeDefined();
      expect(consensus.agreement).toBeGreaterThan(0);
      expect(consensus.results.get('votingResult')).toBeDefined();
      expect(consensus.results.get('conflicts')).toBeDefined();
      expect(consensus.results.get('resolutions')).toBeDefined();
      expect(consensus.results.get('refinedResult')).toBeDefined();
      expect(consensus.results.get('consensusStrategy')).toBeDefined();
    });

    it('should handle unanimous consensus', async () => {
      const buildConsensus = (supervisorGraph as any).buildConsensus.bind(supervisorGraph);
      
      const state = createMockState({
        agentResults: [
          { agentId: 'agent1', taskId: 'task1', output: 'unanimous', confidence: 0.95 },
          { agentId: 'agent2', taskId: 'task2', output: 'unanimous', confidence: 0.92 },
          { agentId: 'agent3', taskId: 'task3', output: 'unanimous', confidence: 0.91 },
        ],
      });
      
      const consensus = await buildConsensus(state);
      
      expect(consensus.results.get('consensusStrategy')).toBe('unanimous');
      expect(consensus.results.get('conflicts')).toHaveLength(0);
    });
  });

  describe('Coordination Protocols Integration', () => {
    it('should apply full coordination protocols', async () => {
      const applyCoordinationProtocols = (supervisorGraph as any).applyCoordinationProtocols.bind(supervisorGraph);
      
      const state = createMockState({
        agentTasks: [
          {
            taskId: 'task1',
            agentId: 'agent1',
            description: 'Research task',
            priority: 'high',
            status: 'pending',
          },
          {
            taskId: 'task2',
            agentId: 'agent2',
            description: 'Analysis task',
            priority: 'medium',
            status: 'in-progress',
          },
        ],
      });
      
      const consensus = { results: new Map(), agreement: 75 };
      const coordination = await applyCoordinationProtocols(state, consensus);
      
      expect(coordination.resourceAllocation).toBeDefined();
      expect(coordination.taskPrioritization).toBeDefined();
      expect(coordination.coordinationStrategy).toBe('hybrid-supervised');
      expect(coordination.resourceAllocation.size).toBe(3);
      expect(coordination.taskPrioritization).toHaveLength(2);
    });

    it('should adapt coordination to consensus levels', async () => {
      const applyCoordinationProtocols = (supervisorGraph as any).applyCoordinationProtocols.bind(supervisorGraph);
      
      const highConsensusState = createMockState();
      const highConsensus = { results: new Map(), agreement: 90 };
      const highCoordination = await applyCoordinationProtocols(highConsensusState, highConsensus);
      
      const lowConsensusState = createMockState();
      const lowConsensus = { results: new Map(), agreement: 30 };
      const lowCoordination = await applyCoordinationProtocols(lowConsensusState, lowConsensus);
      
      expect(highCoordination.coordinationStrategy).toBe('decentralized-autonomous');
      expect(lowCoordination.coordinationStrategy).toBe('centralized-controlled');
    });
  });
});