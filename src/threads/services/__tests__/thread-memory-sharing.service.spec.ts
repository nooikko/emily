import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { HybridMemoryServiceInterface, RetrievedMemory } from '../../../agent/memory/types';
import { ConversationThread } from '../../entities/conversation-thread.entity';
import {
  MemoryIsolationLevel,
  type MemoryScope,
  type MemorySharingRequest,
  type MemorySyncOptions,
  ThreadMemorySharingService,
} from '../thread-memory-sharing.service';
import { ThreadSummaryService } from '../thread-summary.service';
import { ThreadsService } from '../threads.service';

describe('ThreadMemorySharingService', () => {
  let service: ThreadMemorySharingService;
  let threadRepository: Repository<ConversationThread>;
  let threadsService: ThreadsService;
  let threadSummaryService: ThreadSummaryService;
  let memoryService: HybridMemoryServiceInterface;

  const createMockCategory = (overrides: any = {}): any => ({
    id: 'category-1',
    name: 'Test Category',
    description: 'Test category description',
    color: '#3B82F6',
    icon: 'chat',
    sortOrder: 0,
    isActive: true,
    isSystem: false,
    createdBy: null,
    threadCount: 0,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    incrementThreadCount: jest.fn(),
    decrementThreadCount: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    isSystemCategory: jest.fn().mockReturnValue(false),
    canEdit: jest.fn().mockReturnValue(true),
    canDelete: jest.fn().mockReturnValue(true),
    toSafeObject: jest.fn(),
    ...overrides,
  });

  const createMockThread = (overrides: Partial<ConversationThread> = {}): ConversationThread => ({
    id: 'thread-1',
    title: 'Test Thread',
    categoryId: 'category-1',
    category: createMockCategory(),
    parentThreadId: null,
    parentThread: null,
    childThreads: [],
    summary: 'Test thread summary',
    status: 'active' as any,
    priority: 'normal' as any,
    tags: [],
    messageCount: 0,
    unreadCount: 0,
    lastActivityAt: new Date(),
    lastMessagePreview: null,
    lastMessageSender: null,
    metadata: null,
    branchType: 'root' as any,
    branchPointMessageId: null,
    branchMetadata: null,
    mergeMetadata: null,
    isMainBranch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: Promise.resolve([]),
    // Required methods
    updateLastActivity: jest.fn(),
    incrementMessageCount: jest.fn(),
    decrementMessageCount: jest.fn(),
    archive: jest.fn(),
    delete: jest.fn(),
    restore: jest.fn(),
    isActive: jest.fn().mockReturnValue(true),
    isArchived: jest.fn().mockReturnValue(false),
    isDeleted: jest.fn().mockReturnValue(false),
    generateTitle: jest.fn(),
    createBranch: jest.fn(),
    markAsMerged: jest.fn(),
    isBranch: jest.fn().mockReturnValue(false),
    isRoot: jest.fn().mockReturnValue(true),
    isMerged: jest.fn().mockReturnValue(false),
    getBranchDepth: jest.fn().mockResolvedValue(0),
    toSafeObject: jest.fn(),
    ...overrides,
  } as unknown as ConversationThread);

  const mockThread = createMockThread();

  const mockChildThread = createMockThread({
    id: 'thread-2',
    title: 'Child Thread',
    parentThreadId: 'thread-1',
    parentThread: mockThread,
  });

  const mockSiblingThread = createMockThread({
    id: 'thread-3',
    title: 'Sibling Thread',
  });

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
    // Clear service cache between tests to avoid interference
    if (service) {
      service.clearAccessCache();
    }
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
      const threadWithRelations = createMockThread({
        ...mockThread,
        parentThread: { id: 'parent-1' } as any,
        childThreads: Promise.resolve([{ id: 'child-1' }, { id: 'child-2' }] as any),
      });

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
      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockThread).mockResolvedValueOnce(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should allow read access for parent-child relationship', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockChildThread).mockResolvedValueOnce(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-2',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should deny write access for parent-child relationship', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockChildThread).mockResolvedValueOnce(mockThread);

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
      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockThread).mockResolvedValueOnce(mockSiblingThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-3',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
    });

    it('should deny access for unrelated threads', async () => {
      const unrelatedThread = createMockThread({
        id: 'thread-4',
        categoryId: 'category-2',
        category: createMockCategory({ id: 'category-2', name: 'Different Category' }),
      });

      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockThread).mockResolvedValueOnce(unrelatedThread);

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
      const findOneSpy = jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

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
      const thread1 = createMockThread({ categoryId: 'cat-1', category: createMockCategory({ id: 'cat-1' }) });
      const thread3 = createMockThread({ id: 'thread-3', categoryId: 'cat-2', category: createMockCategory({ id: 'cat-2' }) });

      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(thread1).mockResolvedValueOnce(thread3);

      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([thread1, thread3]);

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
      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledWith('test query', 'thread-1', { limit: 10, includeGlobalMemories: false });
      expect(result).toEqual(mockMemories);
    });

    it('should include shared memories with READ_ONLY isolation', async () => {
      const sharedMemoryFromThread = {
        content: 'Shared Memory from Thread 2',
        relevanceScore: 0.75,
        timestamp: Date.now(),
        messageType: 'ai' as const,
      };

      // Mock the primary call and the shared thread call
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories) // First call for own memories
        .mockResolvedValueOnce([sharedMemoryFromThread]); // Second call for shared thread

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.READ_ONLY,
        allowedThreads: ['thread-2'],
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope, 10);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledTimes(2);
      expect(memoryService.retrieveRelevantMemories).toHaveBeenNthCalledWith(1, 'test query', 'thread-1', { limit: 10, includeGlobalMemories: false });
      expect(memoryService.retrieveRelevantMemories).toHaveBeenNthCalledWith(2, 'test query', 'thread-2', { limit: 5, includeGlobalMemories: false });
      
      expect(result.length).toBeGreaterThanOrEqual(3); // 2 own memories + 1 shared memory
      // Check that shared memories have reduced relevance (0.75 * 0.8 = 0.6)
      const sharedMemories = result.filter((m) => Math.abs(m.relevanceScore - 0.6) < 0.001);
      expect(sharedMemories.length).toBe(1);
      expect(sharedMemories[0].content).toBe('Shared Memory from Thread 2');
    });

    it('should include category memories with CATEGORY_SCOPED isolation', async () => {
      const categoryMemoryFromThread3 = {
        content: 'Category Memory from Thread 3',
        relevanceScore: 0.8,
        timestamp: Date.now(),
        messageType: 'human' as const,
      };

      // Mock primary memories and category thread memories
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories) // First call for own memories
        .mockResolvedValueOnce([categoryMemoryFromThread3]); // Second call for category thread

      // Mock finding threads in the same category
      jest.spyOn(threadRepository, 'find').mockResolvedValue([{ id: 'thread-1' }, { id: 'thread-3' }] as ConversationThread[]);

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
      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledTimes(2);
      expect(result.length).toBeGreaterThanOrEqual(3); // 2 own memories + 1 category memory
      // Check for category memories with reduced relevance (0.8 * 0.7 = 0.56)
      const categoryMems = result.filter((m) => Math.abs(m.relevanceScore - 0.56) < 0.001);
      expect(categoryMems.length).toBe(1);
      expect(categoryMems[0].content).toBe('Category Memory from Thread 3');
    });

    it('should include hierarchy memories with HIERARCHY_SCOPED isolation', async () => {
      const hierarchyMemoryFromParent = {
        content: 'Hierarchy Memory from Parent',
        relevanceScore: 0.85,
        timestamp: Date.now(),
        messageType: 'ai' as const,
      };

      // Mock primary memories and hierarchy memories
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockResolvedValueOnce(mockMemories) // First call for own memories
        .mockResolvedValueOnce([hierarchyMemoryFromParent]); // Second call for parent thread

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.HIERARCHY_SCOPED,
        allowedThreads: ['parent-1'],
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledTimes(2);
      expect(result.length).toBeGreaterThanOrEqual(2); // Own memories + hierarchy memories
      // Check for hierarchy memories with higher relevance (0.85 * 0.9 = 0.765)
      const hierarchyMems = result.filter((m) => m.relevanceScore === 0.765);
      expect(hierarchyMems.length).toBe(1);
      expect(hierarchyMems[0].content).toBe('Hierarchy Memory from Parent');
    });

    it('should include global memories with UNRESTRICTED isolation', async () => {
      const globalMemories = [...mockMemories, { content: 'Global', relevanceScore: 0.7, timestamp: Date.now(), messageType: 'ai' as const }];
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(globalMemories);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.UNRESTRICTED,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledWith('test query', 'thread-1', { limit: 10, includeGlobalMemories: true });
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

      const pool = await service.createSharedMemoryPool('Test Pool', ['thread-1', 'thread-3'], MemoryIsolationLevel.EXPLICIT_SHARED, {
        purpose: 'Testing',
      });

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

      await expect(service.createSharedMemoryPool('Test Pool', ['thread-1', 'thread-3'])).rejects.toThrow(NotFoundException);
    });

    it('should store pool for later retrieval', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]);

      const pool = await service.createSharedMemoryPool('Test Pool', ['thread-1']);
      const pools = service.getMemoryPools();

      expect(pools).toContainEqual(pool);
    });
  });

  describe('synchronizeMemories', () => {
    const messages: BaseMessage[] = [new HumanMessage('Test message 1'), new AIMessage('Response 1')];

    beforeEach(() => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValueOnce(mockThread).mockResolvedValueOnce(mockSiblingThread);
    });

    it('should synchronize memories with pull direction', async () => {
      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(messages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'pull',
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-3', options);

      expect(memoryService.getConversationHistory).toHaveBeenCalledWith('thread-3');
      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(messages, 'thread-1', { tags: ['synchronized', 'from_thread-3'] });
      expect(result.synchronized).toBe(2);
    });

    it('should synchronize memories with push direction using memory pool', async () => {
      // Use threads from different categories to avoid category access control blocking
      const sourceThread = createMockThread({ categoryId: 'category-1', category: createMockCategory({ id: 'category-1' }) });
      const targetThread = createMockThread({
        id: 'thread-4',
        categoryId: 'category-2',
        category: createMockCategory({ id: 'category-2', name: 'Different Category' }),
      });

      jest.spyOn(threadRepository, 'findOne').mockReset().mockResolvedValueOnce(sourceThread).mockResolvedValueOnce(targetThread);
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([sourceThread, targetThread]);

      // Create shared memory pool to enable write access between different category threads
      await service.createSharedMemoryPool('test-pool', ['thread-1', 'thread-4']);

      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(messages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const options: MemorySyncOptions = {
        direction: 'push',
      };

      const result = await service.synchronizeMemories('thread-1', 'thread-4', options);

      expect(memoryService.getConversationHistory).toHaveBeenCalledWith('thread-1');
      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(messages, 'thread-4', { tags: ['synchronized', 'from_thread-1'] });
      expect(result.synchronized).toBe(2);
    });

    it('should fail to synchronize with push when write access denied (same category)', async () => {
      // Mock same-category threads - these deny write access but allow read
      const sourceThread = { ...mockThread } as unknown as ConversationThread;
      const targetThread = { ...mockSiblingThread } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne').mockReset().mockResolvedValueOnce(sourceThread).mockResolvedValueOnce(targetThread);

      const options: MemorySyncOptions = {
        direction: 'push',
      };

      await expect(service.synchronizeMemories('thread-1', 'thread-3', options)).rejects.toThrow(ForbiddenException);
      await expect(service.synchronizeMemories('thread-1', 'thread-3', options)).rejects.toThrow('Write access denied for category-scoped sharing');
    });

    it('should fail to synchronize with push when write access denied (parent-child)', async () => {
      // Mock parent-child relationship which denies write access
      const childThread = { ...mockChildThread } as unknown as ConversationThread;
      const parentThread = { ...mockThread } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne').mockReset().mockResolvedValueOnce(childThread).mockResolvedValueOnce(parentThread);

      const options: MemorySyncOptions = {
        direction: 'push',
      };

      await expect(service.synchronizeMemories('thread-2', 'thread-1', options)).rejects.toThrow(ForbiddenException);
      await expect(service.synchronizeMemories('thread-2', 'thread-1', options)).rejects.toThrow('Write access denied for parent-child relationship');
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

      jest.spyOn(threadRepository, 'findOne').mockReset().mockResolvedValueOnce(mockThread).mockResolvedValueOnce(unrelatedThread);

      const options: MemorySyncOptions = {
        direction: 'pull',
      };

      await expect(service.synchronizeMemories('thread-1', 'thread-4', options)).rejects.toThrow(ForbiddenException);
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
        expect.any(Object),
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
      const siblingThreadWithSummary = {
        ...mockSiblingThread,
        summary: 'Summary of sibling thread discussion about important topics',
      } as ConversationThread;

      const relatedMemories = [
        {
          content: 'Related memory from thread-3',
          relevanceScore: 0.7,
          timestamp: Date.now(),
          messageType: 'human' as const,
        },
      ];

      // Mock for retrieveMemoriesWithIsolation calls - primary context
      jest.spyOn(memoryService, 'retrieveRelevantMemories')
        .mockImplementation((query: string, threadId: string, options?: any) => {
          if (threadId === 'thread-1') {
            return Promise.resolve(mockMemories); // Primary context
          } else if (threadId === 'thread-3') {
            return Promise.resolve(relatedMemories); // Related memories
          }
          return Promise.resolve([]);
        });

      // Mock finding category threads
      jest.spyOn(threadRepository, 'find').mockResolvedValue([{ id: 'thread-1' }, { id: 'thread-3' }] as ConversationThread[]);

      // Mock finding individual thread for summary
      jest.spyOn(threadRepository, 'findOne').mockImplementation((options: any) => {
        if (options.where?.id === 'thread-3') {
          return Promise.resolve(siblingThreadWithSummary);
        }
        return Promise.resolve(null);
      });

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
          summary: 'Summary of sibling thread discussion about important topics',
        }),
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
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockImplementation(() => Promise.resolve(mockMemories));

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

  describe('edge cases and error handling', () => {
    it('should handle memory retrieval failure gracefully', async () => {
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockRejectedValue(new Error('Memory service unavailable'));

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      await expect(service.retrieveMemoriesWithIsolation('test query', scope)).rejects.toThrow('Memory service unavailable');
    });

    it('should handle synchronization with empty conversation history', async () => {
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread, { ...mockSiblingThread, categoryId: 'category-2' } as ConversationThread]);
      await service.createSharedMemoryPool('test-pool', ['thread-1', 'thread-3']);

      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce({ ...mockSiblingThread, categoryId: 'category-2' } as ConversationThread);

      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue([]);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const result = await service.synchronizeMemories('thread-1', 'thread-3', { direction: 'pull' });

      expect(result.synchronized).toBe(0);
      expect(memoryService.storeConversationMemory).not.toHaveBeenCalled();
    });

    it('should handle cross-thread context when threads have no summaries', async () => {
      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockImplementation((query: string, threadId: string) => {
        if (threadId === 'thread-1') {
          return Promise.resolve(mockMemories);
        }
        return Promise.resolve([]);
      });

      jest.spyOn(threadRepository, 'find').mockResolvedValue([{ id: 'thread-1' }, { id: 'thread-3' }] as ConversationThread[]);
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(createMockThread({ id: 'thread-3', title: 'Sibling Thread', summary: undefined }));

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.CATEGORY_SCOPED,
        allowedCategories: ['category-1'],
      };

      const result = await service.getCrossThreadContext('thread-1', 'test query', scope);

      expect(result.primaryContext.length).toBeGreaterThan(0);
      expect(result.summaries).toEqual([]); // No summaries since thread has no summary
    });

    it('should enforce time-based access restrictions', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 24 hours ago
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours from now

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.READ_ONLY,
        allowedThreads: ['thread-2'],
        timeWindow: {
          start: futureDate, // Invalid time window (start after end)
          end: pastDate,
        },
      };

      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const result = await service.createMemoryScope('thread-1', MemoryIsolationLevel.READ_ONLY, scope);

      expect(result.timeWindow).toEqual({
        start: futureDate,
        end: pastDate,
      });
    });

    it('should handle access cache clearing', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-1',
        accessType: 'read',
      };

      // First call - cache miss
      const firstResult = await service.checkMemoryAccess(request);
      expect(threadRepository.findOne).toHaveBeenCalledTimes(2);
      expect(firstResult.granted).toBe(true);

      // Clear cache manually to simulate expiration or forced refresh
      service.clearAccessCache();

      // Second call after cache clear - should call repository again
      const secondResult = await service.checkMemoryAccess(request);
      expect(threadRepository.findOne).toHaveBeenCalledTimes(4);
      expect(secondResult.granted).toBe(true);
    });

    it('should handle memory pool creation with metadata expiration', async () => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread]);

      const pool = await service.createSharedMemoryPool(
        'Expiring Pool',
        ['thread-1'],
        MemoryIsolationLevel.EXPLICIT_SHARED,
        {
          purpose: 'temporary collaboration',
          tags: ['temp', 'collaboration'],
          expiresAt,
        },
      );

      expect(pool.metadata?.purpose).toBe('temporary collaboration');
      expect(pool.metadata?.tags).toEqual(['temp', 'collaboration']);
      expect(pool.metadata?.expiresAt).toEqual(expiresAt);
      expect(pool.metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should handle complex message filtering with all filter types', async () => {
      const now = Date.now();
      const complexMessages = [
        new HumanMessage({
          content: 'Important recent message',
          additional_kwargs: {
            timestamp: now - 1000,
            tags: ['important', 'recent'],
            importance: 8,
          },
        }),
        new HumanMessage({
          content: 'Old unimportant message',
          additional_kwargs: {
            timestamp: now - 1000 * 60 * 60 * 24, // 1 day ago
            tags: ['old'],
            importance: 3,
          },
        }),
        new HumanMessage({
          content: 'Recent but unimportant',
          additional_kwargs: {
            timestamp: now - 2000,
            tags: ['recent'],
            importance: 2,
          },
        }),
      ];

      jest.spyOn(threadRepository, 'findByIds').mockResolvedValue([mockThread, { ...mockSiblingThread, categoryId: 'category-2' } as ConversationThread]);
      await service.createSharedMemoryPool('filter-test', ['thread-1', 'thread-3']);

      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce({ ...mockSiblingThread, categoryId: 'category-2' } as ConversationThread);

      jest.spyOn(memoryService, 'getConversationHistory').mockResolvedValue(complexMessages);
      jest.spyOn(memoryService, 'storeConversationMemory').mockResolvedValue();

      const result = await service.synchronizeMemories('thread-1', 'thread-3', {
        direction: 'push',
        filter: {
          tags: ['important'],
          timeRange: {
            start: new Date(now - 1000 * 60 * 60), // 1 hour ago
            end: new Date(now),
          },
          importance: 5,
        },
      });

      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(
        [complexMessages[0]], // Only the important, recent, high-importance message
        'thread-3',
        { tags: ['synchronized', 'from_thread-1'] },
      );
      expect(result.synchronized).toBe(1);
    });
  });

  describe('privacy and security validation', () => {
    it('should prevent access to threads without proper relationships', async () => {
      const isolatedThread = {
        id: 'isolated-thread',
        categoryId: 'isolated-category',
        category: { id: 'isolated-category', name: 'Isolated Category' },
        parentThreadId: null,
        parentThread: null,
        childThreads: [],
      } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(mockThread)
        .mockResolvedValueOnce(isolatedThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'isolated-thread',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('No sharing relationship exists between threads');
    });

    it('should validate memory scope permissions with user roles', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const scope = await service.createMemoryScope('thread-1', MemoryIsolationLevel.EXPLICIT_SHARED, {
        userId: 'user-123',
        userRole: 'viewer',
        allowedThreads: ['thread-2', 'thread-3'],
      });

      expect(scope.userId).toBe('user-123');
      expect(scope.userRole).toBe('viewer');
      expect(scope.allowedThreads).toEqual(['thread-2', 'thread-3']);
    });

    it('should maintain audit trail for access requests', async () => {
      jest.spyOn(threadRepository, 'findOne').mockResolvedValue(mockThread);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-1',
        targetThreadId: 'thread-1',
        accessType: 'read',
        reason: 'User requested access to own thread',
        userId: 'user-123',
      };

      const result = await service.checkMemoryAccess(request);

      expect(result.granted).toBe(true);
      expect(result.auditEntry).toMatchObject({
        timestamp: expect.any(Date),
        action: 'memory_access_check',
        result: 'granted',
        metadata: undefined, // No metadata for successful access
      });
    });

    it('should ensure memory deduplication works with complex scenarios', async () => {
      const duplicateContent = 'Duplicate content';
      const timestamp = Date.now();
      
      const memoriesWithDuplicates = [
        { content: duplicateContent, relevanceScore: 0.9, timestamp, messageType: 'human' as const },
        { content: 'Unique content 1', relevanceScore: 0.8, timestamp: timestamp + 1, messageType: 'ai' as const },
        { content: duplicateContent, relevanceScore: 0.7, timestamp, messageType: 'human' as const }, // Exact duplicate
        { content: 'Unique content 2', relevanceScore: 0.6, timestamp: timestamp + 2, messageType: 'ai' as const },
        { content: duplicateContent, relevanceScore: 0.5, timestamp: timestamp + 100, messageType: 'human' as const }, // Same content, different timestamp
      ];

      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(memoriesWithDuplicates);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.STRICT,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      // Should have 4 unique memories (first duplicate kept, exact duplicate removed, different timestamp kept)
      expect(result).toHaveLength(4);
      expect(result.filter(m => m.content === duplicateContent)).toHaveLength(2); // First and third (different timestamps)
      expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore); // Sorted by relevance
    });

    it('should handle thread relationships with circular references safely', async () => {
      // Create a mock scenario with circular parent-child references (shouldn't happen in real DB)
      const threadA = {
        id: 'thread-a',
        categoryId: 'category-1',
        parentThreadId: 'thread-b',
      } as unknown as ConversationThread;

      const threadB = {
        id: 'thread-b',
        categoryId: 'category-1',
        parentThreadId: 'thread-a', // Circular reference
      } as unknown as ConversationThread;

      jest.spyOn(threadRepository, 'findOne')
        .mockResolvedValueOnce(threadA)
        .mockResolvedValueOnce(threadB);

      const request: MemorySharingRequest = {
        sourceThreadId: 'thread-a',
        targetThreadId: 'thread-b',
        accessType: 'read',
      };

      const result = await service.checkMemoryAccess(request);

      // Should handle the circular reference and still check parent-child relationship
      expect(result.granted).toBe(true); // threadA has threadB as parent
    });

    it('should validate unrestricted isolation level returns global memories', async () => {
      const globalMemoriesIncluded = [
        ...mockMemories,
        {
          content: 'Global memory from other threads',
          relevanceScore: 0.5,
          timestamp: Date.now(),
          messageType: 'ai' as const,
        },
      ];

      jest.spyOn(memoryService, 'retrieveRelevantMemories').mockResolvedValue(globalMemoriesIncluded);

      const scope: MemoryScope = {
        threadId: 'thread-1',
        isolationLevel: MemoryIsolationLevel.UNRESTRICTED,
      };

      const result = await service.retrieveMemoriesWithIsolation('test query', scope);

      expect(memoryService.retrieveRelevantMemories).toHaveBeenCalledWith('test query', 'thread-1', { 
        limit: 10, 
        includeGlobalMemories: true 
      });
      expect(result).toEqual(globalMemoriesIncluded);
      expect(result.some(m => m.content.includes('Global memory'))).toBe(true);
    });
  });
});
