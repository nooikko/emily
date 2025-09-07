import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ThreadPriority } from '../../entities/conversation-thread.entity';
import { AutoCreateThreadDto, CreateThreadDto } from '../create-thread.dto';

describe('CreateThreadDto', () => {
  describe('Validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: 'Valid Thread Title',
        summary: 'A valid summary',
        priority: ThreadPriority.HIGH,
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        tags: ['tag1', 'tag2'],
        metadata: { source: 'api' },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with minimal required data', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: 'Required Title Only',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    describe('title validation', () => {
      it('should fail validation with empty title', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: '',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('isNotEmpty');
      });

      it('should fail validation with non-string title', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 123,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should fail validation with title exceeding max length', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'a'.repeat(256), // Exceeds 255 char limit
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('title');
        expect(errors[0].constraints).toHaveProperty('maxLength');
      });

      it('should pass validation with title at max length', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'a'.repeat(255), // Exactly 255 chars
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('summary validation', () => {
      it('should pass validation with valid summary', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          summary: 'A valid summary',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should pass validation with no summary', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with non-string summary', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          summary: 123,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('summary');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should fail validation with summary exceeding max length', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          summary: 'a'.repeat(1001), // Exceeds 1000 char limit
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('summary');
        expect(errors[0].constraints).toHaveProperty('maxLength');
      });
    });

    describe('priority validation', () => {
      it('should pass validation with valid priority', async () => {
        const priorities = [ThreadPriority.LOW, ThreadPriority.NORMAL, ThreadPriority.HIGH, ThreadPriority.URGENT];

        for (const priority of priorities) {
          const dto = plainToInstance(CreateThreadDto, {
            title: 'Test Title',
            priority,
          });

          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        }
      });

      it('should fail validation with invalid priority', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          priority: 'invalid-priority' as any,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('priority');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });
    });

    describe('categoryId validation', () => {
      it('should pass validation with valid UUID', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with invalid UUID', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          categoryId: 'not-a-uuid',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('categoryId');
        expect(errors[0].constraints).toHaveProperty('isUuid');
      });
    });

    describe('tags validation', () => {
      it('should pass validation with valid string array', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          tags: ['tag1', 'tag2', 'tag3'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should pass validation with empty array', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          tags: [],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with non-array tags', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          tags: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isArray');
      });

      it('should fail validation with non-string elements in array', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          tags: ['valid-tag', 123, 'another-valid-tag'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isString');
      });
    });

    describe('metadata validation', () => {
      it('should pass validation with valid metadata object', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          metadata: {
            source: 'api',
            language: 'en',
            model: 'gpt-4',
            context: { key: 'value' },
          },
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should pass validation with empty metadata object', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
          metadata: {},
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should pass validation with no metadata', async () => {
        const dto = plainToInstance(CreateThreadDto, {
          title: 'Test Title',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in title', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: 'Special chars: äöü 🎉 @#$%^&*()',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle unicode characters', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: 'Unicode: 你好世界 🌍',
        tags: ['中文', 'unicode'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle whitespace in title', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: '   Whitespace Title   ',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject whitespace-only title', async () => {
      const dto = plainToInstance(CreateThreadDto, {
        title: '   ',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('title');
      expect(errors[0].constraints).toHaveProperty('isNotEmpty');
    });
  });
});

describe('AutoCreateThreadDto', () => {
  describe('Validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Hello, can you help me with TypeScript?',
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        source: 'api',
        tags: ['question', 'typescript'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with minimal required data', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Hello, world!',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    describe('initialContent validation', () => {
      it('should fail validation with empty initialContent', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: '',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('initialContent');
        expect(errors[0].constraints).toHaveProperty('isNotEmpty');
      });

      it('should fail validation with non-string initialContent', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 123,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('initialContent');
        expect(errors[0].constraints).toHaveProperty('isString');
      });

      it('should pass validation with very long content', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'a'.repeat(10000),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('categoryId validation', () => {
      it('should pass validation with valid UUID', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          categoryId: '123e4567-e89b-12d3-a456-426614174000',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with invalid UUID', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          categoryId: 'not-a-uuid',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('categoryId');
        expect(errors[0].constraints).toHaveProperty('isUuid');
      });
    });

    describe('source validation', () => {
      it('should pass validation with valid source', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          source: 'web',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with source exceeding max length', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          source: 'a'.repeat(51),
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('source');
        expect(errors[0].constraints).toHaveProperty('maxLength');
      });
    });

    describe('tags validation', () => {
      it('should pass validation with valid tags array', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          tags: ['question', 'help', 'typescript'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should fail validation with non-array tags', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          tags: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isArray');
      });

      it('should fail validation with non-string elements in tags', async () => {
        const dto = plainToInstance(AutoCreateThreadDto, {
          initialContent: 'Test content',
          tags: ['valid', 123, 'also-valid'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('tags');
        expect(errors[0].constraints).toHaveProperty('isString');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiline initial content', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Line 1\nLine 2\nLine 3',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle content with special characters', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Special chars: <>&"\'`@#$%^&*()',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle unicode content', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Unicode content: 你好世界 🌍 émojis 🎉',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject whitespace-only content', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: '   \n\t   ',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('initialContent');
      expect(errors[0].constraints).toHaveProperty('isNotEmpty');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical question format', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'Can you help me understand how to use async/await in TypeScript?',
        source: 'web',
        tags: ['typescript', 'async', 'question'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle code snippet in content', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: `I'm having trouble with this TypeScript code:
          
          async function fetchData() {
            const response = await fetch('/api/data');
            return response.json();
          }
          
          Can you help me add error handling?`,
        tags: ['typescript', 'error-handling', 'async'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle API-generated content', async () => {
      const dto = plainToInstance(AutoCreateThreadDto, {
        initialContent: 'User requesting help with React hooks implementation',
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        source: 'api',
        tags: ['react', 'hooks', 'auto-generated'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
