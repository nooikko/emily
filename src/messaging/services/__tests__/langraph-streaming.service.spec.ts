import { AIMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, Subject } from 'rxjs';
import { RedisService } from '../../redis/redis.service';
import { type LangGraphStreamEvent, LangGraphStreamEventType, LangGraphStreamingService } from '../langraph-streaming.service';

describe('LangGraphStreamingService', () => {
  let service: LangGraphStreamingService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisSubject = new Subject<string>();

  beforeEach(async () => {
    const mockRedisService = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(mockRedisSubject.asObservable()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphStreamingService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<LangGraphStreamingService>(LangGraphStreamingService);
    redisService = module.get(RedisService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('startConversationStream', () => {
    it('should start a new conversation stream', (done) => {
      const threadId = 'test-thread-id';
      const metadata = { source: 'test' };

      const stream = service.startConversationStream(threadId, metadata);

      expect(redisService.subscribe).toHaveBeenCalledWith(`langraph:thread:${threadId}`);
      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.CONVERSATION_START),
      );

      // Verify stream subscription
      stream.subscribe({
        next: (event) => {
          expect(event).toBeDefined();
          done();
        },
      });

      // Simulate Redis message
      const testEvent: LangGraphStreamEvent = {
        eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
        threadId,
        timestamp: Date.now(),
        data: { chunk: 'test chunk' },
      };
      mockRedisSubject.next(JSON.stringify(testEvent));
    });

    it('should reuse existing stream for same thread', () => {
      const threadId = 'test-thread-id';

      const stream1 = service.startConversationStream(threadId);
      const stream2 = service.startConversationStream(threadId);

      expect(stream1).toBeDefined();
      expect(stream2).toBeDefined();

      // Should call subscribe for each stream creation plus global
      expect(redisService.subscribe).toHaveBeenCalledTimes(3); // Once for global, twice for threads
    });

    it('should update conversation state when starting stream', () => {
      const threadId = 'test-thread-id';
      const metadata = { source: 'test', userId: '123' };

      service.startConversationStream(threadId, metadata);

      const states = service.getConversationStates();
      const threadState = states.find((s) => s.threadId === threadId);

      expect(threadState).toBeDefined();
      expect(threadState!.isActive).toBe(true);
      expect(threadState!.subscriberCount).toBe(1);
      expect(threadState!.metadata).toEqual(metadata);
    });
  });

  describe('stopConversationStream', () => {
    it('should stop conversation stream and clean up', () => {
      const threadId = 'test-thread-id';

      // Start stream first
      service.startConversationStream(threadId);

      // Stop stream
      service.stopConversationStream(threadId);

      const states = service.getConversationStates();
      const threadState = states.find((s) => s.threadId === threadId);

      expect(threadState).toBeUndefined();
    });

    it('should emit completion event when stopping', () => {
      const threadId = 'test-thread-id';

      service.startConversationStream(threadId);
      service.stopConversationStream(threadId);

      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.CONVERSATION_COMPLETE),
      );
    });
  });

  describe('emitConversationEvent', () => {
    it('should publish event to Redis channels', async () => {
      const threadId = 'test-thread-id';
      const eventType = LangGraphStreamEventType.MESSAGE_CHUNK;
      const data = { chunk: 'Hello world' };

      await service.emitConversationEvent(threadId, eventType, data);

      expect(redisService.publish).toHaveBeenCalledWith(`langraph:thread:${threadId}`, expect.stringContaining(eventType));
      expect(redisService.publish).toHaveBeenCalledWith('langraph:global', expect.stringContaining(eventType));
    });

    it('should handle Redis publish errors gracefully', async () => {
      const threadId = 'test-thread-id';
      const eventType = LangGraphStreamEventType.MESSAGE_CHUNK;
      const data = { chunk: 'Hello world' };

      redisService.publish.mockRejectedValueOnce(new Error('Redis error'));

      // Should not throw
      await expect(service.emitConversationEvent(threadId, eventType, data)).resolves.toBeUndefined();
    });
  });

  describe('streamMessageChunks', () => {
    it('should stream message chunks from async iterable', async () => {
      const threadId = 'test-thread-id';
      const messageId = 'test-message-id';
      const chunks = ['Hello', ' ', 'world', '!'];

      async function* generateChunks() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      await service.streamMessageChunks(threadId, messageId, generateChunks());

      // Should publish each chunk + completion event (each published to both thread and global channels)
      expect(redisService.publish).toHaveBeenCalledTimes((chunks.length + 1) * 2);

      // Verify chunk events
      for (let i = 0; i < chunks.length; i++) {
        expect(redisService.publish).toHaveBeenCalledWith(`langraph:thread:${threadId}`, expect.stringContaining(chunks[i]));
      }

      // Verify completion event
      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.MESSAGE_COMPLETE),
      );
    });

    it('should handle streaming errors', async () => {
      const threadId = 'test-thread-id';
      const messageId = 'test-message-id';

      async function* failingGenerator() {
        yield 'Hello';
        throw new Error('Streaming failed');
      }

      await service.streamMessageChunks(threadId, messageId, failingGenerator());

      // Should emit error event
      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.CONVERSATION_ERROR),
      );
    });
  });

  describe('streamStateUpdate', () => {
    it('should stream state update events', async () => {
      const threadId = 'test-thread-id';
      const state = { currentStep: 'processing', progress: 0.5 };
      const metadata = { timestamp: Date.now() };

      await service.streamStateUpdate(threadId, state, metadata);

      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.STATE_UPDATE),
      );
    });
  });

  describe('streamToolCall', () => {
    it('should stream tool call start and complete events', async () => {
      const threadId = 'test-thread-id';
      const toolName = 'calculator';
      const args = { operation: 'add', a: 1, b: 2 };
      const result = { result: 3 };

      await service.streamToolCall(threadId, toolName, args, result);

      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.TOOL_CALL_START),
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.TOOL_CALL_COMPLETE),
      );
    });

    it('should only emit start event when no result provided', async () => {
      const threadId = 'test-thread-id';
      const toolName = 'calculator';
      const args = { operation: 'add', a: 1, b: 2 };

      await service.streamToolCall(threadId, toolName, args);

      expect(redisService.publish).toHaveBeenCalledTimes(2); // thread + global
      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.TOOL_CALL_START),
      );
    });
  });

  describe('streamAgentThinking', () => {
    it('should stream agent thinking events', async () => {
      const threadId = 'test-thread-id';
      const thinking = 'I need to process this request...';
      const metadata = { step: 'analysis' };

      await service.streamAgentThinking(threadId, thinking, metadata);

      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.AGENT_THINKING),
      );
    });
  });

  describe('streamAgentResponse', () => {
    it('should stream agent response events', async () => {
      const threadId = 'test-thread-id';
      const message = new AIMessage('Here is my response');
      const metadata = { confidence: 0.95 };

      await service.streamAgentResponse(threadId, message, metadata);

      expect(redisService.publish).toHaveBeenCalledWith(
        `langraph:thread:${threadId}`,
        expect.stringContaining(LangGraphStreamEventType.AGENT_RESPONSE),
      );
    });
  });

  describe('getGlobalStream', () => {
    it('should return global stream observable', (done) => {
      const globalStream = service.getGlobalStream();

      expect(globalStream).toBeInstanceOf(Observable);

      // Test that it receives events
      globalStream.subscribe({
        next: (event) => {
          expect(event).toBeDefined();
          expect(event.eventType).toBeDefined();
          done();
        },
      });

      // Simulate a global event
      const testEvent: LangGraphStreamEvent = {
        eventType: LangGraphStreamEventType.CONVERSATION_START,
        threadId: 'test-thread',
        timestamp: Date.now(),
        data: { conversationId: 'test-thread' },
      };

      // This would normally come through Redis global subscription
      (service as any).globalStream$.next(testEvent);
    });
  });

  describe('getConversationStates', () => {
    it('should return array of conversation states', () => {
      const threadId1 = 'thread-1';
      const threadId2 = 'thread-2';

      service.startConversationStream(threadId1, { source: 'test1' });
      service.startConversationStream(threadId2, { source: 'test2' });

      const states = service.getConversationStates();

      expect(states).toHaveLength(2);
      expect(states.map((s) => s.threadId)).toContain(threadId1);
      expect(states.map((s) => s.threadId)).toContain(threadId2);
    });
  });

  describe('getActiveConversationCount', () => {
    it('should return count of active conversations', () => {
      service.startConversationStream('thread-1');
      service.startConversationStream('thread-2');

      const count = service.getActiveConversationCount();

      expect(count).toBe(2);
    });
  });

  describe('cleanupInactiveConversations', () => {
    it('should cleanup conversations older than max age', () => {
      const oldThreadId = 'old-thread';
      const newThreadId = 'new-thread';

      // Start streams
      service.startConversationStream(oldThreadId);
      service.startConversationStream(newThreadId);

      // Manually set old activity time
      const states = service.getConversationStates();
      const oldState = states.find((s) => s.threadId === oldThreadId);
      if (oldState) {
        oldState.lastActivity = Date.now() - 60 * 60 * 1000; // 1 hour ago
        oldState.subscriberCount = 0; // No active subscribers
      }

      // Cleanup with 30 minute max age
      service.cleanupInactiveConversations(30 * 60 * 1000);

      const remainingStates = service.getConversationStates();
      expect(remainingStates).toHaveLength(1);
      expect(remainingStates[0].threadId).toBe(newThreadId);
    });

    it('should not cleanup conversations with active subscribers', () => {
      const threadId = 'active-thread';

      service.startConversationStream(threadId);

      // Manually set old activity time but keep subscriber count > 0
      const states = service.getConversationStates();
      const state = states.find((s) => s.threadId === threadId);
      if (state) {
        state.lastActivity = Date.now() - 60 * 60 * 1000; // 1 hour ago
        // subscriberCount remains > 0
      }

      service.cleanupInactiveConversations(30 * 60 * 1000);

      const remainingStates = service.getConversationStates();
      expect(remainingStates).toHaveLength(1);
      expect(remainingStates[0].threadId).toBe(threadId);
    });
  });

  describe('event parsing', () => {
    it('should parse valid stream events', () => {
      const validEvent: LangGraphStreamEvent = {
        eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
        threadId: 'test-thread',
        timestamp: Date.now(),
        data: { chunk: 'test' },
      };

      const result = (service as any).parseStreamEvent(JSON.stringify(validEvent));

      expect(result).toEqual(validEvent);
    });

    it('should return null for invalid events', () => {
      const invalidEvents = [
        'invalid json',
        JSON.stringify({ eventType: 'test' }), // missing required fields
        JSON.stringify({ threadId: 'test', timestamp: Date.now() }), // missing eventType
      ];

      for (const invalidEvent of invalidEvents) {
        const result = (service as any).parseStreamEvent(invalidEvent);
        expect(result).toBeNull();
      }
    });
  });

  describe('comprehensive type guard validation', () => {
    describe('isValidLangGraphStreamEvent', () => {
      it('should validate complete valid events', () => {
        const validEvents = [
          {
            eventType: LangGraphStreamEventType.CONVERSATION_START,
            threadId: 'thread-123',
            timestamp: Date.now(),
            data: { conversationId: 'conv-456' },
          },
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'thread-123',
            timestamp: Date.now(),
            data: { chunk: 'Hello world', messageId: 'msg-789' },
          },
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_START,
            threadId: 'thread-123',
            timestamp: Date.now(),
            data: {
              toolCall: {
                toolName: 'calculator',
                arguments: { operation: 'add', a: 1, b: 2 },
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'thread-123',
            timestamp: Date.now(),
            data: {
              error: {
                message: 'Processing failed',
                code: 'PROC_ERROR',
              },
            },
          },
        ];

        for (const event of validEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(true);
        }
      });

      it('should reject events with invalid basic structure', () => {
        const invalidEvents = [
          null,
          undefined,
          'string',
          123,
          [],
          {},
          { eventType: 'INVALID_TYPE' }, // invalid enum value
          { eventType: LangGraphStreamEventType.MESSAGE_CHUNK }, // missing required fields
          { threadId: 'test', timestamp: Date.now(), data: {} }, // missing eventType
          { eventType: LangGraphStreamEventType.MESSAGE_CHUNK, threadId: 123 }, // wrong type
          { eventType: LangGraphStreamEventType.MESSAGE_CHUNK, threadId: 'test', timestamp: 'invalid' }, // wrong timestamp type
          { eventType: LangGraphStreamEventType.MESSAGE_CHUNK, threadId: 'test', timestamp: Date.now() }, // missing data
          { eventType: LangGraphStreamEventType.MESSAGE_CHUNK, threadId: 'test', timestamp: Date.now(), data: null }, // null data
        ];

        for (const event of invalidEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(false);
        }
      });

      it('should validate MESSAGE_CHUNK event data structure', () => {
        const validChunkEvents = [
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'test',
            timestamp: Date.now(),
            data: { chunk: 'valid chunk' },
          },
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'test',
            timestamp: Date.now(),
            data: { messageId: 'msg-123' }, // chunk is optional
          },
        ];

        for (const event of validChunkEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(true);
        }

        const invalidChunkEvents = [
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'test',
            timestamp: Date.now(),
            data: { chunk: 123 }, // chunk must be string
          },
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'test',
            timestamp: Date.now(),
            data: { chunk: null }, // chunk cannot be null
          },
        ];

        for (const event of invalidChunkEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(false);
        }
      });

      it('should validate TOOL_CALL event data structure', () => {
        const validToolEvents = [
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_START,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              toolCall: {
                toolName: 'calculator',
                arguments: { a: 1, b: 2 },
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_COMPLETE,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              toolCall: {
                toolName: 'search',
                arguments: { query: 'test' },
                result: { found: true },
              },
            },
          },
        ];

        for (const event of validToolEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(true);
        }

        const invalidToolEvents = [
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_START,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              toolCall: {
                toolName: 123, // must be string
                arguments: { a: 1 },
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_START,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              toolCall: {
                toolName: 'calc',
                arguments: null, // must be object
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.TOOL_CALL_START,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              toolCall: 'invalid', // must be object
            },
          },
        ];

        for (const event of invalidToolEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(false);
        }
      });

      it('should validate CONVERSATION_ERROR event data structure', () => {
        const validErrorEvents = [
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              error: {
                message: 'Something went wrong',
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              error: {
                message: 'Error occurred',
                code: 'ERR_001',
                stack: 'Stack trace here',
              },
            },
          },
        ];

        for (const event of validErrorEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(true);
        }

        const invalidErrorEvents = [
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              error: {
                message: 123, // must be string
              },
            },
          },
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              error: 'invalid', // must be object
            },
          },
          {
            eventType: LangGraphStreamEventType.CONVERSATION_ERROR,
            threadId: 'test',
            timestamp: Date.now(),
            data: {
              error: {}, // missing required message
            },
          },
        ];

        for (const event of invalidErrorEvents) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(false);
        }
      });

      it('should handle edge cases in event validation', () => {
        const edgeCases = [
          // Empty data object (should be valid for most event types)
          {
            eventType: LangGraphStreamEventType.CONVERSATION_START,
            threadId: 'test',
            timestamp: Date.now(),
            data: {},
          },
          // Very large timestamp
          {
            eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
            threadId: 'test',
            timestamp: Number.MAX_SAFE_INTEGER,
            data: { chunk: 'test' },
          },
          // Very long thread ID
          {
            eventType: LangGraphStreamEventType.STATE_UPDATE,
            threadId: 'a'.repeat(1000),
            timestamp: Date.now(),
            data: { state: { updated: true } },
          },
        ];

        for (const event of edgeCases) {
          const isValid = (service as any).isValidLangGraphStreamEvent(event);
          expect(isValid).toBe(true);
        }
      });
    });
  });

  describe('stream error handling and resilience', () => {
    it('should handle malformed JSON gracefully', () => {
      const malformedMessages = ['{"incomplete": json', '}{invalid}', '"just a string"', '', '\n\t\r  ', 'null', 'undefined'];

      for (const message of malformedMessages) {
        const result = (service as any).parseStreamEvent(message);
        expect(result).toBeNull();
      }
    });

    it('should handle very large event payloads', () => {
      const largeEvent = {
        eventType: LangGraphStreamEventType.MESSAGE_CHUNK,
        threadId: 'test-thread',
        timestamp: Date.now(),
        data: {
          chunk: 'a'.repeat(10000), // 10KB chunk
          metadata: {
            largeArray: new Array(1000).fill('data'),
            largeObject: Object.fromEntries(new Array(100).fill(0).map((_, i) => [`key${i}`, `value${i}`])),
          },
        },
      };

      const result = (service as any).parseStreamEvent(JSON.stringify(largeEvent));
      expect(result).toEqual(largeEvent);
    });

    it('should validate event type enum strictly', () => {
      const invalidEventTypes = [
        'INVALID_EVENT',
        'conversation_start', // wrong case
        'MESSAGE-CHUNK', // wrong delimiter
        '',
        null,
        undefined,
        123,
        {},
      ];

      for (const eventType of invalidEventTypes) {
        const event = {
          eventType,
          threadId: 'test',
          timestamp: Date.now(),
          data: {},
        };

        const isValid = (service as any).isValidLangGraphStreamEvent(event);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('performance and memory management', () => {
    it('should handle rapid subscription/unsubscription cycles', () => {
      const threadId = 'performance-test-thread';

      // Rapidly start and stop streams
      for (let i = 0; i < 100; i++) {
        service.startConversationStream(`${threadId}-${i}`);
        service.stopConversationStream(`${threadId}-${i}`);
      }

      const remainingStates = service.getConversationStates();
      expect(remainingStates).toHaveLength(0);
    });

    it('should properly track subscriber counts', () => {
      const threadId = 'subscriber-test';

      // Start multiple streams for the same thread
      service.startConversationStream(threadId);
      service.startConversationStream(threadId);
      service.startConversationStream(threadId);

      const states = service.getConversationStates();
      const threadState = states.find((s) => s.threadId === threadId);
      expect(threadState?.subscriberCount).toBe(3);

      // Stop one subscription
      service.stopConversationStream(threadId);
      const updatedStates = service.getConversationStates();
      const updatedThreadState = updatedStates.find((s) => s.threadId === threadId);
      expect(updatedThreadState?.subscriberCount).toBe(2);
    });

    it('should cleanup inactive conversations based on activity time', () => {
      const oldThreadId = 'old-inactive-thread';
      const recentThreadId = 'recent-active-thread';

      service.startConversationStream(oldThreadId);
      service.startConversationStream(recentThreadId);

      // Manually manipulate activity times
      const states = service.getConversationStates();
      const oldState = states.find((s) => s.threadId === oldThreadId);
      const recentState = states.find((s) => s.threadId === recentThreadId);

      if (oldState && recentState) {
        oldState.lastActivity = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        oldState.subscriberCount = 0;
        recentState.lastActivity = Date.now() - 5 * 60 * 1000; // 5 minutes ago
        recentState.subscriberCount = 0;
      }

      // Cleanup with 1 hour max age
      service.cleanupInactiveConversations(60 * 60 * 1000);

      const finalStates = service.getConversationStates();
      expect(finalStates).toHaveLength(1);
      expect(finalStates[0].threadId).toBe(recentThreadId);
    });
  });

  describe('channel naming', () => {
    it('should generate correct thread channel names', () => {
      const threadId = 'test-thread-123';
      const channelName = (service as any).getThreadChannel(threadId);

      expect(channelName).toBe('langraph:thread:test-thread-123');
    });

    it('should generate correct global channel name', () => {
      const channelName = (service as any).getGlobalChannel();

      expect(channelName).toBe('langraph:global');
    });
  });
});
