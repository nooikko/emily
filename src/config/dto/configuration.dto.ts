import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ConfigCategory, ConfigEnvironment, ConfigType } from '../entities/configuration.entity';

/**
 * Validation rules schema for configuration values
 */
export class ValidationRulesDto {
  @ApiProperty({
    description: 'Minimum value for numeric configurations',
    example: 0,
    required: false,
  })
  @IsOptional()
  min?: number;

  @ApiProperty({
    description: 'Maximum value for numeric configurations',
    example: 100,
    required: false,
  })
  @IsOptional()
  max?: number;

  @ApiProperty({
    description: 'Regular expression pattern for string validation',
    example: '^[a-zA-Z0-9]+$',
    required: false,
  })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiProperty({
    description: 'Allowed values for enum configurations',
    example: ['option1', 'option2', 'option3'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enum?: string[];

  @ApiProperty({
    description: 'Whether the configuration is required',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

/**
 * DTO for creating new configurations
 */
export class CreateConfigurationDto {
  @ApiProperty({
    description: 'Configuration category for logical grouping',
    enum: ConfigCategory,
    example: ConfigCategory.FEATURE_FLAGS,
  })
  @IsEnum(ConfigCategory)
  @IsNotEmpty()
  category!: ConfigCategory;

  @ApiProperty({
    description: 'Unique configuration key',
    example: 'ENABLE_SEMANTIC_MEMORY',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    description: 'Configuration value as string (will be typed according to type field)',
    example: 'true',
  })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiProperty({
    description: 'Value type for proper casting and validation',
    enum: ConfigType,
    example: ConfigType.BOOLEAN,
  })
  @IsEnum(ConfigType)
  @IsNotEmpty()
  type!: ConfigType;

  @ApiProperty({
    description: 'Environment scope for the configuration',
    enum: ConfigEnvironment,
    example: ConfigEnvironment.ALL,
    required: false,
    default: ConfigEnvironment.ALL,
  })
  @IsOptional()
  @IsEnum(ConfigEnvironment)
  environment?: ConfigEnvironment;

  @ApiProperty({
    description: 'Human-readable description of the configuration',
    example: 'Enable or disable semantic memory features in the AI agent',
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Validation rules for the configuration value',
    type: ValidationRulesDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ValidationRulesDto)
  validationRules?: ValidationRulesDto;

  @ApiProperty({
    description: 'Mark as secret to redact value in API responses',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;

  @ApiProperty({
    description: 'Whether the configuration is active',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'User or system that created/updated the configuration',
    example: 'admin',
    maxLength: 255,
    required: false,
  })
  @IsOptional()
  @IsString()
  updatedBy?: string;
}

/**
 * DTO for updating existing configurations
 */
export class UpdateConfigurationDto extends PartialType(CreateConfigurationDto) {
  @ApiProperty({
    description: 'Configuration category for logical grouping',
    enum: ConfigCategory,
    example: ConfigCategory.FEATURE_FLAGS,
    required: false,
  })
  @IsOptional()
  @IsEnum(ConfigCategory)
  category?: ConfigCategory;

  @ApiProperty({
    description: 'Unique configuration key',
    example: 'ENABLE_SEMANTIC_MEMORY',
    maxLength: 255,
    required: false,
  })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({
    description: 'Configuration value as string',
    example: 'false',
    required: false,
  })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty({
    description: 'Value type for proper casting and validation',
    enum: ConfigType,
    example: ConfigType.BOOLEAN,
    required: false,
  })
  @IsOptional()
  @IsEnum(ConfigType)
  type?: ConfigType;
}

/**
 * DTO for bulk configuration operations
 */
export class BulkConfigurationDto {
  @ApiProperty({
    description: 'Array of configurations to create or update',
    type: [CreateConfigurationDto],
    minItems: 1,
    maxItems: 100, // Prevent abuse
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateConfigurationDto)
  configurations!: CreateConfigurationDto[];
}

/**
 * Response DTO for configuration queries with metadata
 */
export class ConfigurationResponseDto {
  @ApiProperty({
    description: 'Configuration unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @ApiProperty({
    description: 'Configuration category',
    enum: ConfigCategory,
    example: ConfigCategory.FEATURE_FLAGS,
  })
  category!: ConfigCategory;

  @ApiProperty({
    description: 'Configuration key',
    example: 'ENABLE_SEMANTIC_MEMORY',
  })
  key!: string;

  @ApiProperty({
    description: 'Configuration value (may be redacted if secret)',
    example: 'true',
  })
  value!: string;

  @ApiProperty({
    description: 'Value type',
    enum: ConfigType,
    example: ConfigType.BOOLEAN,
  })
  type!: ConfigType;

  @ApiProperty({
    description: 'Environment scope',
    enum: ConfigEnvironment,
    example: ConfigEnvironment.ALL,
  })
  environment!: ConfigEnvironment;

  @ApiProperty({
    description: 'Configuration description',
    example: 'Enable or disable semantic memory features',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Validation rules',
    type: ValidationRulesDto,
    required: false,
  })
  validationRules?: ValidationRulesDto;

  @ApiProperty({
    description: 'Whether this is a secret configuration',
    example: false,
  })
  isSecret!: boolean;

  @ApiProperty({
    description: 'Whether the configuration is active',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: 'Configuration version number',
    example: 1,
  })
  version!: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'User who created the configuration',
    example: 'admin',
    required: false,
  })
  createdBy?: string;

  @ApiProperty({
    description: 'User who last updated the configuration',
    example: 'admin',
    required: false,
  })
  updatedBy?: string;
}

/**
 * DTO for configuration validation results
 */
export class ValidationResultDto {
  @ApiProperty({
    description: 'Configuration key that was validated',
    example: 'ENABLE_SEMANTIC_MEMORY',
  })
  key!: string;

  @ApiProperty({
    description: 'Whether the configuration is valid',
    example: true,
  })
  isValid!: boolean;

  @ApiProperty({
    description: 'Validation error message if invalid',
    example: 'Value must be a boolean',
    required: false,
  })
  error?: string;
}
