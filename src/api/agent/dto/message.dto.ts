import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

// Base class for discriminated union
export abstract class MessageContentDto {
  @ApiProperty({
    description: 'Type of content',
    enum: ['text', 'image_url'],
  })
  abstract type: 'text' | 'image_url';
}

// Text content variant
export class TextContentDto extends MessageContentDto {
  @ApiProperty({
    description: 'Type of content',
    enum: ['text'],
    example: 'text',
  })
  @IsEnum(['text'])
  type = 'text' as const;

  @ApiProperty({
    description: 'Text content',
    example: 'Hello, how can you help me today?',
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}

// Image content variant
export class ImageContentDto extends MessageContentDto {
  @ApiProperty({
    description: 'Type of content',
    enum: ['image_url'],
    example: 'image_url',
  })
  @IsEnum(['image_url'])
  type = 'image_url' as const;

  @ApiProperty({
    description: 'Image URL',
    example: 'https://example.com/image.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  imageUrl: string;

  @ApiPropertyOptional({
    description: 'Image quality detail level',
    enum: ['auto', 'low', 'high'],
    example: 'auto',
  })
  @IsOptional()
  @IsEnum(['auto', 'low', 'high'])
  detail?: 'auto' | 'low' | 'high';
}

// Union type for runtime usage
export type MessageContentUnion = TextContentDto | ImageContentDto;

export class MessageDto {
  @ApiProperty({
    description: 'Unique identifier for the conversation thread',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  threadId: string;

  @ApiProperty({
    description: 'Type of message sender',
    enum: ['human'],
    example: 'human',
  })
  @IsEnum(['human'])
  type: 'human';

  @ApiProperty({
    description: 'Array of message content items (text, images, etc.)',
    type: () => [MessageContentDto],
    example: [{ type: 'text', text: 'Hello, how can you help me today?' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageContentDto, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: TextContentDto, name: 'text' },
        { value: ImageContentDto, name: 'image_url' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  content: MessageContentDto[];
}

export class SseMessageDto {
  @ApiProperty({
    description: 'Unique identifier for the conversation thread',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  threadId: string;

  @ApiProperty({
    description: 'Type of message sender',
    enum: ['human'],
    example: 'human',
  })
  @IsEnum(['human'])
  type: 'human';

  @ApiProperty({
    description: 'Message content as a string',
    example: 'Hello, how can you help me today?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
