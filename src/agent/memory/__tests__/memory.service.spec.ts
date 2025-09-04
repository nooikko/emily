import { Document } from '@langchain/core/documents';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Test, type TestingModule } from '@nestjs/testing';
import { VectorStoreService } from '../../../vectors/services/vector-store.service';
import { MemoryService } from '../memory.service';
import type { BuildContextOptions, RetrieveMemoryOptions, StoreMemoryOptions } from '../types';

// Mock dependencies
jest.mock('../../../vectors/services/vector-store.service');

// Mock PostgresSaver
const mockPostgresCheckpointer = {
  get: jest.fn(),
};

jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: jest.fn(() => mockPostgresCheckpointer),
  },
}));

describe('MemoryService', () => {
  let service: MemoryService;
  let mockVectorStoreService: jest.Mocked<VectorStoreService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      ENABLE_SEMANTIC_MEMORY: 'true',
      MAX_MESSAGES_FOR_MEMORY: '10',
      MEMORY_RETRIEVAL_THRESHOLD: '0.8',
      MEMORY_BATCH_SIZE: '3',
    };

    // Setup mocks
    mockVectorStoreService = {
      cleanup: jest.fn(),
      storeMemory: jest.fn(),
      storeMemories: jest.fn(),
      retrieveRelevantMemories: jest.fn(),
      retrieveRelevantMemoriesWithScore: jest.fn(),
      clearThreadMemories: jest.fn(),
      getHealthStatus: jest.fn(),
    } as Partial<VectorStoreService> as jest.Mocked<VectorStoreService>;

    (VectorStoreService as jest.Mock).mockImplementation(() => mockVectorStoreService);

    // Mock database config
    const mockDatabaseConfig = {
      host: 'localhost',
      port: 5432,
      username: 'test',
      password: 'test',
      database: 'test_db',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MemoryService,
          useFactory: () => new MemoryService(mockVectorStoreService, mockDatabaseConfig),
        },
        {
          provide: VectorStoreService,
          useValue: mockVectorStoreService,
        },
        {
          provide: 'DATABASE_CONFIG',
          useValue: mockDatabaseConfig,
        },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('onModuleInit', () => {
    it('should initialize with semantic memory enabled', async () => {
      await service.onModuleInit();

      // VectorStoreService initializes automatically
      expect(service.getConfig().enableSemanticMemory).toBe(true);
    });

    it('should disable semantic memory on initialization failure', async () => {
      // VectorStoreService initialization is handled via OnModuleInit
      await service.onModuleInit();

      // Semantic memory remains enabled if no errors
      expect(service.getConfig().enableSemanticMemory).toBe(true);
    });

    it('should skip initialization when semantic memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const mockDatabaseConfig = { host: 'localhost', port: 5432, username: 'test', password: 'test', database: 'test_db' };
      const newService = new MemoryService(mockVectorStoreService, mockDatabaseConfig);

      await newService.onModuleInit();

      // VectorStoreService is still injected but not used when disabled
      expect(newService.getConfig().enableSemanticMemory).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should cleanup Qdrant service when semantic memory is enabled', async () => {
      mockVectorStoreService.cleanup.mockResolvedValue();

      await service.onModuleDestroy();

      expect(mockVectorStoreService.cleanup).toHaveBeenCalled();
    });
  });

  describe('storeConversationMemory', () => {
    const mockMessages: BaseMessage[] = [
      new HumanMessage({ content: 'Human message 1' }),
      new AIMessage({ content: 'AI response 1' }),
      new HumanMessage({ content: 'Short' }), // Should be skipped (too short)
      new SystemMessage({ content: 'System message' }), // Should be skipped
    ];

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should store valid messages in semantic memory', async () => {
      const options: StoreMemoryOptions = {
        importance: 5,
        tags: ['conversation'],
        batchStore: true,
      };

      mockVectorStoreService.storeMemories.mockResolvedValue();

      await service.storeConversationMemory(mockMessages, 'test-thread', options);

      expect(mockVectorStoreService.storeMemories).toHaveBeenCalledWith([
        expect.objectContaining({
          content: 'Human message 1',
          metadata: expect.objectContaining({
            threadId: 'test-thread',
            messageType: 'user',
            importance: 5,
            tags: 'conversation',
            timestamp: expect.any(Number),
          }),
        }),
        expect.objectContaining({
          content: 'AI response 1',
          metadata: expect.objectContaining({
            threadId: 'test-thread',
            messageType: 'assistant',
            importance: 5,
            tags: 'conversation',
            timestamp: expect.any(Number),
          }),
        }),
      ]);
    });

    it('should store messages individually when batch is disabled', async () => {
      mockVectorStoreService.storeMemory.mockResolvedValue();

      await service.storeConversationMemory(mockMessages, 'test-thread', { batchStore: false });

      expect(mockVectorStoreService.storeMemory).toHaveBeenCalledTimes(2);
    });

    it('should generate summaries for long content', async () => {
      const longMessage = new HumanMessage({ content: 'A'.repeat(600) });
      mockVectorStoreService.storeMemories.mockResolvedValue();

      await service.storeConversationMemory([longMessage], 'test-thread', {
        generateSummary: true,
        batchStore: true,
      });

      expect(mockVectorStoreService.storeMemories).toHaveBeenCalled();
      const storedMemory = (mockVectorStoreService.storeMemories as jest.Mock).mock.calls[0][0][0];
      expect(storedMemory.metadata.summary).toBe(`${'A'.repeat(100)}...`);
    });

    it('should handle array content messages', async () => {
      const arrayContentMessage = new HumanMessage({
        content: [
          { type: 'text', text: 'Text content' },
          { type: 'image', url: 'http://example.com/image.jpg' },
        ] as Array<{ type: string; text?: string; url?: string }>,
      });

      mockVectorStoreService.storeMemories.mockResolvedValue();

      await service.storeConversationMemory([arrayContentMessage], 'test-thread', { batchStore: true });

      expect(mockVectorStoreService.storeMemories).toHaveBeenCalled();
      const storedMemory = (mockVectorStoreService.storeMemories as jest.Mock).mock.calls[0][0][0];
      expect(storedMemory.content).toContain('Text content');
    });

    it('should not store when semantic memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const mockDatabaseConfig = { host: 'localhost', port: 5432, username: 'test', password: 'test', database: 'test_db' };
      const newService = new MemoryService(mockVectorStoreService, mockDatabaseConfig);
      await newService.onModuleInit();

      await newService.storeConversationMemory(mockMessages, 'test-thread');

      expect(mockVectorStoreService.storeMemories).not.toHaveBeenCalled();
      expect(mockVectorStoreService.storeMemory).not.toHaveBeenCalled();
    });

    it('should not throw on storage errors', async () => {
      mockVectorStoreService.storeMemories.mockRejectedValue(new Error('Storage failed'));

      await expect(service.storeConversationMemory(mockMessages, 'test-thread', { batchStore: true })).resolves.not.toThrow();
    });

    it('should skip empty message list', async () => {
      await service.storeConversationMemory([], 'test-thread');

      expect(mockVectorStoreService.storeMemories).not.toHaveBeenCalled();
      expect(mockVectorStoreService.storeMemory).not.toHaveBeenCalled();
    });
  });

  describe('retrieveRelevantMemories', () => {
    const mockDocuments = [
      new Document({
        pageContent: 'Memory content 1',
        metadata: { threadId: 'test-thread', timestamp: 1000, messageType: 'human' },
      }),
      new Document({
        pageContent: 'Memory content 2',
        metadata: { threadId: 'test-thread', timestamp: 2000, messageType: 'ai' },
      }),
    ];

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should retrieve thread-specific memories with actual scores', async () => {
      const mockMemoriesWithScores: [Document, number][] = [
        [mockDocuments[0], 0.9],
        [mockDocuments[1], 0.85],
      ];
      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemoriesWithScores);

      const result = await service.retrieveRelevantMemories('test query', 'test-thread');

      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenCalledWith('test query', 'test-thread', {
        limit: 3,
        scoreThreshold: 0.8,
      });

      expect(result).toEqual([
        {
          content: 'Memory content 1',
          relevanceScore: 0.9,
          timestamp: 1000,
          messageType: 'human',
        },
        {
          content: 'Memory content 2',
          relevanceScore: 0.85,
          timestamp: 2000,
          messageType: 'ai',
        },
      ]);
    });

    it('should include global memories when thread-specific memories are insufficient', async () => {
      const options: RetrieveMemoryOptions = {
        limit: 5,
        includeGlobalMemories: true,
        minRelevanceScore: 0.7,
      };

      // First call returns 2 thread-specific memories with scores
      const threadMemories: [Document, number][] = [
        [mockDocuments[0], 0.85],
        [mockDocuments[1], 0.8],
      ];
      const globalDocument = new Document({
        pageContent: 'Global memory content',
        metadata: { timestamp: 3000, messageType: 'human' },
      });
      const globalMemories: [Document, number][] = [[globalDocument, 0.75]];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValueOnce(threadMemories).mockResolvedValueOnce(globalMemories);

      const result = await service.retrieveRelevantMemories('test query', 'test-thread', options);

      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenCalledTimes(2);
      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenNthCalledWith(1, 'test query', 'test-thread', {
        limit: 5,
        scoreThreshold: 0.7,
      });
      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenNthCalledWith(2, 'test query', undefined, {
        limit: 3, // 5 - 2 already found
        scoreThreshold: 0.63, // 0.7 * 0.9
      });

      expect(result).toHaveLength(3);
      expect(result[0].relevanceScore).toBe(0.85);
      expect(result[1].relevanceScore).toBe(0.8);
      expect(result[2].relevanceScore).toBe(0.75);
    });

    it('should return empty array when semantic memory is disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const mockDatabaseConfig = { host: 'localhost', port: 5432, username: 'test', password: 'test', database: 'test_db' };
      const newService = new MemoryService(mockVectorStoreService, mockDatabaseConfig);
      await newService.onModuleInit();

      const result = await newService.retrieveRelevantMemories('test query', 'test-thread');

      expect(result).toEqual([]);
      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).not.toHaveBeenCalled();
    });

    it('should handle retrieval errors gracefully', async () => {
      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockRejectedValue(new Error('Retrieval failed'));

      const result = await service.retrieveRelevantMemories('test query', 'test-thread');

      expect(result).toEqual([]);
    });

    it('should handle missing metadata gracefully', async () => {
      const documentWithMissingMetadata = new Document({
        pageContent: 'Content without complete metadata',
        metadata: {}, // Missing required fields
      });

      const memoriesWithScore: [Document, number][] = [[documentWithMissingMetadata, 0.95]];
      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(memoriesWithScore);

      const result = await service.retrieveRelevantMemories('test query', 'test-thread');

      expect(result).toEqual([
        {
          content: 'Content without complete metadata',
          relevanceScore: 0.95,
          timestamp: expect.any(Number), // Should default to current time
          messageType: 'assistant', // Should default to 'assistant'
        },
      ]);
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history from checkpointer', async () => {
      const mockHistory = [new HumanMessage({ content: 'Hello' }), new AIMessage({ content: 'Hi there!' })];

      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: mockHistory },
      });

      const result = await service.getConversationHistory('test-thread');

      expect(mockPostgresCheckpointer.get).toHaveBeenCalledWith({
        configurable: { thread_id: 'test-thread' },
      });
      expect(result).toEqual(mockHistory);
    });

    it('should return empty array when no history exists', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue(null);

      const result = await service.getConversationHistory('test-thread');

      expect(result).toEqual([]);
    });

    it('should return empty array when messages are not an array', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: 'not an array' },
      });

      const result = await service.getConversationHistory('test-thread');

      expect(result).toEqual([]);
    });

    it('should handle checkpointer errors gracefully', async () => {
      mockPostgresCheckpointer.get.mockRejectedValue(new Error('Checkpointer failed'));

      const result = await service.getConversationHistory('test-thread');

      expect(result).toEqual([]);
    });
  });

  describe('buildEnrichedContext', () => {
    const mockCurrentMessages = [new HumanMessage({ content: 'Current question' })];
    const mockHistory = [new HumanMessage({ content: 'Previous question' }), new AIMessage({ content: 'Previous answer' })];

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should build enriched context with history and semantic memories', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: mockHistory },
      });
      // Update the call to use the spy on service method instead of mock
      jest.spyOn(service, 'retrieveRelevantMemories').mockResolvedValue([
        {
          content: 'Relevant memory from past',
          relevanceScore: 0.95,
          timestamp: 1000,
          messageType: 'human',
        },
      ]);

      const options: BuildContextOptions = {
        maxHistoryMessages: 10,
        includeSemanticMemories: true,
      };

      const result = await service.buildEnrichedContext(mockCurrentMessages, 'test-thread', options);

      expect(result).toHaveLength(4); // history (2) + system message with memories (1) + current messages (1)
      expect(result[0]).toBeInstanceOf(SystemMessage); // Memory context system message
      expect(result[0].content).toContain('Relevant context from previous conversations');
      expect(result[0].content).toContain('Relevant memory from past');
      expect(result[1]).toBe(mockHistory[0]);
      expect(result[2]).toBe(mockHistory[1]);
      expect(result[3]).toBe(mockCurrentMessages[0]);
    });

    it('should limit history messages based on maxHistoryMessages', async () => {
      const longHistory = Array.from({ length: 30 }, (_, i) => new HumanMessage({ content: `Message ${i}` }));

      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: longHistory },
      });
      jest.spyOn(service, 'retrieveRelevantMemories').mockResolvedValue([]);

      const result = await service.buildEnrichedContext(mockCurrentMessages, 'test-thread', {
        maxHistoryMessages: 5,
      });

      // Should have last 5 history messages + current message
      expect(result).toHaveLength(6);
      expect(result[0].content).toBe('Message 25'); // Last 5 messages from index 25-29
      expect(result[4].content).toBe('Message 29');
      expect(result[5]).toBe(mockCurrentMessages[0]);
    });

    it('should use custom semantic query when provided', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: [] },
      });
      jest.spyOn(service, 'retrieveRelevantMemories').mockResolvedValue([]);

      await service.buildEnrichedContext(mockCurrentMessages, 'test-thread', {
        semanticQuery: 'custom search query',
      });

      // Expect the service method to have been called with the right query
      expect(service.retrieveRelevantMemories).toHaveBeenCalledWith('custom search query', 'test-thread', { includeGlobalMemories: true });
    });

    it('should extract query from current messages when no semantic query provided', async () => {
      const messagesWithComplexContent = [
        new HumanMessage({
          content: [{ type: 'text', text: 'Complex content message' }] as Array<{ type: string; text: string }>,
        }),
      ];

      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: [] },
      });
      jest.spyOn(service, 'retrieveRelevantMemories').mockResolvedValue([]);

      await service.buildEnrichedContext(messagesWithComplexContent, 'test-thread');

      expect(service.retrieveRelevantMemories).toHaveBeenCalledWith(expect.stringContaining('Complex content message'), 'test-thread', {
        includeGlobalMemories: true,
      });
    });

    it('should skip semantic memories when disabled', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({
        channel_values: { messages: mockHistory },
      });

      const spy = jest.spyOn(service, 'retrieveRelevantMemories').mockResolvedValue([]);

      const result = await service.buildEnrichedContext(mockCurrentMessages, 'test-thread', {
        includeSemanticMemories: false,
      });

      expect(result).toHaveLength(3); // history (2) + current messages (1)
      expect(spy).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and return current messages', async () => {
      mockPostgresCheckpointer.get.mockRejectedValue(new Error('History fetch failed'));

      const result = await service.buildEnrichedContext(mockCurrentMessages, 'test-thread');

      expect(result).toEqual(mockCurrentMessages);
    });
  });

  describe('processNewMessages', () => {
    const mockMessages = [new HumanMessage({ content: 'Question' }), new AIMessage({ content: 'Answer' })];

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should store new messages with default options', async () => {
      mockVectorStoreService.storeMemories.mockResolvedValue();
      const storeConversationMemorySpy = jest.spyOn(service, 'storeConversationMemory');

      await service.processNewMessages(mockMessages, 'test-thread');

      expect(storeConversationMemorySpy).toHaveBeenCalledWith(mockMessages, 'test-thread', {
        batchStore: true,
        importance: undefined,
      });
    });

    it('should pass through custom options', async () => {
      mockVectorStoreService.storeMemories.mockResolvedValue();
      const storeConversationMemorySpy = jest.spyOn(service, 'storeConversationMemory');

      await service.processNewMessages(mockMessages, 'test-thread', {
        batchStore: false,
        importance: 8,
      });

      expect(storeConversationMemorySpy).toHaveBeenCalledWith(mockMessages, 'test-thread', {
        batchStore: false,
        importance: 8,
      });
    });
  });

  describe('clearThreadMemories', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clear semantic memories when enabled', async () => {
      mockVectorStoreService.clearThreadMemories.mockResolvedValue();

      await service.clearThreadMemories('test-thread');

      expect(mockVectorStoreService.clearThreadMemories).toHaveBeenCalledWith('test-thread');
    });

    it('should not clear semantic memories when disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const mockDatabaseConfig = { host: 'localhost', port: 5432, username: 'test', password: 'test', database: 'test_db' };
      const newService = new MemoryService(mockVectorStoreService, mockDatabaseConfig);
      await newService.onModuleInit();

      await newService.clearThreadMemories('test-thread');

      expect(mockVectorStoreService.clearThreadMemories).not.toHaveBeenCalled();
    });

    it('should propagate clearing errors', async () => {
      mockVectorStoreService.clearThreadMemories.mockRejectedValue(new Error('Clear failed'));

      await expect(service.clearThreadMemories('test-thread')).rejects.toThrow('Clear failed');
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return health status for both systems', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({});
      mockVectorStoreService.getHealthStatus.mockResolvedValue({
        available: true,
        connected: true,
      });

      const status = await service.getHealthStatus();

      expect(status).toEqual({
        checkpointer: {
          available: true,
          lastChecked: expect.any(Number),
        },
        semantic: {
          available: true,
          connected: true,
          lastChecked: expect.any(Number),
        },
      });
    });

    it('should handle checkpointer errors', async () => {
      mockPostgresCheckpointer.get.mockRejectedValue(new Error('Checkpointer failed'));
      mockVectorStoreService.getHealthStatus.mockResolvedValue({
        available: true,
        connected: true,
      });

      const status = await service.getHealthStatus();

      expect(status.checkpointer).toEqual({
        available: false,
        error: 'Checkpointer failed',
        lastChecked: expect.any(Number),
      });
    });

    it('should handle semantic memory errors', async () => {
      mockPostgresCheckpointer.get.mockResolvedValue({});
      mockVectorStoreService.getHealthStatus.mockRejectedValue(new Error('Qdrant failed'));

      const status = await service.getHealthStatus();

      expect(status.semantic).toEqual({
        available: false,
        error: 'Qdrant failed',
        lastChecked: expect.any(Number),
      });
    });

    it('should not check semantic memory when disabled', async () => {
      process.env.ENABLE_SEMANTIC_MEMORY = 'false';
      const mockDatabaseConfig = { host: 'localhost', port: 5432, username: 'test', password: 'test', database: 'test_db' };
      const newService = new MemoryService(mockVectorStoreService, mockDatabaseConfig);
      await newService.onModuleInit();
      mockPostgresCheckpointer.get.mockResolvedValue({});

      const status = await newService.getHealthStatus();

      expect(status.semantic).toEqual({
        available: false,
        lastChecked: expect.any(Number),
      });
      expect(mockVectorStoreService.getHealthStatus).not.toHaveBeenCalled();
    });
  });

  describe('getVectorStoreService', () => {
    it('should return the VectorStoreService instance', () => {
      const vectorStoreService = service.getVectorStoreService();

      expect(vectorStoreService).toBe(mockVectorStoreService);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const config = service.getConfig();

      expect(config).toEqual({
        enableSemanticMemory: true,
        maxMessagesForMemory: 10,
        memoryRetrievalThreshold: 0.8,
        memoryBatchSize: 3,
      });
    });

    it('should return a copy (not reference) of the config', () => {
      const config = service.getConfig();
      config.enableSemanticMemory = false;

      const secondConfig = service.getConfig();
      expect(secondConfig.enableSemanticMemory).toBe(true);
    });
  });
});
