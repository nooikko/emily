import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StructuredLoggerService } from '../../observability/services/structured-logger.service';
import type { AutoCreateThreadDto, CreateThreadDto } from '../dto/create-thread.dto';
import type { ThreadQueryDto, ThreadSearchDto } from '../dto/thread-query.dto';
import type { ThreadListResponseDto, ThreadResponseDto, ThreadStatsResponseDto } from '../dto/thread-response.dto';
import type { BulkUpdateThreadsDto, UpdateThreadDto } from '../dto/update-thread.dto';
import { ThreadPriority, ThreadStatus } from '../entities/conversation-thread.entity';
import { ThreadsService } from '../services/threads.service';
import { ThreadsController } from '../threads.controller';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let threadsService: jest.Mocked<ThreadsService>;
  let loggerService: jest.Mocked<StructuredLoggerService>;

  // Test data builders
  const createMockThreadResponse = (overrides: Partial<ThreadResponseDto> = {}): ThreadResponseDto => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Thread',
    summary: 'Test summary',
    status: ThreadStatus.ACTIVE,
    priority: ThreadPriority.NORMAL,
    tags: ['test'],
    messageCount: 0,
    unreadCount: 0,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
    ...overrides,
  });

  const createMockThreadListResponse = (threads: ThreadResponseDto[] = []): ThreadListResponseDto => ({
    threads,
    total: threads.length,
    page: 1,
    limit: 20,
    totalPages: Math.ceil(threads.length / 20),
    hasMore: false,
  });

  const createMockStatsResponse = (): ThreadStatsResponseDto => ({
    totalThreads: 100,
    activeThreads: 80,
    archivedThreads: 15,
    deletedThreads: 5,
    totalMessages: 1500,
    totalUnreadMessages: 25,
    byPriority: {
      low: 10,
      normal: 60,
      high: 25,
      urgent: 5,
    },
    byCategory: {
      General: 30,
      Work: 40,
      Learning: 30,
    },
    topTags: {
      typescript: 45,
      javascript: 30,
      react: 25,
    },
  });

  beforeEach(async () => {
    const mockThreadsService = {
      createThread: jest.fn(),
      autoCreateThread: jest.fn(),
      findThreadById: jest.fn(),
      updateThread: jest.fn(),
      deleteThread: jest.fn(),
      queryThreads: jest.fn(),
      searchThreads: jest.fn(),
      getThreadStatistics: jest.fn(),
      bulkUpdateThreads: jest.fn(),
    };

    const mockLoggerService = {
      logInfo: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [
        {
          provide: ThreadsService,
          useValue: mockThreadsService,
        },
        {
          provide: StructuredLoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    controller = module.get<ThreadsController>(ThreadsController);
    threadsService = module.get(ThreadsService);
    loggerService = module.get(StructuredLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /threads', () => {
    const createThreadDto: CreateThreadDto = {
      title: 'New Thread',
      summary: 'Thread summary',
      priority: ThreadPriority.HIGH,
      tags: ['new', 'test'],
    };

    it('should create a thread successfully', async () => {
      const mockResponse = createMockThreadResponse(createThreadDto);
      threadsService.createThread.mockResolvedValue(mockResponse);

      const result = await controller.createThread(createThreadDto);

      expect(threadsService.createThread).toHaveBeenCalledWith(createThreadDto);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Creating thread: ${createThreadDto.title}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread created successfully: ${mockResponse.id}`);
      expect(result).toEqual(mockResponse);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      threadsService.createThread.mockRejectedValue(error);

      await expect(controller.createThread(createThreadDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to create thread',
        expect.objectContaining({
          title: createThreadDto.title,
          error: error.message,
        }),
      );
    });

    it('should handle validation errors', async () => {
      const invalidDto = { title: '' } as CreateThreadDto; // Invalid - empty title
      const validationError = new Error('Validation failed');

      threadsService.createThread.mockRejectedValue(validationError);

      await expect(controller.createThread(invalidDto)).rejects.toThrow(validationError);
    });
  });

  describe('POST /threads/auto-create', () => {
    const autoCreateDto: AutoCreateThreadDto = {
      initialContent: 'Hello, can you help me?',
      tags: ['question'],
    };

    it('should auto-create a thread successfully', async () => {
      const mockResponse = createMockThreadResponse({
        title: 'Hello, can you help me?',
      });
      threadsService.autoCreateThread.mockResolvedValue(mockResponse);

      const result = await controller.autoCreateThread(autoCreateDto);

      expect(threadsService.autoCreateThread).toHaveBeenCalledWith(autoCreateDto, undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should auto-create with existing thread ID', async () => {
      const existingThreadId = '456e7890-e89b-12d3-a456-426614174000';
      const mockResponse = createMockThreadResponse({ id: existingThreadId });

      threadsService.autoCreateThread.mockResolvedValue(mockResponse);

      const result = await controller.autoCreateThread(autoCreateDto, existingThreadId);

      expect(threadsService.autoCreateThread).toHaveBeenCalledWith(autoCreateDto, existingThreadId);
      expect(result.id).toBe(existingThreadId);
    });

    it('should handle auto-creation errors', async () => {
      const error = new Error('Auto-creation failed');
      threadsService.autoCreateThread.mockRejectedValue(error);

      await expect(controller.autoCreateThread(autoCreateDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to auto-create thread',
        expect.objectContaining({
          existingThreadId: undefined,
          error: error.message,
        }),
      );
    });
  });

  describe('GET /threads', () => {
    const queryDto: ThreadQueryDto = {
      page: 1,
      limit: 10,
      status: ThreadStatus.ACTIVE,
      priority: ThreadPriority.HIGH,
    };

    it('should query threads successfully', async () => {
      const mockThreads = [createMockThreadResponse(), createMockThreadResponse({ id: 'thread-2', title: 'Another Thread' })];
      const mockResponse = createMockThreadListResponse(mockThreads);

      threadsService.queryThreads.mockResolvedValue(mockResponse);

      const result = await controller.queryThreads(queryDto);

      expect(threadsService.queryThreads).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(mockResponse);
      expect(result.threads).toHaveLength(2);
    });

    it('should handle empty results', async () => {
      const mockResponse = createMockThreadListResponse([]);
      threadsService.queryThreads.mockResolvedValue(mockResponse);

      const result = await controller.queryThreads(queryDto);

      expect(result.threads).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle query errors', async () => {
      const error = new Error('Query failed');
      threadsService.queryThreads.mockRejectedValue(error);

      await expect(controller.queryThreads(queryDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to query threads',
        expect.objectContaining({
          error: error.message,
        }),
      );
    });

    it('should log successful queries', async () => {
      const mockResponse = createMockThreadListResponse([createMockThreadResponse()]);
      threadsService.queryThreads.mockResolvedValue(mockResponse);

      await controller.queryThreads(queryDto);

      expect(loggerService.logInfo).toHaveBeenCalledWith(`Querying threads - Page ${queryDto.page || 1}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Threads queried successfully - ${mockResponse.threads.length} results`);
    });
  });

  describe('GET /threads/search', () => {
    const searchDto: ThreadSearchDto = {
      query: 'typescript',
      limit: 10,
      includeContent: true,
    };

    it('should search threads successfully', async () => {
      const mockThreads = [createMockThreadResponse({ title: 'TypeScript Tutorial' }), createMockThreadResponse({ title: 'Advanced TypeScript' })];
      threadsService.searchThreads.mockResolvedValue(mockThreads);

      const result = await controller.searchThreads(searchDto);

      expect(threadsService.searchThreads).toHaveBeenCalledWith(searchDto);
      expect(result).toEqual(mockThreads);
      expect(result).toHaveLength(2);
    });

    it('should handle empty search results', async () => {
      threadsService.searchThreads.mockResolvedValue([]);

      const result = await controller.searchThreads(searchDto);

      expect(result).toHaveLength(0);
    });

    it('should handle search errors', async () => {
      const error = new Error('Search failed');
      threadsService.searchThreads.mockRejectedValue(error);

      await expect(controller.searchThreads(searchDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to search threads',
        expect.objectContaining({
          query: searchDto.query,
          error: error.message,
        }),
      );
    });

    it('should log search operations', async () => {
      const mockThreads = [createMockThreadResponse()];
      threadsService.searchThreads.mockResolvedValue(mockThreads);

      await controller.searchThreads(searchDto);

      expect(loggerService.logInfo).toHaveBeenCalledWith(`Searching threads: ${searchDto.query}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread search completed - ${mockThreads.length} results`);
    });
  });

  describe('GET /threads/stats', () => {
    it('should get thread statistics successfully', async () => {
      const mockStats = createMockStatsResponse();
      threadsService.getThreadStatistics.mockResolvedValue(mockStats);

      const result = await controller.getThreadStatistics();

      expect(threadsService.getThreadStatistics).toHaveBeenCalledWith();
      expect(result).toEqual(mockStats);
    });

    it('should handle statistics errors', async () => {
      const error = new Error('Stats calculation failed');
      threadsService.getThreadStatistics.mockRejectedValue(error);

      await expect(controller.getThreadStatistics()).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get thread statistics',
        expect.objectContaining({
          error: error.message,
        }),
      );
    });

    it('should log statistics operations', async () => {
      const mockStats = createMockStatsResponse();
      threadsService.getThreadStatistics.mockResolvedValue(mockStats);

      await controller.getThreadStatistics();

      expect(loggerService.logInfo).toHaveBeenCalledWith('Getting thread statistics');
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread statistics retrieved - ${mockStats.totalThreads} total threads`);
    });
  });

  describe('GET /threads/:id', () => {
    const threadId = '123e4567-e89b-12d3-a456-426614174000';

    it('should get thread by ID successfully', async () => {
      const mockThread = createMockThreadResponse({ id: threadId });
      threadsService.findThreadById.mockResolvedValue(mockThread);

      const result = await controller.getThreadById(threadId);

      expect(threadsService.findThreadById).toHaveBeenCalledWith(threadId);
      expect(result).toEqual(mockThread);
    });

    it('should throw NotFoundException when thread not found', async () => {
      threadsService.findThreadById.mockResolvedValue(null);

      await expect(controller.getThreadById(threadId)).rejects.toThrow(NotFoundException);
      expect(threadsService.findThreadById).toHaveBeenCalledWith(threadId);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      threadsService.findThreadById.mockRejectedValue(error);

      await expect(controller.getThreadById(threadId)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get thread',
        expect.objectContaining({
          threadId,
          error: error.message,
        }),
      );
    });

    it('should log successful retrievals', async () => {
      const mockThread = createMockThreadResponse({ id: threadId });
      threadsService.findThreadById.mockResolvedValue(mockThread);

      await controller.getThreadById(threadId);

      expect(loggerService.logInfo).toHaveBeenCalledWith(`Getting thread by ID: ${threadId}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread retrieved successfully: ${threadId}`);
    });
  });

  describe('PUT /threads/:id', () => {
    const threadId = '123e4567-e89b-12d3-a456-426614174000';
    const updateDto: UpdateThreadDto = {
      title: 'Updated Title',
      summary: 'Updated summary',
      status: ThreadStatus.ARCHIVED,
    };

    it('should update thread successfully', async () => {
      const mockUpdatedThread = createMockThreadResponse({
        id: threadId,
        ...updateDto,
      });
      threadsService.updateThread.mockResolvedValue(mockUpdatedThread);

      const result = await controller.updateThread(threadId, updateDto);

      expect(threadsService.updateThread).toHaveBeenCalledWith(threadId, updateDto);
      expect(result).toEqual(mockUpdatedThread);
    });

    it('should handle update errors', async () => {
      const error = new NotFoundException('Thread not found');
      threadsService.updateThread.mockRejectedValue(error);

      await expect(controller.updateThread(threadId, updateDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to update thread',
        expect.objectContaining({
          threadId,
          error: error.message,
        }),
      );
    });

    it('should log update operations', async () => {
      const mockUpdatedThread = createMockThreadResponse({ id: threadId });
      threadsService.updateThread.mockResolvedValue(mockUpdatedThread);

      await controller.updateThread(threadId, updateDto);

      expect(loggerService.logInfo).toHaveBeenCalledWith(`Updating thread: ${threadId}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread updated successfully: ${threadId}`);
    });
  });

  describe('DELETE /threads/:id', () => {
    const threadId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete thread successfully (soft delete)', async () => {
      threadsService.deleteThread.mockResolvedValue();

      await controller.deleteThread(threadId);

      expect(threadsService.deleteThread).toHaveBeenCalledWith(threadId, undefined);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Deleting thread: ${threadId}`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Thread deleted successfully: ${threadId}`);
    });

    it('should delete thread successfully (hard delete)', async () => {
      const hardDelete = true;
      threadsService.deleteThread.mockResolvedValue();

      await controller.deleteThread(threadId, hardDelete);

      expect(threadsService.deleteThread).toHaveBeenCalledWith(threadId, hardDelete);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Deleting thread: ${threadId} (hard delete)`);
    });

    it('should handle delete errors', async () => {
      const error = new NotFoundException('Thread not found');
      threadsService.deleteThread.mockRejectedValue(error);

      await expect(controller.deleteThread(threadId)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to delete thread',
        expect.objectContaining({
          threadId,
          hardDelete: undefined,
          error: error.message,
        }),
      );
    });

    it('should handle boolean query parameters correctly', async () => {
      threadsService.deleteThread.mockResolvedValue();

      // Test with string 'true'
      await controller.deleteThread(threadId, 'true' as any);
      expect(threadsService.deleteThread).toHaveBeenCalledWith(threadId, 'true');

      // Test with boolean true
      await controller.deleteThread(threadId, true);
      expect(threadsService.deleteThread).toHaveBeenCalledWith(threadId, true);

      // Test with boolean false
      await controller.deleteThread(threadId, false);
      expect(threadsService.deleteThread).toHaveBeenCalledWith(threadId, false);
    });
  });

  describe('POST /threads/bulk-update', () => {
    const bulkUpdateDto: BulkUpdateThreadsDto = {
      threadIds: ['thread-1', 'thread-2', 'thread-3'],
      status: ThreadStatus.ARCHIVED,
      priority: ThreadPriority.LOW,
      addTags: ['bulk-updated'],
    };

    it('should bulk update threads successfully', async () => {
      const mockUpdatedThreads = [
        createMockThreadResponse({ id: 'thread-1', status: ThreadStatus.ARCHIVED }),
        createMockThreadResponse({ id: 'thread-2', status: ThreadStatus.ARCHIVED }),
        createMockThreadResponse({ id: 'thread-3', status: ThreadStatus.ARCHIVED }),
      ];
      threadsService.bulkUpdateThreads.mockResolvedValue(mockUpdatedThreads);

      const result = await controller.bulkUpdateThreads(bulkUpdateDto);

      expect(threadsService.bulkUpdateThreads).toHaveBeenCalledWith(bulkUpdateDto);
      expect(result).toEqual(mockUpdatedThreads);
      expect(result).toHaveLength(3);
    });

    it('should handle bulk update errors', async () => {
      const error = new Error('Bulk update failed');
      threadsService.bulkUpdateThreads.mockRejectedValue(error);

      await expect(controller.bulkUpdateThreads(bulkUpdateDto)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to bulk update threads',
        expect.objectContaining({
          threadIds: bulkUpdateDto.threadIds,
          error: error.message,
        }),
      );
    });

    it('should log bulk operations', async () => {
      const mockUpdatedThreads = [createMockThreadResponse()];
      threadsService.bulkUpdateThreads.mockResolvedValue(mockUpdatedThreads);

      await controller.bulkUpdateThreads(bulkUpdateDto);

      expect(loggerService.logInfo).toHaveBeenCalledWith(`Bulk updating ${bulkUpdateDto.threadIds.length} threads`);
      expect(loggerService.logInfo).toHaveBeenCalledWith(`Bulk update completed successfully - ${mockUpdatedThreads.length} threads updated`);
    });

    it('should handle empty thread list', async () => {
      const emptyBulkUpdate = { ...bulkUpdateDto, threadIds: [] };
      threadsService.bulkUpdateThreads.mockResolvedValue([]);

      const result = await controller.bulkUpdateThreads(emptyBulkUpdate);

      expect(result).toHaveLength(0);
      expect(loggerService.logInfo).toHaveBeenCalledWith('Bulk updating 0 threads');
    });
  });

  describe('Error Handling Patterns', () => {
    it('should handle service layer validation errors', async () => {
      const validationError = new Error('Validation failed: Title is required');
      threadsService.createThread.mockRejectedValue(validationError);

      await expect(controller.createThread({ title: '' } as CreateThreadDto)).rejects.toThrow(validationError);
    });

    it('should handle service layer not found errors', async () => {
      const notFoundError = new NotFoundException('Thread not found');
      threadsService.findThreadById.mockRejectedValue(notFoundError);

      await expect(controller.getThreadById('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should handle unexpected service errors', async () => {
      const unexpectedError = new Error('Unexpected database connection error');
      threadsService.queryThreads.mockRejectedValue(unexpectedError);

      await expect(controller.queryThreads({ page: 1, limit: 20 })).rejects.toThrow(unexpectedError);
    });

    it('should pass through HTTP status-specific errors', async () => {
      const forbiddenError = new Error('Forbidden') as any;
      forbiddenError.status = 403;
      threadsService.updateThread.mockRejectedValue(forbiddenError);

      await expect(controller.updateThread('thread-id', { title: 'New Title' })).rejects.toThrow(forbiddenError);
    });
  });

  describe('Logging Consistency', () => {
    it('should log all operations consistently', async () => {
      const threadId = '123e4567-e89b-12d3-a456-426614174000';
      const mockThread = createMockThreadResponse({ id: threadId });

      // Test each endpoint logs appropriately
      threadsService.createThread.mockResolvedValue(mockThread);
      threadsService.findThreadById.mockResolvedValue(mockThread);
      threadsService.updateThread.mockResolvedValue(mockThread);
      threadsService.deleteThread.mockResolvedValue();

      await controller.createThread({ title: 'Test' });
      await controller.getThreadById(threadId);
      await controller.updateThread(threadId, { title: 'Updated' });
      await controller.deleteThread(threadId);

      // Verify consistent logging pattern: operation start and completion
      expect(loggerService.logInfo).toHaveBeenCalledTimes(8); // 2 logs per operation × 4 operations

      // Check for operation start logs
      expect(loggerService.logInfo).toHaveBeenCalledWith(expect.stringContaining('Creating thread'));
      expect(loggerService.logInfo).toHaveBeenCalledWith(expect.stringContaining('Getting thread'));
      expect(loggerService.logInfo).toHaveBeenCalledWith(expect.stringContaining('Updating thread'));
      expect(loggerService.logInfo).toHaveBeenCalledWith(expect.stringContaining('Deleting thread'));

      // Check for completion logs
      expect(loggerService.logInfo).toHaveBeenCalledWith(expect.stringContaining('successfully'));
    });

    it('should log errors with consistent format', async () => {
      const error = new Error('Test error');

      threadsService.createThread.mockRejectedValue(error);
      threadsService.findThreadById.mockRejectedValue(error);
      threadsService.updateThread.mockRejectedValue(error);

      // Test error logging for different operations
      await expect(controller.createThread({ title: 'Test' })).rejects.toThrow();
      await expect(controller.getThreadById('thread-id')).rejects.toThrow();
      await expect(controller.updateThread('thread-id', { title: 'Updated' })).rejects.toThrow();

      // Verify all error logs include the error message
      expect(loggerService.error).toHaveBeenCalledTimes(3);
      loggerService.error.mock.calls.forEach((call) => {
        expect(call[1]).toEqual(
          expect.objectContaining({
            error: error.message,
          }),
        );
      });
    });
  });

  describe('Input Validation Integration', () => {
    it('should handle UUID validation in path parameters', async () => {
      // The ParseUUIDPipe would handle this in the real app
      // We're testing that the controller calls the service with the provided ID
      const invalidId = 'not-a-uuid';
      threadsService.findThreadById.mockResolvedValue(null);

      await expect(controller.getThreadById(invalidId)).rejects.toThrow(NotFoundException);
    });

    it('should handle query parameter transformations', async () => {
      const queryDto: ThreadQueryDto = {
        page: 1,
        limit: 20,
        tags: ['tag1', 'tag2'] as any, // Would be transformed from comma-separated string
        hasUnread: true,
      };

      const mockResponse = createMockThreadListResponse([]);
      threadsService.queryThreads.mockResolvedValue(mockResponse);

      await controller.queryThreads(queryDto);

      expect(threadsService.queryThreads).toHaveBeenCalledWith(queryDto);
    });

    it('should handle boolean parameter variations', async () => {
      threadsService.deleteThread.mockResolvedValue();

      // Test various boolean representations
      await controller.deleteThread('thread-id', true);
      await controller.deleteThread('thread-id', false);
      await controller.deleteThread('thread-id', undefined);

      expect(threadsService.deleteThread).toHaveBeenNthCalledWith(1, 'thread-id', true);
      expect(threadsService.deleteThread).toHaveBeenNthCalledWith(2, 'thread-id', false);
      expect(threadsService.deleteThread).toHaveBeenNthCalledWith(3, 'thread-id', undefined);
    });
  });
});
