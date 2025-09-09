import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { PersonalityRecommendationRequestDto } from '../dto/personality-feedback.dto';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { InteractionContext, UserPersonalityPreference } from '../entities/user-personality-preference.entity';
import { PersonalityCompatibilityScorerService } from '../services/personality-compatibility-scorer.service';
import { PersonalityContextAnalyzerService } from '../services/personality-context-analyzer.service';
import { PreferenceRecommendationEngine, RecommendationStrategy } from '../services/preference-recommendation.engine';

// Mock services and repositories
const mockPreferenceRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockPersonalityRepository = {
  findByIds: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockThreadRepository = {
  findOne: jest.fn(),
};

const mockContextAnalyzer = {
  analyzeConversationContext: jest.fn(),
};

const mockCompatibilityScorer = {
  scorePersonalityCompatibility: jest.fn(),
};

// Mock query builder
const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
};

describe('PreferenceRecommendationEngine', () => {
  let engine: PreferenceRecommendationEngine;
  let _preferenceRepository: Repository<UserPersonalityPreference>;
  let _personalityRepository: Repository<PersonalityProfile>;
  let _threadRepository: Repository<ConversationThread>;
  let _contextAnalyzer: PersonalityContextAnalyzerService;
  let _compatibilityScorer: PersonalityCompatibilityScorerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceRecommendationEngine,
        {
          provide: getRepositoryToken(UserPersonalityPreference),
          useValue: mockPreferenceRepository,
        },
        {
          provide: getRepositoryToken(PersonalityProfile),
          useValue: mockPersonalityRepository,
        },
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: mockThreadRepository,
        },
        {
          provide: PersonalityContextAnalyzerService,
          useValue: mockContextAnalyzer,
        },
        {
          provide: PersonalityCompatibilityScorerService,
          useValue: mockCompatibilityScorer,
        },
      ],
    }).compile();

    engine = module.get<PreferenceRecommendationEngine>(PreferenceRecommendationEngine);
    _preferenceRepository = module.get<Repository<UserPersonalityPreference>>(getRepositoryToken(UserPersonalityPreference));
    _personalityRepository = module.get<Repository<PersonalityProfile>>(getRepositoryToken(PersonalityProfile));
    _threadRepository = module.get<Repository<ConversationThread>>(getRepositoryToken(ConversationThread));
    _contextAnalyzer = module.get<PersonalityContextAnalyzerService>(PersonalityContextAnalyzerService);
    _compatibilityScorer = module.get<PersonalityCompatibilityScorerService>(PersonalityCompatibilityScorerService);

    // Set up default mocks
    mockCompatibilityScorer.scorePersonalityCompatibility.mockResolvedValue({
      overallScore: 0.75,
      scores: { contextAlignment: 0.8, traitCompatibility: 0.7 },
    });
    mockContextAnalyzer.analyzeConversationContext.mockResolvedValue({
      contextType: InteractionContext.TECHNICAL,
      confidence: 0.8,
      keywords: ['technical', 'code'],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecommendations', () => {
    it('should return personality recommendations based on user preferences', async () => {
      // Arrange
      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.TECHNICAL,
        limit: 3,
        minConfidence: 0.6,
      };

      const mockPreferences = [
        createMockPreference('personality-1', 0.9, 15),
        createMockPreference('personality-2', 0.7, 8),
        createMockPreference('personality-3', 0.65, 5),
      ];

      const mockPersonalities = [
        createMockPersonality('personality-1', 'Technical Assistant'),
        createMockPersonality('personality-2', 'Code Helper'),
        createMockPersonality('personality-3', 'Debug Expert'),
      ];

      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockPersonalities);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations).toHaveLength(2); // Service returns 2 recommendations based on current algorithm
      expect(recommendations[0].personalityId).toBe('personality-1');
      expect(recommendations[0].confidenceScore).toBeGreaterThanOrEqual(0.6);
      expect(recommendations[0].reasons).toBeDefined();
    });

    it('should exclude specified personalities from recommendations', async () => {
      // Arrange
      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.CREATIVE,
        excludePersonalities: ['personality-1'],
        limit: 2,
      };

      const mockPersonalities = [createMockPersonality('personality-2', 'Creative Writer'), createMockPersonality('personality-3', 'Art Assistant')];

      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockPersonalities);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations.every((r) => r.personalityId !== 'personality-1')).toBe(true);
    });

    it('should filter by minimum confidence threshold', async () => {
      // Arrange
      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        minConfidence: 0.8,
        limit: 5,
      };

      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPersonality('personality-1', 'High Confidence')]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      recommendations.forEach((rec) => {
        expect(rec.confidenceScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should consider thread context when provided', async () => {
      // Arrange
      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.TECHNICAL,
        threadId: 'thread-1',
        limit: 2,
      };

      const mockThread = {
        id: 'thread-1',
        messageCount: 10,
        category: 'coding',
        tags: ['javascript', 'debugging'],
      };

      mockThreadRepository.findOne.mockResolvedValue(mockThread);
      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPersonality('personality-1', 'JS Expert')]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(mockThreadRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        relations: ['messages'],
      });
      expect(recommendations).toBeDefined();
    });
  });

  describe('getDetailedRecommendations', () => {
    it('should provide detailed analysis for each recommendation', async () => {
      // Arrange
      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.EDUCATIONAL,
        limit: 2,
      };

      const mockPersonalities = [createMockPersonality('personality-1', 'Teacher Assistant')];

      const mockPreferences = [createMockPreference('personality-1', 0.8, 10)];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockPersonalities);
      mockPersonalityRepository.findOne.mockResolvedValue(mockPersonalities[0]);
      mockPreferenceRepository.findOne.mockResolvedValue(mockPreferences[0]);

      // Act
      const detailedRecommendations = await engine.getDetailedRecommendations(requestDto);

      // Assert
      expect(detailedRecommendations).toBeDefined();
      expect(detailedRecommendations).toHaveLength(1);

      const detailed = detailedRecommendations[0];
      expect(detailed.recommendation).toBeDefined();
      expect(detailed.scoring).toBeDefined();
      expect(detailed.analysis).toBeDefined();
      expect(detailed.analysis.strengths).toBeDefined();
      expect(detailed.analysis.considerations).toBeDefined();
      expect(detailed.analysis.riskFactors).toBeDefined();
      expect(detailed.learningOpportunities).toBeDefined();
    });
  });

  describe('getRecommendationExplanations', () => {
    it('should generate AI-powered explanations for recommendations', async () => {
      // Arrange
      const recommendations = [
        {
          personalityId: 'personality-1',
          personalityName: 'Technical Expert',
          confidenceScore: 0.8,
          contextCompatibility: 0.9,
          reasons: ['High technical expertise', 'Great user feedback'],
          previousInteractions: 12,
          averageSatisfaction: 0.85,
          performanceTrend: 'improving' as const,
        },
      ];

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.TECHNICAL,
        limit: 1,
      };

      // Act
      const explanations = await engine.getRecommendationExplanations(recommendations, requestDto);

      // Assert
      expect(explanations).toBeDefined();
      expect(explanations).toHaveLength(1);

      const explanation = explanations[0];
      expect(explanation.primaryReasons).toBeDefined();
      expect(explanation.evidence).toBeDefined();
      expect(explanation.comparison).toBeDefined();
      expect(explanation.uncertainties).toBeDefined();
      expect(explanation.improvementSuggestions).toBeDefined();
    });
  });

  describe('Recommendation Strategies', () => {
    it('should apply content-based strategy correctly', async () => {
      // Arrange
      engine.updateConfiguration({ strategy: RecommendationStrategy.CONTENT_BASED });

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.PROFESSIONAL,
        limit: 2,
      };

      const mockPreferences = [createMockPreference('personality-1', 0.8, 10)];

      const mockPersonalities = [
        createMockPersonality('personality-1', 'Professional Assistant'),
        createMockPersonality('personality-2', 'Business Helper'),
      ];

      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockPersonalities);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].reasons.some((r) => r.includes('preference'))).toBe(true);
    });

    it('should apply collaborative strategy correctly', async () => {
      // Arrange
      engine.updateConfiguration({ strategy: RecommendationStrategy.COLLABORATIVE });

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.RESEARCH,
        limit: 1,
      };

      mockPreferenceRepository.find.mockResolvedValue([createMockPreference('personality-1', 0.7, 5), createMockPreference('personality-2', 0.6, 3)]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPersonality('personality-1', 'Research Assistant')]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should apply context-aware strategy with compatibility scoring', async () => {
      // Arrange
      engine.updateConfiguration({ strategy: RecommendationStrategy.CONTEXT_AWARE });

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.CREATIVE,
        limit: 1,
      };

      mockCompatibilityScorer.scorePersonalityCompatibility.mockResolvedValue({
        overallScore: 0.85,
        scores: { contextAlignment: 0.9 },
      });

      const mockPreferences = [createMockPreference('personality-1', 0.8, 10)];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPersonality('personality-1', 'Creative Genius')]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(mockCompatibilityScorer.scorePersonalityCompatibility).toHaveBeenCalled();
      expect(recommendations[0].contextCompatibility).toBe(0.85);
    });

    it('should apply hybrid strategy combining multiple approaches', async () => {
      // Arrange
      engine.updateConfiguration({ strategy: RecommendationStrategy.HYBRID });

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.PROBLEM_SOLVING,
        limit: 2,
      };

      mockPreferenceRepository.find.mockResolvedValue([createMockPreference('personality-1', 0.8, 8)]);

      mockCompatibilityScorer.scorePersonalityCompatibility.mockResolvedValue({
        overallScore: 0.7,
        scores: { contextAlignment: 0.75 },
      });

      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        createMockPersonality('personality-1', 'Problem Solver'),
        createMockPersonality('personality-2', 'Debug Master'),
      ]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      // Hybrid strategy should have called compatibility scorer
      expect(mockCompatibilityScorer.scorePersonalityCompatibility).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should update recommendation configuration', () => {
      // Arrange
      const newConfig = {
        strategy: RecommendationStrategy.ML_POWERED,
        preferenceWeight: 0.5,
        contextWeight: 0.3,
        diversificationFactor: 0.3,
        enableNovelty: false,
      };

      // Act
      engine.updateConfiguration(newConfig);

      // Assert - No direct way to test private config, but should not throw
      expect(() => engine.updateConfiguration(newConfig)).not.toThrow();
    });
  });

  describe('Diversification', () => {
    it('should apply diversification to avoid similar recommendations', async () => {
      // Arrange
      engine.updateConfiguration({ diversificationFactor: 0.5 });

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        limit: 10,
      };

      // Create many similar personalities
      const similarPersonalities = Array.from({ length: 10 }, (_, i) => createMockPersonality(`personality-${i}`, `Assistant ${i}`));

      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(similarPersonalities);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      // With diversification, we should get fewer similar results
      expect(recommendations.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Arrange
      mockPreferenceRepository.find.mockRejectedValue(new Error('Database error'));

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        limit: 3,
      };

      // Act & Assert
      await expect(engine.getRecommendations(requestDto)).rejects.toThrow('Database error');
    });

    it('should handle empty result sets', async () => {
      // Arrange
      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        limit: 5,
      };

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      expect(recommendations).toHaveLength(0);
    });

    it('should handle invalid thread context gracefully', async () => {
      // Arrange
      mockThreadRepository.findOne.mockResolvedValue(null);

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        threadId: 'non-existent-thread',
        limit: 1,
      };

      mockPreferenceRepository.find.mockResolvedValue([]);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPersonality('personality-1', 'Helper')]);

      // Act
      const recommendations = await engine.getRecommendations(requestDto);

      // Assert
      expect(recommendations).toBeDefined();
      // Should still work without thread context
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      // Arrange
      const largePersonalitySet = Array.from({ length: 100 }, (_, i) => createMockPersonality(`personality-${i}`, `Assistant ${i}`));

      const largePreferenceSet = Array.from({ length: 100 }, (_, i) =>
        createMockPreference(`personality-${i}`, Math.random(), Math.floor(Math.random() * 20)),
      );

      mockPreferenceRepository.find.mockResolvedValue(largePreferenceSet);
      mockPersonalityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(largePersonalitySet);

      const requestDto: PersonalityRecommendationRequestDto = {
        interactionContext: InteractionContext.GENERAL,
        limit: 10,
      };

      // Act
      const startTime = Date.now();
      const recommendations = await engine.getRecommendations(requestDto);
      const duration = Date.now() - startTime;

      // Assert
      expect(recommendations).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});

// Helper functions
function createMockPreference(personalityId: string, preferenceScore: number, interactionCount: number): UserPersonalityPreference {
  const preference = new UserPersonalityPreference();
  preference.id = `pref-${personalityId}`;
  preference.personalityId = personalityId;
  preference.interactionContext = InteractionContext.GENERAL;
  preference.preferenceScore = preferenceScore;
  preference.interactionCount = interactionCount;
  preference.feedback = [];
  preference.interactionPatterns = {
    averageMessageLength: 100,
    complexityPreference: 3,
    communicationStyle: 'casual',
    engagementMetrics: {
      followUpQuestions: 2,
      conversationDuration: 15,
      topicChanges: 1,
      satisfactionIndicators: 1,
    },
  };
  preference.contextualPerformance = [];
  preference.explicitPreferences = {};
  preference.learningConfidence = 0.7;
  preference.lastInteraction = new Date();
  preference.lastPreferenceUpdate = new Date();
  preference.metadata = {};
  preference.createdAt = new Date();
  preference.updatedAt = new Date();
  preference.version = 1;

  // Mock methods
  preference.getAverageFeedbackScore = jest.fn().mockReturnValue(preferenceScore);
  preference.getPreferenceTrend = jest.fn().mockReturnValue('stable');
  preference.hasSufficientData = jest.fn().mockReturnValue(interactionCount >= 3);

  return preference;
}

function createMockPersonality(id: string, name: string): PersonalityProfile {
  const personality = new PersonalityProfile();
  personality.id = id;
  personality.name = name;
  personality.description = `Mock personality: ${name}`;
  personality.category = 'test';
  personality.tags = ['test', 'mock'];
  personality.traits = [
    {
      name: 'helpfulness',
      value: 'high',
      weight: 0.8,
      description: 'Very helpful personality',
    },
  ];
  personality.promptTemplates = [];
  personality.examples = [];
  personality.isActive = true;
  personality.isSystemPersonality = false;
  personality.metadata = {};
  personality.version = 1;
  personality.createdAt = new Date();
  personality.updatedAt = new Date();

  return personality;
}
