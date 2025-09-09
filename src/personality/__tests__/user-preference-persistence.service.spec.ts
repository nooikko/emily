import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryBuilder, SelectQueryBuilder } from 'typeorm';
import { UserPreferencePersistenceService } from '../services/user-preference-persistence.service';
import { 
  UserPersonalityPreference, 
  InteractionContext, 
  FeedbackType 
} from '../entities/user-personality-preference.entity';
import { PersonalityProfile } from '../entities/personality-profile.entity';

// Mock repositories and query builder
const mockPreferenceRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockPersonalityRepository = {
  find: jest.fn(),
  findByIds: jest.fn(),
};

const mockQueryBuilder = {
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
} as Partial<SelectQueryBuilder<UserPersonalityPreference>>;

describe('UserPreferencePersistenceService', () => {
  let service: UserPreferencePersistenceService;
  let preferenceRepository: Repository<UserPersonalityPreference>;
  let personalityRepository: Repository<PersonalityProfile>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferencePersistenceService,
        {
          provide: getRepositoryToken(UserPersonalityPreference),
          useValue: mockPreferenceRepository,
        },
        {
          provide: getRepositoryToken(PersonalityProfile),
          useValue: mockPersonalityRepository,
        },
      ],
    }).compile();

    service = module.get<UserPreferencePersistenceService>(UserPreferencePersistenceService);
    preferenceRepository = module.get<Repository<UserPersonalityPreference>>(
      getRepositoryToken(UserPersonalityPreference)
    );
    personalityRepository = module.get<Repository<PersonalityProfile>>(
      getRepositoryToken(PersonalityProfile)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreference', () => {
    it('should return cached preference when available', async () => {
      // Arrange
      const mockPreference = createMockPreference();
      mockPreferenceRepository.findOne.mockResolvedValue(mockPreference);

      // First call to populate cache
      await service.getPreference('personality-1', InteractionContext.TECHNICAL);
      
      // Second call should use cache
      const result = await service.getPreference('personality-1', InteractionContext.TECHNICAL);

      // Assert
      expect(result).toBe(mockPreference);
      expect(mockPreferenceRepository.findOne).toHaveBeenCalledTimes(1); // Only called once due to cache
    });

    it('should return null for non-existent preference', async () => {
      // Arrange
      mockPreferenceRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getPreference('non-existent', InteractionContext.GENERAL);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      mockPreferenceRepository.findOne.mockRejectedValue(new Error('DB error'));

      // Act
      const result = await service.getPreference('personality-1', InteractionContext.TECHNICAL);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getPersonalityPreferences', () => {
    it('should return all preferences for a personality', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference({ context: InteractionContext.TECHNICAL }),
        createMockPreference({ context: InteractionContext.CREATIVE }),
      ];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);

      // Act
      const result = await service.getPersonalityPreferences('personality-1');

      // Assert
      expect(result).toHaveLength(2);
      expect(mockPreferenceRepository.find).toHaveBeenCalledWith({
        where: { personalityId: 'personality-1' },
        order: { preferenceScore: 'DESC', interactionCount: 'DESC' },
      });
    });
  });

  describe('getContextPreferences', () => {
    it('should return preferences for a specific context', async () => {
      // Arrange
      const mockPreferences = [createMockPreference()];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);

      // Act
      const result = await service.getContextPreferences(InteractionContext.TECHNICAL);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockPreferenceRepository.find).toHaveBeenCalledWith({
        where: { interactionContext: InteractionContext.TECHNICAL },
        order: { preferenceScore: 'DESC', learningConfidence: 'DESC' },
      });
    });
  });

  describe('queryPreferences', () => {
    it('should build complex queries with multiple filters', async () => {
      // Arrange
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPreference()]);

      const options = {
        contexts: [InteractionContext.TECHNICAL, InteractionContext.CREATIVE],
        personalityIds: ['personality-1', 'personality-2'],
        minPreferenceScore: 0.7,
        minInteractionCount: 5,
        highConfidenceOnly: true,
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-12-31'),
        },
        sortBy: 'preferenceScore' as const,
        sortOrder: 'DESC' as const,
        limit: 10,
      };

      // Act
      const result = await service.queryPreferences(options);

      // Assert
      expect(result).toHaveLength(1);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'preference.interactionContext IN (:...contexts)',
        { contexts: options.contexts }
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'preference.personalityId IN (:...personalityIds)',
        { personalityIds: options.personalityIds }
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'preference.preferenceScore >= :minScore',
        { minScore: 0.7 }
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('should handle empty query gracefully', async () => {
      // Arrange
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      const result = await service.queryPreferences({});

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should handle query errors gracefully', async () => {
      // Arrange
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockRejectedValue(new Error('Query failed'));

      // Act
      const result = await service.queryPreferences({ limit: 5 });

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('savePreference', () => {
    it('should save preference and update cache', async () => {
      // Arrange
      const mockPreference = createMockPreference();
      mockPreferenceRepository.save.mockResolvedValue(mockPreference);

      // Act
      const result = await service.savePreference(mockPreference);

      // Assert
      expect(result).toBe(mockPreference);
      expect(mockPreferenceRepository.save).toHaveBeenCalledWith(mockPreference);
    });

    it('should handle save errors', async () => {
      // Arrange
      const mockPreference = createMockPreference();
      mockPreferenceRepository.save.mockRejectedValue(new Error('Save failed'));

      // Act & Assert
      await expect(service.savePreference(mockPreference)).rejects.toThrow('Save failed');
    });
  });

  describe('batchSavePreferences', () => {
    it('should save multiple preferences and update cache', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference(),
        createMockPreference({ personalityId: 'personality-2' }),
      ];
      mockPreferenceRepository.save.mockResolvedValue(mockPreferences);

      // Act
      const result = await service.batchSavePreferences(mockPreferences);

      // Assert
      expect(result).toBe(mockPreferences);
      expect(mockPreferenceRepository.save).toHaveBeenCalledWith(mockPreferences);
    });
  });

  describe('deletePreference', () => {
    it('should delete preference and clear cache', async () => {
      // Arrange
      mockPreferenceRepository.delete.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.deletePreference('personality-1', InteractionContext.TECHNICAL);

      // Assert
      expect(result).toBe(true);
      expect(mockPreferenceRepository.delete).toHaveBeenCalledWith({
        personalityId: 'personality-1',
        interactionContext: InteractionContext.TECHNICAL,
      });
    });

    it('should return false when no records deleted', async () => {
      // Arrange
      mockPreferenceRepository.delete.mockResolvedValue({ affected: 0 });

      // Act
      const result = await service.deletePreference('personality-1', InteractionContext.TECHNICAL);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle delete errors gracefully', async () => {
      // Arrange
      mockPreferenceRepository.delete.mockRejectedValue(new Error('Delete failed'));

      // Act
      const result = await service.deletePreference('personality-1', InteractionContext.TECHNICAL);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getPreferenceStatistics', () => {
    it('should generate comprehensive statistics', async () => {
      // Arrange
      const mockPreferences = [
        createMockPreference({
          context: InteractionContext.TECHNICAL,
          preferenceScore: 0.8,
          learningConfidence: 0.9,
          interactionCount: 15,
        }),
        createMockPreference({
          context: InteractionContext.CREATIVE,
          preferenceScore: 0.6,
          learningConfidence: 0.4,
          interactionCount: 8,
        }),
      ];
      mockPreferenceRepository.find.mockResolvedValue(mockPreferences);

      // Act
      const stats = await service.getPreferenceStatistics();

      // Assert
      expect(stats.totalPreferences).toBe(2);
      expect(stats.contextDistribution[InteractionContext.TECHNICAL]).toBe(1);
      expect(stats.contextDistribution[InteractionContext.CREATIVE]).toBe(1);
      expect(stats.averageScores.overall).toBeCloseTo(0.7);
      expect(stats.confidenceStats.distribution.high).toBe(1);
      expect(stats.confidenceStats.distribution.low).toBe(1);
      expect(stats.interactionStats.total).toBe(23);
      expect(stats.feedbackStats.total).toBeGreaterThan(0);
      expect(stats.recentActivity).toBeDefined();
    });

    it('should handle empty data gracefully', async () => {
      // Arrange
      mockPreferenceRepository.find.mockResolvedValue([]);

      // Act
      const stats = await service.getPreferenceStatistics();

      // Assert
      expect(stats.totalPreferences).toBe(0);
      expect(stats.averageScores.overall).toBe(0);
    });
  });

  describe('createBackup', () => {
    it('should create a complete backup with all options', async () => {
      // Arrange
      const mockPreferences = [createMockPreference(), createMockPreference()];
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockPreferences);

      const options = {
        includeFullHistory: true,
        includeMetrics: true,
        includeBehaviorPatterns: true,
        compress: false,
        encrypt: false,
      };

      // Act
      const result = await service.createBackup(options);

      // Assert
      expect(result.backup).toBeDefined();
      expect(result.metadata.totalRecords).toBe(2);
      expect(result.metadata.createdAt).toBeInstanceOf(Date);
      expect(result.metadata.version).toBe('1.0.0');
    });

    it('should create compressed and encrypted backup', async () => {
      // Arrange
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([createMockPreference()]);

      const options = {
        includeFullHistory: false,
        includeMetrics: false,
        includeBehaviorPatterns: false,
        compress: true,
        encrypt: true,
      };

      // Act
      const result = await service.createBackup(options);

      // Assert
      expect(result.backup.compressed).toBe(true);
      expect(result.backup.encrypted).toBe(true);
    });

    it('should handle backup with date range filter', async () => {
      // Arrange
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([createMockPreference()]),
      };
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const options = {
        includeFullHistory: true,
        includeMetrics: true,
        includeBehaviorPatterns: true,
        compress: false,
        encrypt: false,
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-12-31'),
        },
      };

      // Act
      const result = await service.createBackup(options);

      // Assert
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'preference.createdAt BETWEEN :from AND :to',
        { from: options.dateRange.from, to: options.dateRange.to }
      );
      expect(result.backup).toBeDefined();
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore preferences from backup successfully', async () => {
      // Arrange
      const backupData = {
        preferences: [
          {
            personalityId: 'personality-1',
            interactionContext: InteractionContext.TECHNICAL,
            preferenceScore: 0.8,
            feedback: [],
            // ... other properties
          },
        ],
        metadata: {
          version: '1.0.0',
        },
      };

      mockPreferenceRepository.findOne.mockResolvedValue(null); // No existing preference
      mockPreferenceRepository.save.mockResolvedValue(createMockPreference());

      // Act
      const result = await service.restoreFromBackup(backupData, {
        overwriteExisting: false,
        validateData: true,
        dryRun: false,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.migrated).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockPreferenceRepository.save).toHaveBeenCalled();
    });

    it('should perform dry run without actual changes', async () => {
      // Arrange
      const backupData = {
        preferences: [
          {
            personalityId: 'personality-1',
            interactionContext: InteractionContext.TECHNICAL,
          },
        ],
      };

      // Act
      const result = await service.restoreFromBackup(backupData, {
        overwriteExisting: false,
        validateData: true,
        dryRun: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Dry run completed successfully');
      expect(mockPreferenceRepository.save).not.toHaveBeenCalled();
    });

    it('should skip existing preferences when overwrite is false', async () => {
      // Arrange
      const backupData = {
        preferences: [
          {
            personalityId: 'personality-1',
            interactionContext: InteractionContext.TECHNICAL,
          },
        ],
      };

      mockPreferenceRepository.findOne.mockResolvedValue(createMockPreference()); // Existing preference

      // Act
      const result = await service.restoreFromBackup(backupData, {
        overwriteExisting: false,
        validateData: false,
        dryRun: false,
      });

      // Assert
      expect(result.warnings).toContain('Skipped existing preference: personality-1-technical');
      expect(mockPreferenceRepository.save).not.toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      // Arrange
      const invalidBackupData = {
        preferences: [
          {
            // Missing required fields
            preferenceScore: 0.8,
          },
        ],
      };

      // Act
      const result = await service.restoreFromBackup(invalidBackupData, {
        overwriteExisting: false,
        validateData: true,
        dryRun: false,
      });

      // Assert
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle encrypted and compressed backup', async () => {
      // Arrange
      const compressedBackupData = {
        compressed: true,
        data: JSON.stringify({
          preferences: [
            {
              personalityId: 'personality-1',
              interactionContext: InteractionContext.TECHNICAL,
            },
          ],
        }),
      };

      const encryptedBackupData = {
        encrypted: true,
        data: Buffer.from(JSON.stringify(compressedBackupData)).toString('base64'),
      };

      mockPreferenceRepository.findOne.mockResolvedValue(null);
      mockPreferenceRepository.save.mockResolvedValue(createMockPreference());

      // Act
      const result = await service.restoreFromBackup(encryptedBackupData, {
        overwriteExisting: false,
        validateData: false,
        dryRun: false,
      });

      // Assert
      expect(result.migrated).toBe(1);
    });
  });

  describe('cleanupOldData', () => {
    it('should clean up old low-value preferences', async () => {
      // Arrange
      const oldPreferences = [
        createMockPreference({
          preferenceScore: 0.5,
          interactionCount: 2,
          lastInteraction: new Date('2023-01-01'),
        }),
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(oldPreferences),
      };
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockPreferenceRepository.remove.mockResolvedValue(undefined);

      // Act
      const result = await service.cleanupOldData(365, {
        dryRun: false,
        preserveHighValue: true,
        preserveMinInteractions: 5,
      });

      // Assert
      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockPreferenceRepository.remove).toHaveBeenCalledWith(oldPreferences[0]);
    });

    it('should perform dry run cleanup', async () => {
      // Arrange
      const oldPreferences = [createMockPreference()];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(oldPreferences),
      };
      mockPreferenceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.cleanupOldData(365, {
        dryRun: true,
        preserveHighValue: true,
        preserveMinInteractions: 5,
      });

      // Assert
      expect(result.cleaned).toBe(0);
      expect(result.preserved).toBe(1);
      expect(mockPreferenceRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      // Act & Assert
      expect(() => service.clearCache()).not.toThrow();
    });

    it('should provide cache statistics', async () => {
      // Arrange - First populate some cache
      const mockPreference = createMockPreference();
      mockPreferenceRepository.findOne.mockResolvedValue(mockPreference);
      await service.getPreference('personality-1', InteractionContext.TECHNICAL);

      // Act
      const stats = service.getCacheStatistics();

      // Assert
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hitRates).toBeDefined();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository connection failures', async () => {
      // Arrange
      mockPreferenceRepository.find.mockRejectedValue(new Error('Connection lost'));

      // Act
      const result = await service.getPreferenceStatistics();

      // Assert
      expect(result.totalPreferences).toBe(0); // Should return empty stats
    });

    it('should handle backup creation failures', async () => {
      // Arrange
      mockPreferenceRepository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Backup failed');
      });

      // Act & Assert
      await expect(service.createBackup()).rejects.toThrow('Backup failed');
    });
  });
});

// Helper function
function createMockPreference(overrides: {
  personalityId?: string;
  context?: InteractionContext;
  preferenceScore?: number;
  learningConfidence?: number;
  interactionCount?: number;
  lastInteraction?: Date;
} = {}): UserPersonalityPreference {
  const preference = new UserPersonalityPreference();
  preference.id = 'pref-1';
  preference.personalityId = overrides.personalityId || 'personality-1';
  preference.interactionContext = overrides.context || InteractionContext.TECHNICAL;
  preference.preferenceScore = overrides.preferenceScore || 0.7;
  preference.interactionCount = overrides.interactionCount || 5;
  preference.feedback = [
    {
      type: FeedbackType.RATING,
      score: 4,
      comment: 'Good performance',
    },
  ];
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
  preference.learningConfidence = overrides.learningConfidence || 0.6;
  preference.lastInteraction = overrides.lastInteraction || new Date();
  preference.lastPreferenceUpdate = new Date();
  preference.metadata = {};
  preference.createdAt = new Date();
  preference.updatedAt = new Date();
  preference.version = 1;

  return preference;
}