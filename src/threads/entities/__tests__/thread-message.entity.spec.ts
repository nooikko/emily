import { MessageContentType, MessageSender, ThreadMessage } from '../thread-message.entity';

describe('ThreadMessage Entity', () => {
  let message: ThreadMessage;
  const mockThreadId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    message = new ThreadMessage();
    message.id = '456e7890-e89b-12d3-a456-426614174000';
    message.threadId = mockThreadId;
    message.sender = MessageSender.HUMAN;
    message.contentType = MessageContentType.TEXT;
    message.content = 'Test message content';
    message.sequenceNumber = 0;
    message.isEdited = false;
    message.isDeleted = false;
    message.createdAt = new Date('2024-01-01T12:00:00Z');
    message.updatedAt = new Date('2024-01-01T12:00:00Z');
  });

  describe('Constructor and Properties', () => {
    it('should create a message with correct properties', () => {
      expect(message).toBeInstanceOf(ThreadMessage);
      expect(message.id).toBe('456e7890-e89b-12d3-a456-426614174000');
      expect(message.threadId).toBe(mockThreadId);
      expect(message.sender).toBe(MessageSender.HUMAN);
      expect(message.contentType).toBe(MessageContentType.TEXT);
      expect(message.content).toBe('Test message content');
      expect(message.sequenceNumber).toBe(0);
      expect(message.isEdited).toBe(false);
      expect(message.isDeleted).toBe(false);
    });

    it('should handle optional properties', () => {
      const newMessage = new ThreadMessage();
      expect(newMessage.role).toBeUndefined();
      expect(newMessage.parentMessageId).toBeUndefined();
      expect(newMessage.tokenCount).toBeUndefined();
      expect(newMessage.processingTimeMs).toBeUndefined();
      expect(newMessage.model).toBeUndefined();
      expect(newMessage.temperature).toBeUndefined();
      expect(newMessage.metadata).toBeUndefined();
      expect(newMessage.rawContent).toBeUndefined();
    });
  });

  describe('markAsEdited()', () => {
    it('should set isEdited to true', () => {
      expect(message.isEdited).toBe(false);
      message.markAsEdited();
      expect(message.isEdited).toBe(true);
    });

    it('should remain true if called multiple times', () => {
      message.markAsEdited();
      message.markAsEdited();
      expect(message.isEdited).toBe(true);
    });
  });

  describe('markAsDeleted()', () => {
    it('should set isDeleted to true', () => {
      expect(message.isDeleted).toBe(false);
      message.markAsDeleted();
      expect(message.isDeleted).toBe(true);
    });

    it('should remain true if called multiple times', () => {
      message.markAsDeleted();
      message.markAsDeleted();
      expect(message.isDeleted).toBe(true);
    });
  });

  describe('restore()', () => {
    it('should set isDeleted to false', () => {
      message.isDeleted = true;
      message.restore();
      expect(message.isDeleted).toBe(false);
    });

    it('should work when message is not deleted', () => {
      expect(message.isDeleted).toBe(false);
      message.restore();
      expect(message.isDeleted).toBe(false);
    });
  });

  describe('Sender Type Methods', () => {
    describe('isHuman()', () => {
      it('should return true for human messages', () => {
        message.sender = MessageSender.HUMAN;
        expect(message.isHuman()).toBe(true);
      });

      it('should return false for non-human messages', () => {
        message.sender = MessageSender.ASSISTANT;
        expect(message.isHuman()).toBe(false);

        message.sender = MessageSender.SYSTEM;
        expect(message.isHuman()).toBe(false);
      });
    });

    describe('isAssistant()', () => {
      it('should return true for assistant messages', () => {
        message.sender = MessageSender.ASSISTANT;
        expect(message.isAssistant()).toBe(true);
      });

      it('should return false for non-assistant messages', () => {
        message.sender = MessageSender.HUMAN;
        expect(message.isAssistant()).toBe(false);

        message.sender = MessageSender.SYSTEM;
        expect(message.isAssistant()).toBe(false);
      });
    });

    describe('isSystem()', () => {
      it('should return true for system messages', () => {
        message.sender = MessageSender.SYSTEM;
        expect(message.isSystem()).toBe(true);
      });

      it('should return false for non-system messages', () => {
        message.sender = MessageSender.HUMAN;
        expect(message.isSystem()).toBe(false);

        message.sender = MessageSender.ASSISTANT;
        expect(message.isSystem()).toBe(false);
      });
    });
  });

  describe('getContentPreview()', () => {
    it('should return full content if within limit', () => {
      message.content = 'Short message';
      const preview = message.getContentPreview(100);
      expect(preview).toBe('Short message');
    });

    it('should truncate content if exceeds limit', () => {
      message.content = 'This is a very long message that should be truncated';
      const preview = message.getContentPreview(20);
      expect(preview).toBe('This is a very lo...');
      expect(preview.length).toBe(20);
    });

    it('should use default maxLength of 100', () => {
      message.content = 'a'.repeat(150);
      const preview = message.getContentPreview();
      expect(preview.length).toBe(100);
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should handle empty content', () => {
      message.content = '';
      const preview = message.getContentPreview();
      expect(preview).toBe('');
    });

    it('should handle content exactly at limit', () => {
      const exactContent = 'a'.repeat(50);
      message.content = exactContent;
      const preview = message.getContentPreview(50);
      expect(preview).toBe(exactContent);
    });

    it('should handle single character limit', () => {
      message.content = 'hello';
      const preview = message.getContentPreview(1);
      expect(preview).toBe('');
    });

    it('should handle zero or negative limits', () => {
      message.content = 'hello';
      expect(message.getContentPreview(0)).toBe('');
      expect(message.getContentPreview(-5)).toBe('');
    });
  });

  describe('estimateTokenCount()', () => {
    it('should estimate token count based on content length', () => {
      message.content = 'Hello world'; // 11 characters
      message.estimateTokenCount();
      expect(message.tokenCount).toBe(Math.ceil(11 / 4)); // 3 tokens
    });

    it('should handle empty content', () => {
      message.content = '';
      message.estimateTokenCount();
      expect(message.tokenCount).toBe(0);
    });

    it('should round up for partial tokens', () => {
      message.content = 'a'.repeat(7); // 7 characters
      message.estimateTokenCount();
      expect(message.tokenCount).toBe(2); // Math.ceil(7/4) = 2
    });

    it('should handle very long content', () => {
      message.content = 'a'.repeat(1000);
      message.estimateTokenCount();
      expect(message.tokenCount).toBe(250); // 1000/4 = 250
    });

    it('should work with unicode characters', () => {
      message.content = '你好世界'; // 4 Chinese characters
      message.estimateTokenCount();
      expect(message.tokenCount).toBe(1); // Math.ceil(4/4) = 1
    });
  });

  describe('toSafeObject()', () => {
    it('should return sanitized object with all properties', () => {
      message.role = 'user';
      message.parentMessageId = 'parent-123';
      message.tokenCount = 10;
      message.processingTimeMs = 1500;
      message.model = 'gpt-4';
      message.temperature = 0.7;
      message.metadata = { source: 'web', language: 'en' };
      message.rawContent = [{ type: 'text', text: 'Hello' }];

      const safeObject = message.toSafeObject();

      expect(safeObject).toEqual({
        id: message.id,
        threadId: message.threadId,
        sender: message.sender,
        contentType: message.contentType,
        content: message.content,
        rawContent: message.rawContent,
        role: message.role,
        parentMessageId: message.parentMessageId,
        sequenceNumber: message.sequenceNumber,
        tokenCount: message.tokenCount,
        processingTimeMs: message.processingTimeMs,
        model: message.model,
        temperature: message.temperature,
        isEdited: message.isEdited,
        isDeleted: message.isDeleted,
        metadata: message.metadata,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      });
    });

    it('should handle undefined optional properties', () => {
      const safeObject = message.toSafeObject();

      expect(safeObject).toHaveProperty('rawContent', undefined);
      expect(safeObject).toHaveProperty('role', undefined);
      expect(safeObject).toHaveProperty('parentMessageId', undefined);
      expect(safeObject).toHaveProperty('tokenCount', undefined);
      expect(safeObject).toHaveProperty('processingTimeMs', undefined);
      expect(safeObject).toHaveProperty('model', undefined);
      expect(safeObject).toHaveProperty('temperature', undefined);
      expect(safeObject).toHaveProperty('metadata', undefined);
    });

    it('should not expose relationship properties', () => {
      const safeObject = message.toSafeObject();
      expect(safeObject).not.toHaveProperty('thread');
    });
  });

  describe('Raw Content Handling', () => {
    it('should handle text raw content', () => {
      message.rawContent = [{ type: 'text', text: 'Hello world' }];
      message.contentType = MessageContentType.TEXT;

      expect(message.rawContent).toHaveLength(1);
      expect(message.rawContent[0].type).toBe('text');
      expect(message.rawContent[0].text).toBe('Hello world');
    });

    it('should handle image raw content', () => {
      message.rawContent = [
        {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
          detail: 'auto',
        },
      ];
      message.contentType = MessageContentType.IMAGE;

      expect(message.rawContent).toHaveLength(1);
      expect(message.rawContent[0].type).toBe('image_url');
      expect(message.rawContent[0].imageUrl).toBe('https://example.com/image.jpg');
      expect(message.rawContent[0].detail).toBe('auto');
    });

    it('should handle mixed content types', () => {
      message.rawContent = [
        { type: 'text', text: 'Check out this image:' },
        {
          type: 'image_url',
          imageUrl: 'https://example.com/image.jpg',
          detail: 'high',
        },
      ];
      message.contentType = MessageContentType.MIXED;

      expect(message.rawContent).toHaveLength(2);
      expect(message.rawContent[0].type).toBe('text');
      expect(message.rawContent[1].type).toBe('image_url');
    });

    it('should handle file attachments', () => {
      message.rawContent = [
        {
          type: 'file',
          fileUrl: 'https://example.com/document.pdf',
          metadata: { fileName: 'document.pdf', size: 1024 },
        },
      ];
      message.contentType = MessageContentType.FILE;

      expect(message.rawContent).toHaveLength(1);
      expect(message.rawContent[0].type).toBe('file');
      expect(message.rawContent[0].fileUrl).toBe('https://example.com/document.pdf');
      expect(message.rawContent[0].metadata).toEqual({ fileName: 'document.pdf', size: 1024 });
    });
  });

  describe('Metadata Handling', () => {
    it('should handle comprehensive metadata', () => {
      message.metadata = {
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        sessionId: 'session-123',
        source: 'web',
        language: 'en',
        sentiment: 'positive',
        confidence: 0.95,
        usage: {
          promptTokens: 50,
          completionTokens: 75,
          totalTokens: 125,
        },
      };

      expect(message.metadata.userAgent).toBe('Mozilla/5.0');
      expect(message.metadata.usage?.totalTokens).toBe(125);
      expect(message.metadata.confidence).toBe(0.95);
    });

    it('should allow custom metadata properties', () => {
      message.metadata = {
        customField: 'customValue',
        anotherField: { nested: 'object' },
      };

      expect(message.metadata.customField).toBe('customValue');
      expect(message.metadata.anotherField).toEqual({ nested: 'object' });
    });
  });

  describe('Enum Values', () => {
    describe('MessageSender', () => {
      it('should have correct sender values', () => {
        expect(MessageSender.HUMAN).toBe('human');
        expect(MessageSender.ASSISTANT).toBe('assistant');
        expect(MessageSender.SYSTEM).toBe('system');
      });
    });

    describe('MessageContentType', () => {
      it('should have correct content type values', () => {
        expect(MessageContentType.TEXT).toBe('text');
        expect(MessageContentType.IMAGE).toBe('image');
        expect(MessageContentType.FILE).toBe('file');
        expect(MessageContentType.AUDIO).toBe('audio');
        expect(MessageContentType.VIDEO).toBe('video');
        expect(MessageContentType.MIXED).toBe('mixed');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long content efficiently', () => {
      const veryLongContent = 'word '.repeat(10000);
      message.content = veryLongContent;

      const startTime = Date.now();
      const preview = message.getContentPreview();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be fast
      expect(preview.length).toBeLessThanOrEqual(100);
    });

    it('should handle special characters in content', () => {
      message.content = 'Hello 世界! This has émojis 🎉 and special chars.';
      const preview = message.getContentPreview();
      expect(preview).toBe('Hello 世界! This has émojis 🎉 and special chars.');
    });

    it('should handle null/undefined in token estimation', () => {
      // @ts-expect-error Testing null content
      message.content = null;
      expect(() => message.estimateTokenCount()).toThrow();
    });

    it('should maintain consistency between operations', () => {
      message.markAsEdited();
      message.markAsDeleted();
      expect(message.isEdited).toBe(true);
      expect(message.isDeleted).toBe(true);

      message.restore();
      expect(message.isEdited).toBe(true); // Should remain edited
      expect(message.isDeleted).toBe(false);
    });

    it('should handle decimal temperature values', () => {
      message.temperature = 0.123456789;
      const safeObject = message.toSafeObject();
      expect(safeObject.temperature).toBe(0.123456789);
    });

    it('should handle large sequence numbers', () => {
      message.sequenceNumber = 999999999;
      expect(message.sequenceNumber).toBe(999999999);

      const safeObject = message.toSafeObject();
      expect(safeObject.sequenceNumber).toBe(999999999);
    });
  });
});
