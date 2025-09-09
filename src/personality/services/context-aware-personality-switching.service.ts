import { Injectable, Logger } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { PersonalityContextAnalyzerService } from './personality-context-analyzer.service';
import { PersonalityCompatibilityScorerService } from './personality-compatibility-scorer.service';
import { PersonalitySwitchingOrchestratorService, type OrchestratorConfiguration } from './personality-switching-orchestrator.service';
import { PersonalityTransitionSmootherService, type TransitionSmoothingConfig } from './personality-transition-smoother.service';
import { PersonalityStateTrackerService } from './personality-state-tracker.service';
import { PersonalityInjectionService } from './personality-injection.service';
import type { ConversationContext } from '../../threads/services/conversation-state.service';

/**
 * Context-aware switching configuration
 */
export interface ContextAwarePersonalitySwitchingConfig {
  /** Whether automatic switching is enabled */
  automaticSwitchingEnabled: boolean;
  /** Orchestrator configuration */
  orchestratorConfig: Partial<OrchestratorConfiguration>;
  /** Transition smoothing configuration */
  transitionConfig: Partial<TransitionSmoothingConfig>;
  /** State tracking configuration */
  stateTrackingConfig: {
    /** Whether to create automatic snapshots */
    automaticSnapshots: boolean;
    /** Snapshot interval in messages */
    snapshotInterval: number;
    /** Whether to track evolution */
    trackEvolution: boolean;
  };
  /** Analysis sensitivity settings */
  analysisSensitivity: {
    /** Context change sensitivity (0-1) */
    contextChangeSensitivity: number;
    /** Performance threshold for switching (0-1) */
    performanceThreshold: number;
    /** Minimum confidence for automatic actions (0-1) */
    minConfidenceThreshold: number;
  };
}

/**
 * Complete context-aware switching result
 */
export interface ContextAwarePersonalitySwitchingResult {
  /** Whether any switching or adaptation occurred */
  switchingPerformed: boolean;
  /** Type of adaptation performed */
  adaptationType: 'none' | 'personality_switch' | 'trait_adjustment' | 'context_optimization';
  /** Previous personality state */
  previousState: {
    personalityId: string;
    personalityName: string;
    compatibilityScore: number;
  };
  /** New personality state */
  newState: {
    personalityId: string;
    personalityName: string;
    compatibilityScore: number;
    improvements: string[];
  };
  /** Enhanced prompt ready for use */
  enhancedPrompt?: string;
  /** Switching decision details */
  decisionDetails: {
    confidence: number;
    reasoning: string[];
    contextFactors: string[];
    performanceImpact: number;
  };
  /** Transition smoothing applied */
  transitionDetails?: {
    transitionType: 'seamless' | 'gradual' | 'bridged' | 'explicit';
    userMessage?: string;
    smoothingQuality: number;
  };
  /** State tracking information */
  stateTracking: {
    snapshotCreated: boolean;
    evolutionTracked: boolean;
    consistencyScore?: number;
  };
  /** User-facing information */
  userFeedback?: {
    notificationMessage?: string;
    expectationSetting?: string;
    improvementHighlights?: string[];
  };
  /** Processing metadata */
  metadata: {
    processedAt: Date;
    processingTime: number;
    contextAnalyzed: boolean;
    compatibilityScored: boolean;
    systemVersion: string;
  };
}

/**
 * Monitoring result for ongoing conversations
 */
export interface PersonalitySwitchingMonitoringResult {
  /** Thread being monitored */
  threadId: string;
  /** Current personality status */
  currentStatus: {
    personalityId: string;
    personalityName: string;
    activeFor: number; // milliseconds
    performanceScore: number;
  };
  /** Identified switching opportunities */
  switchingOpportunities: Array<{
    triggerPoint: number;
    opportunity: string;
    confidence: number;
    expectedBenefit: number;
  }>;
  /** Performance trends */
  performanceTrends: {
    direction: 'improving' | 'stable' | 'declining';
    recentScore: number;
    trend: number[]; // Last 5 scores
  };
  /** Recommendations */
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: 'switch_personality' | 'adjust_traits' | 'monitor_closely' | 'maintain_current';
    description: string;
    expectedImpact: number;
  }>;
  /** Next analysis scheduled */
  nextAnalysis: Date;
}

/**
 * Comprehensive Context-Aware Personality Switching Service
 * 
 * This is the main orchestrating service that brings together all components
 * of the context-aware personality switching system. It provides a unified
 * interface for intelligent personality adaptation based on conversation context.
 * 
 * Key capabilities:
 * - Automatic context analysis and switching decisions
 * - Seamless personality transitions
 * - Performance monitoring and optimization
 * - State tracking and learning
 * - User experience optimization
 * - Comprehensive monitoring and analytics
 */
@Injectable()
export class ContextAwarePersonalitySwitchingService extends LangChainBaseService {
  private readonly configurations = new Map<string, ContextAwarePersonalitySwitchingConfig>();
  private readonly monitoringIntervals = new Map<string, NodeJS.Timeout>();
  
  private readonly defaultConfiguration: ContextAwarePersonalitySwitchingConfig = {
    automaticSwitchingEnabled: true,
    orchestratorConfig: {
      switchingConfidenceThreshold: 0.75,
      maxSwitchesPerConversation: 3,
      minTimeBetweenSwitches: 2 * 60 * 1000,
      notifyUserOnSwitch: false,
      contextSensitivity: {
        topicSensitivity: 0.8,
        toneSensitivity: 0.6,
        complexitySensitivity: 0.9,
        userPatternSensitivity: 0.7
      }
    },
    transitionConfig: {
      intensity: 0.5,
      acknowledge: false,
      approach: 'seamless',
      maintainContinuity: true,
      timing: {
        preparationMessages: 1,
        stabilizationMessages: 2
      }
    },
    stateTrackingConfig: {
      automaticSnapshots: true,
      snapshotInterval: 5,
      trackEvolution: true
    },
    analysisSensitivity: {
      contextChangeSensitivity: 0.7,
      performanceThreshold: 0.6,
      minConfidenceThreshold: 0.7
    }
  };

  constructor(
    private readonly contextAnalyzer: PersonalityContextAnalyzerService,
    private readonly compatibilityScorer: PersonalityCompatibilityScorerService,
    private readonly switchingOrchestrator: PersonalitySwitchingOrchestratorService,
    private readonly transitionSmoother: PersonalityTransitionSmootherService,
    private readonly stateTracker: PersonalityStateTrackerService,
    private readonly personalityInjection: PersonalityInjectionService,
  ) {
    super('ContextAwarePersonalitySwitchingService');
  }

  /**
   * Perform comprehensive context-aware personality switching analysis and execution
   */
  async performContextAwareSwitch(
    threadId: string,
    messages: BaseMessage[],
    currentPersonalityId: string,
    originalPrompt: string,
    conversationContext?: ConversationContext,
    customConfig?: Partial<ContextAwarePersonalitySwitchingConfig>
  ): Promise<ContextAwarePersonalitySwitchingResult> {
    this.logExecution('performContextAwareSwitch', {
      threadId,
      messageCount: messages.length,
      currentPersonality: currentPersonalityId,
      hasCustomConfig: !!customConfig
    });

    const startTime = Date.now();
    let contextAnalyzed = false;
    let compatibilityScored = false;

    try {
      // Get configuration
      const config = this.getConfiguration(threadId, customConfig);

      // Create state snapshot if enabled
      let snapshotCreated = false;
      if (config.stateTrackingConfig.automaticSnapshots) {
        const shouldSnapshot = messages.length % config.stateTrackingConfig.snapshotInterval === 0;
        if (shouldSnapshot) {
          await this.stateTracker.createStateSnapshot(
            threadId,
            currentPersonalityId,
            messages,
            conversationContext,
            'scheduled'
          );
          snapshotCreated = true;
        }
      }

      // Analyze conversation context
      const contextAnalysis = await this.createTracedRunnable(
        'analyzeContext',
        () => this.contextAnalyzer.analyzeConversationContext(
          messages,
          conversationContext,
          currentPersonalityId
        )
      ).invoke({});
      contextAnalyzed = true;

      // Score current personality compatibility
      const currentCompatibility = await this.createTracedRunnable(
        'scoreCurrentCompatibility',
        () => this.compatibilityScorer.scorePersonalityCompatibility(
          currentPersonalityId,
          contextAnalysis
        )
      ).invoke({});
      compatibilityScored = true;

      // Check if switching should be considered
      if (!config.automaticSwitchingEnabled || 
          !this.shouldPerformSwitchingAnalysis(contextAnalysis, currentCompatibility, config)) {
        return this.createNoSwitchResult(
          currentPersonalityId,
          currentCompatibility,
          contextAnalyzed,
          compatibilityScored,
          snapshotCreated,
          startTime,
          'Switching not needed or disabled'
        );
      }

      // Perform automatic adaptation
      const adaptationResult = await this.createTracedRunnable(
        'performAdaptation',
        () => this.switchingOrchestrator.performAutomaticAdaptation(
          messages,
          currentPersonalityId,
          originalPrompt,
          conversationContext,
          threadId,
          config.orchestratorConfig
        )
      ).invoke({});

      // If no adaptation was performed
      if (!adaptationResult.adapted) {
        return this.createNoSwitchResult(
          currentPersonalityId,
          currentCompatibility,
          contextAnalyzed,
          compatibilityScored,
          snapshotCreated,
          startTime,
          adaptationResult.rationale[0] || 'No beneficial adaptation identified'
        );
      }

      // Apply transition smoothing if switching occurred
      let transitionDetails;
      let finalPrompt = adaptationResult.enhancedPrompt?.enhancedPrompt || originalPrompt;
      
      if (adaptationResult.adaptationType === 'personality_switch') {
        // Create optimized transition configuration
        const transitionConfig = await this.transitionSmoother.optimizeTransitionConfig(
          currentPersonalityId,
          adaptationResult.newState.personalityId,
          {
            messageCount: messages.length,
            userEngagement: this.assessUserEngagement(messages)
          }
        );

        // Merge with user configuration
        const mergedTransitionConfig = { ...transitionConfig, ...config.transitionConfig };

        // Apply transition smoothing
        const transitionResult = await this.createTracedRunnable(
          'applyTransitionSmoothing',
          () => this.transitionSmoother.createSmoothTransition(
            currentPersonalityId,
            adaptationResult.newState.personalityId,
            originalPrompt,
            messages,
            mergedTransitionConfig
          )
        ).invoke({});

        if (transitionResult.success.smoothed) {
          finalPrompt = transitionResult.smoothedPrompt;
          transitionDetails = {
            transitionType: transitionResult.transitionMetadata.transitionType,
            userMessage: transitionResult.userMessage,
            smoothingQuality: transitionResult.transitionMetadata.smoothingQuality
          };
        }

        // Track state change
        if (config.stateTrackingConfig.trackEvolution) {
          await this.stateTracker.trackStateChange(
            threadId,
            'personality_switch',
            `Switched from ${adaptationResult.previousState.personalityName} to ${adaptationResult.newState.personalityName}`,
            adaptationResult.previousState.personalityId,
            adaptationResult.newState.personalityId,
            contextAnalysis.switchingTriggers.reasons[0] || 'Context change',
            {
              userExperienceImpact: transitionResult.transitionMetadata.estimatedUserImpact,
              conversationQualityImpact: 0.8, // Estimated
              consistencyImpact: 1 - transitionResult.transitionMetadata.estimatedUserImpact
            }
          );
        }
      }

      // Calculate new compatibility score
      const newCompatibility = await this.compatibilityScorer.scorePersonalityCompatibility(
        adaptationResult.newState.personalityId,
        contextAnalysis
      );

      // Create comprehensive result
      const result: ContextAwarePersonalitySwitchingResult = {
        switchingPerformed: true,
        adaptationType: adaptationResult.adaptationType as any,
        previousState: {
          personalityId: adaptationResult.previousState.personalityId,
          personalityName: adaptationResult.previousState.personalityName,
          compatibilityScore: currentCompatibility.overallScore
        },
        newState: {
          personalityId: adaptationResult.newState.personalityId,
          personalityName: adaptationResult.newState.personalityName,
          compatibilityScore: newCompatibility.overallScore,
          improvements: this.calculateImprovements(currentCompatibility, newCompatibility)
        },
        enhancedPrompt: finalPrompt,
        decisionDetails: {
          confidence: adaptationResult.confidence,
          reasoning: adaptationResult.rationale,
          contextFactors: contextAnalysis.switchingTriggers.reasons,
          performanceImpact: newCompatibility.overallScore - currentCompatibility.overallScore
        },
        transitionDetails,
        stateTracking: {
          snapshotCreated,
          evolutionTracked: config.stateTrackingConfig.trackEvolution,
          consistencyScore: await this.calculateConsistencyScore(threadId)
        },
        userFeedback: this.generateUserFeedback(adaptationResult, transitionDetails),
        metadata: {
          processedAt: new Date(),
          processingTime: Date.now() - startTime,
          contextAnalyzed,
          compatibilityScored,
          systemVersion: '1.0.0'
        }
      };

      this.logger.debug('Context-aware switching completed', {
        threadId,
        switched: result.switchingPerformed,
        adaptationType: result.adaptationType,
        newPersonality: result.newState.personalityName,
        performanceImprovement: result.decisionDetails.performanceImpact,
        processingTime: result.metadata.processingTime
      });

      return result;
    } catch (error) {
      this.logger.error('Context-aware switching failed', error);
      return this.createErrorResult(
        currentPersonalityId,
        contextAnalyzed,
        compatibilityScored,
        startTime,
        error
      );
    }
  }

  /**
   * Monitor ongoing conversation for switching opportunities
   */
  async monitorConversationForSwitching(
    threadId: string,
    messages: BaseMessage[],
    currentPersonalityId: string,
    conversationContext?: ConversationContext,
    customConfig?: Partial<ContextAwarePersonalitySwitchingConfig>
  ): Promise<PersonalitySwitchingMonitoringResult> {
    this.logExecution('monitorConversationForSwitching', {
      threadId,
      messageCount: messages.length,
      currentPersonality: currentPersonalityId
    });

    try {
      const config = this.getConfiguration(threadId, customConfig);

      // Get current personality state
      const currentState = await this.stateTracker.getCurrentPersonalityState(threadId);
      const activeFor = currentState ? 
        Date.now() - currentState.timestamp.getTime() : 0;

      // Monitor for switching opportunities
      const opportunitiesResult = await this.switchingOrchestrator.monitorConversation(
        messages,
        currentPersonalityId,
        conversationContext,
        threadId
      );

      // Analyze performance trends
      const performanceTrends = await this.analyzePerformanceTrends(threadId);

      // Generate recommendations
      const recommendations = await this.generateMonitoringRecommendations(
        opportunitiesResult,
        performanceTrends,
        config
      );

      // Schedule next analysis
      const nextAnalysis = new Date(Date.now() + (5 * 60 * 1000)); // 5 minutes

      const result: PersonalitySwitchingMonitoringResult = {
        threadId,
        currentStatus: {
          personalityId: currentPersonalityId,
          personalityName: currentState?.activePersonality.name || 'Unknown',
          activeFor,
          performanceScore: opportunitiesResult.overallAssessment.currentPersonalityFit
        },
        switchingOpportunities: opportunitiesResult.switchingOpportunities.map(opp => ({
          triggerPoint: opp.triggerPoint,
          opportunity: opp.reason,
          confidence: opp.confidence,
          expectedBenefit: opp.confidence * 0.8 // Estimated benefit
        })),
        performanceTrends,
        recommendations,
        nextAnalysis
      };

      this.logger.debug('Conversation monitoring completed', {
        threadId,
        opportunitiesFound: result.switchingOpportunities.length,
        currentPerformance: result.currentStatus.performanceScore,
        recommendationsCount: result.recommendations.length
      });

      return result;
    } catch (error) {
      this.logger.error('Conversation monitoring failed', error);
      return this.createErrorMonitoringResult(threadId, currentPersonalityId, error);
    }
  }

  /**
   * Setup automatic monitoring for a conversation thread
   */
  setupAutomaticMonitoring(
    threadId: string,
    intervalMinutes: number = 5,
    config?: Partial<ContextAwarePersonalitySwitchingConfig>
  ): void {
    // Clear existing monitoring
    this.stopAutomaticMonitoring(threadId);

    // Set configuration
    if (config) {
      this.setConfiguration(threadId, config);
    }

    // Setup monitoring interval
    const interval = setInterval(async () => {
      try {
        // Get current conversation state and trigger monitoring
        // This would typically integrate with the conversation service
        this.logger.debug('Automatic monitoring triggered', { threadId });
        // Implementation would depend on how to access current conversation state
      } catch (error) {
        this.logger.error('Automatic monitoring error', { threadId, error });
      }
    }, intervalMinutes * 60 * 1000);

    this.monitoringIntervals.set(threadId, interval);
    this.logger.debug('Automatic monitoring setup', { threadId, intervalMinutes });
  }

  /**
   * Stop automatic monitoring for a conversation thread
   */
  stopAutomaticMonitoring(threadId: string): void {
    const interval = this.monitoringIntervals.get(threadId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(threadId);
      this.logger.debug('Automatic monitoring stopped', { threadId });
    }
  }

  /**
   * Set configuration for a specific thread
   */
  setConfiguration(
    threadId: string,
    config: Partial<ContextAwarePersonalitySwitchingConfig>
  ): void {
    const existingConfig = this.configurations.get(threadId) || this.defaultConfiguration;
    const mergedConfig = this.deepMerge(existingConfig, config);
    this.configurations.set(threadId, mergedConfig);
    
    // Update orchestrator configuration
    this.switchingOrchestrator.setConfiguration(threadId, mergedConfig.orchestratorConfig);
    
    this.logger.debug('Configuration updated', { threadId });
  }

  /**
   * Get comprehensive system analytics
   */
  async getSystemAnalytics(
    threadIds?: string[]
  ): Promise<{
    overallPerformance: {
      averageCompatibilityScore: number;
      successfulSwitches: number;
      totalSwitches: number;
      averageUserSatisfaction: number;
    };
    personalityEffectiveness: Array<{
      personalityId: string;
      personalityName: string;
      usageCount: number;
      averageScore: number;
      effectivenessRating: 'excellent' | 'good' | 'fair' | 'poor';
    }>;
    switchingPatterns: {
      commonTriggers: Array<{ trigger: string; frequency: number }>;
      averageSwitchingFrequency: number;
      mostEffectiveTransitions: Array<{
        fromPersonality: string;
        toPersonality: string;
        successRate: number;
      }>;
    };
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      category: 'system_optimization' | 'personality_tuning' | 'user_experience';
      description: string;
      expectedImpact: number;
    }>;
  }> {
    this.logExecution('getSystemAnalytics', {
      threadCount: threadIds?.length || 'all'
    });

    try {
      const threads = threadIds || Array.from(this.configurations.keys());
      
      // Gather analytics data from all components
      const analyticsData = await Promise.all(
        threads.map(async threadId => {
          try {
            const evolution = await this.stateTracker.getEvolutionTracking(threadId);
            const consistency = await this.stateTracker.analyzePersonalityConsistency(threadId);
            return { threadId, evolution, consistency };
          } catch (error) {
            this.logger.warn('Failed to get analytics for thread', { threadId, error });
            return null;
          }
        })
      );

      const validData = analyticsData.filter(data => data !== null);

      // Aggregate performance metrics
      const overallPerformance = this.aggregatePerformanceMetrics(validData);
      
      // Analyze personality effectiveness
      const personalityEffectiveness = this.analyzePersonalityEffectiveness(validData);
      
      // Identify switching patterns
      const switchingPatterns = this.analyzeSwitchingPatterns(validData);
      
      // Generate system recommendations
      const recommendations = this.generateSystemRecommendations(
        overallPerformance,
        personalityEffectiveness,
        switchingPatterns
      );

      return {
        overallPerformance,
        personalityEffectiveness,
        switchingPatterns,
        recommendations
      };
    } catch (error) {
      this.logger.error('Failed to generate system analytics', error);
      return this.createEmptyAnalytics();
    }
  }

  /**
   * Cleanup resources for a conversation thread
   */
  cleanup(threadId: string): void {
    this.stopAutomaticMonitoring(threadId);
    this.configurations.delete(threadId);
    this.stateTracker.clearThreadState(threadId);
    this.switchingOrchestrator.clearSwitchingHistory(threadId);
    this.logger.debug('Thread cleanup completed', { threadId });
  }

  // Private helper methods

  private getConfiguration(
    threadId: string,
    overrides?: Partial<ContextAwarePersonalitySwitchingConfig>
  ): ContextAwarePersonalitySwitchingConfig {
    let baseConfig = this.configurations.get(threadId) || this.defaultConfiguration;
    
    return overrides ? this.deepMerge(baseConfig, overrides) : baseConfig;
  }

  private shouldPerformSwitchingAnalysis(
    contextAnalysis: any,
    currentCompatibility: any,
    config: ContextAwarePersonalitySwitchingConfig
  ): boolean {
    // Check if context suggests switching
    if (contextAnalysis.switchingTriggers.shouldSwitch && 
        contextAnalysis.switchingTriggers.confidence >= config.analysisSensitivity.minConfidenceThreshold) {
      return true;
    }

    // Check if current performance is below threshold
    if (currentCompatibility.overallScore < config.analysisSensitivity.performanceThreshold) {
      return true;
    }

    return false;
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

  private calculateImprovements(
    currentCompatibility: any,
    newCompatibility: any
  ): string[] {
    const improvements: string[] = [];
    
    const scoreDiff = newCompatibility.overallScore - currentCompatibility.overallScore;
    if (scoreDiff > 0.1) {
      improvements.push(`${(scoreDiff * 100).toFixed(1)}% overall compatibility improvement`);
    }

    // Compare individual scores
    Object.keys(newCompatibility.scores).forEach(scoreType => {
      const improvement = newCompatibility.scores[scoreType] - 
                         (currentCompatibility.scores[scoreType] || 0);
      if (improvement > 0.15) {
        improvements.push(`Significant ${scoreType} improvement`);
      }
    });

    return improvements;
  }

  private async calculateConsistencyScore(threadId: string): Promise<number | undefined> {
    try {
      const analysis = await this.stateTracker.analyzePersonalityConsistency(threadId);
      return analysis.consistencyMetrics.overallConsistency;
    } catch (error) {
      this.logger.warn('Failed to calculate consistency score', { threadId, error });
      return undefined;
    }
  }

  private generateUserFeedback(
    adaptationResult: any,
    transitionDetails?: any
  ): ContextAwarePersonalitySwitchingResult['userFeedback'] {
    if (!adaptationResult.adapted) {
      return undefined;
    }

    return {
      notificationMessage: adaptationResult.userNotification,
      expectationSetting: transitionDetails?.userMessage,
      improvementHighlights: adaptationResult.rationale.slice(0, 2)
    };
  }

  private async analyzePerformanceTrends(
    threadId: string
  ): Promise<PersonalitySwitchingMonitoringResult['performanceTrends']> {
    try {
      const history = this.stateTracker.getPersonalityStateHistory(threadId, 5);
      const scores = history.map(snapshot => snapshot.performanceMetrics.contextAlignmentScore);
      
      if (scores.length < 2) {
        return {
          direction: 'stable',
          recentScore: scores[0] || 0.5,
          trend: scores
        };
      }

      const recentScore = scores[scores.length - 1];
      const previousScore = scores[scores.length - 2];
      const difference = recentScore - previousScore;

      let direction: 'improving' | 'stable' | 'declining';
      if (difference > 0.1) direction = 'improving';
      else if (difference < -0.1) direction = 'declining';
      else direction = 'stable';

      return {
        direction,
        recentScore,
        trend: scores
      };
    } catch (error) {
      return {
        direction: 'stable',
        recentScore: 0.5,
        trend: []
      };
    }
  }

  private async generateMonitoringRecommendations(
    opportunitiesResult: any,
    performanceTrends: any,
    config: ContextAwarePersonalitySwitchingConfig
  ): Promise<PersonalitySwitchingMonitoringResult['recommendations']> {
    const recommendations: PersonalitySwitchingMonitoringResult['recommendations'] = [];

    // High-confidence switching opportunities
    const highConfidenceOpportunities = opportunitiesResult.switchingOpportunities.filter(
      (opp: any) => opp.confidence > 0.8
    );
    
    if (highConfidenceOpportunities.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'switch_personality',
        description: 'High-confidence switching opportunity detected',
        expectedImpact: 0.8
      });
    }

    // Performance decline
    if (performanceTrends.direction === 'declining') {
      recommendations.push({
        priority: 'medium',
        action: 'adjust_traits',
        description: 'Performance declining - consider trait adjustments',
        expectedImpact: 0.6
      });
    }

    // Low overall performance
    if (opportunitiesResult.overallAssessment.currentPersonalityFit < 0.6) {
      recommendations.push({
        priority: 'high',
        action: 'switch_personality',
        description: 'Current personality fit below optimal threshold',
        expectedImpact: 0.7
      });
    }

    return recommendations;
  }

  // Result creation helpers

  private createNoSwitchResult(
    personalityId: string,
    compatibility: any,
    contextAnalyzed: boolean,
    compatibilityScored: boolean,
    snapshotCreated: boolean,
    startTime: number,
    reason: string
  ): ContextAwarePersonalitySwitchingResult {
    return {
      switchingPerformed: false,
      adaptationType: 'none',
      previousState: {
        personalityId,
        personalityName: compatibility.personalityName || 'Unknown',
        compatibilityScore: compatibility.overallScore || 0.5
      },
      newState: {
        personalityId,
        personalityName: compatibility.personalityName || 'Unknown',
        compatibilityScore: compatibility.overallScore || 0.5,
        improvements: []
      },
      decisionDetails: {
        confidence: 0.9,
        reasoning: [reason],
        contextFactors: [],
        performanceImpact: 0
      },
      stateTracking: {
        snapshotCreated,
        evolutionTracked: false
      },
      metadata: {
        processedAt: new Date(),
        processingTime: Date.now() - startTime,
        contextAnalyzed,
        compatibilityScored,
        systemVersion: '1.0.0'
      }
    };
  }

  private createErrorResult(
    personalityId: string,
    contextAnalyzed: boolean,
    compatibilityScored: boolean,
    startTime: number,
    error: any
  ): ContextAwarePersonalitySwitchingResult {
    return {
      switchingPerformed: false,
      adaptationType: 'none',
      previousState: {
        personalityId,
        personalityName: 'Unknown',
        compatibilityScore: 0.5
      },
      newState: {
        personalityId,
        personalityName: 'Unknown',
        compatibilityScore: 0.5,
        improvements: []
      },
      decisionDetails: {
        confidence: 0,
        reasoning: [`Error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`],
        contextFactors: [],
        performanceImpact: 0
      },
      stateTracking: {
        snapshotCreated: false,
        evolutionTracked: false
      },
      metadata: {
        processedAt: new Date(),
        processingTime: Date.now() - startTime,
        contextAnalyzed,
        compatibilityScored,
        systemVersion: '1.0.0'
      }
    };
  }

  private createErrorMonitoringResult(
    threadId: string,
    personalityId: string,
    error: any
  ): PersonalitySwitchingMonitoringResult {
    return {
      threadId,
      currentStatus: {
        personalityId,
        personalityName: 'Unknown',
        activeFor: 0,
        performanceScore: 0.5
      },
      switchingOpportunities: [],
      performanceTrends: {
        direction: 'stable',
        recentScore: 0.5,
        trend: []
      },
      recommendations: [{
        priority: 'low',
        action: 'monitor_closely',
        description: `Monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expectedImpact: 0
      }],
      nextAnalysis: new Date(Date.now() + (10 * 60 * 1000))
    };
  }

  // Analytics helpers

  private aggregatePerformanceMetrics(validData: any[]): any {
    if (validData.length === 0) {
      return {
        averageCompatibilityScore: 0.5,
        successfulSwitches: 0,
        totalSwitches: 0,
        averageUserSatisfaction: 0.5
      };
    }

    const totalSwitches = validData.reduce((sum, data) => 
      sum + data.evolution.evolutionTimeline.length, 0);
    
    const successfulSwitches = validData.reduce((sum, data) => 
      sum + data.evolution.evolutionTimeline.filter(
        (entry: any) => entry.impactAssessment.conversationQualityImpact > 0.6
      ).length, 0);

    return {
      averageCompatibilityScore: 0.7, // Would calculate from actual data
      successfulSwitches,
      totalSwitches,
      averageUserSatisfaction: 0.75 // Would calculate from actual data
    };
  }

  private analyzePersonalityEffectiveness(validData: any[]): any[] {
    // Simplified effectiveness analysis
    return []; // Would implement based on actual usage data
  }

  private analyzeSwitchingPatterns(validData: any[]): any {
    const allTriggers = validData.flatMap(data => 
      data.evolution.evolutionTimeline.map((entry: any) => entry.triggeringFactor)
    );

    const triggerCounts = new Map<string, number>();
    allTriggers.forEach(trigger => {
      const count = triggerCounts.get(trigger) || 0;
      triggerCounts.set(trigger, count + 1);
    });

    const commonTriggers = Array.from(triggerCounts.entries())
      .map(([trigger, frequency]) => ({ trigger, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    return {
      commonTriggers,
      averageSwitchingFrequency: allTriggers.length / Math.max(validData.length, 1),
      mostEffectiveTransitions: [] // Would calculate from actual transition data
    };
  }

  private generateSystemRecommendations(
    performance: any,
    effectiveness: any[],
    patterns: any
  ): any[] {
    const recommendations: any[] = [];

    if (performance.averageCompatibilityScore < 0.7) {
      recommendations.push({
        priority: 'high',
        category: 'system_optimization',
        description: 'Overall system compatibility below optimal - review personality matching algorithms',
        expectedImpact: 0.8
      });
    }

    if (patterns.averageSwitchingFrequency > 5) {
      recommendations.push({
        priority: 'medium',
        category: 'personality_tuning',
        description: 'High switching frequency detected - consider more stable personality configurations',
        expectedImpact: 0.6
      });
    }

    return recommendations;
  }

  private createEmptyAnalytics(): any {
    return {
      overallPerformance: {
        averageCompatibilityScore: 0.5,
        successfulSwitches: 0,
        totalSwitches: 0,
        averageUserSatisfaction: 0.5
      },
      personalityEffectiveness: [],
      switchingPatterns: {
        commonTriggers: [],
        averageSwitchingFrequency: 0,
        mostEffectiveTransitions: []
      },
      recommendations: []
    };
  }

  /**
   * Deep merge utility for configurations
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] as any, source[key] as any);
      } else if (source[key] !== undefined) {
        result[key] = source[key] as any;
      }
    }
    
    return result;
  }
}