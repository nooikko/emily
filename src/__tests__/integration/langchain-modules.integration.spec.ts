import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Observable, take } from 'rxjs';
import { ElevenLabsModule } from '../../elevenlabs/elevenlabs.module';
import { ElevenLabsLangChainTool } from '../../elevenlabs/tools/elevenlabs-langchain.tool';
import { MessagingModule } from '../../messaging/messaging.module';
import { RedisService } from '../../messaging/redis/redis.service';
import { LangGraphStreamEventType, LangGraphStreamingService } from '../../messaging/services/langraph-streaming.service';
// Entity imports
import { ConversationThread } from '../../threads/entities/conversation-thread.entity';
import { ThreadCategory } from '../../threads/entities/thread-category.entity';
import { ThreadMessage } from '../../threads/entities/thread-message.entity';
// Service imports
import { ConversationStateService } from '../../threads/services/conversation-state.service';
import { ThreadsService } from '../../threads/services/threads.service';
// Module imports
import { ThreadsModule } from '../../threads/threads.module';

// Test database configuration
const testDbConfig = {
  type: 'sqlite',
  database: ':memory:',
  entities: [ConversationThread, ThreadMessage, ThreadCategory],
  synchronize: true,
  logging: false,
};

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
  let threadsService: ThreadsService;
  let streamingService: LangGraphStreamingService;
  let elevenLabsTool: ElevenLabsLangChainTool;
  let redisService: RedisService;

  beforeAll(async () => {
    // Mock Redis service to avoid external dependency
    const mockRedisService = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(
        new Observable((subscriber) => {
          // Simulate receiving messages
          setTimeout(() => {
            subscriber.next(
              JSON.stringify({
                eventType: 'message:chunk',
                threadId: 'test-thread',
                timestamp: Date.now(),
                data: { chunk: 'Hello' },
              }),
            );
          }, 100);
        }),
      ),
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
        TypeOrmModule.forRoot(testDbConfig as TypeOrmModuleOptions),
        ThreadsModule,
        MessagingModule,
        ElevenLabsModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider('ElevenLabsBasicService')
      .useValue(mockElevenLabsService)
      .overrideProvider('ELEVENLABS_CONFIG')
      .useValue({
        apiKey: 'mock-api-key',
        baseUrl: 'mock://elevenlabs.io',
        defaultTtsModel: 'eleven_multilingual_v2',
        defaultSttModel: 'scribe_v1',
        maxConcurrentRequests: 3,
        maxRetries: 3,
      })
      .compile();

    conversationStateService = module.get<ConversationStateService>(ConversationStateService);
    threadsService = module.get<ThreadsService>(ThreadsService);
    streamingService = module.get<LangGraphStreamingService>(LangGraphStreamingService);
    elevenLabsTool = module.get<ElevenLabsLangChainTool>(ElevenLabsLangChainTool);
    redisService = module.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Thread State Management Integration', () => {
    it('should create and manage conversation state with LangGraph', async () => {
      const threadId = 'integration-test-thread-1';
      const message = new HumanMessage('Hello, this is an integration test!');

      // Execute conversation flow
      const result = await conversationStateService.executeConversationFlow(threadId, message, {
        session: { source: 'api' },
      });

      // Verify conversation state
      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
      expect(result.messages).toContainEqual(message);
      expect(result.conversationPhase).toBe('completion');

      // Verify thread was created in database
      const thread = await threadsService.findThreadById(threadId);
      expect(thread).toBeDefined();
      expect(thread!.title).toBeDefined();
      expect(thread!.messageCount).toBeGreaterThan(0);
    });

    it('should handle multiple messages in conversation flow', async () => {
      const threadId = 'integration-test-thread-2';
      const message1 = new HumanMessage('First message');
      const message2 = new AIMessage('AI response');
      const message3 = new HumanMessage('Follow-up question');

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
    });
  });

  describe('Streaming Integration', () => {
    it('should stream conversation events via Redis', (done) => {
      const threadId = 'streaming-test-thread-1';

      // Start conversation stream
      const stream = streamingService.startConversationStream(threadId, {
        source: 'integration-test',
      });

      // Listen for events
      stream.pipe(take(1)).subscribe({
        next: (event) => {
          expect(event).toBeDefined();
          expect(event.threadId).toBe(threadId);
          expect(event.eventType).toBeDefined();
          done();
        },
        error: done,
      });

      // Emit a test event
      setTimeout(() => {
        streamingService.emitConversationEvent(threadId, LangGraphStreamEventType.MESSAGE_CHUNK, {
          chunk: 'Test chunk',
        });
      }, 50);
    });

    it('should stream message chunks', async () => {
      const threadId = 'streaming-test-thread-2';
      const messageId = 'test-message-id';

      const chunks = ['Hello', ' ', 'from', ' ', 'integration', ' ', 'test!'];

      async function* generateChunks() {
        for (const chunk of chunks) {
          yield chunk;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Stream chunks
      await streamingService.streamMessageChunks(threadId, messageId, generateChunks());

      // Verify Redis publish was called for each chunk + completion
      expect(redisService.publish).toHaveBeenCalledTimes(chunks.length + 1);
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
      try {
        await conversationStateService.addMessageToConversation('non-existent-thread', new HumanMessage('This should fail'));
      } catch (error) {
        expect(error).toBeDefined();
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

      const promises = threadIds.map((threadId) => conversationStateService.executeConversationFlow(threadId, message));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.conversationPhase === 'completion')).toBe(true);

      // Verify all threads exist
      for (const threadId of threadIds) {
        const thread = await threadsService.findThreadById(threadId);
        expect(thread).toBeDefined();
      }
    });

    it('should cleanup resources properly', async () => {
      const threadId = 'cleanup-test-thread';

      // Create resources
      const _stream = streamingService.startConversationStream(threadId);
      await conversationStateService.executeConversationFlow(threadId, new HumanMessage('Cleanup test'));

      // Verify resources exist
      expect(streamingService.getConversationStates()).toHaveLength(1);

      // Cleanup
      streamingService.stopConversationStream(threadId);
      conversationStateService.cleanupConversationGraph(threadId);

      // Verify cleanup
      expect(streamingService.getConversationStates()).toHaveLength(0);
    });
  });
});
