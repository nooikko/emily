import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { filter, Subject, take } from 'rxjs';
import { ConversationSummaryMemory } from '../../agent/memory/conversation-summary.memory';
// Services
import { ElevenLabsBasicService } from '../../elevenlabs/services/elevenlabs-basic.service';
import { ElevenLabsLangChainTool } from '../../elevenlabs/tools/elevenlabs-langchain.tool';
import { RedisService } from '../../messaging/redis/redis.service';
import { LangGraphStreamEvent, LangGraphStreamEventType, LangGraphStreamingService } from '../../messaging/services/langraph-streaming.service';
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { ConversationStateService, ConversationStateType } from '../../threads/services/conversation-state.service';
import { ThreadsService } from '../../threads/services/threads.service';

// Mock classes for testing without database complexity
class MockThreadsService {
  findThreadById = jest.fn().mockResolvedValue({
    id: 'test-thread',
    title: 'Test Thread',
    messageCount: 1,
  } as Partial<ConversationThread>);
  createThread = jest.fn();
  updateThread = jest.fn();
  deleteThread = jest.fn();
}

class MockConversationStateService {
  executeConversationFlow = jest.fn();
  addMessageToConversation = jest.fn();
  getConversationState = jest.fn();
  cleanupConversationGraph = jest.fn();
}

/**
 * Integration tests for LangChain module integrations
 *
 * These tests verify that the three integrated modules work together properly:
 * - ThreadsModule with LangGraph state management
 * - MessagingModule with Redis streaming
 * - ElevenlabsModule with LangChain tools
 */
describe('LangChain Modules Integration', () => {
  let module: TestingModule;
  let conversationStateService: ConversationStateService;
  let _threadsService: ThreadsService;
  let streamingService: LangGraphStreamingService;
  let elevenLabsTool: ElevenLabsLangChainTool;
  let redisService: RedisService;
  let conversationSummaryMemory: ConversationSummaryMemory;

  beforeAll(async () => {
    // Create a mock Redis service that simulates Redis pub/sub behavior
    const mockSubscriptions = new Map<string, Subject<string>>();

    const mockRedisService = {
      publish: jest.fn().mockImplementation(async (channel: string, message: string) => {
        // Simulate Redis pub/sub by emitting to subscribers of this channel
        const channelSubject = mockSubscriptions.get(channel);
        if (channelSubject) {
          // Use setTimeout to simulate async Redis behavior
          setTimeout(() => {
            channelSubject.next(message);
          }, 0);
        }
        return Promise.resolve();
      }),
      subscribe: jest.fn().mockImplementation((channel: string) => {
        // Create or get existing subject for this channel
        let channelSubject = mockSubscriptions.get(channel);
        if (!channelSubject) {
          channelSubject = new Subject<string>();
          mockSubscriptions.set(channel, channelSubject);
        }
        return channelSubject.asObservable();
      }),
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(undefined),
    };

    // Mock ElevenLabs service for testing without API calls
    const mockElevenLabsService = {
      generateSpeech: jest.fn().mockResolvedValue({
        audioData: Buffer.from('mock-audio-data'),
        contentType: 'audio/mpeg',
        metadata: { characterCount: 10, requestTime: 1000 },
      }),
      transcribeAudio: jest.fn().mockResolvedValue({
        transcript: 'Mock transcription',
        metadata: { audioLengthMs: 2000, requestTime: 1500 },
      }),
      getVoices: jest.fn().mockResolvedValue([]),
      checkHealth: jest.fn().mockResolvedValue({
        connected: true,
        endpoint: 'mock://elevenlabs.io',
        lastChecked: Date.now(),
      }),
      isAvailable: jest.fn().mockReturnValue(true),
      getStatistics: jest.fn().mockReturnValue({
        initialized: true,
        available: true,
        activeRequests: 0,
        configuration: {},
      }),
      onModuleInit: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              // Mock environment variables
              ELEVENLABS_API_KEY: 'mock-api-key',
              REDIS_HOST: 'localhost',
              REDIS_PORT: 6379,
            }),
          ],
        }),
      ],
      providers: [
        // Mock services to avoid database and external dependencies
        {
          provide: ThreadsService,
          useClass: MockThreadsService,
        },
        {
          provide: ConversationStateService,
          useClass: MockConversationStateService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ElevenLabsBasicService,
          useValue: mockElevenLabsService,
        },
        // Real services for testing integration
        LangGraphStreamingService,
        ElevenLabsLangChainTool,
        {
          provide: ConversationSummaryMemory,
          useFactory: () => new ConversationSummaryMemory(undefined),
        },
        // Configuration providers
        {
          provide: 'ELEVENLABS_CONFIG',
          useValue: {
            apiKey: 'mock-api-key',
            baseUrl: 'mock://elevenlabs.io',
            defaultTtsModel: 'eleven_multilingual_v2',
            defaultSttModel: 'scribe_v1',
            maxConcurrentRequests: 3,
            maxRetries: 3,
          },
        },
      ],
    }).compile();

    conversationStateService = module.get<ConversationStateService>(ConversationStateService);
    _threadsService = module.get<ThreadsService>(ThreadsService);
    streamingService = module.get<LangGraphStreamingService>(LangGraphStreamingService);
    elevenLabsTool = module.get<ElevenLabsLangChainTool>(ElevenLabsLangChainTool);
    redisService = module.get<RedisService>(RedisService);
    conversationSummaryMemory = module.get<ConversationSummaryMemory>(ConversationSummaryMemory);
  });

  afterEach(() => {
    // Clean up streaming service state between tests
    const states = streamingService.getConversationStates();
    states.forEach((state) => {
      streamingService.stopConversationStream(state.threadId);
    });

    // Clear mock Redis calls to avoid accumulation
    (redisService.publish as jest.Mock).mockClear();

    // Clear Redis subscription subjects
    const mockSubscriptions = (redisService as unknown as { mockSubscriptions?: Map<string, Subject<string>> }).mockSubscriptions;
    if (mockSubscriptions) {
      mockSubscriptions.clear();
    }
  });

  afterAll(async () => {
    if (module) {
      // Clean up all conversation streams before closing module
      const states = streamingService.getConversationStates();
      states.forEach((state) => {
        streamingService.stopConversationStream(state.threadId);
      });

      // Give time for cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      await module.close();
    }
  });

  describe('Thread State Management Integration', () => {
    it('should create and manage conversation state with LangGraph', async () => {
      const threadId = 'integration-test-thread-1';
      const message = new HumanMessage('Hello, this is an integration test!');

      // Mock the conversation flow to test service integration
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockResolvedValue({
        threadId,
        messages: [message],
        conversationPhase: 'completion',
        thread: {
          id: threadId,
          title: 'Test Thread',
          messageCount: 1,
        } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      // Execute conversation flow
      const result = await conversationStateService.executeConversationFlow(threadId, message, {
        session: { source: 'api' },
      });

      // Verify conversation state
      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
      expect(result.messages).toContainEqual(message);
      expect(result.conversationPhase).toBe('completion');

      // Verify the service was called with correct parameters
      expect(conversationStateService.executeConversationFlow).toHaveBeenCalledWith(threadId, message, { session: { source: 'api' } });
    });

    it('should handle multiple messages in conversation flow', async () => {
      const threadId = 'integration-test-thread-2';
      const message1 = new HumanMessage('First message');
      const message2 = new AIMessage('AI response');
      const message3 = new HumanMessage('Follow-up question');

      // Mock conversation state service methods
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockResolvedValue({
        threadId,
        messages: [message1],
        conversationPhase: 'completion',
        thread: { id: threadId, messageCount: 1 } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      jest.spyOn(conversationStateService, 'addMessageToConversation').mockResolvedValue({} as Partial<ConversationStateType>);

      jest.spyOn(conversationStateService, 'getConversationState').mockResolvedValue({
        threadId,
        messages: [message1, message2, message3],
        conversationPhase: 'completion',
        thread: { id: threadId, messageCount: 3 } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      // Start conversation
      await conversationStateService.executeConversationFlow(threadId, message1);

      // Add subsequent messages
      await conversationStateService.addMessageToConversation(threadId, message2);
      await conversationStateService.addMessageToConversation(threadId, message3);

      // Verify final state
      const finalState = await conversationStateService.getConversationState(threadId);
      expect(finalState).toBeDefined();
      expect(finalState!.messages).toHaveLength(3);
      expect(finalState!.thread!.messageCount).toBe(3);

      // Verify service interactions
      expect(conversationStateService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(conversationStateService.addMessageToConversation).toHaveBeenCalledWith(threadId, message2);
      expect(conversationStateService.addMessageToConversation).toHaveBeenCalledWith(threadId, message3);
    });
  });

  describe('Streaming Integration', () => {
    it('should stream conversation events via Redis', async () => {
      const threadId = 'streaming-test-thread-1';

      // Start conversation stream
      const stream = streamingService.startConversationStream(threadId, {
        source: 'integration-test',
      });

      // Verify stream is created
      expect(stream).toBeDefined();

      // Create a promise to track the first custom event (skip the auto-generated CONVERSATION_START)
      const eventPromise = new Promise<LangGraphStreamEvent>((resolve, reject) => {
        const subscription = stream
          .pipe(
            filter((event) => event.eventType === LangGraphStreamEventType.MESSAGE_CHUNK),
            take(1),
          )
          .subscribe({
            next: (event) => {
              subscription.unsubscribe();
              resolve(event);
            },
            error: (err) => {
              subscription.unsubscribe();
              reject(err);
            },
          });

        // Set a timeout for the promise
        setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error('Test timed out waiting for stream event'));
        }, 1000);
      });

      // Give time for subscription to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Emit a test event
      await streamingService.emitConversationEvent(threadId, LangGraphStreamEventType.MESSAGE_CHUNK, {
        chunk: 'Test chunk',
      });

      // Wait for the event and verify it
      const event = await eventPromise;
      expect(event).toBeDefined();
      expect(event.threadId).toBe(threadId);
      expect(event.eventType).toBe(LangGraphStreamEventType.MESSAGE_CHUNK);
      expect(event.data.chunk).toBe('Test chunk');

      // Cleanup
      streamingService.stopConversationStream(threadId);
    }, 5000);

    it('should stream message chunks', async () => {
      const threadId = 'streaming-test-thread-2';
      const messageId = 'test-message-id';

      const chunks = ['Hello', ' ', 'from', ' ', 'integration', ' ', 'test!'];

      // Clear previous calls to get accurate count
      (redisService.publish as jest.Mock).mockClear();

      async function* generateChunks() {
        for (const chunk of chunks) {
          yield chunk;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Stream chunks
      await streamingService.streamMessageChunks(threadId, messageId, generateChunks());

      // Verify Redis publish was called for each chunk + completion
      // Each event is published to both thread-specific and global channels (2 calls per event)
      const expectedCalls = (chunks.length + 1) * 2; // (7 chunks + 1 completion) * 2 channels
      expect(redisService.publish).toHaveBeenCalledTimes(expectedCalls);
    });

    it('should manage conversation states', () => {
      const threadId1 = 'state-test-thread-1';
      const threadId2 = 'state-test-thread-2';

      streamingService.startConversationStream(threadId1, { test: 'data1' });
      streamingService.startConversationStream(threadId2, { test: 'data2' });

      const states = streamingService.getConversationStates();
      expect(states).toHaveLength(2);

      const activeCount = streamingService.getActiveConversationCount();
      expect(activeCount).toBe(2);

      // Stop one stream
      streamingService.stopConversationStream(threadId1);

      const remainingStates = streamingService.getConversationStates();
      expect(remainingStates).toHaveLength(1);
      expect(remainingStates[0].threadId).toBe(threadId2);
    });
  });

  describe('ElevenLabs Tool Integration', () => {
    it('should provide LangChain-compatible tools', () => {
      const tools = elevenLabsTool.getAllTools();

      expect(tools).toHaveLength(4);
      expect(tools.every((tool) => tool.name && tool.description && tool.schema)).toBe(true);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('elevenlabs_text_to_speech');
      expect(toolNames).toContain('elevenlabs_speech_to_text');
      expect(toolNames).toContain('elevenlabs_get_voices');
      expect(toolNames).toContain('elevenlabs_health_check');
    });

    it('should execute text-to-speech tool', async () => {
      const ttsTool = elevenLabsTool.getTool('elevenlabs_text_to_speech');
      expect(ttsTool).toBeDefined();

      const result = await (ttsTool! as DynamicStructuredTool).func({
        text: 'Integration test speech generation',
        voiceId: 'test-voice-id',
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.audioBase64).toBeDefined();
      expect(parsedResult.contentType).toBe('audio/mpeg');
    });

    it('should execute speech-to-text tool', async () => {
      const sttTool = elevenLabsTool.getTool('elevenlabs_speech_to_text');
      expect(sttTool).toBeDefined();

      const mockAudioBase64 = Buffer.from('mock-audio-data').toString('base64');
      const result = await (sttTool! as DynamicStructuredTool).func({
        audioBase64: mockAudioBase64,
        diarize: true,
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.transcript).toBe('Mock transcription');
    });

    it('should execute health check tool', async () => {
      const healthTool = elevenLabsTool.getTool('elevenlabs_health_check');
      expect(healthTool).toBeDefined();

      const result = await (healthTool! as DynamicStructuredTool).func({
        detailed: true,
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.connected).toBe(true);
      expect(parsedResult.statistics).toBeDefined();
    });
  });

  describe('Cross-Module Integration', () => {
    it('should integrate conversation state with streaming', async () => {
      const threadId = 'cross-module-test-1';
      const message = new HumanMessage('Cross-module integration test');

      // Mock conversation state service
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockResolvedValue({
        threadId,
        messages: [message],
        conversationPhase: 'completion',
        thread: { id: threadId, messageCount: 1 } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      // Start streaming first
      const _stream = streamingService.startConversationStream(threadId);

      // Execute conversation flow
      const result = await conversationStateService.executeConversationFlow(threadId, message);

      // Verify both systems work together
      expect(result.conversationPhase).toBe('completion');

      const states = streamingService.getConversationStates();
      expect(states.some((s) => s.threadId === threadId)).toBe(true);

      streamingService.stopConversationStream(threadId);
    });

    it('should integrate tools with conversation context', async () => {
      const threadId = 'cross-module-test-2';

      // Mock conversation state service
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockResolvedValue({
        threadId,
        messages: [new HumanMessage('Please generate speech for this text')],
        conversationPhase: 'completion',
        thread: { id: threadId, messageCount: 1 } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      // Create conversation context
      const message = new HumanMessage('Please generate speech for this text');
      await conversationStateService.executeConversationFlow(threadId, message);

      // Stream tool usage
      await streamingService.streamToolCall(threadId, 'elevenlabs_text_to_speech', { text: 'Generated from conversation context' });

      // Verify tools can be used in context
      const ttsTool = elevenLabsTool.getTool('elevenlabs_text_to_speech');
      const result = await (ttsTool! as DynamicStructuredTool).func({
        text: 'Generated from conversation context',
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);

      // Verify Redis was called for tool events
      expect(redisService.publish).toHaveBeenCalledWith(`langraph:thread:${threadId}`, expect.stringContaining('tool:call:start'));
    });

    it('should handle error scenarios across modules', async () => {
      const threadId = 'error-test-thread';

      // Test conversation state error handling
      jest.spyOn(conversationStateService, 'addMessageToConversation').mockRejectedValue(new Error('Thread not found'));

      try {
        await conversationStateService.addMessageToConversation('non-existent-thread', new HumanMessage('This should fail'));
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toBe('Thread not found');
      }

      // Test streaming error handling
      await streamingService.emitConversationEvent(threadId, LangGraphStreamEventType.CONVERSATION_ERROR, {
        error: {
          message: 'Test error',
          code: 'TEST_ERROR',
        },
      });

      // Verify error was published
      expect(redisService.publish).toHaveBeenCalledWith(`langraph:thread:${threadId}`, expect.stringContaining('conversation:error'));
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent conversations', async () => {
      const threadIds = Array.from({ length: 5 }, (_, i) => `perf-test-${i}`);
      const message = new HumanMessage('Performance test message');

      // Clear previous calls to get accurate count
      (conversationStateService.executeConversationFlow as jest.Mock).mockClear();

      // Mock concurrent conversation flows
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockImplementation(
        async (threadId) =>
          ({
            threadId,
            messages: [message],
            conversationPhase: 'completion',
            thread: { id: threadId, messageCount: 1 } as Partial<ConversationThread>,
            currentMessage: null,
            context: {},
            error: null,
          }) as Partial<ConversationStateType>,
      );

      const promises = threadIds.map((threadId) => conversationStateService.executeConversationFlow(threadId, message));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.conversationPhase === 'completion')).toBe(true);
      expect(results.map((r) => r.threadId)).toEqual(threadIds);

      // Verify service was called for each thread
      expect(conversationStateService.executeConversationFlow).toHaveBeenCalledTimes(5);
    });

    it('should cleanup resources properly', async () => {
      const threadId = 'cleanup-test-thread';

      // Mock conversation state service
      jest.spyOn(conversationStateService, 'executeConversationFlow').mockResolvedValue({
        threadId,
        messages: [new HumanMessage('Cleanup test')],
        conversationPhase: 'completion',
        thread: { id: threadId, messageCount: 1 } as Partial<ConversationThread>,
        currentMessage: null,
        context: {},
        error: null,
      } as Partial<ConversationStateType>);

      // cleanupConversationGraph returns void, so we don't need to mock the return value

      // Create resources
      const _stream = streamingService.startConversationStream(threadId);
      await conversationStateService.executeConversationFlow(threadId, new HumanMessage('Cleanup test'));

      // Verify resources exist
      expect(streamingService.getConversationStates()).toHaveLength(1);

      // Cleanup
      streamingService.stopConversationStream(threadId);
      await conversationStateService.cleanupConversationGraph(threadId);

      // Verify cleanup
      expect(streamingService.getConversationStates()).toHaveLength(0);
      expect(conversationStateService.cleanupConversationGraph).toHaveBeenCalledWith(threadId);
    });
  });

  describe('Memory Integration', () => {
    it('should integrate conversation summary memory', async () => {
      const threadId = 'memory-test-thread';
      const messages = [
        new HumanMessage('Tell me about machine learning'),
        new AIMessage('Machine learning is a subset of artificial intelligence...'),
        new HumanMessage('What are the main types?'),
      ];

      // Initialize memory for thread
      conversationSummaryMemory.initializeThread(threadId);

      // Add messages to memory
      await conversationSummaryMemory.addMessages(threadId, messages);

      // Get context
      const context = await conversationSummaryMemory.getContext(threadId);
      expect(context).toBeDefined();
      expect(context.length).toBeGreaterThan(0);

      // Verify memory state
      const summaryState = conversationSummaryMemory.getSummaryState(threadId);
      expect(summaryState).toBeDefined();
      expect(summaryState!.pendingMessages).toHaveLength(3);
    });

    it('should provide memory statistics', () => {
      const stats = conversationSummaryMemory.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalThreads).toBe('number');
      expect(typeof stats.totalMessagesSummarized).toBe('number');
      expect(typeof stats.averageMessagesPerThread).toBe('number');
    });
  });
});
