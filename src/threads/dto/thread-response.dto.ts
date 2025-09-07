import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../entities/conversation-thread.entity';
import type { ThreadMetadata } from './create-thread.dto';

/**
 * DTO for thread response data
 */
export class ThreadResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the thread',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: 'Thread title',
    example: 'Discussion about TypeScript best practices',
  })
  @IsString()
  title!: string;

  @ApiPropertyOptional({
    description: 'Thread summary',
    example: 'A conversation about advanced TypeScript features and best practices',
  })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiProperty({
    description: 'Thread status',
    enum: ThreadStatus,
    example: ThreadStatus.ACTIVE,
  })
  @IsEnum(ThreadStatus)
  status!: ThreadStatus;

  @ApiProperty({
    description: 'Thread priority',
    enum: ThreadPriority,
    example: ThreadPriority.NORMAL,
  })
  @IsEnum(ThreadPriority)
  priority!: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Category ID',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({
    description: 'Thread tags',
    example: ['typescript', 'best-practices', 'development'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiProperty({
    description: 'Number of messages in the thread',
    example: 12,
  })
  @IsNumber()
  messageCount!: number;

  @ApiProperty({
    description: 'Number of unread messages',
    example: 3,
  })
  @IsNumber()
  unreadCount!: number;

  @ApiPropertyOptional({
    description: 'Last activity timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  lastActivityAt?: Date;

  @ApiPropertyOptional({
    description: 'Preview of the last message',
    example: "That's a great question about TypeScript utility types...",
  })
  @IsString()
  @IsOptional()
  lastMessagePreview?: string;

  @ApiPropertyOptional({
    description: 'Sender of the last message',
    enum: ['human', 'assistant', 'system'],
    example: 'assistant',
  })
  @IsString()
  @IsOptional()
  lastMessageSender?: 'human' | 'assistant' | 'system';

  @ApiPropertyOptional({
    description: 'Thread metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  metadata?: ThreadMetadata;

  @ApiProperty({
    description: 'Thread creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsDate()
  @Type(() => Date)
  createdAt!: Date;

  @ApiProperty({
    description: 'Thread last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsDate()
  @Type(() => Date)
  updatedAt!: Date;
}

/**
 * DTO for paginated thread list responses
 */
export class ThreadListResponseDto {
  @ApiProperty({
    description: 'Array of threads',
    type: [ThreadResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThreadResponseDto)
  threads!: ThreadResponseDto[];

  @ApiProperty({
    description: 'Total number of threads',
    example: 50,
  })
  @IsNumber()
  total!: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  @IsNumber()
  page!: number;

  @ApiProperty({
    description: 'Number of threads per page',
    example: 20,
  })
  @IsNumber()
  limit!: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 3,
  })
  @IsNumber()
  totalPages!: number;

  @ApiProperty({
    description: 'Whether there are more pages',
    example: true,
  })
  @IsBoolean()
  hasMore!: boolean;
}

/**
 * DTO for thread statistics
 */
export class ThreadStatsResponseDto {
  @ApiProperty({
    description: 'Total number of threads',
    example: 150,
  })
  @IsNumber()
  totalThreads!: number;

  @ApiProperty({
    description: 'Number of active threads',
    example: 120,
  })
  @IsNumber()
  activeThreads!: number;

  @ApiProperty({
    description: 'Number of archived threads',
    example: 25,
  })
  @IsNumber()
  archivedThreads!: number;

  @ApiProperty({
    description: 'Number of deleted threads',
    example: 5,
  })
  @IsNumber()
  deletedThreads!: number;

  @ApiProperty({
    description: 'Total number of messages across all threads',
    example: 2500,
  })
  @IsNumber()
  totalMessages!: number;

  @ApiProperty({
    description: 'Number of unread messages across all threads',
    example: 15,
  })
  @IsNumber()
  totalUnreadMessages!: number;

  @ApiProperty({
    description: 'Statistics by priority',
    type: 'object',
    properties: {
      low: { type: 'number' },
      normal: { type: 'number' },
      high: { type: 'number' },
      urgent: { type: 'number' },
    },
    example: {
      low: 20,
      normal: 90,
      high: 35,
      urgent: 5,
    },
  })
  @IsOptional()
  byPriority?: Record<string, number>;

  @ApiProperty({
    description: 'Statistics by category',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: {
      work: 60,
      personal: 40,
      learning: 30,
      general: 20,
    },
  })
  @IsOptional()
  byCategory?: Record<string, number>;

  @ApiProperty({
    description: 'Most used tags with counts',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: {
      typescript: 45,
      javascript: 30,
      react: 25,
      node: 20,
    },
  })
  @IsOptional()
  topTags?: Record<string, number>;
}
