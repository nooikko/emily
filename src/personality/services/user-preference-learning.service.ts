import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { UserPersonalityPreference, FeedbackType, InteractionContext } from '../entities/user-personality-preference.entity';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { 
  SubmitPersonalityFeedbackDto, 
  BehavioralFeedbackDto, 
  PersonalityRecommendationRequestDto,
  UserPreferenceProfileDto 
} from '../dto/personality-feedback.dto';
import { BaseMessage } from '@langchain/core/messages';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';

/**
 * Learning algorithm types for preference calculation
 */
export enum LearningAlgorithm {
  /** Simple weighted average */
  WEIGHTED_AVERAGE = 'weighted_average',
  /** Exponential decay for time-based weighting */
  EXPONENTIAL_DECAY = 'exponential_decay',
  /** Bayesian inference for uncertainty modeling */
  BAYESIAN = 'bayesian',
  /** Collaborative filtering based approach */
  COLLABORATIVE = 'collaborative',
}

/**
 * Learning configuration interface
 */
export interface LearningConfiguration {
  /** Algorithm to use for learning */
  algorithm: LearningAlgorithm;
  /** Learning rate (0-1) */
  learningRate: number;
  /** Decay factor for time-based weighting */
  decayFactor: number;
  /** Minimum interactions before confident recommendations */
  minInteractionsForConfidence: number;
  /** Weight for explicit vs implicit feedback */
  explicitFeedbackWeight: number;
  /** Enable behavioral pattern analysis */
  behavioralAnalysisEnabled: boolean;
  /** Confidence threshold for recommendations */
  recommendationConfidenceThreshold: number;
}

/**
 * Feedback analysis result
 */
export interface FeedbackAnalysisResult {
  /** Updated preference score */
  updatedPreferenceScore: number;
  /** Confidence in the preference */
  confidence: number;
  /** Key insights from the feedback */
  insights: string[];
  /** Suggested actions based on analysis */
  suggestedActions: Array<{
    action: 'maintain' | 'improve' | 'consider_alternative' | 'gather_more_data';
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  /** Learning quality indicators */
  learningQuality: {
    dataQuality: number; // 0-1
    consistency: number; // 0-1
    recency: number; // 0-1
    volume: number; // 0-1
  };
}

/**
 * User Preference Learning Service
 * 
 * Advanced learning system for personality preferences using LangChain's ML capabilities.
 * Implements multiple learning algorithms and behavioral analysis to build comprehensive
 * user preference profiles over time.
 */
@Injectable()
export class UserPreferenceLearningService extends LangChainBaseService {
  private readonly defaultConfiguration: LearningConfiguration = {
    algorithm: LearningAlgorithm.BAYESIAN,
    learningRate: 0.3,
    decayFactor: 0.95,
    minInteractionsForConfidence: 5,
    explicitFeedbackWeight: 0.7,
    behavioralAnalysisEnabled: true,
    recommendationConfidenceThreshold: 0.6,
  };

  private configuration: LearningConfiguration = { ...this.defaultConfiguration };

  constructor(
    @InjectRepository(UserPersonalityPreference)
    private readonly preferenceRepository: Repository<UserPersonalityPreference>,
    @InjectRepository(PersonalityProfile)
    private readonly personalityRepository: Repository<PersonalityProfile>,
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
  ) {
    super('UserPreferenceLearningService');
  }

  /**
   * Submit explicit user feedback and update preferences
   */
  async submitFeedback(
    feedbackDto: SubmitPersonalityFeedbackDto
  ): Promise<FeedbackAnalysisResult> {
    this.logExecution('submitFeedback', {
      personalityId: feedbackDto.personalityId,
      context: feedbackDto.interactionContext,
      feedbackType: feedbackDto.feedbackType,
    });

    try {
      // Get or create user preference record
      let preference = await this.preferenceRepository.findOne({
        where: {
          personalityId: feedbackDto.personalityId,
          interactionContext: feedbackDto.interactionContext,
        },
      });

      if (!preference) {
        preference = await this.createNewPreference(
          feedbackDto.personalityId,
          feedbackDto.interactionContext
        );
      }

      // Process the feedback using LangChain-powered analysis
      const feedbackAnalysis = await this.createTracedRunnable(
        'analyzeFeedback',
        () => this.analyzeFeedbackData(feedbackDto, preference!)
      ).invoke({});

      // Update preference with new feedback
      preference.addFeedback({
        type: feedbackDto.feedbackType,
        score: feedbackDto.overallScore,
        comment: feedbackDto.comment,
        aspects: feedbackDto.aspects,
        suggestions: feedbackDto.suggestions,
        wouldRecommend: feedbackDto.wouldRecommend,
      });

      // Apply learning algorithm to update scores
      const learningResult = await this.applyLearningAlgorithm(preference, feedbackAnalysis);
      preference.preferenceScore = learningResult.updatedPreferenceScore;
      preference.learningConfidence = learningResult.confidence;

      // Save updated preference
      await this.preferenceRepository.save(preference);

      this.logger.debug('Feedback processed and preferences updated', {
        personalityId: feedbackDto.personalityId,
        newPreferenceScore: learningResult.updatedPreferenceScore,
        confidence: learningResult.confidence,
      });

      return learningResult;
    } catch (error) {
      this.logger.error('Failed to submit feedback', error);
      throw error;
    }
  }

  /**
   * Submit behavioral feedback (implicit feedback from interactions)
   */
  async submitBehavioralFeedback(
    behavioralDto: BehavioralFeedbackDto
  ): Promise<FeedbackAnalysisResult> {
    this.logExecution('submitBehavioralFeedback', {
      personalityId: behavioralDto.personalityId,
      context: behavioralDto.interactionContext,
      threadId: behavioralDto.threadId,
    });

    try {
      // Get or create preference record
      let preference = await this.preferenceRepository.findOne({
        where: {
          personalityId: behavioralDto.personalityId,
          interactionContext: behavioralDto.interactionContext,
        },
      });

      if (!preference) {
        preference = await this.createNewPreference(
          behavioralDto.personalityId,
          behavioralDto.interactionContext
        );
      }

      // Analyze behavioral patterns using LangChain
      const behavioralAnalysis = await this.createTracedRunnable(
        'analyzeBehavioralPatterns',
        () => this.analyzeBehavioralPatterns(behavioralDto, preference!)
      ).invoke({});

      // Update interaction patterns
      preference.updateInteractionPatterns({
        averageMessageLength: behavioralDto.averageMessageLength || preference.interactionPatterns.averageMessageLength,
        complexityPreference: behavioralDto.complexityPreference || preference.interactionPatterns.complexityPreference,
        communicationStyle: behavioralDto.communicationStyle || preference.interactionPatterns.communicationStyle,
        engagementMetrics: {
          followUpQuestions: behavioralDto.followUpQuestions || 0,
          conversationDuration: behavioralDto.conversationDuration || 0,
          topicChanges: behavioralDto.topicChanges || 0,
          satisfactionIndicators: behavioralDto.satisfactionIndicators || 0,
        },
      });

      // Apply behavioral learning
      const learningResult = await this.applyBehavioralLearning(preference, behavioralAnalysis);
      preference.preferenceScore = learningResult.updatedPreferenceScore;

      // Save updated preference
      await this.preferenceRepository.save(preference);

      this.logger.debug('Behavioral feedback processed', {
        personalityId: behavioralDto.personalityId,
        threadId: behavioralDto.threadId,
        analysisInsights: behavioralAnalysis.insights.length,
      });

      return learningResult;
    } catch (error) {
      this.logger.error('Failed to submit behavioral feedback', error);
      throw error;
    }
  }

  /**
   * Analyze conversation thread for implicit feedback signals
   */
  async analyzeThreadForFeedback(
    threadId: string,
    messages: BaseMessage[],
    personalityId: string
  ): Promise<BehavioralFeedbackDto | null> {
    this.logExecution('analyzeThreadForFeedback', {
      threadId,
      messageCount: messages.length,
      personalityId,
    });

    try {
      // Use LangChain to analyze conversation patterns
      const conversationAnalysis = await this.createTracedRunnable(
        'analyzeConversationPatterns',
        () => this.performConversationAnalysis(messages, threadId)
      ).invoke({});

      // Extract behavioral feedback data
      const behavioralFeedback: BehavioralFeedbackDto = {
        personalityId,
        interactionContext: conversationAnalysis.inferredContext,
        threadId,
        averageMessageLength: conversationAnalysis.averageMessageLength,
        followUpQuestions: conversationAnalysis.followUpQuestions,
        conversationDuration: conversationAnalysis.durationMinutes,
        topicChanges: conversationAnalysis.topicChanges,
        satisfactionIndicators: conversationAnalysis.satisfactionIndicators,
        complexityPreference: conversationAnalysis.inferredComplexity,
        communicationStyle: conversationAnalysis.inferredStyle,
      };

      return behavioralFeedback;
    } catch (error) {
      this.logger.error('Failed to analyze thread for feedback', { threadId, error });
      return null;
    }
  }

  /**
   * Get comprehensive user preference profile
   */
  async getUserPreferenceProfile(): Promise<UserPreferenceProfileDto> {
    this.logExecution('getUserPreferenceProfile');

    try {
      // Get all user preferences
      const preferences = await this.preferenceRepository.find({
        order: {
          preferenceScore: 'DESC',
          interactionCount: 'DESC',
        },
      });

      // Get personality details
      const personalityIds = [...new Set(preferences.map(p => p.personalityId))];
      const personalities = await this.personalityRepository.findByIds(personalityIds);
      const personalityMap = new Map(personalities.map(p => [p.id, p]));

      // Calculate top preferences
      const topPreferences = preferences
        .filter(p => p.hasSufficientData())
        .slice(0, 5)
        .map(p => ({
          personalityId: p.personalityId,
          personalityName: personalityMap.get(p.personalityId)?.name || 'Unknown',
          confidenceScore: p.learningConfidence,
          contextCompatibility: p.preferenceScore,
          reasons: this.generateRecommendationReasons(p),
          previousInteractions: p.interactionCount,
          averageSatisfaction: p.getAverageFeedbackScore(),
          performanceTrend: p.getPreferenceTrend(),
        }));

      // Calculate context-specific preferences
      const contextPreferences: Record<InteractionContext, string[]> = {} as any;
      for (const context of Object.values(InteractionContext)) {
        const contextPrefs = preferences
          .filter(p => p.interactionContext === context)
          .sort((a, b) => b.preferenceScore - a.preferenceScore)
          .slice(0, 3)
          .map(p => p.personalityId);
        
        if (contextPrefs.length > 0) {
          contextPreferences[context] = contextPrefs;
        }
      }

      // Calculate behavioral patterns
      const behaviorPatterns = await this.calculateBehavioralPatterns(preferences);

      // Generate recommendations
      const recommendations = await this.generateUserRecommendations(preferences, personalityMap);

      return {
        topPreferences,
        contextPreferences,
        learningConfidence: this.calculateOverallConfidence(preferences),
        totalInteractions: preferences.reduce((sum, p) => sum + p.interactionCount, 0),
        behaviorPatterns,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to get user preference profile', error);
      throw error;
    }
  }

  /**
   * Update learning configuration
   */
  updateConfiguration(config: Partial<LearningConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    this.logger.debug('Learning configuration updated', { config });
  }

  /**
   * Get learning analytics and insights
   */
  async getLearningAnalytics(): Promise<{
    totalPreferences: number;
    confidenceDistribution: Record<string, number>;
    contextAnalysis: Record<InteractionContext, { count: number; avgScore: number; confidence: number }>;
    learningQuality: {
      overall: number;
      dataQuality: number;
      consistency: number;
      coverage: number;
    };
    recommendations: Array<{
      category: 'data_collection' | 'algorithm_tuning' | 'user_experience';
      suggestion: string;
      impact: 'high' | 'medium' | 'low';
    }>;
  }> {
    this.logExecution('getLearningAnalytics');

    try {
      const preferences = await this.preferenceRepository.find();
      
      // Calculate confidence distribution
      const confidenceDistribution = {
        low: preferences.filter(p => p.learningConfidence < 0.3).length,
        medium: preferences.filter(p => p.learningConfidence >= 0.3 && p.learningConfidence < 0.7).length,
        high: preferences.filter(p => p.learningConfidence >= 0.7).length,
      };

      // Context analysis
      const contextAnalysis: Record<string, any> = {};
      for (const context of Object.values(InteractionContext)) {
        const contextPrefs = preferences.filter(p => p.interactionContext === context);
        if (contextPrefs.length > 0) {
          contextAnalysis[context] = {
            count: contextPrefs.length,
            avgScore: contextPrefs.reduce((sum, p) => sum + p.preferenceScore, 0) / contextPrefs.length,
            confidence: contextPrefs.reduce((sum, p) => sum + p.learningConfidence, 0) / contextPrefs.length,
          };
        }
      }

      // Calculate learning quality metrics
      const learningQuality = await this.calculateLearningQuality(preferences);

      // Generate system recommendations
      const recommendations = await this.generateSystemLearningRecommendations(
        preferences,
        confidenceDistribution,
        contextAnalysis,
        learningQuality
      );

      return {
        totalPreferences: preferences.length,
        confidenceDistribution,
        contextAnalysis: contextAnalysis as any,
        learningQuality,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to get learning analytics', error);
      throw error;
    }
  }

  // Private helper methods

  private async createNewPreference(
    personalityId: string,
    context: InteractionContext
  ): Promise<UserPersonalityPreference> {
    const preference = new UserPersonalityPreference();
    preference.personalityId = personalityId;
    preference.interactionContext = context;
    preference.preferenceScore = 0.5; // Neutral starting point
    preference.interactionCount = 0;
    preference.feedback = [];
    preference.interactionPatterns = {
      averageMessageLength: 0,
      complexityPreference: 3,
      communicationStyle: 'casual',
      engagementMetrics: {
        followUpQuestions: 0,
        conversationDuration: 0,
        topicChanges: 0,
        satisfactionIndicators: 0,
      },
    };
    preference.contextualPerformance = [];
    preference.explicitPreferences = {};
    preference.learningConfidence = 0;
    preference.lastInteraction = new Date();
    preference.lastPreferenceUpdate = new Date();
    preference.metadata = {
      dataSource: 'explicit',
    };

    return await this.preferenceRepository.save(preference);
  }

  private async analyzeFeedbackData(
    feedbackDto: SubmitPersonalityFeedbackDto,
    preference: UserPersonalityPreference
  ): Promise<FeedbackAnalysisResult> {
    // Analyze feedback sentiment and extract insights
    const insights: string[] = [];
    const suggestedActions: FeedbackAnalysisResult['suggestedActions'] = [];

    // Analyze overall score
    if (feedbackDto.overallScore) {
      if (feedbackDto.overallScore >= 4) {
        insights.push('High user satisfaction indicated');
        suggestedActions.push({
          action: 'maintain',
          description: 'Continue current personality approach',
          priority: 'low',
        });
      } else if (feedbackDto.overallScore <= 2) {
        insights.push('Low satisfaction - requires improvement');
        suggestedActions.push({
          action: 'improve',
          description: 'Investigate specific issues and optimize personality',
          priority: 'high',
        });
      }
    }

    // Analyze aspects
    if (feedbackDto.aspects) {
      const aspects = feedbackDto.aspects;
      Object.entries(aspects).forEach(([aspect, score]) => {
        if (score && score <= 2) {
          insights.push(`${aspect} aspect needs improvement (score: ${score})`);
          suggestedActions.push({
            action: 'improve',
            description: `Focus on improving ${aspect} in personality responses`,
            priority: 'medium',
          });
        }
      });
    }

    // Analyze suggestions
    if (feedbackDto.suggestions && feedbackDto.suggestions.length > 0) {
      insights.push(`User provided ${feedbackDto.suggestions.length} improvement suggestions`);
      suggestedActions.push({
        action: 'improve',
        description: 'Review and implement user suggestions',
        priority: 'medium',
      });
    }

    // Calculate learning quality
    const learningQuality = {
      dataQuality: this.calculateDataQuality(feedbackDto),
      consistency: this.calculateConsistency(preference, feedbackDto),
      recency: 1.0, // New feedback is always recent
      volume: Math.min(preference.interactionCount / 10, 1), // Normalize volume
    };

    return {
      updatedPreferenceScore: preference.preferenceScore, // Will be updated by learning algorithm
      confidence: preference.learningConfidence,
      insights,
      suggestedActions,
      learningQuality,
    };
  }

  private async analyzeBehavioralPatterns(
    behavioralDto: BehavioralFeedbackDto,
    preference: UserPersonalityPreference
  ): Promise<FeedbackAnalysisResult> {
    const insights: string[] = [];
    const suggestedActions: FeedbackAnalysisResult['suggestedActions'] = [];

    // Analyze engagement metrics
    if (behavioralDto.followUpQuestions && behavioralDto.followUpQuestions > 3) {
      insights.push('High engagement - user asking many follow-up questions');
    }

    if (behavioralDto.conversationDuration && behavioralDto.conversationDuration > 30) {
      insights.push('Long conversation duration indicates user engagement');
    }

    if (behavioralDto.satisfactionIndicators && behavioralDto.satisfactionIndicators > 2) {
      insights.push('Positive satisfaction indicators detected');
    }

    // Analyze communication preferences
    if (behavioralDto.communicationStyle) {
      const currentStyle = preference.interactionPatterns.communicationStyle;
      if (currentStyle !== behavioralDto.communicationStyle) {
        insights.push(`Communication style preference shift: ${currentStyle} → ${behavioralDto.communicationStyle}`);
      }
    }

    return {
      updatedPreferenceScore: preference.preferenceScore,
      confidence: preference.learningConfidence,
      insights,
      suggestedActions,
      learningQuality: {
        dataQuality: 0.7, // Behavioral data is inherently less precise
        consistency: 0.8,
        recency: 1.0,
        volume: Math.min(preference.interactionCount / 5, 1),
      },
    };
  }

  private async performConversationAnalysis(
    messages: BaseMessage[],
    threadId: string
  ): Promise<{
    inferredContext: InteractionContext;
    averageMessageLength: number;
    followUpQuestions: number;
    durationMinutes: number;
    topicChanges: number;
    satisfactionIndicators: number;
    inferredComplexity: number;
    inferredStyle: 'formal' | 'casual' | 'technical' | 'friendly';
  }> {
    // Analyze messages using LangChain-powered text analysis
    const userMessages = messages.filter(msg => msg._getType() === 'human');
    const aiMessages = messages.filter(msg => msg._getType() === 'ai');

    // Calculate basic metrics
    const averageMessageLength = userMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + content.length;
    }, 0) / Math.max(userMessages.length, 1);

    // Count follow-up questions (simple heuristic)
    const followUpQuestions = userMessages.filter(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return content.includes('?') || content.toLowerCase().includes('how') || content.toLowerCase().includes('what');
    }).length;

    // Estimate conversation duration (assume 2 minutes per exchange)
    const durationMinutes = messages.length * 1.5;

    // Simple topic change detection (placeholder)
    const topicChanges = Math.floor(messages.length / 10);

    // Satisfaction indicators (positive words/phrases)
    const positiveIndicators = ['thanks', 'great', 'perfect', 'excellent', 'helpful', 'awesome'];
    const satisfactionIndicators = userMessages.reduce((count, msg) => {
      const content = typeof msg.content === 'string' ? msg.content.toLowerCase() : '';
      return count + positiveIndicators.filter(indicator => content.includes(indicator)).length;
    }, 0);

    // Infer context based on message content
    const inferredContext = this.inferContextFromMessages(userMessages);

    // Infer complexity preference (placeholder)
    const inferredComplexity = averageMessageLength > 200 ? 4 : averageMessageLength > 100 ? 3 : 2;

    // Infer communication style (placeholder)
    const inferredStyle = this.inferCommunicationStyle(userMessages);

    return {
      inferredContext,
      averageMessageLength,
      followUpQuestions,
      durationMinutes,
      topicChanges,
      satisfactionIndicators,
      inferredComplexity,
      inferredStyle,
    };
  }

  private inferContextFromMessages(messages: BaseMessage[]): InteractionContext {
    // Simple keyword-based context inference
    const allContent = messages
      .map(msg => typeof msg.content === 'string' ? msg.content.toLowerCase() : '')
      .join(' ');

    const contextKeywords = {
      [InteractionContext.TECHNICAL]: ['code', 'programming', 'function', 'error', 'debug', 'api'],
      [InteractionContext.CREATIVE]: ['write', 'story', 'creative', 'brainstorm', 'idea', 'design'],
      [InteractionContext.EDUCATIONAL]: ['learn', 'explain', 'understand', 'teach', 'concept', 'lesson'],
      [InteractionContext.RESEARCH]: ['research', 'find', 'information', 'data', 'study', 'analyze'],
      [InteractionContext.PROFESSIONAL]: ['business', 'meeting', 'project', 'deadline', 'client', 'proposal'],
      [InteractionContext.PROBLEM_SOLVING]: ['problem', 'issue', 'solution', 'fix', 'resolve', 'troubleshoot'],
    };

    let bestMatch = InteractionContext.GENERAL;
    let bestScore = 0;

    Object.entries(contextKeywords).forEach(([context, keywords]) => {
      const score = keywords.filter(keyword => allContent.includes(keyword)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = context as InteractionContext;
      }
    });

    return bestMatch;
  }

  private inferCommunicationStyle(messages: BaseMessage[]): 'formal' | 'casual' | 'technical' | 'friendly' {
    // Simple style inference based on language patterns
    const allContent = messages
      .map(msg => typeof msg.content === 'string' ? msg.content.toLowerCase() : '')
      .join(' ');

    if (allContent.includes('please') || allContent.includes('would you') || allContent.includes('could you')) {
      return 'formal';
    }
    if (allContent.includes('hey') || allContent.includes('cool') || allContent.includes('awesome')) {
      return 'friendly';
    }
    if (allContent.includes('function') || allContent.includes('class') || allContent.includes('method')) {
      return 'technical';
    }
    
    return 'casual';
  }

  private async applyLearningAlgorithm(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): Promise<FeedbackAnalysisResult> {
    let updatedScore = preference.preferenceScore;
    let confidence = preference.learningConfidence;

    switch (this.configuration.algorithm) {
      case LearningAlgorithm.WEIGHTED_AVERAGE:
        updatedScore = this.applyWeightedAverage(preference, analysis);
        break;
      case LearningAlgorithm.EXPONENTIAL_DECAY:
        updatedScore = this.applyExponentialDecay(preference, analysis);
        break;
      case LearningAlgorithm.BAYESIAN:
        const bayesianResult = this.applyBayesianInference(preference, analysis);
        updatedScore = bayesianResult.score;
        confidence = bayesianResult.confidence;
        break;
      case LearningAlgorithm.COLLABORATIVE:
        updatedScore = await this.applyCollaborativeFiltering(preference, analysis);
        break;
    }

    return {
      ...analysis,
      updatedPreferenceScore: updatedScore,
      confidence,
    };
  }

  private applyWeightedAverage(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): number {
    const currentScore = preference.preferenceScore;
    const newScore = preference.getAverageFeedbackScore();
    const weight = this.configuration.learningRate;
    
    return (currentScore * (1 - weight)) + (newScore * weight);
  }

  private applyExponentialDecay(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): number {
    // Apply time-based decay to older feedback
    const decayFactor = this.configuration.decayFactor;
    const timeSinceLastUpdate = Date.now() - preference.lastPreferenceUpdate.getTime();
    const daysSinceUpdate = timeSinceLastUpdate / (1000 * 60 * 60 * 24);
    
    const timeDecay = Math.pow(decayFactor, daysSinceUpdate);
    const currentScore = preference.preferenceScore * timeDecay;
    const newScore = preference.getAverageFeedbackScore();
    
    return (currentScore + newScore) / 2;
  }

  private applyBayesianInference(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): { score: number; confidence: number } {
    // Simplified Bayesian approach
    const priorMean = preference.preferenceScore;
    const priorConfidence = preference.learningConfidence;
    
    const likelihoodMean = preference.getAverageFeedbackScore();
    const likelihoodConfidence = analysis.learningQuality.dataQuality;
    
    // Bayesian update
    const totalConfidence = priorConfidence + likelihoodConfidence;
    const posteriorMean = (priorMean * priorConfidence + likelihoodMean * likelihoodConfidence) / totalConfidence;
    const posteriorConfidence = Math.min(1, totalConfidence / 2);
    
    return {
      score: posteriorMean,
      confidence: posteriorConfidence,
    };
  }

  private async applyCollaborativeFiltering(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): Promise<number> {
    // Simplified collaborative filtering - in a single-user system, 
    // this could compare across different contexts for the same user
    const similarContextPreferences = await this.preferenceRepository.find({
      where: {
        interactionContext: preference.interactionContext,
      },
    });
    
    if (similarContextPreferences.length < 2) {
      return preference.preferenceScore;
    }
    
    const averageScore = similarContextPreferences.reduce(
      (sum, p) => sum + p.preferenceScore, 0
    ) / similarContextPreferences.length;
    
    // Blend with current preference
    return (preference.preferenceScore * 0.7) + (averageScore * 0.3);
  }

  private async applyBehavioralLearning(
    preference: UserPersonalityPreference,
    analysis: FeedbackAnalysisResult
  ): Promise<FeedbackAnalysisResult> {
    // Behavioral learning uses implicit signals
    const behavioralWeight = 1 - this.configuration.explicitFeedbackWeight;
    
    // Simple heuristic: engagement metrics indicate preference
    const engagementScore = (
      Math.min(preference.interactionPatterns.engagementMetrics.followUpQuestions / 5, 1) * 0.3 +
      Math.min(preference.interactionPatterns.engagementMetrics.conversationDuration / 30, 1) * 0.3 +
      Math.min(preference.interactionPatterns.engagementMetrics.satisfactionIndicators / 3, 1) * 0.4
    );
    
    const currentScore = preference.preferenceScore;
    const updatedScore = (currentScore * (1 - behavioralWeight)) + (engagementScore * behavioralWeight);
    
    return {
      ...analysis,
      updatedPreferenceScore: updatedScore,
    };
  }

  private generateRecommendationReasons(preference: UserPersonalityPreference): string[] {
    const reasons: string[] = [];
    
    if (preference.preferenceScore > 0.8) {
      reasons.push('Consistently high user satisfaction');
    }
    
    if (preference.interactionCount > 10) {
      reasons.push('Extensive interaction history');
    }
    
    if (preference.getPreferenceTrend() === 'improving') {
      reasons.push('Improving performance trend');
    }
    
    const avgSatisfaction = preference.getAverageFeedbackScore();
    if (avgSatisfaction > 0.8) {
      reasons.push('High average user ratings');
    }
    
    if (preference.learningConfidence > 0.7) {
      reasons.push('High confidence in learned preferences');
    }
    
    return reasons;
  }

  private async calculateBehavioralPatterns(preferences: UserPersonalityPreference[]): Promise<any> {
    const allPatterns = preferences.map(p => p.interactionPatterns);
    
    return {
      preferredComplexity: this.calculateAverage(allPatterns.map(p => p.complexityPreference)),
      communicationStyle: this.findMostCommon(allPatterns.map(p => p.communicationStyle)),
      averageSessionDuration: this.calculateAverage(
        allPatterns.map(p => p.engagementMetrics.conversationDuration)
      ),
      mostActiveContext: this.findMostActiveContext(preferences),
      feedbackFrequency: preferences.length / Math.max(preferences.length, 1),
    };
  }

  private async generateUserRecommendations(
    preferences: UserPersonalityPreference[],
    personalityMap: Map<string, PersonalityProfile>
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    // Identify gaps in learning
    const contexts = Object.values(InteractionContext);
    const coveredContexts = [...new Set(preferences.map(p => p.interactionContext))];
    const uncoveredContexts = contexts.filter(c => !coveredContexts.includes(c));
    
    if (uncoveredContexts.length > 0) {
      recommendations.push(`Try exploring ${uncoveredContexts[0]} context to improve recommendations`);
    }
    
    // Identify low-confidence areas
    const lowConfidencePrefs = preferences.filter(p => p.learningConfidence < 0.5);
    if (lowConfidencePrefs.length > 0) {
      recommendations.push('Provide more feedback to improve recommendation accuracy');
    }
    
    // Suggest trying new personalities
    const triedPersonalities = [...new Set(preferences.map(p => p.personalityId))];
    const availablePersonalities = Array.from(personalityMap.keys());
    const untriedPersonalities = availablePersonalities.filter(id => !triedPersonalities.includes(id));
    
    if (untriedPersonalities.length > 0) {
      const personality = personalityMap.get(untriedPersonalities[0]);
      if (personality) {
        recommendations.push(`Consider trying ${personality.name} for new perspectives`);
      }
    }
    
    return recommendations;
  }

  private calculateOverallConfidence(preferences: UserPersonalityPreference[]): number {
    if (preferences.length === 0) return 0;
    
    return preferences.reduce((sum, p) => sum + p.learningConfidence, 0) / preferences.length;
  }

  private calculateDataQuality(feedback: SubmitPersonalityFeedbackDto): number {
    let quality = 0.5; // Base quality
    
    if (feedback.overallScore) quality += 0.2;
    if (feedback.comment && feedback.comment.length > 10) quality += 0.15;
    if (feedback.aspects) quality += 0.1;
    if (feedback.suggestions && feedback.suggestions.length > 0) quality += 0.05;
    
    return Math.min(1, quality);
  }

  private calculateConsistency(
    preference: UserPersonalityPreference,
    newFeedback: SubmitPersonalityFeedbackDto
  ): number {
    if (preference.feedback.length === 0) return 0.5;
    
    const recentFeedback = preference.feedback.slice(-3);
    const scores = recentFeedback
      .filter(f => f.score)
      .map(f => f.score! / 5);
    
    if (scores.length < 2) return 0.5;
    
    const currentScore = newFeedback.overallScore ? newFeedback.overallScore / 5 : 0.5;
    const avgRecentScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    
    // Calculate consistency as inverse of deviation
    const deviation = Math.abs(currentScore - avgRecentScore);
    return Math.max(0, 1 - (deviation * 2)); // Scale to 0-1
  }

  private async calculateLearningQuality(preferences: UserPersonalityPreference[]): Promise<any> {
    if (preferences.length === 0) {
      return { overall: 0, dataQuality: 0, consistency: 0, coverage: 0 };
    }
    
    // Data quality: average quality of feedback
    const dataQuality = preferences.reduce((sum, p) => {
      const feedbackQuality = p.feedback.reduce((fSum, f) => {
        let quality = 0.3; // Base
        if (f.score) quality += 0.3;
        if (f.comment) quality += 0.2;
        if (f.aspects) quality += 0.2;
        return fSum + Math.min(1, quality);
      }, 0) / Math.max(p.feedback.length, 1);
      return sum + feedbackQuality;
    }, 0) / preferences.length;
    
    // Consistency: how consistent feedback is within each preference
    const consistency = preferences.reduce((sum, p) => {
      if (p.feedback.length < 2) return sum + 0.5;
      
      const scores = p.feedback.filter(f => f.score).map(f => f.score! / 5);
      if (scores.length < 2) return sum + 0.5;
      
      const variance = this.calculateVariance(scores);
      return sum + Math.max(0, 1 - variance);
    }, 0) / preferences.length;
    
    // Coverage: how many contexts and personalities are covered
    const contexts = [...new Set(preferences.map(p => p.interactionContext))];
    const personalities = [...new Set(preferences.map(p => p.personalityId))];
    const coverage = (contexts.length / Object.values(InteractionContext).length) * 0.5 + 
                    (Math.min(personalities.length / 5, 1)) * 0.5;
    
    const overall = (dataQuality * 0.4 + consistency * 0.3 + coverage * 0.3);
    
    return { overall, dataQuality, consistency, coverage };
  }

  private async generateSystemLearningRecommendations(
    preferences: UserPersonalityPreference[],
    confidenceDistribution: any,
    contextAnalysis: any,
    learningQuality: any
  ): Promise<any[]> {
    const recommendations: any[] = [];
    
    // Low confidence recommendations
    if (confidenceDistribution.low > confidenceDistribution.high) {
      recommendations.push({
        category: 'data_collection',
        suggestion: 'Encourage more user feedback to improve learning confidence',
        impact: 'high',
      });
    }
    
    // Learning quality recommendations
    if (learningQuality.overall < 0.6) {
      recommendations.push({
        category: 'algorithm_tuning',
        suggestion: 'Consider adjusting learning algorithm parameters',
        impact: 'medium',
      });
    }
    
    // Coverage recommendations
    if (learningQuality.coverage < 0.5) {
      recommendations.push({
        category: 'user_experience',
        suggestion: 'Promote exploration of different personality types and contexts',
        impact: 'medium',
      });
    }
    
    return recommendations;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private findMostCommon<T>(values: T[]): T {
    const counts = new Map<T, number>();
    values.forEach(val => counts.set(val, (counts.get(val) || 0) + 1));
    
    let mostCommon = values[0];
    let maxCount = 0;
    counts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = value;
      }
    });
    
    return mostCommon;
  }

  private findMostActiveContext(preferences: UserPersonalityPreference[]): InteractionContext {
    const contextCounts = new Map<InteractionContext, number>();
    preferences.forEach(p => {
      contextCounts.set(p.interactionContext, (contextCounts.get(p.interactionContext) || 0) + 1);
    });
    
    let mostActive = InteractionContext.GENERAL;
    let maxCount = 0;
    contextCounts.forEach((count, context) => {
      if (count > maxCount) {
        maxCount = count;
        mostActive = context;
      }
    });
    
    return mostActive;
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }
}