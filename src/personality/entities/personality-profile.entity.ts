import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Personality trait configuration defining specific behavioral aspects
 */
export interface PersonalityTrait {
  /** Trait identifier (e.g., 'tone', 'expertise_level', 'communication_style') */
  name: string;
  /** Trait value (e.g., 'professional', 'expert', 'concise') */
  value: string;
  /** Trait weight/intensity (0.0 to 1.0) */
  weight: number;
  /** Optional description of this trait's impact */
  description?: string;
}

/**
 * Prompt template configuration for personality-specific interactions
 */
export interface PersonalityPromptTemplate {
  /** Template identifier (e.g., 'system', 'user', 'few_shot_examples') */
  type: 'system' | 'user' | 'assistant' | 'few_shot_examples';
  /** LangChain-compatible template string with variable placeholders */
  template: string;
  /** Variables expected in the template */
  inputVariables: string[];
  /** Priority order for template application */
  priority: number;
  /** Conditional logic for when to apply this template */
  conditions?: Record<string, any>;
}

/**
 * Few-shot example for personality demonstration
 */
export interface PersonalityExample {
  /** Example input/context */
  input: string;
  /** Expected personality-consistent output */
  output: string;
  /** Optional metadata about the example */
  metadata?: Record<string, any>;
}

/**
 * Personality Profile Entity
 * 
 * Represents a complete AI personality configuration with traits, prompts,
 * and behavioral patterns. Uses LangChain's prompt template system for
 * dynamic personality injection during conversations.
 */
@Entity('personality_profiles')
export class PersonalityProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable name (e.g., 'Coding Assistant', 'Creative Writer') */
  @Column({ length: 100, unique: true })
  name: string;

  /** Detailed description of the personality's purpose and characteristics */
  @Column('text')
  description: string;

  /** Personality traits configuration */
  @Column('jsonb')
  traits: PersonalityTrait[];

  /** LangChain prompt templates for this personality */
  @Column('jsonb')
  promptTemplates: PersonalityPromptTemplate[];

  /** Few-shot examples demonstrating personality behavior */
  @Column('jsonb', { default: [] })
  examples: PersonalityExample[];

  /** Personality category (e.g., 'assistant', 'creative', 'analytical') */
  @Column({ length: 50 })
  category: string;

  /** Tags for personality discovery and filtering */
  @Column('simple-array', { default: [] })
  tags: string[];

  /** Whether this personality is currently active */
  @Column({ default: false })
  isActive: boolean;

  /** Whether this is a system-provided personality (immutable) */
  @Column({ default: false })
  isSystemPersonality: boolean;

  /** Configuration metadata */
  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;

  /** Version for tracking personality evolution */
  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Get system prompt template for LangChain integration
   */
  getSystemPromptTemplate(): PersonalityPromptTemplate | undefined {
    const systemTemplates = this.promptTemplates.filter(template => template.type === 'system');
    if (systemTemplates.length === 0) return undefined;
    
    return systemTemplates.reduce((highest, current) => 
      current.priority > highest.priority ? current : highest
    );
  }

  /**
   * Get few-shot examples formatted for LangChain FewShotPromptTemplate
   */
  getFewShotExamples(): PersonalityExample[] {
    return this.examples.filter(example => 
      example.metadata?.includeInFewShot !== false
    );
  }

  /**
   * Get trait value by name with default fallback
   */
  getTraitValue(traitName: string, defaultValue?: string): string | undefined {
    const trait = this.traits.find(t => t.name === traitName);
    return trait?.value ?? defaultValue;
  }

  /**
   * Get weighted trait score for personality intensity calculation
   */
  getTraitWeight(traitName: string): number {
    const trait = this.traits.find(t => t.name === traitName);
    return trait?.weight ?? 0;
  }

  /**
   * Check if personality meets specific conditions
   */
  meetsConditions(conditions: Record<string, any>): boolean {
    return Object.entries(conditions).every(([key, value]) => {
      if (key === 'tags') {
        return Array.isArray(value) 
          ? value.some(tag => this.tags.includes(tag))
          : this.tags.includes(value);
      }
      if (key === 'category') {
        return this.category === value;
      }
      if (key === 'traits') {
        return Object.entries(value).every(([traitName, traitValue]) =>
          this.getTraitValue(traitName) === traitValue
        );
      }
      return this.metadata[key] === value;
    });
  }

  /**
   * Validate personality configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.name?.trim()) {
      errors.push('Name is required');
    }

    if (!this.description?.trim()) {
      errors.push('Description is required');
    }

    if (!this.category?.trim()) {
      errors.push('Category is required');
    }

    if (!Array.isArray(this.traits) || this.traits.length === 0) {
      errors.push('At least one personality trait is required');
    } else {
      this.traits.forEach((trait, index) => {
        if (!trait.name?.trim()) {
          errors.push(`Trait ${index}: name is required`);
        }
        if (!trait.value?.trim()) {
          errors.push(`Trait ${index}: value is required`);
        }
        if (typeof trait.weight !== 'number' || trait.weight < 0 || trait.weight > 1) {
          errors.push(`Trait ${index}: weight must be between 0 and 1`);
        }
      });
    }

    if (!Array.isArray(this.promptTemplates) || this.promptTemplates.length === 0) {
      errors.push('At least one prompt template is required');
    } else {
      const hasSystemTemplate = this.promptTemplates.some(t => t.type === 'system');
      if (!hasSystemTemplate) {
        errors.push('At least one system prompt template is required');
      }

      this.promptTemplates.forEach((template, index) => {
        if (!template.template?.trim()) {
          errors.push(`Template ${index}: template content is required`);
        }
        if (!Array.isArray(template.inputVariables)) {
          errors.push(`Template ${index}: inputVariables must be an array`);
        }
        if (typeof template.priority !== 'number') {
          errors.push(`Template ${index}: priority must be a number`);
        }
      });
    }

    return errors;
  }
}