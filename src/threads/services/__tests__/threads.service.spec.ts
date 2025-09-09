import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { StructuredLoggerService } from '../../../observability/services/structured-logger.service';
import type { AutoCreateThreadDto, CreateThreadDto } from '../../dto/create-thread.dto';
import type { ThreadQueryDto, ThreadSearchDto } from '../../dto/thread-query.dto';
import type { BulkUpdateThreadsDto, UpdateThreadDto } from '../../dto/update-thread.dto';
import { ConversationThread, ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { ThreadCategory } from '../../entities/thread-category.entity';
import { MessageSender, ThreadMessage } from '../../entities/thread-message.entity';
import { ThreadsService } from '../threads.service';

// Mock the StructuredLoggerService constructor
jest.mock('../../../observability/services/structured-logger.service');

describe('ThreadsService', () => {
  let service: ThreadsService;
  let threadRepository: jest.Mocked<Repository<ConversationThread>>;
  let _messageRepository: jest.Mocked<Repository<ThreadMessage>>;
  let categoryRepository: jest.Mocked<Repository<ThreadCategory>>;
  let loggerService: jest.Mocked<StructuredLoggerService>;

  // Test data builders
  const createMockThread = (overrides: Partial<ConversationThread> = {}): ConversationThread => {
    const thread = new ConversationThread();
    thread.id = '123e4567-e89b-42d3-8456-426614174000';
    thread.title = 'Test Thread';
    thread.status = ThreadStatus.ACTIVE;
    thread.priority = ThreadPriority.NORMAL;
    thread.tags = [];
    thread.messageCount = 0;
    thread.unreadCount = 0;
    thread.createdAt = new Date('2024-01-01T12:00:00Z');
    thread.updatedAt = new Date('2024-01-01T12:00:00Z');
    return Object.assign(thread, overrides);
  };

  const createMockCategory = (overrides: Partial<ThreadCategory> = {}): ThreadCategory => {
    const category = new ThreadCategory();
    category.id = '456e7890-e89b-42d3-8456-426614174000';
    category.name = 'Test Category';
    category.isActive = true;
    category.isSystem = false;
    category.threadCount = 0;
    category.createdAt = new Date('2024-01-01T12:00:00Z');
    category.updatedAt = new Date('2024-01-01T12:00:00Z');
    return Object.assign(category, overrides);
  };

  const createMockQueryBuilder = (): jest.Mocked<SelectQueryBuilder<ConversationThread>> => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn(),
      getMany: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    } as any;

    // Configure clone to return a new instance
    queryBuilder.clone.mockImplementation(() => createMockQueryBuilder());

    return queryBuilder;
  };

  beforeEach(async () => {
    const mockThreadRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
    };

    const mockMessageRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockCategoryRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockLoggerService = {
      logInfo: jest.fn(),
      logError: jest.fn(),
      logWarn: jest.fn(),
      logDebug: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    // Configure the mocked constructor to return our mock instance
    (StructuredLoggerService as jest.MockedClass<typeof StructuredLoggerService>).mockImplementation(() => mockLoggerService as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsService,
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: mockThreadRepository,
        },
        {
          provide: getRepositoryToken(ThreadMessage),
          useValue: mockMessageRepository,
        },
        {
          provide: getRepositoryToken(ThreadCategory),
          useValue: mockCategoryRepository,
        },
        {
          provide: StructuredLoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    threadRepository = module.get(getRepositoryToken(ConversationThread));
    _messageRepository = module.get(getRepositoryToken(ThreadMessage));
    categoryRepository = module.get(getRepositoryToken(ThreadCategory));
    loggerService = mockLoggerService as unknown as jest.Mocked<StructuredLoggerService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createThread', () => {
    const createThreadDto: CreateThreadDto = {
      title: 'Test Thread',
      summary: 'Test summary',
      priority: ThreadPriority.HIGH,
      tags: ['test', 'unit'],
    };

    it('should create a thread successfully', async () => {
      const mockThread = createMockThread(createThreadDto);
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      const result = await service.createThread(createThreadDto);

      expect(threadRepository.create).toHaveBeenCalledWith({
        ...createThreadDto,
        priority: ThreadPriority.HIGH,
        tags: ['test', 'unit'],
        status: ThreadStatus.ACTIVE,
      });
      expect(threadRepository.save).toHaveBeenCalledWith(mockThread);
      expect(result).toEqual(
        expect.objectContaining({
          id: mockThread.id,
          title: mockThread.title,
          status: mockThread.status,
          priority: mockThread.priority,
        }),
      );
    });

    it('should validate category if provided', async () => {
      const mockCategory = createMockCategory();
      const dtoWithCategory = { ...createThreadDto, categoryId: mockCategory.id };
      const mockThread = createMockThread({ ...dtoWithCategory, categoryId: mockCategory.id });

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      const result = await service.createThread(dtoWithCategory);

      expect(categoryRepository.findOne).toHaveBeenCalledWith({ where: { id: mockCategory.id } });
      expect(result.categoryId).toBe(mockCategory.id);
    });

    it('should throw BadRequestException for invalid category', async () => {
      const dtoWithCategory = { ...createThreadDto, categoryId: 'invalid-category-id' };

      categoryRepository.findOne.mockResolvedValue(null);

      await expect(service.createThread(dtoWithCategory)).rejects.toThrow(BadRequestException);
      expect(categoryRepository.findOne).toHaveBeenCalledWith({ where: { id: 'invalid-category-id' } });
    });

    it('should throw BadRequestException for inactive category', async () => {
      const mockCategory = createMockCategory({ isActive: false });
      const dtoWithCategory = { ...createThreadDto, categoryId: mockCategory.id };

      categoryRepository.findOne.mockResolvedValue(mockCategory);

      await expect(service.createThread(dtoWithCategory)).rejects.toThrow(BadRequestException);
    });

    it('should increment category count when thread is created', async () => {
      const mockCategory = createMockCategory();
      const dtoWithCategory = { ...createThreadDto, categoryId: mockCategory.id };
      const mockThread = createMockThread({ ...dtoWithCategory, categoryId: mockCategory.id });

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      await service.createThread(dtoWithCategory);

      expect(categoryRepository.increment).toHaveBeenCalledWith({ id: mockCategory.id }, 'threadCount', 1);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      threadRepository.create.mockReturnValue(createMockThread(createThreadDto));
      threadRepository.save.mockRejectedValue(error);

      await expect(service.createThread(createThreadDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to create thread',
        expect.objectContaining({
          title: createThreadDto.title,
          error: error.message,
        }),
      );
    });
  });

  describe('autoCreateThread', () => {
    const autoCreateDto: AutoCreateThreadDto = {
      initialContent: 'Hello, can you help me with TypeScript?',
      tags: ['question', 'typescript'],
    };

    it('should create thread from initial content', async () => {
      const mockCategory = createMockCategory({ name: 'General', isSystem: true });
      const mockThread = createMockThread({
        title: 'Hello, can you help me with TypeScript?',
        categoryId: mockCategory.id,
        tags: autoCreateDto.tags,
      });

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      const result = await service.autoCreateThread(autoCreateDto);

      expect(result.title).toBe('Hello, can you help me with TypeScript?');
      expect(result.tags).toEqual(autoCreateDto.tags);
    });

    it('should return existing thread if valid UUID provided and thread exists', async () => {
      const existingThreadId = '789e1234-e89b-42d3-8456-426614174000';
      const mockExistingThread = createMockThread({ id: existingThreadId });

      jest.spyOn(service, 'findThreadById').mockResolvedValue({
        id: mockExistingThread.id,
        title: mockExistingThread.title,
        status: mockExistingThread.status,
        priority: mockExistingThread.priority,
        tags: mockExistingThread.tags,
        messageCount: mockExistingThread.messageCount,
        unreadCount: mockExistingThread.unreadCount,
        createdAt: mockExistingThread.createdAt,
        updatedAt: mockExistingThread.updatedAt,
      });

      const result = await service.autoCreateThread(autoCreateDto, existingThreadId);

      expect(result.id).toBe(existingThreadId);
      expect(service.findThreadById).toHaveBeenCalledWith(existingThreadId);
    });

    it('should generate title from content', async () => {
      const longContent = 'This is a very long question about TypeScript that should be truncated properly for the title generation.';
      const dtoWithLongContent = { ...autoCreateDto, initialContent: longContent };

      const mockCategory = createMockCategory({ name: 'General', isSystem: true });
      const mockThread = createMockThread({
        title: 'This is a very long question about TypeScript...',
      });

      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      const result = await service.autoCreateThread(dtoWithLongContent);

      expect(result.title.length).toBeLessThanOrEqual(50);
      expect(result.title).toContain('...');
    });

    it('should create default category if none found', async () => {
      const mockDefaultCategory = createMockCategory({ name: 'General', isSystem: true });

      // First call returns null (no existing), second call returns created category
      categoryRepository.findOne.mockResolvedValueOnce(null);
      categoryRepository.create.mockReturnValue(mockDefaultCategory);
      categoryRepository.save.mockResolvedValue(mockDefaultCategory);
      categoryRepository.findOne.mockResolvedValueOnce(mockDefaultCategory);

      const mockThread = createMockThread({
        title: autoCreateDto.initialContent,
        categoryId: mockDefaultCategory.id,
      });

      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      const result = await service.autoCreateThread(autoCreateDto);
      expect(result).toBeDefined();

      expect(categoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'General',
          isSystem: true,
        }),
      );
    });

    it('should use existing thread ID if provided and valid UUID', async () => {
      const existingThreadId = '789e1234-e89b-42d3-8456-426614174000';
      const mockCategory = createMockCategory();

      jest.spyOn(service, 'findThreadById').mockResolvedValue(null);
      categoryRepository.findOne.mockResolvedValue(mockCategory);

      const mockThread = createMockThread({ id: existingThreadId });
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);
      categoryRepository.increment.mockResolvedValue({} as any);

      const result = await service.autoCreateThread(autoCreateDto, existingThreadId);

      expect(threadRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Hello, can you help me with TypeScript?',
          categoryId: expect.any(String),
          tags: ['question', 'typescript'],
          metadata: {
            source: 'api',
            autoGenerated: true,
          },
          id: existingThreadId,
          status: 'active',
          priority: 'normal',
        }),
      );
      expect(result.id).toBe(existingThreadId);
    });
  });

  describe('findThreadById', () => {
    it('should return thread when found', async () => {
      const mockThread = createMockThread();
      threadRepository.findOne.mockResolvedValue(mockThread);

      const result = await service.findThreadById(mockThread.id);

      expect(threadRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockThread.id },
        relations: [],
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: mockThread.id,
          title: mockThread.title,
          status: mockThread.status,
          priority: mockThread.priority,
          tags: mockThread.tags,
          messageCount: mockThread.messageCount,
          unreadCount: mockThread.unreadCount,
          createdAt: mockThread.createdAt,
          updatedAt: mockThread.updatedAt,
        }),
      );
    });

    it('should return null when thread not found', async () => {
      threadRepository.findOne.mockResolvedValue(null);

      const result = await service.findThreadById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null for invalid UUID format', async () => {
      const result = await service.findThreadById('invalid-uuid');

      expect(result).toBeNull();
      expect(threadRepository.findOne).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const validId = '123e4567-e89b-42d3-8456-426614174000';
      const error = new Error('Database connection error');
      threadRepository.findOne.mockRejectedValue(error);

      // Spy on the service's logger instance
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      const result = await service.findThreadById(validId);

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to find thread',
        expect.objectContaining({
          threadId: validId,
          error: error.message,
        }),
      );
    });
  });

  describe('updateThread', () => {
    const threadId = '123e4567-e89b-42d3-8456-426614174000';
    const updateDto: UpdateThreadDto = {
      title: 'Updated Title',
      summary: 'Updated summary',
      status: ThreadStatus.ARCHIVED,
    };

    it('should update thread successfully', async () => {
      const mockThread = createMockThread();
      const updatedThread = createMockThread({ ...updateDto });

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadRepository.save.mockResolvedValue(updatedThread);

      const result = await service.updateThread(threadId, updateDto);

      expect(threadRepository.findOne).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(threadRepository.save).toHaveBeenCalledWith(expect.objectContaining(updateDto));
      expect(result).toEqual(
        expect.objectContaining({
          title: updateDto.title,
          summary: updateDto.summary,
          status: updateDto.status,
        }),
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      threadRepository.findOne.mockResolvedValue(null);

      await expect(service.updateThread(threadId, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should validate category when updating categoryId', async () => {
      const mockCategory = createMockCategory();
      const mockThread = createMockThread();
      const updateWithCategory = { ...updateDto, categoryId: mockCategory.id };

      threadRepository.findOne.mockResolvedValue(mockThread);
      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.save.mockResolvedValue(createMockThread(updateWithCategory));

      await service.updateThread(threadId, updateWithCategory);

      expect(categoryRepository.findOne).toHaveBeenCalledWith({ where: { id: mockCategory.id } });
    });

    it('should handle category count changes', async () => {
      const oldCategoryId = '111e1111-e89b-42d3-8456-426614174000';
      const newCategoryId = '222e2222-e89b-42d3-8456-426614174000';

      const mockThread = createMockThread({ categoryId: oldCategoryId });
      const mockCategory = createMockCategory({ id: newCategoryId });

      threadRepository.findOne.mockResolvedValue(mockThread);
      categoryRepository.findOne.mockResolvedValue(mockCategory);
      threadRepository.save.mockResolvedValue(createMockThread({ categoryId: newCategoryId }));

      await service.updateThread(threadId, { categoryId: newCategoryId });

      expect(categoryRepository.decrement).toHaveBeenCalledWith({ id: oldCategoryId }, 'threadCount', 1);
      expect(categoryRepository.increment).toHaveBeenCalledWith({ id: newCategoryId }, 'threadCount', 1);
    });
  });

  describe('deleteThread', () => {
    const threadId = '123e4567-e89b-42d3-8456-426614174000';

    it('should perform soft delete by default', async () => {
      const mockThread = createMockThread();
      const deletedThread = createMockThread({ status: ThreadStatus.DELETED });

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadRepository.save.mockResolvedValue(deletedThread);

      await service.deleteThread(threadId);

      expect(threadRepository.findOne).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(threadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ThreadStatus.DELETED,
        }),
      );
      expect(threadRepository.remove).not.toHaveBeenCalled();
    });

    it('should perform hard delete when requested', async () => {
      const mockThread = createMockThread();

      threadRepository.findOne.mockResolvedValue(mockThread);

      await service.deleteThread(threadId, true);

      expect(threadRepository.remove).toHaveBeenCalledWith(mockThread);
      expect(threadRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when thread not found', async () => {
      threadRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteThread(threadId)).rejects.toThrow(NotFoundException);
    });

    it('should decrement category count', async () => {
      const mockThread = createMockThread({ categoryId: '456e7890-e89b-42d3-8456-426614174000' });

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      await service.deleteThread(threadId);

      expect(categoryRepository.decrement).toHaveBeenCalledWith({ id: mockThread.categoryId }, 'threadCount', 1);
    });
  });

  describe('queryThreads', () => {
    const queryDto: ThreadQueryDto = {
      page: 1,
      limit: 20,
      status: ThreadStatus.ACTIVE,
      sortBy: 'createdAt' as any,
      sortDirection: 'DESC' as any,
    };

    it('should query threads with pagination', async () => {
      const mockThreads = [createMockThread(), createMockThread({ id: 'thread-2' })];
      const mockQueryBuilder = createMockQueryBuilder();

      mockQueryBuilder.getCount.mockResolvedValue(50);
      mockQueryBuilder.getMany.mockResolvedValue(mockThreads);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.queryThreads(queryDto);

      expect(result.threads).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should apply filters correctly', async () => {
      const queryWithFilters: ThreadQueryDto = {
        ...queryDto,
        priority: ThreadPriority.HIGH,
        categoryId: '456e7890-e89b-42d3-8456-426614174000',
        tags: ['typescript', 'react'],
        search: 'test search',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.queryThreads(queryWithFilters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('thread.status = :status', { status: ThreadStatus.ACTIVE });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('thread.priority = :priority', { priority: ThreadPriority.HIGH });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('thread.categoryId = :categoryId', { categoryId: queryWithFilters.categoryId });
    });

    it('should exclude deleted threads by default', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.queryThreads({ page: 1, limit: 20 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('thread.status != :deletedStatus', { deletedStatus: ThreadStatus.DELETED });
    });

    it('should handle empty results', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.queryThreads(queryDto);

      expect(result.threads).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('searchThreads', () => {
    const searchDto: ThreadSearchDto = {
      query: 'typescript',
      limit: 10,
      includeContent: true,
    };

    it('should search threads by query', async () => {
      const mockThreads = [createMockThread({ title: 'TypeScript Tutorial' })];
      const mockQueryBuilder = createMockQueryBuilder();

      mockQueryBuilder.getMany.mockResolvedValue(mockThreads);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.searchThreads(searchDto);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('TypeScript Tutorial');
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should return empty array for empty query', async () => {
      const result = await service.searchThreads({ query: '' });

      expect(result).toHaveLength(0);
      expect(threadRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should boost recent results by default', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getMany.mockResolvedValue([]);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.searchThreads(searchDto);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('thread.lastActivityAt', 'DESC');
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith('thread.createdAt', 'DESC');
    });
  });

  describe('getThreadStatistics', () => {
    it('should return comprehensive thread statistics', async () => {
      // Create the main query builder
      const mainQB = createMockQueryBuilder();

      // Configure clone to return new instances for status-based counts
      const activeClone = createMockQueryBuilder();
      const archivedClone = createMockQueryBuilder();
      const deletedClone = createMockQueryBuilder();

      let cloneCallCount = 0;
      mainQB.clone.mockImplementation(() => {
        cloneCallCount++;
        switch (cloneCallCount) {
          case 1:
            return activeClone;
          case 2:
            return archivedClone;
          case 3:
            return deletedClone;
          default:
            return createMockQueryBuilder();
        }
      });

      // Configure the main queryBuilder and clones
      mainQB.getCount.mockResolvedValue(100); // total threads
      activeClone.where.mockReturnThis();
      activeClone.getCount.mockResolvedValue(80);
      archivedClone.where.mockReturnThis();
      archivedClone.getCount.mockResolvedValue(15);
      deletedClone.where.mockReturnThis();
      deletedClone.getCount.mockResolvedValue(5);

      // Configure message/unread sum queries - these reuse the main QB
      mainQB.select.mockReturnThis();
      mainQB.getRawOne
        .mockResolvedValueOnce({ sum: '1500' }) // messages sum
        .mockResolvedValueOnce({ sum: '25' }); // unread sum

      // Configure priority stats - the main QB is reused for this after Promise.all
      mainQB.addSelect.mockReturnThis();
      mainQB.groupBy.mockReturnThis();
      mainQB.getRawMany.mockResolvedValue([
        { priority: 'normal', count: '60' },
        { priority: 'high', count: '30' },
        { priority: 'low', count: '10' },
      ]);

      // Configure category stats
      const categoryQB = createMockQueryBuilder();
      categoryQB.leftJoin.mockReturnThis();
      categoryQB.select.mockReturnThis();
      categoryQB.addSelect.mockReturnThis();
      categoryQB.groupBy.mockReturnThis();
      categoryQB.getRawMany.mockResolvedValue([
        { category: 'Work', count: '40' },
        { category: 'Personal', count: '35' },
        { category: 'Learning', count: '25' },
      ]);

      // Configure tags stats
      const tagsQB = createMockQueryBuilder();
      tagsQB.select.mockReturnThis();
      tagsQB.addSelect.mockReturnThis();
      tagsQB.groupBy.mockReturnThis();
      tagsQB.orderBy.mockReturnThis();
      tagsQB.limit.mockReturnThis();
      tagsQB.getRawMany.mockResolvedValue([
        { tag: 'typescript', count: '45' },
        { tag: 'javascript', count: '30' },
        { tag: 'react', count: '25' },
      ]);

      // Configure repository calls in sequence
      threadRepository.createQueryBuilder
        .mockReturnValueOnce(mainQB) // for Promise.all with clone() calls and priority stats
        .mockReturnValueOnce(categoryQB) // category stats
        .mockReturnValueOnce(tagsQB); // tags stats

      const result = await service.getThreadStatistics();

      expect(result).toEqual({
        totalThreads: 100,
        activeThreads: 80,
        archivedThreads: 15,
        deletedThreads: 5,
        totalMessages: 1500,
        totalUnreadMessages: 25,
        byPriority: {
          normal: 60,
          high: 30,
          low: 10,
        },
        byCategory: {
          Work: 40,
          Personal: 35,
          Learning: 25,
        },
        topTags: {
          typescript: 45,
          javascript: 30,
          react: 25,
        },
      });
    });

    it('should return statistics without user filtering', async () => {
      const mockQueryBuilder = createMockQueryBuilder();

      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '0' });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getThreadStatistics();

      expect(result).toBeDefined();
      expect(mockQueryBuilder.where).not.toHaveBeenCalledWith(expect.stringContaining('userId'), expect.any(Object));
    });
  });

  describe('bulkUpdateThreads', () => {
    const bulkUpdateDto: BulkUpdateThreadsDto = {
      threadIds: ['thread-1', 'thread-2', 'thread-3'],
      status: ThreadStatus.ARCHIVED,
      priority: ThreadPriority.LOW,
      addTags: ['bulk-updated'],
      removeTags: ['old-tag'],
    };

    it('should update multiple threads successfully', async () => {
      const mockThreads = [
        createMockThread({ id: 'thread-1', tags: ['old-tag', 'keep-tag'] }),
        createMockThread({ id: 'thread-2', tags: ['old-tag'] }),
        createMockThread({ id: 'thread-3', tags: ['keep-tag'] }),
      ];

      threadRepository.find.mockResolvedValue(mockThreads);
      threadRepository.save.mockResolvedValue(mockThreads as any);

      const result = await service.bulkUpdateThreads(bulkUpdateDto);

      expect(threadRepository.find).toHaveBeenCalledWith({
        where: { id: In(bulkUpdateDto.threadIds) },
      });
      expect(result).toHaveLength(3);

      // Verify all threads were updated
      const savedThreads = threadRepository.save.mock.calls[0][0] as ConversationThread[];
      savedThreads.forEach((thread: ConversationThread) => {
        expect(thread.status).toBe(ThreadStatus.ARCHIVED);
        expect(thread.priority).toBe(ThreadPriority.LOW);
        expect(thread.tags).toContain('bulk-updated');
        expect(thread.tags).not.toContain('old-tag');
      });
    });

    it('should throw BadRequestException when not all threads found', async () => {
      const mockThreads = [createMockThread({ id: 'thread-1' })]; // Only 1 thread found

      threadRepository.find.mockResolvedValue(mockThreads);

      await expect(service.bulkUpdateThreads(bulkUpdateDto)).rejects.toThrow(BadRequestException);
    });

    it('should handle tag operations correctly', async () => {
      const thread = createMockThread({ tags: ['existing', 'old-tag', 'duplicate'] });
      const updateDto: BulkUpdateThreadsDto = {
        threadIds: [thread.id],
        addTags: ['new-tag', 'duplicate'], // duplicate should be handled
        removeTags: ['old-tag'],
      };

      threadRepository.find.mockResolvedValue([thread]);
      threadRepository.save.mockResolvedValue([thread] as any);

      await service.bulkUpdateThreads(updateDto);

      const savedThreads = threadRepository.save.mock.calls[0][0] as ConversationThread[];
      const savedThread = savedThreads[0];
      expect(savedThread.tags).toEqual(['existing', 'duplicate', 'new-tag']);
    });
  });

  describe('updateThreadActivity', () => {
    const threadId = '123e4567-e89b-42d3-8456-426614174000';

    it('should update thread activity successfully', async () => {
      const mockThread = createMockThread();
      const updateLastActivitySpy = jest.spyOn(mockThread, 'updateLastActivity');
      const incrementMessageCountSpy = jest.spyOn(mockThread, 'incrementMessageCount');

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      await service.updateThreadActivity(threadId, 'Test message', MessageSender.HUMAN);

      expect(threadRepository.findOne).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(updateLastActivitySpy).toHaveBeenCalledWith('Test message', 'human');
      expect(incrementMessageCountSpy).toHaveBeenCalled();
      expect(threadRepository.save).toHaveBeenCalledWith(mockThread);
    });

    it('should handle non-existent thread gracefully', async () => {
      threadRepository.findOne.mockResolvedValue(null);

      await expect(service.updateThreadActivity(threadId, 'Test message')).resolves.not.toThrow();
      expect(threadRepository.save).not.toHaveBeenCalled();
    });

    it('should map message senders correctly', async () => {
      const mockThread = createMockThread();
      const updateLastActivitySpy = jest.spyOn(mockThread, 'updateLastActivity');

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      // Test different sender types
      await service.updateThreadActivity(threadId, 'Human message', MessageSender.HUMAN);
      expect(updateLastActivitySpy).toHaveBeenLastCalledWith('Human message', 'human');

      await service.updateThreadActivity(threadId, 'Assistant message', MessageSender.ASSISTANT);
      expect(updateLastActivitySpy).toHaveBeenLastCalledWith('Assistant message', 'assistant');

      await service.updateThreadActivity(threadId, 'System message', MessageSender.SYSTEM);
      expect(updateLastActivitySpy).toHaveBeenLastCalledWith('System message', 'system');
    });

    it('should handle errors gracefully without throwing', async () => {
      const error = new Error('Database error');
      threadRepository.findOne.mockRejectedValue(error);

      // Spy on the service's logger instance
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      await expect(service.updateThreadActivity(threadId, 'Test message')).resolves.not.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to update thread activity',
        expect.objectContaining({
          threadId,
          error: error.message,
        }),
      );
    });
  });

  describe('Helper Methods', () => {
    describe('isUUID', () => {
      it('should validate correct UUIDs', async () => {
        // Use proper Version 4 UUIDs that match the regex pattern
        const validUUIDs = [
          '123e4567-e89b-42d3-8456-426614174000', // Version 4 UUID
          '550e8400-e29b-41d4-a716-446655440000', // Version 4 UUID (already correct)
          '6ba7b810-9dad-41d1-80b4-00c04fd430c8', // Version 4 UUID (already correct)
        ];

        threadRepository.findOne.mockResolvedValue(null);

        for (let i = 0; i < validUUIDs.length; i++) {
          const uuid = validUUIDs[i];
          // Test via findThreadById which uses isUUID
          await service.findThreadById(uuid);
          expect(threadRepository.findOne).toHaveBeenNthCalledWith(i + 1, {
            where: { id: uuid },
            relations: [],
          });
        }

        // Verify total calls
        expect(threadRepository.findOne).toHaveBeenCalledTimes(validUUIDs.length);
      });

      it('should reject invalid UUIDs', () => {
        const invalidUUIDs = [
          'not-a-uuid',
          '123',
          'invalid-format',
          '123e4567-e89b-12d3-a456-42661417400g', // invalid character
        ];

        invalidUUIDs.forEach(async (uuid) => {
          const result = await service.findThreadById(uuid);
          expect(result).toBeNull();
          expect(threadRepository.findOne).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors in createThread', async () => {
      const error = new Error('Repository error');
      threadRepository.create.mockReturnValue(createMockThread());
      threadRepository.save.mockRejectedValue(error);

      // Spy on the service's logger instance
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      await expect(service.createThread({ title: 'Test' })).rejects.toThrow(error);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle repository errors in queryThreads', async () => {
      const error = new Error('Query error');
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getCount.mockRejectedValue(error);
      threadRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Spy on the service's logger instance
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      await expect(service.queryThreads({ page: 1, limit: 20 })).rejects.toThrow(error);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle category count update failures gracefully', async () => {
      const mockCategory = createMockCategory();
      const categoryId = mockCategory.id;

      // Mock category exists but increment fails
      categoryRepository.findOne.mockResolvedValue(mockCategory);
      categoryRepository.increment.mockRejectedValue(new Error('Category update failed'));

      const mockThread = createMockThread({ categoryId });
      threadRepository.create.mockReturnValue(mockThread);
      threadRepository.save.mockResolvedValue(mockThread);

      // Spy on the service's logger instance
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      // This should complete successfully despite increment failure
      await expect(service.createThread({ title: 'Test', categoryId })).resolves.toBeDefined();

      expect(loggerWarnSpy).toHaveBeenCalled();
    });
  });
});
