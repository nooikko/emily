import { FewShotPromptTemplate } from '@langchain/core/prompts';
import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable, Logger } from '@nestjs/common';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import { PersonalityExample, PersonalityProfile, PersonalityPromptTemplate } from '../entities/personality-profile.entity';
import type {
  CompiledPersonalityTemplate,
  PersonalityTemplateCache,
  PersonalityTemplateFactory,
  PersonalityValidationResult,
} from '../interfaces/personality.interface';

/**
 * LangChain-based Personality Template Service
 * 
 * Handles compilation, validation, and caching of personality prompt templates
 * using LangChain's PromptTemplate and FewShotPromptTemplate classes.
 * 
 * This service integrates with the existing LangChain infrastructure to provide
 * optimized, production-ready personality template management.
 */
@Injectable()
export class PersonalityTemplateService extends LangChainBaseService implements PersonalityTemplateFactory {
  private readonly templateCache = new Map<string, PersonalityTemplateCache>();
  private readonly cacheMaxSize = 100;
  private readonly cacheExpirationMs = 30 * 60 * 1000; // 30 minutes

  constructor() {
    super('PersonalityTemplateService');
  }

  /**
   * Compile a personality profile into optimized LangChain templates
   */
  async compilePersonalityTemplates(personality: PersonalityProfile): Promise<CompiledPersonalityTemplate> {
    this.logExecution('compilePersonalityTemplates', { personalityId: personality.id, personalityName: personality.name });

    // Check cache first
    const cacheKey = this.generateCacheKey(personality.id, personality.version);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug('Using cached personality template', { personalityId: personality.id });
      return cached;
    }

    // Compile templates
    const compiledTemplate = await this.createTracedRunnable(
      'compileTemplates',
      async () => this.compileTemplatesInternal(personality),
      { personalityId: personality.id }
    ).invoke({});

    // Cache the result
    this.addToCache(cacheKey, compiledTemplate);

    return compiledTemplate;
  }

  /**
   * Internal template compilation logic
   */
  private async compileTemplatesInternal(personality: PersonalityProfile): Promise<CompiledPersonalityTemplate> {
    // Validate personality first
    const validation = this.validatePersonalityConfiguration(personality);
    if (!validation.isValid) {
      throw new Error(`Personality validation failed: ${validation.errors.join(', ')}`);
    }

    // Get system template (highest priority)
    const systemTemplate = personality.getSystemPromptTemplate();
    if (!systemTemplate) {
      throw new Error('No system prompt template found for personality');
    }

    // Compile system prompt template
    const compiledSystemTemplate = await this.createPromptTemplate(systemTemplate);

    // Compile few-shot template if examples exist
    let compiledFewShotTemplate: FewShotPromptTemplate | undefined;
    const examples = personality.getFewShotExamples();
    if (examples.length > 0) {
      const fewShotTemplateConfig = personality.promptTemplates.find(t => t.type === 'few_shot_examples');
      if (fewShotTemplateConfig) {
        compiledFewShotTemplate = await this.createFewShotTemplate(fewShotTemplateConfig, examples);
      }
    }

    // Compile user and assistant templates
    const userTemplate = personality.promptTemplates.find(t => t.type === 'user');
    const assistantTemplate = personality.promptTemplates.find(t => t.type === 'assistant');

    const compiledUserTemplate = userTemplate ? await this.createPromptTemplate(userTemplate) : undefined;
    const compiledAssistantTemplate = assistantTemplate ? await this.createPromptTemplate(assistantTemplate) : undefined;

    return {
      systemTemplate: compiledSystemTemplate,
      fewShotTemplate: compiledFewShotTemplate,
      userTemplate: compiledUserTemplate,
      assistantTemplate: compiledAssistantTemplate,
      metadata: {
        personalityId: personality.id,
        personalityName: personality.name,
        compiledAt: new Date(),
        templateVersion: personality.version,
      },
    };
  }

  /**
   * Create a LangChain PromptTemplate from personality configuration
   */
  async createPromptTemplate(template: PersonalityPromptTemplate): Promise<PromptTemplate> {
    this.logExecution('createPromptTemplate', { templateType: template.type, priority: template.priority });

    // Validate template first
    const validation = this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Create LangChain PromptTemplate
    try {
      return PromptTemplate.fromTemplate(template.template, {
        templateFormat: 'f-string', // Use f-string format for compatibility
        inputVariables: template.inputVariables,
      });
    } catch (error) {
      this.logger.error('Failed to create PromptTemplate', {
        error: error.message,
        template: template.template,
        inputVariables: template.inputVariables,
      });
      throw new Error(`Failed to create PromptTemplate: ${error.message}`);
    }
  }

  /**
   * Create a FewShotPromptTemplate with personality examples
   */
  async createFewShotTemplate(
    template: PersonalityPromptTemplate,
    examples: PersonalityExample[]
  ): Promise<FewShotPromptTemplate> {
    this.logExecution('createFewShotTemplate', { 
      templateType: template.type, 
      examplesCount: examples.length 
    });

    // Validate template and examples
    const validation = this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Few-shot template validation failed: ${validation.errors.join(', ')}`);
    }

    if (examples.length === 0) {
      throw new Error('Few-shot template requires at least one example');
    }

    // Format examples for LangChain
    const formattedExamples = examples.map(example => ({
      input: example.input,
      output: example.output,
    }));

    // Create example prompt template
    const examplePrompt = PromptTemplate.fromTemplate(
      'Human: {input}\nAssistant: {output}',
      {
        inputVariables: ['input', 'output'],
        templateFormat: 'f-string',
      }
    );

    // Create few-shot prompt template
    try {
      return new FewShotPromptTemplate({
        examples: formattedExamples,
        examplePrompt,
        prefix: template.template, // Use the personality template as prefix
        suffix: 'Human: {input}\nAssistant:',
        inputVariables: ['input', ...template.inputVariables],
      });
    } catch (error) {
      this.logger.error('Failed to create FewShotPromptTemplate', {
        error: error.message,
        examplesCount: examples.length,
      });
      throw new Error(`Failed to create FewShotPromptTemplate: ${error.message}`);
    }
  }

  /**
   * Validate template syntax and variables
   */
  validateTemplate(template: PersonalityPromptTemplate): PersonalityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!template.template?.trim()) {
      errors.push('Template content is required');
    }

    if (!Array.isArray(template.inputVariables)) {
      errors.push('Input variables must be an array');
    }

    if (typeof template.priority !== 'number') {
      errors.push('Template priority must be a number');
    }

    // Advanced validation
    if (template.template) {
      // Check for variable placeholders in template
      const templateVariables = this.extractTemplateVariables(template.template);
      const declaredVariables = new Set(template.inputVariables);

      // Check for undeclared variables
      const undeclaredVars = templateVariables.filter(v => !declaredVariables.has(v));
      if (undeclaredVars.length > 0) {
        errors.push(`Undeclared variables in template: ${undeclaredVars.join(', ')}`);
      }

      // Check for unused declared variables
      const unusedVars = template.inputVariables.filter(v => !templateVariables.includes(v));
      if (unusedVars.length > 0) {
        warnings.push(`Declared but unused variables: ${unusedVars.join(', ')}`);
      }

      // Check template complexity
      if (template.template.length > 3000) {
        warnings.push('Template is very long and might affect performance');
      }

      // Check for potentially problematic patterns
      if (template.template.includes('{{') || template.template.includes('}}')) {
        warnings.push('Template contains double braces which might cause parsing issues');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate complete personality configuration
   */
  validatePersonalityConfiguration(personality: PersonalityProfile): PersonalityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Use entity validation first
    const entityErrors = personality.validate();
    errors.push(...entityErrors);

    // Validate individual templates
    for (const template of personality.promptTemplates) {
      const templateValidation = this.validateTemplate(template);
      if (!templateValidation.isValid) {
        errors.push(`Template ${template.type}: ${templateValidation.errors.join(', ')}`);
      }
      warnings.push(...templateValidation.warnings.map(w => `Template ${template.type}: ${w}`));
    }

    // Check for required template types
    const hasSystemTemplate = personality.promptTemplates.some(t => t.type === 'system');
    if (!hasSystemTemplate) {
      errors.push('Personality must have at least one system template');
    }

    // Check for duplicate template priorities within same type
    const priorityGroups = new Map<string, number[]>();
    for (const template of personality.promptTemplates) {
      if (!priorityGroups.has(template.type)) {
        priorityGroups.set(template.type, []);
      }
      priorityGroups.get(template.type)!.push(template.priority);
    }

    for (const [type, priorities] of priorityGroups) {
      const duplicates = priorities.filter((priority, index) => priorities.indexOf(priority) !== index);
      if (duplicates.length > 0) {
        warnings.push(`Duplicate priorities in ${type} templates: ${duplicates.join(', ')}`);
      }
    }

    // Validate trait consistency
    const requiredTraits = ['tone', 'communication_style'];
    for (const requiredTrait of requiredTraits) {
      if (!personality.traits.some(t => t.name === requiredTrait)) {
        warnings.push(`Recommended trait '${requiredTrait}' is missing`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Optimize template for performance
   */
  optimizeTemplate(template: PersonalityPromptTemplate): PersonalityPromptTemplate {
    const optimized = { ...template };

    // Trim whitespace
    optimized.template = template.template.trim();

    // Remove duplicate spaces
    optimized.template = optimized.template.replace(/\s+/g, ' ');

    // Sort input variables for consistency
    optimized.inputVariables = [...template.inputVariables].sort();

    return optimized;
  }

  /**
   * Extract variable placeholders from template string
   */
  private extractTemplateVariables(template: string): string[] {
    const variableRegex = /\{([^}]+)\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
      variables.push(match[1]);
    }

    return [...new Set(variables)]; // Remove duplicates
  }

  /**
   * Generate cache key for personality template
   */
  private generateCacheKey(personalityId: string, version: number): string {
    return `${personalityId}:v${version}`;
  }

  /**
   * Get compiled template from cache
   */
  private getFromCache(key: string): CompiledPersonalityTemplate | null {
    const cached = this.templateCache.get(key);
    if (!cached) {
      return null;
    }

    // Check expiration
    if (Date.now() > cached.expiresAt.getTime()) {
      this.templateCache.delete(key);
      return null;
    }

    // Update hit count
    cached.hitCount++;
    return cached.template;
  }

  /**
   * Add compiled template to cache
   */
  private addToCache(key: string, template: CompiledPersonalityTemplate): void {
    // Implement LRU eviction if cache is full
    if (this.templateCache.size >= this.cacheMaxSize) {
      const oldestKey = this.templateCache.keys().next().value;
      this.templateCache.delete(oldestKey);
    }

    this.templateCache.set(key, {
      key,
      template,
      expiresAt: new Date(Date.now() + this.cacheExpirationMs),
      hitCount: 0,
    });

    this.logger.debug('Template cached', { key, cacheSize: this.templateCache.size });
  }

  /**
   * Clear template cache (useful for development/testing)
   */
  clearCache(): void {
    this.templateCache.clear();
    this.logger.debug('Template cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    const totalHits = Array.from(this.templateCache.values()).reduce((sum, entry) => sum + entry.hitCount, 0);
    const hitRate = this.templateCache.size > 0 ? totalHits / this.templateCache.size : 0;

    return {
      size: this.templateCache.size,
      maxSize: this.cacheMaxSize,
      hitRate,
    };
  }

  /**
   * Format template for preview/debugging
   */
  async formatTemplatePreview(
    template: CompiledPersonalityTemplate,
    contextVariables: Record<string, any> = {}
  ): Promise<string> {
    try {
      // Use sample variables for preview
      const sampleVariables = {
        personality_type: 'helpful assistant',
        communication_style: 'professional',
        tone: 'friendly',
        expertise_level: 'expert',
        user_context: 'general question',
        ...contextVariables,
      };

      // Format the system template
      const preview = await template.systemTemplate.format(sampleVariables);
      return preview.substring(0, 500) + (preview.length > 500 ? '...' : '');
    } catch (error) {
      this.logger.warn('Failed to format template preview', { error: error.message });
      return 'Preview unavailable - template formatting error';
    }
  }
}