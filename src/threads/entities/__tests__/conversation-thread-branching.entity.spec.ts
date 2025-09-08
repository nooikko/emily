import { ConversationThread, ThreadBranchType, ThreadPriority, ThreadStatus } from '../conversation-thread.entity';

describe('ConversationThread - Branching and Merging Methods', () => {
  let thread: ConversationThread;

  beforeEach(() => {
    thread = new ConversationThread();
    thread.id = 'test-thread-id';
    thread.title = 'Test Thread';
    thread.status = ThreadStatus.ACTIVE;
    thread.priority = ThreadPriority.NORMAL;
    thread.branchType = ThreadBranchType.ROOT;
    thread.tags = ['original'];
    thread.messageCount = 5;
    thread.unreadCount = 0;
    thread.isMainBranch = true;
    thread.createdAt = new Date();
    thread.updatedAt = new Date();
  });

  describe('createBranch', () => {
    it('should create a branch with default options', () => {
      const branchData = thread.createBranch('message-123', {});

      expect(branchData).toEqual({
        title: 'Branch of Test Thread',
        parentThreadId: 'test-thread-id',
        branchType: ThreadBranchType.BRANCH,
        branchPointMessageId: 'message-123',
        branchMetadata: {
          branchReason: undefined,
          branchTitle: undefined,
          createdBy: undefined,
          branchingStrategy: 'fork',
          contextPreserved: true,
        },
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        categoryId: thread.categoryId,
        tags: ['original', 'branch'],
        isMainBranch: false,
        metadata: {
          ...thread.metadata,
          source: 'branch',
          parentThreadId: 'test-thread-id',
        },
      });
    });

    it('should create a branch with custom options', () => {
      const branchOptions = {
        title: 'Alternative Solution',
        branchReason: 'Exploring different approach',
        createdBy: 'user-123',
        branchingStrategy: 'alternative' as const,
      };

      const branchData = thread.createBranch('message-123', branchOptions);

      expect(branchData).toEqual({
        title: 'Alternative Solution',
        parentThreadId: 'test-thread-id',
        branchType: ThreadBranchType.BRANCH,
        branchPointMessageId: 'message-123',
        branchMetadata: {
          branchReason: 'Exploring different approach',
          branchTitle: 'Alternative Solution',
          createdBy: 'user-123',
          branchingStrategy: 'alternative',
          contextPreserved: true,
        },
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        categoryId: thread.categoryId,
        tags: ['original', 'branch'],
        isMainBranch: false,
        metadata: {
          ...thread.metadata,
          source: 'branch',
          parentThreadId: 'test-thread-id',
        },
      });
    });

    it('should preserve existing metadata when creating branch', () => {
      thread.metadata = {
        source: 'api',
        language: 'en',
        model: 'gpt-4',
      };

      const branchData = thread.createBranch('message-123', {});

      expect(branchData.metadata).toEqual({
        source: 'branch',
        language: 'en',
        model: 'gpt-4',
        parentThreadId: 'test-thread-id',
      });
    });
  });

  describe('markAsMerged', () => {
    it('should mark thread as merged with default options', () => {
      const sourceThreadIds = ['thread-1', 'thread-2'];

      thread.markAsMerged(sourceThreadIds, {});

      expect(thread.branchType).toBe(ThreadBranchType.MERGED);
      expect(thread.mergeMetadata).toEqual({
        sourceThreadIds,
        mergeStrategy: 'sequential',
        conflictResolution: 'automatic',
        mergedBy: undefined,
        mergedAt: expect.any(Date),
      });
      expect(thread.tags).toContain('merged');
    });

    it('should mark thread as merged with custom options', () => {
      const sourceThreadIds = ['thread-1', 'thread-2'];
      const mergeOptions = {
        mergeStrategy: 'interleaved' as const,
        conflictResolution: 'manual' as const,
        mergedBy: 'user-456',
      };

      thread.markAsMerged(sourceThreadIds, mergeOptions);

      expect(thread.branchType).toBe(ThreadBranchType.MERGED);
      expect(thread.mergeMetadata).toEqual({
        sourceThreadIds,
        mergeStrategy: 'interleaved',
        conflictResolution: 'manual',
        mergedBy: 'user-456',
        mergedAt: expect.any(Date),
      });
      expect(thread.tags).toContain('merged');
    });

    it('should not duplicate merged tag', () => {
      thread.tags = ['original', 'merged'];
      const sourceThreadIds = ['thread-1'];

      thread.markAsMerged(sourceThreadIds, {});

      expect(thread.tags.filter((tag) => tag === 'merged')).toHaveLength(1);
    });
  });

  describe('branch type checks', () => {
    it('should correctly identify branch thread', () => {
      thread.branchType = ThreadBranchType.BRANCH;

      expect(thread.isBranch()).toBe(true);
      expect(thread.isRoot()).toBe(false);
      expect(thread.isMerged()).toBe(false);
    });

    it('should correctly identify root thread', () => {
      thread.branchType = ThreadBranchType.ROOT;

      expect(thread.isBranch()).toBe(false);
      expect(thread.isRoot()).toBe(true);
      expect(thread.isMerged()).toBe(false);
    });

    it('should correctly identify merged thread', () => {
      thread.branchType = ThreadBranchType.MERGED;

      expect(thread.isBranch()).toBe(false);
      expect(thread.isRoot()).toBe(false);
      expect(thread.isMerged()).toBe(true);
    });
  });

  describe('getBranchDepth', () => {
    it('should return 0 for thread with no parent', async () => {
      thread.parentThread = undefined;

      const depth = await thread.getBranchDepth();

      expect(depth).toBe(0);
    });

    it('should return correct depth for nested branches', async () => {
      // Create a hierarchy: root -> parent -> current
      const rootThread = new ConversationThread();

      const parentThread = new ConversationThread();
      // Mock the getBranchDepth method for parent
      parentThread.getBranchDepth = jest.fn().mockResolvedValue(1);

      // Mock the parentThread property as a Promise
      Object.defineProperty(thread, 'parentThread', {
        get: () => Promise.resolve(parentThread),
        configurable: true,
      });

      const depth = await thread.getBranchDepth();

      expect(depth).toBe(2);
    });

    it('should handle null parent thread gracefully', async () => {
      // Mock the parentThread property to return null
      Object.defineProperty(thread, 'parentThread', {
        get: () => Promise.resolve(null),
        configurable: true,
      });

      const depth = await thread.getBranchDepth();

      expect(depth).toBe(0);
    });
  });

  describe('toSafeObject', () => {
    it('should include branching fields in safe object representation', () => {
      thread.parentThreadId = 'parent-id';
      thread.branchType = ThreadBranchType.BRANCH;
      thread.branchPointMessageId = 'message-123';
      thread.branchMetadata = {
        branchReason: 'Test branch',
        branchingStrategy: 'fork',
        contextPreserved: true,
      };
      thread.mergeMetadata = {
        sourceThreadIds: ['thread-1'],
        mergeStrategy: 'sequential',
        conflictResolution: 'automatic',
      };
      thread.isMainBranch = false;

      const safeObject = thread.toSafeObject();

      expect(safeObject).toEqual({
        id: 'test-thread-id',
        title: 'Test Thread',
        summary: thread.summary,
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        categoryId: thread.categoryId,
        tags: ['original'],
        messageCount: 5,
        unreadCount: 0,
        lastActivityAt: thread.lastActivityAt,
        lastMessagePreview: thread.lastMessagePreview,
        lastMessageSender: thread.lastMessageSender,
        metadata: thread.metadata,
        parentThreadId: 'parent-id',
        branchType: ThreadBranchType.BRANCH,
        branchPointMessageId: 'message-123',
        branchMetadata: {
          branchReason: 'Test branch',
          branchingStrategy: 'fork',
          contextPreserved: true,
        },
        mergeMetadata: {
          sourceThreadIds: ['thread-1'],
          mergeStrategy: 'sequential',
          conflictResolution: 'automatic',
        },
        isMainBranch: false,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      });
    });
  });

  describe('thread hierarchy operations', () => {
    it('should create consistent branch data for multiple branches', () => {
      const branch1 = thread.createBranch('message-1', { title: 'Branch 1' });
      const branch2 = thread.createBranch('message-2', { title: 'Branch 2' });

      expect(branch1.parentThreadId).toBe(thread.id);
      expect(branch2.parentThreadId).toBe(thread.id);
      expect(branch1.branchType).toBe(ThreadBranchType.BRANCH);
      expect(branch2.branchType).toBe(ThreadBranchType.BRANCH);
      expect(branch1.isMainBranch).toBe(false);
      expect(branch2.isMainBranch).toBe(false);
    });

    it('should preserve thread priority and category in branches', () => {
      thread.priority = ThreadPriority.HIGH;
      thread.categoryId = 'category-123';

      const branchData = thread.createBranch('message-123', {});

      expect(branchData.priority).toBe(ThreadPriority.HIGH);
      expect(branchData.categoryId).toBe('category-123');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined metadata when creating branch', () => {
      thread.metadata = undefined;

      const branchData = thread.createBranch('message-123', {});

      expect(branchData.metadata).toEqual({
        source: 'branch',
        parentThreadId: 'test-thread-id',
      });
    });

    it('should handle empty tags array when creating branch', () => {
      thread.tags = [];

      const branchData = thread.createBranch('message-123', {});

      expect(branchData.tags).toEqual(['branch']);
    });

    it('should handle empty source thread IDs in merge', () => {
      thread.markAsMerged([], {});

      expect(thread.mergeMetadata?.sourceThreadIds).toEqual([]);
      expect(thread.branchType).toBe(ThreadBranchType.MERGED);
    });
  });
});
