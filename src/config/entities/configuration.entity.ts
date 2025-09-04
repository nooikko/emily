import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Configuration value types for runtime validation
 */
export enum ConfigType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ENUM = 'enum',
}

/**
 * Configuration categories for logical grouping
 */
export enum ConfigCategory {
  FEATURE_FLAGS = 'feature_flags',
  SERVICE_SETTINGS = 'service_settings',
  MODEL_CONFIG = 'model_config',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  LOGGING = 'logging',
  VOICE_SETTINGS = 'voice_settings',
  MEMORY_CONFIG = 'memory_config',
  EMBEDDINGS = 'embeddings',
}

/**
 * Environment scoping for configuration values
 */
export enum ConfigEnvironment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  ALL = 'all',
}

/**
 * Configuration Entity
 *
 * Stores dynamic application configuration that can be updated at runtime
 * without requiring application restarts. Excludes sensitive secrets which
 * remain in environment variables.
 */
@Entity('configurations')
@Unique(['key', 'environment'])
@Index(['category', 'environment'])
@Index(['isActive'])
export class Configuration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ConfigCategory })
  @IsEnum(ConfigCategory)
  @IsNotEmpty()
  category!: ConfigCategory;

  @Column({ type: 'varchar', length: 255 })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @Column({ type: 'text' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @Column({ type: 'enum', enum: ConfigType })
  @IsEnum(ConfigType)
  @IsNotEmpty()
  type!: ConfigType;

  @Column({ type: 'enum', enum: ConfigEnvironment, default: ConfigEnvironment.ALL })
  @IsEnum(ConfigEnvironment)
  environment!: ConfigEnvironment;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
    required?: boolean;
  };

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  isSecret!: boolean;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'int', default: 1 })
  @IsNumber()
  @Min(1)
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @IsOptional()
  updatedBy?: string;

  /**
   * Get typed value based on configuration type
   */
  getTypedValue(): string | number | boolean {
    switch (this.type) {
      case ConfigType.BOOLEAN:
        return this.value.toLowerCase() === 'true';
      case ConfigType.NUMBER:
        return Number.parseFloat(this.value);
      default:
        return this.value;
    }
  }

  /**
   * Validate configuration value against rules
   */
  validateValue(): boolean {
    if (!this.validationRules) {
      return true;
    }

    const typedValue = this.getTypedValue();
    const rules = this.validationRules;

    // Required validation
    if (rules.required && (!this.value || this.value.trim() === '')) {
      return false;
    }

    // Type-specific validations
    switch (this.type) {
      case ConfigType.NUMBER: {
        const numValue = typedValue as number;
        if (rules.min !== undefined && numValue < rules.min) {
          return false;
        }
        if (rules.max !== undefined && numValue > rules.max) {
          return false;
        }
        break;
      }

      case ConfigType.STRING: {
        const strValue = typedValue as string;
        if (rules.pattern && !new RegExp(rules.pattern).test(strValue)) {
          return false;
        }
        break;
      }

      case ConfigType.ENUM:
        if (rules.enum && !rules.enum.includes(this.value)) {
          return false;
        }
        break;

      case ConfigType.BOOLEAN:
        // Boolean values are validated during conversion
        break;
    }

    return true;
  }

  /**
   * Create a sanitized version for API responses (excludes sensitive data)
   */
  toSafeObject() {
    return {
      id: this.id,
      category: this.category,
      key: this.key,
      value: this.isSecret ? '[REDACTED]' : this.value,
      type: this.type,
      environment: this.environment,
      description: this.description,
      validationRules: this.validationRules,
      isSecret: this.isSecret,
      isActive: this.isActive,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
    };
  }
}
