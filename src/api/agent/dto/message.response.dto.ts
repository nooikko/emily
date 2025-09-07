import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Define our own API-safe content type instead of using LangChain's internal types
export type ApiMessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: string }>;

/**
 * Metadata for AI agent messages with specific typed fields
 */
export interface MessageMetadata {
  /** AI model used for generation */
  model?: string;
  /** Number of tokens used in the request */
  tokensUsed?: number;
  /** Processing time in milliseconds */
  processingTime?: number;
  /** Temperature setting used */
  temperature?: number;
  /** Max tokens setting used */
  maxTokens?: number;
  /** Whether the response was cached */
  cached?: boolean;
  /** Provider-specific metadata */
  provider?: {
    name: 'openai' | 'anthropic' | 'other';
    modelVersion?: string;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  };
  /** Cost information */
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost?: number;
  };
  /** Additional custom metadata */
  custom?: Record<string, string | number | boolean>;
}

/**
 * Response DTO for AI agent messages including metadata
 */
export class MessageResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the message',
    example: 'msg-123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    description: 'Type of message sender/source',
    enum: ['human', 'ai', 'tool'],
    example: 'ai',
  })
  @IsEnum(['human', 'ai', 'tool'])
  type!: 'human' | 'ai' | 'tool';

  @ApiProperty({
    description: 'Message content - can be a simple string or structured content array',
    example: 'I can help you with various tasks. What would you like to know?',
    oneOf: [
      {
        type: 'string',
        example: 'Hello! How can I help you today?',
      },
      {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['text'] },
                text: { type: 'string' },
              },
              required: ['type', 'text'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['image_url'] },
                image_url: { type: 'string', format: 'uri' },
              },
              required: ['type', 'image_url'],
            },
          ],
        },
        example: [{ type: 'text', text: 'Here is my response...' }],
      },
    ],
  })
  content!: ApiMessageContent;

  @ApiPropertyOptional({
    description: 'Conversation thread identifier this message belongs to',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was created',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata about the message',
    type: 'object',
    additionalProperties: true,
    example: {
      model: 'claude-3-sonnet',
      tokensUsed: 150,
      processingTime: 1200,
    },
  })
  @IsOptional()
  metadata?: MessageMetadata;

  @ApiPropertyOptional({
    description: 'Message status for tracking delivery/processing',
    enum: ['pending', 'processing', 'completed', 'failed'],
    example: 'completed',
  })
  @IsOptional()
  @IsEnum(['pending', 'processing', 'completed', 'failed'])
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
