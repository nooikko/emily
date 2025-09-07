import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * DTO for Server-Sent Event message data payload
 */
export class SseMessageData {
  @ApiProperty({
    description: 'Unique identifier for the SSE message',
    example: 'sse-123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({
    description: 'Type of SSE message sender/source',
    enum: ['ai', 'tool', 'system'],
    example: 'ai',
  })
  @IsOptional()
  @IsEnum(['ai', 'tool', 'system'])
  type?: 'ai' | 'tool' | 'system';

  @ApiProperty({
    description: 'Content of the SSE message (streaming text or status update)',
    example: 'Processing your request...',
    minLength: 0,
    maxLength: 10000,
  })
  @IsString()
  content!: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was generated',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Message sequence number for ordering',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  sequence?: number;
}

/**
 * DTO for Server-Sent Event messages with standardized structure
 */
export class SseMessage {
  @ApiProperty({
    description: 'SSE message data payload',
    type: SseMessageData,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => SseMessageData)
  data!: SseMessageData;

  @ApiProperty({
    description: 'SSE event type - defines the nature of the message for client handling',
    enum: ['message', 'done', 'error', 'heartbeat'],
    example: 'message',
  })
  @IsEnum(['message', 'done', 'error', 'heartbeat'])
  type!: 'message' | 'done' | 'error' | 'heartbeat';

  @ApiPropertyOptional({
    description: 'SSE event ID for client-side event tracking',
    example: 'event-123',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'SSE retry interval in milliseconds',
    example: 3000,
    minimum: 1000,
    maximum: 30000,
  })
  @IsOptional()
  retry?: number;
}

/**
 * DTO for SSE error messages with detailed error information
 */
export class SseErrorMessage {
  @ApiProperty({
    description: 'SSE event type for errors',
    enum: ['error'],
    example: 'error',
  })
  @IsEnum(['error'])
  type!: 'error';

  @ApiProperty({
    description: 'Error data payload with detailed error information',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Human-readable error message',
        example: 'Failed to process request - invalid input format',
      },
      code: {
        type: 'string',
        description: 'Error code for programmatic handling',
        example: 'INVALID_INPUT',
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'When the error occurred',
        example: '2024-01-01T12:00:00.000Z',
      },
    },
    required: ['message'],
  })
  @IsObject()
  data!: {
    message: string;
    code?: string;
    timestamp?: string;
    details?: Record<string, unknown>;
  };

  @ApiPropertyOptional({
    description: 'SSE event ID for error tracking',
    example: 'error-123',
  })
  @IsOptional()
  @IsString()
  id?: string;
}

/**
 * DTO for SSE completion/done messages
 */
export class SseDoneMessage {
  @ApiProperty({
    description: 'SSE event type for completion',
    enum: ['done'],
    example: 'done',
  })
  @IsEnum(['done'])
  type!: 'done';

  @ApiProperty({
    description: 'Completion data payload',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Completion message',
        example: 'Stream completed successfully',
      },
      totalMessages: {
        type: 'number',
        description: 'Total number of messages sent',
        example: 15,
      },
      duration: {
        type: 'number',
        description: 'Total stream duration in milliseconds',
        example: 2500,
      },
    },
    required: ['message'],
  })
  @IsObject()
  data!: {
    message: string;
    totalMessages?: number;
    duration?: number;
    metadata?: Record<string, unknown>;
  };
}

// Union type for all SSE message types for better TypeScript support
export type SseMessageUnion = SseMessage | SseErrorMessage | SseDoneMessage;
