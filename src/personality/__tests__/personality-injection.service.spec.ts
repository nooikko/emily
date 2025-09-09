import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';
import { ConditionalPromptSelector } from '@langchain/core/example_selectors';
import { PersonalityInjectionService, PersonalityInjectionContext, ConditionalPersonalityConfig } from '../services/personality-injection.service';
import { PersonalityProfileService } from '../services/personality-profile.service';
import { PersonalityTemplateService } from '../services/personality-template.service';
import { PersonalityProfile, PersonalityTrait, PersonalityPromptTemplate, PersonalityExample } from '../entities/personality-profile.entity';
import type { CompiledPersonalityTemplate } from '../interfaces/personality.interface';

describe('PersonalityInjectionService', () => {
  let service: PersonalityInjectionService;
  let personalityService: jest.Mocked<PersonalityProfileService>;
  let templateService: jest.Mocked<PersonalityTemplateService>;

  // Test data
  const mockPersonalityId = 'test-personality-123';
  const mockPersonalityProfile: PersonalityProfile = {
    id: mockPersonalityId,
    name: 'Helpful Assistant',
    description: 'A friendly and helpful AI assistant',
    category: 'assistant',
    tags: ['helpful', 'friendly'],
    isActive: true,
    isSystemPersonality: false,
    version: 1,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    traits: [
      {
        name: 'communication_style',
        value: 'friendly',
        weight: 0.8,
        description: 'Friendly communication style'
      },
      {
        name: 'tone',
        value: 'professional',
        weight: 0.7,
        description: 'Professional tone'
      }
    ] as PersonalityTrait[],
    promptTemplates: [
      {
        type: 'system',
        template: 'You are a {communication_style} assistant with a {tone} tone.',
        inputVariables: ['communication_style', 'tone'],
        priority: 1,
      }
    ] as PersonalityPromptTemplate[],
    examples: [
      {
        input: 'Hello',
        output: 'Hello! How can I help you today?',
        metadata: { includeInFewShot: true }
      }
    ] as PersonalityExample[],
    getSystemPromptTemplate: jest.fn(),
    getFewShotExamples: jest.fn(),
    getTraitValue: jest.fn(),
    getTraitWeight: jest.fn(),
    meetsConditions: jest.fn(),
    validate: jest.fn(),
  };

  const mockCompiledTemplate: CompiledPersonalityTemplate = {
    systemTemplate: PromptTemplate.fromTemplate('You are a {communication_style} assistant with a {tone} tone.'),
    metadata: {
      personalityId: mockPersonalityId,
      personalityName: 'Helpful Assistant',
      compiledAt: new Date(),
      templateVersion: 1,
    }
  };

  beforeEach(async () => {
    const mockPersonalityService = {
      findOne: jest.fn(),
      getCurrentPersonality: jest.fn(),
      findAll: jest.fn(),
      validatePersonality: jest.fn(),
    };

    const mockTemplateService = {
      compilePersonalityTemplates: jest.fn(),
      validatePersonalityConfiguration: jest.fn(),
      createPromptTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalityInjectionService,
        {
          provide: PersonalityProfileService,
          useValue: mockPersonalityService,
        },
        {
          provide: PersonalityTemplateService,
          useValue: mockTemplateService,
        },
      ],
    }).compile();

    service = module.get<PersonalityInjectionService>(PersonalityInjectionService);
    personalityService = module.get(PersonalityProfileService) as jest.Mocked<PersonalityProfileService>;
    templateService = module.get(PersonalityTemplateService) as jest.Mocked<PersonalityTemplateService>;

    // Setup default mocks
    personalityService.findOne.mockResolvedValue(mockPersonalityProfile);
    templateService.compilePersonalityTemplates.mockResolvedValue(mockCompiledTemplate);
    personalityService.validatePersonality.mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearInjectionCache();
  });

  describe('injectPersonality', () => {
    it('should inject personality into a basic prompt', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Tell me about AI',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'friendly',
          tone: 'professional',
        },
      };

      const result = await service.injectPersonality(context);

      expect(result).toBeDefined();
      expect(result.enhancedPrompt).toContain('You are a friendly assistant with a professional tone');
      expect(result.enhancedPrompt).toContain('Tell me about AI');
      expect(result.personalityTemplate).toEqual(mockCompiledTemplate);
      expect(result.injectionMetadata.personalityId).toBe(mockPersonalityId);
      expect(result.injectionMetadata.personalityName).toBe('Helpful Assistant');
      expect(result.injectionMetadata.injectionType).toBe('system');
    });

    it('should use current active personality when no personalityId provided', async () => {
      personalityService.getCurrentPersonality.mockResolvedValue(mockCompiledTemplate);

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Help me with coding',
        contextVariables: {
          communication_style: 'technical',
          tone: 'helpful',
        },
      };

      const result = await service.injectPersonality(context);

      expect(personalityService.getCurrentPersonality).toHaveBeenCalled();
      expect(result.injectionMetadata.personalityId).toBe(mockPersonalityId);
    });

    it('should handle conversation history in context merge mode', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Continue our discussion',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'conversational',
          tone: 'friendly',
        },
        conversationHistory: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date(),
          },
          {
            role: 'assistant',
            content: 'Hi there! How can I help?',
            timestamp: new Date(),
          },
        ],
      };

      const result = await service.injectPersonality(context);

      expect(result.injectionMetadata.injectionType).toBe('context_merge');
      expect(result.enhancedPrompt).toContain('user: Hello');
      expect(result.enhancedPrompt).toContain('assistant: Hi there!');
    });

    it('should apply conditional logic when conditions are provided', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Explain quantum computing',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'technical',
          tone: 'educational',
        },
        conditions: {
          technical_mode: true,
          formal_mode: false,
        },
      };

      const result = await service.injectPersonality(context);

      expect(result.injectionMetadata.injectionType).toBe('conditional');
      expect(result.enhancedPrompt).toContain('Provide technical details and explanations');
    });

    it('should cache injection results for performance', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test caching',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'efficient',
          tone: 'direct',
        },
      };

      // First call
      const result1 = await service.injectPersonality(context);
      
      // Second call with same context
      const result2 = await service.injectPersonality(context);

      expect(result1.cacheKey).toBe(result2.cacheKey);
      expect(personalityService.findOne).toHaveBeenCalledTimes(1); // Only called once due to caching
      expect(templateService.compilePersonalityTemplates).toHaveBeenCalledTimes(1);
    });

    it('should fallback to any available personality when none specified and none active', async () => {
      personalityService.getCurrentPersonality.mockResolvedValue(null);
      personalityService.findAll.mockResolvedValue([mockPersonalityProfile]);

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Fallback test',
        contextVariables: {
          communication_style: 'fallback',
          tone: 'neutral',
        },
      };

      const result = await service.injectPersonality(context);

      expect(personalityService.findAll).toHaveBeenCalled();
      expect(result.injectionMetadata.personalityId).toBe(mockPersonalityId);
    });

    it('should throw error when no personalities are available', async () => {
      personalityService.getCurrentPersonality.mockResolvedValue(null);
      personalityService.findAll.mockResolvedValue([]);

      const context: PersonalityInjectionContext = {
        originalPrompt: 'No personalities available',
        contextVariables: {},
      };

      await expect(service.injectPersonality(context)).rejects.toThrow('No personalities available for injection');
    });
  });

  describe('createConditionalPersonalitySelector', () => {
    it('should create conditional selector with rules', async () => {
      const config: ConditionalPersonalityConfig = {
        defaultPersonalityId: mockPersonalityId,
        conditionalRules: [
          {
            condition: (llm) => true,
            personalityId: mockPersonalityId,
            priority: 10,
          },
          {
            condition: (llm) => false,
            personalityId: mockPersonalityId,
            priority: 5,
          },
        ],
      };

      const selector = await service.createConditionalPersonalitySelector(config);

      expect(selector).toBeInstanceOf(ConditionalPromptSelector);
      expect(personalityService.findOne).toHaveBeenCalledTimes(3); // Default + 2 rules
      expect(templateService.compilePersonalityTemplates).toHaveBeenCalledTimes(3);
    });

    it('should sort conditional rules by priority', async () => {
      const config: ConditionalPersonalityConfig = {
        defaultPersonalityId: mockPersonalityId,
        conditionalRules: [
          {
            condition: (llm) => true,
            personalityId: mockPersonalityId,
            priority: 1,
          },
          {
            condition: (llm) => false,
            personalityId: mockPersonalityId,
            priority: 10,
          },
        ],
      };

      await service.createConditionalPersonalitySelector(config);

      // Higher priority rule should be processed first
      expect(personalityService.findOne).toHaveBeenCalledWith(mockPersonalityId);
    });
  });

  describe('mergePersonalityContext', () => {
    it('should merge personality context with conversation prompt', async () => {
      const conversationPrompt = 'What is machine learning?';
      const context = {
        personality: {
          id: mockPersonalityId,
          name: 'Helpful Assistant',
          traits: mockPersonalityProfile.traits,
          category: 'assistant',
          tags: ['helpful'],
        },
        contextVariables: {
          communication_style: 'educational',
          tone: 'informative',
        },
        conversationHistory: [
          {
            role: 'user' as const,
            content: 'Hello',
            timestamp: new Date(),
          },
        ],
      };

      const result = await service.mergePersonalityContext(
        mockPersonalityId,
        conversationPrompt,
        context
      );

      expect(result).toContain('Helpful Assistant');
      expect(result).toContain('What is machine learning?');
      expect(result).toContain('user: Hello');
      expect(personalityService.findOne).toHaveBeenCalledWith(mockPersonalityId);
      expect(templateService.compilePersonalityTemplates).toHaveBeenCalled();
    });

    it('should handle empty conversation history', async () => {
      const context = {
        personality: {
          id: mockPersonalityId,
          name: 'Helpful Assistant',
          traits: mockPersonalityProfile.traits,
          category: 'assistant',
          tags: ['helpful'],
        },
        contextVariables: {
          communication_style: 'direct',
          tone: 'professional',
        },
      };

      const result = await service.mergePersonalityContext(
        mockPersonalityId,
        'Simple question',
        context
      );

      expect(result).toContain('No previous conversation');
    });
  });

  describe('createPersonalityChatTemplate', () => {
    it('should create personality-aware chat template', async () => {
      mockPersonalityProfile.getFewShotExamples = jest.fn().mockReturnValue([
        { input: 'Hi', output: 'Hello! How can I help?' }
      ]);

      const chatTemplate = await service.createPersonalityChatTemplate(mockPersonalityId);

      expect(chatTemplate).toBeInstanceOf(ChatPromptTemplate);
      expect(personalityService.findOne).toHaveBeenCalledWith(mockPersonalityId);
      expect(templateService.compilePersonalityTemplates).toHaveBeenCalled();
    });

    it('should include personality traits in chat template', async () => {
      mockPersonalityProfile.getFewShotExamples = jest.fn().mockReturnValue([]);

      const chatTemplate = await service.createPersonalityChatTemplate(mockPersonalityId);

      // Test that the template contains personality information
      expect(chatTemplate).toBeDefined();
      expect(personalityService.findOne).toHaveBeenCalledWith(mockPersonalityId);
    });
  });

  describe('generateConditionalPersonalityPrompt', () => {
    it('should generate conditional personality prompt', async () => {
      // Setup findAll to return personalities for selector
      personalityService.findAll.mockResolvedValue([mockPersonalityProfile]);
      
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test conditional prompt',
        contextVariables: {
          mode: 'technical',
          communication_style: 'precise',
          tone: 'expert',
        },
      };

      const config: ConditionalPersonalityConfig = {
        defaultPersonalityId: mockPersonalityId,
        conditionalRules: [
          {
            condition: (llm) => true, // Always true for testing
            personalityId: mockPersonalityId,
            priority: 10,
          },
        ],
      };

      const result = await service.generateConditionalPersonalityPrompt(context, config);

      expect(result).toBeDefined();
      expect(result.enhancedPrompt).toContain('Test conditional prompt');
    });
  });

  describe('validateInjectionContext', () => {
    it('should validate valid injection context', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Valid prompt',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'friendly',
          tone: 'helpful',
        },
      };

      const validation = await service.validateInjectionContext(context);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing original prompt', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: '',
        contextVariables: {},
      };

      const validation = await service.validateInjectionContext(context);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Original prompt is required');
    });

    it('should warn about missing context variables', async () => {
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test prompt',
        contextVariables: {},
      };

      const validation = await service.validateInjectionContext(context);

      expect(validation.warnings).toContain('No context variables provided - personality injection may be limited');
      expect(validation.warnings).toContain('Recommended context variables missing: communication_style, tone');
    });

    it('should validate personality ID', async () => {
      personalityService.findOne.mockRejectedValue(new Error('Personality not found'));

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test prompt',
        personalityId: 'invalid-id',
        contextVariables: {},
      };

      const validation = await service.validateInjectionContext(context);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid personality ID: invalid-id');
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', () => {
      const stats = service.getInjectionCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('selectorsCount');
    });

    it('should clear cache properly', () => {
      service.clearInjectionCache();
      
      const stats = service.getInjectionCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.selectorsCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle personality service errors gracefully', async () => {
      personalityService.findOne.mockRejectedValue(new Error('Database error'));

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test error handling',
        personalityId: 'error-personality',
        contextVariables: {},
      };

      await expect(service.injectPersonality(context)).rejects.toThrow('Database error');
    });

    it('should handle template compilation errors', async () => {
      templateService.compilePersonalityTemplates.mockRejectedValue(new Error('Template error'));

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test template error',
        personalityId: mockPersonalityId,
        contextVariables: {},
      };

      await expect(service.injectPersonality(context)).rejects.toThrow('Template error');
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large prompts efficiently', async () => {
      const largePrompt = 'A'.repeat(10000);
      
      const context: PersonalityInjectionContext = {
        originalPrompt: largePrompt,
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'concise',
          tone: 'efficient',
        },
      };

      const result = await service.injectPersonality(context);

      expect(result.enhancedPrompt).toContain(largePrompt);
      expect(result.injectionMetadata).toBeDefined();
    });

    it('should handle empty context variables gracefully', async () => {
      // Update mock template to not require specific variables
      const mockTemplateWithoutVars: CompiledPersonalityTemplate = {
        systemTemplate: PromptTemplate.fromTemplate('You are a helpful assistant. User input: {user_input}'),
        metadata: {
          personalityId: mockPersonalityId,
          personalityName: 'Helpful Assistant',
          compiledAt: new Date(),
          templateVersion: 1,
        }
      };
      templateService.compilePersonalityTemplates.mockResolvedValueOnce(mockTemplateWithoutVars);
      
      const context: PersonalityInjectionContext = {
        originalPrompt: 'Test empty context',
        personalityId: mockPersonalityId,
        contextVariables: {},
      };

      const result = await service.injectPersonality(context);

      expect(result).toBeDefined();
      expect(result.enhancedPrompt).toContain('Test empty context');
    });

    it('should handle long conversation history', async () => {
      const longHistory = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `Message ${i}`,
        timestamp: new Date(),
      }));

      const context: PersonalityInjectionContext = {
        originalPrompt: 'Continue conversation',
        personalityId: mockPersonalityId,
        contextVariables: {
          communication_style: 'patient',
          tone: 'understanding',
        },
        conversationHistory: longHistory,
      };

      const result = await service.injectPersonality(context);

      expect(result.injectionMetadata.injectionType).toBe('context_merge');
      expect(result.enhancedPrompt).toBeDefined();
    });
  });
});