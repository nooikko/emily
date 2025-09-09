import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonalityHubIntegrationService } from '../services/personality-hub-integration.service';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { UserPersonalityPreference } from '../entities/user-personality-preference.entity';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';

// Mock repositories
const mockPersonalityRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
};

const mockPreferenceRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
};

// Mock LangChain hub pull function
jest.mock('langchain/hub', () => ({
  pull: jest.fn(),
}));

import { pull } from 'langchain/hub';
const mockPull = pull as jest.MockedFunction<typeof pull>;

describe('PersonalityHubIntegrationService', () => {
  let service: PersonalityHubIntegrationService;
  let personalityRepository: Repository<PersonalityProfile>;
  let preferenceRepository: Repository<UserPersonalityPreference>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalityHubIntegrationService,
        {
          provide: getRepositoryToken(PersonalityProfile),
          useValue: mockPersonalityRepository,
        },
        {
          provide: getRepositoryToken(UserPersonalityPreference),
          useValue: mockPreferenceRepository,
        },
      ],
    }).compile();

    service = module.get<PersonalityHubIntegrationService>(PersonalityHubIntegrationService);
    personalityRepository = module.get<Repository<PersonalityProfile>>(
      getRepositoryToken(PersonalityProfile)
    );
    preferenceRepository = module.get<Repository<UserPersonalityPreference>>(
      getRepositoryToken(UserPersonalityPreference)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchHubTemplates', () => {
    it('should return filtered templates based on search criteria', async () => {
      // Act
      const results = await service.searchHubTemplates({
        query: 'coding',
        category: 'technical',
        minRating: 4.5,
        limit: 2,
      });

      // Assert
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(t => t.category === 'technical')).toBe(true);
      expect(results.every(t => (t.usageStats?.rating || 0) >= 4.5)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter templates by tags', async () => {
      // Act
      const results = await service.searchHubTemplates({
        tags: ['coding', 'debugging'],
        limit: 5,
      });

      // Assert
      expect(results).toBeDefined();
      results.forEach(template => {
        const hasMatchingTag = template.tags?.some(tag => 
          ['coding', 'debugging'].includes(tag)
        );
        expect(hasMatchingTag).toBe(true);
      });
    });

    it('should sort templates by different criteria', async () => {
      // Test popularity sorting
      const popularityResults = await service.searchHubTemplates({
        sortBy: 'popularity',
      });

      expect(popularityResults).toBeDefined();
      
      // Test rating sorting
      const ratingResults = await service.searchHubTemplates({
        sortBy: 'rating',
      });

      expect(ratingResults).toBeDefined();
      
      // Test recent sorting
      const recentResults = await service.searchHubTemplates({
        sortBy: 'recent',
      });

      expect(recentResults).toBeDefined();
    });

    it('should handle empty search results gracefully', async () => {
      // Act
      const results = await service.searchHubTemplates({
        query: 'nonexistent-topic-xyz',
        minRating: 5.0,
      });

      // Assert
      expect(results).toBeDefined();
      expect(results).toHaveLength(0);
    });
  });

  describe('importFromHub', () => {
    it('should successfully import a template from the hub', async () => {
      // Arrange
      const mockTemplate = PromptTemplate.fromTemplate(
        'You are a helpful coding assistant. Help the user with: {query}'
      );
      
      mockPull.mockResolvedValue(mockTemplate);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      // Act
      const result = await service.importFromHub(
        'langchain-community/coding-assistant',
        {
          customName: 'My Coding Assistant',
          customCategory: 'development',
          additionalTags: ['imported', 'custom'],
        }
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.personality).toBeDefined();
      expect(result.personality.name).toBe('My Coding Assistant');
      expect(result.personality.category).toBe('development');
      expect(result.personality.tags).toContain('imported');
      expect(result.compatibilityScore).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
      expect(result.adaptations).toBeDefined();
      expect(result.improvements).toBeDefined();
      expect(mockPull).toHaveBeenCalledWith('langchain-community/coding-assistant');
      expect(mockPersonalityRepository.save).toHaveBeenCalled();
    });

    it('should handle ChatPromptTemplate imports', async () => {
      // Arrange
      const mockChatTemplate = ChatPromptTemplate.fromMessages([
        ['system', 'You are a creative writing assistant.'],
        ['human', 'Help me write a story about: {topic}'],
      ]);
      
      mockPull.mockResolvedValue(mockChatTemplate);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      // Act
      const result = await service.importFromHub('creative-ai/writer-v2');

      // Assert
      expect(result).toBeDefined();
      expect(result.personality.promptTemplates).toHaveLength(2);
      expect(result.personality.promptTemplates[0].type).toBe('system');
      expect(result.personality.promptTemplates[1].type).toBe('user');
    });

    it('should handle import failures gracefully', async () => {
      // Arrange
      mockPull.mockRejectedValue(new Error('Template not found'));

      // Act & Assert
      await expect(service.importFromHub('invalid/template')).rejects.toThrow();
    });

    it('should apply custom adaptations during import', async () => {
      // Arrange
      const mockTemplate = PromptTemplate.fromTemplate('Generic template: {input}');
      mockPull.mockResolvedValue(mockTemplate);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      const adaptationConfig = {
        customName: 'Specialized Assistant',
        customCategory: 'specialized',
        additionalTags: ['custom', 'adapted'],
        overrideTraits: [
          {
            name: 'specialization',
            value: 'high',
            weight: 0.9,
            description: 'Highly specialized personality',
          },
        ],
      };

      // Act
      const result = await service.importFromHub('generic/template', adaptationConfig);

      // Assert
      expect(result.personality.name).toBe('Specialized Assistant');
      expect(result.personality.category).toBe('specialized');
      expect(result.personality.traits).toEqual(adaptationConfig.overrideTraits);
      expect(result.personality.tags).toEqual(expect.arrayContaining(['custom', 'adapted']));
    });
  });

  describe('exportToHub', () => {
    it('should successfully export a personality to the hub', async () => {
      // Arrange
      const mockPersonality = createMockPersonality();
      mockPersonalityRepository.findOne.mockResolvedValue(mockPersonality);

      const hubConfig = {
        hubName: 'my-assistant',
        owner: 'my-org',
        description: 'Custom AI assistant',
        tags: ['custom', 'assistant'],
        visibility: 'public' as const,
      };

      // Act
      const result = await service.exportToHub('personality-1', hubConfig);

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.hubReference).toBe('my-org/my-assistant');
      expect(result.version).toBe('1.0.0');
      expect(result.publicUrl).toContain('smith.langchain.com');
    });

    it('should handle export with sharing configuration', async () => {
      // Arrange
      const mockPersonality = createMockPersonality();
      mockPersonalityRepository.findOne.mockResolvedValue(mockPersonality);
      
      const mockPreferences = [createMockPreference()];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);

      const shareConfig = {
        includeFeedback: true,
        includeMetrics: true,
        anonymize: true,
        visibility: 'public' as const,
      };

      const hubConfig = {
        hubName: 'data-rich-assistant',
        owner: 'research-org',
        description: 'Assistant with performance data',
        tags: ['research', 'data'],
        visibility: 'public' as const,
      };

      // Act
      const result = await service.exportToHub('personality-1', hubConfig, shareConfig);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPreferenceRepository.find).toHaveBeenCalledWith({
        where: { personalityId: 'personality-1' },
      });
    });

    it('should handle non-existent personality gracefully', async () => {
      // Arrange
      mockPersonalityRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.exportToHub('non-existent', {
        hubName: 'test',
        owner: 'test',
        description: 'test',
        tags: [],
        visibility: 'private',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.messages[0]).toContain('Personality not found');
    });
  });

  describe('getPopularTemplates', () => {
    it('should return popular templates sorted by usage', async () => {
      // Act
      const popular = await service.getPopularTemplates(5);

      // Assert
      expect(popular).toBeDefined();
      expect(popular.length).toBeLessThanOrEqual(5);
      // Should be sorted by popularity (downloads)
      for (let i = 0; i < popular.length - 1; i++) {
        const current = popular[i].usageStats?.downloads || 0;
        const next = popular[i + 1].usageStats?.downloads || 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('getRecommendedTemplates', () => {
    it('should recommend templates based on user preferences', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference(),
      ];
      
      const mockPersonalities = [
        createMockPersonality(),
      ];

      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.find.mockResolvedValue(mockPersonalities);

      // Act
      const recommended = await service.getRecommendedTemplates(3);

      // Assert
      expect(recommended).toBeDefined();
      expect(recommended.length).toBeLessThanOrEqual(3);
    });

    it('should filter out similar existing personalities', async () => {
      // Arrange
      const existingPersonalities = [
        createMockPersonality('existing-1', 'coding-assistant', 'technical'),
      ];

      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.find.mockResolvedValue(existingPersonalities);

      // Act
      const recommended = await service.getRecommendedTemplates();

      // Assert
      expect(recommended).toBeDefined();
      // Should not recommend templates with names that match existing personalities
      const hasConflictingName = recommended.some(template => 
        template.hubName.includes('coding-assistant')
      );
      expect(hasConflictingName).toBe(false);
    });
  });

  describe('syncHubTemplates', () => {
    it('should sync and cache popular templates', async () => {
      // Act
      const syncResult = await service.syncHubTemplates();

      // Assert
      expect(syncResult).toBeDefined();
      expect(syncResult.cached).toBeGreaterThan(0);
      expect(syncResult.errors).toBe(0);
    });
  });

  describe('Cache Management', () => {
    it('should cache and reuse hub templates', async () => {
      // Arrange
      const mockTemplate = PromptTemplate.fromTemplate('Cached template: {input}');
      mockPull.mockResolvedValue(mockTemplate);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      // First import should call pull
      await service.importFromHub('test/template');
      expect(mockPull).toHaveBeenCalledTimes(1);

      // Second import should use cache (within timeout)
      await service.importFromHub('test/template');
      expect(mockPull).toHaveBeenCalledTimes(1); // Still only once
    });

    it('should clear cache when requested', () => {
      // Act & Assert
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle hub connection failures', async () => {
      // Arrange
      mockPull.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.importFromHub('unreachable/template')).rejects.toThrow();
    });

    it('should handle malformed templates gracefully', async () => {
      // Arrange - Return invalid template structure
      mockPull.mockResolvedValue(null as any);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      // Act
      const result = await service.importFromHub('malformed/template');

      // Assert
      expect(result).toBeDefined();
      expect(result.warnings).toContain('Could not analyze template compatibility');
    });

    it('should handle repository errors during export', async () => {
      // Arrange
      mockPersonalityRepository.findOne.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.exportToHub('personality-1', {
        hubName: 'test',
        owner: 'test',
        description: 'test',
        tags: [],
        visibility: 'private',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.messages[0]).toContain('Export failed');
    });
  });

  describe('Template Conversion', () => {
    it('should convert different template formats correctly', async () => {
      // Test PromptTemplate conversion
      const promptTemplate = PromptTemplate.fromTemplate(
        'System prompt: {system_message}\nUser: {user_input}'
      );
      mockPull.mockResolvedValue(promptTemplate);
      mockPersonalityRepository.save.mockResolvedValue(createMockPersonality());

      const result1 = await service.importFromHub('test/prompt-template');
      expect(result1.personality.promptTemplates).toHaveLength(1);
      expect(result1.personality.promptTemplates[0].type).toBe('system');

      // Test ChatPromptTemplate conversion
      const chatTemplate = ChatPromptTemplate.fromMessages([
        ['system', 'You are an assistant'],
        ['human', '{user_message}'],
        ['assistant', 'I understand'],
      ]);
      mockPull.mockResolvedValue(chatTemplate);

      const result2 = await service.importFromHub('test/chat-template');
      expect(result2.personality.promptTemplates).toHaveLength(3);
      expect(result2.personality.promptTemplates[0].type).toBe('system');
      expect(result2.personality.promptTemplates[1].type).toBe('user');
      expect(result2.personality.promptTemplates[2].type).toBe('assistant');
    });
  });
});

// Helper functions
function createMockPersonality(
  id: string = 'personality-1',
  name: string = 'Test Assistant',
  category: string = 'test'
): PersonalityProfile {
  const personality = new PersonalityProfile();
  personality.id = id;
  personality.name = name;
  personality.description = 'A test personality';
  personality.category = category;
  personality.tags = ['test'];
  personality.traits = [
    {
      name: 'helpfulness',
      value: 'high',
      weight: 0.8,
      description: 'Very helpful',
    },
  ];
  personality.promptTemplates = [
    {
      type: 'system',
      template: 'You are a helpful assistant.',
      inputVariables: [],
      priority: 1,
    },
  ];
  personality.examples = [
    {
      input: 'Hello',
      output: 'Hi there!',
      metadata: {},
    },
  ];
  personality.isActive = true;
  personality.isSystemPersonality = false;
  personality.metadata = {};
  personality.version = 1;
  personality.createdAt = new Date();
  personality.updatedAt = new Date();

  return personality;
}

function createMockPreference(): UserPersonalityPreference {
  const preference = new UserPersonalityPreference();
  preference.id = 'pref-1';
  preference.personalityId = 'personality-1';
  preference.interactionContext = 'technical' as any;
  preference.preferenceScore = 0.8;
  preference.interactionCount = 10;
  preference.feedback = [
    {
      type: 'rating' as any,
      score: 4,
      comment: 'Great performance',
    },
  ];
  preference.interactionPatterns = {
    averageMessageLength: 150,
    complexityPreference: 4,
    communicationStyle: 'technical',
    engagementMetrics: {
      followUpQuestions: 3,
      conversationDuration: 20,
      topicChanges: 2,
      satisfactionIndicators: 2,
    },
  };
  preference.contextualPerformance = [];
  preference.explicitPreferences = {};
  preference.learningConfidence = 0.7;
  preference.lastInteraction = new Date();
  preference.lastPreferenceUpdate = new Date();
  preference.metadata = {};
  preference.version = 1;
  preference.createdAt = new Date();
  preference.updatedAt = new Date();

  return preference;
}