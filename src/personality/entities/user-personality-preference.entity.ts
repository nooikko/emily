import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * User interaction feedback types
 */
export enum FeedbackType {
  /** User provided explicit rating (1-5 stars, thumbs up/down, etc.) */
  RATING = 'rating',
  /** User provided textual feedback about personality performance */
  COMMENT = 'comment',
  /** Implicit feedback from user behavior (message length, frequency, etc.) */
  BEHAVIORAL = 'behavioral',
  /** User reported issue or complaint about personality */
  COMPLAINT = 'complaint',
  /** User explicitly requested personality switch */
  SWITCH_REQUEST = 'switch_request',
  /** User expressed satisfaction or appreciation */
  APPRECIATION = 'appreciation',
}

/**
 * Interaction context types
 */
export enum InteractionContext {
  /** General conversation or chat */
  GENERAL = 'general',
  /** Technical or coding assistance */
  TECHNICAL = 'technical',
  /** Creative writing or brainstorming */
  CREATIVE = 'creative',
  /** Educational or learning context */
  EDUCATIONAL = 'educational',
  /** Problem-solving or debugging */
  PROBLEM_SOLVING = 'problem_solving',
  /** Research or information gathering */
  RESEARCH = 'research',
  /** Professional or business context */
  PROFESSIONAL = 'professional',
}

/**
 * User feedback on personality interactions
 */
export interface PersonalityFeedback {
  /** Type of feedback provided */
  type: FeedbackType;
  /** Feedback score (1-5 for ratings, sentiment score for behavioral) */
  score?: number;
  /** Textual feedback content */
  comment?: string;
  /** Specific aspects of personality that were rated */
  aspects?: {
    helpfulness?: number;
    tone?: number;
    accuracy?: number;
    clarity?: number;
    engagement?: number;
    personalization?: number;
  };
  /** Suggested improvements */
  suggestions?: string[];
  /** Whether user would recommend this personality for similar contexts */
  wouldRecommend?: boolean;
}

/**
 * Behavioral interaction patterns
 */
export interface InteractionPatterns {
  /** Average message length in this context */
  averageMessageLength: number;
  /** Response time preference (seconds) */
  preferredResponseTime?: number;
  /** Complexity level preference (1-5) */
  complexityPreference: number;
  /** Communication style preference */
  communicationStyle: 'formal' | 'casual' | 'technical' | 'friendly';
  /** Engagement patterns */
  engagementMetrics: {
    followUpQuestions: number;
    conversationDuration: number;
    topicChanges: number;
    satisfactionIndicators: number;
  };
  /** Time-based patterns */
  timePatterns?: {
    preferredTimeOfDay?: string[];
    sessionDuration?: number;
    frequencyPattern?: string;
  };
}

/**
 * Context-specific personality performance metrics
 */
export interface ContextualPerformance {
  /** Context type */
  context: InteractionContext;
  /** Personality compatibility score for this context (0-1) */
  compatibilityScore: number;
  /** Number of interactions in this context */
  interactionCount: number;
  /** Average user satisfaction (0-1) */
  averageSatisfaction: number;
  /** Success rate for this context */
  successRate: number;
  /** Specific performance metrics */
  metrics: {
    taskCompletionRate: number;
    responseAccuracy: number;
    userEngagement: number;
    conversationQuality: number;
  };
  /** Last interaction timestamp */
  lastInteraction: Date;
  /** Performance trend direction */
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * User Personality Preference Entity
 * 
 * Stores user preferences and learning data for personality recommendations.
 * This is a single-user system, so preferences are global but context-aware.
 */
@Entity('user_personality_preferences')
@Index(['personalityId'])
@Index(['interactionContext'])
@Index(['createdAt'])
export class UserPersonalityPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Personality profile ID this preference relates to */
  @Column({ type: 'uuid' })
  @Index()
  personalityId: string;

  /** Context where this preference applies */
  @Column({ type: 'enum', enum: InteractionContext })
  interactionContext: InteractionContext;

  /** Overall preference score for this personality in this context (0-1) */
  @Column({ type: 'decimal', precision: 4, scale: 3 })
  preferenceScore: number;

  /** Number of interactions contributing to this preference */
  @Column({ type: 'int', default: 0 })
  interactionCount: number;

  /** User feedback data */
  @Column({ type: 'jsonb' })
  feedback: PersonalityFeedback[];

  /** Behavioral interaction patterns */
  @Column({ type: 'jsonb' })
  interactionPatterns: InteractionPatterns;

  /** Contextual performance metrics */
  @Column({ type: 'jsonb' })
  contextualPerformance: ContextualPerformance[];

  /** User's explicit preferences for this personality */
  @Column({ type: 'jsonb', default: {} })
  explicitPreferences: {
    /** User-set preference level (1-5) */
    userRating?: number;
    /** Contexts where user prefers this personality */
    preferredContexts?: InteractionContext[];
    /** Contexts where user dislikes this personality */
    dislikedContexts?: InteractionContext[];
    /** Custom notes from user */
    notes?: string;
    /** User-defined tags */
    tags?: string[];
  };

  /** Learning confidence level (0-1) */
  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0 })
  learningConfidence: number;

  /** Timestamp of last interaction */
  @Column({ type: 'timestamptz' })
  lastInteraction: Date;

  /** Timestamp of last preference update */
  @Column({ type: 'timestamptz' })
  lastPreferenceUpdate: Date;

  /** Version for tracking preference evolution */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** Additional metadata */
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    /** Source of preference data */
    dataSource?: 'explicit' | 'implicit' | 'hybrid';
    /** Confidence intervals */
    confidenceIntervals?: {
      lower: number;
      upper: number;
    };
    /** A/B testing data */
    testingData?: {
      experimentId?: string;
      variant?: string;
      controlGroup?: boolean;
    };
    /** External factors affecting preference */
    contextualFactors?: Record<string, any>;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Add new feedback and update preference scores
   */
  addFeedback(feedback: PersonalityFeedback): void {
    this.feedback.push(feedback);
    this.interactionCount += 1;
    this.lastInteraction = new Date();
    this.lastPreferenceUpdate = new Date();
    
    // Recalculate preference score based on feedback
    this.updatePreferenceScore();
    
    // Update learning confidence
    this.updateLearningConfidence();
  }

  /**
   * Update interaction patterns with new data
   */
  updateInteractionPatterns(patterns: Partial<InteractionPatterns>): void {
    this.interactionPatterns = {
      ...this.interactionPatterns,
      ...patterns,
    };
    this.lastPreferenceUpdate = new Date();
  }

  /**
   * Update contextual performance metrics
   */
  updateContextualPerformance(context: InteractionContext, performance: Partial<ContextualPerformance>): void {
    const existingIndex = this.contextualPerformance.findIndex(p => p.context === context);
    
    if (existingIndex >= 0) {
      this.contextualPerformance[existingIndex] = {
        ...this.contextualPerformance[existingIndex],
        ...performance,
        lastInteraction: new Date(),
      };
    } else {
      this.contextualPerformance.push({
        context,
        compatibilityScore: 0.5,
        interactionCount: 0,
        averageSatisfaction: 0.5,
        successRate: 0.5,
        metrics: {
          taskCompletionRate: 0.5,
          responseAccuracy: 0.5,
          userEngagement: 0.5,
          conversationQuality: 0.5,
        },
        lastInteraction: new Date(),
        trend: 'stable',
        ...performance,
      });
    }
    
    this.lastPreferenceUpdate = new Date();
  }

  /**
   * Get average feedback score
   */
  getAverageFeedbackScore(): number {
    const scores = this.feedback
      .filter(f => f.score !== undefined)
      .map(f => f.score!);
    
    if (scores.length === 0) return 0.5;
    
    return scores.reduce((sum, score) => sum + score, 0) / scores.length / 5; // Normalize to 0-1
  }

  /**
   * Get feedback score for specific aspect
   */
  getAspectScore(aspect: keyof PersonalityFeedback['aspects']): number {
    const aspectScores = this.feedback
      .filter(f => f.aspects?.[aspect] !== undefined)
      .map(f => f.aspects![aspect]!);
    
    if (aspectScores.length === 0) return 0.5;
    
    return aspectScores.reduce((sum, score) => sum + score, 0) / aspectScores.length / 5; // Normalize to 0-1
  }

  /**
   * Get recommendation likelihood for a specific context
   */
  getContextRecommendationScore(context: InteractionContext): number {
    const contextPerf = this.contextualPerformance.find(p => p.context === context);
    
    if (!contextPerf) return this.preferenceScore;
    
    // Combine preference score with contextual performance
    return (this.preferenceScore * 0.4) + 
           (contextPerf.compatibilityScore * 0.3) + 
           (contextPerf.averageSatisfaction * 0.3);
  }

  /**
   * Check if preference data is sufficient for reliable recommendations
   */
  hasSufficientData(): boolean {
    return this.interactionCount >= 3 && this.learningConfidence >= 0.6;
  }

  /**
   * Get preference trend over time
   */
  getPreferenceTrend(): 'improving' | 'stable' | 'declining' {
    if (this.feedback.length < 3) return 'stable';
    
    const recentFeedback = this.feedback.slice(-3);
    const scores = recentFeedback
      .filter(f => f.score !== undefined)
      .map(f => f.score! / 5); // Normalize to 0-1
    
    if (scores.length < 2) return 'stable';
    
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    
    if (difference > 0.1) return 'improving';
    if (difference < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Private method to update preference score based on feedback
   */
  private updatePreferenceScore(): void {
    const averageFeedback = this.getAverageFeedbackScore();
    const currentScore = this.preferenceScore;
    
    // Use weighted average with more weight on recent feedback
    const weight = Math.min(this.interactionCount / 10, 0.8); // Max 80% weight on new data
    this.preferenceScore = (currentScore * (1 - weight)) + (averageFeedback * weight);
    
    // Ensure score stays in bounds
    this.preferenceScore = Math.max(0, Math.min(1, this.preferenceScore));
  }

  /**
   * Private method to update learning confidence
   */
  private updateLearningConfidence(): void {
    // Confidence increases with more interactions and consistent feedback
    const baseConfidence = Math.min(this.interactionCount / 10, 0.7);
    
    // Boost confidence if feedback is consistent
    const scores = this.feedback
      .filter(f => f.score !== undefined)
      .map(f => f.score! / 5);
    
    if (scores.length >= 2) {
      const variance = this.calculateVariance(scores);
      const consistencyBoost = Math.max(0, 0.3 - variance); // Lower variance = higher consistency
      this.learningConfidence = Math.min(1, baseConfidence + consistencyBoost);
    } else {
      this.learningConfidence = baseConfidence;
    }
  }

  /**
   * Calculate variance in feedback scores
   */
  private calculateVariance(scores: number[]): number {
    if (scores.length < 2) return 0;
    
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const squaredDiffs = scores.map(score => Math.pow(score - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / scores.length;
  }

  /**
   * Export preference data for analysis or backup
   */
  exportData(): {
    personalityId: string;
    context: InteractionContext;
    preferenceScore: number;
    interactionCount: number;
    learningConfidence: number;
    feedbackSummary: {
      totalFeedback: number;
      averageScore: number;
      aspectScores: Record<string, number>;
      trend: string;
    };
    performanceSummary: Record<string, number>;
  } {
    return {
      personalityId: this.personalityId,
      context: this.interactionContext,
      preferenceScore: this.preferenceScore,
      interactionCount: this.interactionCount,
      learningConfidence: this.learningConfidence,
      feedbackSummary: {
        totalFeedback: this.feedback.length,
        averageScore: this.getAverageFeedbackScore(),
        aspectScores: {
          helpfulness: this.getAspectScore('helpfulness'),
          tone: this.getAspectScore('tone'),
          accuracy: this.getAspectScore('accuracy'),
          clarity: this.getAspectScore('clarity'),
          engagement: this.getAspectScore('engagement'),
          personalization: this.getAspectScore('personalization'),
        },
        trend: this.getPreferenceTrend(),
      },
      performanceSummary: this.contextualPerformance.reduce((acc, perf) => {
        acc[perf.context] = perf.compatibilityScore;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}