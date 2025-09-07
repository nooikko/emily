import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { BulkUpdateThreadsDto, UpdateThreadDto } from '../update-thread.dto';

describe('UpdateThreadDto', () => {
  describe('Validation', () => {
    it('should pass validation with all optional fields', async () => {
      const dto = plainToInstance(UpdateThreadDto, {
        title: 'Updated Title',
        summary: 'Updated summary',
        status: ThreadStatus.ARCHIVED,
        priority: ThreadPriority.HIGH,
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        tags: ['updated', 'test'],
        metadata: { source: 'web', updated: true },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with empty object', async () => {
      const dto = plainToInstance(UpdateThreadDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with single field update', async () => {
      const dto = plainToInstance(UpdateThreadDto, {
        title: 'Only Title Updated',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    describe('title validation', () => {
      it('should pass with valid title', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          title: 'Valid Updated Title',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with non-string title', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          title: 123,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should fail with title exceeding max length', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          title: 'a'.repeat(256),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('maxLength');
      });
    });

    describe('summary validation', () => {
      it('should pass with valid summary', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          summary: 'Updated thread summary',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with non-string summary', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          summary: 123,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('summary');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should fail with summary exceeding max length', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          summary: 'a'.repeat(1001),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('summary');
        expect(errors[0].constraints).toHaveProperty('maxLength');
      });
    });

    describe('status validation', () => {
      it('should pass with valid status values', async () => {
        const statuses = [ThreadStatus.ACTIVE, ThreadStatus.ARCHIVED, ThreadStatus.DELETED, ThreadStatus.PAUSED];

        for (const status of statuses) {
          const dto = plainToInstance(UpdateThreadDto, { status });
          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        }
      });

      it('should fail with invalid status', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          status: 'invalid-status' as any,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('status');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });
    });

    describe('priority validation', () => {
      it('should pass with valid priority values', async () => {
        const priorities = [ThreadPriority.LOW, ThreadPriority.NORMAL, ThreadPriority.HIGH, ThreadPriority.URGENT];

        for (const priority of priorities) {
          const dto = plainToInstance(UpdateThreadDto, { priority });
          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        }
      });

      it('should fail with invalid priority', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          priority: 'invalid-priority' as any,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('priority');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });
    });

    describe('categoryId validation', () => {
      it('should pass with valid UUID', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with invalid UUID', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          categoryId: 'not-a-uuid',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('categoryId');
        expect(errors[0].constraints).toHaveProperty('isUuid');
      });
    });

    describe('tags validation', () => {
      it('should pass with valid string array', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          tags: ['updated', 'modified', 'test'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should pass with empty array', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          tags: [],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with non-array tags', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          tags: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isArray');
      });

      it('should fail with non-string elements', async () => {
        const dto = plainToInstance(UpdateThreadDto, {
          tags: ['valid', 123, 'also-valid'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isString');
      });
    });
  });

  describe('Realistic Update Scenarios', () => {
    it('should handle status change to archived', async () => {
      const dto = plainToInstance(UpdateThreadDto, {
        status: ThreadStatus.ARCHIVED,
        tags: ['archived', 'completed'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle priority escalation', async () => {
      const dto = plainToInstance(UpdateThreadDto, {
        priority: ThreadPriority.URGENT,
        metadata: { escalatedBy: 'system', escalatedAt: '2024-01-01T12:00:00Z' },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle category reassignment', async () => {
      const dto = plainToInstance(UpdateThreadDto, {
        categoryId: '456e7890-e89b-12d3-a456-426614174000',
        tags: ['moved', 'recategorized'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('BulkUpdateThreadsDto', () => {
  describe('Validation', () => {
    it('should pass validation with valid bulk update data', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000'],
        status: ThreadStatus.ARCHIVED,
        priority: ThreadPriority.LOW,
        categoryId: '789e1234-e89b-12d3-a456-426614174000',
        addTags: ['bulk-updated', 'archived'],
        removeTags: ['old-tag', 'deprecated'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    describe('threadIds validation', () => {
      it('should pass with valid UUID array', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000', '789e1234-e89b-12d3-a456-426614174000'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with non-array threadIds', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('threadIds');
        expect(errors[0].constraints).toHaveProperty('isArray');
      });

      it('should fail with invalid UUIDs in array', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000', 'not-a-uuid', '789e1234-e89b-12d3-a456-426614174000'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('threadIds');
        expect(errors[0].constraints).toHaveProperty('isUuid');
      });

      it('should pass with single thread ID', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should handle empty threadIds array', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: [],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('optional fields validation', () => {
      it('should pass with only threadIds', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate status when provided', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          status: 'invalid-status' as any,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('status');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });

      it('should validate priority when provided', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          priority: 'invalid-priority' as any,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('priority');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });

      it('should validate categoryId when provided', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          categoryId: 'not-a-uuid',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('categoryId');
        expect(errors[0].constraints).toHaveProperty('isUuid');
      });
    });

    describe('tag operations validation', () => {
      it('should validate addTags as string array', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          addTags: ['tag1', 'tag2', 'tag3'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate removeTags as string array', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          removeTags: ['old-tag1', 'old-tag2'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail with non-array addTags', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          addTags: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('addTags');
        expect(errors[0].constraints).toHaveProperty('isArray');
      });

      it('should fail with non-string elements in addTags', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          addTags: ['valid', 123, 'also-valid'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('addTags');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should handle empty tag arrays', async () => {
        const dto = plainToInstance(BulkUpdateThreadsDto, {
          threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
          addTags: [],
          removeTags: [],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('Real-world Bulk Operations', () => {
    it('should handle bulk archiving', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000', '789e1234-e89b-12d3-a456-426614174000'],
        status: ThreadStatus.ARCHIVED,
        addTags: ['archived', 'batch-2024'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle priority escalation', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000'],
        priority: ThreadPriority.URGENT,
        addTags: ['escalated'],
        removeTags: ['normal-priority'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle category migration', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
        categoryId: '999e9999-e89b-12d3-a456-426614174000',
        addTags: ['migrated'],
        removeTags: ['old-category'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle tag cleanup operations', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e89b-12d3-a456-426614174000'],
        removeTags: ['deprecated', 'old', 'unused'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle large batch operations', async () => {
      const threadIds = Array.from({ length: 100 }, (_, i) => `${i.toString().padStart(8, '0')}-e89b-12d3-a456-426614174000`);

      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds,
        status: ThreadStatus.ARCHIVED,
        addTags: ['bulk-archived'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate thread IDs', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174000', // Duplicate
          '456e7890-e89b-12d3-a456-426614174000',
        ],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0); // Validation allows duplicates (business logic handles it)
    });

    it('should handle conflicting tag operations', async () => {
      const dto = plainToInstance(BulkUpdateThreadsDto, {
        threadIds: ['123e4567-e89b-12d3-a456-426614174000'],
        addTags: ['important', 'shared-tag'],
        removeTags: ['shared-tag', 'old'], // Same tag in both arrays
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0); // Validation allows this (service logic handles conflicts)
    });
  });
});
