import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ThreadPriority } from '../entities/conversation-thread.entity';

/**
 * Context information for conversation threads with specific structured data
 */
export interface ThreadContext {
  /** Initial prompt or system message */
  systemPrompt?: string;
  /** Conversation topic or category */
  topic?: string;
  /** User preferences for this thread */
  userPreferences?: {
    language?: string;
    responseStyle?: 'brief' | 'detailed' | 'conversational';
    expertise?: 'beginner' | 'intermediate' | 'expert';
  };
  /** Source of the conversation (web, mobile, api, etc.) */
  source?: string;
  /** Reference to external systems */
  externalReference?: {
    id: string;
    type: string;
    url?: string;
  };
  /** Custom flags or settings */
  flags?: string[];
  /** Additional custom context */
  custom?: Record<string, string | number | boolean>;
}

/**
 * Metadata for threads with specific typed fields instead of generic unknown
 */
export interface ThreadMetadata {
  /** Source of the conversation (api, web, mobile) */
  source?: string;
  /** Primary language of the conversation */
  language?: string;
  /** AI model to use for responses */
  model?: string;
  /** Additional context information */
  context?: ThreadContext;
  /** Custom metadata */
  [key: string]: string | number | boolean | ThreadContext | undefined;
}

/**
 * DTO for creating a new conversation thread
 */
export class CreateThreadDto {
  @ApiProperty({
    description: 'Title for the thread',
    example: 'Discussion about TypeScript best practices',
    maxLength: 255,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional summary of the thread content',
    example: 'A conversation about advanced TypeScript features and best practices',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Priority level of the thread',
    enum: ThreadPriority,
    example: ThreadPriority.NORMAL,
    default: ThreadPriority.NORMAL,
  })
  @IsEnum(ThreadPriority)
  @IsOptional()
  priority?: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Category ID for the thread',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['typescript', 'best-practices', 'development'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata for the thread',
    type: 'object',
    additionalProperties: true,
    properties: {
      source: { type: 'string', description: 'Source of the conversation (api, web, mobile)' },
      language: { type: 'string', description: 'Primary language of the conversation' },
      model: { type: 'string', description: 'AI model to use for responses' },
      context: { type: 'object', additionalProperties: true, description: 'Additional context information' },
    },
  })
  @IsOptional()
  metadata?: ThreadMetadata;
}

/**
 * DTO for auto-creating a thread from first message
 */
export class AutoCreateThreadDto {
  @ApiProperty({
    description: 'Initial message content to derive title from',
    example: 'Can you help me understand TypeScript conditional types?',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  initialContent!: string;

  @ApiPropertyOptional({
    description: 'Category ID for the thread',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Source of the conversation',
    example: 'api',
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  source?: string;

  @ApiPropertyOptional({
    description: 'Initial tags to apply',
    example: ['question', 'typescript'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
