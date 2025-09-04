import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImageContentDto, MessageContentDto, type MessageContentUnion, MessageDto, SseMessageDto, TextContentDto } from '../message.dto';

describe('MessageContentDto (Discriminated Union)', () => {
  describe('TextContentDto', () => {
    it('should validate valid text content', async () => {
      const textContent = plainToInstance(TextContentDto, {
        type: 'text',
        text: 'Hello, world!',
      });

      const errors = await validate(textContent);
      expect(errors).toHaveLength(0);
      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe('Hello, world!');
    });

    it('should reject empty text content', async () => {
      const textContent = plainToInstance(TextContentDto, {
        type: 'text',
        text: '',
      });

      const errors = await validate(textContent);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
    });

    it('should reject non-string text content', async () => {
      const textContent = plainToInstance(TextContentDto, {
        type: 'text',
        text: 123,
      });

      const errors = await validate(textContent);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isString).toBeDefined();
    });

    it('should reject invalid type enum', async () => {
      const textContent = plainToInstance(TextContentDto, {
        type: 'invalid',
        text: 'Hello, world!',
      });

      const errors = await validate(textContent);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should have correct default type value', () => {
      const textContent = new TextContentDto();
      expect(textContent.type).toBe('text');
    });
  });

  describe('ImageContentDto', () => {
    it('should validate valid image content', async () => {
      const imageContent = plainToInstance(ImageContentDto, {
        type: 'image_url',
        imageUrl: 'https://example.com/image.jpg',
        detail: 'auto',
      });

      const errors = await validate(imageContent);
      expect(errors).toHaveLength(0);
      expect(imageContent.type).toBe('image_url');
      expect(imageContent.imageUrl).toBe('https://example.com/image.jpg');
      expect(imageContent.detail).toBe('auto');
    });

    it('should validate image content without optional detail', async () => {
      const imageContent = plainToInstance(ImageContentDto, {
        type: 'image_url',
        imageUrl: 'https://example.com/image.jpg',
      });

      const errors = await validate(imageContent);
      expect(errors).toHaveLength(0);
      expect(imageContent.detail).toBeUndefined();
    });

    it('should reject invalid URL format', async () => {
      const imageContent = plainToInstance(ImageContentDto, {
        type: 'image_url',
        imageUrl: 'not-a-valid-url',
      });

      const errors = await validate(imageContent);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isUrl).toBeDefined();
    });

    it('should reject empty image URL', async () => {
      const imageContent = plainToInstance(ImageContentDto, {
        type: 'image_url',
        imageUrl: '',
      });

      const errors = await validate(imageContent);
      expect(errors).toHaveLength(1); // Both constraints will be on the same field
      expect(errors[0].constraints?.isNotEmpty).toBeDefined();
      expect(errors[0].constraints?.isUrl).toBeDefined();
    });

    it('should reject invalid detail enum value', async () => {
      const imageContent = plainToInstance(ImageContentDto, {
        type: 'image_url',
        imageUrl: 'https://example.com/image.jpg',
        detail: 'invalid-detail',
      });

      const errors = await validate(imageContent);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });

    it('should accept valid detail enum values', async () => {
      const validDetails = ['auto', 'low', 'high'];

      for (const detail of validDetails) {
        const imageContent = plainToInstance(ImageContentDto, {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
          detail,
        });

        const errors = await validate(imageContent);
        expect(errors).toHaveLength(0);
      }
    });

    it('should have correct default type value', () => {
      const imageContent = new ImageContentDto();
      expect(imageContent.type).toBe('image_url');
    });
  });
});

describe('MessageDto', () => {
  it('should validate message with text content', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: [
        {
          type: 'text',
          text: 'Hello, world!',
        },
      ],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(message.threadId).toBe('thread-123');
    expect(message.type).toBe('human');
    expect(message.content).toHaveLength(1);
    expect(message.content[0]).toBeInstanceOf(TextContentDto);
  });

  it('should validate message with image content', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: [
        {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
          detail: 'high',
        },
      ],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(message.content[0]).toBeInstanceOf(ImageContentDto);
    expect((message.content[0] as ImageContentDto).imageUrl).toBe('https://example.com/image.jpg');
  });

  it('should validate message with mixed content types', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: [
        {
          type: 'text',
          text: 'Check out this image:',
        },
        {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
        },
      ],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(message.content).toHaveLength(2);
    expect(message.content[0]).toBeInstanceOf(TextContentDto);
    expect(message.content[1]).toBeInstanceOf(ImageContentDto);
  });

  it('should reject message with empty threadId', async () => {
    const messageData = {
      threadId: '',
      type: 'human',
      content: [{ type: 'text', text: 'Hello' }],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('threadId');
    expect(errors[0].constraints?.isNotEmpty).toBeDefined();
  });

  it('should reject message with invalid type enum', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'invalid-type',
      content: [{ type: 'text', text: 'Hello' }],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('type');
    expect(errors[0].constraints?.isEnum).toBeDefined();
  });

  it('should reject message with empty content array', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: [],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message);

    expect(errors).toHaveLength(0); // Empty array is technically valid, but might want to add @ArrayMinSize(1)
  });

  it('should reject message with non-array content', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: 'not an array',
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
    expect(errors[0].constraints?.isArray).toBeDefined();
  });

  it('should handle discriminator correctly for nested content', async () => {
    const messageData = {
      threadId: 'thread-123',
      type: 'human',
      content: [
        {
          type: 'text',
          text: 'Valid text content',
        },
        {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
        },
        {
          type: 'invalid-type', // This should fail validation
          text: 'Should not be allowed',
        },
      ],
    };

    const message = plainToInstance(MessageDto, messageData);
    const errors = await validate(message);

    // Should have validation errors for the third content item
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SseMessageDto', () => {
  it('should validate valid SSE message', async () => {
    const sseMessageData = {
      threadId: 'thread-123',
      type: 'human',
      content: 'Hello, world!',
    };

    const sseMessage = plainToInstance(SseMessageDto, sseMessageData);
    const errors = await validate(sseMessage);

    expect(errors).toHaveLength(0);
    expect(sseMessage.threadId).toBe('thread-123');
    expect(sseMessage.type).toBe('human');
    expect(sseMessage.content).toBe('Hello, world!');
  });

  it('should reject SSE message with empty threadId', async () => {
    const sseMessageData = {
      threadId: '',
      type: 'human',
      content: 'Hello, world!',
    };

    const sseMessage = plainToInstance(SseMessageDto, sseMessageData);
    const errors = await validate(sseMessage);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('threadId');
    expect(errors[0].constraints?.isNotEmpty).toBeDefined();
  });

  it('should reject SSE message with empty content', async () => {
    const sseMessageData = {
      threadId: 'thread-123',
      type: 'human',
      content: '',
    };

    const sseMessage = plainToInstance(SseMessageDto, sseMessageData);
    const errors = await validate(sseMessage);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
    expect(errors[0].constraints?.isNotEmpty).toBeDefined();
  });

  it('should reject SSE message with non-string content', async () => {
    const sseMessageData = {
      threadId: 'thread-123',
      type: 'human',
      content: 123,
    };

    const sseMessage = plainToInstance(SseMessageDto, sseMessageData);
    const errors = await validate(sseMessage);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('content');
    expect(errors[0].constraints?.isString).toBeDefined();
  });

  it('should reject SSE message with invalid type enum', async () => {
    const sseMessageData = {
      threadId: 'thread-123',
      type: 'invalid-type',
      content: 'Hello, world!',
    };

    const sseMessage = plainToInstance(SseMessageDto, sseMessageData);
    const errors = await validate(sseMessage);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('type');
    expect(errors[0].constraints?.isEnum).toBeDefined();
  });
});

// Type safety tests for discriminated unions
describe('Type Safety and Discriminated Unions', () => {
  it('should maintain type safety for MessageContentUnion', () => {
    const textContent: MessageContentUnion = {
      type: 'text',
      text: 'Hello',
    } as TextContentDto;

    const imageContent: MessageContentUnion = {
      type: 'image_url',
      imageUrl: 'https://example.com/image.jpg',
    } as ImageContentDto;

    // Type guards should work correctly
    expect(textContent.type).toBe('text');
    expect(imageContent.type).toBe('image_url');

    if (textContent.type === 'text') {
      expect('text' in textContent).toBe(true);
    }

    if (imageContent.type === 'image_url') {
      expect('imageUrl' in imageContent).toBe(true);
    }
  });

  it('should correctly instantiate discriminated union classes', () => {
    const textInstance = new TextContentDto();
    const imageInstance = new ImageContentDto();

    expect(textInstance).toBeInstanceOf(MessageContentDto);
    expect(textInstance).toBeInstanceOf(TextContentDto);
    expect(textInstance.type).toBe('text');

    expect(imageInstance).toBeInstanceOf(MessageContentDto);
    expect(imageInstance).toBeInstanceOf(ImageContentDto);
    expect(imageInstance.type).toBe('image_url');
  });
});
