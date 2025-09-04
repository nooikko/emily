import { HumanMessage } from '@langchain/core/messages';
import type { ImageContentDto, MessageDto, TextContentDto } from '../../dto/message.dto';
import { MessageUtil } from '../message.util';

describe('MessageUtil', () => {
  describe('toHumanMessages', () => {
    it('should convert message with single text content to HumanMessage', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'text',
            text: 'Hello, world!',
          } as TextContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(HumanMessage);
      expect(result[0].content).toBe('Hello, world!');
    });

    it('should convert message with multiple text contents to multiple HumanMessages', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'text',
            text: 'First message',
          } as TextContentDto,
          {
            type: 'text',
            text: 'Second message',
          } as TextContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(HumanMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[0].content).toBe('First message');
      expect(result[1].content).toBe('Second message');
    });

    it('should convert message with single image content to HumanMessage with structured content', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image.jpg',
            detail: 'high',
          } as ImageContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(HumanMessage);

      const message = result[0] as HumanMessage;
      expect(message.content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image.jpg',
            detail: 'high',
          },
        },
      ]);
    });

    it('should convert message with image content without detail property', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image.jpg',
          } as ImageContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(HumanMessage);

      const message = result[0] as HumanMessage;
      expect(message.content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image.jpg',
          },
        },
      ]);
    });

    it('should convert mixed content types to appropriate HumanMessages', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'text',
            text: 'Here is an image:',
          } as TextContentDto,
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image.jpg',
            detail: 'auto',
          } as ImageContentDto,
          {
            type: 'text',
            text: 'What do you think?',
          } as TextContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(3);

      // First message - text
      expect(result[0]).toBeInstanceOf(HumanMessage);
      expect(result[0].content).toBe('Here is an image:');

      // Second message - image
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image.jpg',
            detail: 'auto',
          },
        },
      ]);

      // Third message - text
      expect(result[2]).toBeInstanceOf(HumanMessage);
      expect(result[2].content).toBe('What do you think?');
    });

    it('should handle multiple images with different detail levels', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image1.jpg',
            detail: 'low',
          } as ImageContentDto,
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image2.jpg',
            detail: 'high',
          } as ImageContentDto,
          {
            type: 'image_url',
            imageUrl: 'https://example.com/image3.jpg',
          } as ImageContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(3);

      // Verify each image message structure
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image1.jpg',
            detail: 'low',
          },
        },
      ]);

      expect(result[1].content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image2.jpg',
            detail: 'high',
          },
        },
      ]);

      expect(result[2].content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image3.jpg',
          },
        },
      ]);
    });

    it('should handle empty content array', () => {
      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw error for unsupported content type', () => {
      // Intentionally create invalid message for error testing
      const invalidMessageDto = {
        threadId: 'thread-123',
        type: 'human' as const,
        content: [
          {
            type: 'unsupported_type' as const,
            data: 'some data',
          },
        ],
      } satisfies { threadId: string; type: 'human'; content: Array<{ type: string; data: unknown }> };

      expect(() => {
        MessageUtil.toHumanMessages(invalidMessageDto as any); // Cast needed for testing invalid data
      }).toThrow('Unsupported content type: unsupported_type');
    });

    it('should preserve all detail levels correctly', () => {
      const detailLevels: Array<'auto' | 'low' | 'high'> = ['auto', 'low', 'high'];

      detailLevels.forEach((detail) => {
        const messageDto: MessageDto = {
          threadId: 'thread-123',
          type: 'human',
          content: [
            {
              type: 'image_url',
              imageUrl: 'https://example.com/image.jpg',
              detail,
            } as ImageContentDto,
          ],
        };

        const result = MessageUtil.toHumanMessages(messageDto);
        const message = result[0] as HumanMessage;
        const content = message.content as Array<{ type: 'image_url'; image_url: { url: string; detail?: string } }>;

        expect(content[0].image_url.detail).toBe(detail);
      });
    });

    it('should handle text content with special characters and formatting', () => {
      const specialText = `Hello! 👋
      
This is a multi-line message with:
- Special characters: éñüø
- Symbols: @#$%^&*()
- Numbers: 123456
- Code: \`console.log("hello")\``;

      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [
          {
            type: 'text',
            text: specialText,
          } as TextContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(specialText);
    });

    it('should maintain type safety with discriminated union', () => {
      const textContent: TextContentDto = {
        type: 'text',
        text: 'Text content',
      };

      const imageContent: ImageContentDto = {
        type: 'image_url',
        imageUrl: 'https://example.com/image.jpg',
        detail: 'auto',
      };

      const messageDto: MessageDto = {
        threadId: 'thread-123',
        type: 'human',
        content: [textContent, imageContent],
      };

      const result = MessageUtil.toHumanMessages(messageDto);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Text content');
      expect(Array.isArray(result[1].content)).toBe(true);
    });

    it('should work with realistic conversation scenarios', () => {
      const conversationMessage: MessageDto = {
        threadId: 'thread-conversation-001',
        type: 'human',
        content: [
          {
            type: 'text',
            text: 'I need help analyzing this chart:',
          } as TextContentDto,
          {
            type: 'image_url',
            imageUrl: 'https://charts.example.com/sales-q4-2023.png',
            detail: 'high',
          } as ImageContentDto,
          {
            type: 'text',
            text: 'Can you tell me what trends you see?',
          } as TextContentDto,
        ],
      };

      const result = MessageUtil.toHumanMessages(conversationMessage);

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('I need help analyzing this chart:');
      expect(result[2].content).toBe('Can you tell me what trends you see?');

      const imageMessage = result[1] as HumanMessage;
      const imageContent = imageMessage.content as Array<{ type: 'image_url'; image_url: { url: string; detail: string } }>;
      expect(imageContent[0].image_url.url).toBe('https://charts.example.com/sales-q4-2023.png');
      expect(imageContent[0].image_url.detail).toBe('high');
    });
  });
});
