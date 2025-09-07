import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../entities/conversation-thread.entity';

/**
 * Sort options for thread queries
 */
export enum ThreadSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_ACTIVITY = 'lastActivityAt',
  TITLE = 'title',
  MESSAGE_COUNT = 'messageCount',
  PRIORITY = 'priority',
}

/**
 * Sort direction options
 */
export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * DTO for querying threads with filters, search, and pagination
 */
export class ThreadQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of threads per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search query to filter threads by title or content',
    example: 'TypeScript best practices',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by thread status',
    enum: ThreadStatus,
    example: ThreadStatus.ACTIVE,
  })
  @IsEnum(ThreadStatus)
  @IsOptional()
  status?: ThreadStatus;

  @ApiPropertyOptional({
    description: 'Filter by thread priority',
    enum: ThreadPriority,
    example: ThreadPriority.HIGH,
  })
  @IsEnum(ThreadPriority)
  @IsOptional()
  priority?: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by tags (comma-separated)',
    example: 'typescript,javascript,react',
    type: 'string',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Include threads with any of the specified tags (OR logic)',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  tagsMatchAny?: boolean = false;

  @ApiPropertyOptional({
    description: 'Only show threads with unread messages',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  hasUnread?: boolean = false;

  @ApiPropertyOptional({
    description: 'Minimum number of messages in thread',
    example: 5,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minMessageCount?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of messages in thread',
    example: 100,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxMessageCount?: number;

  @ApiPropertyOptional({
    description: 'Created after this date (ISO string)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  createdAfter?: Date;

  @ApiPropertyOptional({
    description: 'Created before this date (ISO string)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  createdBefore?: Date;

  @ApiPropertyOptional({
    description: 'Last activity after this date (ISO string)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  lastActivityAfter?: Date;

  @ApiPropertyOptional({
    description: 'Last activity before this date (ISO string)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  lastActivityBefore?: Date;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ThreadSortBy,
    example: ThreadSortBy.LAST_ACTIVITY,
    default: ThreadSortBy.LAST_ACTIVITY,
  })
  @IsEnum(ThreadSortBy)
  @IsOptional()
  sortBy?: ThreadSortBy = ThreadSortBy.LAST_ACTIVITY;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortDirection,
    example: SortDirection.DESC,
    default: SortDirection.DESC,
  })
  @IsEnum(SortDirection)
  @IsOptional()
  sortDirection?: SortDirection = SortDirection.DESC;

  @ApiPropertyOptional({
    description: 'Include thread messages in response',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  includeMessages?: boolean = false;

  @ApiPropertyOptional({
    description: 'Include category information in response',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  includeCategory?: boolean = false;
}

/**
 * DTO for thread search with advanced options
 */
export class ThreadSearchDto {
  @ApiPropertyOptional({
    description: 'Search query',
    example: 'TypeScript conditional types',
  })
  @IsString()
  @IsOptional()
  query?: string;

  @ApiPropertyOptional({
    description: 'Search in thread titles only',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  titleOnly?: boolean = false;

  @ApiPropertyOptional({
    description: 'Search in message content',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  includeContent?: boolean = true;

  @ApiPropertyOptional({
    description: 'Search in tags',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  includeTags?: boolean = true;

  @ApiPropertyOptional({
    description: 'Limit number of results',
    example: 50,
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Boost recent results',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  boostRecent?: boolean = true;
}

/**
 * DTO for thread filter presets
 */
export class ThreadFilterPresetDto {
  @ApiPropertyOptional({
    description: 'Preset name',
    enum: ['active', 'archived', 'recent', 'unread', 'work', 'personal', 'learning', 'high_priority', 'urgent'],
    example: 'active',
  })
  @IsString()
  @IsOptional()
  preset?: string;

  @ApiPropertyOptional({
    description: 'Additional filters to apply with preset',
    type: ThreadQueryDto,
  })
  @IsOptional()
  @Type(() => ThreadQueryDto)
  additionalFilters?: ThreadQueryDto;
}
