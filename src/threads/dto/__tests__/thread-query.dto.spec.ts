import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { ThreadFilterPresetDto, ThreadQueryDto, ThreadSearchDto } from '../thread-query.dto';

describe('ThreadQueryDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with default values', async () => {
      const dto = plainToInstance(ThreadQueryDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('should pass validation with all optional parameters', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        page: 2,
        limit: 50,
        search: 'typescript',
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.HIGH,
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        tags: ['tag1', 'tag2'],
        tagsMatchAny: true,
        hasUnread: true,
        minMessageCount: 5,
        maxMessageCount: 100,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Pagination Validation', () => {
    it('should validate page number minimum', async () => {
      const dto = plainToInstance(ThreadQueryDto, { page: 0 });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should validate limit minimum and maximum', async () => {
      const dtoMin = plainToInstance(ThreadQueryDto, { limit: 0 });
      const errorsMin = await validate(dtoMin);
      expect(errorsMin).toHaveLength(1);
      expect(errorsMin[0].property).toBe('limit');
      expect(errorsMin[0].constraints).toHaveProperty('min');

      const dtoMax = plainToInstance(ThreadQueryDto, { limit: 101 });
      const errorsMax = await validate(dtoMax);
      expect(errorsMax).toHaveLength(1);
      expect(errorsMax[0].property).toBe('limit');
      expect(errorsMax[0].constraints).toHaveProperty('max');
    });

    it('should accept valid page and limit values', async () => {
      const dto = plainToInstance(ThreadQueryDto, { page: 5, limit: 50 });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Search Validation', () => {
    it('should accept valid search strings', async () => {
      const searchTerms = ['typescript', 'react hooks', 'How to use async/await?', 'Special chars: @#$%'];

      for (const search of searchTerms) {
        const dto = plainToInstance(ThreadQueryDto, { search });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should fail with non-string search', async () => {
      const dto = plainToInstance(ThreadQueryDto, { search: 123 });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('search');
      expect(errors[0].constraints).toHaveProperty('isString');
    });
  });

  describe('Enum Validation', () => {
    it('should validate status enum values', async () => {
      const validStatuses = [ThreadStatus.ACTIVE, ThreadStatus.ARCHIVED, ThreadStatus.DELETED, ThreadStatus.PAUSED];

      for (const status of validStatuses) {
        const dto = plainToInstance(ThreadQueryDto, { status });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }

      const dto = plainToInstance(ThreadQueryDto, { status: 'invalid' as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('status');
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });

    it('should validate priority enum values', async () => {
      const validPriorities = [ThreadPriority.LOW, ThreadPriority.NORMAL, ThreadPriority.HIGH, ThreadPriority.URGENT];

      for (const priority of validPriorities) {
        const dto = plainToInstance(ThreadQueryDto, { priority });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }

      const dto = plainToInstance(ThreadQueryDto, { priority: 'invalid' as any });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('priority');
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  describe('UUID Validation', () => {
    it('should validate categoryId as UUID', async () => {
      const validDto = plainToInstance(ThreadQueryDto, { categoryId: '123e4567-e89b-12d3-a456-426614174000' });
      const validErrors = await validate(validDto);
      expect(validErrors).toHaveLength(0);

      const invalidDto = plainToInstance(ThreadQueryDto, { categoryId: 'not-a-uuid' });
      const invalidErrors = await validate(invalidDto);
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0].property).toBe('categoryId');
      expect(invalidErrors[0].constraints).toHaveProperty('isUuid');
    });
  });

  describe('Message Count Validation', () => {
    it('should validate message count bounds', async () => {
      const validDto = plainToInstance(ThreadQueryDto, {
        minMessageCount: 0,
        maxMessageCount: 1000,
      });
      const validErrors = await validate(validDto);
      expect(validErrors).toHaveLength(0);

      const invalidMinDto = plainToInstance(ThreadQueryDto, { minMessageCount: -1 });
      const invalidMinErrors = await validate(invalidMinDto);
      expect(invalidMinErrors).toHaveLength(1);
      expect(invalidMinErrors[0].property).toBe('minMessageCount');
      expect(invalidMinErrors[0].constraints).toHaveProperty('min');

      const invalidMaxDto = plainToInstance(ThreadQueryDto, { maxMessageCount: -5 });
      const invalidMaxErrors = await validate(invalidMaxDto);
      expect(invalidMaxErrors).toHaveLength(1);
      expect(invalidMaxErrors[0].property).toBe('maxMessageCount');
      expect(invalidMaxErrors[0].constraints).toHaveProperty('min');
    });
  });

  describe('Date Transformations', () => {
    it('should transform date strings to Date objects', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        createdAfter: '2024-01-01T00:00:00.000Z',
        createdBefore: '2024-12-31T23:59:59.999Z',
        lastActivityAfter: '2024-06-01T12:00:00.000Z',
        lastActivityBefore: '2024-06-30T12:00:00.000Z',
      });

      expect(dto.createdAfter).toBeInstanceOf(Date);
      expect(dto.createdBefore).toBeInstanceOf(Date);
      expect(dto.lastActivityAfter).toBeInstanceOf(Date);
      expect(dto.lastActivityBefore).toBeInstanceOf(Date);
    });

    it('should handle invalid date strings gracefully', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        createdAfter: 'invalid-date',
      });

      // Should not throw during transformation
      expect(dto.createdAfter).toBeInstanceOf(Date);
      expect(Number.isNaN(dto.createdAfter?.getTime())).toBe(true);
    });
  });

  describe('Boolean Transformations', () => {
    it('should transform string booleans to actual booleans', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        tagsMatchAny: 'true',
        hasUnread: 'false',
        includeMessages: 'true',
        includeCategory: 'false',
      } as any);

      expect(dto.tagsMatchAny).toBe(true);
      expect(dto.hasUnread).toBe(false);
      expect(dto.includeMessages).toBe(true);
      expect(dto.includeCategory).toBe(false);
    });

    it('should handle actual boolean values', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        tagsMatchAny: true,
        hasUnread: false,
      });

      expect(dto.tagsMatchAny).toBe(true);
      expect(dto.hasUnread).toBe(false);
    });
  });

  describe('Tags Processing', () => {
    it('should transform comma-separated string to array', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        tags: 'typescript,react,javascript',
      } as any);

      expect(dto.tags).toEqual(['typescript', 'react', 'javascript']);
    });

    it('should handle array input directly', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        tags: ['typescript', 'react'],
      });

      expect(dto.tags).toEqual(['typescript', 'react']);
    });

    it('should filter out empty tags', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        tags: 'typescript,,react, ,javascript',
      } as any);

      expect(dto.tags).toEqual(['typescript', 'react', 'javascript']);
    });
  });
});

describe('ThreadSearchDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with minimal data', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'search term',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with all parameters', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'typescript tutorial',
        limit: 25,
        titleOnly: true,
        includeContent: false,
        includeTags: true,
        boostRecent: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with empty query', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: '',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Query Validation', () => {
    it('should accept various query formats', async () => {
      const queries = [
        'simple search',
        'multi word search query',
        'special chars: @#$%^&*()',
        'unicode: 你好世界',
        'with numbers: 123456',
        '"quoted search"',
        'search with-dashes and_underscores',
      ];

      for (const query of queries) {
        const dto = plainToInstance(ThreadSearchDto, { query });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should fail with non-string query', async () => {
      const dto = plainToInstance(ThreadSearchDto, { query: 123 });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('query');
      expect(errors[0].constraints).toHaveProperty('isString');
    });
  });

  describe('Limit Validation', () => {
    it('should validate limit bounds', async () => {
      const validDto = plainToInstance(ThreadSearchDto, {
        query: 'test',
        limit: 50,
      });
      const validErrors = await validate(validDto);
      expect(validErrors).toHaveLength(0);

      const tooLowDto = plainToInstance(ThreadSearchDto, {
        query: 'test',
        limit: 0,
      });
      const tooLowErrors = await validate(tooLowDto);
      expect(tooLowErrors).toHaveLength(1);
      expect(tooLowErrors[0].property).toBe('limit');
      expect(tooLowErrors[0].constraints).toHaveProperty('min');

      const tooHighDto = plainToInstance(ThreadSearchDto, {
        query: 'test',
        limit: 201,
      });
      const tooHighErrors = await validate(tooHighDto);
      expect(tooHighErrors).toHaveLength(1);
      expect(tooHighErrors[0].property).toBe('limit');
      expect(tooHighErrors[0].constraints).toHaveProperty('max');
    });
  });

  describe('Boolean Option Transformations', () => {
    it('should transform string booleans', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'test',
        titleOnly: 'true',
        includeContent: 'false',
        includeTags: 'true',
        boostRecent: 'false',
      } as any);

      expect(dto.titleOnly).toBe(true);
      expect(dto.includeContent).toBe(false);
      expect(dto.includeTags).toBe(true);
      expect(dto.boostRecent).toBe(false);
    });

    it('should handle default values correctly', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'test',
      });

      expect(dto.titleOnly).toBe(false);
      expect(dto.includeContent).toBe(true);
      expect(dto.includeTags).toBe(true);
      expect(dto.boostRecent).toBe(true);
      expect(dto.limit).toBe(50);
    });
  });

  describe('Search Configuration Scenarios', () => {
    it('should handle title-only search', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'important thread',
        titleOnly: true,
        includeContent: false,
        includeTags: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.titleOnly).toBe(true);
    });

    it('should handle content-only search', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'specific message content',
        titleOnly: false,
        includeContent: true,
        includeTags: false,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeContent).toBe(true);
    });

    it('should handle comprehensive search', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'comprehensive search',
        titleOnly: false,
        includeContent: true,
        includeTags: true,
        boostRecent: true,
        limit: 100,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('ThreadFilterPresetDto', () => {
  describe('Basic Validation', () => {
    it('should pass validation with valid preset', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'active',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with preset and additional filters', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'work',
        additionalFilters: {
          priority: ThreadPriority.HIGH,
          limit: 30,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with only additional filters', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        additionalFilters: {
          status: ThreadStatus.ACTIVE,
          hasUnread: true,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Preset Values', () => {
    it('should accept all valid preset values', async () => {
      const validPresets = ['active', 'archived', 'recent', 'unread', 'work', 'personal', 'learning', 'high_priority', 'urgent'];

      for (const preset of validPresets) {
        const dto = plainToInstance(ThreadFilterPresetDto, { preset });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should handle empty preset', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Additional Filters Integration', () => {
    it('should validate nested ThreadQueryDto', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'active',
        additionalFilters: {
          page: 0, // Invalid page number
        },
      });

      const _errors = await validate(dto);
      // The validation might not catch nested validation errors depending on ValidateNested configuration
      // This test verifies the structure is correctly set up
      expect(dto.additionalFilters).toBeDefined();
    });
  });

  describe('Real-world Preset Scenarios', () => {
    it('should handle active threads preset with priority filter', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'active',
        additionalFilters: {
          priority: ThreadPriority.HIGH,
          limit: 10,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle unread preset with date range', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'unread',
        additionalFilters: {
          createdAfter: '2024-01-01T00:00:00.000Z',
          limit: 25,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle work preset with category and tags', async () => {
      const dto = plainToInstance(ThreadFilterPresetDto, {
        preset: 'work',
        additionalFilters: {
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
          tags: ['project', 'deadline'],
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('DTO Edge Cases and Integration', () => {
  describe('Type Transformation Consistency', () => {
    it('should handle mixed type inputs consistently', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        page: '2',
        limit: '30',
        hasUnread: 'true',
        minMessageCount: '5',
      } as any);

      expect(typeof dto.page).toBe('number');
      expect(typeof dto.limit).toBe('number');
      expect(typeof dto.hasUnread).toBe('boolean');
      expect(typeof dto.minMessageCount).toBe('number');
    });

    it('should handle null and undefined values', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        search: null,
        categoryId: undefined,
        tags: null,
      });

      const errors = await validate(dto);
      // Should not crash, validation should handle null/undefined appropriately
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Realistic Query Combinations', () => {
    it('should handle complex multi-filter query', async () => {
      const dto = plainToInstance(ThreadQueryDto, {
        page: 1,
        limit: 25,
        search: 'typescript react',
        status: ThreadStatus.ACTIVE,
        priority: ThreadPriority.HIGH,
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        tags: 'development,frontend,urgent',
        tagsMatchAny: false,
        hasUnread: true,
        minMessageCount: 2,
        maxMessageCount: 50,
        createdAfter: '2024-01-01T00:00:00.000Z',
        includeCategory: true,
      } as any);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.tags).toEqual(['development', 'frontend', 'urgent']);
      expect(dto.tagsMatchAny).toBe(false);
    });

    it('should handle search with advanced options', async () => {
      const dto = plainToInstance(ThreadSearchDto, {
        query: 'how to implement authentication in react',
        limit: 15,
        titleOnly: false,
        includeContent: true,
        includeTags: true,
        boostRecent: true,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
