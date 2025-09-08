import { z } from 'zod';
import { 
  StructuredToolBuilder, 
  BaseStructuredTool, 
  SchemaValidationUtils 
} from '../utils/structured-tool.builder';
import type { ToolExecutionContext } from '../interfaces/tool-registry.interface';

describe('StructuredToolBuilder', () => {
  describe('Builder Pattern', () => {
    it('should create a tool with all configurations', async () => {
      const schema = z.object({
        message: z.string(),
        count: z.number().optional(),
      });

      const tool = StructuredToolBuilder.create('test_tool')
        .withDescription('A test tool')
        .withSchema(schema)
        .withHandler(async (input) => {
          return { result: `Processed: ${input.message}`, count: input.count || 1 };
        })
        .withMetadata({
          version: '1.0.0',
          category: 'test',
          tags: ['test', 'example'],
        })
        .addValidator(async (input) => {
          return input.message.length > 0;
        })
        .addPreprocessor((input) => {
          // Trim whitespace from message
          if (input.message) {
            input.message = input.message.trim();
          }
          return input;
        })
        .addPostprocessor((result) => {
          // Add timestamp to result
          result.timestamp = Date.now();
          return result;
        })
        .build();

      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');

      // Test execution
      const result = await tool.invoke({ message: '  hello  ', count: 2 });
      const parsed = JSON.parse(result);
      
      expect(parsed.result).toBe('Processed: hello');
      expect(parsed.count).toBe(2);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should validate builder configuration', () => {
      const builder = new StructuredToolBuilder('incomplete_tool');
      
      const validation = builder.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Tool description is required');
      expect(validation.errors).toContain('Tool handler function is required');
    });

    it('should throw error when building invalid tool', () => {
      const builder = new StructuredToolBuilder('invalid_tool');
      
      expect(() => builder.build()).toThrow('Invalid tool configuration');
    });

    it('should handle schema validation errors', async () => {
      const schema = z.object({
        age: z.number().min(0).max(120),
      });

      const tool = StructuredToolBuilder.create('age_tool')
        .withDescription('Age validation tool')
        .withSchema(schema)
        .withHandler(async (input) => ({ valid: true, age: input.age }))
        .build();

      await expect(tool.invoke({ age: -5 })).rejects.toThrow();
      await expect(tool.invoke({ age: 150 })).rejects.toThrow();
    });

    it('should handle custom validation errors', async () => {
      const tool = StructuredToolBuilder.create('custom_validation')
        .withDescription('Tool with custom validation')
        .withSchema(z.object({ value: z.number() }))
        .withHandler(async (input) => ({ result: input.value }))
        .addValidator(async (input) => {
          // Custom validation: value must be even
          return input.value % 2 === 0;
        })
        .build();

      await expect(tool.invoke({ value: 3 })).rejects.toThrow('Custom validation failed');
      
      const result = await tool.invoke({ value: 4 });
      expect(JSON.parse(result).result).toBe(4);
    });

    it('should apply preprocessors in order', async () => {
      const tool = StructuredToolBuilder.create('preprocessor_tool')
        .withDescription('Tool with multiple preprocessors')
        .withSchema(z.object({ value: z.number() }))
        .withHandler(async (input) => ({ result: input.value }))
        .addPreprocessor((input) => {
          input.value = input.value * 2;
          return input;
        })
        .addPreprocessor((input) => {
          input.value = input.value + 10;
          return input;
        })
        .build();

      const result = await tool.invoke({ value: 5 });
      // 5 * 2 = 10, then 10 + 10 = 20
      expect(JSON.parse(result).result).toBe(20);
    });

    it('should handle errors with error handlers', async () => {
      let errorCaught: Error | null = null;

      const tool = StructuredToolBuilder.create('error_tool')
        .withDescription('Tool that handles errors')
        .withSchema(z.object({ shouldFail: z.boolean() }))
        .withHandler(async (input) => {
          if (input.shouldFail) {
            throw new Error('Intentional failure');
          }
          return { success: true };
        })
        .addErrorHandler((error) => {
          errorCaught = error;
        })
        .build();

      await expect(tool.invoke({ shouldFail: true })).rejects.toThrow('Intentional failure');
      expect(errorCaught).not.toBeNull();
      expect(errorCaught!.message).toBe('Intentional failure');
    });
  });

  describe('BaseStructuredTool', () => {
    class TestTool extends BaseStructuredTool<{ input: string }, { output: string }> {
      get name(): string {
        return 'base_test_tool';
      }

      get description(): string {
        return 'Test tool using base class';
      }

      get schema() {
        return z.object({
          input: z.string().min(1),
        });
      }

      protected async execute(input: { input: string }): Promise<{ output: string }> {
        return { output: input.input.toUpperCase() };
      }
    }

    it('should create tool from base class', async () => {
      const testTool = new TestTool();
      const langChainTool = testTool.toLangChainTool();

      expect(langChainTool.name).toBe('base_test_tool');
      expect(langChainTool.description).toBe('Test tool using base class');

      const result = await langChainTool.invoke({ input: 'hello' });
      expect(JSON.parse(result).output).toBe('HELLO');
    });

    it('should support validators in base class', async () => {
      const testTool = new TestTool();
      testTool.addValidator(async (input) => {
        return !input.input.includes('forbidden');
      });

      const langChainTool = testTool.toLangChainTool();

      await expect(langChainTool.invoke({ input: 'forbidden word' }))
        .rejects.toThrow('Validation failed');
      
      const result = await langChainTool.invoke({ input: 'allowed' });
      expect(JSON.parse(result).output).toBe('ALLOWED');
    });

    it('should support middleware in base class', async () => {
      const testTool = new TestTool();
      const executionLog: string[] = [];

      testTool.addMiddleware(async (input, next) => {
        executionLog.push('middleware1_before');
        const result = await next();
        executionLog.push('middleware1_after');
        return result;
      });

      testTool.addMiddleware(async (input, next) => {
        executionLog.push('middleware2_before');
        const result = await next();
        executionLog.push('middleware2_after');
        return result;
      });

      const langChainTool = testTool.toLangChainTool();
      await langChainTool.invoke({ input: 'test' });

      expect(executionLog).toEqual([
        'middleware1_before',
        'middleware2_before',
        'middleware2_after',
        'middleware1_after',
      ]);
    });

    it('should handle lifecycle hooks', async () => {
      const hooks: string[] = [];

      class HookedTool extends BaseStructuredTool<{ value: number }, { result: number }> {
        get name(): string { return 'hooked_tool'; }
        get description(): string { return 'Tool with hooks'; }
        get schema() { return z.object({ value: z.number() }); }

        protected async beforeExecute(input: { value: number }, context?: ToolExecutionContext): Promise<void> {
          hooks.push('before');
        }

        protected async execute(input: { value: number }): Promise<{ result: number }> {
          hooks.push('execute');
          return { result: input.value * 2 };
        }

        protected async afterExecute(result: { result: number }, context?: ToolExecutionContext): Promise<void> {
          hooks.push('after');
        }
      }

      const tool = new HookedTool();
      const langChainTool = tool.toLangChainTool();
      
      await langChainTool.invoke({ value: 5 });
      
      expect(hooks).toEqual(['before', 'execute', 'after']);
    });

    it('should handle metadata', () => {
      const testTool = new TestTool();
      testTool.setMetadata({
        version: '2.0.0',
        author: 'Test Author',
        tags: ['test', 'example'],
      });

      const metadata = testTool.getMetadata();
      expect(metadata.version).toBe('2.0.0');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.tags).toEqual(['test', 'example']);
    });
  });

  describe('SchemaValidationUtils', () => {
    it('should create strict schemas', () => {
      const schema = SchemaValidationUtils.strictObject({
        name: z.string(),
        age: z.number(),
      });

      expect(() => schema.parse({ name: 'John', age: 30 })).not.toThrow();
      expect(() => schema.parse({ name: 'John', age: 30, extra: 'field' })).toThrow();
    });

    it('should add defaults to schemas', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
      });

      const withDefaults = SchemaValidationUtils.withDefaults(schema, {
        age: 25,
        active: true,
      });

      const result = withDefaults.parse({ name: 'John' });
      expect(result.age).toBe(25);
      expect(result.active).toBe(true);
    });

    it('should create coercive schemas', () => {
      const stringSchema = SchemaValidationUtils.coercive.string();
      expect(stringSchema.parse(123)).toBe('123');
      expect(stringSchema.parse('hello')).toBe('hello');

      const numberSchema = SchemaValidationUtils.coercive.number();
      expect(numberSchema.parse('42')).toBe(42);
      expect(numberSchema.parse(42)).toBe(42);

      const booleanSchema = SchemaValidationUtils.coercive.boolean();
      expect(booleanSchema.parse('true')).toBe(true);
      expect(booleanSchema.parse('false')).toBe(false);
      expect(booleanSchema.parse('1')).toBe(true);
      expect(booleanSchema.parse('yes')).toBe(true);
      expect(booleanSchema.parse(true)).toBe(true);

      const dateSchema = SchemaValidationUtils.coercive.date();
      const date = new Date('2024-01-01');
      expect(dateSchema.parse('2024-01-01')).toEqual(date);
      expect(dateSchema.parse(date)).toEqual(date);
    });

    it('should validate with detailed errors', async () => {
      const schema = z.object({
        name: z.string().min(2),
        age: z.number().min(0).max(120),
        email: z.string().email(),
      });

      const result1 = await SchemaValidationUtils.validateWithDetails(schema, {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      });

      expect(result1.success).toBe(true);
      expect(result1.data).toEqual({
        name: 'John',
        age: 30,
        email: 'john@example.com',
      });

      const result2 = await SchemaValidationUtils.validateWithDetails(schema, {
        name: 'J',
        age: 150,
        email: 'invalid',
      });

      expect(result2.success).toBe(false);
      expect(result2.errors).toBeDefined();
      expect(result2.errors?.length).toBeGreaterThan(0);
      expect(result2.errors?.some(e => e.path === 'name')).toBe(true);
      expect(result2.errors?.some(e => e.path === 'age')).toBe(true);
      expect(result2.errors?.some(e => e.path === 'email')).toBe(true);
    });
  });
});