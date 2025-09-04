import { ApiProperty } from '@nestjs/swagger';

export class StreamResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the stream response',
    example: 'stream-123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Content of the stream response',
    example: 'Here is the response to your query...',
  })
  content: string;
}
