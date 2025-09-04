import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SseMessageData {
  @ApiProperty({
    description: 'Unique identifier for the SSE message',
    example: 'sse-123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Type of SSE message',
    enum: ['ai', 'tool'],
    example: 'ai',
  })
  type?: 'ai' | 'tool';

  @ApiProperty({
    description: 'Content of the SSE message',
    example: 'Processing your request...',
  })
  content: string;
}

export class SseMessage {
  @ApiProperty({
    description: 'SSE message data payload',
    type: SseMessageData,
  })
  data: SseMessageData;

  @ApiProperty({
    description: 'SSE event type - defines the nature of the message',
    enum: ['message', 'done', 'error'],
    example: 'message',
  })
  type: 'message' | 'done' | 'error';
}

// Type for SSE error messages - separate class instead of inheritance
export class SseErrorMessage {
  @ApiProperty({
    description: 'SSE event type for errors',
    enum: ['error'],
    example: 'error',
  })
  type: 'error';

  @ApiProperty({
    description: 'Error data payload',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Error message',
        example: 'Failed to process request',
      },
    },
  })
  data: { message: string };
}

// Union type for all SSE message types
export type SseMessageUnion = SseMessage | SseErrorMessage;
