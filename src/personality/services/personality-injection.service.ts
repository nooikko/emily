import { ConditionalPromptSelector } from '@langchain/core/example_selectors';
import type { BaseLanguageModelCallOptions, BaseLanguageModelInterface } from '@langchain/core/language_models/base';
import { ChatPromptTemplate, MessagesPlaceholder, PipelinePromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import type { CompiledPersonalityTemplate, PersonalityContext, PersonalityValidationResult } from '../interfaces/personality.interface';
import { PersonalityProfileService } from './personality-profile.service';
import { PersonalityTemplateService } from './personality-template.service';

/**
 * Types for personality injection
 */
export interface PersonalityInjectionContext {
  /** Original conversation prompt */
  originalPrompt: string;
  /** Personality profile to inject */
  personalityId?: string;
  /** Context variables for template rendering */
  contextVariables: Record<string, any>;
  /** Conversation history for context-aware injection */
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  /** User preferences affecting personality behavior */
  userPreferences?: Record<string, any>;
  /** Dynamic conditions for conditional prompting */
  conditions?: Record<string, any>;
}

export interface InjectedPromptResult {
  /** The personality-enhanced prompt ready for LLM consumption */
  enhancedPrompt: string;
  /** Compiled personality template used */
  personalityTemplate: CompiledPersonalityTemplate;
  /** Cache key for this injection result */
  cacheKey: string;
  /** Metadata about the injection process */
  injectionMetadata: {
    personalityId: string;
    personalityName: string;
    injectionType: 'system' | 'context_merge' | 'conditional';
    templateVariablesUsed: string[];
    compiledAt: Date;
  };
}

export interface ConditionalPersonalityConfig {
  /** Default personality if no conditions match */
  defaultPersonalityId: string;
  /** Conditional rules for personality selection */
  conditionalRules: Array<{
    /** Function to evaluate condition - adapted for LangChain ConditionalPromptSelector */
    condition: (llm: BaseLanguageModelInterface<any, BaseLanguageModelCallOptions>) => boolean;
    /** Personality ID to use if condition is true */
    personalityId: string;
    /** Optional priority (higher = checked first) */
    priority?: number;
  }>;
}

/**
 * Dynamic Personality Injection Service
 *
 * Implements advanced LangChain-based personality injection using:
 * - ConditionalPromptSelector for dynamic personality switching
 * - PipelinePromptTemplate for complex prompt composition
 * - ChatPromptTemplate for conversational personality enhancement
 * - MessagesPlaceholder for context-aware conversation flow
 * - Comprehensive caching for performance optimization
 *
 * This service transforms standard conversation prompts into personality-aware
 * prompts that maintain consistent character traits throughout interactions.
 */
@Injectable()
export class PersonalityInjectionService extends LangChainBaseService {
  private readonly injectionCache = new Map<string, InjectedPromptResult>();
  private readonly conditionalSelectors = new Map<string, ConditionalPromptSelector>();
  private readonly cacheMaxSize = 200;

  constructor(
    private readonly personalityService: PersonalityProfileService,
    private readonly templateService: PersonalityTemplateService,
  ) {
    super('PersonalityInjectionService');
  }

  /**
   * Inject personality traits into a conversation prompt
   * Main entry point for dynamic personality enhancement
   */
  async injectPersonality(context: PersonalityInjectionContext): Promise<InjectedPromptResult> {
    this.logExecution('injectPersonality', {
      personalityId: context.personalityId,
      hasConversationHistory: !!context.conversationHistory,
      originalPromptLength: context.originalPrompt.length,
    });

    // Generate cache key
    const cacheKey = this.generateInjectionCacheKey(context);

    // Check cache first
    const cached = this.getFromInjectionCache(cacheKey);
    if (cached) {
      this.logger.debug('Using cached personality injection', { cacheKey });
      return cached;
    }

    // Determine personality to use (conditional vs explicit)
    const personalityId = await this.selectPersonality(context);

    // Get and compile personality template
    const personality = await this.personalityService.findOne(personalityId);
    const compiledTemplate = await this.templateService.compilePersonalityTemplates(personality);

    // Create enhanced prompt based on injection strategy
    const enhancedPrompt = await this.createTracedRunnable(
      'enhancePrompt',
      async () => this.enhancePromptWithPersonality(context, compiledTemplate),
      { personalityId, injectionType: this.determineInjectionType(context) },
    ).invoke({});

    // Create result
    const result: InjectedPromptResult = {
      enhancedPrompt,
      personalityTemplate: compiledTemplate,
      cacheKey,
      injectionMetadata: {
        personalityId: personality.id,
        personalityName: personality.name,
        injectionType: this.determineInjectionType(context),
        templateVariablesUsed: this.extractUsedVariables(context.contextVariables),
        compiledAt: new Date(),
      },
    };

    // Cache the result
    this.addToInjectionCache(cacheKey, result);

    return result;
  }

  /**
   * Create a ConditionalPromptSelector for dynamic personality switching
   * Enables context-aware personality selection during conversations
   */
  async createConditionalPersonalitySelector(config: ConditionalPersonalityConfig): Promise<ConditionalPromptSelector> {
    this.logExecution('createConditionalPersonalitySelector', {
      rulesCount: config.conditionalRules.length,
      defaultPersonality: config.defaultPersonalityId,
    });

    // Get default personality template
    const defaultPersonality = await this.personalityService.findOne(config.defaultPersonalityId);
    const defaultTemplate = await this.templateService.compilePersonalityTemplates(defaultPersonality);

    // Create conditional pairs with proper LangChain typing
    const conditionalPairs: Array<[(llm: BaseLanguageModelInterface<any, BaseLanguageModelCallOptions>) => boolean, PromptTemplate]> = [];

    // Sort rules by priority (higher first)
    const sortedRules = config.conditionalRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of sortedRules) {
      const personality = await this.personalityService.findOne(rule.personalityId);
      const template = await this.templateService.compilePersonalityTemplates(personality);

      conditionalPairs.push([rule.condition, template.systemTemplate]);
    }

    // Create ConditionalPromptSelector
    const selector = new ConditionalPromptSelector(defaultTemplate.systemTemplate, conditionalPairs);

    // Cache selector for reuse
    const selectorKey = `conditional_${config.defaultPersonalityId}_${Date.now()}`;
    this.conditionalSelectors.set(selectorKey, selector);

    return selector;
  }

  /**
   * Merge personality context with conversation prompts
   * Uses PipelinePromptTemplate for sophisticated prompt composition
   */
  async mergePersonalityContext(personalityId: string, conversationPrompt: string, context: PersonalityContext): Promise<string> {
    this.logExecution('mergePersonalityContext', {
      personalityId,
      hasConversationHistory: !!context.conversationHistory,
    });

    const personality = await this.personalityService.findOne(personalityId);
    const compiledTemplate = await this.templateService.compilePersonalityTemplates(personality);

    // Build comprehensive context variables
    const mergedVariables = {
      // Personality-specific variables
      personality_name: personality.name,
      personality_description: personality.description,
      personality_category: personality.category,
      ...this.buildTraitVariables(personality),

      // Context variables
      ...context.contextVariables,

      // Conversation-specific variables
      user_message: conversationPrompt,
      conversation_context: this.formatConversationHistory(context.conversationHistory),
      user_preferences: JSON.stringify(context.userPreferences || {}),
    };

    // Create individual prompt templates for composition
    const personalityTemplate = PromptTemplate.fromTemplate(compiledTemplate.systemTemplate.template);
    const conversationTemplate = PromptTemplate.fromTemplate('Previous conversation: {conversation_context}\nUser preferences: {user_preferences}');
    const userTemplate = PromptTemplate.fromTemplate('Current user message: {user_message}');

    // Create pipeline manually since PipelinePromptTemplate.fromTemplates may not exist
    const pipelineTemplate = new PipelinePromptTemplate({
      pipelinePrompts: [
        {
          name: 'personality_context',
          prompt: personalityTemplate,
        },
        {
          name: 'conversation_setup',
          prompt: conversationTemplate,
        },
        {
          name: 'user_interaction',
          prompt: userTemplate,
        },
      ],
      finalPrompt: PromptTemplate.fromTemplate(
        '{personality_context}\n\n{conversation_setup}\n\n{user_interaction}\n\nRespond as {personality_name} with {communication_style} tone:',
      ),
    });

    // Format the complete prompt
    const finalPrompt = await pipelineTemplate.format(mergedVariables);

    this.logger.debug('Personality context merged successfully', {
      personalityId,
      promptLength: finalPrompt.length,
      variablesCount: Object.keys(mergedVariables).length,
    });

    return finalPrompt;
  }

  /**
   * Create personality-aware ChatPromptTemplate for conversational flows
   * Integrates MessagesPlaceholder for dynamic conversation management
   */
  async createPersonalityChatTemplate(personalityId: string): Promise<ChatPromptTemplate> {
    this.logExecution('createPersonalityChatTemplate', { personalityId });

    const personality = await this.personalityService.findOne(personalityId);
    const compiledTemplate = await this.templateService.compilePersonalityTemplates(personality);

    // Extract personality system prompt
    const systemPrompt = compiledTemplate.systemTemplate.template;

    // Build trait-specific instructions
    const traitInstructions = personality.traits.map((trait) => `- ${trait.name}: ${trait.value} (intensity: ${trait.weight})`).join('\n');

    // Create comprehensive system message with personality injection
    const enhancedSystemPrompt = `${systemPrompt}

**Personality Configuration:**
Name: {personality_name}
Category: {personality_category}
Communication Style: {communication_style}
Tone: {tone}

**Personality Traits:**
${traitInstructions}

**Instructions:**
- Maintain consistent personality traits throughout the conversation
- Adapt your communication style based on the user's context and preferences
- Use examples from your personality profile when relevant
- Stay in character while being helpful and informative

**Few-Shot Examples:**
${this.formatFewShotExamples(personality.getFewShotExamples())}`;

    // Create ChatPromptTemplate with MessagesPlaceholder for conversation flow
    const chatTemplate = ChatPromptTemplate.fromMessages([
      ['system', enhancedSystemPrompt],
      new MessagesPlaceholder('conversation_history'),
      ['human', '{user_input}'],
    ]);

    this.logger.debug('Personality chat template created', {
      personalityId,
      personalityName: personality.name,
      traitsCount: personality.traits.length,
      examplesCount: personality.examples.length,
    });

    return chatTemplate;
  }

  /**
   * Generate personality-aware prompt with conditional logic
   * Supports complex business rules for personality selection
   */
  async generateConditionalPersonalityPrompt(
    context: PersonalityInjectionContext,
    conditionalConfig: ConditionalPersonalityConfig,
  ): Promise<InjectedPromptResult> {
    this.logExecution('generateConditionalPersonalityPrompt', {
      rulesCount: conditionalConfig.conditionalRules.length,
    });

    // Create or get cached conditional selector
    const selector = await this.createConditionalPersonalitySelector(conditionalConfig);

    // Select appropriate prompt based on context
    const _selectedPrompt = await selector.getPromptAsync(context as any);

    // Enhance the selected prompt with full personality injection
    const enhancedContext = { ...context, personalityId: undefined }; // Let selector decide
    return await this.injectPersonality(enhancedContext);
  }

  /**
   * Validate personality injection configuration
   */
  async validateInjectionContext(context: PersonalityInjectionContext): Promise<PersonalityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!context.originalPrompt?.trim()) {
      errors.push('Original prompt is required');
    }

    if (!context.contextVariables || Object.keys(context.contextVariables).length === 0) {
      warnings.push('No context variables provided - personality injection may be limited');
    }

    // Personality validation
    if (context.personalityId) {
      try {
        const personality = await this.personalityService.findOne(context.personalityId);
        const personalityValidation = await this.personalityService.validatePersonality(personality);

        if (!personalityValidation.isValid) {
          errors.push(...personalityValidation.errors);
        }
        warnings.push(...personalityValidation.warnings);
      } catch (_error) {
        errors.push(`Invalid personality ID: ${context.personalityId}`);
      }
    }

    // Context variable validation
    const requiredVars = ['communication_style', 'tone'];
    const missingVars = requiredVars.filter((varName) => !context.contextVariables[varName]);
    if (missingVars.length > 0) {
      warnings.push(`Recommended context variables missing: ${missingVars.join(', ')}`);
    }

    // Conversation history validation
    if (context.conversationHistory && context.conversationHistory.length === 0) {
      warnings.push('Empty conversation history provided');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clear personality injection cache
   */
  clearInjectionCache(): void {
    this.injectionCache.clear();
    this.conditionalSelectors.clear();
    this.logger.debug('Personality injection cache cleared');
  }

  /**
   * Get injection cache statistics
   */
  getInjectionCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    selectorsCount: number;
  } {
    const totalHits = Array.from(this.injectionCache.values()).reduce((sum, entry) => sum + (entry.injectionMetadata.compiledAt ? 1 : 0), 0);

    const hitRate = this.injectionCache.size > 0 ? totalHits / this.injectionCache.size : 0;

    return {
      size: this.injectionCache.size,
      maxSize: this.cacheMaxSize,
      hitRate,
      selectorsCount: this.conditionalSelectors.size,
    };
  }

  // Private helper methods

  /**
   * Determine which personality to use based on context
   */
  private async selectPersonality(context: PersonalityInjectionContext): Promise<string> {
    // If explicit personality is provided, use it
    if (context.personalityId) {
      return context.personalityId;
    }

    // If conditions are provided, use conditional selection
    if (context.conditions) {
      // This would integrate with a more sophisticated personality recommendation system
      // For now, fall back to getting current active personality
    }

    // Fall back to current active personality
    const currentPersonality = await this.personalityService.getCurrentPersonality();
    if (currentPersonality) {
      return currentPersonality.metadata.personalityId;
    }

    // Last resort: find any available personality
    const personalities = await this.personalityService.findAll();
    if (personalities.length === 0) {
      throw new Error('No personalities available for injection');
    }

    return personalities[0].id;
  }

  /**
   * Enhance prompt with personality using appropriate strategy
   */
  private async enhancePromptWithPersonality(context: PersonalityInjectionContext, template: CompiledPersonalityTemplate): Promise<string> {
    const injectionType = this.determineInjectionType(context);

    switch (injectionType) {
      case 'system':
        return this.enhanceWithSystemInjection(context, template);
      case 'context_merge':
        return this.enhanceWithContextMerge(context, template);
      case 'conditional':
        return this.enhanceWithConditionalLogic(context, template);
      default:
        return this.enhanceWithSystemInjection(context, template);
    }
  }

  /**
   * System-level personality injection
   */
  private async enhanceWithSystemInjection(context: PersonalityInjectionContext, template: CompiledPersonalityTemplate): Promise<string> {
    // Build context variables
    const variables = {
      ...context.contextVariables,
      user_input: context.originalPrompt,
      conversation_history: this.formatConversationHistory(context.conversationHistory),
    };

    // Format system template
    const systemPrompt = await template.systemTemplate.format(variables);

    // Combine system prompt with user input
    return `${systemPrompt}\n\nUser: ${context.originalPrompt}\nAssistant:`;
  }

  /**
   * Context merge personality injection
   */
  private async enhanceWithContextMerge(context: PersonalityInjectionContext, template: CompiledPersonalityTemplate): Promise<string> {
    // Create pipeline manually with proper template composition
    const personalityTemplate = PromptTemplate.fromTemplate(template.systemTemplate.template);
    const contextTemplate = PromptTemplate.fromTemplate('Context: {conversation_history}');
    const userTemplate = PromptTemplate.fromTemplate('User message: {user_input}');

    const pipelineTemplate = new PipelinePromptTemplate({
      pipelinePrompts: [
        {
          name: 'personality_base',
          prompt: personalityTemplate,
        },
        {
          name: 'context_layer',
          prompt: contextTemplate,
        },
        {
          name: 'user_layer',
          prompt: userTemplate,
        },
      ],
      finalPrompt: PromptTemplate.fromTemplate(
        '{personality_base}\n\n{context_layer}\n\n{user_layer}\n\nRespond maintaining your personality traits while addressing the user input:',
      ),
    });

    const variables = {
      ...context.contextVariables,
      user_input: context.originalPrompt,
      conversation_history: this.formatConversationHistory(context.conversationHistory),
    };

    return await pipelineTemplate.format(variables);
  }

  /**
   * Conditional logic personality injection
   */
  private async enhanceWithConditionalLogic(context: PersonalityInjectionContext, template: CompiledPersonalityTemplate): Promise<string> {
    // Apply conditional modifications based on context
    let enhancedTemplate = template.systemTemplate.template;

    // Modify template based on conditions
    if (context.conditions) {
      Object.entries(context.conditions).forEach(([condition, value]) => {
        if (condition === 'formal_mode' && value === true) {
          enhancedTemplate += '\n\nAdditional instruction: Use formal language and professional tone.';
        }
        if (condition === 'creative_mode' && value === true) {
          enhancedTemplate += '\n\nAdditional instruction: Be creative and think outside the box.';
        }
        if (condition === 'technical_mode' && value === true) {
          enhancedTemplate += '\n\nAdditional instruction: Provide technical details and explanations.';
        }
      });
    }

    // Create temporary template and format - ensure we have a string template
    const templateString = typeof enhancedTemplate === 'string' ? enhancedTemplate : enhancedTemplate.toString();
    const conditionalTemplate = PromptTemplate.fromTemplate(templateString);
    const variables = {
      ...context.contextVariables,
      user_input: context.originalPrompt,
    };

    return await conditionalTemplate.format(variables);
  }

  /**
   * Determine injection strategy based on context
   */
  private determineInjectionType(context: PersonalityInjectionContext): 'system' | 'context_merge' | 'conditional' {
    if (context.conditions && Object.keys(context.conditions).length > 0) {
      return 'conditional';
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      return 'context_merge';
    }

    return 'system';
  }

  /**
   * Build trait-specific template variables
   */
  private buildTraitVariables(personality: PersonalityProfile): Record<string, string> {
    const traitVars: Record<string, string> = {};

    personality.traits.forEach((trait) => {
      traitVars[trait.name] = trait.value;
      traitVars[`${trait.name}_weight`] = trait.weight.toString();
    });

    return traitVars;
  }

  /**
   * Format conversation history for template use
   */
  private formatConversationHistory(history?: Array<{ role: string; content: string; timestamp: Date }>): string {
    if (!history || history.length === 0) {
      return 'No previous conversation';
    }

    return history.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
  }

  /**
   * Format few-shot examples for system prompt
   */
  private formatFewShotExamples(examples: any[]): string {
    if (!examples || examples.length === 0) {
      return 'No examples available';
    }

    return examples.map((example, index) => `Example ${index + 1}:\nHuman: ${example.input}\nAssistant: ${example.output}`).join('\n\n');
  }

  /**
   * Extract used variables from context
   */
  private extractUsedVariables(contextVariables: Record<string, any>): string[] {
    return Object.keys(contextVariables);
  }

  /**
   * Generate cache key for injection result
   */
  private generateInjectionCacheKey(context: PersonalityInjectionContext): string {
    const keyParts = [
      context.personalityId || 'auto',
      this.hashString(context.originalPrompt),
      this.hashString(JSON.stringify(context.contextVariables)),
      context.conversationHistory?.length || 0,
    ];

    return keyParts.join('_');
  }

  /**
   * Simple string hash for cache key generation
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get injection result from cache
   */
  private getFromInjectionCache(key: string): InjectedPromptResult | null {
    const result = this.injectionCache.get(key);
    if (!result) {
      return null;
    }

    // Check expiration (simplified - would normally check timestamp)
    if (this.injectionCache.size > this.cacheMaxSize) {
      // Simple LRU eviction
      const firstKey = this.injectionCache.keys().next().value;
      this.injectionCache.delete(firstKey);
    }

    return result;
  }

  /**
   * Add injection result to cache
   */
  private addToInjectionCache(key: string, result: InjectedPromptResult): void {
    // Implement LRU eviction if cache is full
    if (this.injectionCache.size >= this.cacheMaxSize) {
      const oldestKey = this.injectionCache.keys().next().value;
      this.injectionCache.delete(oldestKey);
    }

    this.injectionCache.set(key, result);

    this.logger.debug('Injection result cached', {
      key,
      cacheSize: this.injectionCache.size,
      personalityId: result.injectionMetadata.personalityId,
    });
  }
}
