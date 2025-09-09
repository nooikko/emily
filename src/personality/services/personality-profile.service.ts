import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In } from 'typeorm';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { CreatePersonalityProfileDto } from '../dto/create-personality-profile.dto';
import { PersonalitySearchDto } from '../dto/create-personality-profile.dto';
import { UpdatePersonalityProfileDto } from '../dto/update-personality-profile.dto';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import type {
  CompiledPersonalityTemplate,
  PersonalityRecommendation,
  PersonalitySearchCriteria,
  PersonalityServiceOperations,
  PersonalitySwitchContext,
  PersonalityUsageStats,
  PersonalityValidationResult,
} from '../interfaces/personality.interface';
import { PersonalityTemplateService } from './personality-template.service';

/**
 * Personality Profile Service
 * 
 * Provides comprehensive CRUD operations and business logic for personality profiles.
 * Integrates with LangChain template system for dynamic personality management.
 * 
 * Features:
 * - Full CRUD operations with validation
 * - Personality switching and context management
 * - Template compilation and caching
 * - Usage analytics and recommendations
 * - Search and filtering capabilities
 */
@Injectable()
export class PersonalityProfileService extends LangChainBaseService implements PersonalityServiceOperations {
  private currentActivePersonalityId: string | null = null;
  private usageStats = new Map<string, PersonalityUsageStats>();

  constructor(
    @InjectRepository(PersonalityProfile)
    private readonly personalityRepository: Repository<PersonalityProfile>,
    private readonly templateService: PersonalityTemplateService,
  ) {
    super('PersonalityProfileService');
  }

  /**
   * Create a new personality profile
   */
  async create(createDto: CreatePersonalityProfileDto): Promise<PersonalityProfile> {
    this.logExecution('create', { name: createDto.name, category: createDto.category });

    // Check for duplicate names
    const existing = await this.personalityRepository.findOne({
      where: { name: createDto.name }
    });

    if (existing) {
      throw new ConflictException(`Personality profile with name '${createDto.name}' already exists`);
    }

    // Create entity
    const personality = this.personalityRepository.create({
      ...createDto,
      examples: createDto.examples || [],
      tags: createDto.tags || [],
      isActive: createDto.isActive || false,
      metadata: createDto.metadata || {},
    });

    // Validate configuration
    const validation = await this.validatePersonality(personality);
    if (!validation.isValid) {
      throw new BadRequestException(`Personality validation failed: ${validation.errors.join(', ')}`);
    }

    // If this is set to be active, deactivate others
    if (personality.isActive) {
      await this.deactivateAllPersonalities();
      this.currentActivePersonalityId = personality.id;
    }

    // Save to database
    const saved = await this.personalityRepository.save(personality);

    this.logger.log('Personality profile created', {
      id: saved.id,
      name: saved.name,
      category: saved.category,
    });

    return saved;
  }

  /**
   * Find all personality profiles with optional filtering
   */
  async findAll(searchCriteria?: PersonalitySearchDto): Promise<PersonalityProfile[]> {
    this.logExecution('findAll', { searchCriteria });

    const whereConditions: FindOptionsWhere<PersonalityProfile> = {};

    if (searchCriteria?.category) {
      whereConditions.category = searchCriteria.category;
    }

    if (searchCriteria?.includeActiveOnly) {
      whereConditions.isActive = true;
    }

    if (searchCriteria?.includeSystemPersonalities === false) {
      whereConditions.isSystemPersonality = false;
    }

    // Handle search query
    if (searchCriteria?.query) {
      const searchQuery = `%${searchCriteria.query}%`;
      const profiles = await this.personalityRepository
        .createQueryBuilder('profile')
        .where(whereConditions)
        .andWhere('(profile.name ILIKE :query OR profile.description ILIKE :query)', { query: searchQuery })
        .getMany();

      return this.filterByTags(profiles, searchCriteria.tags);
    }

    const profiles = await this.personalityRepository.find({ where: whereConditions });
    return this.filterByTags(profiles, searchCriteria?.tags);
  }

  /**
   * Find a single personality profile by ID
   */
  async findOne(id: string): Promise<PersonalityProfile> {
    this.logExecution('findOne', { id });

    const personality = await this.personalityRepository.findOne({
      where: { id }
    });

    if (!personality) {
      throw new NotFoundException(`Personality profile with ID '${id}' not found`);
    }

    return personality;
  }

  /**
   * Update a personality profile
   */
  async update(id: string, updateDto: UpdatePersonalityProfileDto): Promise<PersonalityProfile> {
    this.logExecution('update', { id, incrementVersion: updateDto.incrementVersion });

    const personality = await this.findOne(id);

    // Check for name conflicts if name is being updated
    if (updateDto.name && updateDto.name !== personality.name) {
      const existing = await this.personalityRepository.findOne({
        where: { name: updateDto.name }
      });

      if (existing) {
        throw new ConflictException(`Personality profile with name '${updateDto.name}' already exists`);
      }
    }

    // Update fields
    Object.assign(personality, updateDto);

    // Increment version if requested
    if (updateDto.incrementVersion) {
      personality.version += 1;
    }

    // Validate updated configuration
    const validation = await this.validatePersonality(personality);
    if (!validation.isValid) {
      throw new BadRequestException(`Personality validation failed: ${validation.errors.join(', ')}`);
    }

    // Handle active status changes
    if (updateDto.isActive === true && !personality.isActive) {
      await this.deactivateAllPersonalities();
      this.currentActivePersonalityId = personality.id;
    } else if (updateDto.isActive === false && personality.isActive) {
      this.currentActivePersonalityId = null;
    }

    // Save changes
    const updated = await this.personalityRepository.save(personality);

    // Clear template cache for this personality
    this.templateService.clearCache();

    this.logger.log('Personality profile updated', {
      id: updated.id,
      name: updated.name,
      version: updated.version,
    });

    return updated;
  }

  /**
   * Delete a personality profile
   */
  async remove(id: string): Promise<void> {
    this.logExecution('remove', { id });

    const personality = await this.findOne(id);

    // Prevent deletion of system personalities
    if (personality.isSystemPersonality) {
      throw new BadRequestException('Cannot delete system personality profiles');
    }

    // Clear active status if this was the active personality
    if (personality.isActive) {
      this.currentActivePersonalityId = null;
    }

    await this.personalityRepository.remove(personality);

    // Clear template cache
    this.templateService.clearCache();

    this.logger.log('Personality profile deleted', { id, name: personality.name });
  }

  /**
   * Switch to a different personality
   */
  async switchPersonality(
    personalityId: string,
    context?: PersonalitySwitchContext
  ): Promise<CompiledPersonalityTemplate> {
    this.logExecution('switchPersonality', { personalityId, context });

    const personality = await this.findOne(personalityId);

    // Deactivate current personality
    if (this.currentActivePersonalityId && this.currentActivePersonalityId !== personalityId) {
      await this.deactivatePersonality(this.currentActivePersonalityId);
    }

    // Activate new personality
    personality.isActive = true;
    await this.personalityRepository.save(personality);
    this.currentActivePersonalityId = personalityId;

    // Update usage statistics
    this.updateUsageStats(personalityId);

    // Compile templates
    const compiledTemplate = await this.templateService.compilePersonalityTemplates(personality);

    this.logger.log('Personality switched successfully', {
      newPersonalityId: personalityId,
      newPersonalityName: personality.name,
      previousPersonalityId: context?.previousPersonalityId,
    });

    return compiledTemplate;
  }

  /**
   * Get current active personality
   */
  async getCurrentPersonality(): Promise<CompiledPersonalityTemplate | null> {
    if (!this.currentActivePersonalityId) {
      return null;
    }

    try {
      const personality = await this.findOne(this.currentActivePersonalityId);
      return await this.templateService.compilePersonalityTemplates(personality);
    } catch (error) {
      this.logger.warn('Failed to get current personality', { 
        personalityId: this.currentActivePersonalityId,
        error: error.message 
      });
      this.currentActivePersonalityId = null;
      return null;
    }
  }

  /**
   * Recommend personalities based on context
   */
  async recommendPersonalities(
    context: string,
    limit: number = 5
  ): Promise<PersonalityRecommendation[]> {
    this.logExecution('recommendPersonalities', { context, limit });

    const personalities = await this.findAll();
    const recommendations: PersonalityRecommendation[] = [];

    for (const personality of personalities) {
      const confidence = this.calculateRecommendationConfidence(personality, context);
      
      if (confidence > 0.3) { // Only include personalities with reasonable confidence
        const matchingTraits = this.findMatchingTraits(personality, context);
        
        recommendations.push({
          personalityId: personality.id,
          confidence,
          reason: this.generateRecommendationReason(personality, context, matchingTraits),
          matchingTraits: matchingTraits.map(t => t.name),
          usageFactors: this.getUsageFactors(personality.id),
        });
      }
    }

    // Sort by confidence and limit results
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get personality usage analytics
   */
  async getUsageStats(personalityId: string): Promise<PersonalityUsageStats> {
    const stats = this.usageStats.get(personalityId);
    
    if (!stats) {
      return {
        personalityId,
        usageCount: 0,
        lastUsedAt: new Date(0),
        commonUseCases: [],
      };
    }

    return stats;
  }

  /**
   * Validate personality configuration
   */
  async validatePersonality(personality: PersonalityProfile | string): Promise<PersonalityValidationResult> {
    let personalityEntity: PersonalityProfile;

    if (typeof personality === 'string') {
      personalityEntity = await this.findOne(personality);
    } else {
      personalityEntity = personality;
    }

    return this.templateService.validatePersonalityConfiguration(personalityEntity);
  }

  /**
   * Search personalities with advanced criteria
   */
  async searchPersonalities(criteria: PersonalitySearchCriteria): Promise<PersonalityProfile[]> {
    this.logExecution('searchPersonalities', { criteria });

    let query = this.personalityRepository.createQueryBuilder('personality');

    // Text search
    if (criteria.query) {
      query = query.andWhere(
        '(personality.name ILIKE :query OR personality.description ILIKE :query)',
        { query: `%${criteria.query}%` }
      );
    }

    // Category filter
    if (criteria.category) {
      query = query.andWhere('personality.category = :category', { category: criteria.category });
    }

    // System personality filter
    if (criteria.includeSystemPersonalities === false) {
      query = query.andWhere('personality.isSystemPersonality = :isSystem', { isSystem: false });
    }

    // Active personality filter
    if (criteria.includeActiveOnly === true) {
      query = query.andWhere('personality.isActive = :isActive', { isActive: true });
    }

    const personalities = await query.getMany();

    // Apply client-side filters for complex criteria
    return personalities.filter(personality => {
      // Tags filter
      if (criteria.tags && criteria.tags.length > 0) {
        const hasMatchingTag = criteria.tags.some(tag => personality.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // Traits filter
      if (criteria.traits) {
        const hasMatchingTraits = Object.entries(criteria.traits).every(([traitName, traitValue]) =>
          personality.getTraitValue(traitName) === traitValue
        );
        if (!hasMatchingTraits) return false;
      }

      return true;
    });
  }

  /**
   * Get personality by name (helper method)
   */
  async findByName(name: string): Promise<PersonalityProfile | null> {
    return this.personalityRepository.findOne({ where: { name } });
  }

  /**
   * Bulk import personalities
   */
  async bulkImport(personalities: CreatePersonalityProfileDto[]): Promise<{
    success: PersonalityProfile[];
    failures: Array<{ dto: CreatePersonalityProfileDto; error: string }>;
  }> {
    this.logExecution('bulkImport', { count: personalities.length });

    const success: PersonalityProfile[] = [];
    const failures: Array<{ dto: CreatePersonalityProfileDto; error: string }> = [];

    for (const dto of personalities) {
      try {
        const personality = await this.create(dto);
        success.push(personality);
      } catch (error) {
        failures.push({
          dto,
          error: error.message,
        });
      }
    }

    this.logger.log('Bulk import completed', {
      successCount: success.length,
      failureCount: failures.length,
    });

    return { success, failures };
  }

  /**
   * Export personalities to JSON
   */
  async exportPersonalities(includeSystemPersonalities = false): Promise<PersonalityProfile[]> {
    const whereConditions: FindOptionsWhere<PersonalityProfile> = {};
    
    if (!includeSystemPersonalities) {
      whereConditions.isSystemPersonality = false;
    }

    return this.personalityRepository.find({ where: whereConditions });
  }

  // Private helper methods

  private async deactivateAllPersonalities(): Promise<void> {
    await this.personalityRepository.update(
      { isActive: true },
      { isActive: false }
    );
  }

  private async deactivatePersonality(personalityId: string): Promise<void> {
    await this.personalityRepository.update(personalityId, { isActive: false });
  }

  private filterByTags(personalities: PersonalityProfile[], tags?: string[]): PersonalityProfile[] {
    if (!tags || tags.length === 0) {
      return personalities;
    }

    return personalities.filter(personality =>
      tags.some(tag => personality.tags.includes(tag))
    );
  }

  private calculateRecommendationConfidence(personality: PersonalityProfile, context: string): number {
    let confidence = 0.5; // Base confidence

    // Keyword matching
    const contextLower = context.toLowerCase();
    const descriptionLower = personality.description.toLowerCase();
    
    // Check category relevance
    if (contextLower.includes(personality.category)) {
      confidence += 0.2;
    }

    // Check tag relevance
    const matchingTags = personality.tags.filter(tag => contextLower.includes(tag.toLowerCase()));
    confidence += matchingTags.length * 0.1;

    // Check description similarity (simple keyword matching)
    const commonWords = ['help', 'assist', 'code', 'write', 'create', 'analyze', 'explain'];
    const contextWords = contextLower.split(/\s+/);
    const relevantWords = contextWords.filter(word => 
      commonWords.includes(word) || descriptionLower.includes(word)
    );
    confidence += relevantWords.length * 0.05;

    // Usage-based boost
    const usage = this.usageStats.get(personality.id);
    if (usage) {
      confidence += Math.min(usage.usageCount / 100, 0.2); // Cap usage boost at 0.2
    }

    return Math.min(confidence, 1.0); // Cap at 1.0
  }

  private findMatchingTraits(personality: PersonalityProfile, context: string) {
    const contextLower = context.toLowerCase();
    
    return personality.traits.filter(trait => {
      const traitValueLower = trait.value.toLowerCase();
      return contextLower.includes(traitValueLower) || 
             contextLower.includes(trait.name.toLowerCase());
    });
  }

  private generateRecommendationReason(
    personality: PersonalityProfile, 
    context: string, 
    matchingTraits: any[]
  ): string {
    const reasons: string[] = [];

    if (matchingTraits.length > 0) {
      reasons.push(`matches your ${matchingTraits.map(t => t.name).join(', ')} requirements`);
    }

    if (context.toLowerCase().includes(personality.category)) {
      reasons.push(`specialized in ${personality.category} tasks`);
    }

    const usage = this.usageStats.get(personality.id);
    if (usage && usage.usageCount > 10) {
      reasons.push('has proven reliability based on usage history');
    }

    return reasons.length > 0 
      ? `This personality ${reasons.join(' and ')}`
      : 'Good general match for your context';
  }

  private getUsageFactors(personalityId: string) {
    const usage = this.usageStats.get(personalityId);
    if (!usage) return undefined;

    return {
      popularityScore: Math.min(usage.usageCount / 50, 1.0),
      successRate: 0.85, // Would be calculated from actual feedback
      userFeedback: usage.satisfactionRating || 4.0,
    };
  }

  private updateUsageStats(personalityId: string): void {
    const existing = this.usageStats.get(personalityId) || {
      personalityId,
      usageCount: 0,
      lastUsedAt: new Date(),
      commonUseCases: [],
    };

    existing.usageCount += 1;
    existing.lastUsedAt = new Date();

    this.usageStats.set(personalityId, existing);
  }
}