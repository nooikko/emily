import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage } from '@langchain/core/messages';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { PersonalityProfileService } from './personality-profile.service';
import type { PersonalityProfile, PersonalityTrait } from '../entities/personality-profile.entity';
import type { InjectedPromptResult } from './personality-injection.service';

/**
 * Transition smoothing configuration
 */
export interface TransitionSmoothingConfig {
  /** Transition intensity (0-1, where 1 is immediate, 0 is very gradual) */
  intensity: number;
  /** Whether to acknowledge the transition to the user */
  acknowledge: boolean;
  /** Transition approach style */
  approach: 'seamless' | 'gradual' | 'bridged' | 'explicit';
  /** Which traits to prioritize in the transition */
  priorityTraits: string[];
  /** Custom transition message template */
  customTransitionTemplate?: string;
  /** Whether to maintain conversation continuity */
  maintainContinuity: boolean;
  /** Transition timing control */
  timing: {
    /** Pre-transition preparation messages count */
    preparationMessages: number;
    /** Post-transition stabilization messages count */
    stabilizationMessages: number;
  };
}

/**
 * Transition smoothing result
 */
export interface TransitionSmoothingResult {
  /** Smoothed transition prompt ready for use */
  smoothedPrompt: string;
  /** Transition bridging elements */
  bridgingElements: {
    /** Transition introduction (if applicable) */
    introduction?: string;
    /** Context bridging statements */
    contextBridge: string[];
    /** Trait transition explanations */
    traitTransitions: Array<{
      traitName: string;
      transitionExplanation: string;
    }>;
    /** Conversation continuity elements */
    continuityElements: string[];
  };
  /** Transition metadata */
  transitionMetadata: {
    /** Transition type applied */
    transitionType: 'seamless' | 'gradual' | 'bridged' | 'explicit';
    /** Smoothing intensity used */
    intensity: number;
    /** Traits that were smoothed */
    smoothedTraits: string[];
    /** Estimated user impact (0-1) */
    estimatedUserImpact: number;
    /** Smoothing quality score (0-1) */
    smoothingQuality: number;
  };
  /** User-facing transition message (if applicable) */
  userMessage?: string;
  /** Success indicators */
  success: {
    /** Whether transition was successfully smoothed */
    smoothed: boolean;
    /** Confidence in smoothing quality */
    confidence: number;
    /** Potential issues identified */
    potentialIssues: string[];
  };
  /** Processing metadata */
  metadata: {
    smoothedAt: Date;
    processingTime: number;
    smoothingVersion: string;
  };
}

/**
 * Trait transition strategy
 */
interface TraitTransitionStrategy {
  traitName: string;
  fromValue: string;
  toValue: string;
  transitionType: 'immediate' | 'gradual' | 'phased' | 'contextual';
  bridgingTechnique: 'explanation' | 'demonstration' | 'natural_evolution' | 'acknowledgment';
  priority: number;
}

/**
 * LangChain-based Personality Transition Smoother
 * 
 * Advanced service for creating smooth transitions between personalities
 * to maintain conversation continuity and user experience quality.
 * 
 * Key capabilities:
 * - Intelligent transition strategy selection
 * - Context-aware trait smoothing
 * - Conversation continuity preservation
 * - User impact minimization
 * - Adaptive transition timing
 * - Quality assessment and optimization
 */
@Injectable()
export class PersonalityTransitionSmootherService extends LangChainBaseService {
  private readonly transitionTemplates = new Map<string, PromptTemplate>();
  
  constructor(
    private readonly personalityService: PersonalityProfileService,
  ) {
    super('PersonalityTransitionSmootherService');
    this.initializeTransitionTemplates();
  }

  /**
   * Create smooth transition between two personalities
   */
  async createSmoothTransition(
    fromPersonalityId: string,
    toPersonalityId: string,
    originalPrompt: string,
    conversationHistory: BaseMessage[],
    config: TransitionSmoothingConfig
  ): Promise<TransitionSmoothingResult> {
    this.logExecution('createSmoothTransition', {
      fromPersonality: fromPersonalityId,
      toPersonality: toPersonalityId,
      approach: config.approach,
      intensity: config.intensity
    });

    const startTime = Date.now();

    try {
      // Get personality profiles
      const [fromPersonality, toPersonality] = await Promise.all([
        this.personalityService.findOne(fromPersonalityId),
        this.personalityService.findOne(toPersonalityId)
      ]);

      // Analyze trait transitions
      const traitStrategies = await this.createTracedRunnable(
        'analyzeTraitTransitions',
        () => this.analyzeTraitTransitions(fromPersonality, toPersonality, config)
      ).invoke({});

      // Generate bridging elements
      const bridgingElements = await this.createTracedRunnable(
        'generateBridgingElements',
        () => this.generateBridgingElements(
          fromPersonality,
          toPersonality,
          traitStrategies,
          conversationHistory,
          config
        )
      ).invoke({});

      // Create smoothed transition prompt
      const smoothedPrompt = await this.createTracedRunnable(
        'createTransitionPrompt',
        () => this.createTransitionPrompt(
          originalPrompt,
          bridgingElements,
          traitStrategies,
          toPersonality,
          config
        )
      ).invoke({});

      // Assess transition quality
      const qualityAssessment = await this.createTracedRunnable(
        'assessTransitionQuality',
        () => this.assessTransitionQuality(
          traitStrategies,
          bridgingElements,
          config
        )
      ).invoke({});

      // Generate user message if needed
      const userMessage = config.acknowledge ? 
        await this.generateUserTransitionMessage(
          fromPersonality,
          toPersonality,
          traitStrategies,
          config
        ) : undefined;

      const result: TransitionSmoothingResult = {
        smoothedPrompt,
        bridgingElements,
        transitionMetadata: {
          transitionType: config.approach,
          intensity: config.intensity,
          smoothedTraits: traitStrategies.map(s => s.traitName),
          estimatedUserImpact: this.estimateUserImpact(traitStrategies, config),
          smoothingQuality: qualityAssessment.quality
        },
        userMessage,
        success: {
          smoothed: true,
          confidence: qualityAssessment.confidence,
          potentialIssues: qualityAssessment.issues
        },
        metadata: {
          smoothedAt: new Date(),
          processingTime: Date.now() - startTime,
          smoothingVersion: '1.0.0'
        }
      };

      this.logger.debug('Smooth transition created', {
        fromPersonality: fromPersonality.name,
        toPersonality: toPersonality.name,
        approach: config.approach,
        smoothingQuality: qualityAssessment.quality,
        confidence: qualityAssessment.confidence
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create smooth transition', error);
      return this.createErrorTransition(originalPrompt, error, startTime);
    }
  }

  /**
   * Optimize transition configuration for specific personalities
   */
  async optimizeTransitionConfig(
    fromPersonalityId: string,
    toPersonalityId: string,
    conversationContext?: {
      messageCount: number;
      conversationDuration?: number;
      userEngagement?: 'high' | 'medium' | 'low';
      conversationTopic?: string;
    }
  ): Promise<TransitionSmoothingConfig> {
    this.logExecution('optimizeTransitionConfig', {
      fromPersonality: fromPersonalityId,
      toPersonality: toPersonalityId,
      hasContext: !!conversationContext
    });

    try {
      const [fromPersonality, toPersonality] = await Promise.all([
        this.personalityService.findOne(fromPersonalityId),
        this.personalityService.findOne(toPersonalityId)
      ]);

      // Calculate personality distance
      const personalityDistance = this.calculatePersonalityDistance(fromPersonality, toPersonality);
      
      // Determine optimal approach
      const approach = this.selectOptimalApproach(personalityDistance, conversationContext);
      
      // Calculate intensity
      const intensity = this.calculateOptimalIntensity(personalityDistance, conversationContext);
      
      // Identify priority traits
      const priorityTraits = this.identifyPriorityTraits(fromPersonality, toPersonality);
      
      // Determine timing
      const timing = this.calculateOptimalTiming(personalityDistance, conversationContext);

      const optimizedConfig: TransitionSmoothingConfig = {
        intensity,
        acknowledge: personalityDistance > 0.7 || approach === 'explicit',
        approach,
        priorityTraits,
        maintainContinuity: true,
        timing
      };

      this.logger.debug('Transition configuration optimized', {
        personalityDistance,
        approach,
        intensity,
        priorityTraitsCount: priorityTraits.length
      });

      return optimizedConfig;
    } catch (error) {
      this.logger.error('Failed to optimize transition configuration', error);
      // Return safe default configuration
      return {
        intensity: 0.5,
        acknowledge: false,
        approach: 'seamless',
        priorityTraits: [],
        maintainContinuity: true,
        timing: {
          preparationMessages: 1,
          stabilizationMessages: 2
        }
      };
    }
  }

  /**
   * Preview transition effects before execution
   */
  async previewTransitionEffects(
    fromPersonalityId: string,
    toPersonalityId: string,
    config: TransitionSmoothingConfig
  ): Promise<{
    traitChanges: Array<{
      traitName: string;
      fromValue: string;
      toValue: string;
      changeImpact: 'low' | 'medium' | 'high';
      userVisibility: 'hidden' | 'subtle' | 'noticeable' | 'obvious';
    }>;
    overallTransitionImpact: {
      continuityImpact: number; // 0-1, lower is better
      userExperienceImpact: number; // 0-1, lower is better
      effectivenessGain: number; // 0-1, higher is better
    };
    recommendations: string[];
  }> {
    this.logExecution('previewTransitionEffects', {
      fromPersonality: fromPersonalityId,
      toPersonality: toPersonalityId,
      approach: config.approach
    });

    try {
      const [fromPersonality, toPersonality] = await Promise.all([
        this.personalityService.findOne(fromPersonalityId),
        this.personalityService.findOne(toPersonalityId)
      ]);

      const traitStrategies = await this.analyzeTraitTransitions(fromPersonality, toPersonality, config);
      
      // Analyze trait changes
      const traitChanges = traitStrategies.map(strategy => ({
        traitName: strategy.traitName,
        fromValue: strategy.fromValue,
        toValue: strategy.toValue,
        changeImpact: this.assessTraitChangeImpact(strategy),
        userVisibility: this.assessUserVisibility(strategy, config)
      }));

      // Calculate overall impact
      const continuityImpact = this.calculateContinuityImpact(traitStrategies, config);
      const userExperienceImpact = this.calculateUserExperienceImpact(traitChanges, config);
      const effectivenessGain = this.calculateEffectivenessGain(fromPersonality, toPersonality);

      // Generate recommendations
      const recommendations = this.generateTransitionRecommendations(
        traitChanges,
        { continuityImpact, userExperienceImpact, effectivenessGain },
        config
      );

      return {
        traitChanges,
        overallTransitionImpact: {
          continuityImpact,
          userExperienceImpact,
          effectivenessGain
        },
        recommendations
      };
    } catch (error) {
      this.logger.error('Failed to preview transition effects', error);
      return {
        traitChanges: [],
        overallTransitionImpact: {
          continuityImpact: 0.5,
          userExperienceImpact: 0.5,
          effectivenessGain: 0.5
        },
        recommendations: ['Unable to preview transition effects due to analysis error']
      };
    }
  }

  // Private helper methods

  /**
   * Analyze trait transitions between personalities
   */
  private async analyzeTraitTransitions(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile,
    config: TransitionSmoothingConfig
  ): Promise<TraitTransitionStrategy[]> {
    const strategies: TraitTransitionStrategy[] = [];

    // Analyze each trait in the target personality
    for (const toTrait of toPersonality.traits) {
      const fromTrait = fromPersonality.traits.find(t => t.name === toTrait.name);
      
      if (!fromTrait || fromTrait.value !== toTrait.value) {
        const strategy: TraitTransitionStrategy = {
          traitName: toTrait.name,
          fromValue: fromTrait?.value || 'undefined',
          toValue: toTrait.value,
          transitionType: this.determineTransitionType(fromTrait, toTrait, config),
          bridgingTechnique: this.selectBridgingTechnique(fromTrait, toTrait, config),
          priority: this.calculateTraitPriority(toTrait.name, config.priorityTraits)
        };
        
        strategies.push(strategy);
      }
    }

    // Sort by priority
    return strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Generate bridging elements for smooth transition
   */
  private async generateBridgingElements(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile,
    traitStrategies: TraitTransitionStrategy[],
    conversationHistory: BaseMessage[],
    config: TransitionSmoothingConfig
  ): Promise<TransitionSmoothingResult['bridgingElements']> {
    const contextBridge: string[] = [];
    const traitTransitions: Array<{ traitName: string; transitionExplanation: string }> = [];
    const continuityElements: string[] = [];

    // Generate context bridging
    if (config.maintainContinuity && conversationHistory.length > 0) {
      contextBridge.push('Building on our previous discussion');
      contextBridge.push('Continuing with your request');
    }

    // Generate trait transition explanations
    for (const strategy of traitStrategies.slice(0, 3)) { // Limit to top 3 traits
      const explanation = await this.generateTraitTransitionExplanation(strategy, config);
      traitTransitions.push({
        traitName: strategy.traitName,
        transitionExplanation: explanation
      });
    }

    // Generate continuity elements
    if (config.approach !== 'explicit') {
      continuityElements.push('Maintaining our conversation flow');
      continuityElements.push('Adapting my approach to better assist you');
    }

    // Generate introduction if needed
    let introduction: string | undefined;
    if (config.acknowledge && config.approach === 'bridged') {
      introduction = `I'm adjusting my approach to better help with your ${this.inferTopicFromHistory(conversationHistory)} needs.`;
    }

    return {
      introduction,
      contextBridge,
      traitTransitions,
      continuityElements
    };
  }

  /**
   * Create transition prompt with smoothing
   */
  private async createTransitionPrompt(
    originalPrompt: string,
    bridgingElements: TransitionSmoothingResult['bridgingElements'],
    traitStrategies: TraitTransitionStrategy[],
    toPersonality: PersonalityProfile,
    config: TransitionSmoothingConfig
  ): Promise<string> {
    const template = this.getTransitionTemplate(config.approach);
    
    const templateVariables = {
      original_prompt: originalPrompt,
      personality_name: toPersonality.name,
      personality_description: toPersonality.description,
      introduction: bridgingElements.introduction || '',
      context_bridge: bridgingElements.contextBridge.join('. '),
      trait_transitions: bridgingElements.traitTransitions
        .map(t => t.transitionExplanation)
        .join('. '),
      continuity_elements: bridgingElements.continuityElements.join('. '),
      transition_intensity: config.intensity.toString(),
      maintain_continuity: config.maintainContinuity.toString(),
      // Add trait-specific variables
      ...this.buildTraitVariables(toPersonality)
    };

    return await template.format(templateVariables);
  }

  /**
   * Assess transition quality
   */
  private async assessTransitionQuality(
    traitStrategies: TraitTransitionStrategy[],
    bridgingElements: TransitionSmoothingResult['bridgingElements'],
    config: TransitionSmoothingConfig
  ): Promise<{ quality: number; confidence: number; issues: string[] }> {
    let quality = 0.7; // Base quality
    let confidence = 0.8; // Base confidence
    const issues: string[] = [];

    // Assess trait transition quality
    const highImpactTransitions = traitStrategies.filter(s => 
      this.isHighImpactTransition(s.fromValue, s.toValue)
    );
    
    if (highImpactTransitions.length > 3) {
      quality -= 0.2;
      issues.push('Multiple high-impact trait transitions may affect conversation flow');
    }

    // Assess bridging quality
    if (bridgingElements.contextBridge.length === 0 && config.maintainContinuity) {
      quality -= 0.15;
      issues.push('Limited context bridging for continuity maintenance');
    }

    // Assess configuration alignment
    if (config.intensity > 0.8 && config.approach === 'seamless') {
      quality -= 0.1;
      confidence -= 0.1;
      issues.push('High intensity may conflict with seamless approach');
    }

    // Bonus for good practices
    if (traitStrategies.length <= 5 && config.priorityTraits.length > 0) {
      quality += 0.1; // Focused transition
    }

    return {
      quality: Math.max(0, Math.min(1, quality)),
      confidence: Math.max(0, Math.min(1, confidence)),
      issues
    };
  }

  /**
   * Calculate personality distance between two personalities
   */
  private calculatePersonalityDistance(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile
  ): number {
    let totalDifference = 0;
    let traitCount = 0;

    // Compare traits
    for (const toTrait of toPersonality.traits) {
      const fromTrait = fromPersonality.traits.find(t => t.name === toTrait.name);
      if (fromTrait) {
        const difference = this.calculateTraitDistance(fromTrait, toTrait);
        totalDifference += difference * toTrait.weight;
        traitCount++;
      } else {
        totalDifference += 1.0 * toTrait.weight; // Max difference for missing trait
        traitCount++;
      }
    }

    // Category difference
    const categoryDifference = fromPersonality.category !== toPersonality.category ? 0.3 : 0;
    
    return traitCount > 0 ? 
      (totalDifference / traitCount) + categoryDifference : 
      categoryDifference;
  }

  /**
   * Calculate trait distance
   */
  private calculateTraitDistance(trait1: PersonalityTrait, trait2: PersonalityTrait): number {
    if (trait1.value === trait2.value) return 0;

    // Define trait value hierarchies for distance calculation
    const traitHierarchies: Record<string, string[]> = {
      expertise_level: ['beginner', 'intermediate', 'advanced', 'expert'],
      formality: ['casual', 'moderate', 'formal'],
      verbosity: ['concise', 'moderate', 'detailed'],
      creativity: ['low', 'moderate', 'high'],
      empathy: ['low', 'moderate', 'high'],
      precision: ['low', 'moderate', 'high']
    };

    const hierarchy = traitHierarchies[trait1.name];
    if (hierarchy) {
      const index1 = hierarchy.indexOf(trait1.value);
      const index2 = hierarchy.indexOf(trait2.value);
      if (index1 !== -1 && index2 !== -1) {
        return Math.abs(index1 - index2) / (hierarchy.length - 1);
      }
    }

    // Default: different values = maximum distance
    return 1.0;
  }

  /**
   * Select optimal transition approach
   */
  private selectOptimalApproach(
    personalityDistance: number,
    conversationContext?: any
  ): TransitionSmoothingConfig['approach'] {
    if (personalityDistance < 0.3) {
      return 'seamless';
    } else if (personalityDistance < 0.6) {
      return 'gradual';
    } else if (personalityDistance < 0.8) {
      return 'bridged';
    } else {
      return 'explicit';
    }
  }

  /**
   * Calculate optimal transition intensity
   */
  private calculateOptimalIntensity(
    personalityDistance: number,
    conversationContext?: any
  ): number {
    let baseIntensity = personalityDistance * 0.7; // Base on personality distance

    // Adjust based on conversation context
    if (conversationContext?.messageCount && conversationContext.messageCount > 10) {
      baseIntensity *= 0.8; // More gradual for longer conversations
    }

    if (conversationContext?.userEngagement === 'high') {
      baseIntensity *= 1.2; // Can be more intense for engaged users
    } else if (conversationContext?.userEngagement === 'low') {
      baseIntensity *= 0.7; // More subtle for less engaged users
    }

    return Math.max(0.1, Math.min(1.0, baseIntensity));
  }

  /**
   * Identify priority traits for transition
   */
  private identifyPriorityTraits(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile
  ): string[] {
    const priorityTraits: string[] = [];
    
    // Core traits that affect user experience most
    const coreTraits = ['communication_style', 'tone', 'expertise_level', 'formality'];
    
    for (const traitName of coreTraits) {
      const fromTrait = fromPersonality.traits.find(t => t.name === traitName);
      const toTrait = toPersonality.traits.find(t => t.name === traitName);
      
      if (fromTrait && toTrait && fromTrait.value !== toTrait.value) {
        priorityTraits.push(traitName);
      }
    }

    return priorityTraits;
  }

  /**
   * Calculate optimal timing
   */
  private calculateOptimalTiming(
    personalityDistance: number,
    conversationContext?: any
  ): TransitionSmoothingConfig['timing'] {
    const basePreparation = Math.ceil(personalityDistance * 2);
    const baseStabilization = Math.ceil(personalityDistance * 3);

    return {
      preparationMessages: Math.max(1, Math.min(3, basePreparation)),
      stabilizationMessages: Math.max(1, Math.min(5, baseStabilization))
    };
  }

  /**
   * Determine transition type for a trait
   */
  private determineTransitionType(
    fromTrait: PersonalityTrait | undefined,
    toTrait: PersonalityTrait,
    config: TransitionSmoothingConfig
  ): TraitTransitionStrategy['transitionType'] {
    if (config.intensity > 0.8) {
      return 'immediate';
    }

    if (config.priorityTraits.includes(toTrait.name)) {
      return config.intensity > 0.6 ? 'phased' : 'gradual';
    }

    return 'contextual';
  }

  /**
   * Select bridging technique
   */
  private selectBridgingTechnique(
    fromTrait: PersonalityTrait | undefined,
    toTrait: PersonalityTrait,
    config: TransitionSmoothingConfig
  ): TraitTransitionStrategy['bridgingTechnique'] {
    if (config.approach === 'explicit') {
      return 'acknowledgment';
    }

    if (this.isHighImpactTransition(fromTrait?.value || 'undefined', toTrait.value)) {
      return config.acknowledge ? 'explanation' : 'natural_evolution';
    }

    return 'demonstration';
  }

  /**
   * Calculate trait priority
   */
  private calculateTraitPriority(traitName: string, priorityTraits: string[]): number {
    const explicitPriority = priorityTraits.indexOf(traitName);
    if (explicitPriority !== -1) {
      return 1.0 - (explicitPriority / priorityTraits.length);
    }

    // Default priorities based on user impact
    const defaultPriorities: Record<string, number> = {
      communication_style: 0.9,
      tone: 0.8,
      expertise_level: 0.7,
      formality: 0.6,
      verbosity: 0.5,
      empathy: 0.4,
      creativity: 0.3,
      precision: 0.2
    };

    return defaultPriorities[traitName] || 0.1;
  }

  /**
   * Generate trait transition explanation
   */
  private async generateTraitTransitionExplanation(
    strategy: TraitTransitionStrategy,
    config: TransitionSmoothingConfig
  ): Promise<string> {
    switch (strategy.bridgingTechnique) {
      case 'explanation':
        return `Adjusting ${strategy.traitName} from ${strategy.fromValue} to ${strategy.toValue} for better assistance`;
      case 'demonstration':
        return `Demonstrating ${strategy.toValue} ${strategy.traitName} approach`;
      case 'natural_evolution':
        return `Naturally evolving to a more ${strategy.toValue} ${strategy.traitName}`;
      case 'acknowledgment':
        return `Explicitly switching to ${strategy.toValue} ${strategy.traitName}`;
      default:
        return `Transitioning ${strategy.traitName}`;
    }
  }

  /**
   * Build trait-specific template variables
   */
  private buildTraitVariables(personality: PersonalityProfile): Record<string, string> {
    const variables: Record<string, string> = {};
    
    personality.traits.forEach(trait => {
      variables[trait.name] = trait.value;
    });

    return variables;
  }

  /**
   * Initialize transition templates
   */
  private initializeTransitionTemplates(): void {
    // Seamless transition template
    this.transitionTemplates.set('seamless', PromptTemplate.fromTemplate(`
You are {personality_name}. {personality_description}

{context_bridge} {continuity_elements}

{original_prompt}

Respond naturally as {personality_name} with your characteristic {communication_style} style, {tone} tone, and {expertise_level} expertise level.
`));

    // Gradual transition template  
    this.transitionTemplates.set('gradual', PromptTemplate.fromTemplate(`
{introduction}

You are {personality_name}. {personality_description}

{context_bridge} {trait_transitions} {continuity_elements}

{original_prompt}

Respond as {personality_name}, gradually embodying your traits while maintaining conversation flow.
`));

    // Bridged transition template
    this.transitionTemplates.set('bridged', PromptTemplate.fromTemplate(`
{introduction}

Transitioning to {personality_name} personality approach:
{personality_description}

{context_bridge}
{trait_transitions}

{original_prompt}

{continuity_elements} Respond as {personality_name} with appropriate {communication_style} style and {tone} tone.
`));

    // Explicit transition template
    this.transitionTemplates.set('explicit', PromptTemplate.fromTemplate(`
{introduction}

I am now operating as {personality_name}:
{personality_description}

Key characteristics:
{trait_transitions}

{context_bridge}

{original_prompt}

Responding explicitly as {personality_name} with full personality traits active.
`));
  }

  /**
   * Get transition template
   */
  private getTransitionTemplate(approach: string): PromptTemplate {
    return this.transitionTemplates.get(approach) || this.transitionTemplates.get('seamless')!;
  }

  /**
   * Check if transition is high impact
   */
  private isHighImpactTransition(fromValue: string, toValue: string): boolean {
    const highImpactPairs = [
      ['casual', 'formal'],
      ['beginner', 'expert'],
      ['concise', 'detailed'],
      ['low', 'high']
    ];

    return highImpactPairs.some(([from, to]) => 
      (fromValue === from && toValue === to) || 
      (fromValue === to && toValue === from)
    );
  }

  /**
   * Estimate user impact of transition
   */
  private estimateUserImpact(
    traitStrategies: TraitTransitionStrategy[],
    config: TransitionSmoothingConfig
  ): number {
    let impact = 0;

    // High-impact transitions contribute more
    traitStrategies.forEach(strategy => {
      if (this.isHighImpactTransition(strategy.fromValue, strategy.toValue)) {
        impact += 0.3;
      } else {
        impact += 0.1;
      }
    });

    // Adjust based on approach
    switch (config.approach) {
      case 'seamless':
        impact *= 0.5;
        break;
      case 'gradual':
        impact *= 0.7;
        break;
      case 'bridged':
        impact *= 0.9;
        break;
      case 'explicit':
        impact *= 1.2;
        break;
    }

    return Math.min(1.0, impact);
  }

  /**
   * Generate user transition message
   */
  private async generateUserTransitionMessage(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile,
    traitStrategies: TraitTransitionStrategy[],
    config: TransitionSmoothingConfig
  ): Promise<string> {
    if (config.approach === 'explicit') {
      return `I'm now switching to my ${toPersonality.name} personality to better assist you.`;
    } else if (config.approach === 'bridged') {
      return `Adapting my approach to better help with your current needs.`;
    } else {
      return `Adjusting my communication style for optimal assistance.`;
    }
  }

  /**
   * Infer topic from conversation history
   */
  private inferTopicFromHistory(history: BaseMessage[]): string {
    // Simplified topic inference
    if (history.length === 0) return 'current';
    
    const recentContent = history.slice(-3)
      .map(msg => typeof msg.content === 'string' ? msg.content : '')
      .join(' ')
      .toLowerCase();

    if (recentContent.includes('code') || recentContent.includes('programming')) {
      return 'technical';
    } else if (recentContent.includes('creative') || recentContent.includes('design')) {
      return 'creative';
    } else if (recentContent.includes('business') || recentContent.includes('professional')) {
      return 'professional';
    }

    return 'current';
  }

  /**
   * Helper methods for transition preview
   */
  private assessTraitChangeImpact(strategy: TraitTransitionStrategy): 'low' | 'medium' | 'high' {
    if (this.isHighImpactTransition(strategy.fromValue, strategy.toValue)) {
      return 'high';
    } else if (strategy.priority > 0.7) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private assessUserVisibility(
    strategy: TraitTransitionStrategy, 
    config: TransitionSmoothingConfig
  ): 'hidden' | 'subtle' | 'noticeable' | 'obvious' {
    if (config.approach === 'explicit') return 'obvious';
    if (config.approach === 'bridged') return 'noticeable';
    if (this.isHighImpactTransition(strategy.fromValue, strategy.toValue)) return 'noticeable';
    if (config.intensity > 0.8) return 'noticeable';
    return 'subtle';
  }

  private calculateContinuityImpact(
    strategies: TraitTransitionStrategy[],
    config: TransitionSmoothingConfig
  ): number {
    const highImpactCount = strategies.filter(s => 
      this.isHighImpactTransition(s.fromValue, s.toValue)
    ).length;
    
    let impact = highImpactCount / Math.max(strategies.length, 1);
    
    if (config.approach === 'explicit') impact *= 1.5;
    if (config.intensity > 0.8) impact *= 1.3;
    
    return Math.min(1.0, impact);
  }

  private calculateUserExperienceImpact(
    traitChanges: any[],
    config: TransitionSmoothingConfig
  ): number {
    const noticeableChanges = traitChanges.filter(c => 
      c.userVisibility === 'noticeable' || c.userVisibility === 'obvious'
    ).length;
    
    return Math.min(1.0, noticeableChanges / 5); // Normalize to 0-1
  }

  private calculateEffectivenessGain(
    fromPersonality: PersonalityProfile,
    toPersonality: PersonalityProfile
  ): number {
    // Simplified effectiveness calculation based on trait improvements
    const improvementCount = toPersonality.traits.filter(toTrait => {
      const fromTrait = fromPersonality.traits.find(t => t.name === toTrait.name);
      return !fromTrait || toTrait.weight > fromTrait.weight;
    }).length;
    
    return Math.min(1.0, improvementCount / Math.max(toPersonality.traits.length, 1));
  }

  private generateTransitionRecommendations(
    traitChanges: any[],
    overallImpact: any,
    config: TransitionSmoothingConfig
  ): string[] {
    const recommendations: string[] = [];

    if (overallImpact.continuityImpact > 0.7) {
      recommendations.push('Consider using a more gradual approach to maintain conversation flow');
    }

    if (overallImpact.userExperienceImpact > 0.6) {
      recommendations.push('High user visibility - consider acknowledging the transition');
    }

    if (overallImpact.effectivenessGain > 0.8) {
      recommendations.push('High effectiveness gain expected - transition is recommended');
    }

    const highImpactChanges = traitChanges.filter(c => c.changeImpact === 'high');
    if (highImpactChanges.length > 2) {
      recommendations.push('Multiple high-impact trait changes - consider phased implementation');
    }

    return recommendations;
  }

  /**
   * Create error transition result
   */
  private createErrorTransition(
    originalPrompt: string,
    error: any,
    startTime: number
  ): TransitionSmoothingResult {
    return {
      smoothedPrompt: originalPrompt,
      bridgingElements: {
        contextBridge: [],
        traitTransitions: [],
        continuityElements: []
      },
      transitionMetadata: {
        transitionType: 'seamless',
        intensity: 0.5,
        smoothedTraits: [],
        estimatedUserImpact: 0,
        smoothingQuality: 0
      },
      success: {
        smoothed: false,
        confidence: 0,
        potentialIssues: [error instanceof Error ? error.message : 'Unknown error']
      },
      metadata: {
        smoothedAt: new Date(),
        processingTime: Date.now() - startTime,
        smoothingVersion: '1.0.0'
      }
    };
  }
}