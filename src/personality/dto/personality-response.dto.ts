import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PersonalityExample, PersonalityPromptTemplate, PersonalityTrait } from '../entities/personality-profile.entity';
import type { PersonalityUsageStats, PersonalityValidationResult } from '../interfaces/personality.interface';

/**
 * DTO for personality profile response
 */
export class PersonalityProfileResponseDto {
  @ApiProperty({
    description: 'Unique personality profile ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({
    description: 'Human-readable name',
    example: 'Professional Coding Assistant',
  })
  name: string;

  @ApiProperty({
    description: 'Detailed description',
    example: 'A professional coding assistant that provides clear, well-documented solutions...',
  })
  description: string;

  @ApiProperty({
    description: 'Personality traits configuration',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'tone' },
        value: { type: 'string', example: 'professional' },
        weight: { type: 'number', example: 0.8 },
        description: { type: 'string', example: 'Maintains professional tone' },
      },
    },
  })
  traits: PersonalityTrait[];

  @ApiProperty({
    description: 'Prompt templates count',
    example: 3,
  })
  promptTemplatesCount: number;

  @ApiProperty({
    description: 'Examples count',
    example: 5,
  })
  examplesCount: number;

  @ApiProperty({
    description: 'Personality category',
    example: 'assistant',
  })
  category: string;

  @ApiProperty({
    description: 'Tags for discovery',
    example: ['coding', 'professional', 'helpful'],
  })
  tags: string[];

  @ApiProperty({
    description: 'Whether this personality is currently active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Whether this is a system personality',
    example: false,
  })
  isSystemPersonality: boolean;

  @ApiProperty({
    description: 'Configuration metadata',
    example: { temperature: 0.7, max_tokens: 2000 },
  })
  metadata: Record<string, any>;

  @ApiProperty({
    description: 'Personality version',
    example: 2,
  })
  version: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-20T15:45:00.000Z',
  })
  updatedAt: Date;
}

/**
 * DTO for detailed personality profile response (includes full templates and examples)
 */
export class DetailedPersonalityProfileResponseDto extends PersonalityProfileResponseDto {
  @ApiProperty({
    description: 'Full prompt templates configuration',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['system', 'user', 'assistant', 'few_shot_examples'] },
        template: { type: 'string' },
        inputVariables: { type: 'array', items: { type: 'string' } },
        priority: { type: 'number' },
        conditions: { type: 'object' },
      },
    },
  })
  promptTemplates: PersonalityPromptTemplate[];

  @ApiProperty({
    description: 'Few-shot examples',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  })
  examples: PersonalityExample[];
}

/**
 * DTO for personality validation response
 */
export class PersonalityValidationResponseDto {
  @ApiProperty({
    description: 'Whether the personality configuration is valid',
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description: 'Validation errors if any',
    example: [],
    type: [String],
  })
  errors: string[];

  @ApiProperty({
    description: 'Validation warnings',
    example: ['Template complexity might affect performance'],
    type: [String],
  })
  warnings: string[];

  @ApiProperty({
    description: 'Validation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  validatedAt: Date;
}

/**
 * DTO for personality usage statistics
 */
export class PersonalityUsageStatsResponseDto {
  @ApiProperty({
    description: 'Personality ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  personalityId: string;

  @ApiProperty({
    description: 'Total times this personality has been used',
    example: 127,
  })
  usageCount: number;

  @ApiProperty({
    description: 'Last time this personality was used',
    example: '2024-01-20T15:45:00.000Z',
  })
  lastUsedAt: Date;

  @ApiPropertyOptional({
    description: 'Average session duration in minutes',
    example: 23.5,
  })
  averageSessionDuration?: number;

  @ApiPropertyOptional({
    description: 'User satisfaction rating (1-5)',
    example: 4.7,
  })
  satisfactionRating?: number;

  @ApiProperty({
    description: 'Common use cases for this personality',
    example: ['code review', 'debugging help', 'architecture advice'],
    type: [String],
  })
  commonUseCases: string[];
}

/**
 * DTO for personality recommendation response
 */
export class PersonalityRecommendationResponseDto {
  @ApiProperty({
    description: 'Recommended personality ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  personalityId: string;

  @ApiProperty({
    description: 'Recommended personality name',
    example: 'Creative Writing Assistant',
  })
  personalityName: string;

  @ApiProperty({
    description: 'Confidence score for this recommendation (0-1)',
    example: 0.85,
  })
  confidence: number;

  @ApiProperty({
    description: 'Reason for this recommendation',
    example: 'Based on your creative writing context and preference for detailed explanations',
  })
  reason: string;

  @ApiProperty({
    description: 'Traits that match the user context',
    example: ['creative', 'detailed', 'empathetic'],
    type: [String],
  })
  matchingTraits: string[];

  @ApiPropertyOptional({
    description: 'Usage-based recommendation factors',
    type: 'object',
    properties: {
      popularityScore: { type: 'number', example: 0.7 },
      successRate: { type: 'number', example: 0.92 },
      userFeedback: { type: 'number', example: 4.5 },
    },
  })
  usageFactors?: {
    popularityScore: number;
    successRate: number;
    userFeedback: number;
  };
}

/**
 * DTO for personality switching response
 */
export class PersonalitySwitchResponseDto {
  @ApiProperty({
    description: 'Whether the switch was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'New active personality ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  newPersonalityId: string;

  @ApiProperty({
    description: 'New active personality name',
    example: 'Creative Writing Assistant',
  })
  newPersonalityName: string;

  @ApiPropertyOptional({
    description: 'Previous personality ID',
    example: 'g58bd21c-69dd-5483-b678-1f13c3d4e580',
  })
  previousPersonalityId?: string;

  @ApiProperty({
    description: 'Switch timestamp',
    example: '2024-01-20T15:45:00.000Z',
  })
  switchedAt: Date;

  @ApiProperty({
    description: 'Compiled system prompt preview',
    example: 'You are a creative writing assistant with an empathetic and inspiring tone...',
  })
  systemPromptPreview: string;

  @ApiPropertyOptional({
    description: 'Any warnings or notes about the switch',
    example: 'This personality has limited technical knowledge for coding questions',
  })
  warnings?: string[];
}

/**
 * DTO for bulk operations response
 */
export class BulkOperationResponseDto {
  @ApiProperty({
    description: 'Number of items successfully processed',
    example: 5,
  })
  successCount: number;

  @ApiProperty({
    description: 'Number of items that failed',
    example: 1,
  })
  failureCount: number;

  @ApiProperty({
    description: 'Details about failures',
    example: [{ item: 'personality-1', error: 'Validation failed: missing system template' }],
    type: 'array',
    items: {
      type: 'object',
      properties: {
        item: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  failures: Array<{ item: string; error: string }>;

  @ApiProperty({
    description: 'Operation timestamp',
    example: '2024-01-20T15:45:00.000Z',
  })
  processedAt: Date;
}