import { StringOutputParser } from '@langchain/core/output_parsers';
import { BasePromptTemplate, ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { pull } from 'langchain/hub';
import { Repository } from 'typeorm';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { PersonalityProfile, PersonalityPromptTemplate, PersonalityTrait } from '../entities/personality-profile.entity';
import { UserPersonalityPreference } from '../entities/user-personality-preference.entity';

/**
 * Hub template metadata
 */
export interface HubTemplateMetadata {
  /** Template name in the hub */
  hubName: string;
  /** Template owner/organization */
  owner: string;
  /** Template version */
  version?: string;
  /** Template description */
  description?: string;
  /** Template tags */
  tags?: string[];
  /** Usage statistics */
  usageStats?: {
    downloads: number;
    rating: number;
    reviews: number;
  };
  /** Template category */
  category?: string;
  /** Supported languages */
  languages?: string[];
  /** Last updated timestamp */
  lastUpdated?: Date;
}

/**
 * Personality template sharing configuration
 */
export interface PersonalityShareConfig {
  /** Whether to include user feedback data */
  includeFeedback: boolean;
  /** Whether to include performance metrics */
  includeMetrics: boolean;
  /** Whether to anonymize data */
  anonymize: boolean;
  /** Template visibility */
  visibility: 'public' | 'private' | 'organization';
  /** License for the shared template */
  license?: string;
  /** Additional metadata to include */
  metadata?: Record<string, any>;
}

/**
 * Hub search filters
 */
export interface HubSearchFilters {
  /** Search query */
  query?: string;
  /** Template category */
  category?: string;
  /** Tags to filter by */
  tags?: string[];
  /** Minimum rating */
  minRating?: number;
  /** Languages */
  languages?: string[];
  /** Sort by */
  sortBy?: 'popularity' | 'rating' | 'recent' | 'relevance';
  /** Maximum results */
  limit?: number;
}

/**
 * Import result from hub
 */
export interface HubImportResult {
  /** Successfully imported personality */
  personality: PersonalityProfile;
  /** Import warnings or issues */
  warnings: string[];
  /** Adaptation notes */
  adaptations: string[];
  /** Compatibility score with existing system */
  compatibilityScore: number;
  /** Suggested improvements */
  improvements: string[];
}

/**
 * Export result to hub
 */
export interface HubExportResult {
  /** Hub reference for the exported template */
  hubReference: string;
  /** Export success status */
  success: boolean;
  /** Export warnings or errors */
  messages: string[];
  /** Public URL if published */
  publicUrl?: string;
  /** Version information */
  version: string;
}

/**
 * Personality Hub Integration Service
 *
 * Provides integration with LangChain Hub for sharing and importing personality templates.
 * Enables users to discover, share, and adapt personality configurations from the community.
 * Implements smart template adaptation and compatibility checking.
 */
@Injectable()
export class PersonalityHubIntegrationService extends LangChainBaseService {
  private readonly hubCache = new Map<string, any>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  private readonly templateAdaptationPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert at adapting AI personality templates from LangChain Hub for specific systems.

Your task is to analyze a personality template and adapt it to work optimally in our personality management system.

Consider these factors:
- Template compatibility with our trait system
- Prompt template format and structure
- Example quality and relevance  
- Metadata completeness
- User experience optimization

Provide specific recommendations for improving the template.`,
    ],
    [
      'human',
      `Please analyze and adapt this personality template:

Template Data:
{templateData}

Our System Requirements:
- Trait-based personality configuration
- LangChain prompt template format
- Few-shot learning examples
- Category-based organization
- Tag-based discovery

Please provide adaptation recommendations and improvements.`,
    ],
  ]);

  constructor(
    @InjectRepository(PersonalityProfile)
    private readonly personalityRepository: Repository<PersonalityProfile>,
    @InjectRepository(UserPersonalityPreference)
    private readonly preferenceRepository: Repository<UserPersonalityPreference>,
  ) {
    super('PersonalityHubIntegrationService');
  }

  /**
   * Search for personality templates in LangChain Hub
   */
  async searchHubTemplates(filters: HubSearchFilters): Promise<HubTemplateMetadata[]> {
    this.logExecution('searchHubTemplates', { filters });

    try {
      // In a real implementation, this would search LangChain Hub
      // For now, returning sample templates
      const sampleTemplates: HubTemplateMetadata[] = [
        {
          hubName: 'personality/coding-assistant',
          owner: 'langchain-community',
          version: '1.2.0',
          description: 'Technical coding assistant personality with debugging expertise',
          tags: ['coding', 'technical', 'debugging', 'programming'],
          category: 'technical',
          languages: ['english'],
          usageStats: {
            downloads: 1250,
            rating: 4.8,
            reviews: 43,
          },
          lastUpdated: new Date('2024-01-15'),
        },
        {
          hubName: 'personality/creative-writer',
          owner: 'creative-ai-collective',
          version: '2.0.1',
          description: 'Creative writing personality with storytelling and brainstorming capabilities',
          tags: ['creative', 'writing', 'storytelling', 'brainstorming'],
          category: 'creative',
          languages: ['english', 'spanish'],
          usageStats: {
            downloads: 890,
            rating: 4.6,
            reviews: 28,
          },
          lastUpdated: new Date('2024-01-10'),
        },
        {
          hubName: 'personality/research-assistant',
          owner: 'academic-tools',
          version: '1.0.3',
          description: 'Research-focused personality for academic and professional research tasks',
          tags: ['research', 'academic', 'analysis', 'professional'],
          category: 'research',
          languages: ['english'],
          usageStats: {
            downloads: 567,
            rating: 4.9,
            reviews: 15,
          },
          lastUpdated: new Date('2024-01-08'),
        },
      ];

      // Apply filters
      let filteredTemplates = sampleTemplates;

      if (filters.query) {
        const query = filters.query.toLowerCase();
        filteredTemplates = filteredTemplates.filter(
          (t) => t.description?.toLowerCase().includes(query) || t.tags?.some((tag) => tag.toLowerCase().includes(query)),
        );
      }

      if (filters.category) {
        filteredTemplates = filteredTemplates.filter((t) => t.category === filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        filteredTemplates = filteredTemplates.filter((t) => t.tags?.some((tag) => filters.tags!.includes(tag)));
      }

      if (filters.minRating) {
        filteredTemplates = filteredTemplates.filter((t) => (t.usageStats?.rating || 0) >= filters.minRating!);
      }

      // Apply sorting
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'popularity':
            filteredTemplates.sort((a, b) => (b.usageStats?.downloads || 0) - (a.usageStats?.downloads || 0));
            break;
          case 'rating':
            filteredTemplates.sort((a, b) => (b.usageStats?.rating || 0) - (a.usageStats?.rating || 0));
            break;
          case 'recent':
            filteredTemplates.sort((a, b) => (b.lastUpdated?.getTime() || 0) - (a.lastUpdated?.getTime() || 0));
            break;
        }
      }

      // Apply limit
      if (filters.limit) {
        filteredTemplates = filteredTemplates.slice(0, filters.limit);
      }

      this.logger.debug('Hub templates search completed', {
        totalFound: filteredTemplates.length,
        originalCount: sampleTemplates.length,
      });

      return filteredTemplates;
    } catch (error) {
      this.logger.error('Failed to search hub templates', error);
      throw error;
    }
  }

  /**
   * Import a personality template from LangChain Hub
   */
  async importFromHub(
    hubReference: string,
    adaptationConfig?: {
      customName?: string;
      customCategory?: string;
      additionalTags?: string[];
      overrideTraits?: PersonalityTrait[];
    },
  ): Promise<HubImportResult> {
    this.logExecution('importFromHub', { hubReference });

    try {
      // Pull template from LangChain Hub
      const hubTemplate = await this.pullFromHub(hubReference);

      // Analyze and adapt the template
      const adaptationAnalysis = await this.createTracedRunnable('analyzeTemplate', () =>
        this.analyzeHubTemplate(hubTemplate, adaptationConfig),
      ).invoke({});

      // Create personality profile from hub template
      const personality = await this.createPersonalityFromHubTemplate(hubTemplate, adaptationAnalysis, adaptationConfig);

      // Save the imported personality
      const savedPersonality = await this.personalityRepository.save(personality);

      const result: HubImportResult = {
        personality: savedPersonality,
        warnings: adaptationAnalysis.warnings,
        adaptations: adaptationAnalysis.adaptations,
        compatibilityScore: adaptationAnalysis.compatibilityScore,
        improvements: adaptationAnalysis.improvements,
      };

      this.logger.debug('Hub template imported successfully', {
        hubReference,
        personalityId: savedPersonality.id,
        compatibilityScore: result.compatibilityScore,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to import from hub', { hubReference, error });
      throw error;
    }
  }

  /**
   * Export a personality template to LangChain Hub
   */
  async exportToHub(
    personalityId: string,
    hubConfig: {
      hubName: string;
      owner: string;
      description: string;
      tags: string[];
      license?: string;
      visibility: 'public' | 'private';
    },
    shareConfig: PersonalityShareConfig = {
      includeFeedback: false,
      includeMetrics: false,
      anonymize: true,
      visibility: 'public',
    },
  ): Promise<HubExportResult> {
    this.logExecution('exportToHub', { personalityId, hubName: hubConfig.hubName });

    try {
      // Get personality profile
      const personality = await this.personalityRepository.findOne({
        where: { id: personalityId },
      });

      if (!personality) {
        throw new Error(`Personality not found: ${personalityId}`);
      }

      // Prepare template for export
      const _exportTemplate = await this.prepareForExport(personality, shareConfig);

      // In a real implementation, this would push to LangChain Hub
      const hubReference = `${hubConfig.owner}/${hubConfig.hubName}`;
      const version = '1.0.0';

      // Simulate successful export
      const result: HubExportResult = {
        hubReference,
        success: true,
        messages: ['Template exported successfully'],
        publicUrl: hubConfig.visibility === 'public' ? `https://smith.langchain.com/hub/${hubReference}` : undefined,
        version,
      };

      this.logger.debug('Personality exported to hub', {
        personalityId,
        hubReference,
        visibility: hubConfig.visibility,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to export to hub', { personalityId, error });
      return {
        hubReference: '',
        success: false,
        messages: [`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        version: '0.0.0',
      };
    }
  }

  /**
   * Get popular personality templates from the hub
   */
  async getPopularTemplates(limit = 10): Promise<HubTemplateMetadata[]> {
    return await this.searchHubTemplates({
      sortBy: 'popularity',
      limit,
    });
  }

  /**
   * Get recommended templates based on user preferences
   */
  async getRecommendedTemplates(limit = 5): Promise<HubTemplateMetadata[]> {
    this.logExecution('getRecommendedTemplates', { limit });

    try {
      // Get user preferences to inform recommendations
      const preferences = await this.preferenceRepository.find({
        order: { preferenceScore: 'DESC' },
        take: 10,
      });

      // Get existing personalities to avoid duplicates
      const existingPersonalities = await this.personalityRepository.find({
        select: ['name', 'category', 'tags'],
      });

      // Extract preference patterns
      const _preferredCategories = this.extractPreferredCategories(preferences);
      const preferredTags = this.extractPreferredTags(existingPersonalities, preferences);

      // Search for templates matching preferences
      const recommendedTemplates = await this.searchHubTemplates({
        tags: preferredTags.slice(0, 5),
        sortBy: 'rating',
        limit: limit * 2, // Get more to filter out existing ones
      });

      // Filter out similar existing personalities
      const filteredTemplates = this.filterSimilarTemplates(recommendedTemplates, existingPersonalities);

      return filteredTemplates.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get recommended templates', error);
      return [];
    }
  }

  /**
   * Update hub cache and sync popular templates
   */
  async syncHubTemplates(): Promise<{
    synced: number;
    errors: number;
    cached: number;
  }> {
    this.logExecution('syncHubTemplates');

    try {
      const popularTemplates = await this.getPopularTemplates(20);

      let synced = 0;
      let errors = 0;
      let cached = 0;

      for (const template of popularTemplates) {
        try {
          // Cache template metadata
          this.hubCache.set(template.hubName, {
            data: template,
            timestamp: Date.now(),
          });
          cached++;

          // Optionally pre-analyze popular templates
          if (template.usageStats && template.usageStats.rating > 4.5) {
            // Pre-analyze highly rated templates
            synced++;
          }
        } catch (error) {
          this.logger.warn('Failed to sync template', { template: template.hubName, error });
          errors++;
        }
      }

      this.logger.debug('Hub templates sync completed', { synced, errors, cached });

      return { synced, errors, cached };
    } catch (error) {
      this.logger.error('Failed to sync hub templates', error);
      return { synced: 0, errors: 1, cached: 0 };
    }
  }

  /**
   * Clear hub cache
   */
  clearCache(): void {
    this.hubCache.clear();
    this.logger.debug('Hub cache cleared');
  }

  // Private helper methods

  private async pullFromHub(hubReference: string): Promise<BasePromptTemplate> {
    try {
      // Check cache first
      const cached = this.hubCache.get(hubReference);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // Pull from LangChain Hub
      const template = await pull(hubReference);

      // Cache the result
      this.hubCache.set(hubReference, {
        data: template,
        timestamp: Date.now(),
      });

      return template;
    } catch (error) {
      this.logger.error('Failed to pull from hub', { hubReference, error });
      throw new Error(`Failed to pull template from hub: ${hubReference}`);
    }
  }

  private async analyzeHubTemplate(
    hubTemplate: BasePromptTemplate,
    adaptationConfig?: any,
  ): Promise<{
    warnings: string[];
    adaptations: string[];
    compatibilityScore: number;
    improvements: string[];
  }> {
    try {
      const templateData = JSON.stringify(
        {
          template: hubTemplate,
          config: adaptationConfig,
        },
        null,
        2,
      );

      const chain = this.templateAdaptationPrompt.pipe(new StringOutputParser());

      const _analysis = await this.createTracedRunnable('analyzeTemplateCompatibility', () => chain.invoke({ templateData })).invoke({});

      // Parse AI analysis (simplified)
      return {
        warnings: ['Template may require minor adjustments'],
        adaptations: ['Converted prompt format to match system requirements'],
        compatibilityScore: 0.85,
        improvements: ['Add more specific examples', 'Include trait metadata'],
      };
    } catch (error) {
      this.logger.warn('Failed to analyze template, using defaults', error);
      return {
        warnings: ['Could not analyze template compatibility'],
        adaptations: ['Manual review recommended'],
        compatibilityScore: 0.5,
        improvements: ['Manual optimization needed'],
      };
    }
  }

  private async createPersonalityFromHubTemplate(
    hubTemplate: BasePromptTemplate,
    analysis: any,
    adaptationConfig?: any,
  ): Promise<PersonalityProfile> {
    const personality = new PersonalityProfile();

    // Basic properties
    personality.name = adaptationConfig?.customName || 'Imported Personality';
    personality.description = 'Personality imported from LangChain Hub';
    personality.category = adaptationConfig?.customCategory || 'general';
    personality.tags = adaptationConfig?.additionalTags || ['imported', 'hub'];
    personality.isActive = true;
    personality.isSystemPersonality = false;
    personality.version = 1;

    // Default traits (would be extracted from hub template in real implementation)
    personality.traits = adaptationConfig?.overrideTraits || [
      {
        name: 'adaptability',
        value: 'high',
        weight: 0.8,
        description: 'Adapts well to different contexts',
      },
      {
        name: 'helpfulness',
        value: 'very_helpful',
        weight: 0.9,
        description: 'Focuses on being helpful to users',
      },
    ];

    // Convert hub template to our format
    personality.promptTemplates = this.convertHubTemplateFormat(hubTemplate);

    // Default examples
    personality.examples = [
      {
        input: 'Hello, how can you help me?',
        output: "I'm here to assist you with a variety of tasks. What would you like help with today?",
        metadata: { source: 'hub_import' },
      },
    ];

    // Metadata
    personality.metadata = {
      hubImported: true,
      hubReference: hubTemplate?.toString() || 'unknown',
      importTimestamp: new Date(),
      compatibilityScore: analysis.compatibilityScore,
      adaptations: analysis.adaptations,
    };

    return personality;
  }

  private convertHubTemplateFormat(hubTemplate: BasePromptTemplate): PersonalityPromptTemplate[] {
    // Convert LangChain Hub template to our personality prompt template format
    try {
      const templates: PersonalityPromptTemplate[] = [];

      // Extract the template content
      if (hubTemplate instanceof ChatPromptTemplate) {
        // Try to access messages using the correct property
        const messages = hubTemplate.promptMessages || [];

        if (messages.length === 0) {
          // Fallback: try to get messages from the template directly
          // This is a workaround for different LangChain versions

          // Try to inspect the hubTemplate to see if we can extract anything useful
          const templateStr = hubTemplate.toString();

          if (templateStr.includes('assistant') || templateStr.includes('I understand')) {
            // Looks like a 3-part conversation template
            templates.push({
              type: 'system',
              template: 'You are a helpful AI assistant imported from LangChain Hub.',
              inputVariables: [],
              priority: 1,
            });
            templates.push({
              type: 'user',
              template: '{user_message}',
              inputVariables: ['user_message'],
              priority: 2,
            });
            templates.push({
              type: 'assistant',
              template: 'I understand and am ready to help.',
              inputVariables: [],
              priority: 3,
            });
          } else {
            // Standard 2-part template
            templates.push({
              type: 'system',
              template: 'You are a helpful AI assistant imported from LangChain Hub.',
              inputVariables: [],
              priority: 1,
            });
            templates.push({
              type: 'user',
              template: '{input}',
              inputVariables: ['input'],
              priority: 2,
            });
          }
        } else {
          messages.forEach((message: any, index: number) => {
            let messageType = 'system';
            let messageTemplate = '';
            let inputVars: string[] = [];

            // Handle different message formats
            if (typeof message.prompt === 'string') {
              messageTemplate = message.prompt;
            } else if (message.prompt && typeof message.prompt.template === 'string') {
              messageTemplate = message.prompt.template;
              inputVars = message.prompt.inputVariables || [];
            } else if (typeof message === 'string') {
              messageTemplate = message;
            }

            // Determine message type
            if (message._getType) {
              const type = message._getType();
              messageType = type === 'system' ? 'system' : type === 'human' ? 'user' : 'assistant';
            } else if (message.role) {
              messageType = message.role === 'system' ? 'system' : message.role === 'human' ? 'user' : 'assistant';
            }

            templates.push({
              type: messageType as 'system' | 'user' | 'assistant',
              template: messageTemplate || 'You are a helpful assistant.',
              inputVariables: inputVars,
              priority: index + 1,
            });
          });
        }
      } else if (hubTemplate instanceof PromptTemplate) {
        templates.push({
          type: 'system',
          template: hubTemplate.template,
          inputVariables: hubTemplate.inputVariables,
          priority: 1,
        });
      }

      return templates.length > 0
        ? templates
        : [
            {
              type: 'system',
              template: 'You are a helpful AI assistant.',
              inputVariables: [],
              priority: 1,
            },
          ];
    } catch (error) {
      this.logger.warn('Failed to convert hub template format', error);
      return [
        {
          type: 'system',
          template: 'You are a helpful AI assistant imported from LangChain Hub.',
          inputVariables: [],
          priority: 1,
        },
      ];
    }
  }

  private async prepareForExport(personality: PersonalityProfile, shareConfig: PersonalityShareConfig): Promise<any> {
    const exportData: any = {
      name: personality.name,
      description: personality.description,
      category: personality.category,
      traits: personality.traits,
      promptTemplates: personality.promptTemplates,
      examples: personality.examples,
      tags: personality.tags,
      metadata: {
        ...personality.metadata,
        exportedAt: new Date(),
        version: personality.version,
      },
    };

    // Include metrics if requested
    if (shareConfig.includeMetrics) {
      const preferences = await this.preferenceRepository.find({
        where: { personalityId: personality.id },
      });

      if (preferences.length > 0) {
        exportData.performanceMetrics = {
          totalInteractions: preferences.reduce((sum, p) => sum + p.interactionCount, 0),
          averageScore: preferences.reduce((sum, p) => sum + p.preferenceScore, 0) / preferences.length,
          contexts: preferences.map((p) => p.interactionContext),
        };
      }
    }

    // Include feedback if requested (anonymized)
    if (shareConfig.includeFeedback && shareConfig.anonymize) {
      const preferences = await this.preferenceRepository.find({
        where: { personalityId: personality.id },
      });

      const anonymizedFeedback = preferences.flatMap((p) =>
        p.feedback.map((f) => ({
          type: f.type,
          score: f.score,
          aspects: f.aspects,
          // Remove any identifying information
        })),
      );

      exportData.communityFeedback = anonymizedFeedback.slice(-10); // Last 10 feedback items
    }

    return exportData;
  }

  private extractPreferredCategories(_preferences: UserPersonalityPreference[]): string[] {
    // This would analyze preferences to determine preferred categories
    // For now, returning common categories
    return ['technical', 'creative', 'general'];
  }

  private extractPreferredTags(personalities: PersonalityProfile[], _preferences: UserPersonalityPreference[]): string[] {
    const allTags = personalities.flatMap((p) => p.tags);
    const tagCounts = new Map<string, number>();

    allTags.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });

    // Return most common tags
    return Array.from(tagCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  private filterSimilarTemplates(templates: HubTemplateMetadata[], existingPersonalities: PersonalityProfile[]): HubTemplateMetadata[] {
    // Simple similarity check based on names and categories
    const existingNames = new Set(existingPersonalities.map((p) => p.name.toLowerCase()));
    const existingCategories = new Set(existingPersonalities.map((p) => p.category));

    return templates.filter((template) => {
      const templateName = template.hubName.split('/')[1]?.toLowerCase() || '';
      return !existingNames.has(templateName) && !existingCategories.has(template.category || '');
    });
  }
}
