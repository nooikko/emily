import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../entities/conversation-thread.entity';
import type { ThreadMetadata } from './create-thread.dto';

/**
 * DTO for updating a conversation thread
 */
export class UpdateThreadDto {
  @ApiPropertyOptional({
    description: 'Updated title for the thread',
    example: 'Advanced TypeScript Features Discussion',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated summary of the thread content',
    example: 'An in-depth conversation about advanced TypeScript features including conditional types, utility types, and best practices',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Updated status of the thread',
    enum: ThreadStatus,
    example: ThreadStatus.ARCHIVED,
  })
  @IsEnum(ThreadStatus)
  @IsOptional()
  status?: ThreadStatus;

  @ApiPropertyOptional({
    description: 'Updated priority level of the thread',
    enum: ThreadPriority,
    example: ThreadPriority.HIGH,
  })
  @IsEnum(ThreadPriority)
  @IsOptional()
  priority?: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Updated category ID for the thread',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Updated tags for categorization',
    example: ['typescript', 'advanced', 'conditional-types', 'utility-types'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Updated metadata for the thread',
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
 * DTO for bulk update operations
 */
export class BulkUpdateThreadsDto {
  @ApiPropertyOptional({
    description: 'List of thread IDs to update',
    example: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000'],
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  threadIds!: string[];

  @ApiPropertyOptional({
    description: 'Status to apply to all threads',
    enum: ThreadStatus,
    example: ThreadStatus.ARCHIVED,
  })
  @IsEnum(ThreadStatus)
  @IsOptional()
  status?: ThreadStatus;

  @ApiPropertyOptional({
    description: 'Priority to apply to all threads',
    enum: ThreadPriority,
    example: ThreadPriority.LOW,
  })
  @IsEnum(ThreadPriority)
  @IsOptional()
  priority?: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Category ID to apply to all threads',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Tags to add to all threads',
    example: ['bulk-updated', 'archived'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addTags?: string[];

  @ApiPropertyOptional({
    description: 'Tags to remove from all threads',
    example: ['old-tag', 'deprecated'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  removeTags?: string[];
}
