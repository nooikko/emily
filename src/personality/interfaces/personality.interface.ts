import type { FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import type { PersonalityExample, PersonalityPromptTemplate, PersonalityTrait } from '../entities/personality-profile.entity';

/**
 * Interface for personality switching context
 */
export interface PersonalitySwitchContext {
  /** Previous personality ID */
  previousPersonalityId?: string;
  /** Current conversation context */
  conversationContext?: string;
  /** User preferences or overrides */
  userPreferences?: Record<string, any>;
  /** Metadata about the switch */
  switchMetadata?: Record<string, any>;
}

/**
 * Interface for personality validation result
 */
export interface PersonalityValidationResult {
  /** Whether the personality is valid */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Interface for personality template compilation result
 */
export interface CompiledPersonalityTemplate {
  /** Compiled LangChain PromptTemplate */
  systemTemplate: PromptTemplate;
  /** Compiled FewShotPromptTemplate if examples exist */
  fewShotTemplate?: FewShotPromptTemplate;
  /** User message template for conversation flow */
  userTemplate?: PromptTemplate;
  /** Assistant template for response formatting */
  assistantTemplate?: PromptTemplate;
  /** Template metadata */
  metadata: {
    personalityId: string;
    personalityName: string;
    compiledAt: Date;
    templateVersion: number;
  };
}

/**
 * Interface for personality search and filtering
 */
export interface PersonalitySearchCriteria {
  /** Search by name or description */
  query?: string;
  /** Filter by category */
  category?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by trait values */
  traits?: Record<string, string>;
  /** Include/exclude system personalities */
  includeSystemPersonalities?: boolean;
  /** Include/exclude active personalities */
  includeActiveOnly?: boolean;
}

/**
 * Interface for personality usage analytics
 */
export interface PersonalityUsageStats {
  /** Personality ID */
  personalityId: string;
  /** Total times used */
  usageCount: number;
  /** Last used timestamp */
  lastUsedAt: Date;
  /** Average session duration */
  averageSessionDuration?: number;
  /** User satisfaction rating */
  satisfactionRating?: number;
  /** Common use cases */
  commonUseCases: string[];
}

/**
 * Interface for personality context injection
 */
export interface PersonalityContext {
  /** Current personality profile */
  personality: {
    id: string;
    name: string;
    traits: PersonalityTrait[];
    category: string;
    tags: string[];
  };
  /** Context variables for template rendering */
  contextVariables: Record<string, any>;
  /** Conversation history relevant to personality */
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  /** User preferences affecting personality behavior */
  userPreferences?: Record<string, any>;
}

/**
 * Interface for personality template caching
 */
export interface PersonalityTemplateCache {
  /** Cache key based on personality ID and version */
  key: string;
  /** Compiled template */
  template: CompiledPersonalityTemplate;
  /** Cache expiration timestamp */
  expiresAt: Date;
  /** Cache hit count */
  hitCount: number;
}

/**
 * Interface for personality recommendation
 */
export interface PersonalityRecommendation {
  /** Recommended personality */
  personalityId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for recommendation */
  reason: string;
  /** Relevant traits that match user context */
  matchingTraits: string[];
  /** Usage-based recommendation factors */
  usageFactors?: {
    popularityScore: number;
    successRate: number;
    userFeedback: number;
  };
}

/**
 * Interface for personality template factory
 */
export interface PersonalityTemplateFactory {
  /**
   * Create a LangChain PromptTemplate from personality configuration
   */
  createPromptTemplate(template: PersonalityPromptTemplate): Promise<PromptTemplate>;

  /**
   * Create a FewShotPromptTemplate with personality examples
   */
  createFewShotTemplate(template: PersonalityPromptTemplate, examples: PersonalityExample[]): Promise<FewShotPromptTemplate>;

  /**
   * Validate template syntax and variables
   */
  validateTemplate(template: PersonalityPromptTemplate): PersonalityValidationResult;

  /**
   * Optimize template for performance
   */
  optimizeTemplate(template: PersonalityPromptTemplate): PersonalityPromptTemplate;
}

/**
 * Interface for personality service operations
 */
export interface PersonalityServiceOperations {
  /**
   * Switch to a different personality
   */
  switchPersonality(personalityId: string, context?: PersonalitySwitchContext): Promise<CompiledPersonalityTemplate>;

  /**
   * Get current active personality
   */
  getCurrentPersonality(): Promise<CompiledPersonalityTemplate | null>;

  /**
   * Recommend personalities based on context
   */
  recommendPersonalities(context: string, limit?: number): Promise<PersonalityRecommendation[]>;

  /**
   * Get personality usage analytics
   */
  getUsageStats(personalityId: string): Promise<PersonalityUsageStats>;

  /**
   * Validate personality configuration
   */
  validatePersonality(personalityId: string): Promise<PersonalityValidationResult>;
}

/**
 * Type for personality categories
 */
export type PersonalityCategory =
  | 'assistant'
  | 'creative'
  | 'analytical'
  | 'educational'
  | 'professional'
  | 'casual'
  | 'technical'
  | 'research'
  | 'support'
  | 'custom';

/**
 * Type for personality trait names
 */
export type PersonalityTraitName =
  | 'tone'
  | 'formality'
  | 'expertise_level'
  | 'communication_style'
  | 'creativity'
  | 'empathy'
  | 'precision'
  | 'verbosity'
  | 'humor'
  | 'patience'
  | 'assertiveness'
  | 'technical_depth'
  | 'example_usage'
  | 'response_length'
  | 'explanation_style';
