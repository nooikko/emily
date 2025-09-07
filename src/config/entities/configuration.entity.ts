import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Unique identifier for the configuration',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Configuration category for logical grouping',
    enum: ConfigCategory,
    example: ConfigCategory.FEATURE_FLAGS,
  })
  @Column({ type: 'enum', enum: ConfigCategory })
  @IsEnum(ConfigCategory)
  @IsNotEmpty()
  category!: ConfigCategory;

  @ApiProperty({
    description: 'Unique configuration key',
    example: 'ENABLE_SEMANTIC_MEMORY',
    maxLength: 255,
  })
  @Column({ type: 'varchar', length: 255 })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    description: 'Configuration value as string (typed according to type field)',
    example: 'true',
  })
  @Column({ type: 'text' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiProperty({
    description: 'Value type for proper casting and validation',
    enum: ConfigType,
    example: ConfigType.BOOLEAN,
  })
  @Column({ type: 'enum', enum: ConfigType })
  @IsEnum(ConfigType)
  @IsNotEmpty()
  type!: ConfigType;

  @ApiProperty({
    description: 'Environment scope for the configuration',
    enum: ConfigEnvironment,
    example: ConfigEnvironment.ALL,
    default: ConfigEnvironment.ALL,
  })
  @Column({ type: 'enum', enum: ConfigEnvironment, default: ConfigEnvironment.ALL })
  @IsEnum(ConfigEnvironment)
  environment!: ConfigEnvironment;

  @ApiPropertyOptional({
    description: 'Human-readable description of the configuration',
    example: 'Enable or disable semantic memory features in the AI agent',
    maxLength: 500,
  })
  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Validation rules for the configuration value',
    example: {
      min: 0,
      max: 100,
      pattern: '^[a-zA-Z0-9]+$',
      enum: ['option1', 'option2'],
      required: true,
    },
    type: 'object',
    properties: {
      min: { type: 'number', description: 'Minimum value for numeric configurations' },
      max: { type: 'number', description: 'Maximum value for numeric configurations' },
      pattern: { type: 'string', description: 'Regular expression pattern for string validation' },
      enum: { type: 'array', items: { type: 'string' }, description: 'Allowed values for enum configurations' },
      required: { type: 'boolean', description: 'Whether the configuration is required' },
    },
  })
  @Column({ type: 'jsonb', nullable: true })
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
    required?: boolean;
  };

  @ApiProperty({
    description: 'Mark as secret to redact value in API responses',
    example: false,
    default: false,
  })
  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  isSecret!: boolean;

  @ApiProperty({
    description: 'Whether the configuration is active',
    example: true,
    default: true,
  })
  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({
    description: 'Configuration version number',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @Column({ type: 'int', default: 1 })
  @IsNumber()
  @Min(1)
  version!: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @UpdateDateColumn()
  updatedAt!: Date;

  @ApiPropertyOptional({
    description: 'User or system that created the configuration',
    example: 'admin',
    maxLength: 255,
  })
  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'User or system that last updated the configuration',
    example: 'admin',
    maxLength: 255,
  })
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
