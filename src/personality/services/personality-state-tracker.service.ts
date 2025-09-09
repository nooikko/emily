import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseMessage } from '@langchain/core/messages';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { PersonalityProfileService } from './personality-profile.service';
import type { PersonalityProfile } from '../entities/personality-profile.entity';
import type { ConversationContext } from '../../threads/services/conversation-state.service';

/**
 * Personality state snapshot
 */
export interface PersonalityStateSnapshot {
  /** Unique snapshot ID */
  snapshotId: string;
  /** Thread ID this snapshot belongs to */
  threadId: string;
  /** Timestamp of snapshot */
  timestamp: Date;
  /** Active personality at this point */
  activePersonality: {
    id: string;
    name: string;
    category: string;
    version: number;
  };
  /** Dynamic trait adjustments made during conversation */
  traitAdjustments: Array<{
    traitName: string;
    originalValue: string;
    adjustedValue: string;
    adjustmentReason: string;
    confidence: number;
  }>;
  /** Conversation context at this snapshot */
  conversationContext: {
    messageCount: number;
    conversationDuration: number;
    lastMessageTimestamp: Date;
    topicalFocus: string[];
    userEngagement: 'low' | 'medium' | 'high';
    complexityLevel: 'low' | 'medium' | 'high' | 'expert';
  };
  /** Performance metrics for the personality at this point */
  performanceMetrics: {
    userSatisfactionIndicators: number; // 0-1 score
    conversationFlowScore: number; // 0-1 score
    contextAlignmentScore: number; // 0-1 score
    responseQualityScore: number; // 0-1 score
  };
  /** State metadata */
  metadata: {
    snapshotReason: 'scheduled' | 'personality_switch' | 'significant_change' | 'manual';
    previousSnapshotId?: string;
    nextSnapshotId?: string;
    contextFactors: string[];
    stateVersion: string;
  };
}

/**
 * Personality consistency analysis
 */
export interface PersonalityConsistencyAnalysis {
  /** Thread ID being analyzed */
  threadId: string;
  /** Analysis period */
  analysisPeriod: {
    startTime: Date;
    endTime: Date;
    messageCount: number;
  };
  /** Consistency metrics */
  consistencyMetrics: {
    /** Overall personality consistency score (0-1) */
    overallConsistency: number;
    /** Trait consistency scores */
    traitConsistency: Record<string, number>;
    /** Behavioral consistency score */
    behavioralConsistency: number;
    /** Response pattern consistency */
    responsePatternConsistency: number;
  };
  /** Identified inconsistencies */
  inconsistencies: Array<{
    type: 'trait_deviation' | 'behavioral_shift' | 'tone_mismatch' | 'context_disconnect';
    severity: 'low' | 'medium' | 'high';
    description: string;
    affectedMessages: number[];
    suggestedCorrection: string;
  }>;
  /** Improvement recommendations */
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: 'trait_adjustment' | 'context_alignment' | 'behavioral_tuning' | 'transition_improvement';
    description: string;
    expectedImprovement: number;
  }>;
  /** Analysis metadata */
  metadata: {
    analyzedAt: Date;
    analysisVersion: string;
    confidenceLevel: number;
    dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

/**
 * Personality state evolution tracking
 */
export interface PersonalityEvolutionTracking {
  /** Thread ID */
  threadId: string;
  /** Evolution timeline */
  evolutionTimeline: Array<{
    timestamp: Date;
    changeType: 'personality_switch' | 'trait_adjustment' | 'contextual_adaptation' | 'performance_optimization';
    changeDescription: string;
    previousState: string;
    newState: string;
    triggeringFactor: string;
    impactAssessment: {
      userExperienceImpact: number;
      conversationQualityImpact: number;
      consistencyImpact: number;
    };
  }>;
  /** Evolution trends */
  trends: {
    /** Frequency of personality switches */
    switchingFrequency: number;
    /** Most common switching triggers */
    commonTriggers: Array<{ trigger: string; frequency: number }>;
    /** Performance trajectory over time */
    performanceTrajectory: 'improving' | 'stable' | 'declining' | 'volatile';
    /** Consistency trends */
    consistencyTrend: 'improving' | 'stable' | 'declining';
  };
  /** Learning insights */
  learningInsights: {
    /** User preferences learned over time */
    userPreferenceLearning: Record<string, any>;
    /** Effective personality combinations */
    effectivePersonalities: string[];
    /** Context-personality mappings discovered */
    contextMappings: Record<string, string>;
  };
  /** Predictive indicators */
  predictiveIndicators: {
    /** Predicted optimal personality for current context */
    predictedOptimalPersonality: string;
    /** Confidence in prediction */
    predictionConfidence: number;
    /** Expected switching points */
    expectedSwitchingPoints: number[];
  };
}

/**
 * LangChain-based Personality State Tracker
 * 
 * Advanced service for tracking personality state and consistency across
 * conversation sessions with learning and optimization capabilities.
 * 
 * Key capabilities:
 * - Real-time state tracking and snapshots
 * - Consistency analysis and monitoring
 * - Evolution tracking and learning
 * - Performance optimization suggestions
 * - Predictive personality recommendations
 * - Cross-session state persistence
 */
@Injectable()
export class PersonalityStateTrackerService extends LangChainBaseService {
  private readonly stateSnapshots = new Map<string, PersonalityStateSnapshot[]>();
  private readonly consistencyCache = new Map<string, PersonalityConsistencyAnalysis>();
  private readonly evolutionTracking = new Map<string, PersonalityEvolutionTracking>();
  private readonly performanceMetrics = new Map<string, any>();
  
  constructor(
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
    private readonly personalityService: PersonalityProfileService,
  ) {
    super('PersonalityStateTrackerService');
  }

  /**
   * Create personality state snapshot
   */
  async createStateSnapshot(
    threadId: string,
    activePersonalityId: string,
    messages: BaseMessage[],
    conversationContext?: ConversationContext,
    snapshotReason: PersonalityStateSnapshot['metadata']['snapshotReason'] = 'scheduled'
  ): Promise<PersonalityStateSnapshot> {
    this.logExecution('createStateSnapshot', {
      threadId,
      activePersonality: activePersonalityId,
      messageCount: messages.length,
      reason: snapshotReason
    });

    try {
      const activePersonality = await this.personalityService.findOne(activePersonalityId);
      
      // Calculate conversation metrics
      const conversationMetrics = await this.createTracedRunnable(
        'calculateConversationMetrics',
        () => this.calculateConversationMetrics(messages, conversationContext)
      ).invoke({});

      // Calculate performance metrics
      const performanceMetrics = await this.createTracedRunnable(
        'calculatePerformanceMetrics',
        () => this.calculatePerformanceMetrics(
          threadId,
          activePersonalityId,
          messages,
          conversationContext
        )
      ).invoke({});

      // Get dynamic trait adjustments
      const traitAdjustments = await this.createTracedRunnable(
        'getTraitAdjustments',
        () => this.getDynamicTraitAdjustments(threadId, activePersonalityId)
      ).invoke({});

      // Create snapshot
      const snapshot: PersonalityStateSnapshot = {
        snapshotId: this.generateSnapshotId(threadId),
        threadId,
        timestamp: new Date(),
        activePersonality: {
          id: activePersonality.id,
          name: activePersonality.name,
          category: activePersonality.category,
          version: activePersonality.version
        },
        traitAdjustments,
        conversationContext: conversationMetrics,
        performanceMetrics,
        metadata: {
          snapshotReason,
          contextFactors: this.extractContextFactors(conversationContext),
          stateVersion: '1.0.0'
        }
      };

      // Store snapshot
      this.storeSnapshot(threadId, snapshot);

      // Update evolution tracking
      await this.updateEvolutionTracking(threadId, snapshot);

      this.logger.debug('Personality state snapshot created', {
        snapshotId: snapshot.snapshotId,
        threadId,
        activePersonality: activePersonality.name,
        performanceScore: performanceMetrics.contextAlignmentScore
      });

      return snapshot;
    } catch (error) {
      this.logger.error('Failed to create state snapshot', error);
      throw new Error(`State snapshot creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Track personality state changes
   */
  async trackStateChange(
    threadId: string,
    changeType: PersonalityEvolutionTracking['evolutionTimeline'][0]['changeType'],
    changeDescription: string,
    previousPersonalityId: string,
    newPersonalityId: string,
    triggeringFactor: string,
    impactAssessment?: PersonalityEvolutionTracking['evolutionTimeline'][0]['impactAssessment']
  ): Promise<void> {
    this.logExecution('trackStateChange', {
      threadId,
      changeType,
      from: previousPersonalityId,
      to: newPersonalityId,
      trigger: triggeringFactor
    });

    try {
      // Get or initialize evolution tracking
      let evolution = this.evolutionTracking.get(threadId);
      if (!evolution) {
        evolution = await this.initializeEvolutionTracking(threadId);
        this.evolutionTracking.set(threadId, evolution);
      }

      // Add evolution entry
      const changeEntry = {
        timestamp: new Date(),
        changeType,
        changeDescription,
        previousState: previousPersonalityId,
        newState: newPersonalityId,
        triggeringFactor,
        impactAssessment: impactAssessment || {
          userExperienceImpact: 0.5,
          conversationQualityImpact: 0.5,
          consistencyImpact: 0.5
        }
      };

      evolution.evolutionTimeline.push(changeEntry);

      // Update trends
      await this.updateEvolutionTrends(evolution);

      // Update learning insights
      await this.updateLearningInsights(evolution, changeEntry);

      this.logger.debug('State change tracked', {
        threadId,
        changeType,
        timelineLength: evolution.evolutionTimeline.length
      });
    } catch (error) {
      this.logger.error('Failed to track state change', error);
    }
  }

  /**
   * Analyze personality consistency for a conversation
   */
  async analyzePersonalityConsistency(
    threadId: string,
    timeWindow?: { startTime: Date; endTime: Date }
  ): Promise<PersonalityConsistencyAnalysis> {
    this.logExecution('analyzePersonalityConsistency', {
      threadId,
      hasTimeWindow: !!timeWindow
    });

    try {
      // Check cache first
      const cacheKey = `${threadId}_${timeWindow?.startTime.getTime()}_${timeWindow?.endTime.getTime()}`;
      const cached = this.consistencyCache.get(cacheKey);
      if (cached && this.isCacheValid(cached.metadata.analyzedAt)) {
        return cached;
      }

      // Get snapshots for analysis
      const snapshots = this.getSnapshotsInTimeWindow(threadId, timeWindow);
      if (snapshots.length < 2) {
        return this.createMinimalConsistencyAnalysis(threadId, timeWindow);
      }

      // Calculate consistency metrics
      const consistencyMetrics = await this.createTracedRunnable(
        'calculateConsistencyMetrics',
        () => this.calculateConsistencyMetrics(snapshots)
      ).invoke({});

      // Identify inconsistencies
      const inconsistencies = await this.createTracedRunnable(
        'identifyInconsistencies',
        () => this.identifyInconsistencies(snapshots)
      ).invoke({});

      // Generate recommendations
      const recommendations = await this.createTracedRunnable(
        'generateConsistencyRecommendations',
        () => this.generateConsistencyRecommendations(consistencyMetrics, inconsistencies)
      ).invoke({});

      const analysis: PersonalityConsistencyAnalysis = {
        threadId,
        analysisPeriod: {
          startTime: timeWindow?.startTime || snapshots[0].timestamp,
          endTime: timeWindow?.endTime || snapshots[snapshots.length - 1].timestamp,
          messageCount: snapshots[snapshots.length - 1]?.conversationContext.messageCount || 0
        },
        consistencyMetrics,
        inconsistencies,
        recommendations,
        metadata: {
          analyzedAt: new Date(),
          analysisVersion: '1.0.0',
          confidenceLevel: this.calculateAnalysisConfidence(snapshots),
          dataQuality: this.assessDataQuality(snapshots)
        }
      };

      // Cache the analysis
      this.consistencyCache.set(cacheKey, analysis);

      this.logger.debug('Personality consistency analyzed', {
        threadId,
        overallConsistency: analysis.consistencyMetrics.overallConsistency,
        inconsistenciesFound: analysis.inconsistencies.length,
        confidence: analysis.metadata.confidenceLevel
      });

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze personality consistency', error);
      return this.createErrorConsistencyAnalysis(threadId, timeWindow, error);
    }
  }

  /**
   * Get personality evolution tracking for a conversation
   */
  async getEvolutionTracking(threadId: string): Promise<PersonalityEvolutionTracking> {
    this.logExecution('getEvolutionTracking', { threadId });

    let evolution = this.evolutionTracking.get(threadId);
    if (!evolution) {
      evolution = await this.initializeEvolutionTracking(threadId);
      this.evolutionTracking.set(threadId, evolution);
    }

    // Update predictive indicators
    await this.updatePredictiveIndicators(evolution);

    return evolution;
  }

  /**
   * Get current personality state for a thread
   */
  async getCurrentPersonalityState(threadId: string): Promise<PersonalityStateSnapshot | null> {
    const snapshots = this.stateSnapshots.get(threadId);
    if (!snapshots || snapshots.length === 0) {
      return null;
    }

    return snapshots[snapshots.length - 1];
  }

  /**
   * Get personality state history for a thread
   */
  getPersonalityStateHistory(
    threadId: string,
    limit?: number,
    timeWindow?: { startTime: Date; endTime: Date }
  ): PersonalityStateSnapshot[] {
    const snapshots = this.getSnapshotsInTimeWindow(threadId, timeWindow);
    
    if (limit) {
      return snapshots.slice(-limit);
    }
    
    return snapshots;
  }

  /**
   * Predict optimal personality for current context
   */
  async predictOptimalPersonality(
    threadId: string,
    currentMessages: BaseMessage[],
    conversationContext?: ConversationContext
  ): Promise<{
    predictedPersonalityId: string;
    confidence: number;
    reasoning: string[];
    alternativeOptions: Array<{
      personalityId: string;
      confidence: number;
      reasoning: string;
    }>;
  }> {
    this.logExecution('predictOptimalPersonality', {
      threadId,
      messageCount: currentMessages.length
    });

    try {
      // Get evolution tracking for learning insights
      const evolution = await this.getEvolutionTracking(threadId);
      
      // Analyze current context
      const contextAnalysis = await this.analyzeCurrentContext(currentMessages, conversationContext);
      
      // Apply learned patterns
      const prediction = this.applyLearnedPatterns(evolution, contextAnalysis);
      
      // Generate alternative options
      const alternatives = await this.generateAlternativePersonalities(contextAnalysis, evolution);

      this.logger.debug('Personality prediction completed', {
        threadId,
        predictedPersonality: prediction.personalityId,
        confidence: prediction.confidence,
        alternativesCount: alternatives.length
      });

      return {
        predictedPersonalityId: prediction.personalityId,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        alternativeOptions: alternatives
      };
    } catch (error) {
      this.logger.error('Failed to predict optimal personality', error);
      
      // Return safe default
      const availablePersonalities = await this.personalityService.findAll();
      const defaultPersonality = availablePersonalities.find(p => p.isActive) || availablePersonalities[0];
      
      return {
        predictedPersonalityId: defaultPersonality.id,
        confidence: 0.3,
        reasoning: ['Using default personality due to prediction error'],
        alternativeOptions: []
      };
    }
  }

  /**
   * Clear state tracking data for a thread
   */
  clearThreadState(threadId: string): void {
    this.stateSnapshots.delete(threadId);
    this.evolutionTracking.delete(threadId);
    this.performanceMetrics.delete(threadId);
    
    // Clear related cache entries
    for (const [key] of this.consistencyCache.entries()) {
      if (key.startsWith(threadId)) {
        this.consistencyCache.delete(key);
      }
    }

    this.logger.debug('Thread state cleared', { threadId });
  }

  // Private helper methods

  /**
   * Calculate conversation metrics from messages
   */
  private async calculateConversationMetrics(
    messages: BaseMessage[],
    conversationContext?: ConversationContext
  ): Promise<PersonalityStateSnapshot['conversationContext']> {
    const now = new Date();
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    
    const duration = firstMessage && lastMessage ? 
      now.getTime() - (firstMessage.additional_kwargs?.timestamp as Date || now).getTime() : 0;

    // Simple topic extraction (would be more sophisticated in production)
    const topicalFocus = await this.extractTopicalFocus(messages);
    
    // User engagement assessment
    const userEngagement = this.assessUserEngagement(messages);
    
    // Complexity level assessment
    const complexityLevel = this.assessConversationComplexity(messages);

    return {
      messageCount: messages.length,
      conversationDuration: duration,
      lastMessageTimestamp: lastMessage?.additional_kwargs?.timestamp as Date || now,
      topicalFocus,
      userEngagement,
      complexityLevel
    };
  }

  /**
   * Calculate performance metrics
   */
  private async calculatePerformanceMetrics(
    threadId: string,
    personalityId: string,
    messages: BaseMessage[],
    conversationContext?: ConversationContext
  ): Promise<PersonalityStateSnapshot['performanceMetrics']> {
    // Simplified performance calculation
    // In production, this would use more sophisticated metrics
    
    const userSatisfactionIndicators = this.calculateUserSatisfaction(messages);
    const conversationFlowScore = this.calculateConversationFlow(messages);
    const contextAlignmentScore = this.calculateContextAlignment(personalityId, conversationContext);
    const responseQualityScore = this.calculateResponseQuality(messages);

    return {
      userSatisfactionIndicators,
      conversationFlowScore,
      contextAlignmentScore,
      responseQualityScore
    };
  }

  /**
   * Get dynamic trait adjustments
   */
  private async getDynamicTraitAdjustments(
    threadId: string,
    personalityId: string
  ): Promise<PersonalityStateSnapshot['traitAdjustments']> {
    // This would track any dynamic adjustments made during conversation
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Extract context factors
   */
  private extractContextFactors(conversationContext?: ConversationContext): string[] {
    const factors: string[] = [];
    
    if (conversationContext?.conversation?.topic) {
      factors.push(`topic:${conversationContext.conversation.topic}`);
    }
    
    if (conversationContext?.conversation?.priority) {
      factors.push(`priority:${conversationContext.conversation.priority}`);
    }
    
    if (conversationContext?.modelConfig?.temperature) {
      factors.push(`temperature:${conversationContext.modelConfig.temperature}`);
    }

    return factors;
  }

  /**
   * Generate unique snapshot ID
   */
  private generateSnapshotId(threadId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${threadId}_${timestamp}_${random}`;
  }

  /**
   * Store snapshot in memory
   */
  private storeSnapshot(threadId: string, snapshot: PersonalityStateSnapshot): void {
    if (!this.stateSnapshots.has(threadId)) {
      this.stateSnapshots.set(threadId, []);
    }
    
    const snapshots = this.stateSnapshots.get(threadId)!;
    
    // Link to previous snapshot
    if (snapshots.length > 0) {
      const previousSnapshot = snapshots[snapshots.length - 1];
      snapshot.metadata.previousSnapshotId = previousSnapshot.snapshotId;
      previousSnapshot.metadata.nextSnapshotId = snapshot.snapshotId;
    }
    
    snapshots.push(snapshot);
    
    // Limit to last 50 snapshots per thread
    if (snapshots.length > 50) {
      snapshots.shift();
    }
  }

  /**
   * Initialize evolution tracking for a thread
   */
  private async initializeEvolutionTracking(threadId: string): Promise<PersonalityEvolutionTracking> {
    return {
      threadId,
      evolutionTimeline: [],
      trends: {
        switchingFrequency: 0,
        commonTriggers: [],
        performanceTrajectory: 'stable',
        consistencyTrend: 'stable'
      },
      learningInsights: {
        userPreferenceLearning: {},
        effectivePersonalities: [],
        contextMappings: {}
      },
      predictiveIndicators: {
        predictedOptimalPersonality: '',
        predictionConfidence: 0,
        expectedSwitchingPoints: []
      }
    };
  }

  /**
   * Update evolution tracking with new snapshot
   */
  private async updateEvolutionTracking(
    threadId: string,
    snapshot: PersonalityStateSnapshot
  ): Promise<void> {
    let evolution = this.evolutionTracking.get(threadId);
    if (!evolution) {
      evolution = await this.initializeEvolutionTracking(threadId);
      this.evolutionTracking.set(threadId, evolution);
    }

    // Update trends based on new data
    await this.updateEvolutionTrends(evolution);
    
    // Update learning insights
    await this.updateSnapshotBasedInsights(evolution, snapshot);
  }

  /**
   * Update evolution trends
   */
  private async updateEvolutionTrends(evolution: PersonalityEvolutionTracking): Promise<void> {
    const timeline = evolution.evolutionTimeline;
    
    // Calculate switching frequency (switches per hour)
    if (timeline.length > 1) {
      const timespan = timeline[timeline.length - 1].timestamp.getTime() - timeline[0].timestamp.getTime();
      const switches = timeline.filter(entry => entry.changeType === 'personality_switch').length;
      evolution.trends.switchingFrequency = switches / (timespan / (1000 * 60 * 60));
    }

    // Update common triggers
    const triggerCounts = new Map<string, number>();
    timeline.forEach(entry => {
      const count = triggerCounts.get(entry.triggeringFactor) || 0;
      triggerCounts.set(entry.triggeringFactor, count + 1);
    });
    
    evolution.trends.commonTriggers = Array.from(triggerCounts.entries())
      .map(([trigger, frequency]) => ({ trigger, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // Update performance trajectory (simplified)
    const recentEntries = timeline.slice(-5);
    if (recentEntries.length >= 3) {
      const avgImpact = recentEntries.reduce((sum, entry) => 
        sum + entry.impactAssessment.conversationQualityImpact, 0) / recentEntries.length;
      
      if (avgImpact > 0.7) evolution.trends.performanceTrajectory = 'improving';
      else if (avgImpact < 0.3) evolution.trends.performanceTrajectory = 'declining';
      else evolution.trends.performanceTrajectory = 'stable';
    }
  }

  /**
   * Update learning insights
   */
  private async updateLearningInsights(
    evolution: PersonalityEvolutionTracking,
    changeEntry: PersonalityEvolutionTracking['evolutionTimeline'][0]
  ): Promise<void> {
    // Track effective personalities
    if (changeEntry.impactAssessment.conversationQualityImpact > 0.7) {
      if (!evolution.learningInsights.effectivePersonalities.includes(changeEntry.newState)) {
        evolution.learningInsights.effectivePersonalities.push(changeEntry.newState);
      }
    }

    // Update context mappings
    const contextKey = changeEntry.triggeringFactor;
    if (changeEntry.impactAssessment.conversationQualityImpact > 0.6) {
      evolution.learningInsights.contextMappings[contextKey] = changeEntry.newState;
    }
  }

  /**
   * Update snapshot-based insights
   */
  private async updateSnapshotBasedInsights(
    evolution: PersonalityEvolutionTracking,
    snapshot: PersonalityStateSnapshot
  ): Promise<void> {
    // Extract user preferences from high-performing snapshots
    if (snapshot.performanceMetrics.userSatisfactionIndicators > 0.8) {
      const preferences = {
        preferredComplexity: snapshot.conversationContext.complexityLevel,
        preferredEngagement: snapshot.conversationContext.userEngagement,
        effectivePersonality: snapshot.activePersonality.id
      };
      
      Object.assign(evolution.learningInsights.userPreferenceLearning, preferences);
    }
  }

  /**
   * Update predictive indicators
   */
  private async updatePredictiveIndicators(evolution: PersonalityEvolutionTracking): Promise<void> {
    // Simple prediction based on learned patterns
    const effectivePersonalities = evolution.learningInsights.effectivePersonalities;
    if (effectivePersonalities.length > 0) {
      evolution.predictiveIndicators.predictedOptimalPersonality = effectivePersonalities[0];
      evolution.predictiveIndicators.predictionConfidence = 0.7;
    }

    // Predict switching points based on patterns (simplified)
    const avgSwitchingInterval = evolution.trends.switchingFrequency > 0 ? 
      1 / evolution.trends.switchingFrequency * 60 * 60 * 1000 : 0; // Convert to milliseconds
    
    if (avgSwitchingInterval > 0) {
      const now = Date.now();
      evolution.predictiveIndicators.expectedSwitchingPoints = [
        now + avgSwitchingInterval,
        now + avgSwitchingInterval * 2
      ];
    }
  }

  /**
   * Get snapshots within time window
   */
  private getSnapshotsInTimeWindow(
    threadId: string,
    timeWindow?: { startTime: Date; endTime: Date }
  ): PersonalityStateSnapshot[] {
    const snapshots = this.stateSnapshots.get(threadId) || [];
    
    if (!timeWindow) {
      return snapshots;
    }

    return snapshots.filter(snapshot => 
      snapshot.timestamp >= timeWindow.startTime && 
      snapshot.timestamp <= timeWindow.endTime
    );
  }

  /**
   * Calculate consistency metrics
   */
  private async calculateConsistencyMetrics(
    snapshots: PersonalityStateSnapshot[]
  ): Promise<PersonalityConsistencyAnalysis['consistencyMetrics']> {
    if (snapshots.length < 2) {
      return {
        overallConsistency: 1.0,
        traitConsistency: {},
        behavioralConsistency: 1.0,
        responsePatternConsistency: 1.0
      };
    }

    // Calculate overall consistency
    let consistencySum = 0;
    let comparisons = 0;

    for (let i = 1; i < snapshots.length; i++) {
      const current = snapshots[i];
      const previous = snapshots[i - 1];
      
      // Personality consistency
      const personalityConsistency = current.activePersonality.id === previous.activePersonality.id ? 1.0 : 0.0;
      
      // Performance consistency
      const performanceConsistency = 1 - Math.abs(
        current.performanceMetrics.contextAlignmentScore - 
        previous.performanceMetrics.contextAlignmentScore
      );
      
      consistencySum += (personalityConsistency + performanceConsistency) / 2;
      comparisons++;
    }

    const overallConsistency = comparisons > 0 ? consistencySum / comparisons : 1.0;

    // Calculate trait consistency (simplified)
    const traitConsistency: Record<string, number> = {};
    // This would analyze trait adjustments for consistency
    
    return {
      overallConsistency,
      traitConsistency,
      behavioralConsistency: overallConsistency, // Simplified
      responsePatternConsistency: overallConsistency // Simplified
    };
  }

  /**
   * Identify inconsistencies in personality behavior
   */
  private async identifyInconsistencies(
    snapshots: PersonalityStateSnapshot[]
  ): Promise<PersonalityConsistencyAnalysis['inconsistencies']> {
    const inconsistencies: PersonalityConsistencyAnalysis['inconsistencies'] = [];

    // Look for personality switches without clear justification
    for (let i = 1; i < snapshots.length; i++) {
      const current = snapshots[i];
      const previous = snapshots[i - 1];
      
      if (current.activePersonality.id !== previous.activePersonality.id) {
        if (current.metadata.snapshotReason !== 'personality_switch') {
          inconsistencies.push({
            type: 'behavioral_shift',
            severity: 'medium',
            description: 'Personality change without explicit switching reason',
            affectedMessages: [i - 1, i],
            suggestedCorrection: 'Add transition explanation for personality changes'
          });
        }
      }

      // Look for performance drops
      const performanceDrop = previous.performanceMetrics.contextAlignmentScore - 
                             current.performanceMetrics.contextAlignmentScore;
      
      if (performanceDrop > 0.3) {
        inconsistencies.push({
          type: 'context_disconnect',
          severity: 'high',
          description: 'Significant performance drop detected',
          affectedMessages: [i],
          suggestedCorrection: 'Review personality-context alignment'
        });
      }
    }

    return inconsistencies;
  }

  /**
   * Generate consistency improvement recommendations
   */
  private async generateConsistencyRecommendations(
    consistencyMetrics: PersonalityConsistencyAnalysis['consistencyMetrics'],
    inconsistencies: PersonalityConsistencyAnalysis['inconsistencies']
  ): Promise<PersonalityConsistencyAnalysis['recommendations']> {
    const recommendations: PersonalityConsistencyAnalysis['recommendations'] = [];

    if (consistencyMetrics.overallConsistency < 0.7) {
      recommendations.push({
        priority: 'high',
        category: 'behavioral_tuning',
        description: 'Improve overall personality consistency through better trait alignment',
        expectedImprovement: 0.3
      });
    }

    const highSeverityIssues = inconsistencies.filter(i => i.severity === 'high').length;
    if (highSeverityIssues > 0) {
      recommendations.push({
        priority: 'high',
        category: 'context_alignment',
        description: 'Address high-severity context alignment issues',
        expectedImprovement: 0.4
      });
    }

    if (inconsistencies.some(i => i.type === 'behavioral_shift')) {
      recommendations.push({
        priority: 'medium',
        category: 'transition_improvement',
        description: 'Implement smoother personality transitions',
        expectedImprovement: 0.2
      });
    }

    return recommendations;
  }

  /**
   * Helper methods for metrics calculation
   */
  private async extractTopicalFocus(messages: BaseMessage[]): Promise<string[]> {
    // Simplified topic extraction
    const recentMessages = messages.slice(-5);
    const text = recentMessages
      .map(msg => typeof msg.content === 'string' ? msg.content : '')
      .join(' ')
      .toLowerCase();

    const topics: string[] = [];
    if (text.includes('code') || text.includes('programming')) topics.push('technical');
    if (text.includes('creative') || text.includes('design')) topics.push('creative');
    if (text.includes('business') || text.includes('professional')) topics.push('business');
    
    return topics.length > 0 ? topics : ['general'];
  }

  private assessUserEngagement(messages: BaseMessage[]): 'low' | 'medium' | 'high' {
    const userMessages = messages.filter(msg => msg._getType() === 'human');
    const avgLength = userMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + content.length;
    }, 0) / Math.max(userMessages.length, 1);

    if (avgLength > 200) return 'high';
    if (avgLength > 50) return 'medium';
    return 'low';
  }

  private assessConversationComplexity(messages: BaseMessage[]): 'low' | 'medium' | 'high' | 'expert' {
    const text = messages
      .map(msg => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
      .join(' ')
      .toLowerCase();

    const technicalTerms = ['algorithm', 'implementation', 'architecture', 'framework'];
    const advancedTerms = ['optimization', 'scalability', 'methodology', 'paradigm'];
    
    const technicalCount = technicalTerms.filter(term => text.includes(term)).length;
    const advancedCount = advancedTerms.filter(term => text.includes(term)).length;

    if (advancedCount >= 2) return 'expert';
    if (technicalCount >= 3) return 'high';
    if (technicalCount >= 1) return 'medium';
    return 'low';
  }

  private calculateUserSatisfaction(messages: BaseMessage[]): number {
    // Simplified satisfaction calculation based on response patterns
    const positiveIndicators = ['thank', 'great', 'excellent', 'perfect', 'helpful'];
    const negativeIndicators = ['wrong', 'bad', 'terrible', 'unhelpful', 'confused'];
    
    const text = messages
      .filter(msg => msg._getType() === 'human')
      .map(msg => typeof msg.content === 'string' ? msg.content : '')
      .join(' ')
      .toLowerCase();

    let score = 0.5; // Neutral baseline
    
    positiveIndicators.forEach(indicator => {
      if (text.includes(indicator)) score += 0.1;
    });
    
    negativeIndicators.forEach(indicator => {
      if (text.includes(indicator)) score -= 0.1;
    });

    return Math.max(0, Math.min(1, score));
  }

  private calculateConversationFlow(messages: BaseMessage[]): number {
    // Simplified flow calculation based on response timing and continuity
    if (messages.length < 2) return 1.0;

    let flowScore = 0.8; // Base score
    
    // Check for conversation continuity
    let continuityBreaks = 0;
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i - 1];
      
      // Simple heuristic: very short responses might indicate flow breaks
      const currentContent = typeof current.content === 'string' ? current.content : '';
      if (currentContent.length < 10 && current._getType() === 'ai') {
        continuityBreaks++;
      }
    }

    flowScore -= (continuityBreaks / messages.length) * 0.3;
    
    return Math.max(0, Math.min(1, flowScore));
  }

  private calculateContextAlignment(
    personalityId: string,
    conversationContext?: ConversationContext
  ): number {
    // Simplified context alignment calculation
    let alignment = 0.7; // Base alignment

    if (conversationContext?.conversation?.topic) {
      // This would check if personality is suitable for the topic
      alignment += 0.1;
    }

    if (conversationContext?.conversation?.priority === 'high') {
      // High priority conversations might need more focused personalities
      alignment += 0.1;
    }

    return Math.max(0, Math.min(1, alignment));
  }

  private calculateResponseQuality(messages: BaseMessage[]): number {
    // Simplified response quality based on length and content diversity
    const aiMessages = messages.filter(msg => msg._getType() === 'ai');
    if (aiMessages.length === 0) return 0.5;

    const avgLength = aiMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + content.length;
    }, 0) / aiMessages.length;

    let qualityScore = 0.5;
    
    // Quality indicators
    if (avgLength > 100) qualityScore += 0.2; // Substantial responses
    if (avgLength > 300) qualityScore += 0.2; // Detailed responses
    if (avgLength < 20) qualityScore -= 0.3; // Too brief might indicate poor quality

    return Math.max(0, Math.min(1, qualityScore));
  }

  /**
   * Additional helper methods
   */
  private isCacheValid(analyzedAt: Date): boolean {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    return Date.now() - analyzedAt.getTime() < maxAge;
  }

  private calculateAnalysisConfidence(snapshots: PersonalityStateSnapshot[]): number {
    if (snapshots.length < 3) return 0.3;
    if (snapshots.length < 5) return 0.6;
    if (snapshots.length < 10) return 0.8;
    return 0.95;
  }

  private assessDataQuality(snapshots: PersonalityStateSnapshot[]): 'excellent' | 'good' | 'fair' | 'poor' {
    if (snapshots.length >= 10) return 'excellent';
    if (snapshots.length >= 5) return 'good';
    if (snapshots.length >= 2) return 'fair';
    return 'poor';
  }

  private createMinimalConsistencyAnalysis(
    threadId: string,
    timeWindow?: { startTime: Date; endTime: Date }
  ): PersonalityConsistencyAnalysis {
    return {
      threadId,
      analysisPeriod: {
        startTime: timeWindow?.startTime || new Date(Date.now() - 60 * 60 * 1000),
        endTime: timeWindow?.endTime || new Date(),
        messageCount: 0
      },
      consistencyMetrics: {
        overallConsistency: 1.0,
        traitConsistency: {},
        behavioralConsistency: 1.0,
        responsePatternConsistency: 1.0
      },
      inconsistencies: [],
      recommendations: [],
      metadata: {
        analyzedAt: new Date(),
        analysisVersion: '1.0.0',
        confidenceLevel: 0.1,
        dataQuality: 'poor'
      }
    };
  }

  private createErrorConsistencyAnalysis(
    threadId: string,
    timeWindow?: { startTime: Date; endTime: Date },
    error?: any
  ): PersonalityConsistencyAnalysis {
    return {
      ...this.createMinimalConsistencyAnalysis(threadId, timeWindow),
      inconsistencies: [{
        type: 'context_disconnect',
        severity: 'low',
        description: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        affectedMessages: [],
        suggestedCorrection: 'Retry analysis with valid data'
      }]
    };
  }

  private async analyzeCurrentContext(
    messages: BaseMessage[],
    conversationContext?: ConversationContext
  ): Promise<any> {
    // Simplified context analysis for prediction
    return {
      messageCount: messages.length,
      complexity: this.assessConversationComplexity(messages),
      engagement: this.assessUserEngagement(messages),
      topics: await this.extractTopicalFocus(messages),
      context: conversationContext
    };
  }

  private applyLearnedPatterns(
    evolution: PersonalityEvolutionTracking,
    contextAnalysis: any
  ): { personalityId: string; confidence: number; reasoning: string[] } {
    // Apply learned context mappings
    const contextKey = `complexity:${contextAnalysis.complexity}`;
    const mappedPersonality = evolution.learningInsights.contextMappings[contextKey];
    
    if (mappedPersonality) {
      return {
        personalityId: mappedPersonality,
        confidence: 0.8,
        reasoning: ['Based on learned context mapping', `Effective for ${contextAnalysis.complexity} complexity`]
      };
    }

    // Fall back to most effective personality
    const effectivePersonalities = evolution.learningInsights.effectivePersonalities;
    if (effectivePersonalities.length > 0) {
      return {
        personalityId: effectivePersonalities[0],
        confidence: 0.6,
        reasoning: ['Using most effective personality from history']
      };
    }

    // Default prediction
    return {
      personalityId: evolution.predictiveIndicators.predictedOptimalPersonality || 'default',
      confidence: 0.3,
      reasoning: ['Default prediction due to limited learning data']
    };
  }

  private async generateAlternativePersonalities(
    contextAnalysis: any,
    evolution: PersonalityEvolutionTracking
  ): Promise<Array<{ personalityId: string; confidence: number; reasoning: string }>> {
    const alternatives: Array<{ personalityId: string; confidence: number; reasoning: string }> = [];
    
    // Get effective personalities as alternatives
    evolution.learningInsights.effectivePersonalities.slice(0, 3).forEach((personalityId, index) => {
      alternatives.push({
        personalityId,
        confidence: 0.7 - (index * 0.1),
        reasoning: `Effective personality #${index + 1} based on historical performance`
      });
    });

    return alternatives;
  }
}