import 'reflect-metadata';
import { type ApiMessageContent, MessageResponseDto } from '../message.response.dto';

describe('MessageResponseDto', () => {
  describe('ApiMessageContent Type', () => {
    it('should accept string content', () => {
      const content: ApiMessageContent = 'Simple string response';

      expect(typeof content).toBe('string');
      expect(content).toBe('Simple string response');
    });

    it('should accept array content with text objects', () => {
      const content: ApiMessageContent = [
        { type: 'text', text: 'First text block' },
        { type: 'text', text: 'Second text block' },
      ];

      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      if (content[0].type === 'text') {
        expect(content[0].text).toBe('First text block');
      }
    });

    it('should accept array content with image_url objects', () => {
      const content: ApiMessageContent = [
        { type: 'image_url', image_url: 'https://example.com/image1.jpg' },
        { type: 'image_url', image_url: 'https://example.com/image2.jpg' },
      ];

      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('image_url');
      if (content[0].type === 'image_url') {
        expect(content[0].image_url).toBe('https://example.com/image1.jpg');
      }
    });

    it('should accept mixed array content with text and image objects', () => {
      const content: ApiMessageContent = [
        { type: 'text', text: 'Here is an image:' },
        { type: 'image_url', image_url: 'https://example.com/image.jpg' },
        { type: 'text', text: 'What do you think?' },
      ];

      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(3);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image_url');
      expect(content[2].type).toBe('text');
    });

    it('should handle empty array content', () => {
      const content: ApiMessageContent = [];

      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(0);
    });
  });

  describe('MessageResponseDto Class', () => {
    it('should create instance with string content', () => {
      const response = new MessageResponseDto();
      response.id = 'msg-123';
      response.type = 'ai';
      response.content = 'Hello, how can I help you?';

      expect(response.id).toBe('msg-123');
      expect(response.type).toBe('ai');
      expect(response.content).toBe('Hello, how can I help you?');
      expect(typeof response.content).toBe('string');
    });

    it('should create instance with array content', () => {
      const response = new MessageResponseDto();
      response.id = 'msg-456';
      response.type = 'ai';
      response.content = [
        { type: 'text', text: 'Here is your answer:' },
        { type: 'text', text: 'Hope this helps!' },
      ];

      expect(response.id).toBe('msg-456');
      expect(response.type).toBe('ai');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content).toHaveLength(2);
    });

    it('should support all valid message types', () => {
      const types: Array<'human' | 'ai' | 'tool'> = ['human', 'ai', 'tool'];

      types.forEach((type) => {
        const response = new MessageResponseDto();
        response.id = `msg-${type}`;
        response.type = type;
        response.content = `This is a ${type} message`;

        expect(response.type).toBe(type);
        expect(response.content).toBe(`This is a ${type} message`);
      });
    });

    it('should handle complex structured content', () => {
      const response = new MessageResponseDto();
      response.id = 'msg-complex';
      response.type = 'ai';
      response.content = [
        { type: 'text', text: 'I found this information for you:' },
        { type: 'image_url', image_url: 'https://api.example.com/chart.png' },
        { type: 'text', text: 'The chart shows the current trends.' },
        { type: 'text', text: 'Would you like more details?' },
      ];

      expect(response.content).toHaveLength(4);

      const content = response.content as Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: string }>;

      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image_url');
      expect(content[2].type).toBe('text');
      expect(content[3].type).toBe('text');
    });
  });

  describe('Type Guards and Runtime Checks', () => {
    it('should differentiate between string and array content at runtime', () => {
      const stringResponse = new MessageResponseDto();
      stringResponse.content = 'String content';

      const arrayResponse = new MessageResponseDto();
      arrayResponse.content = [{ type: 'text', text: 'Array content' }];

      // Runtime type checks
      expect(typeof stringResponse.content).toBe('string');
      expect(Array.isArray(stringResponse.content)).toBe(false);

      expect(typeof arrayResponse.content).toBe('object');
      expect(Array.isArray(arrayResponse.content)).toBe(true);
    });

    it('should handle content type checking in array format', () => {
      const response = new MessageResponseDto();
      response.content = [
        { type: 'text', text: 'Text content' },
        { type: 'image_url', image_url: 'https://example.com/image.jpg' },
      ];

      if (Array.isArray(response.content)) {
        for (const item of response.content) {
          expect(['text', 'image_url']).toContain(item.type);

          if (item.type === 'text') {
            expect('text' in item).toBe(true);
            expect(typeof item.text).toBe('string');
          }

          if (item.type === 'image_url') {
            expect('image_url' in item).toBe(true);
            expect(typeof item.image_url).toBe('string');
          }
        }
      }
    });
  });

  describe('API Property Decorators', () => {
    it('should have decorators applied (functional test)', () => {
      // Test that the class can be instantiated and used
      const response = new MessageResponseDto();
      response.id = 'test-id';
      response.type = 'ai';
      response.content = 'Test content';

      // Verify the properties exist and work correctly
      expect(response.id).toBe('test-id');
      expect(response.type).toBe('ai');
      expect(response.content).toBe('Test content');
    });

    it('should support all valid message types through enum', () => {
      const validTypes: Array<'human' | 'ai' | 'tool'> = ['human', 'ai', 'tool'];

      validTypes.forEach((type) => {
        const response = new MessageResponseDto();
        response.type = type;
        expect(response.type).toBe(type);
      });
    });
  });
});
