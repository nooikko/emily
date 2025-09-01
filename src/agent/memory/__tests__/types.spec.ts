import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { MemoryDocument, MemoryMetadata, QdrantConfig } from '../types';
import { isAIMessage, isHumanMessage, isSystemMessage, isValidMemoryDocument, isValidMemoryMetadata, isValidQdrantConfig } from '../types';

describe('Message Type Guards', () => {
  describe('isHumanMessage', () => {
    it('should return true for HumanMessage', () => {
      const message = new HumanMessage({ content: 'Human message' });

      expect(isHumanMessage(message)).toBe(true);
    });

    it('should return false for AIMessage', () => {
      const message = new AIMessage({ content: 'AI message' });

      expect(isHumanMessage(message)).toBe(false);
    });

    it('should return false for SystemMessage', () => {
      const message = new SystemMessage({ content: 'System message' });

      expect(isHumanMessage(message)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isHumanMessage(null as any)).toBeFalsy();
      expect(isHumanMessage(undefined as any)).toBeFalsy();
    });

    it('should return false for non-message objects', () => {
      const notAMessage = { content: 'Not a message' };

      expect(isHumanMessage(notAMessage as any)).toBe(false);
    });
  });

  describe('isAIMessage', () => {
    it('should return true for AIMessage', () => {
      const message = new AIMessage({ content: 'AI message' });

      expect(isAIMessage(message)).toBe(true);
    });

    it('should return false for HumanMessage', () => {
      const message = new HumanMessage({ content: 'Human message' });

      expect(isAIMessage(message)).toBe(false);
    });

    it('should return false for SystemMessage', () => {
      const message = new SystemMessage({ content: 'System message' });

      expect(isAIMessage(message)).toBe(false);
    });

    it('should return true for ChatMessage (considered AI message)', () => {
      // Create a mock ChatMessage by simulating the constructor name
      const mockChatMessage = {
        content: 'Chat message',
        constructor: { name: 'ChatMessage' },
      };

      expect(isAIMessage(mockChatMessage as any)).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(isAIMessage(null as any)).toBeFalsy();
      expect(isAIMessage(undefined as any)).toBeFalsy();
    });

    it('should return false for non-message objects', () => {
      const notAMessage = { content: 'Not a message' };

      expect(isAIMessage(notAMessage as any)).toBe(false);
    });
  });

  describe('isSystemMessage', () => {
    it('should return true for SystemMessage', () => {
      const message = new SystemMessage({ content: 'System message' });

      expect(isSystemMessage(message)).toBe(true);
    });

    it('should return false for HumanMessage', () => {
      const message = new HumanMessage({ content: 'Human message' });

      expect(isSystemMessage(message)).toBe(false);
    });

    it('should return false for AIMessage', () => {
      const message = new AIMessage({ content: 'AI message' });

      expect(isSystemMessage(message)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isSystemMessage(null as any)).toBeFalsy();
      expect(isSystemMessage(undefined as any)).toBeFalsy();
    });

    it('should return false for non-message objects', () => {
      const notAMessage = { content: 'Not a message' };

      expect(isSystemMessage(notAMessage as any)).toBe(false);
    });
  });
});

describe('Configuration Type Guards', () => {
  describe('isValidQdrantConfig', () => {
    const validConfig: QdrantConfig = {
      url: 'http://localhost',
      port: 6333,
      apiKey: 'test-key',
      collectionName: 'test-collection',
    };

    it('should return true for valid config with all fields', () => {
      expect(isValidQdrantConfig(validConfig)).toBe(true);
    });

    it('should return true for valid config without optional fields', () => {
      const minimalConfig = {
        url: 'http://localhost',
        collectionName: 'test-collection',
      };

      expect(isValidQdrantConfig(minimalConfig)).toBe(true);
    });

    it('should return true for valid config with undefined optional fields', () => {
      const configWithUndefined = {
        url: 'http://localhost',
        collectionName: 'test-collection',
        port: undefined,
        apiKey: undefined,
      };

      expect(isValidQdrantConfig(configWithUndefined)).toBe(true);
    });

    it('should return false for missing url', () => {
      const invalidConfig = {
        collectionName: 'test-collection',
        port: 6333,
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for missing collectionName', () => {
      const invalidConfig = {
        url: 'http://localhost',
        port: 6333,
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for non-string url', () => {
      const invalidConfig = {
        url: 123,
        collectionName: 'test-collection',
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for non-string collectionName', () => {
      const invalidConfig = {
        url: 'http://localhost',
        collectionName: 123,
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for non-number port', () => {
      const invalidConfig = {
        url: 'http://localhost',
        collectionName: 'test-collection',
        port: 'not-a-number',
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for non-string apiKey', () => {
      const invalidConfig = {
        url: 'http://localhost',
        collectionName: 'test-collection',
        apiKey: 123,
      };

      expect(isValidQdrantConfig(invalidConfig)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidQdrantConfig(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidQdrantConfig(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidQdrantConfig('string')).toBe(false);
      expect(isValidQdrantConfig(123)).toBe(false);
      expect(isValidQdrantConfig([])).toBe(false);
    });
  });
});

describe('Memory Type Guards', () => {
  describe('isValidMemoryMetadata', () => {
    const validMetadata: MemoryMetadata = {
      threadId: 'test-thread',
      timestamp: 1234567890,
      messageType: 'human',
      importance: 5,
      summary: 'Test summary',
      tags: ['tag1', 'tag2'],
      source: 'test-source',
    };

    it('should return true for valid metadata with all fields', () => {
      expect(isValidMemoryMetadata(validMetadata)).toBe(true);
    });

    it('should return true for valid metadata with required fields only', () => {
      const minimalMetadata = {
        threadId: 'test-thread',
        timestamp: 1234567890,
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(minimalMetadata)).toBe(true);
    });

    it('should return true for ai messageType', () => {
      const metadata = {
        threadId: 'test-thread',
        timestamp: 1234567890,
        messageType: 'ai',
      };

      expect(isValidMemoryMetadata(metadata)).toBe(true);
    });

    it('should return false for missing threadId', () => {
      const invalidMetadata = {
        timestamp: 1234567890,
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for missing timestamp', () => {
      const invalidMetadata = {
        threadId: 'test-thread',
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for missing messageType', () => {
      const invalidMetadata = {
        threadId: 'test-thread',
        timestamp: 1234567890,
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for non-string threadId', () => {
      const invalidMetadata = {
        threadId: 123,
        timestamp: 1234567890,
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for non-number timestamp', () => {
      const invalidMetadata = {
        threadId: 'test-thread',
        timestamp: 'not-a-number',
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for invalid messageType', () => {
      const invalidMetadata = {
        threadId: 'test-thread',
        timestamp: 1234567890,
        messageType: 'invalid',
      };

      expect(isValidMemoryMetadata(invalidMetadata)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidMemoryMetadata(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidMemoryMetadata(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidMemoryMetadata('string')).toBe(false);
      expect(isValidMemoryMetadata(123)).toBe(false);
      expect(isValidMemoryMetadata([])).toBe(false);
    });
  });

  describe('isValidMemoryDocument', () => {
    const validDocument: MemoryDocument = {
      content: 'Test memory content',
      metadata: {
        threadId: 'test-thread',
        timestamp: 1234567890,
        messageType: 'human',
      },
    };

    it('should return true for valid document', () => {
      expect(isValidMemoryDocument(validDocument)).toBe(true);
    });

    it('should return true for document with extended metadata', () => {
      const documentWithExtendedMetadata = {
        content: 'Test memory content',
        metadata: {
          threadId: 'test-thread',
          timestamp: 1234567890,
          messageType: 'ai',
          importance: 8,
          summary: 'Important memory',
          tags: ['important'],
        },
      };

      expect(isValidMemoryDocument(documentWithExtendedMetadata)).toBe(true);
    });

    it('should return false for missing content', () => {
      const invalidDocument = {
        metadata: {
          threadId: 'test-thread',
          timestamp: 1234567890,
          messageType: 'human',
        },
      };

      expect(isValidMemoryDocument(invalidDocument)).toBe(false);
    });

    it('should return false for missing metadata', () => {
      const invalidDocument = {
        content: 'Test memory content',
      };

      expect(isValidMemoryDocument(invalidDocument)).toBe(false);
    });

    it('should return false for non-string content', () => {
      const invalidDocument = {
        content: 123,
        metadata: {
          threadId: 'test-thread',
          timestamp: 1234567890,
          messageType: 'human',
        },
      };

      expect(isValidMemoryDocument(invalidDocument)).toBe(false);
    });

    it('should return false for invalid metadata', () => {
      const invalidDocument = {
        content: 'Test memory content',
        metadata: {
          threadId: 'test-thread',
          // Missing timestamp and messageType
        },
      };

      expect(isValidMemoryDocument(invalidDocument)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidMemoryDocument(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidMemoryDocument(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidMemoryDocument('string')).toBe(false);
      expect(isValidMemoryDocument(123)).toBe(false);
      expect(isValidMemoryDocument([])).toBe(false);
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('Message type guards with edge cases', () => {
    it('should handle objects with null constructor', () => {
      const messageWithNullConstructor = {
        content: 'Test',
        constructor: null,
      };

      expect(isHumanMessage(messageWithNullConstructor as any)).toBeFalsy();
      expect(isAIMessage(messageWithNullConstructor as any)).toBeFalsy();
      expect(isSystemMessage(messageWithNullConstructor as any)).toBeFalsy();
    });

    it('should handle objects with undefined constructor', () => {
      const messageWithUndefinedConstructor = {
        content: 'Test',
        constructor: undefined,
      };

      expect(isHumanMessage(messageWithUndefinedConstructor as any)).toBeFalsy();
      expect(isAIMessage(messageWithUndefinedConstructor as any)).toBeFalsy();
      expect(isSystemMessage(messageWithUndefinedConstructor as any)).toBeFalsy();
    });

    it('should handle objects with constructor without name', () => {
      const messageWithConstructorWithoutName = {
        content: 'Test',
        constructor: {},
      };

      expect(isHumanMessage(messageWithConstructorWithoutName as any)).toBe(false);
      expect(isAIMessage(messageWithConstructorWithoutName as any)).toBe(false);
      expect(isSystemMessage(messageWithConstructorWithoutName as any)).toBe(false);
    });
  });

  describe('Validation with circular references', () => {
    it('should handle circular references in config validation', () => {
      const circularConfig: any = {
        url: 'http://localhost',
        collectionName: 'test',
      };
      circularConfig.self = circularConfig;

      // Should not throw and should still validate the required properties
      expect(isValidQdrantConfig(circularConfig)).toBe(true);
    });

    it('should handle circular references in metadata validation', () => {
      const circularMetadata: any = {
        threadId: 'test-thread',
        timestamp: 1234567890,
        messageType: 'human',
      };
      circularMetadata.self = circularMetadata;

      // Should not throw and should still validate the required properties
      expect(isValidMemoryMetadata(circularMetadata)).toBe(true);
    });
  });

  describe('Type coercion edge cases', () => {
    it('should not coerce string numbers for timestamp', () => {
      const metadataWithStringTimestamp = {
        threadId: 'test-thread',
        timestamp: '1234567890', // String instead of number
        messageType: 'human',
      };

      expect(isValidMemoryMetadata(metadataWithStringTimestamp)).toBe(false);
    });

    it('should not coerce string numbers for port', () => {
      const configWithStringPort = {
        url: 'http://localhost',
        collectionName: 'test',
        port: '6333', // String instead of number
      };

      expect(isValidQdrantConfig(configWithStringPort)).toBe(false);
    });
  });
});
