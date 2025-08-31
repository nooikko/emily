import type { MessageContent } from '@langchain/core/messages';
export class MessageResponseDto {
  id: string; // Unique identifier for the message
  type: 'human' | 'ai' | 'tool'; // Add other types as needed
  content: MessageContent;
}
