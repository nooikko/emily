import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, MoreThan, LessThan } from 'typeorm';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { 
  UserPersonalityPreference, 
  InteractionContext, 
  FeedbackType, 
  PersonalityFeedback 
} from '../entities/user-personality-preference.entity';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { UserPreferenceProfileDto } from '../dto/personality-feedback.dto';

/**
 * Preference backup and restore options
 */
export interface PreferenceBackupOptions {
  /** Include all historical feedback */
  includeFullHistory: boolean;
  /** Include performance metrics */
  includeMetrics: boolean;
  /** Include behavioral patterns */
  includeBehaviorPatterns: boolean;
  /** Compress the backup data */
  compress: boolean;
  /** Encrypt sensitive data */
  encrypt: boolean;
  /** Date range for backup */
  dateRange?: {
    from: Date;
    to: Date;
  };
}

/**
 * Preference query options
 */
export interface PreferenceQueryOptions {
  /** Filter by contexts */
  contexts?: InteractionContext[];
  /** Filter by personality IDs */
  personalityIds?: string[];
  /** Minimum preference score */
  minPreferenceScore?: number;
  /** Minimum interaction count */
  minInteractionCount?: number;
  /** Include only high-confidence preferences */
  highConfidenceOnly?: boolean;
  /** Date range filter */
  dateRange?: {
    from: Date;
    to: Date;
  };
  /** Sort options */
  sortBy?: 'preferenceScore' | 'interactionCount' | 'lastInteraction' | 'learningConfidence';
  /** Sort direction */
  sortOrder?: 'ASC' | 'DESC';
  /** Limit results */
  limit?: number;
}

/**
 * Preference statistics
 */
export interface PreferenceStatistics {
  /** Total number of preferences */
  totalPreferences: number;
  /** Preferences by context */
  contextDistribution: Record<InteractionContext, number>;
  /** Average preference scores */
  averageScores: {
    overall: number;
    byContext: Record<InteractionContext, number>;
  };
  /** Learning confidence statistics */
  confidenceStats: {
    average: number;
    distribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  /** Interaction statistics */
  interactionStats: {
    total: number;
    average: number;
    byContext: Record<InteractionContext, number>;
  };
  /** Feedback statistics */
  feedbackStats: {
    total: number;
    byType: Record<FeedbackType, number>;
    averageRating: number;
  };
  /** Recent activity */
  recentActivity: {
    lastWeek: number;
    lastMonth: number;
    lastQuarter: number;
  };
}

/**
 * Data migration result
 */
export interface MigrationResult {
  /** Migration success status */
  success: boolean;
  /** Number of records migrated */
  migrated: number;
  /** Number of records failed */
  failed: number;
  /** Migration warnings */
  warnings: string[];
  /** Migration errors */
  errors: string[];
  /** Migration duration */
  duration: number;
}

/**
 * User Preference Persistence Service
 * 
 * Handles persistence, backup, and retrieval of user preference data.
 * Provides efficient querying, caching, and data management capabilities
 * for the preference learning system.
 */
@Injectable()
export class UserPreferencePersistenceService extends LangChainBaseService {
  private readonly preferenceCache = new Map<string, UserPersonalityPreference>();
  private readonly cacheTimeout = 10 * 60 * 1000; // 10 minutes
  private readonly cacheMetadata = new Map<string, { timestamp: number; hits: number }>();

  constructor(
    @InjectRepository(UserPersonalityPreference)
    private readonly preferenceRepository: Repository<UserPersonalityPreference>,
    @InjectRepository(PersonalityProfile)
    private readonly personalityRepository: Repository<PersonalityProfile>,
  ) {
    super('UserPreferencePersistenceService');
  }

  /**
   * Get user preference for specific personality and context
   */
  async getPreference(
    personalityId: string,
    context: InteractionContext
  ): Promise<UserPersonalityPreference | null> {
    const cacheKey = `${personalityId}-${context}`;
    
    // Check cache first
    const cached = this.getCachedPreference(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const preference = await this.preferenceRepository.findOne({
        where: {
          personalityId,
          interactionContext: context,
        },
      });

      if (preference) {
        this.setCachedPreference(cacheKey, preference);
      }

      return preference;
    } catch (error) {
      this.logger.error('Failed to get preference', { personalityId, context, error });
      return null;
    }
  }

  /**
   * Get all preferences for a personality across all contexts
   */
  async getPersonalityPreferences(personalityId: string): Promise<UserPersonalityPreference[]> {
    this.logExecution('getPersonalityPreferences', { personalityId });

    try {
      return await this.preferenceRepository.find({
        where: { personalityId },
        order: { preferenceScore: 'DESC', interactionCount: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get personality preferences', { personalityId, error });
      return [];
    }
  }

  /**
   * Get preferences for a specific context across all personalities
   */
  async getContextPreferences(context: InteractionContext): Promise<UserPersonalityPreference[]> {
    this.logExecution('getContextPreferences', { context });

    try {
      return await this.preferenceRepository.find({
        where: { interactionContext: context },
        order: { preferenceScore: 'DESC', learningConfidence: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get context preferences', { context, error });
      return [];
    }
  }

  /**
   * Query preferences with advanced filtering and sorting
   */
  async queryPreferences(options: PreferenceQueryOptions): Promise<UserPersonalityPreference[]> {
    this.logExecution('queryPreferences', { options });

    try {
      const queryBuilder = this.preferenceRepository.createQueryBuilder('preference');

      // Apply filters
      if (options.contexts && options.contexts.length > 0) {
        queryBuilder.andWhere('preference.interactionContext IN (:...contexts)', {
          contexts: options.contexts,
        });
      }

      if (options.personalityIds && options.personalityIds.length > 0) {
        queryBuilder.andWhere('preference.personalityId IN (:...personalityIds)', {
          personalityIds: options.personalityIds,
        });
      }

      if (options.minPreferenceScore !== undefined) {
        queryBuilder.andWhere('preference.preferenceScore >= :minScore', {
          minScore: options.minPreferenceScore,
        });
      }

      if (options.minInteractionCount !== undefined) {
        queryBuilder.andWhere('preference.interactionCount >= :minCount', {
          minCount: options.minInteractionCount,
        });
      }

      if (options.highConfidenceOnly) {
        queryBuilder.andWhere('preference.learningConfidence >= :minConfidence', {
          minConfidence: 0.7,
        });
      }

      if (options.dateRange) {
        queryBuilder.andWhere('preference.lastInteraction BETWEEN :from AND :to', {
          from: options.dateRange.from,
          to: options.dateRange.to,
        });
      }

      // Apply sorting
      if (options.sortBy) {
        const order = options.sortOrder || 'DESC';
        queryBuilder.orderBy(`preference.${options.sortBy}`, order);
      }

      // Apply limit
      if (options.limit) {
        queryBuilder.limit(options.limit);
      }

      const results = await queryBuilder.getMany();

      this.logger.debug('Preference query completed', {
        resultsCount: results.length,
        filters: options,
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to query preferences', { options, error });
      return [];
    }
  }

  /**
   * Save or update a preference
   */
  async savePreference(preference: UserPersonalityPreference): Promise<UserPersonalityPreference> {
    this.logExecution('savePreference', {
      personalityId: preference.personalityId,
      context: preference.interactionContext,
    });

    try {
      const saved = await this.preferenceRepository.save(preference);
      
      // Update cache
      const cacheKey = `${preference.personalityId}-${preference.interactionContext}`;
      this.setCachedPreference(cacheKey, saved);

      this.logger.debug('Preference saved', {
        id: saved.id,
        preferenceScore: saved.preferenceScore,
        interactionCount: saved.interactionCount,
      });

      return saved;
    } catch (error) {
      this.logger.error('Failed to save preference', { preference: preference.id, error });
      throw error;
    }
  }

  /**
   * Batch save multiple preferences
   */
  async batchSavePreferences(preferences: UserPersonalityPreference[]): Promise<UserPersonalityPreference[]> {
    this.logExecution('batchSavePreferences', { count: preferences.length });

    try {
      const saved = await this.preferenceRepository.save(preferences);
      
      // Update cache for all saved preferences
      saved.forEach(preference => {
        const cacheKey = `${preference.personalityId}-${preference.interactionContext}`;
        this.setCachedPreference(cacheKey, preference);
      });

      this.logger.debug('Preferences batch saved', { count: saved.length });

      return saved;
    } catch (error) {
      this.logger.error('Failed to batch save preferences', { count: preferences.length, error });
      throw error;
    }
  }

  /**
   * Delete a preference
   */
  async deletePreference(personalityId: string, context: InteractionContext): Promise<boolean> {
    this.logExecution('deletePreference', { personalityId, context });

    try {
      const result = await this.preferenceRepository.delete({
        personalityId,
        interactionContext: context,
      });

      if (result.affected && result.affected > 0) {
        // Remove from cache
        const cacheKey = `${personalityId}-${context}`;
        this.preferenceCache.delete(cacheKey);
        this.cacheMetadata.delete(cacheKey);

        this.logger.debug('Preference deleted', { personalityId, context });
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to delete preference', { personalityId, context, error });
      return false;
    }
  }

  /**
   * Get comprehensive preference statistics
   */
  async getPreferenceStatistics(): Promise<PreferenceStatistics> {
    this.logExecution('getPreferenceStatistics');

    try {
      const allPreferences = await this.preferenceRepository.find();

      if (allPreferences.length === 0) {
        return this.getEmptyStatistics();
      }

      // Context distribution
      const contextDistribution: Record<InteractionContext, number> = {} as any;
      Object.values(InteractionContext).forEach(context => {
        contextDistribution[context] = allPreferences.filter(
          p => p.interactionContext === context
        ).length;
      });

      // Average scores
      const overallAverage = allPreferences.reduce(
        (sum, p) => sum + p.preferenceScore, 0
      ) / allPreferences.length;

      const averageScoresByContext: Record<InteractionContext, number> = {} as any;
      Object.values(InteractionContext).forEach(context => {
        const contextPrefs = allPreferences.filter(p => p.interactionContext === context);
        if (contextPrefs.length > 0) {
          averageScoresByContext[context] = contextPrefs.reduce(
            (sum, p) => sum + p.preferenceScore, 0
          ) / contextPrefs.length;
        }
      });

      // Confidence statistics
      const averageConfidence = allPreferences.reduce(
        (sum, p) => sum + p.learningConfidence, 0
      ) / allPreferences.length;

      const confidenceDistribution = {
        low: allPreferences.filter(p => p.learningConfidence < 0.3).length,
        medium: allPreferences.filter(p => p.learningConfidence >= 0.3 && p.learningConfidence < 0.7).length,
        high: allPreferences.filter(p => p.learningConfidence >= 0.7).length,
      };

      // Interaction statistics
      const totalInteractions = allPreferences.reduce(
        (sum, p) => sum + p.interactionCount, 0
      );
      const averageInteractions = totalInteractions / allPreferences.length;

      const interactionsByContext: Record<InteractionContext, number> = {} as any;
      Object.values(InteractionContext).forEach(context => {
        interactionsByContext[context] = allPreferences
          .filter(p => p.interactionContext === context)
          .reduce((sum, p) => sum + p.interactionCount, 0);
      });

      // Feedback statistics
      const allFeedback = allPreferences.flatMap(p => p.feedback);
      const feedbackByType: Record<FeedbackType, number> = {} as any;
      Object.values(FeedbackType).forEach(type => {
        feedbackByType[type] = allFeedback.filter(f => f.type === type).length;
      });

      const ratedFeedback = allFeedback.filter(f => f.score !== undefined);
      const averageRating = ratedFeedback.length > 0
        ? ratedFeedback.reduce((sum, f) => sum + (f.score || 0), 0) / ratedFeedback.length
        : 0;

      // Recent activity
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const recentActivity = {
        lastWeek: allPreferences.filter(p => p.lastInteraction >= weekAgo).length,
        lastMonth: allPreferences.filter(p => p.lastInteraction >= monthAgo).length,
        lastQuarter: allPreferences.filter(p => p.lastInteraction >= quarterAgo).length,
      };

      return {
        totalPreferences: allPreferences.length,
        contextDistribution,
        averageScores: {
          overall: overallAverage,
          byContext: averageScoresByContext,
        },
        confidenceStats: {
          average: averageConfidence,
          distribution: confidenceDistribution,
        },
        interactionStats: {
          total: totalInteractions,
          average: averageInteractions,
          byContext: interactionsByContext,
        },
        feedbackStats: {
          total: allFeedback.length,
          byType: feedbackByType,
          averageRating,
        },
        recentActivity,
      };
    } catch (error) {
      this.logger.error('Failed to get preference statistics', error);
      return this.getEmptyStatistics();
    }
  }

  /**
   * Create backup of all preference data
   */
  async createBackup(options: PreferenceBackupOptions = {
    includeFullHistory: true,
    includeMetrics: true,
    includeBehaviorPatterns: true,
    compress: false,
    encrypt: false,
  }): Promise<{
    backup: any;
    metadata: {
      createdAt: Date;
      totalRecords: number;
      dataSize: number;
      version: string;
    };
  }> {
    this.logExecution('createBackup', { options });

    try {
      let query = this.preferenceRepository.createQueryBuilder('preference');

      // Apply date range if specified
      if (options.dateRange) {
        query = query.where('preference.createdAt BETWEEN :from AND :to', {
          from: options.dateRange.from,
          to: options.dateRange.to,
        });
      }

      const preferences = await query.getMany();

      // Prepare backup data
      const backupData = {
        preferences: preferences.map(p => ({
          ...p,
          feedback: options.includeFullHistory ? p.feedback : p.feedback.slice(-5),
          interactionPatterns: options.includeBehaviorPatterns ? p.interactionPatterns : undefined,
          contextualPerformance: options.includeMetrics ? p.contextualPerformance : undefined,
        })),
        metadata: {
          exportedAt: new Date(),
          version: '1.0.0',
          options,
        },
      };

      const backup = options.compress ? this.compressData(backupData) : backupData;
      const finalBackup = options.encrypt ? this.encryptData(backup) : backup;

      const metadata = {
        createdAt: new Date(),
        totalRecords: preferences.length,
        dataSize: JSON.stringify(finalBackup).length,
        version: '1.0.0',
      };

      this.logger.debug('Backup created', metadata);

      return { backup: finalBackup, metadata };
    } catch (error) {
      this.logger.error('Failed to create backup', error);
      throw error;
    }
  }

  /**
   * Restore preferences from backup
   */
  async restoreFromBackup(
    backupData: any,
    options: {
      overwriteExisting: boolean;
      validateData: boolean;
      dryRun: boolean;
    } = {
      overwriteExisting: false,
      validateData: true,
      dryRun: false,
    }
  ): Promise<MigrationResult> {
    this.logExecution('restoreFromBackup', { options });

    const startTime = Date.now();
    let migrated = 0;
    let failed = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Decrypt if needed
      let processedData = backupData;
      if (backupData.encrypted) {
        processedData = this.decryptData(backupData);
      }

      // Decompress if needed
      if (processedData.compressed) {
        processedData = this.decompressData(processedData);
      }

      const preferences = processedData.preferences || [];

      if (options.validateData) {
        const validation = this.validateBackupData(preferences);
        if (!validation.valid) {
          warnings.push(...validation.warnings);
          errors.push(...validation.errors);
        }
      }

      if (options.dryRun) {
        return {
          success: true,
          migrated: preferences.length,
          failed: 0,
          warnings: [...warnings, 'Dry run completed successfully'],
          errors,
          duration: Date.now() - startTime,
        };
      }

      // Process each preference
      for (const preferenceData of preferences) {
        try {
          const existing = await this.preferenceRepository.findOne({
            where: {
              personalityId: preferenceData.personalityId,
              interactionContext: preferenceData.interactionContext,
            },
          });

          if (existing && !options.overwriteExisting) {
            warnings.push(`Skipped existing preference: ${preferenceData.personalityId}-${preferenceData.interactionContext}`);
            continue;
          }

          // Create or update preference
          const preference = existing || new UserPersonalityPreference();
          Object.assign(preference, preferenceData, {
            id: existing?.id, // Preserve existing ID
            updatedAt: new Date(),
          });

          await this.preferenceRepository.save(preference);
          migrated++;

          // Clear cache for updated preference
          const cacheKey = `${preference.personalityId}-${preference.interactionContext}`;
          this.preferenceCache.delete(cacheKey);
          this.cacheMetadata.delete(cacheKey);
        } catch (error) {
          failed++;
          errors.push(`Failed to migrate preference: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const result: MigrationResult = {
        success: errors.length === 0,
        migrated,
        failed,
        warnings,
        errors,
        duration: Date.now() - startTime,
      };

      this.logger.debug('Backup restoration completed', result);

      return result;
    } catch (error) {
      this.logger.error('Failed to restore from backup', error);
      return {
        success: false,
        migrated,
        failed: failed + 1,
        warnings,
        errors: [...errors, `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Clean up old preference data
   */
  async cleanupOldData(
    olderThanDays: number,
    options: {
      dryRun: boolean;
      preserveHighValue: boolean;
      preserveMinInteractions: number;
    } = {
      dryRun: false,
      preserveHighValue: true,
      preserveMinInteractions: 5,
    }
  ): Promise<{
    cleaned: number;
    preserved: number;
    errors: number;
  }> {
    this.logExecution('cleanupOldData', { olderThanDays, options });

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let query = this.preferenceRepository.createQueryBuilder('preference')
        .where('preference.lastInteraction < :cutoffDate', { cutoffDate });

      if (options.preserveHighValue) {
        query = query.andWhere('preference.preferenceScore < :minScore', { minScore: 0.7 });
      }

      if (options.preserveMinInteractions) {
        query = query.andWhere('preference.interactionCount < :minInteractions', { 
          minInteractions: options.preserveMinInteractions 
        });
      }

      const toCleanup = await query.getMany();

      if (options.dryRun) {
        return {
          cleaned: 0,
          preserved: toCleanup.length,
          errors: 0,
        };
      }

      let cleaned = 0;
      let errors = 0;

      for (const preference of toCleanup) {
        try {
          await this.preferenceRepository.remove(preference);
          
          // Remove from cache
          const cacheKey = `${preference.personalityId}-${preference.interactionContext}`;
          this.preferenceCache.delete(cacheKey);
          this.cacheMetadata.delete(cacheKey);
          
          cleaned++;
        } catch (error) {
          this.logger.warn('Failed to cleanup preference', { id: preference.id, error });
          errors++;
        }
      }

      this.logger.debug('Data cleanup completed', { cleaned, errors });

      return { cleaned, preserved: 0, errors };
    } catch (error) {
      this.logger.error('Failed to cleanup old data', error);
      return { cleaned: 0, preserved: 0, errors: 1 };
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.preferenceCache.clear();
    this.cacheMetadata.clear();
    this.logger.debug('Preference cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    size: number;
    hitRates: Record<string, { hits: number; lastAccess: Date }>;
    memoryUsage: number;
  } {
    const hitRates: Record<string, { hits: number; lastAccess: Date }> = {};
    
    this.cacheMetadata.forEach((metadata, key) => {
      hitRates[key] = {
        hits: metadata.hits,
        lastAccess: new Date(metadata.timestamp),
      };
    });

    return {
      size: this.preferenceCache.size,
      hitRates,
      memoryUsage: this.estimateCacheMemoryUsage(),
    };
  }

  // Private helper methods

  private getCachedPreference(cacheKey: string): UserPersonalityPreference | null {
    const cached = this.preferenceCache.get(cacheKey);
    const metadata = this.cacheMetadata.get(cacheKey);

    if (cached && metadata) {
      // Check if cache is still valid
      if (Date.now() - metadata.timestamp < this.cacheTimeout) {
        // Update hit count and timestamp
        metadata.hits++;
        metadata.timestamp = Date.now();
        return cached;
      } else {
        // Cache expired, remove it
        this.preferenceCache.delete(cacheKey);
        this.cacheMetadata.delete(cacheKey);
      }
    }

    return null;
  }

  private setCachedPreference(cacheKey: string, preference: UserPersonalityPreference): void {
    this.preferenceCache.set(cacheKey, preference);
    this.cacheMetadata.set(cacheKey, {
      timestamp: Date.now(),
      hits: 0,
    });
  }

  private getEmptyStatistics(): PreferenceStatistics {
    const emptyContextRecord: Record<InteractionContext, number> = {} as any;
    const emptyFeedbackRecord: Record<FeedbackType, number> = {} as any;

    Object.values(InteractionContext).forEach(context => {
      emptyContextRecord[context] = 0;
    });

    Object.values(FeedbackType).forEach(type => {
      emptyFeedbackRecord[type] = 0;
    });

    return {
      totalPreferences: 0,
      contextDistribution: emptyContextRecord,
      averageScores: {
        overall: 0,
        byContext: emptyContextRecord,
      },
      confidenceStats: {
        average: 0,
        distribution: { low: 0, medium: 0, high: 0 },
      },
      interactionStats: {
        total: 0,
        average: 0,
        byContext: emptyContextRecord,
      },
      feedbackStats: {
        total: 0,
        byType: emptyFeedbackRecord,
        averageRating: 0,
      },
      recentActivity: {
        lastWeek: 0,
        lastMonth: 0,
        lastQuarter: 0,
      },
    };
  }

  private compressData(data: any): any {
    // In a real implementation, this would use a compression algorithm
    return { compressed: true, data: JSON.stringify(data) };
  }

  private decompressData(data: any): any {
    // In a real implementation, this would decompress the data
    return JSON.parse(data.data);
  }

  private encryptData(data: any): any {
    // In a real implementation, this would encrypt the data
    return { encrypted: true, data: Buffer.from(JSON.stringify(data)).toString('base64') };
  }

  private decryptData(data: any): any {
    // In a real implementation, this would decrypt the data
    return JSON.parse(Buffer.from(data.data, 'base64').toString());
  }

  private validateBackupData(preferences: any[]): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    preferences.forEach((pref, index) => {
      if (!pref.personalityId) {
        errors.push(`Preference ${index}: Missing personalityId`);
      }
      if (!pref.interactionContext) {
        errors.push(`Preference ${index}: Missing interactionContext`);
      }
      if (typeof pref.preferenceScore !== 'number') {
        warnings.push(`Preference ${index}: Invalid preferenceScore type`);
      }
    });

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  private estimateCacheMemoryUsage(): number {
    // Rough estimate of cache memory usage in bytes
    let totalSize = 0;
    
    this.preferenceCache.forEach((preference, key) => {
      totalSize += key.length * 2; // String key (assuming UTF-16)
      totalSize += JSON.stringify(preference).length * 2; // Preference object
    });
    
    return totalSize;
  }
}