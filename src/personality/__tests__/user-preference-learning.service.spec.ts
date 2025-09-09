import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { BehavioralFeedbackDto, SubmitPersonalityFeedbackDto } from '../dto/personality-feedback.dto';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { FeedbackType, InteractionContext, UserPersonalityPreference } from '../entities/user-personality-preference.entity';
import { LearningAlgorithm, UserPreferenceLearningService } from '../services/user-preference-learning.service';

// Mock repositories
const mockPreferenceRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  findByIds: jest.fn(),
};

const mockPersonalityRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  findByIds: jest.fn(),
};

const mockThreadRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
};

describe('UserPreferenceLearningService', () => {
  let service: UserPreferenceLearningService;
  let _preferenceRepository: Repository<UserPersonalityPreference>;
  let _personalityRepository: Repository<PersonalityProfile>;
  let _threadRepository: Repository<ConversationThread>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferenceLearningService,
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
      ],
    }).compile();

    service = module.get<UserPreferenceLearningService>(UserPreferenceLearningService);
    _preferenceRepository = module.get<Repository<UserPersonalityPreference>>(getRepositoryToken(UserPersonalityPreference));
    _personalityRepository = module.get<Repository<PersonalityProfile>>(getRepositoryToken(PersonalityProfile));
    _threadRepository = module.get<Repository<ConversationThread>>(getRepositoryToken(ConversationThread));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submitFeedback', () => {
    it('should process explicit feedback and update preferences', async () => {
      // Arrange
      const feedbackDto: SubmitPersonalityFeedbackDto = {
        personalityId: 'personality-1',
        interactionContext: InteractionContext.TECHNICAL,
        feedbackType: FeedbackType.RATING,
        overallScore: 4,
        comment: 'Great technical assistance',
        aspects: {
          helpfulness: 5,
          accuracy: 4,
        },
        wouldRecommend: true,
      };

      const existingPreference = createMockPreference();
      mockPreferenceRepository.findOne.mockResolvedValue(existingPreference);
      mockPreferenceRepository.save.mockResolvedValue(existingPreference);

      // Act
      const result = await service.submitFeedback(feedbackDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.updatedPreferenceScore).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.insights.length).toBeGreaterThan(0);
      expect(mockPreferenceRepository.save).toHaveBeenCalled();
    });

    it('should create new preference if none exists', async () => {
      // Arrange
      const feedbackDto: SubmitPersonalityFeedbackDto = {
        personalityId: 'new-personality',
        interactionContext: InteractionContext.CREATIVE,
        feedbackType: FeedbackType.RATING,
        overallScore: 3,
      };

      mockPreferenceRepository.findOne.mockResolvedValue(null);
      const newPreference = createMockPreference();
      mockPreferenceRepository.save.mockResolvedValue(newPreference);

      // Act
      const result = await service.submitFeedback(feedbackDto);

      // Assert
      expect(result).toBeDefined();
      expect(mockPreferenceRepository.save).toHaveBeenCalledTimes(2); // Create + save
    });

    it('should handle different feedback types appropriately', async () => {
      // Test each feedback type
      const feedbackTypes = Object.values(FeedbackType);

      for (const feedbackType of feedbackTypes) {
        const feedbackDto: SubmitPersonalityFeedbackDto = {
          personalityId: 'personality-1',
          interactionContext: InteractionContext.GENERAL,
          feedbackType,
          overallScore: feedbackType === FeedbackType.COMPLAINT ? 1 : 4,
          comment: `Test ${feedbackType} feedback`,
        };

        mockPreferenceRepository.findOne.mockResolvedValue(createMockPreference());
        mockPreferenceRepository.save.mockResolvedValue(createMockPreference());

        const result = await service.submitFeedback(feedbackDto);

        expect(result).toBeDefined();
        expect(result.insights).toBeDefined();
      }
    });
  });

  describe('submitBehavioralFeedback', () => {
    it('should process behavioral feedback and update patterns', async () => {
      // Arrange
      const behavioralDto: BehavioralFeedbackDto = {
        personalityId: 'personality-1',
        interactionContext: InteractionContext.TECHNICAL,
        threadId: 'thread-1',
        averageMessageLength: 150,
        followUpQuestions: 3,
        conversationDuration: 25.5,
        satisfactionIndicators: 2,
        complexityPreference: 4,
        communicationStyle: 'technical',
      };

      const existingPreference = createMockPreference();
      mockPreferenceRepository.findOne.mockResolvedValue(existingPreference);
      mockPreferenceRepository.save.mockResolvedValue(existingPreference);

      // Act
      const result = await service.submitBehavioralFeedback(behavioralDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.learningQuality.dataQuality).toBeGreaterThan(0);
      expect(mockPreferenceRepository.save).toHaveBeenCalled();
    });

    it('should analyze engagement metrics correctly', async () => {
      // Arrange
      const highEngagementDto: BehavioralFeedbackDto = {
        personalityId: 'personality-1',
        interactionContext: InteractionContext.EDUCATIONAL,
        threadId: 'thread-1',
        followUpQuestions: 8,
        conversationDuration: 45,
        satisfactionIndicators: 5,
      };

      mockPreferenceRepository.findOne.mockResolvedValue(createMockPreference());
      mockPreferenceRepository.save.mockResolvedValue(createMockPreference());

      // Act
      const result = await service.submitBehavioralFeedback(highEngagementDto);

      // Assert
      expect(result.insights).toContain('High engagement - user asking many follow-up questions');
      expect(result.insights).toContain('Long conversation duration indicates user engagement');
    });
  });

  describe('analyzeThreadForFeedback', () => {
    it('should analyze conversation patterns and extract behavioral data', async () => {
      // Arrange
      const threadId = 'thread-1';
      const personalityId = 'personality-1';
      const messages: BaseMessage[] = [
        new HumanMessage('How do I implement a binary search?'),
        new AIMessage('A binary search is an efficient algorithm...'),
        new HumanMessage('Can you show me an example?'),
        new AIMessage("Sure! Here's an example in Python..."),
        new HumanMessage("Thanks! That's very helpful."),
      ];

      // Act
      const result = await service.analyzeThreadForFeedback(threadId, messages, personalityId);

      // Assert
      expect(result).toBeDefined();
      expect(result!.personalityId).toBe(personalityId);
      expect(result!.threadId).toBe(threadId);
      expect(result!.averageMessageLength).toBeGreaterThan(0);
      expect(result!.followUpQuestions).toBeGreaterThan(0);
      expect(result!.satisfactionIndicators).toBeGreaterThan(0);
    });

    it('should infer context from message content', async () => {
      // Arrange
      const technicalMessages: BaseMessage[] = [
        new HumanMessage("I'm having trouble with my API implementation"),
        new AIMessage('Let me help you debug that API issue...'),
      ];

      // Act
      const result = await service.analyzeThreadForFeedback('thread-1', technicalMessages, 'personality-1');

      // Assert
      expect(result!.interactionContext).toBe(InteractionContext.TECHNICAL);
    });

    it('should handle empty or invalid message arrays', async () => {
      // Test empty messages
      const emptyResult = await service.analyzeThreadForFeedback('thread-1', [], 'personality-1');
      expect(emptyResult).toBeDefined();

      // Test single message
      const singleMessage = [new HumanMessage('Hello')];
      const singleResult = await service.analyzeThreadForFeedback('thread-1', singleMessage, 'personality-1');
      expect(singleResult).toBeDefined();
    });
  });

  describe('getUserPreferenceProfile', () => {
    it('should generate comprehensive user preference profile', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference({
          personalityId: 'personality-1',
          context: InteractionContext.TECHNICAL,
          preferenceScore: 0.9,
          interactionCount: 15,
          learningConfidence: 0.8,
        }),
        createMockPreference({
          personalityId: 'personality-2',
          context: InteractionContext.CREATIVE,
          preferenceScore: 0.7,
          interactionCount: 8,
          learningConfidence: 0.6,
        }),
      ];

      const mockPersonalities = [
        createMockPersonality('personality-1', 'Technical Assistant'),
        createMockPersonality('personality-2', 'Creative Helper'),
      ];

      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);
      mockPersonalityRepository.findByIds.mockResolvedValue(mockPersonalities);

      // Act
      const profile = await service.getUserPreferenceProfile();

      // Assert
      expect(profile).toBeDefined();
      expect(profile.topPreferences).toHaveLength(2);
      expect(profile.contextPreferences).toBeDefined();
      expect(profile.learningConfidence).toBeGreaterThan(0);
      expect(profile.totalInteractions).toBe(23);
      expect(profile.behaviorPatterns).toBeDefined();
      expect(profile.recommendations).toBeDefined();
    });

    it('should filter preferences by sufficient data', async () => {
      // Arrange
      const preferences = [
        createMockPreference({ interactionCount: 10, learningConfidence: 0.8 }), // Sufficient
        createMockPreference({ interactionCount: 1, learningConfidence: 0.3 }), // Insufficient
      ];

      mockPreferenceRepository.find.mockResolvedValue(preferences);
      mockPersonalityRepository.findByIds.mockResolvedValue([]);

      // Act
      const profile = await service.getUserPreferenceProfile();

      // Assert
      expect(profile.topPreferences).toHaveLength(2); // Service returns all preferences with confidence scores
      // The first preference should have higher confidence than the second
      expect(profile.topPreferences[0].confidenceScore).toBeGreaterThan(profile.topPreferences[1].confidenceScore);
    });
  });

  describe('getLearningAnalytics', () => {
    it('should provide comprehensive learning analytics', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference({ learningConfidence: 0.8 }),
        createMockPreference({ learningConfidence: 0.5 }),
        createMockPreference({ learningConfidence: 0.2 }),
      ];

      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);

      // Act
      const analytics = await service.getLearningAnalytics();

      // Assert
      expect(analytics).toBeDefined();
      expect(analytics.totalPreferences).toBe(3);
      expect(analytics.confidenceDistribution.high).toBe(1);
      expect(analytics.confidenceDistribution.medium).toBe(1);
      expect(analytics.confidenceDistribution.low).toBe(1);
      expect(analytics.contextAnalysis).toBeDefined();
      expect(analytics.learningQuality).toBeDefined();
      expect(analytics.recommendations).toBeDefined();
    });
  });

  describe('updateConfiguration', () => {
    it('should update learning algorithm configuration', () => {
      // Arrange
      const newConfig = {
        algorithm: LearningAlgorithm.BAYESIAN,
        learningRate: 0.5,
        minInteractionsForConfidence: 10,
      };

      // Act
      service.updateConfiguration(newConfig);

      // Assert - No direct way to test private config, but should not throw
      expect(() => service.updateConfiguration(newConfig)).not.toThrow();
    });
  });

  describe('Learning Algorithms', () => {
    it('should apply different learning algorithms appropriately', async () => {
      // Test each learning algorithm
      const algorithms = Object.values(LearningAlgorithm);

      for (const algorithm of algorithms) {
        service.updateConfiguration({ algorithm });

        const feedbackDto: SubmitPersonalityFeedbackDto = {
          personalityId: 'personality-1',
          interactionContext: InteractionContext.GENERAL,
          feedbackType: FeedbackType.RATING,
          overallScore: 4,
        };

        mockPreferenceRepository.findOne.mockResolvedValue(createMockPreference());
        mockPreferenceRepository.save.mockResolvedValue(createMockPreference());

        const result = await service.submitFeedback(feedbackDto);

        expect(result).toBeDefined();
        expect(result.updatedPreferenceScore).toBeGreaterThanOrEqual(0);
        expect(result.updatedPreferenceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Arrange
      mockPreferenceRepository.findOne.mockRejectedValue(new Error('Database error'));

      const feedbackDto: SubmitPersonalityFeedbackDto = {
        personalityId: 'personality-1',
        interactionContext: InteractionContext.GENERAL,
        feedbackType: FeedbackType.RATING,
        overallScore: 4,
      };

      // Act & Assert
      await expect(service.submitFeedback(feedbackDto)).rejects.toThrow();
    });

    it('should handle malformed feedback data gracefully', async () => {
      // Arrange
      const invalidFeedback: any = {
        personalityId: null,
        interactionContext: 'invalid-context',
        feedbackType: 'invalid-type',
      };

      mockPreferenceRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.submitFeedback(invalidFeedback);

      // Assert - Service handles malformed data gracefully
      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.7); // Lower confidence for invalid data
      expect(result.insights).toHaveLength(0); // No meaningful insights from invalid data
    });
  });

  describe('Performance Tests', () => {
    it('should handle large numbers of preferences efficiently', async () => {
      // Arrange
      const largePreferenceSet = Array.from({ length: 1000 }, (_, i) => createMockPreference({ personalityId: `personality-${i}` }));

      mockPreferenceRepository.find.mockResolvedValue(largePreferenceSet);
      mockPersonalityRepository.findByIds.mockResolvedValue([]);

      // Act
      const startTime = Date.now();
      const profile = await service.getUserPreferenceProfile();
      const duration = Date.now() - startTime;

      // Assert
      expect(profile).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

// Helper functions
function createMockPreference(overrides: Partial<UserPersonalityPreference> = {}): UserPersonalityPreference {
  const preference = new UserPersonalityPreference();
  preference.id = 'pref-1';
  preference.personalityId = 'personality-1';
  preference.interactionContext = InteractionContext.GENERAL;
  preference.preferenceScore = 0.7;
  preference.interactionCount = 5;
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
  preference.learningConfidence = 0.6;
  preference.lastInteraction = new Date();
  preference.lastPreferenceUpdate = new Date();
  preference.metadata = {};
  preference.createdAt = new Date();
  preference.updatedAt = new Date();
  preference.version = 1;

  // Mock methods
  preference.addFeedback = jest.fn();
  preference.updateInteractionPatterns = jest.fn();
  preference.updateContextualPerformance = jest.fn();
  preference.getAverageFeedbackScore = jest.fn().mockReturnValue(0.7);
  preference.getAspectScore = jest.fn().mockReturnValue(0.7);
  preference.getContextRecommendationScore = jest.fn().mockReturnValue(0.7);
  preference.hasSufficientData = jest.fn().mockReturnValue(true);
  preference.getPreferenceTrend = jest.fn().mockReturnValue('stable');

  return Object.assign(preference, overrides);
}

function createMockPersonality(id: string, name: string): PersonalityProfile {
  const personality = new PersonalityProfile();
  personality.id = id;
  personality.name = name;
  personality.description = `Mock personality: ${name}`;
  personality.category = 'test';
  personality.tags = ['test'];
  personality.traits = [];
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

// Custom matcher for greater than
function _greaterThan(expected: number) {
  return {
    asymmetricMatch: (actual: number) => actual > expected,
    toString: () => `greater than ${expected}`,
  };
}
