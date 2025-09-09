import { Injectable } from '@nestjs/common';
import { CosineSimilarity } from 'ml-distance';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import type { PersonalityProfile, PersonalityTrait } from '../entities/personality-profile.entity';
import type { ContextAnalysisResult, ConversationIntent } from './personality-context-analyzer.service';
import { PersonalityProfileService } from './personality-profile.service';

/**
 * Personality compatibility score result
 */
export interface PersonalityCompatibilityScore {
  /** Personality being scored */
  personalityId: string;
  personalityName: string;
  /** Overall compatibility score (0-1) */
  overallScore: number;
  /** Detailed scoring breakdown */
  scores: {
    /** Context alignment score */
    contextAlignment: number;
    /** Trait matching score */
    traitMatching: number;
    /** Intent compatibility score */
    intentCompatibility: number;
    /** User pattern alignment score */
    userPatternAlignment: number;
    /** Conversation complexity fit score */
    complexityFit: number;
    /** Emotional context alignment score */
    emotionalAlignment: number;
  };
  /** Scoring rationale and explanations */
  rationale: {
    /** Strengths of this personality for the context */
    strengths: string[];
    /** Potential weaknesses or misalignments */
    weaknesses: string[];
    /** Key matching traits */
    matchingTraits: string[];
    /** Recommended trait adjustments */
    traitAdjustments: Array<{
      traitName: string;
      currentValue: string;
      suggestedValue: string;
      reason: string;
    }>;
  };
  /** Confidence in the scoring */
  confidence: number;
  /** Metadata about the scoring */
  metadata: {
    scoredAt: Date;
    scoringVersion: string;
    contextFactorsConsidered: string[];
  };
}

/**
 * Batch compatibility scoring result
 */
export interface PersonalityCompatibilityRanking {
  /** Context that was analyzed */
  context: ContextAnalysisResult;
  /** Ranked personality scores */
  rankings: PersonalityCompatibilityScore[];
  /** Recommended personality switches */
  recommendations: Array<{
    rank: number;
    personalityId: string;
    personalityName: string;
    switchReason: string;
    expectedImprovement: number;
  }>;
  /** Analysis metadata */
  metadata: {
    totalPersonalitiesScored: number;
    scoringDuration: number;
    confidenceThreshold: number;
  };
}

/**
 * Trait compatibility weights for different contexts
 */
interface TraitCompatibilityWeights {
  [contextType: string]: {
    [traitName: string]: number;
  };
}

/**
 * Intent-personality mapping configuration
 */
interface IntentPersonalityMapping {
  [intent: string]: {
    preferredTraits: Array<{ trait: string; value: string; weight: number }>;
    incompatibleTraits: Array<{ trait: string; value: string; penalty: number }>;
    contextualModifiers: Array<{ condition: string; modifier: number }>;
  };
}

/**
 * LangChain-based Personality Compatibility Scorer
 *
 * Advanced scoring system that evaluates personality-context compatibility
 * using machine learning techniques, trait analysis, and contextual matching.
 *
 * Key capabilities:
 * - Multi-dimensional compatibility scoring
 * - Trait vector similarity analysis
 * - Intent-personality alignment scoring
 * - User pattern compatibility assessment
 * - Confidence-weighted recommendations
 * - Contextual trait adjustment suggestions
 */
@Injectable()
export class PersonalityCompatibilityScorerService extends LangChainBaseService {
  private readonly intentMappings: IntentPersonalityMapping;
  private readonly defaultConfidenceThreshold = 0.7;

  constructor(private readonly personalityService: PersonalityProfileService) {
    super('PersonalityCompatibilityScorerService');

    // Initialize trait compatibility weights for different contexts
    this.traitWeights = this.initializeTraitWeights();

    // Initialize intent-personality mappings
    this.intentMappings = this.initializeIntentMappings();
  }

  /**
   * Score a single personality's compatibility with conversation context
   */
  async scorePersonalityCompatibility(
    personalityId: string,
    context: ContextAnalysisResult,
    currentPersonalityId?: string,
  ): Promise<PersonalityCompatibilityScore> {
    this.logExecution('scorePersonalityCompatibility', {
      personalityId,
      intent: context.intent,
      complexity: context.complexity.level,
      currentPersonality: currentPersonalityId,
    });

    try {
      const personality = await this.personalityService.findOne(personalityId);

      // Calculate individual scoring components using LangChain tracing
      const [contextAlignment, traitMatching, intentCompatibility, userPatternAlignment, complexityFit, emotionalAlignment] = await Promise.all([
        this.createTracedRunnable('scoreContextAlignment', () => this.scoreContextAlignment(personality, context)).invoke({}),
        this.createTracedRunnable('scoreTraitMatching', () => this.scoreTraitMatching(personality, context)).invoke({}),
        this.createTracedRunnable('scoreIntentCompatibility', () => this.scoreIntentCompatibility(personality, context)).invoke({}),
        this.createTracedRunnable('scoreUserPatternAlignment', () => this.scoreUserPatternAlignment(personality, context)).invoke({}),
        this.createTracedRunnable('scoreComplexityFit', () => this.scoreComplexityFit(personality, context)).invoke({}),
        this.createTracedRunnable('scoreEmotionalAlignment', () => this.scoreEmotionalAlignment(personality, context)).invoke({}),
      ]);

      // Calculate weighted overall score
      const overallScore = this.calculateOverallScore({
        contextAlignment,
        traitMatching,
        intentCompatibility,
        userPatternAlignment,
        complexityFit,
        emotionalAlignment,
      });

      // Generate scoring rationale
      const rationale = await this.generateScoringRationale(personality, context, {
        contextAlignment,
        traitMatching,
        intentCompatibility,
        userPatternAlignment,
        complexityFit,
        emotionalAlignment,
      });

      // Calculate confidence based on context clarity and personality completeness
      const confidence = this.calculateScoringConfidence(personality, context);

      const result: PersonalityCompatibilityScore = {
        personalityId: personality.id,
        personalityName: personality.name,
        overallScore,
        scores: {
          contextAlignment,
          traitMatching,
          intentCompatibility,
          userPatternAlignment,
          complexityFit,
          emotionalAlignment,
        },
        rationale,
        confidence,
        metadata: {
          scoredAt: new Date(),
          scoringVersion: '1.0.0',
          contextFactorsConsidered: ['intent', 'complexity', 'emotional_context', 'user_patterns', 'topics', 'switching_triggers'],
        },
      };

      this.logger.debug('Personality compatibility scored', {
        personalityId,
        personalityName: personality.name,
        overallScore,
        confidence,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to score personality compatibility', error);
      // Return safe default score
      return this.createDefaultCompatibilityScore(personalityId);
    }
  }

  /**
   * Score multiple personalities and rank them by compatibility
   */
  async rankPersonalitiesByCompatibility(
    context: ContextAnalysisResult,
    personalityIds?: string[],
    options: {
      includeInactive?: boolean;
      confidenceThreshold?: number;
      maxResults?: number;
    } = {},
  ): Promise<PersonalityCompatibilityRanking> {
    this.logExecution('rankPersonalitiesByCompatibility', {
      contextIntent: context.intent,
      personalityCount: personalityIds?.length || 'all',
      options,
    });

    const startTime = Date.now();
    const { includeInactive = false, confidenceThreshold = this.defaultConfidenceThreshold, maxResults = 10 } = options;

    try {
      // Get personalities to evaluate
      let personalities: PersonalityProfile[];
      if (personalityIds) {
        personalities = await Promise.all(personalityIds.map((id) => this.personalityService.findOne(id)));
      } else {
        personalities = await this.personalityService.findAll();
      }

      // Filter personalities based on options
      if (!includeInactive) {
        personalities = personalities.filter((p) => p.isActive);
      }

      // Score all personalities in parallel
      const scoringPromises = personalities.map((p) => this.scorePersonalityCompatibility(p.id, context));

      const scores = await Promise.all(scoringPromises);

      // Filter by confidence threshold and sort by overall score
      const qualifiedScores = scores
        .filter((score) => score.confidence >= confidenceThreshold)
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, maxResults);

      // Generate recommendations
      const recommendations = qualifiedScores.slice(0, 3).map((score, index) => ({
        rank: index + 1,
        personalityId: score.personalityId,
        personalityName: score.personalityName,
        switchReason: this.generateSwitchReason(score, context),
        expectedImprovement: score.overallScore,
      }));

      const result: PersonalityCompatibilityRanking = {
        context,
        rankings: qualifiedScores,
        recommendations,
        metadata: {
          totalPersonalitiesScored: scores.length,
          scoringDuration: Date.now() - startTime,
          confidenceThreshold,
        },
      };

      this.logger.debug('Personalities ranked by compatibility', {
        totalScored: scores.length,
        qualifiedResults: qualifiedScores.length,
        topPersonality: qualifiedScores[0]?.personalityName,
        topScore: qualifiedScores[0]?.overallScore,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to rank personalities by compatibility', error);
      // Return empty ranking
      return {
        context,
        rankings: [],
        recommendations: [],
        metadata: {
          totalPersonalitiesScored: 0,
          scoringDuration: Date.now() - startTime,
          confidenceThreshold,
        },
      };
    }
  }

  /**
   * Compare two personalities for a specific context
   */
  async comparePersonalities(
    personalityId1: string,
    personalityId2: string,
    context: ContextAnalysisResult,
  ): Promise<{
    winner: string;
    winnerName: string;
    scoreDifference: number;
    comparisonDetails: {
      personality1: PersonalityCompatibilityScore;
      personality2: PersonalityCompatibilityScore;
      strongerAreas: Array<{ area: string; winner: string; difference: number }>;
      recommendations: string[];
    };
  }> {
    this.logExecution('comparePersonalities', {
      personality1: personalityId1,
      personality2: personalityId2,
      intent: context.intent,
    });

    const [score1, score2] = await Promise.all([
      this.scorePersonalityCompatibility(personalityId1, context),
      this.scorePersonalityCompatibility(personalityId2, context),
    ]);

    const winner = score1.overallScore > score2.overallScore ? personalityId1 : personalityId2;
    const winnerScore = score1.overallScore > score2.overallScore ? score1 : score2;
    const scoreDifference = Math.abs(score1.overallScore - score2.overallScore);

    // Analyze stronger areas
    const scoreCategories = Object.keys(score1.scores) as Array<keyof typeof score1.scores>;
    const strongerAreas = scoreCategories.map((category) => ({
      area: category,
      winner: score1.scores[category] > score2.scores[category] ? personalityId1 : personalityId2,
      difference: Math.abs(score1.scores[category] - score2.scores[category]),
    }));

    // Generate comparison recommendations
    const recommendations = [
      `${winnerScore.personalityName} is better suited for this context`,
      `Score difference: ${(scoreDifference * 100).toFixed(1)}%`,
      ...winnerScore.rationale.strengths.slice(0, 2),
    ];

    return {
      winner,
      winnerName: winnerScore.personalityName,
      scoreDifference,
      comparisonDetails: {
        personality1: score1,
        personality2: score2,
        strongerAreas,
        recommendations,
      },
    };
  }

  /**
   * Suggest trait adjustments to improve personality compatibility
   */
  async suggestTraitAdjustments(
    personalityId: string,
    context: ContextAnalysisResult,
    targetImprovement = 0.2,
  ): Promise<
    Array<{
      traitName: string;
      currentValue: string;
      suggestedValue: string;
      expectedImprovement: number;
      confidence: number;
      reason: string;
    }>
  > {
    this.logExecution('suggestTraitAdjustments', {
      personalityId,
      targetImprovement,
      intent: context.intent,
    });

    const personality = await this.personalityService.findOne(personalityId);
    const currentScore = await this.scorePersonalityCompatibility(personalityId, context);

    const suggestions: Array<{
      traitName: string;
      currentValue: string;
      suggestedValue: string;
      expectedImprovement: number;
      confidence: number;
      reason: string;
    }> = [];

    // Analyze each trait for improvement potential
    for (const trait of personality.traits) {
      const improvementAnalysis = await this.analyzeTraitImprovement(trait, context, currentScore);

      if (improvementAnalysis.expectedImprovement >= targetImprovement * 0.5) {
        suggestions.push(improvementAnalysis);
      }
    }

    // Sort by expected improvement
    return suggestions.sort((a, b) => b.expectedImprovement - a.expectedImprovement).slice(0, 5); // Return top 5 suggestions
  }

  // Private scoring methods

  /**
   * Score how well personality aligns with overall context
   */
  private async scoreContextAlignment(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    let score = 0.5; // Base score

    // Category alignment
    const categoryAlignment = this.getCategoryAlignmentScore(personality.category, context.intent);
    score += categoryAlignment * 0.3;

    // Topic relevance
    const topicRelevance = this.getTopicRelevanceScore(personality, context.topics);
    score += topicRelevance * 0.2;

    // Tag matching
    const tagMatching = this.getTagMatchingScore(personality.tags, context);
    score += tagMatching * 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Score trait matching using vector similarity
   */
  private async scoreTraitMatching(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    // Convert personality traits to vector
    const personalityVector = this.personalityToVector(personality);

    // Convert context requirements to vector
    const contextVector = this.contextToVector(context);

    // Calculate cosine similarity
    const similarity = CosineSimilarity(personalityVector, contextVector);

    return Math.max(0, similarity); // Ensure non-negative
  }

  /**
   * Score intent compatibility
   */
  private async scoreIntentCompatibility(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    const intentMapping = this.intentMappings[context.intent];
    if (!intentMapping) {
      return 0.5; // Default score if no mapping
    }

    let score = 0;
    let totalWeight = 0;

    // Score preferred traits
    for (const preferredTrait of intentMapping.preferredTraits) {
      const personalityTrait = personality.traits.find((t) => t.name === preferredTrait.trait);
      if (personalityTrait && personalityTrait.value === preferredTrait.value) {
        score += preferredTrait.weight * personalityTrait.weight;
      }
      totalWeight += preferredTrait.weight;
    }

    // Apply penalties for incompatible traits
    for (const incompatibleTrait of intentMapping.incompatibleTraits) {
      const personalityTrait = personality.traits.find((t) => t.name === incompatibleTrait.trait);
      if (personalityTrait && personalityTrait.value === incompatibleTrait.value) {
        score -= incompatibleTrait.penalty * personalityTrait.weight;
      }
    }

    // Normalize score
    return totalWeight > 0 ? Math.max(0, Math.min(1, score / totalWeight)) : 0.5;
  }

  /**
   * Score user pattern alignment
   */
  private async scoreUserPatternAlignment(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    let score = 0;
    let factors = 0;

    // Communication style alignment
    const communicationStyleTrait = personality.getTraitValue('communication_style');
    if (communicationStyleTrait === context.userPatterns.communicationStyle) {
      score += 0.3;
    }
    factors++;

    // Formality alignment
    const formalityTrait = personality.getTraitValue('formality');
    const expectedFormality = context.userPatterns.communicationStyle === 'formal' ? 'formal' : 'casual';
    if (formalityTrait === expectedFormality) {
      score += 0.25;
    }
    factors++;

    // Verbosity alignment
    const verbosityTrait = personality.getTraitValue('verbosity');
    if (verbosityTrait === context.userPatterns.preferredVerbosity) {
      score += 0.2;
    }
    factors++;

    // Expertise level alignment
    const expertiseTrait = personality.getTraitValue('expertise_level');
    if (expertiseTrait === context.userPatterns.expertiseLevel) {
      score += 0.25;
    }
    factors++;

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Score complexity fit
   */
  private async scoreComplexityFit(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    const technicalDepthTrait = personality.getTraitValue('technical_depth', 'moderate');
    const precisionTrait = personality.getTraitValue('precision', 'moderate');

    let score = 0.5; // Base score

    // Match technical depth to complexity
    switch (context.complexity.level) {
      case 'expert':
        if (technicalDepthTrait === 'detailed' || technicalDepthTrait === 'expert') {
          score += 0.3;
        }
        if (precisionTrait === 'high') {
          score += 0.2;
        }
        break;
      case 'high':
        if (technicalDepthTrait === 'detailed') {
          score += 0.25;
        }
        if (precisionTrait === 'high' || precisionTrait === 'moderate') {
          score += 0.15;
        }
        break;
      case 'medium':
        if (technicalDepthTrait === 'moderate') {
          score += 0.2;
        }
        if (precisionTrait === 'moderate') {
          score += 0.1;
        }
        break;
      case 'low':
        if (technicalDepthTrait === 'basic' || technicalDepthTrait === 'moderate') {
          score += 0.15;
        }
        if (precisionTrait === 'low' || precisionTrait === 'moderate') {
          score += 0.1;
        }
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Score emotional alignment
   */
  private async scoreEmotionalAlignment(personality: PersonalityProfile, context: ContextAnalysisResult): Promise<number> {
    const empathyTrait = personality.getTraitValue('empathy', 'moderate');
    const toneTrait = personality.getTraitValue('tone', 'neutral');

    let score = 0.5; // Base score

    // Align empathy with emotional intensity
    if (context.emotionalContext.intensity > 0.7) {
      if (empathyTrait === 'high') {
        score += 0.3;
      } else if (empathyTrait === 'moderate') {
        score += 0.1;
      }
    } else if (context.emotionalContext.intensity < 0.3) {
      if (empathyTrait === 'low' || empathyTrait === 'moderate') {
        score += 0.2;
      }
    }

    // Align tone with sentiment
    if (context.emotionalContext.sentiment === 'positive') {
      if (toneTrait === 'friendly' || toneTrait === 'enthusiastic') {
        score += 0.2;
      }
    } else if (context.emotionalContext.sentiment === 'negative') {
      if (toneTrait === 'supportive' || toneTrait === 'professional') {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(scores: {
    contextAlignment: number;
    traitMatching: number;
    intentCompatibility: number;
    userPatternAlignment: number;
    complexityFit: number;
    emotionalAlignment: number;
  }): number {
    // Weights for different scoring components
    const weights = {
      contextAlignment: 0.2,
      traitMatching: 0.25,
      intentCompatibility: 0.25,
      userPatternAlignment: 0.15,
      complexityFit: 0.1,
      emotionalAlignment: 0.05,
    };

    return (
      scores.contextAlignment * weights.contextAlignment +
      scores.traitMatching * weights.traitMatching +
      scores.intentCompatibility * weights.intentCompatibility +
      scores.userPatternAlignment * weights.userPatternAlignment +
      scores.complexityFit * weights.complexityFit +
      scores.emotionalAlignment * weights.emotionalAlignment
    );
  }

  /**
   * Generate scoring rationale
   */
  private async generateScoringRationale(
    personality: PersonalityProfile,
    context: ContextAnalysisResult,
    scores: any,
  ): Promise<PersonalityCompatibilityScore['rationale']> {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const matchingTraits: string[] = [];
    const traitAdjustments: any[] = [];

    // Identify strengths
    if (scores.intentCompatibility > 0.7) {
      strengths.push(`Excellent match for ${context.intent} intent`);
    }
    if (scores.traitMatching > 0.8) {
      strengths.push('Strong trait alignment with context requirements');
    }
    if (scores.complexityFit > 0.8) {
      strengths.push(`Well-suited for ${context.complexity.level} complexity conversations`);
    }

    // Identify weaknesses
    if (scores.emotionalAlignment < 0.4) {
      weaknesses.push('May struggle with emotional context requirements');
    }
    if (scores.userPatternAlignment < 0.5) {
      weaknesses.push('Limited alignment with user communication patterns');
    }

    // Identify matching traits
    personality.traits.forEach((trait) => {
      const relevantToContext = this.isTraitRelevantToContext(trait.name, context);
      if (relevantToContext) {
        matchingTraits.push(`${trait.name}: ${trait.value}`);
      }
    });

    return {
      strengths,
      weaknesses,
      matchingTraits,
      traitAdjustments,
    };
  }

  /**
   * Calculate scoring confidence
   */
  private calculateScoringConfidence(personality: PersonalityProfile, context: ContextAnalysisResult): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on personality completeness
    if (personality.traits.length >= 5) {
      confidence += 0.1;
    }
    if (personality.examples.length > 0) {
      confidence += 0.1;
    }
    if (personality.promptTemplates.length > 1) {
      confidence += 0.1;
    }

    // Increase confidence based on context clarity
    if (context.topics.length > 2) {
      confidence += 0.1;
    }
    if (context.complexity.indicators.length > 2) {
      confidence += 0.1;
    }
    if (context.metadata.messageCount > 5) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  // Helper methods

  /**
   * Initialize trait compatibility weights
   */
  private initializeTraitWeights(): TraitCompatibilityWeights {
    return {
      technical_support: {
        expertise_level: 0.9,
        technical_depth: 0.8,
        precision: 0.7,
        communication_style: 0.6,
      },
      creative_assistance: {
        creativity: 0.9,
        communication_style: 0.7,
        verbosity: 0.6,
        tone: 0.5,
      },
      emotional_support: {
        empathy: 0.9,
        tone: 0.8,
        patience: 0.7,
        communication_style: 0.6,
      },
      information_seeking: {
        expertise_level: 0.8,
        precision: 0.7,
        verbosity: 0.6,
        communication_style: 0.5,
      },
    };
  }

  /**
   * Initialize intent-personality mappings
   */
  private initializeIntentMappings(): IntentPersonalityMapping {
    return {
      technical_support: {
        preferredTraits: [
          { trait: 'expertise_level', value: 'expert', weight: 0.9 },
          { trait: 'technical_depth', value: 'detailed', weight: 0.8 },
          { trait: 'precision', value: 'high', weight: 0.7 },
        ],
        incompatibleTraits: [
          { trait: 'creativity', value: 'high', penalty: 0.3 },
          { trait: 'humor', value: 'high', penalty: 0.2 },
        ],
        contextualModifiers: [],
      },
      creative_assistance: {
        preferredTraits: [
          { trait: 'creativity', value: 'high', weight: 0.9 },
          { trait: 'communication_style', value: 'creative', weight: 0.7 },
        ],
        incompatibleTraits: [{ trait: 'formality', value: 'formal', penalty: 0.4 }],
        contextualModifiers: [],
      },
      emotional_support: {
        preferredTraits: [
          { trait: 'empathy', value: 'high', weight: 0.9 },
          { trait: 'tone', value: 'supportive', weight: 0.8 },
          { trait: 'patience', value: 'high', weight: 0.7 },
        ],
        incompatibleTraits: [],
        contextualModifiers: [],
      },
    };
  }

  /**
   * Convert personality to vector representation
   */
  private personalityToVector(personality: PersonalityProfile): number[] {
    // Create a standardized vector representation
    const traitNames = ['tone', 'formality', 'expertise_level', 'communication_style', 'creativity', 'empathy', 'precision', 'verbosity'];

    return traitNames.map((traitName) => {
      const trait = personality.traits.find((t) => t.name === traitName);
      return trait ? this.traitValueToNumeric(trait.value) * trait.weight : 0;
    });
  }

  /**
   * Convert context to vector representation
   */
  private contextToVector(context: ContextAnalysisResult): number[] {
    // Create a vector based on context requirements
    return [
      this.traitValueToNumeric(context.userPatterns.communicationStyle) * 0.8,
      context.userPatterns.communicationStyle === 'formal' ? 0.8 : 0.2,
      this.expertiseLevelToNumeric(context.userPatterns.expertiseLevel),
      this.traitValueToNumeric(context.userPatterns.communicationStyle) * 0.9,
      context.intent === 'creative_assistance' ? 0.9 : 0.3,
      context.emotionalContext.intensity,
      context.complexity.score / 100,
      context.userPatterns.preferredVerbosity === 'detailed' ? 0.9 : 0.5,
    ];
  }

  /**
   * Convert trait value to numeric representation
   */
  private traitValueToNumeric(value: string): number {
    const mappings: Record<string, number> = {
      low: 0.2,
      basic: 0.2,
      moderate: 0.5,
      medium: 0.5,
      casual: 0.5,
      high: 0.8,
      detailed: 0.8,
      formal: 0.8,
      expert: 1.0,
      advanced: 1.0,
      technical: 0.7,
      creative: 0.8,
      professional: 0.6,
    };

    return mappings[value.toLowerCase()] || 0.5;
  }

  /**
   * Convert expertise level to numeric
   */
  private expertiseLevelToNumeric(level: string): number {
    const mappings: Record<string, number> = {
      beginner: 0.2,
      intermediate: 0.5,
      advanced: 0.8,
      expert: 1.0,
    };

    return mappings[level] || 0.5;
  }

  /**
   * Get category alignment score
   */
  private getCategoryAlignmentScore(category: string, intent: ConversationIntent): number {
    const alignments: Record<string, Record<ConversationIntent, number>> = {
      technical: {
        technical_support: 0.9,
        problem_solving: 0.8,
        research_analysis: 0.7,
        information_seeking: 0.6,
        creative_assistance: 0.2,
        emotional_support: 0.1,
        casual_conversation: 0.3,
        professional_consultation: 0.7,
        learning_teaching: 0.6,
        decision_making: 0.5,
        entertainment: 0.1,
        task_completion: 0.6,
      },
      creative: {
        creative_assistance: 0.9,
        entertainment: 0.7,
        casual_conversation: 0.6,
        learning_teaching: 0.5,
        information_seeking: 0.4,
        technical_support: 0.2,
        problem_solving: 0.4,
        research_analysis: 0.3,
        professional_consultation: 0.3,
        decision_making: 0.4,
        emotional_support: 0.5,
        task_completion: 0.3,
      },
      // Add more categories as needed
    };

    return alignments[category]?.[intent] || 0.5;
  }

  /**
   * Get topic relevance score
   */
  private getTopicRelevanceScore(personality: PersonalityProfile, topics: Array<{ topic: string; relevance: number; keywords: string[] }>): number {
    let relevanceScore = 0;
    let totalRelevance = 0;

    topics.forEach((topic) => {
      // Check if personality tags match topic keywords
      const tagMatches = personality.tags.filter((tag) =>
        topic.keywords.some((keyword) => keyword.toLowerCase().includes(tag.toLowerCase()) || tag.toLowerCase().includes(keyword.toLowerCase())),
      );

      if (tagMatches.length > 0) {
        relevanceScore += topic.relevance * (tagMatches.length / personality.tags.length);
      }
      totalRelevance += topic.relevance;
    });

    return totalRelevance > 0 ? relevanceScore / totalRelevance : 0.5;
  }

  /**
   * Get tag matching score
   */
  private getTagMatchingScore(tags: string[], context: ContextAnalysisResult): number {
    let matches = 0;

    // Check intent-related tags
    const intentTags = [context.intent.replace('_', '-')];
    matches += tags.filter((tag) => intentTags.includes(tag)).length;

    // Check complexity-related tags
    const complexityTags = [context.complexity.level];
    matches += tags.filter((tag) => complexityTags.includes(tag)).length;

    // Check topic-related tags
    const topicTags = context.topics.map((t) => t.topic);
    matches += tags.filter((tag) => topicTags.includes(tag)).length;

    return Math.min(matches / Math.max(tags.length, 1), 1.0);
  }

  /**
   * Check if trait is relevant to context
   */
  private isTraitRelevantToContext(traitName: string, context: ContextAnalysisResult): boolean {
    const relevantTraits = new Set(['communication_style', 'expertise_level', 'technical_depth', 'empathy', 'tone', 'formality', 'verbosity']);

    // Add context-specific traits
    if (context.intent === 'technical_support') {
      relevantTraits.add('precision');
      relevantTraits.add('technical_depth');
    }
    if (context.intent === 'creative_assistance') {
      relevantTraits.add('creativity');
    }
    if (context.emotionalContext.intensity > 0.5) {
      relevantTraits.add('empathy');
      relevantTraits.add('patience');
    }

    return relevantTraits.has(traitName);
  }

  /**
   * Generate switch reason for recommendations
   */
  private generateSwitchReason(score: PersonalityCompatibilityScore, context: ContextAnalysisResult): string {
    if (score.scores.intentCompatibility > 0.8) {
      return `Excellent match for ${context.intent} conversations`;
    }
    if (score.scores.traitMatching > 0.8) {
      return 'Strong trait alignment with conversation requirements';
    }
    if (score.scores.complexityFit > 0.8) {
      return `Well-suited for ${context.complexity.level} complexity discussions`;
    }
    if (score.scores.userPatternAlignment > 0.7) {
      return 'Good alignment with user communication preferences';
    }

    return 'Overall good compatibility with current context';
  }

  /**
   * Analyze trait improvement potential
   */
  private async analyzeTraitImprovement(
    trait: PersonalityTrait,
    context: ContextAnalysisResult,
    _currentScore: PersonalityCompatibilityScore,
  ): Promise<{
    traitName: string;
    currentValue: string;
    suggestedValue: string;
    expectedImprovement: number;
    confidence: number;
    reason: string;
  }> {
    // Simplified improvement analysis
    let suggestedValue = trait.value;
    let expectedImprovement = 0;
    let confidence = 0.5;
    let reason = 'No significant improvement identified';

    // Context-based suggestions
    if (context.intent === 'technical_support' && trait.name === 'expertise_level' && trait.value !== 'expert') {
      suggestedValue = 'expert';
      expectedImprovement = 0.3;
      confidence = 0.8;
      reason = 'Expert level expertise needed for technical support';
    }

    if (context.emotionalContext.intensity > 0.7 && trait.name === 'empathy' && trait.value !== 'high') {
      suggestedValue = 'high';
      expectedImprovement = 0.25;
      confidence = 0.9;
      reason = 'High empathy needed for emotional context';
    }

    return {
      traitName: trait.name,
      currentValue: trait.value,
      suggestedValue,
      expectedImprovement,
      confidence,
      reason,
    };
  }

  /**
   * Create default compatibility score for error cases
   */
  private createDefaultCompatibilityScore(personalityId: string): PersonalityCompatibilityScore {
    return {
      personalityId,
      personalityName: 'Unknown',
      overallScore: 0.5,
      scores: {
        contextAlignment: 0.5,
        traitMatching: 0.5,
        intentCompatibility: 0.5,
        userPatternAlignment: 0.5,
        complexityFit: 0.5,
        emotionalAlignment: 0.5,
      },
      rationale: {
        strengths: [],
        weaknesses: ['Unable to perform detailed analysis'],
        matchingTraits: [],
        traitAdjustments: [],
      },
      confidence: 0.0,
      metadata: {
        scoredAt: new Date(),
        scoringVersion: '1.0.0',
        contextFactorsConsidered: [],
      },
    };
  }
}
