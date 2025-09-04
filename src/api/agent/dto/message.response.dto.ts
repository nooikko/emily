import { ApiProperty } from '@nestjs/swagger';

// Define our own API-safe content type instead of using LangChain's internal types
export type ApiMessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: string }>;

export class MessageResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the message',
    example: 'msg-123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Type of message',
    enum: ['human', 'ai', 'tool'],
    example: 'ai',
  })
  type: 'human' | 'ai' | 'tool';

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
                image_url: { type: 'string' },
              },
              required: ['type', 'image_url'],
            },
          ],
        },
        example: [{ type: 'text', text: 'Here is my response...' }],
      },
    ],
  })
  content: ApiMessageContent;
}
