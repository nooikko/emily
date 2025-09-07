import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { ThreadListResponseDto, ThreadResponseDto, ThreadStatsResponseDto } from '../thread-response.dto';

describe('ThreadResponseDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with complete valid data', async () => {
      const dto = plainToInstance(ThreadResponseDto, {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Thread',
        summary: 'Test summary',
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        categoryId: '456e7890-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        tags: ['tag1', 'tag2'],
        messageCount: 5,
        unreadCount: 2,
        lastActivityAt: new Date('2024-01-01T12:00:00Z'),
        lastMessagePreview: 'Last message content',
        lastMessageSender: 'assistant',
        metadata: { source: 'api' },
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with minimal required data', async () => {
      const dto = plainToInstance(ThreadResponseDto, {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Thread',
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        tags: [],
        messageCount: 0,
        unreadCount: 0,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Field Validation', () => {
    describe('id validation', () => {
      it('should validate UUID format', async () => {
        const validDto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const validErrors = await validate(validDto);
        expect(validErrors).toHaveLength(0);

        const invalidDto = plainToInstance(ThreadResponseDto, {
          id: 'not-a-uuid',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const invalidErrors = await validate(invalidDto);
        expect(invalidErrors).toHaveLength(1);
        expect(invalidErrors[0].property).toBe('id');
        expect(invalidErrors[0].constraints).toHaveProperty('isUuid');
      });
    });

    describe('title validation', () => {
      it('should require string title', async () => {
        const dto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 123,
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('isString');
      });
    });

    describe('enum validation', () => {
      it('should validate status enum', async () => {
        const dto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: 'invalid-status',
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('status');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });

      it('should validate priority enum', async () => {
        const dto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: 'invalid-priority',
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('priority');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });
    });

    describe('array validation', () => {
      it('should validate tags as string array', async () => {
        const validDto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: ['tag1', 'tag2'],
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const validErrors = await validate(validDto);
        expect(validErrors).toHaveLength(0);

        const invalidDto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: 'not-an-array',
          messageCount: 0,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const invalidErrors = await validate(invalidDto);
        expect(invalidErrors).toHaveLength(1);
        expect(invalidErrors[0].property).toBe('tags');
        expect(invalidErrors[0].constraints).toHaveProperty('isArray');
      });
    });

    describe('number validation', () => {
      it('should validate messageCount and unreadCount as numbers', async () => {
        const validDto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 10,
          unreadCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const validErrors = await validate(validDto);
        expect(validErrors).toHaveLength(0);

        const invalidDto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 'not-a-number',
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const invalidErrors = await validate(invalidDto);
        expect(invalidErrors).toHaveLength(1);
        expect(invalidErrors[0].property).toBe('messageCount');
        expect(invalidErrors[0].constraints).toHaveProperty('isNumber');
      });
    });

    describe('date validation and transformation', () => {
      it('should transform date strings to Date objects', async () => {
        const dto = plainToInstance(ThreadResponseDto, {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 0,
          unreadCount: 0,
          lastActivityAt: '2024-01-01T12:00:00Z',
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T12:00:00Z',
        });

        expect(dto.lastActivityAt).toBeInstanceOf(Date);
        expect(dto.createdAt).toBeInstanceOf(Date);
        expect(dto.updatedAt).toBeInstanceOf(Date);

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('Optional Fields Handling', () => {
    it('should handle all optional fields as undefined', async () => {
      const dto = plainToInstance(ThreadResponseDto, {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test',
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.NORMAL,
        tags: [],
        messageCount: 0,
        unreadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        // All optional fields omitted
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.summary).toBeUndefined();
      expect(dto.categoryId).toBeUndefined();
      expect(dto.lastActivityAt).toBeUndefined();
      expect(dto.lastMessagePreview).toBeUndefined();
      expect(dto.lastMessageSender).toBeUndefined();
      expect(dto.metadata).toBeUndefined();
    });
  });
});

describe('ThreadListResponseDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with complete pagination data', async () => {
      const threads = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Thread 1',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.NORMAL,
          tags: [],
          messageCount: 5,
          unreadCount: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '456e7890-e89b-12d3-a456-426614174000',
          title: 'Thread 2',
          status: ThreadStatus.ACTIVE,
          priority: ThreadPriority.HIGH,
          tags: ['important'],
          messageCount: 10,
          unreadCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const dto = plainToInstance(ThreadListResponseDto, {
        threads,
        total: 50,
        page: 2,
        limit: 20,
        totalPages: 3,
        hasMore: true,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.threads).toHaveLength(2);
      expect(dto.total).toBe(50);
      expect(dto.hasMore).toBe(true);
    });

    it('should validate nested thread objects', async () => {
      const dto = plainToInstance(ThreadListResponseDto, {
        threads: [
          {
            id: 'not-a-uuid', // Invalid UUID
            title: 'Thread 1',
            status: ThreadStatus.ACTIVE,
            priority: ThreadPriority.NORMAL,
            tags: [],
            messageCount: 5,
            unreadCount: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      });

      const errors = await validate(dto);
      // Should validate nested ThreadResponseDto objects
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Pagination Fields', () => {
    it('should validate all pagination fields as numbers', async () => {
      const dto = plainToInstance(ThreadListResponseDto, {
        threads: [],
        total: 'not-a-number',
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('total');
      expect(errors[0].constraints).toHaveProperty('isNumber');
    });

    it('should validate hasMore as boolean', async () => {
      const dto = plainToInstance(ThreadListResponseDto, {
        threads: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: 'not-a-boolean',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('hasMore');
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty thread list', async () => {
      const dto = plainToInstance(ThreadListResponseDto, {
        threads: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle large pagination numbers', async () => {
      const dto = plainToInstance(ThreadListResponseDto, {
        threads: [],
        total: 999999,
        page: 50000,
        limit: 100,
        totalPages: 9999,
        hasMore: true,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('ThreadStatsResponseDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with complete statistics', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 150,
        activeThreads: 120,
        archivedThreads: 25,
        deletedThreads: 5,
        totalMessages: 2500,
        totalUnreadMessages: 30,
        byPriority: {
          low: 20,
          normal: 90,
          high: 35,
          urgent: 5,
        },
        byCategory: {
          General: 50,
          Work: 60,
          Learning: 40,
        },
        topTags: {
          typescript: 45,
          javascript: 30,
          react: 25,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with minimal required data', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 10,
        activeThreads: 8,
        archivedThreads: 2,
        deletedThreads: 0,
        totalMessages: 150,
        totalUnreadMessages: 5,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Numeric Field Validation', () => {
    it('should validate all count fields as numbers', async () => {
      const fields = ['totalThreads', 'activeThreads', 'archivedThreads', 'deletedThreads', 'totalMessages', 'totalUnreadMessages'];

      for (const field of fields) {
        const dto = plainToInstance(ThreadStatsResponseDto, {
          totalThreads: 10,
          activeThreads: 8,
          archivedThreads: 2,
          deletedThreads: 0,
          totalMessages: 150,
          totalUnreadMessages: 5,
          [field]: 'not-a-number',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe(field);
        expect(errors[0].constraints).toHaveProperty('isNumber');
      }
    });

    it('should handle zero values', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 0,
        activeThreads: 0,
        archivedThreads: 0,
        deletedThreads: 0,
        totalMessages: 0,
        totalUnreadMessages: 0,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle large numbers', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 999999,
        activeThreads: 500000,
        archivedThreads: 300000,
        deletedThreads: 199999,
        totalMessages: 50000000,
        totalUnreadMessages: 1000000,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Optional Object Fields', () => {
    it('should handle undefined optional objects', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 10,
        activeThreads: 8,
        archivedThreads: 2,
        deletedThreads: 0,
        totalMessages: 150,
        totalUnreadMessages: 5,
        // Optional objects omitted
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.byPriority).toBeUndefined();
      expect(dto.byCategory).toBeUndefined();
      expect(dto.topTags).toBeUndefined();
    });

    it('should handle empty optional objects', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 0,
        activeThreads: 0,
        archivedThreads: 0,
        deletedThreads: 0,
        totalMessages: 0,
        totalUnreadMessages: 0,
        byPriority: {},
        byCategory: {},
        topTags: {},
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle complex nested statistics', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 1000,
        activeThreads: 750,
        archivedThreads: 200,
        deletedThreads: 50,
        totalMessages: 25000,
        totalUnreadMessages: 150,
        byPriority: {
          low: 100,
          normal: 600,
          high: 250,
          urgent: 50,
        },
        byCategory: {
          General: 200,
          Work: 300,
          Learning: 250,
          Personal: 150,
          Projects: 100,
        },
        topTags: {
          typescript: 150,
          javascript: 120,
          react: 100,
          node: 80,
          api: 70,
          database: 60,
          frontend: 90,
          backend: 85,
          testing: 50,
          deployment: 40,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Statistics Consistency', () => {
    it('should allow inconsistent totals for flexibility', async () => {
      // In real scenarios, numbers might not always add up due to timing/filtering
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 100,
        activeThreads: 80,
        archivedThreads: 30, // 80 + 30 + 5 = 115 > 100
        deletedThreads: 5,
        totalMessages: 1500,
        totalUnreadMessages: 25,
        byPriority: {
          low: 20,
          normal: 60,
          high: 25,
          urgent: 10, // 115 total, different from totalThreads
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0); // Validation doesn't enforce consistency
    });
  });

  describe('Real-world Statistics Scenarios', () => {
    it('should handle enterprise-scale statistics', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 50000,
        activeThreads: 35000,
        archivedThreads: 12000,
        deletedThreads: 3000,
        totalMessages: 2500000,
        totalUnreadMessages: 15000,
        byPriority: {
          low: 5000,
          normal: 30000,
          high: 12000,
          urgent: 3000,
        },
        byCategory: {
          Support: 15000,
          Sales: 10000,
          Development: 8000,
          Marketing: 5000,
          General: 12000,
        },
        topTags: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`tag-${i}`, 1000 - i * 10])),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(Object.keys(dto.topTags!)).toHaveLength(50);
    });

    it('should handle start-up scale statistics', async () => {
      const dto = plainToInstance(ThreadStatsResponseDto, {
        totalThreads: 25,
        activeThreads: 20,
        archivedThreads: 5,
        deletedThreads: 0,
        totalMessages: 150,
        totalUnreadMessages: 8,
        byPriority: {
          low: 5,
          normal: 15,
          high: 4,
          urgent: 1,
        },
        byCategory: {
          General: 15,
          Support: 7,
          'Feature Requests': 3,
        },
        topTags: {
          bug: 8,
          feature: 5,
          question: 12,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
