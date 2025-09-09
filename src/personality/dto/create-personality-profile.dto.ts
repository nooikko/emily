import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { PersonalityCategory, PersonalityTraitName } from '../interfaces/personality.interface';

/**
 * DTO for personality trait creation
 */
export class CreatePersonalityTraitDto {
  @ApiProperty({
    description: 'Trait identifier (e.g., "tone", "expertise_level", "communication_style")',
    example: 'tone',
    enum: [
      'tone',
      'formality',
      'expertise_level',
      'communication_style',
      'creativity',
      'empathy',
      'precision',
      'verbosity',
      'humor',
      'patience',
      'assertiveness',
      'technical_depth',
      'example_usage',
      'response_length',
      'explanation_style',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: PersonalityTraitName | string;

  @ApiProperty({
    description: 'Trait value (e.g., "professional", "expert", "concise")',
    example: 'professional',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;

  @ApiProperty({
    description: 'Trait weight/intensity from 0.0 to 1.0',
    example: 0.8,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  weight: number;

  @ApiPropertyOptional({
    description: 'Optional description of this trait\'s impact',
    example: 'Maintains professional tone in all interactions',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * DTO for personality prompt template creation
 */
export class CreatePersonalityPromptTemplateDto {
  @ApiProperty({
    description: 'Template type',
    example: 'system',
    enum: ['system', 'user', 'assistant', 'few_shot_examples'],
  })
  @IsEnum(['system', 'user', 'assistant', 'few_shot_examples'])
  type: 'system' | 'user' | 'assistant' | 'few_shot_examples';

  @ApiProperty({
    description: 'LangChain-compatible template string with variable placeholders',
    example: 'You are a {personality_type} AI assistant. Your communication style is {communication_style}. Always maintain a {tone} tone.',
    minLength: 10,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  template: string;

  @ApiProperty({
    description: 'Variables expected in the template',
    example: ['personality_type', 'communication_style', 'tone'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  inputVariables: string[];

  @ApiProperty({
    description: 'Priority order for template application (higher numbers = higher priority)',
    example: 1,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  priority: number;

  @ApiPropertyOptional({
    description: 'Conditional logic for when to apply this template',
    example: { user_type: 'developer', context: 'coding' },
  })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;
}

/**
 * DTO for personality example creation
 */
export class CreatePersonalityExampleDto {
  @ApiProperty({
    description: 'Example input/context',
    example: 'How do I implement a sorting algorithm?',
    minLength: 5,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  input: string;

  @ApiProperty({
    description: 'Expected personality-consistent output',
    example: 'I\'d be happy to help you implement a sorting algorithm. Let\'s start with a clean, well-documented bubble sort implementation...',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  output: string;

  @ApiPropertyOptional({
    description: 'Optional metadata about the example',
    example: { includeInFewShot: true, difficulty: 'beginner', category: 'coding' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO for creating a new personality profile
 */
export class CreatePersonalityProfileDto {
  @ApiProperty({
    description: 'Human-readable name for the personality',
    example: 'Professional Coding Assistant',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Detailed description of the personality\'s purpose and characteristics',
    example: 'A professional coding assistant that provides clear, well-documented solutions with expert-level technical knowledge and a helpful, patient teaching style.',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description: string;

  @ApiProperty({
    description: 'Personality traits configuration',
    type: [CreatePersonalityTraitDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalityTraitDto)
  traits: CreatePersonalityTraitDto[];

  @ApiProperty({
    description: 'LangChain prompt templates for this personality',
    type: [CreatePersonalityPromptTemplateDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalityPromptTemplateDto)
  promptTemplates: CreatePersonalityPromptTemplateDto[];

  @ApiPropertyOptional({
    description: 'Few-shot examples demonstrating personality behavior',
    type: [CreatePersonalityExampleDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePersonalityExampleDto)
  examples?: CreatePersonalityExampleDto[];

  @ApiProperty({
    description: 'Personality category',
    example: 'assistant',
    enum: ['assistant', 'creative', 'analytical', 'educational', 'professional', 'casual', 'technical', 'research', 'support', 'custom'],
  })
  @IsEnum(['assistant', 'creative', 'analytical', 'educational', 'professional', 'casual', 'technical', 'research', 'support', 'custom'])
  category: PersonalityCategory;

  @ApiPropertyOptional({
    description: 'Tags for personality discovery and filtering',
    example: ['coding', 'professional', 'helpful', 'technical'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Whether this personality should be immediately active',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Additional configuration metadata',
    example: { temperature: 0.7, max_tokens: 2000, response_format: 'detailed' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO for personality search criteria
 */
export class PersonalitySearchDto {
  @ApiPropertyOptional({
    description: 'Search query for name or description',
    example: 'coding assistant',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @ApiPropertyOptional({
    description: 'Filter by category',
    example: 'assistant',
    enum: ['assistant', 'creative', 'analytical', 'educational', 'professional', 'casual', 'technical', 'research', 'support', 'custom'],
  })
  @IsOptional()
  @IsEnum(['assistant', 'creative', 'analytical', 'educational', 'professional', 'casual', 'technical', 'research', 'support', 'custom'])
  category?: PersonalityCategory;

  @ApiPropertyOptional({
    description: 'Filter by tags',
    example: ['coding', 'professional'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Include system personalities in results',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeSystemPersonalities?: boolean;

  @ApiPropertyOptional({
    description: 'Include only active personalities',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeActiveOnly?: boolean;
}

/**
 * DTO for personality switching
 */
export class SwitchPersonalityDto {
  @ApiProperty({
    description: 'ID of personality to switch to',
    example: 'uuid-string-here',
  })
  @IsString()
  @IsNotEmpty()
  personalityId: string;

  @ApiPropertyOptional({
    description: 'Current conversation context for better switching',
    example: 'User is asking about implementing a REST API with authentication',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  conversationContext?: string;

  @ApiPropertyOptional({
    description: 'User preferences or overrides for this session',
    example: { response_length: 'detailed', include_examples: true },
  })
  @IsOptional()
  @IsObject()
  userPreferences?: Record<string, any>;
}