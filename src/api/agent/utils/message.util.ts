import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { ImageContentDto, MessageContentDto, MessageDto, TextContentDto } from '../dto/message.dto';

// Type guard functions for content discrimination
function isTextContent(content: MessageContentDto): content is TextContentDto {
  return content.type === 'text';
}

function isImageContent(content: MessageContentDto): content is ImageContentDto {
  return content.type === 'image_url';
}

export class MessageUtil {
  static toHumanMessages(message: MessageDto): BaseMessage[] {
    const messages: BaseMessage[] = [];

    for (const content of message.content) {
      if (isTextContent(content)) {
        messages.push(new HumanMessage(content.text));
      } else if (isImageContent(content)) {
        // For image content, create a message with structured content
        const messageContent = [
          {
            type: 'image_url' as const,
            image_url: {
              url: content.imageUrl,
              ...(content.detail && { detail: content.detail }),
            },
          },
        ];
        messages.push(new HumanMessage({ content: messageContent }));
      } else {
        // TypeScript exhaustiveness check - this should never happen with proper discriminated unions
        throw new Error(`Unsupported content type: ${(content as { type: string }).type}`);
      }
    }

    return messages;
  }
}
