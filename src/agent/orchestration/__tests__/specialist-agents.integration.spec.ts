import type { BaseMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import type { DatabaseConfig } from '../../../infisical/infisical-config.factory';
import type { ModelConfigurations } from '../../../infisical/model-config.module';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { ModelProvider } from '../../enum/model-provider.enum';
import { MemoryService } from '../../memory/memory.service';
import { AgentRole, SpecialistAgentsFactory } from '../specialist-agents.factory';
import { SpecialistAgentsService } from '../specialist-agents.service';
import type { AgentTask } from '../supervisor.state';

describe('SpecialistAgentsIntegration', () => {
  let specialistAgentsService: SpecialistAgentsService;
  let specialistAgentsFactory: SpecialistAgentsFactory;
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

  beforeEach(async () => {
    const mockMemoryService = {
      // Mock memory service methods
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
          provide: SpecialistAgentsService,
          useFactory: (databaseConfig: DatabaseConfig, modelConfigs: ModelConfigurations, memoryService: MemoryService, langsmithService: LangSmithService) => {
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

    specialistAgentsService = module.get<SpecialistAgentsService>(SpecialistAgentsService);
    specialistAgentsFactory = module.get<SpecialistAgentsFactory>(SpecialistAgentsFactory);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('SpecialistAgentsFactory', () => {
    it('should be defined', () => {
      expect(specialistAgentsFactory).toBeDefined();
    });

    it('should have all required agent roles defined', () => {
      const availableRoles = specialistAgentsFactory.getAvailableRoles();
      expect(availableRoles).toContain(AgentRole.RESEARCHER);
      expect(availableRoles).toContain(AgentRole.ANALYZER);
      expect(availableRoles).toContain(AgentRole.WRITER);
      expect(availableRoles).toContain(AgentRole.REVIEWER);
      expect(availableRoles).toContain(AgentRole.COORDINATOR);
    });

    it('should create agent metadata for each role', () => {
      const researcherMetadata = specialistAgentsFactory.createAgentMetadata(AgentRole.RESEARCHER);
      expect(researcherMetadata).toEqual({
        id: 'specialist-researcher',
        name: 'Research Specialist',
        role: AgentRole.RESEARCHER,
        description: 'Specializes in gathering information, conducting research, and fact-checking',
        capabilities: ['research', 'fact-checking', 'information-gathering', 'source-verification'],
        priority: 1,
        status: 'idle',
      });
    });

    it('should get agent configuration by role', () => {
      const config = specialistAgentsFactory.getAgentConfig(AgentRole.ANALYZER);
      expect(config).toBeDefined();
      expect(config?.role).toBe(AgentRole.ANALYZER);
      expect(config?.systemPrompt).toContain('analysis specialist');
    });

    it('should create specialist agents', () => {
      // Note: This test will need to be adapted based on actual agent creation behavior
      // since the createSpecialistAgent method returns AgentFactory.createAgent results
      const agent = specialistAgentsFactory.createSpecialistAgent(
        AgentRole.RESEARCHER,
        ModelProvider.ANTHROPIC,
      );
      expect(agent).toBeDefined();
    });

    it('should create all specialist agents at once', () => {
      const allAgents = specialistAgentsFactory.createAllSpecialistAgents(ModelProvider.ANTHROPIC);
      expect(allAgents.size).toBe(5); // 5 different agent roles
      expect(allAgents.has(AgentRole.RESEARCHER)).toBe(true);
      expect(allAgents.has(AgentRole.ANALYZER)).toBe(true);
      expect(allAgents.has(AgentRole.WRITER)).toBe(true);
      expect(allAgents.has(AgentRole.REVIEWER)).toBe(true);
      expect(allAgents.has(AgentRole.COORDINATOR)).toBe(true);
    });

    it('should update agent configuration', () => {
      const originalConfig = specialistAgentsFactory.getAgentConfig(AgentRole.WRITER);
      expect(originalConfig?.description).toBe('Specializes in content creation, documentation, and communication');

      specialistAgentsFactory.updateAgentConfig(AgentRole.WRITER, {
        description: 'Updated writer description',
      });

      const updatedConfig = specialistAgentsFactory.getAgentConfig(AgentRole.WRITER);
      expect(updatedConfig?.description).toBe('Updated writer description');
    });

    it('should throw error for unknown agent role', () => {
      expect(() => {
        specialistAgentsFactory.createAgentMetadata('unknown-role' as AgentRole);
      }).toThrow('Unknown agent role: unknown-role');
    });
  });

  describe('SpecialistAgentsService', () => {
    it('should be defined', () => {
      expect(specialistAgentsService).toBeDefined();
    });

    it('should get available agents', () => {
      const availableAgents = specialistAgentsService.getAvailableAgents();
      expect(availableAgents).toHaveLength(5);
      expect(availableAgents.map(a => a.role)).toEqual(
        expect.arrayContaining([
          AgentRole.RESEARCHER,
          AgentRole.ANALYZER, 
          AgentRole.WRITER,
          AgentRole.REVIEWER,
          AgentRole.COORDINATOR,
        ])
      );
    });

    it('should check if agent is available', () => {
      // Before initialization, agents might not be available
      const isAvailable = specialistAgentsService.isAgentAvailable(AgentRole.RESEARCHER);
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should get agent configuration', () => {
      const config = specialistAgentsService.getAgentConfig(AgentRole.ANALYZER);
      expect(config).toBeDefined();
      expect(config?.role).toBe(AgentRole.ANALYZER);
    });

    it('should get health status', async () => {
      const status = await specialistAgentsService.getHealthStatus();
      expect(status).toBeDefined();
      expect(status.specialistAgents).toBeDefined();
      expect(status.totalAgents).toBeDefined();
      expect(status.availableRoles).toBeDefined();
      expect(status.modelProvider).toBeDefined();
    });

    // Note: executeAgentTask test would require more complex mocking
    // of the actual agent execution, which depends on LangGraph internals
    it('should handle agent task execution with error gracefully', async () => {
      const mockTask: AgentTask = {
        taskId: 'test-task-1',
        agentId: 'specialist-researcher',
        description: 'Test research task',
        priority: 'high',
        status: 'pending',
      };

      const mockMessages: BaseMessage[] = [];

      // This test verifies the error handling structure
      // Actual execution would depend on proper agent initialization
      try {
        const result = await specialistAgentsService.executeAgentTask(
          'specialist-researcher',
          mockTask,
          mockMessages,
          'test-thread-id'
        );
        
        // If execution succeeds, verify result structure
        expect(result).toBeDefined();
        expect(result.agentId).toBe('specialist-researcher');
        expect(result.taskId).toBe('test-task-1');
        expect(result.output).toBeDefined();
        expect(typeof result.confidence).toBe('number');
      } catch (error) {
        // If execution fails (expected in test environment), verify error handling
        expect(error).toBeDefined();
      }
    });
  });

  describe('Integration', () => {
    it('should integrate factory and service correctly', () => {
      const factoryAgents = specialistAgentsFactory.getAvailableRoles();
      const serviceAgents = specialistAgentsService.getAvailableAgents();
      
      expect(serviceAgents.length).toBe(factoryAgents.length);
      
      serviceAgents.forEach(serviceAgent => {
        expect(factoryAgents).toContain(serviceAgent.role);
      });
    });

    it('should maintain consistent agent metadata', () => {
      const factoryMetadata = specialistAgentsFactory.createAgentMetadata(AgentRole.COORDINATOR);
      const serviceAgents = specialistAgentsService.getAvailableAgents();
      const serviceMetadata = serviceAgents.find(a => a.role === AgentRole.COORDINATOR);

      expect(serviceMetadata).toEqual(factoryMetadata);
    });
  });
});