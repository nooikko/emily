import { ConversationThread, ThreadPriority, ThreadStatus } from '../conversation-thread.entity';

describe('ConversationThread Entity', () => {
  let thread: ConversationThread;

  beforeEach(() => {
    thread = new ConversationThread();
    thread.id = '123e4567-e89b-12d3-a456-426614174000';
    thread.title = 'Test Thread';
    thread.status = ThreadStatus.ACTIVE;
    thread.priority = ThreadPriority.NORMAL;
    thread.tags = [];
    thread.messageCount = 0;
    thread.unreadCount = 0;
    thread.createdAt = new Date('2024-01-01T12:00:00Z');
    thread.updatedAt = new Date('2024-01-01T12:00:00Z');
  });

  describe('Constructor and Properties', () => {
    it('should create a thread with default values', () => {
      const newThread = new ConversationThread();
      expect(newThread).toBeInstanceOf(ConversationThread);
    });

    it('should have correct properties', () => {
      expect(thread.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(thread.title).toBe('Test Thread');
      expect(thread.status).toBe(ThreadStatus.ACTIVE);
      expect(thread.priority).toBe(ThreadPriority.NORMAL);
      expect(thread.tags).toEqual([]);
      expect(thread.messageCount).toBe(0);
      expect(thread.unreadCount).toBe(0);
    });
  });

  describe('updateLastActivity()', () => {
    it('should update lastActivityAt to current time', () => {
      const beforeUpdate = new Date();
      thread.updateLastActivity();
      expect(thread.lastActivityAt).toBeInstanceOf(Date);
      expect(thread.lastActivityAt!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should set message preview when provided', () => {
      const preview = 'This is a test message preview';
      thread.updateLastActivity(preview);
      expect(thread.lastMessagePreview).toBe(preview);
    });

    it('should truncate long message previews', () => {
      const longMessage = 'a'.repeat(600);
      thread.updateLastActivity(longMessage);
      expect(thread.lastMessagePreview).toBe(`${'a'.repeat(497)}...`);
      expect(thread.lastMessagePreview!.length).toBe(500);
    });

    it('should set message sender when provided', () => {
      thread.updateLastActivity('test', 'human');
      expect(thread.lastMessageSender).toBe('human');

      thread.updateLastActivity('test', 'assistant');
      expect(thread.lastMessageSender).toBe('assistant');

      thread.updateLastActivity('test', 'system');
      expect(thread.lastMessageSender).toBe('system');
    });

    it('should update multiple fields together', () => {
      const beforeUpdate = new Date();
      thread.updateLastActivity('Test message', 'assistant');

      expect(thread.lastActivityAt!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(thread.lastMessagePreview).toBe('Test message');
      expect(thread.lastMessageSender).toBe('assistant');
    });
  });

  describe('incrementMessageCount()', () => {
    it('should increment message count by 1', () => {
      expect(thread.messageCount).toBe(0);
      thread.incrementMessageCount();
      expect(thread.messageCount).toBe(1);
    });

    it('should increment from existing count', () => {
      thread.messageCount = 5;
      thread.incrementMessageCount();
      expect(thread.messageCount).toBe(6);
    });
  });

  describe('decrementMessageCount()', () => {
    it('should decrement message count by 1', () => {
      thread.messageCount = 5;
      thread.decrementMessageCount();
      expect(thread.messageCount).toBe(4);
    });

    it('should not decrement below 0', () => {
      thread.messageCount = 0;
      thread.decrementMessageCount();
      expect(thread.messageCount).toBe(0);
    });

    it('should handle negative values correctly', () => {
      thread.messageCount = 1;
      thread.decrementMessageCount();
      expect(thread.messageCount).toBe(0);

      thread.decrementMessageCount();
      expect(thread.messageCount).toBe(0);
    });
  });

  describe('Status Management Methods', () => {
    describe('archive()', () => {
      it('should set status to ARCHIVED', () => {
        thread.status = ThreadStatus.ACTIVE;
        thread.archive();
        expect(thread.status).toBe(ThreadStatus.ARCHIVED);
      });
    });

    describe('delete()', () => {
      it('should set status to DELETED', () => {
        thread.status = ThreadStatus.ACTIVE;
        thread.delete();
        expect(thread.status).toBe(ThreadStatus.DELETED);
      });
    });

    describe('restore()', () => {
      it('should set status to ACTIVE', () => {
        thread.status = ThreadStatus.DELETED;
        thread.restore();
        expect(thread.status).toBe(ThreadStatus.ACTIVE);
      });
    });
  });

  describe('Status Check Methods', () => {
    describe('isActive()', () => {
      it('should return true when status is ACTIVE', () => {
        thread.status = ThreadStatus.ACTIVE;
        expect(thread.isActive()).toBe(true);
      });

      it('should return false when status is not ACTIVE', () => {
        thread.status = ThreadStatus.ARCHIVED;
        expect(thread.isActive()).toBe(false);

        thread.status = ThreadStatus.DELETED;
        expect(thread.isActive()).toBe(false);

        thread.status = ThreadStatus.PAUSED;
        expect(thread.isActive()).toBe(false);
      });
    });

    describe('isArchived()', () => {
      it('should return true when status is ARCHIVED', () => {
        thread.status = ThreadStatus.ARCHIVED;
        expect(thread.isArchived()).toBe(true);
      });

      it('should return false when status is not ARCHIVED', () => {
        thread.status = ThreadStatus.ACTIVE;
        expect(thread.isArchived()).toBe(false);

        thread.status = ThreadStatus.DELETED;
        expect(thread.isArchived()).toBe(false);
      });
    });

    describe('isDeleted()', () => {
      it('should return true when status is DELETED', () => {
        thread.status = ThreadStatus.DELETED;
        expect(thread.isDeleted()).toBe(true);
      });

      it('should return false when status is not DELETED', () => {
        thread.status = ThreadStatus.ACTIVE;
        expect(thread.isDeleted()).toBe(false);

        thread.status = ThreadStatus.ARCHIVED;
        expect(thread.isDeleted()).toBe(false);
      });
    });
  });

  describe('generateTitle()', () => {
    beforeEach(() => {
      thread.title = 'New Conversation';
    });

    it('should use short content as title', () => {
      const shortContent = 'Hello world';
      thread.generateTitle(shortContent);
      expect(thread.title).toBe(shortContent);
    });

    it('should extract first sentence for longer content', () => {
      const content = 'Hello world! This is a longer message.';
      thread.generateTitle(content);
      expect(thread.title).toBe('Hello world');
    });

    it('should handle content with question marks', () => {
      const content = 'What is TypeScript? It is a programming language.';
      thread.generateTitle(content);
      expect(thread.title).toBe('What is TypeScript');
    });

    it('should handle content with exclamation marks', () => {
      const content = 'Amazing feature! This will be great.';
      thread.generateTitle(content);
      expect(thread.title).toBe('Amazing feature');
    });

    it('should truncate if first sentence is too long', () => {
      const longSentence = 'This is a very long sentence that exceeds the title limit and should be truncated properly.';
      thread.generateTitle(longSentence);
      expect(thread.title).toBe('This is a very long sentence that exceeds the t...');
      expect(thread.title.length).toBe(50);
    });

    it('should truncate if no sentence breaks found', () => {
      const longContent = 'a'.repeat(100);
      thread.generateTitle(longContent);
      expect(thread.title).toBe(`${'a'.repeat(47)}...`);
      expect(thread.title.length).toBe(50);
    });

    it('should clean whitespace from content', () => {
      const messyContent = '   Hello   world   with   spaces   ';
      thread.generateTitle(messyContent);
      expect(thread.title).toBe('Hello world with spaces');
    });

    it('should not update title if already set to non-default value', () => {
      thread.title = 'Custom Title';
      thread.generateTitle('Some new content');
      expect(thread.title).toBe('Custom Title');
    });

    it('should update title if currently "New Conversation"', () => {
      thread.title = 'New Conversation';
      thread.generateTitle('Hello world');
      expect(thread.title).toBe('Hello world');
    });

    it('should handle empty content', () => {
      thread.title = 'New Conversation';
      thread.generateTitle('');
      expect(thread.title).toBe('');
    });

    it('should handle whitespace-only content', () => {
      thread.title = 'New Conversation';
      thread.generateTitle('   \n\t   ');
      expect(thread.title).toBe('');
    });
  });

  describe('toSafeObject()', () => {
    it('should return sanitized object with all required fields', () => {
      thread.summary = 'Test summary';
      thread.categoryId = '456e7890-e89b-12d3-a456-426614174000';
      thread.tags = ['tag1', 'tag2'];
      thread.lastActivityAt = new Date('2024-01-01T13:00:00Z');
      thread.lastMessagePreview = 'Last message preview';
      thread.lastMessageSender = 'assistant';
      thread.metadata = { source: 'api', language: 'en' };

      const safeObject = thread.toSafeObject();

      expect(safeObject).toEqual({
        id: thread.id,
        title: thread.title,
        summary: thread.summary,
        status: thread.status,
        priority: thread.priority,
        categoryId: thread.categoryId,
        tags: thread.tags,
        messageCount: thread.messageCount,
        unreadCount: thread.unreadCount,
        lastActivityAt: thread.lastActivityAt,
        lastMessagePreview: thread.lastMessagePreview,
        lastMessageSender: thread.lastMessageSender,
        metadata: thread.metadata,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      });
    });

    it('should handle optional fields being undefined', () => {
      const safeObject = thread.toSafeObject();

      expect(safeObject).toHaveProperty('summary', undefined);
      expect(safeObject).toHaveProperty('categoryId', undefined);
      expect(safeObject).toHaveProperty('lastActivityAt', undefined);
      expect(safeObject).toHaveProperty('lastMessagePreview', undefined);
      expect(safeObject).toHaveProperty('lastMessageSender', undefined);
      expect(safeObject).toHaveProperty('metadata', undefined);
    });

    it('should not expose internal properties', () => {
      const safeObject = thread.toSafeObject();
      expect(safeObject).not.toHaveProperty('messages');
    });
  });

  describe('Enum Values', () => {
    describe('ThreadStatus', () => {
      it('should have correct status values', () => {
        expect(ThreadStatus.ACTIVE).toBe('active');
        expect(ThreadStatus.ARCHIVED).toBe('archived');
        expect(ThreadStatus.DELETED).toBe('deleted');
        expect(ThreadStatus.PAUSED).toBe('paused');
      });
    });

    describe('ThreadPriority', () => {
      it('should have correct priority values', () => {
        expect(ThreadPriority.LOW).toBe('low');
        expect(ThreadPriority.NORMAL).toBe('normal');
        expect(ThreadPriority.HIGH).toBe('high');
        expect(ThreadPriority.URGENT).toBe('urgent');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values gracefully in generateTitle', () => {
      thread.title = 'New Conversation';
      // @ts-expect-error Testing null input
      thread.generateTitle(null);
      expect(thread.title).toBe('New Conversation');
    });

    it('should handle very long content efficiently', () => {
      const veryLongContent = 'word '.repeat(10000);
      const startTime = Date.now();
      thread.generateTitle(veryLongContent);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(thread.title.length).toBeLessThanOrEqual(50);
    });

    it('should handle special characters in content', () => {
      thread.title = 'New Conversation'; // Reset to trigger title generation
      const specialContent = 'Hello 世界! This has émojis 🎉 and special chars.';
      thread.generateTitle(specialContent);
      expect(thread.title).toBe('Hello 世界');
    });
  });
});
