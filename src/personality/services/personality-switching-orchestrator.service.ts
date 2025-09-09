import { BaseMessage } from '@langchain/core/messages';
import { Injectable } from '@nestjs/common';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import type { ConversationContext } from '../../threads/services/conversation-state.service';
import type { PersonalityProfile } from '../entities/personality-profile.entity';
import { type PersonalityCompatibilityRanking, PersonalityCompatibilityScorerService } from './personality-compatibility-scorer.service';
import { type ContextAnalysisResult, PersonalityContextAnalyzerService } from './personality-context-analyzer.service';
import { type InjectedPromptResult, PersonalityInjectionService } from './personality-injection.service';
import { PersonalityProfileService } from './personality-profile.service';

/**
 * Personality switching decision result
 */
export interface PersonalitySwitchingDecision {
  /** Whether a personality switch is recommended */
  shouldSwitch: boolean;
  /** Current personality information */
  currentPersonality: {
    id: string;
    name: string;
    compatibilityScore: number;
  };
  /** Recommended personality for switching */
  recommendedPersonality?: {
    id: string;
    name: string;
    compatibilityScore: number;
    improvementExpected: number;
  };
  /** Decision confidence level */
  confidence: number;
  /** Reasoning for the decision */
  reasoning: {
    /** Key factors driving the decision */
    primaryFactors: string[];
    /** Context changes that triggered analysis */
    contextChanges: string[];
    /** Risks associated with switching */
    switchingRisks: string[];
    /** Expected benefits of switching */
    expectedBenefits: string[];
  };
  /** Switching strategy recommendations */
  switchingStrategy: {
    /** How aggressive the switch should be */
    intensity: 'gradual' | 'moderate' | 'immediate';
    /** Which traits to prioritize in transition */
    priorityTraits: string[];
    /** Suggested transition approach */
    approach: 'seamless' | 'acknowledged' | 'explicit';
  };
  /** Decision metadata */
  metadata: {
    analyzedAt: Date;
    analysisVersion: string;
    contextFactors: string[];
    personalitiesConsidered: number;
  };
}

/**
 * Automatic adaptation result
 */
export interface AutomaticAdaptationResult {
  /** Whether adaptation was performed */
  adapted: boolean;
  /** Type of adaptation performed */
  adaptationType: 'none' | 'trait_adjustment' | 'personality_switch' | 'hybrid';
  /** Previous state */
  previousState: {
    personalityId: string;
    personalityName: string;
  };
  /** New state */
  newState: {
    personalityId: string;
    personalityName: string;
    adaptedTraits?: Array<{
      traitName: string;
      previousValue: string;
      newValue: string;
    }>;
  };
  /** Enhanced prompt ready for use */
  enhancedPrompt?: InjectedPromptResult;
  /** Adaptation rationale */
  rationale: string[];
  /** User notification message (if applicable) */
  userNotification?: string;
  /** Adaptation confidence */
  confidence: number;
  /** Metadata */
  metadata: {
    adaptedAt: Date;
    triggeringFactors: string[];
    adaptationDuration: number;
  };
}

/**
 * Switching orchestrator configuration
 */
export interface OrchestratorConfiguration {
  /** Minimum confidence threshold for automatic switching */
  switchingConfidenceThreshold: number;
  /** Maximum number of switches per conversation */
  maxSwitchesPerConversation: number;
  /** Minimum time between switches (milliseconds) */
  minTimeBetweenSwitches: number;
  /** Whether to notify user about switches */
  notifyUserOnSwitch: boolean;
  /** Personality whitelist (if specified, only these can be used) */
  allowedPersonalities?: string[];
  /** Personality blacklist */
  blockedPersonalities?: string[];
  /** Context sensitivity settings */
  contextSensitivity: {
    /** How sensitive to topic changes */
    topicSensitivity: number;
    /** How sensitive to tone changes */
    toneSensitivity: number;
    /** How sensitive to complexity changes */
    complexitySensitivity: number;
    /** How sensitive to user pattern changes */
    userPatternSensitivity: number;
  };
}

/**
 * Switching history tracking
 */
interface SwitchingHistoryEntry {
  timestamp: Date;
  fromPersonalityId: string;
  toPersonalityId: string;
  reason: string;
  confidence: number;
  contextSnapshot: Partial<ContextAnalysisResult>;
}

/**
 * LangChain-based Personality Switching Orchestrator
 *
 * Advanced orchestration service that manages automatic personality adaptation
 * based on conversation context analysis and compatibility scoring.
 *
 * Key capabilities:
 * - Intelligent switching decision making
 * - Automatic personality adaptation
 * - Context-aware switching strategies
 * - Risk assessment and mitigation
 * - User experience optimization
 * - Performance monitoring and learning
 */
@Injectable()
export class PersonalitySwitchingOrchestratorService extends LangChainBaseService {
  private readonly switchingHistory = new Map<string, SwitchingHistoryEntry[]>();
  private readonly activeConfigurations = new Map<string, OrchestratorConfiguration>();
  private readonly switchingTimestamps = new Map<string, number>();

  private readonly defaultConfiguration: OrchestratorConfiguration = {
    switchingConfidenceThreshold: 0.75,
    maxSwitchesPerConversation: 5,
    minTimeBetweenSwitches: 2 * 60 * 1000, // 2 minutes
    notifyUserOnSwitch: false,
    contextSensitivity: {
      topicSensitivity: 0.8,
      toneSensitivity: 0.6,
      complexitySensitivity: 0.9,
      userPatternSensitivity: 0.7,
    },
  };

  constructor(
    private readonly contextAnalyzer: PersonalityContextAnalyzerService,
    private readonly compatibilityScorer: PersonalityCompatibilityScorerService,
    private readonly personalityInjection: PersonalityInjectionService,
    private readonly personalityService: PersonalityProfileService,
  ) {
    super('PersonalitySwitchingOrchestratorService');
  }

  /**
   * Analyze conversation and make personality switching decision
   */
  async analyzeAndDecide(
    messages: BaseMessage[],
    currentPersonalityId: string,
    conversationContext?: ConversationContext,
    threadId?: string,
    configuration?: Partial<OrchestratorConfiguration>,
  ): Promise<PersonalitySwitchingDecision> {
    this.logExecution('analyzeAndDecide', {
      messageCount: messages.length,
      currentPersonality: currentPersonalityId,
      threadId,
      hasCustomConfig: !!configuration,
    });

    try {
      // Get or create configuration
      const config = this.getConfiguration(threadId, configuration);

      // Check switching constraints
      const canSwitch = this.canPerformSwitch(threadId, config);
      if (!canSwitch.allowed) {
        return this.createNoSwitchDecision(currentPersonalityId, canSwitch.reason);
      }

      // Analyze conversation context
      const contextAnalysis = await this.createTracedRunnable('analyzeContext', () =>
        this.contextAnalyzer.analyzeConversationContext(messages, conversationContext, currentPersonalityId),
      ).invoke({});

      // Get current personality compatibility score
      const currentCompatibility = await this.createTracedRunnable('scoreCurrentPersonality', () =>
        this.compatibilityScorer.scorePersonalityCompatibility(currentPersonalityId, contextAnalysis),
      ).invoke({});

      // Check if switching is warranted
      if (!this.shouldConsiderSwitch(contextAnalysis, currentCompatibility, config)) {
        return this.createNoSwitchDecision(currentPersonalityId, 'Current personality adequately matches context', currentCompatibility.overallScore);
      }

      // Find better personality options
      const personalityRanking = await this.createTracedRunnable('rankPersonalities', () =>
        this.compatibilityScorer.rankPersonalitiesByCompatibility(contextAnalysis, this.getEligiblePersonalities(config), {
          confidenceThreshold: config.switchingConfidenceThreshold,
          maxResults: 5,
        }),
      ).invoke({});

      // Make switching decision
      const decision = await this.createTracedRunnable('makeDecision', () =>
        this.makePersonalitySwitchingDecision(currentPersonalityId, currentCompatibility, personalityRanking, contextAnalysis, config),
      ).invoke({});

      // Record decision in history
      if (decision.shouldSwitch && decision.recommendedPersonality && threadId) {
        this.recordSwitchingHistory(threadId, {
          timestamp: new Date(),
          fromPersonalityId: currentPersonalityId,
          toPersonalityId: decision.recommendedPersonality.id,
          reason: decision.reasoning.primaryFactors[0] || 'Context change detected',
          confidence: decision.confidence,
          contextSnapshot: {
            intent: contextAnalysis.intent,
            complexity: contextAnalysis.complexity,
            emotionalContext: contextAnalysis.emotionalContext,
          },
        });
      }

      this.logger.debug('Switching decision made', {
        shouldSwitch: decision.shouldSwitch,
        currentPersonality: decision.currentPersonality.name,
        recommendedPersonality: decision.recommendedPersonality?.name,
        confidence: decision.confidence,
      });

      return decision;
    } catch (error) {
      this.logger.error('Failed to analyze and make switching decision', error);
      return this.createErrorDecision(currentPersonalityId, error);
    }
  }

  /**
   * Perform automatic personality adaptation
   */
  async performAutomaticAdaptation(
    messages: BaseMessage[],
    currentPersonalityId: string,
    originalPrompt: string,
    conversationContext?: ConversationContext,
    threadId?: string,
    configuration?: Partial<OrchestratorConfiguration>,
  ): Promise<AutomaticAdaptationResult> {
    this.logExecution('performAutomaticAdaptation', {
      messageCount: messages.length,
      currentPersonality: currentPersonalityId,
      threadId,
    });

    const startTime = Date.now();

    try {
      // Make switching decision
      const decision = await this.analyzeAndDecide(messages, currentPersonalityId, conversationContext, threadId, configuration);

      // If no switch needed, return no adaptation
      if (!decision.shouldSwitch || !decision.recommendedPersonality) {
        return {
          adapted: false,
          adaptationType: 'none',
          previousState: {
            personalityId: currentPersonalityId,
            personalityName: decision.currentPersonality.name,
          },
          newState: {
            personalityId: currentPersonalityId,
            personalityName: decision.currentPersonality.name,
          },
          rationale: ['Current personality remains optimal for context'],
          confidence: decision.confidence,
          metadata: {
            adaptedAt: new Date(),
            triggeringFactors: [],
            adaptationDuration: Date.now() - startTime,
          },
        };
      }

      // Perform the personality switch
      const switchResult = await this.executePersonalitySwitch(
        currentPersonalityId,
        decision.recommendedPersonality.id,
        originalPrompt,
        conversationContext,
        decision.switchingStrategy,
        threadId,
      );

      // Create adaptation result
      const result: AutomaticAdaptationResult = {
        adapted: true,
        adaptationType: switchResult.adaptationType,
        previousState: {
          personalityId: currentPersonalityId,
          personalityName: decision.currentPersonality.name,
        },
        newState: {
          personalityId: decision.recommendedPersonality.id,
          personalityName: decision.recommendedPersonality.name,
          adaptedTraits: switchResult.adaptedTraits,
        },
        enhancedPrompt: switchResult.enhancedPrompt,
        rationale: [
          ...decision.reasoning.primaryFactors,
          `Switched to ${decision.recommendedPersonality.name} for better context alignment`,
          `Expected improvement: ${(decision.recommendedPersonality.improvementExpected * 100).toFixed(1)}%`,
        ],
        userNotification: this.generateUserNotification(decision, switchResult),
        confidence: decision.confidence,
        metadata: {
          adaptedAt: new Date(),
          triggeringFactors: decision.reasoning.contextChanges,
          adaptationDuration: Date.now() - startTime,
        },
      };

      this.logger.debug('Automatic adaptation performed', {
        adapted: result.adapted,
        adaptationType: result.adaptationType,
        fromPersonality: result.previousState.personalityName,
        toPersonality: result.newState.personalityName,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to perform automatic adaptation', error);
      return this.createErrorAdaptation(currentPersonalityId, error, startTime);
    }
  }

  /**
   * Monitor conversation for switching opportunities
   */
  async monitorConversation(
    messages: BaseMessage[],
    currentPersonalityId: string,
    conversationContext?: ConversationContext,
    threadId?: string,
  ): Promise<{
    switchingOpportunities: Array<{
      triggerPoint: number; // Message index
      reason: string;
      suggestedPersonality: string;
      confidence: number;
    }>;
    overallAssessment: {
      currentPersonalityFit: number;
      improvementPotential: number;
      recommendations: string[];
    };
  }> {
    this.logExecution('monitorConversation', {
      messageCount: messages.length,
      currentPersonality: currentPersonalityId,
      threadId,
    });

    const opportunities: Array<{
      triggerPoint: number;
      reason: string;
      suggestedPersonality: string;
      confidence: number;
    }> = [];

    // Analyze conversation in sliding windows
    const windowSize = 5;
    for (let i = windowSize; i <= messages.length; i++) {
      const window = messages.slice(Math.max(0, i - windowSize), i);

      try {
        const contextAnalysis = await this.contextAnalyzer.analyzeConversationContext(window, conversationContext, currentPersonalityId);

        if (contextAnalysis.switchingTriggers.shouldSwitch) {
          const personalityRanking = await this.compatibilityScorer.rankPersonalitiesByCompatibility(contextAnalysis, undefined, {
            maxResults: 1,
            confidenceThreshold: 0.6,
          });

          if (personalityRanking.rankings.length > 0) {
            const topPersonality = personalityRanking.rankings[0];
            opportunities.push({
              triggerPoint: i - 1,
              reason: contextAnalysis.switchingTriggers.reasons[0] || 'Context change detected',
              suggestedPersonality: topPersonality.personalityName,
              confidence: contextAnalysis.switchingTriggers.confidence,
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to analyze window at position ${i}`, error);
      }
    }

    // Overall assessment
    const currentCompatibility = await this.compatibilityScorer.scorePersonalityCompatibility(
      currentPersonalityId,
      await this.contextAnalyzer.analyzeConversationContext(messages, conversationContext, currentPersonalityId),
    );

    const overallAssessment = {
      currentPersonalityFit: currentCompatibility.overallScore,
      improvementPotential: opportunities.length > 0 ? Math.max(...opportunities.map((o) => o.confidence)) : 0,
      recommendations: this.generateMonitoringRecommendations(opportunities, currentCompatibility),
    };

    return { switchingOpportunities: opportunities, overallAssessment };
  }

  /**
   * Configure orchestrator for a specific conversation
   */
  setConfiguration(threadId: string, configuration: Partial<OrchestratorConfiguration>): void {
    const existingConfig = this.activeConfigurations.get(threadId) || this.defaultConfiguration;
    const mergedConfig = { ...existingConfig, ...configuration };
    this.activeConfigurations.set(threadId, mergedConfig);

    this.logger.debug('Configuration set for thread', { threadId, configuration: mergedConfig });
  }

  /**
   * Get switching history for a conversation
   */
  getSwitchingHistory(threadId: string): SwitchingHistoryEntry[] {
    return this.switchingHistory.get(threadId) || [];
  }

  /**
   * Clear switching history for a conversation
   */
  clearSwitchingHistory(threadId: string): void {
    this.switchingHistory.delete(threadId);
    this.switchingTimestamps.delete(threadId);
    this.logger.debug('Switching history cleared for thread', { threadId });
  }

  // Private helper methods

  /**
   * Get configuration for a thread
   */
  private getConfiguration(threadId?: string, overrides?: Partial<OrchestratorConfiguration>): OrchestratorConfiguration {
    let baseConfig = this.defaultConfiguration;

    if (threadId) {
      baseConfig = this.activeConfigurations.get(threadId) || baseConfig;
    }

    return overrides ? { ...baseConfig, ...overrides } : baseConfig;
  }

  /**
   * Check if switching can be performed
   */
  private canPerformSwitch(threadId?: string, config?: OrchestratorConfiguration): { allowed: boolean; reason?: string } {
    if (!threadId || !config) {
      return { allowed: true };
    }

    // Check switch count limit
    const history = this.getSwitchingHistory(threadId);
    if (history.length >= config.maxSwitchesPerConversation) {
      return {
        allowed: false,
        reason: `Maximum switches per conversation exceeded (${config.maxSwitchesPerConversation})`,
      };
    }

    // Check time constraint
    const lastSwitchTime = this.switchingTimestamps.get(threadId);
    if (lastSwitchTime) {
      const timeSinceLastSwitch = Date.now() - lastSwitchTime;
      if (timeSinceLastSwitch < config.minTimeBetweenSwitches) {
        return {
          allowed: false,
          reason: `Minimum time between switches not met (${config.minTimeBetweenSwitches}ms)`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Determine if switching should be considered
   */
  private shouldConsiderSwitch(contextAnalysis: ContextAnalysisResult, currentCompatibility: any, config: OrchestratorConfiguration): boolean {
    // Check if switching triggers are present
    if (contextAnalysis.switchingTriggers.shouldSwitch) {
      return true;
    }

    // Check if current personality score is low
    if (currentCompatibility.overallScore < 0.6) {
      return true;
    }

    // Check context sensitivity thresholds
    const sensitivity = config.contextSensitivity;

    // Topic-based switching
    if (sensitivity.topicSensitivity > 0.7 && contextAnalysis.topics.length > 2) {
      const primaryTopic = contextAnalysis.topics[0];
      if (primaryTopic.relevance > 0.8) {
        return true;
      }
    }

    // Complexity-based switching
    if (sensitivity.complexitySensitivity > 0.8) {
      if (contextAnalysis.complexity.level === 'expert' || contextAnalysis.complexity.score > 70) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get eligible personalities for switching
   */
  private getEligiblePersonalities(config: OrchestratorConfiguration): string[] | undefined {
    if (config.allowedPersonalities) {
      return config.allowedPersonalities.filter((id) => !config.blockedPersonalities?.includes(id));
    }

    return config.blockedPersonalities ? undefined : undefined; // Let scorer handle all personalities
  }

  /**
   * Make personality switching decision
   */
  private async makePersonalitySwitchingDecision(
    currentPersonalityId: string,
    currentCompatibility: any,
    personalityRanking: PersonalityCompatibilityRanking,
    contextAnalysis: ContextAnalysisResult,
    config: OrchestratorConfiguration,
  ): Promise<PersonalitySwitchingDecision> {
    const currentPersonality = await this.personalityService.findOne(currentPersonalityId);

    // Find best alternative
    const alternatives = personalityRanking.rankings.filter((p) => p.personalityId !== currentPersonalityId);
    const bestAlternative = alternatives[0];

    if (!bestAlternative || bestAlternative.overallScore <= currentCompatibility.overallScore + 0.1) {
      return this.createNoSwitchDecision(
        currentPersonalityId,
        'No significantly better personality found',
        currentCompatibility.overallScore,
        currentPersonality.name,
      );
    }

    // Calculate improvement and confidence
    const improvementExpected = bestAlternative.overallScore - currentCompatibility.overallScore;
    const decision = improvementExpected >= 0.15 && bestAlternative.confidence >= config.switchingConfidenceThreshold;

    return {
      shouldSwitch: decision,
      currentPersonality: {
        id: currentPersonalityId,
        name: currentPersonality.name,
        compatibilityScore: currentCompatibility.overallScore,
      },
      recommendedPersonality: decision
        ? {
            id: bestAlternative.personalityId,
            name: bestAlternative.personalityName,
            compatibilityScore: bestAlternative.overallScore,
            improvementExpected,
          }
        : undefined,
      confidence: decision ? Math.min(bestAlternative.confidence, improvementExpected * 2) : 0.3,
      reasoning: {
        primaryFactors: decision ? bestAlternative.rationale.strengths.slice(0, 2) : ['Current personality is adequate'],
        contextChanges: contextAnalysis.switchingTriggers.reasons,
        switchingRisks: decision ? ['Potential conversation continuity disruption'] : [],
        expectedBenefits: decision ? [`${(improvementExpected * 100).toFixed(1)}% compatibility improvement`] : [],
      },
      switchingStrategy: {
        intensity: improvementExpected > 0.3 ? 'immediate' : 'moderate',
        priorityTraits: bestAlternative.rationale.matchingTraits.slice(0, 3),
        approach: config.notifyUserOnSwitch ? 'acknowledged' : 'seamless',
      },
      metadata: {
        analyzedAt: new Date(),
        analysisVersion: '1.0.0',
        contextFactors: ['intent', 'complexity', 'user_patterns'],
        personalitiesConsidered: personalityRanking.rankings.length,
      },
    };
  }

  /**
   * Execute personality switch
   */
  private async executePersonalitySwitch(
    fromPersonalityId: string,
    toPersonalityId: string,
    originalPrompt: string,
    conversationContext?: ConversationContext,
    _switchingStrategy?: PersonalitySwitchingDecision['switchingStrategy'],
    threadId?: string,
  ): Promise<{
    adaptationType: 'personality_switch';
    adaptedTraits: Array<{ traitName: string; previousValue: string; newValue: string }>;
    enhancedPrompt: InjectedPromptResult;
  }> {
    // Get personality details for comparison
    const [fromPersonality, toPersonality] = await Promise.all([
      this.personalityService.findOne(fromPersonalityId),
      this.personalityService.findOne(toPersonalityId),
    ]);

    // Identify trait changes
    const adaptedTraits = this.identifyTraitChanges(fromPersonality, toPersonality);

    // Create enhanced prompt with new personality
    const enhancedPrompt = await this.personalityInjection.injectPersonality({
      originalPrompt,
      personalityId: toPersonalityId,
      contextVariables: this.buildContextVariables(conversationContext),
      conversationHistory: conversationContext?.session ? [] : undefined, // Simplified for now
    });

    // Record timestamp
    if (threadId) {
      this.switchingTimestamps.set(threadId, Date.now());
    }

    return {
      adaptationType: 'personality_switch',
      adaptedTraits,
      enhancedPrompt,
    };
  }

  /**
   * Identify trait changes between personalities
   */
  private identifyTraitChanges(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile,
  ): Array<{ traitName: string; previousValue: string; newValue: string }> {
    const changes: Array<{ traitName: string; previousValue: string; newValue: string }> = [];

    // Compare traits
    toPersonality.traits.forEach((newTrait) => {
      const oldTrait = fromPersonality.traits.find((t) => t.name === newTrait.name);
      if (!oldTrait || oldTrait.value !== newTrait.value) {
        changes.push({
          traitName: newTrait.name,
          previousValue: oldTrait?.value || 'undefined',
          newValue: newTrait.value,
        });
      }
    });

    return changes;
  }

  /**
   * Build context variables from conversation context
   */
  private buildContextVariables(conversationContext?: ConversationContext): Record<string, any> {
    const variables: Record<string, any> = {};

    if (conversationContext?.modelConfig) {
      variables.temperature = conversationContext.modelConfig.temperature;
      variables.model = conversationContext.modelConfig.model;
    }

    if (conversationContext?.conversation) {
      variables.language = conversationContext.conversation.language;
      variables.topic = conversationContext.conversation.topic;
      variables.priority = conversationContext.conversation.priority;
    }

    return variables;
  }

  /**
   * Generate user notification message
   */
  private generateUserNotification(decision: PersonalitySwitchingDecision, _switchResult: any): string | undefined {
    if (decision.switchingStrategy.approach !== 'acknowledged' && decision.switchingStrategy.approach !== 'explicit') {
      return undefined;
    }

    const personality = decision.recommendedPersonality;
    if (!personality) {
      return undefined;
    }

    if (decision.switchingStrategy.approach === 'explicit') {
      return `I've switched to my ${personality.name} personality to better help with your current needs.`;
    }
    return 'Adapting my approach to better assist you with this topic.';
  }

  /**
   * Generate monitoring recommendations
   */
  private generateMonitoringRecommendations(
    opportunities: Array<{ triggerPoint: number; reason: string; suggestedPersonality: string; confidence: number }>,
    currentCompatibility: any,
  ): string[] {
    const recommendations: string[] = [];

    if (opportunities.length === 0) {
      recommendations.push('Current personality is well-aligned with conversation context');
    } else {
      recommendations.push(`${opportunities.length} switching opportunities identified`);

      const highConfidenceOpp = opportunities.filter((o) => o.confidence > 0.8);
      if (highConfidenceOpp.length > 0) {
        recommendations.push(`${highConfidenceOpp.length} high-confidence switching opportunities detected`);
      }
    }

    if (currentCompatibility.overallScore < 0.6) {
      recommendations.push('Current personality compatibility is below optimal threshold');
    }

    return recommendations;
  }

  /**
   * Record switching history entry
   */
  private recordSwitchingHistory(threadId: string, entry: SwitchingHistoryEntry): void {
    if (!this.switchingHistory.has(threadId)) {
      this.switchingHistory.set(threadId, []);
    }

    const history = this.switchingHistory.get(threadId)!;
    history.push(entry);

    // Keep only last 20 entries
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
  }

  /**
   * Create no-switch decision
   */
  private createNoSwitchDecision(
    personalityId: string,
    reason: string,
    compatibilityScore = 0.7,
    personalityName = 'Current',
  ): PersonalitySwitchingDecision {
    return {
      shouldSwitch: false,
      currentPersonality: {
        id: personalityId,
        name: personalityName,
        compatibilityScore,
      },
      confidence: 0.8,
      reasoning: {
        primaryFactors: [reason],
        contextChanges: [],
        switchingRisks: [],
        expectedBenefits: [],
      },
      switchingStrategy: {
        intensity: 'gradual',
        priorityTraits: [],
        approach: 'seamless',
      },
      metadata: {
        analyzedAt: new Date(),
        analysisVersion: '1.0.0',
        contextFactors: [],
        personalitiesConsidered: 0,
      },
    };
  }

  /**
   * Create error decision
   */
  private createErrorDecision(personalityId: string, error: any): PersonalitySwitchingDecision {
    return this.createNoSwitchDecision(personalityId, `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 0.5);
  }

  /**
   * Create error adaptation result
   */
  private createErrorAdaptation(personalityId: string, error: any, startTime: number): AutomaticAdaptationResult {
    return {
      adapted: false,
      adaptationType: 'none',
      previousState: {
        personalityId,
        personalityName: 'Unknown',
      },
      newState: {
        personalityId,
        personalityName: 'Unknown',
      },
      rationale: [`Adaptation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      metadata: {
        adaptedAt: new Date(),
        triggeringFactors: [],
        adaptationDuration: Date.now() - startTime,
      },
    };
  }
}
