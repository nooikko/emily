import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { ThreadMemorySharingService, MemoryIsolationLevel, type MemoryScope, type MemorySharingRequest, type MemorySyncOptions } from '../thread-memory-sharing.service';
import { ConversationThread } from '../../entities/conversation-thread.entity';
import { ThreadsService } from '../threads.service';
import { ThreadSummaryService } from '../thread-summary.service';
import type { HybridMemoryServiceInterface, RetrievedMemory } from '../../../agent/memory/types';

describe('ThreadMemorySharingService', () => {
  let service: ThreadMemorySharingService;
  let threadRepository: Repository<ConversationThread>;
  let threadsService: ThreadsService;
  let threadSummaryService: ThreadSummaryService;
  let memoryService: HybridMemoryServiceInterface;

  const mockThread = {
    id: 'thread-1',
    title: 'Test Thread',
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Test Category' },
    parentThreadId: null,
    parentThread: null,
    childThreads: [],
    summary: 'Test thread summary',
  } as unknown as ConversationThread;

  const mockChildThread = {
    id: 'thread-2',
    title: 'Child Thread',
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Test Category' },
    parentThreadId: 'thread-1',
    parentThread: mockThread,
    childThreads: [],
  } as unknown as ConversationThread;

  const mockSiblingThread = {
    id: 'thread-3',
    title: 'Sibling Thread',
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Test Category' },
    parentThreadId: null,
    parentThread: null,
    childThreads: [],
  } as unknown as ConversationThread;

  const mockMemories: RetrievedMemory[] = [
    {
      content: 'Memory 1',
      relevanceScore: 0.9,
      timestamp: Date.now(),
      messageType: 'human',
    },
    {
      content: 'Memory 2',
      relevanceScore: 0.8,
      timestamp: Date.now(),
      messageType: 'ai',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadMemorySharingService,
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findByIds: jest.fn(),
          },
        },
        {
          provide: ThreadsService,
          useValue: {
            findThreadById: jest.fn(),
          },
        },
        {
          provide: ThreadSummaryService,
          useValue: {
            generateSummary: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ThreadMemorySharingService>(ThreadMemorySharingService);
    threadRepository = module.get<Repository<ConversationThread>>(getRepositoryToken(ConversationThread));
    threadsService = module.get<ThreadsService>(ThreadsService);
    threadSummaryService = module.get<ThreadSummaryService>(ThreadSummaryService);
    
    // Create mock memory service
    memoryService = {
      retrieveRelevantMemories: jest.fn(),
      getConversationHistory: jest.fn(),
      storeConversationMemory: jest.fn(),
      processNewMessages: jest.fn(),
      buildEnrichedContext: jest.fn(),
      clearThreadMemories: jest.fn(),
      getHealthStatus: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as HybridMemoryServiceInterface;

    // Inject memory service manually since it's optional
    (service as any).memoryService = memoryService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMemoryScope', () => {
    it('should create a basic memory scope', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const scope = await service.createMemoryScope('thread-1', MemoryIsolationLevel.STRICT);

      expect(scope).toEqual({
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      });
    });

    it('should auto-populate allowed threads for hierarchy-scoped isolation', async () => {
      const threadWithRelations = {
        ...mockThread,
        parentThread: { id: 'parent-1' },
        childThreads: [{ id: 'child-1' }, { id: 'child-2' }],
      } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(threadWithRelations);

      const scope = await service.createMemoryScope('thread-1', MemoryIsolationLevel.HIERARCHY_SCOPED);

      expect(scope.allowedThreads).toEqual(['parent-1', 'child-1', 'child-2']);
    });

    it('should auto-populate allowed categories for category-scoped isolation', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const scope = await service.createMemoryScope('thread-1', MemoryIsolationLevel.CATEGORY_SCOPED);

      expect(scope.allowedCategories).toEqual(['category-1']);
    });

    it('should throw NotFoundException for non-existent thread', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(null);

      await expect(service.createMemoryScope('invalid-thread')).rejects.toThrow(NotFoundException);
    });

    it('should merge additional options', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const scope = await service.createMemoryScope('thread-1', MemoryIsolationLevel.EXPLICIT_SHARED, {
        userId: 'user-1',
        userRole: 'owner',
        allowedThreads: ['thread-2', 'thread-3'],
      });

      expect(scope.userId).toBe('user-1');
      expect(scope.userRole).toBe('owner');
      expect(scope.allowedThreads).toEqual(['thread-2', 'thread-3']);
    });
  });

  describe('checkMemoryAccess', () => {
    it('should allow access to same thread', async () => {
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should allow read access for parent-child relationship', async () => {
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockChildThread)
        .mockResolvedValueOnce(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-2',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should deny write access for parent-child relationship', async () => {
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockChildThread)
        .mockResolvedValueOnce(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-2',
        targetThreadId: 'thread-1',
        accessType: 'write',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Write access denied');
    });

    it('should allow read access for same category', async () => {
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(mockSiblingThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-3',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should deny access for unrelated threads', async () => {
      const unrelatedThread = {
        ...mockThread,
        id: 'thread-4',
        categoryId: 'category-2',
        category: { id: 'category-2', name: 'Different Category' },
      } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(unrelatedThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-4',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('No sharing relationship');
    });

    it('should use cached results within TTL', async () => {
      const findOneSpy = jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValue(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      // First call
      await service.checkMemoryAccess(request);
      expect(findOneSpy).toHaveBeenCalledTimes(2);

      // Second call (should use cache)
      await service.checkMemoryAccess(request);
      expect(findOneSpy).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('should handle threads in same memory pool', async () => {
      // Mock threads without same category to test pool access specifically
      const thread1 = { ...mockThread, categoryId: 'cat-1', category: { id: 'cat-1' } } as unknown as ConversationThread;
      const thread3 = { ...mockSiblingThread, categoryId: 'cat-2', category: { id: 'cat-2' } } as unknown as ConversationThread;
      
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(thread1)
        .mockResolvedValueOnce(thread3);
      
      jest.spyOn(threadRepository, 'findByIds')
        .mockResolvedValue([thread1, thread3]);

      // Create a shared pool first
      await service.createSharedMemoryPool('test-pool', ['thread-1', 'thread-3']);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-3',
        accessType: 'write',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });
  });

  describe('retrieveMemoriesWithIsolation', () => {
    it('should retrieve only own memories with STRICT isolation', async () => {
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(mockMemories);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledTimes(1);
      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledWith(
        'test query',
        'thread-1',
        { limit: 10, includeGlobalMemories: false }
      );
      expect(result).toEqual(mockMemories);
    });

    it('should include shared memories with READ_ONLY isolation', async () => {
      const sharedMemory = { ...mockMemories[0], relevanceScore: 0.72 }; // Will be 0.9 * 0.8
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories)
        .mockResolvedValueOnce([sharedMemory]);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.READ_ONLY,
        allowedThreads: ['thread-2'],
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope, 10);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledTimes(2);
      expect(result.length).toBeGreaterThanOrEqual(2); // At least own memories
      // Check that shared memories have reduced relevance
      const sharedMemories = result.filter(m => m.relevanceScore === 0.72);
      expect(sharedMemories.length).toBeGreaterThan(0);
    });

    it('should include category memories with CATEGORY_SCOPED isolation', async () => {
      const categoryMemory = { ...mockMemories[0], relevanceScore: 0.63 }; // Will be 0.9 * 0.7
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories)
        .mockResolvedValueOnce([categoryMemory]);

      jest.spyOn(threadRepository, 'find').mockResolvedValue([
        { id: 'thread-1' },
        { id: 'thread-3' },
      ] as ConversationThread[]);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.CATEGORY_SCOPED,
        allowedCategories: ['category-1'],
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(threadRepository.find).toHaveBeenCalledWith({
        where: { categoryId: 'category-1' },
        select: ['id'],
      });
      expect(result.length).toBeGreaterThanOrEqual(2); // At least own memories
      // Check for category memories with reduced relevance
      const categoryMems = result.filter(m => m.relevanceScore === 0.63);
      expect(categoryMems.length).toBeGreaterThan(0);
    });

    it('should include hierarchy memories with HIERARCHY_SCOPED isolation', async () => {
      const hierarchyMemory = { ...mockMemories[0], relevanceScore: 0.81 }; // Will be 0.9 * 0.9
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories)
        .mockResolvedValueOnce([hierarchyMemory]);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.HIERARCHY_SCOPED,
        allowedThreads: ['parent-1'],
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(result.length).toBeGreaterThanOrEqual(2); // At least own memories
      // Check for hierarchy memories with higher relevance
      const hierarchyMems = result.filter(m => m.relevanceScore === 0.81);
      expect(hierarchyMems.length).toBeGreaterThan(0);
    });

    it('should include global memories with UNRESTRICTED isolation', async () => {
      const globalMemories = [...mockMemories, { content: 'Global', relevanceScore: 0.7, timestamp: Date.now(), messageType: 'ai' as const }];
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(globalMemories);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.UNRESTRICTED,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledWith(
        'test query',
        'thread-1',
        { limit: 10, includeGlobalMemories: true }
      );
      expect(result).toEqual(globalMemories);
    });

    it('should deduplicate memories', async () => {
      const duplicatedMemories = [...mockMemories, mockMemories[0]];
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(duplicatedMemories);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(result).toHaveLength(2); // Should remove duplicate
    });

    it('should return empty array when no memory service', async () => {
      (service as any).memoryService = undefined;

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(result).toEqual([]);
    });
  });

  describe('createSharedMemoryPool', () => {
    it('should create a shared memory pool', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread, mockSiblingThread]);

      const pool = await service.createSharedMemoryPool(
        'Test Pool',
        ['thread-1', 'thread-3'],
        MemoryIsolationLevel.EXPLICIT_SHARED,
        { purpose: 'Testing' }
      );

      expect(pool).toMatchObject({
        name: 'Test Pool',
        threadIds: ['thread-1', 'thread-3'],
        isolationLevel: MemoryIsolationLevel.EXPLICIT_SHARED,
        metadata: expect.objectContaining({
          purpose: 'Testing',
          createdAt: expect.any(Date),
        }),
      });
      expect(pool.id).toMatch(/^pool_/);
    });

    it('should throw NotFoundException if any thread not found', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]); // Only one thread found

      await expect(
        service.createSharedMemoryPool('Test Pool', ['thread-1', 'thread-3'])
      ).rejects.toThrow(NotFoundException);
    });

    it('should store pool for later retrieval', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]);

      const pool = await service.createSharedMemoryPool('Test Pool', ['thread-1']);
      const pools = service.getMemoryPools();

      expect(pools).toContainEqual(pool);
    });
  });

  describe('synchronizeMemories', () => {
    const messages: BaseMessage[] = [
      new HumanMessage('Test message 1'),
      new AIMessage('Response 1'),
    ];

    beforeEach(() => {
      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(mockSiblingThread);
    });

    it('should synchronize memories with pull direction', async () => {
      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(messages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'pull',
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-3', options);

      expect(memoryService.getConversationHistory).toHaveBeenCalledWith('thread-3');
      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(
        messages,
        'thread-1',
        { tags: ['synchronized', 'from_thread-3'] }
      );
      expect(result.synchronized).toBe(2);
    });

    it('should synchronize memories with push direction', async () => {
      // Mock parent-child relationship for write access
      const childThread = { ...mockChildThread } as unknown as ConversationThread;
      const parentThread = { ...mockThread } as unknown as ConversationThread;
      
      jest.spyOn(threadRepository, 'findOne')
        .mockReset()
        .mockResolvedValueOnce(childThread)
        .mockResolvedValueOnce(parentThread);
      
      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(messages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'push',
      };

      const result = await service.synchronizeMemories('thread-2', 'thread-1', options);

      expect(memoryService.getConversationHistory).toHaveBeenCalledWith('thread-2');
      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(
        messages,
        'thread-1',
        { tags: ['synchronized', 'from_thread-2'] }
      );
      expect(result.synchronized).toBe(2);
    });

    it('should synchronize bidirectionally', async () => {
      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(messages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'bidirectional',
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-3', options);

      expect(memoryService.getConversationHistory).toHaveBeenCalledTimes(2);
      expect(memoryService.storeConversationMemory).toHaveBeenCalledTimes(2);
      expect(result.synchronized).toBe(4); // 2 messages each direction
    });

    it('should throw ForbiddenException if access denied', async () => {
      // Mock unrelated threads
      const unrelatedThread = {
        ...mockThread,
        id: 'thread-4',
        categoryId: 'category-2',
        category: null,
      } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne')
        .mockReset()
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(unrelatedThread);

      const options: MemorySyncOptions = {
        direction: 'pull',
      };

      await expect(
        service.synchronizeMemories('thread-1', 'thread-4', options)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should filter messages based on options', async () => {
      const taggedMessages = [
        new HumanMessage({ content: 'Tagged', additional_kwargs: { tags: ['important'] } }),
        new HumanMessage({ content: 'Not tagged', additional_kwargs: { tags: ['other'] } }),
      ];

      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(taggedMessages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'pull',
        filter: {
          tags: ['important'],
        },
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-3', options);

      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(
        [taggedMessages[0]], // Only the 'important' tagged message
        'thread-1',
        expect.any(Object)
      );
      expect(result.synchronized).toBe(1);
    });

    it('should return zero synchronized when no memory service', async () => {
      (service as any).memoryService = undefined;

      const options: MemorySyncOptions = {
        direction: 'pull',
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-3', options);

      expect(result).toEqual({ synchronized: 0, conflicts: 0 });
    });
  });

  describe('getCrossThreadContext', () => {
    it('should get cross-thread context with summaries', async () => {
      // Mock for retrieveMemoriesWithIsolation calls
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockImplementation(() => Promise.resolve(mockMemories));

      jest.spyOn(threadRepository, 'find').mockResolvedValue([
        { id: 'thread-3' } as ConversationThread,
      ]);

      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockSiblingThread);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.CATEGORY_SCOPED,
        allowedCategories: ['category-1'],
      };

      const result = await service.getCrossThreadContext('thread-1', 'test query', scope);

      expect(result.primaryContext.length).toBeGreaterThan(0);
      expect(result.sharedContext.length).toBeGreaterThanOrEqual(0);
      expect(result.summaries).toContainEqual(
        expect.objectContaining({
          threadId: 'thread-3',
          summary: expect.any(String),
        })
      );
    });

    it('should return empty shared context for STRICT isolation', async () => {
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(mockMemories);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      const result = await service.getCrossThreadContext('thread-1', 'test query', scope);

      expect(result.primaryContext).toEqual(mockMemories);
      expect(result.sharedContext).toEqual([]);
      expect(result.summaries).toEqual([]);
    });

    it('should include hierarchy summaries', async () => {
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockImplementation(() => Promise.resolve(mockMemories));

      const parentThread = {
        id: 'parent-1',
        summary: 'Parent summary',
      } as ConversationThread;

      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(parentThread);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.HIERARCHY_SCOPED,
        allowedThreads: ['parent-1'],
      };

      const result = await service.getCrossThreadContext('thread-1', 'test query', scope);

      expect(result.summaries).toContainEqual({
        threadId: 'parent-1',
        summary: 'Parent summary',
      });
    });
  });

  describe('utility methods', () => {
    it('should clear access cache', () => {
      service.clearAccessCache();
      // Should not throw
      expect(() => service.clearAccessCache()).not.toThrow();
    });

    it('should get all memory pools', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]);

      await service.createSharedMemoryPool('Pool 1', ['thread-1']);
      await service.createSharedMemoryPool('Pool 2', ['thread-1']);

      const pools = service.getMemoryPools();

      expect(pools).toHaveLength(2);
      expect(pools[0].name).toBe('Pool 1');
      expect(pools[1].name).toBe('Pool 2');
    });

    it('should delete memory pool', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]);

      const pool = await service.createSharedMemoryPool('Test Pool', ['thread-1']);
      const deleted = service.deleteMemoryPool(pool.id);

      expect(deleted).toBe(true);
      expect(service.getMemoryPools()).toHaveLength(0);
    });

    it('should return false when deleting non-existent pool', () => {
      const deleted = service.deleteMemoryPool('non-existent');
      expect(deleted).toBe(false);
    });
  });
});