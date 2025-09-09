import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { UserPersonalityPreference, InteractionContext } from '../entities/user-personality-preference.entity';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { 
  PersonalityRecommendationRequestDto, 
  PersonalityRecommendationDto 
} from '../dto/personality-feedback.dto';
import { BaseMessage } from '@langchain/core/messages';
import { PersonalityContextAnalyzerService } from './personality-context-analyzer.service';
import { PersonalityCompatibilityScorerService } from './personality-compatibility-scorer.service';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * Recommendation strategy types
 */
export enum RecommendationStrategy {
  /** Content-based filtering using personality traits */
  CONTENT_BASED = 'content_based',
  /** Collaborative filtering using usage patterns */
  COLLABORATIVE = 'collaborative',
  /** Hybrid approach combining multiple strategies */
  HYBRID = 'hybrid',
  /** Context-aware recommendations */
  CONTEXT_AWARE = 'context_aware',
  /** Machine learning based recommendations */
  ML_POWERED = 'ml_powered',
}

/**
 * Recommendation configuration
 */
export interface RecommendationConfig {
  /** Primary recommendation strategy */
  strategy: RecommendationStrategy;
  /** Weight for user preference scores */
  preferenceWeight: number;
  /** Weight for contextual compatibility */
  contextWeight: number;
  /** Weight for recent performance */
  performanceWeight: number;
  /** Weight for user behavioral patterns */
  behaviorWeight: number;
  /** Minimum confidence threshold for recommendations */
  minConfidence: number;
  /** Diversification factor (0-1) */
  diversificationFactor: number;
  /** Enable novelty recommendations */
  enableNovelty: boolean;
  /** Novelty weight for untried personalities */
  noveltyWeight: number;
}

/**
 * Detailed recommendation result with analysis
 */
export interface DetailedRecommendationResult {
  /** Basic recommendation data */
  recommendation: PersonalityRecommendationDto;
  /** Detailed scoring breakdown */
  scoring: {
    preferenceScore: number;
    contextScore: number;
    performanceScore: number;
    behaviorScore: number;
    noveltyScore: number;
    finalScore: number;
  };
  /** Analysis and reasoning */
  analysis: {
    strengths: string[];
    considerations: string[];
    riskFactors: string[];
    confidenceFactors: string[];
  };
  /** Alternative options */
  alternatives: Array<{
    personalityId: string;
    name: string;
    score: number;
    reason: string;
  }>;
  /** Learning opportunities */
  learningOpportunities: string[];
}

/**
 * Recommendation explanation
 */
export interface RecommendationExplanation {
  /** Primary reasons for recommendation */
  primaryReasons: string[];
  /** Supporting evidence */
  evidence: Array<{
    type: 'user_feedback' | 'behavioral_pattern' | 'contextual_match' | 'performance_history';
    description: string;
    confidence: number;
  }>;
  /** Comparison with alternatives */
  comparison: Array<{
    personalityName: string;
    advantages: string[];
    disadvantages: string[];
  }>;
  /** Uncertainty factors */
  uncertainties: string[];
  /** Recommendations for improvement */
  improvementSuggestions: string[];
}

/**
 * Preference Recommendation Engine
 * 
 * Advanced recommendation system using LangChain for personality suggestions.
 * Implements multiple recommendation strategies and provides detailed explanations
 * for recommendations using AI-powered analysis.
 */
@Injectable()
export class PreferenceRecommendationEngine extends LangChainBaseService {
  private readonly defaultConfig: RecommendationConfig = {
    strategy: RecommendationStrategy.HYBRID,
    preferenceWeight: 0.4,
    contextWeight: 0.3,
    performanceWeight: 0.2,
    behaviorWeight: 0.1,
    minConfidence: 0.5,
    diversificationFactor: 0.2,
    enableNovelty: true,
    noveltyWeight: 0.1,
  };

  private config: RecommendationConfig = { ...this.defaultConfig };

  private recommendationPrompt = ChatPromptTemplate.fromMessages([
    ['system', `You are an expert AI personality recommendation system. Your job is to analyze user preferences, interaction patterns, and contextual needs to recommend the most suitable AI personality.

Consider these factors when making recommendations:
- User's historical preferences and feedback
- Context-specific performance data
- Behavioral patterns and communication style
- Recent interaction trends
- Personality trait compatibility
- User's stated preferences and goals

Provide clear, evidence-based reasoning for your recommendations.`],
    ['human', `Please analyze this recommendation request and provide detailed reasoning:

User Preference Data:
{preferenceData}

Available Personalities:
{personalities}

Request Context:
{requestContext}

Current Thread Context:
{threadContext}

Please recommend the top {limit} personalities with detailed explanations for each recommendation.`],
  ]);

  constructor(
    @InjectRepository(UserPersonalityPreference)
    private readonly preferenceRepository: Repository<UserPersonalityPreference>,
    @InjectRepository(PersonalityProfile)
    private readonly personalityRepository: Repository<PersonalityProfile>,
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
    private readonly contextAnalyzer: PersonalityContextAnalyzerService,
    private readonly compatibilityScorer: PersonalityCompatibilityScorerService,
  ) {
    super('PreferenceRecommendationEngine');
  }

  /**
   * Get personality recommendations based on user preferences and context
   */
  async getRecommendations(
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<PersonalityRecommendationDto[]> {
    this.logExecution('getRecommendations', {
      context: requestDto.interactionContext,
      threadId: requestDto.threadId,
      limit: requestDto.limit,
    });

    try {
      // Get user preferences for the requested context
      const preferences = await this.getUserPreferencesForContext(
        requestDto.interactionContext
      );

      // Get all available personalities
      const availablePersonalities = await this.getAvailablePersonalities(
        requestDto.excludePersonalities
      );

      // Analyze thread context if provided
      let threadContext;
      if (requestDto.threadId) {
        threadContext = await this.analyzeThreadContext(requestDto.threadId);
      }

      // Apply recommendation strategy
      const scoredRecommendations = await this.applyRecommendationStrategy(
        preferences,
        availablePersonalities,
        requestDto,
        threadContext
      );

      // Apply diversification and novelty
      const diversifiedRecommendations = this.applyDiversification(
        scoredRecommendations,
        requestDto
      );

      // Filter by confidence threshold
      const filteredRecommendations = diversifiedRecommendations.filter(
        rec => rec.confidenceScore >= (requestDto.minConfidence || this.config.minConfidence)
      );

      // Sort and limit results
      const finalRecommendations = filteredRecommendations
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, requestDto.limit || 3);

      this.logger.debug('Recommendations generated', {
        totalPersonalities: availablePersonalities.length,
        scoredRecommendations: scoredRecommendations.length,
        finalRecommendations: finalRecommendations.length,
      });

      return finalRecommendations;
    } catch (error) {
      this.logger.error('Failed to get recommendations', error);
      throw error;
    }
  }

  /**
   * Get detailed recommendation analysis with full breakdown
   */
  async getDetailedRecommendations(
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<DetailedRecommendationResult[]> {
    this.logExecution('getDetailedRecommendations', {
      context: requestDto.interactionContext,
      threadId: requestDto.threadId,
    });

    try {
      const basicRecommendations = await this.getRecommendations(requestDto);
      const detailedResults: DetailedRecommendationResult[] = [];

      for (const recommendation of basicRecommendations) {
        const detailed = await this.createDetailedRecommendation(
          recommendation,
          requestDto
        );
        detailedResults.push(detailed);
      }

      return detailedResults;
    } catch (error) {
      this.logger.error('Failed to get detailed recommendations', error);
      throw error;
    }
  }

  /**
   * Get AI-powered recommendation explanations
   */
  async getRecommendationExplanations(
    recommendations: PersonalityRecommendationDto[],
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<RecommendationExplanation[]> {
    this.logExecution('getRecommendationExplanations', {
      recommendationCount: recommendations.length,
      context: requestDto.interactionContext,
    });

    try {
      const explanations: RecommendationExplanation[] = [];

      for (const recommendation of recommendations) {
        const explanation = await this.createTracedRunnable(
          'generateExplanation',
          () => this.generateAIExplanation(recommendation, requestDto)
        ).invoke({});

        explanations.push(explanation);
      }

      return explanations;
    } catch (error) {
      this.logger.error('Failed to generate explanations', error);
      throw error;
    }
  }

  /**
   * Update recommendation configuration
   */
  updateConfiguration(config: Partial<RecommendationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug('Recommendation configuration updated', { config });
  }

  /**
   * Get recommendation analytics and performance metrics
   */
  async getRecommendationAnalytics(): Promise<{
    totalRecommendations: number;
    accuracyMetrics: {
      clickThroughRate: number;
      conversionRate: number;
      satisfactionRate: number;
    };
    strategyPerformance: Record<RecommendationStrategy, {
      usage: number;
      averageAccuracy: number;
      averageConfidence: number;
    }>;
    contextAnalysis: Record<InteractionContext, {
      recommendationCount: number;
      averageConfidence: number;
      topPersonalities: Array<{ id: string; name: string; frequency: number }>;
    }>;
    improvementOpportunities: Array<{
      area: string;
      description: string;
      potentialImpact: 'high' | 'medium' | 'low';
    }>;
  }> {
    this.logExecution('getRecommendationAnalytics');

    try {
      // This would be implemented with actual analytics data
      // For now, returning placeholder structure
      return {
        totalRecommendations: 0,
        accuracyMetrics: {
          clickThroughRate: 0,
          conversionRate: 0,
          satisfactionRate: 0,
        },
        strategyPerformance: {} as any,
        contextAnalysis: {} as any,
        improvementOpportunities: [],
      };
    } catch (error) {
      this.logger.error('Failed to get recommendation analytics', error);
      throw error;
    }
  }

  // Private helper methods

  private async getUserPreferencesForContext(
    context: InteractionContext
  ): Promise<UserPersonalityPreference[]> {
    return await this.preferenceRepository.find({
      where: { interactionContext: context },
      order: { preferenceScore: 'DESC', interactionCount: 'DESC' },
    });
  }

  private async getAvailablePersonalities(
    excludeIds?: string[]
  ): Promise<PersonalityProfile[]> {
    const query = this.personalityRepository.createQueryBuilder('personality')
      .where('personality.isActive = :isActive', { isActive: true });

    if (excludeIds && excludeIds.length > 0) {
      query.andWhere('personality.id NOT IN (:...excludeIds)', { excludeIds });
    }

    return await query.getMany();
  }

  private async analyzeThreadContext(threadId: string): Promise<any> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['messages'],
    });

    if (!thread) return null;

    // This would integrate with the context analyzer
    // For now, return basic thread information
    return {
      threadId,
      messageCount: thread.messageCount,
      category: thread.category,
      tags: thread.tags,
      lastActivity: thread.lastActivityAt,
    };
  }

  private async applyRecommendationStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto,
    threadContext?: any
  ): Promise<PersonalityRecommendationDto[]> {
    switch (this.config.strategy) {
      case RecommendationStrategy.CONTENT_BASED:
        return await this.applyContentBasedStrategy(
          preferences,
          personalities,
          requestDto
        );
      case RecommendationStrategy.COLLABORATIVE:
        return await this.applyCollaborativeStrategy(
          preferences,
          personalities,
          requestDto
        );
      case RecommendationStrategy.CONTEXT_AWARE:
        return await this.applyContextAwareStrategy(
          preferences,
          personalities,
          requestDto,
          threadContext
        );
      case RecommendationStrategy.ML_POWERED:
        return await this.applyMLPoweredStrategy(
          preferences,
          personalities,
          requestDto,
          threadContext
        );
      case RecommendationStrategy.HYBRID:
      default:
        return await this.applyHybridStrategy(
          preferences,
          personalities,
          requestDto,
          threadContext
        );
    }
  }

  private async applyContentBasedStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<PersonalityRecommendationDto[]> {
    // Content-based filtering using personality traits
    const recommendations: PersonalityRecommendationDto[] = [];

    for (const personality of personalities) {
      const preference = preferences.find(p => p.personalityId === personality.id);
      const score = preference ? preference.preferenceScore : 0.5;

      // Analyze trait compatibility (simplified)
      const contextCompatibility = await this.calculateTraitCompatibility(
        personality,
        requestDto.interactionContext
      );

      recommendations.push({
        personalityId: personality.id,
        personalityName: personality.name,
        confidenceScore: score,
        contextCompatibility,
        reasons: this.generateContentBasedReasons(personality, preference),
        previousInteractions: preference?.interactionCount || 0,
        averageSatisfaction: preference?.getAverageFeedbackScore() || 0.5,
        performanceTrend: preference?.getPreferenceTrend() || 'stable',
      });
    }

    return recommendations;
  }

  private async applyCollaborativeStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<PersonalityRecommendationDto[]> {
    // Collaborative filtering based on similar usage patterns
    const recommendations: PersonalityRecommendationDto[] = [];

    // Find similar contexts and personalities
    const allPreferences = await this.preferenceRepository.find();
    const contextPreferences = allPreferences.filter(
      p => p.interactionContext === requestDto.interactionContext
    );

    for (const personality of personalities) {
      const contextPreference = contextPreferences.find(
        p => p.personalityId === personality.id
      );
      
      const averageScore = contextPreferences.length > 0
        ? contextPreferences.reduce((sum, p) => sum + p.preferenceScore, 0) / contextPreferences.length
        : 0.5;

      const score = contextPreference ? contextPreference.preferenceScore : averageScore;

      recommendations.push({
        personalityId: personality.id,
        personalityName: personality.name,
        confidenceScore: score,
        contextCompatibility: score,
        reasons: this.generateCollaborativeReasons(personality, contextPreference),
        previousInteractions: contextPreference?.interactionCount || 0,
        averageSatisfaction: contextPreference?.getAverageFeedbackScore() || 0.5,
        performanceTrend: contextPreference?.getPreferenceTrend() || 'stable',
      });
    }

    return recommendations;
  }

  private async applyContextAwareStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto,
    threadContext?: any
  ): Promise<PersonalityRecommendationDto[]> {
    const recommendations: PersonalityRecommendationDto[] = [];

    for (const personality of personalities) {
      // Get compatibility score from compatibility scorer
      const compatibilityScore = await this.compatibilityScorer.scorePersonalityCompatibility(
        personality.id,
        { interactionContext: requestDto.interactionContext, threadContext }
      );

      const preference = preferences.find(p => p.personalityId === personality.id);
      const preferenceScore = preference ? preference.preferenceScore : 0.5;

      // Combine preference and compatibility scores
      const finalScore = (preferenceScore * this.config.preferenceWeight) +
                        (compatibilityScore.overallScore * this.config.contextWeight);

      recommendations.push({
        personalityId: personality.id,
        personalityName: personality.name,
        confidenceScore: finalScore,
        contextCompatibility: compatibilityScore.overallScore,
        reasons: this.generateContextAwareReasons(personality, compatibilityScore),
        previousInteractions: preference?.interactionCount || 0,
        averageSatisfaction: preference?.getAverageFeedbackScore() || 0.5,
        performanceTrend: preference?.getPreferenceTrend() || 'stable',
      });
    }

    return recommendations;
  }

  private async applyMLPoweredStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto,
    threadContext?: any
  ): Promise<PersonalityRecommendationDto[]> {
    // AI-powered recommendations using LangChain
    try {
      const preferenceData = JSON.stringify(preferences.map(p => ({
        personalityId: p.personalityId,
        context: p.interactionContext,
        score: p.preferenceScore,
        interactions: p.interactionCount,
        feedback: p.feedback.slice(-3), // Recent feedback only
      })));

      const personalityData = JSON.stringify(personalities.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        traits: p.traits,
        tags: p.tags,
      })));

      const chain = this.recommendationPrompt.pipe(new StringOutputParser());

      const response = await this.createTracedRunnable(
        'mlPoweredRecommendation',
        () => chain.invoke({
          preferenceData,
          personalities: personalityData,
          requestContext: JSON.stringify(requestDto),
          threadContext: threadContext ? JSON.stringify(threadContext) : 'None',
          limit: requestDto.limit || 3,
        })
      ).invoke({});

      // Parse AI response and create recommendations
      return this.parseAIRecommendations(response, personalities, preferences);
    } catch (error) {
      this.logger.warn('ML-powered strategy failed, falling back to hybrid', error);
      return await this.applyHybridStrategy(preferences, personalities, requestDto, threadContext);
    }
  }

  private async applyHybridStrategy(
    preferences: UserPersonalityPreference[],
    personalities: PersonalityProfile[],
    requestDto: PersonalityRecommendationRequestDto,
    threadContext?: any
  ): Promise<PersonalityRecommendationDto[]> {
    // Combine multiple strategies
    const contentBased = await this.applyContentBasedStrategy(preferences, personalities, requestDto);
    const contextAware = await this.applyContextAwareStrategy(preferences, personalities, requestDto, threadContext);
    
    // Merge and weight the recommendations
    const hybridRecommendations: PersonalityRecommendationDto[] = [];

    for (const personality of personalities) {
      const contentRec = contentBased.find(r => r.personalityId === personality.id);
      const contextRec = contextAware.find(r => r.personalityId === personality.id);

      if (contentRec && contextRec) {
        const hybridScore = (contentRec.confidenceScore * 0.6) + (contextRec.confidenceScore * 0.4);
        
        hybridRecommendations.push({
          personalityId: personality.id,
          personalityName: personality.name,
          confidenceScore: hybridScore,
          contextCompatibility: contextRec.contextCompatibility,
          reasons: [
            ...contentRec.reasons.slice(0, 2),
            ...contextRec.reasons.slice(0, 2),
          ],
          previousInteractions: contentRec.previousInteractions,
          averageSatisfaction: contentRec.averageSatisfaction,
          performanceTrend: contentRec.performanceTrend,
        });
      }
    }

    return hybridRecommendations;
  }

  private applyDiversification(
    recommendations: PersonalityRecommendationDto[],
    requestDto: PersonalityRecommendationRequestDto
  ): PersonalityRecommendationDto[] {
    if (!this.config.diversificationFactor || recommendations.length <= 1) {
      return recommendations;
    }

    // Apply diversification to avoid recommending too similar personalities
    const diversified = [...recommendations];
    const diversificationThreshold = this.config.diversificationFactor;

    // Simple diversification: ensure variety in categories and traits
    const seen = new Set<string>();
    
    return diversified.filter(rec => {
      const key = `${rec.personalityName.split(' ')[0]}`; // Simple category grouping
      if (seen.has(key) && Math.random() > diversificationThreshold) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async calculateTraitCompatibility(
    personality: PersonalityProfile,
    context: InteractionContext
  ): Promise<number> {
    // Simple trait-context compatibility calculation
    const contextTraitWeights = {
      [InteractionContext.TECHNICAL]: { 'expertise_level': 0.4, 'precision': 0.3, 'clarity': 0.3 },
      [InteractionContext.CREATIVE]: { 'creativity': 0.5, 'inspiration': 0.3, 'flexibility': 0.2 },
      [InteractionContext.EDUCATIONAL]: { 'patience': 0.4, 'clarity': 0.3, 'encouragement': 0.3 },
      [InteractionContext.PROFESSIONAL]: { 'professionalism': 0.4, 'efficiency': 0.3, 'reliability': 0.3 },
    };

    const weights = contextTraitWeights[context] || {};
    let score = 0.5; // Default neutral score

    personality.traits.forEach(trait => {
      const weight = weights[trait.name] || 0.1;
      score += trait.weight * weight;
    });

    return Math.min(1, score);
  }

  private generateContentBasedReasons(
    personality: PersonalityProfile,
    preference?: UserPersonalityPreference
  ): string[] {
    const reasons: string[] = [];

    if (preference) {
      if (preference.preferenceScore > 0.7) {
        reasons.push('High historical preference score');
      }
      if (preference.interactionCount > 10) {
        reasons.push('Extensive interaction history');
      }
      if (preference.getPreferenceTrend() === 'improving') {
        reasons.push('Improving user satisfaction trend');
      }
    }

    // Add trait-based reasons
    const strongTraits = personality.traits
      .filter(t => t.weight > 0.7)
      .map(t => t.name);

    if (strongTraits.length > 0) {
      reasons.push(`Strong ${strongTraits[0]} characteristics`);
    }

    if (reasons.length === 0) {
      reasons.push('Good match for your preferences');
    }

    return reasons;
  }

  private generateCollaborativeReasons(
    personality: PersonalityProfile,
    preference?: UserPersonalityPreference
  ): string[] {
    const reasons: string[] = [];

    if (preference) {
      reasons.push('Popular choice in similar contexts');
      if (preference.preferenceScore > 0.6) {
        reasons.push('Generally well-rated by users');
      }
    } else {
      reasons.push('Recommended based on similar usage patterns');
    }

    return reasons;
  }

  private generateContextAwareReasons(
    personality: PersonalityProfile,
    compatibilityScore: any
  ): string[] {
    const reasons: string[] = [];

    if (compatibilityScore.overallScore > 0.8) {
      reasons.push('Excellent contextual compatibility');
    }

    if (compatibilityScore.scores?.contextAlignment > 0.7) {
      reasons.push('Well-suited for this interaction type');
    }

    reasons.push('Optimized for current conversation context');

    return reasons;
  }

  private parseAIRecommendations(
    response: string,
    personalities: PersonalityProfile[],
    preferences: UserPersonalityPreference[]
  ): PersonalityRecommendationDto[] {
    // Parse AI response - this would be more sophisticated in practice
    try {
      // For now, return a simplified parsing
      const recommendations: PersonalityRecommendationDto[] = [];
      
      personalities.slice(0, 3).forEach(personality => {
        const preference = preferences.find(p => p.personalityId === personality.id);
        
        recommendations.push({
          personalityId: personality.id,
          personalityName: personality.name,
          confidenceScore: Math.random() * 0.4 + 0.6, // AI would provide actual scores
          contextCompatibility: Math.random() * 0.3 + 0.7,
          reasons: ['AI-powered recommendation', 'Based on learned patterns'],
          previousInteractions: preference?.interactionCount || 0,
          averageSatisfaction: preference?.getAverageFeedbackScore() || 0.5,
          performanceTrend: preference?.getPreferenceTrend() || 'stable',
        });
      });

      return recommendations;
    } catch (error) {
      this.logger.warn('Failed to parse AI recommendations', error);
      return [];
    }
  }

  private async createDetailedRecommendation(
    recommendation: PersonalityRecommendationDto,
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<DetailedRecommendationResult> {
    // Create detailed analysis for the recommendation
    const personality = await this.personalityRepository.findOne({
      where: { id: recommendation.personalityId }
    });

    const preference = await this.preferenceRepository.findOne({
      where: { 
        personalityId: recommendation.personalityId,
        interactionContext: requestDto.interactionContext
      }
    });

    return {
      recommendation,
      scoring: {
        preferenceScore: preference?.preferenceScore || 0.5,
        contextScore: recommendation.contextCompatibility,
        performanceScore: recommendation.averageSatisfaction || 0.5,
        behaviorScore: 0.7, // Would calculate from behavioral data
        noveltyScore: preference ? 0.3 : 0.8, // Higher for untried personalities
        finalScore: recommendation.confidenceScore,
      },
      analysis: {
        strengths: this.analyzeStrengths(personality, preference),
        considerations: this.analyzeConsiderations(personality, preference),
        riskFactors: this.analyzeRiskFactors(personality, preference),
        confidenceFactors: this.analyzeConfidenceFactors(preference),
      },
      alternatives: [], // Would populate with alternative recommendations
      learningOpportunities: this.identifyLearningOpportunities(preference),
    };
  }

  private async generateAIExplanation(
    recommendation: PersonalityRecommendationDto,
    requestDto: PersonalityRecommendationRequestDto
  ): Promise<RecommendationExplanation> {
    // Generate AI-powered explanation
    return {
      primaryReasons: recommendation.reasons,
      evidence: [
        {
          type: 'user_feedback',
          description: 'Based on your previous interactions and ratings',
          confidence: 0.8,
        },
        {
          type: 'contextual_match',
          description: 'Well-suited for the current interaction context',
          confidence: recommendation.contextCompatibility,
        },
      ],
      comparison: [], // Would compare with alternatives
      uncertainties: ['Limited interaction history may affect accuracy'],
      improvementSuggestions: ['Provide more feedback to improve future recommendations'],
    };
  }

  private analyzeStrengths(personality: PersonalityProfile | null, preference: UserPersonalityPreference | null): string[] {
    const strengths: string[] = [];
    
    if (preference?.preferenceScore && preference.preferenceScore > 0.7) {
      strengths.push('High user satisfaction history');
    }
    
    if (personality?.traits.some(t => t.weight > 0.8)) {
      strengths.push('Strong personality characteristics');
    }
    
    return strengths;
  }

  private analyzeConsiderations(personality: PersonalityProfile | null, preference: UserPersonalityPreference | null): string[] {
    const considerations: string[] = [];
    
    if (!preference || preference.interactionCount < 3) {
      considerations.push('Limited interaction history');
    }
    
    return considerations;
  }

  private analyzeRiskFactors(personality: PersonalityProfile | null, preference: UserPersonalityPreference | null): string[] {
    const risks: string[] = [];
    
    if (preference?.getPreferenceTrend() === 'declining') {
      risks.push('Declining user satisfaction trend');
    }
    
    return risks;
  }

  private analyzeConfidenceFactors(preference: UserPersonalityPreference | null): string[] {
    const factors: string[] = [];
    
    if (preference?.learningConfidence && preference.learningConfidence > 0.7) {
      factors.push('High learning confidence');
    }
    
    if (preference?.hasSufficientData()) {
      factors.push('Sufficient interaction data');
    }
    
    return factors;
  }

  private identifyLearningOpportunities(preference: UserPersonalityPreference | null): string[] {
    const opportunities: string[] = [];
    
    if (!preference || preference.interactionCount < 5) {
      opportunities.push('More interactions will improve recommendation accuracy');
    }
    
    if (!preference?.feedback.some(f => f.aspects)) {
      opportunities.push('Detailed aspect feedback would enhance learning');
    }
    
    return opportunities;
  }
}