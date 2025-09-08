import 'reflect-metadata';
import { z } from 'zod';
import {
  Deprecated,
  getToolHandler,
  getToolMetadata,
  getToolSchema,
  isTool,
  TOOL_HANDLER_KEY,
  TOOL_METADATA_KEY,
  TOOL_SCHEMA_KEY,
  TOOL_VERSION_KEY,
  ToolHandler,
  ToolSchema,
  ToolVersion,
  tool,
} from '../decorators/tool.decorator';

describe('Tool Decorators', () => {
  describe('@tool decorator', () => {
    it('should decorate a class with tool metadata', () => {
      @tool({
        name: 'test_tool',
        description: 'Test tool',
        version: '1.0.0',
        category: 'test',
        tags: ['test', 'example'],
      })
      class TestTool {}

      const metadata = getToolMetadata(TestTool);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('test_tool');
      expect(metadata?.description).toBe('Test tool');
      expect(metadata?.version).toBe('1.0.0');
      expect(metadata?.category).toBe('test');
      expect(metadata?.tags).toEqual(['test', 'example']);
    });

    it('should decorate a method with tool metadata', () => {
      class TestClass {
        @tool({
          name: 'method_tool',
          description: 'Method tool',
          version: '2.0.0',
        })
        testMethod() {
          return 'test';
        }
      }

      const instance = new TestClass();
      const metadata = getToolMetadata(Object.getPrototypeOf(instance), 'testMethod');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('method_tool');
      expect(metadata?.version).toBe('2.0.0');
    });

    it('should include schema in tool metadata', () => {
      const schema = z.object({
        input: z.string(),
        count: z.number(),
      });

      @tool({
        name: 'schema_tool',
        description: 'Tool with schema',
        schema,
      })
      class SchemaTool {}

      const retrievedSchema = getToolSchema(SchemaTool);
      expect(retrievedSchema).toBe(schema);
    });

    it('should include rate limit configuration', () => {
      @tool({
        name: 'rate_limited_tool',
        description: 'Rate limited tool',
        rateLimit: {
          maxRequests: 10,
          windowMs: 60000,
        },
      })
      class RateLimitedTool {}

      const metadata = getToolMetadata(RateLimitedTool);
      expect(metadata?.rateLimit).toBeDefined();
      expect(metadata?.rateLimit?.maxRequests).toBe(10);
      expect(metadata?.rateLimit?.windowMs).toBe(60000);
    });

    it('should include sandbox configuration', () => {
      @tool({
        name: 'sandboxed_tool',
        description: 'Sandboxed tool',
        sandbox: {
          enabled: true,
          dockerImage: 'node:18',
          resourceLimits: {
            memory: '512m',
            cpu: '0.5',
            timeout: 30000,
          },
          networkPolicy: 'restricted',
        },
      })
      class SandboxedTool {}

      const metadata = getToolMetadata(SandboxedTool);
      expect(metadata?.sandbox).toBeDefined();
      expect(metadata?.sandbox?.enabled).toBe(true);
      expect(metadata?.sandbox?.dockerImage).toBe('node:18');
      expect(metadata?.sandbox?.resourceLimits?.memory).toBe('512m');
    });

    it('should include permissions', () => {
      @tool({
        name: 'secure_tool',
        description: 'Secure tool',
        permissions: [
          {
            role: 'admin',
            actions: ['read', 'write', 'execute'],
          },
          {
            role: 'user',
            actions: ['read', 'execute'],
          },
        ],
      })
      class SecureTool {}

      const metadata = getToolMetadata(SecureTool);
      expect(metadata?.permissions).toBeDefined();
      expect(metadata?.permissions).toHaveLength(2);
      expect(metadata?.permissions?.[0].role).toBe('admin');
      expect(metadata?.permissions?.[1].actions).toEqual(['read', 'execute']);
    });
  });

  describe('@ToolVersion decorator', () => {
    it('should set version on a class', () => {
      @ToolVersion('2.1.0')
      class VersionedTool {}

      const version = Reflect.getMetadata(TOOL_VERSION_KEY, VersionedTool);
      expect(version).toBe('2.1.0');
    });

    it('should set version on a method', () => {
      class TestClass {
        @ToolVersion('3.0.0')
        versionedMethod() {}
      }

      const instance = new TestClass();
      const version = Reflect.getMetadata(TOOL_VERSION_KEY, Object.getPrototypeOf(instance), 'versionedMethod');
      expect(version).toBe('3.0.0');
    });
  });

  describe('@ToolHandler decorator', () => {
    it('should mark a method as the tool handler', () => {
      class TestTool {
        @ToolHandler()
        execute(input: any) {
          return input;
        }
      }

      const instance = new TestTool();
      const handler = getToolHandler(Object.getPrototypeOf(instance), 'execute');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  });

  describe('@ToolSchema decorator', () => {
    it('should attach schema to a class', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      @ToolSchema(schema)
      class SchemaClass {}

      const retrievedSchema = getToolSchema(SchemaClass);
      expect(retrievedSchema).toBe(schema);
    });

    it('should attach schema to a method', () => {
      const schema = z.object({
        id: z.string(),
      });

      class TestClass {
        @ToolSchema(schema)
        schemaMethod() {}
      }

      const instance = new TestClass();
      const retrievedSchema = getToolSchema(Object.getPrototypeOf(instance), 'schemaMethod');
      expect(retrievedSchema).toBe(schema);
    });
  });

  describe('@Deprecated decorator', () => {
    it('should mark a class as deprecated', () => {
      @Deprecated('Use new_tool instead')
      @tool({
        name: 'old_tool',
        description: 'Old tool',
      })
      class OldTool {}

      const metadata = getToolMetadata(OldTool);
      expect(metadata?.deprecated).toBe(true);
      expect(metadata?.deprecationMessage).toBe('Use new_tool instead');
    });

    it('should mark a method as deprecated', () => {
      class TestClass {
        @tool({
          name: 'old_method',
          description: 'Old method',
        })
        @Deprecated('This method is obsolete')
        oldMethod() {}
      }

      const instance = new TestClass();
      const metadata = getToolMetadata(Object.getPrototypeOf(instance), 'oldMethod');
      expect(metadata?.deprecated).toBe(true);
      expect(metadata?.deprecationMessage).toBe('This method is obsolete');
    });

    it('should work without a deprecation message', () => {
      @tool({
        name: 'deprecated_tool',
        description: 'Deprecated tool',
      })
      @Deprecated()
      class DeprecatedTool {}

      const metadata = getToolMetadata(DeprecatedTool);
      expect(metadata?.deprecated).toBe(true);
      expect(metadata?.deprecationMessage).toBeUndefined();
    });
  });

  describe('isTool helper', () => {
    it('should return true for decorated classes', () => {
      @tool({
        name: 'decorated',
        description: 'Decorated tool',
      })
      class DecoratedTool {}

      expect(isTool(DecoratedTool)).toBe(true);
    });

    it('should return false for non-decorated classes', () => {
      class RegularClass {}
      expect(isTool(RegularClass)).toBe(false);
    });

    it('should return true for decorated methods', () => {
      class TestClass {
        @tool({
          name: 'decorated_method',
          description: 'Decorated method',
        })
        decoratedMethod() {}

        regularMethod() {}
      }

      const instance = new TestClass();
      const prototype = Object.getPrototypeOf(instance);

      expect(isTool(prototype, 'decoratedMethod')).toBe(true);
      expect(isTool(prototype, 'regularMethod')).toBe(false);
    });
  });

  describe('Combined decorators', () => {
    it('should work with multiple decorators on a class', () => {
      const schema = z.object({
        message: z.string(),
      });

      @tool({
        name: 'multi_decorated',
        description: 'Multi-decorated tool',
      })
      @ToolVersion('1.5.0')
      @ToolSchema(schema)
      @Deprecated('Will be removed in v2.0.0')
      class MultiDecoratedTool {
        @ToolHandler()
        execute(input: any) {
          return input;
        }
      }

      const metadata = getToolMetadata(MultiDecoratedTool);
      const retrievedSchema = getToolSchema(MultiDecoratedTool);
      const version = Reflect.getMetadata(TOOL_VERSION_KEY, MultiDecoratedTool);

      expect(metadata?.name).toBe('multi_decorated');
      expect(metadata?.deprecated).toBe(true);
      expect(metadata?.deprecationMessage).toBe('Will be removed in v2.0.0');
      expect(retrievedSchema).toBe(schema);
      expect(version).toBe('1.5.0');
    });

    it('should work with multiple decorators on methods', () => {
      const schema1 = z.object({ a: z.number() });
      const schema2 = z.object({ b: z.string() });

      class MultiMethodClass {
        @tool({
          name: 'method1',
          description: 'First method',
        })
        @ToolSchema(schema1)
        @ToolVersion('1.0.0')
        method1(input: any) {
          return input;
        }

        @tool({
          name: 'method2',
          description: 'Second method',
        })
        @ToolSchema(schema2)
        @ToolVersion('2.0.0')
        @Deprecated('Use method1 instead')
        method2(input: any) {
          return input;
        }
      }

      const instance = new MultiMethodClass();
      const prototype = Object.getPrototypeOf(instance);

      const metadata1 = getToolMetadata(prototype, 'method1');
      const schema1Retrieved = getToolSchema(prototype, 'method1');
      const version1 = Reflect.getMetadata(TOOL_VERSION_KEY, prototype, 'method1');

      expect(metadata1?.name).toBe('method1');
      expect(schema1Retrieved).toBe(schema1);
      expect(version1).toBe('1.0.0');

      const metadata2 = getToolMetadata(prototype, 'method2');
      const schema2Retrieved = getToolSchema(prototype, 'method2');
      const version2 = Reflect.getMetadata(TOOL_VERSION_KEY, prototype, 'method2');

      expect(metadata2?.name).toBe('method2');
      expect(metadata2?.deprecated).toBe(true);
      expect(schema2Retrieved).toBe(schema2);
      expect(version2).toBe('2.0.0');
    });
  });

  describe('Edge cases', () => {
    it('should handle tools without schemas', () => {
      @tool({
        name: 'no_schema',
        description: 'Tool without schema',
      })
      class NoSchemaTool {}

      const schema = getToolSchema(NoSchemaTool);
      expect(schema).toBeUndefined();
    });

    it('should use default version if not specified', () => {
      @tool({
        name: 'default_version',
        description: 'Tool with default version',
      })
      class DefaultVersionTool {}

      const metadata = getToolMetadata(DefaultVersionTool);
      expect(metadata?.version).toBe('1.0.0');
    });

    it('should handle empty tags array', () => {
      @tool({
        name: 'empty_tags',
        description: 'Tool with empty tags',
        tags: [],
      })
      class EmptyTagsTool {}

      const metadata = getToolMetadata(EmptyTagsTool);
      expect(metadata?.tags).toEqual([]);
    });

    it('should preserve metadata dates', () => {
      @tool({
        name: 'dated_tool',
        description: 'Tool with dates',
      })
      class DatedTool {}

      const metadata = getToolMetadata(DatedTool);
      expect(metadata?.createdAt).toBeInstanceOf(Date);
      expect(metadata?.updatedAt).toBeInstanceOf(Date);
    });
  });
});
