import { DynamicStructuredTool } from '@langchain/core/tools';
import { DiscoveryService } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';
import type { ToolMetadata, ToolRegistration } from '../interfaces/tool-registry.interface';
import { ToolDiscoveryService } from '../services/tool-discovery.service';
import { ToolRegistryService } from '../services/tool-registry.service';

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let discoveryService: ToolDiscoveryService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ToolRegistryService,
        ToolDiscoveryService,
        {
          provide: DiscoveryService,
          useValue: {
            getProviders: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: 'ModulesContainer',
          useValue: new Map(),
        },
      ],
    }).compile();

    service = module.get<ToolRegistryService>(ToolRegistryService);
    discoveryService = module.get<ToolDiscoveryService>(ToolDiscoveryService);
  });

  afterEach(() => {
    service.clear();
  });

  describe('register', () => {
    it('should register a tool successfully', () => {
      const tool = new DynamicStructuredTool({
        name: 'test_tool',
        description: 'Test tool',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      const metadata: ToolMetadata = {
        name: 'test_tool',
        version: '1.0.0',
        description: 'Test tool',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const registration: ToolRegistration = {
        tool,
        metadata,
      };

      service.register(registration);
      expect(service.isRegistered('test_tool')).toBe(true);
    });

    it('should handle multiple versions of the same tool', () => {
      const tool1 = new DynamicStructuredTool({
        name: 'versioned_tool',
        description: 'Version 1',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      const tool2 = new DynamicStructuredTool({
        name: 'versioned_tool',
        description: 'Version 2',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      service.register({
        tool: tool1,
        metadata: {
          name: 'versioned_tool',
          version: '1.0.0',
          description: 'Version 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: tool2,
        metadata: {
          name: 'versioned_tool',
          version: '2.0.0',
          description: 'Version 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(service.isRegistered('versioned_tool', '1.0.0')).toBe(true);
      expect(service.isRegistered('versioned_tool', '2.0.0')).toBe(true);
      expect(service.getVersions('versioned_tool')).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a tool', () => {
      const tool = new DynamicStructuredTool({
        name: 'removable_tool',
        description: 'Tool to remove',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      service.register({
        tool,
        metadata: {
          name: 'removable_tool',
          version: '1.0.0',
          description: 'Tool to remove',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(service.isRegistered('removable_tool')).toBe(true);

      const result = service.unregister('removable_tool');
      expect(result).toBe(true);
      expect(service.isRegistered('removable_tool')).toBe(false);
    });

    it('should return false when unregistering non-existent tool', () => {
      const result = service.unregister('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve a registered tool', () => {
      const tool = new DynamicStructuredTool({
        name: 'retrievable_tool',
        description: 'Tool to retrieve',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      const metadata: ToolMetadata = {
        name: 'retrievable_tool',
        version: '1.0.0',
        description: 'Tool to retrieve',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.register({ tool, metadata });

      const retrieved = service.get('retrievable_tool');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.metadata.name).toBe('retrievable_tool');
    });

    it('should return null for non-existent tool', () => {
      const retrieved = service.get('non_existent');
      expect(retrieved).toBeNull();
    });

    it('should retrieve specific version of a tool', () => {
      const tool1 = new DynamicStructuredTool({
        name: 'multi_version',
        description: 'Version 1',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      const tool2 = new DynamicStructuredTool({
        name: 'multi_version',
        description: 'Version 2',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify(input),
      });

      service.register({
        tool: tool1,
        metadata: {
          name: 'multi_version',
          version: '1.0.0',
          description: 'Version 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: tool2,
        metadata: {
          name: 'multi_version',
          version: '2.0.0',
          description: 'Version 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const v1 = service.get('multi_version', '1.0.0');
      const v2 = service.get('multi_version', '2.0.0');

      expect(v1?.metadata.version).toBe('1.0.0');
      expect(v2?.metadata.version).toBe('2.0.0');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // Register multiple tools for searching
      service.register({
        tool: new DynamicStructuredTool({
          name: 'math_add',
          description: 'Addition',
          schema: z.object({ a: z.number(), b: z.number() }),
          func: async ({ a, b }) => JSON.stringify({ result: a + b }),
        }),
        metadata: {
          name: 'math_add',
          version: '1.0.0',
          description: 'Addition',
          category: 'math',
          tags: ['arithmetic', 'basic'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: new DynamicStructuredTool({
          name: 'math_multiply',
          description: 'Multiplication',
          schema: z.object({ a: z.number(), b: z.number() }),
          func: async ({ a, b }) => JSON.stringify({ result: a * b }),
        }),
        metadata: {
          name: 'math_multiply',
          version: '1.0.0',
          description: 'Multiplication',
          category: 'math',
          tags: ['arithmetic', 'basic'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: new DynamicStructuredTool({
          name: 'string_concat',
          description: 'String concatenation',
          schema: z.object({ a: z.string(), b: z.string() }),
          func: async ({ a, b }) => JSON.stringify({ result: a + b }),
        }),
        metadata: {
          name: 'string_concat',
          version: '1.0.0',
          description: 'String concatenation',
          category: 'string',
          tags: ['text', 'manipulation'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: new DynamicStructuredTool({
          name: 'deprecated_tool',
          description: 'Deprecated tool',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: 'deprecated_tool',
          version: '1.0.0',
          description: 'Deprecated tool',
          category: 'legacy',
          deprecated: true,
          deprecationMessage: 'Use new_tool instead',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    it('should search by category', () => {
      const results = service.search({ category: 'math' });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.category === 'math')).toBe(true);
    });

    it('should search by tags', () => {
      const results = service.search({ tags: ['arithmetic'] });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.tags?.includes('arithmetic'))).toBe(true);
    });

    it('should search by name pattern', () => {
      const results = service.search({ name: 'math' });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.name.includes('math'))).toBe(true);
    });

    it('should search for deprecated tools', () => {
      const results = service.search({ deprecated: true });
      expect(results).toHaveLength(1);
      expect(results[0].metadata.name).toBe('deprecated_tool');
    });

    it('should search for non-deprecated tools', () => {
      const results = service.search({ deprecated: false });
      expect(results).toHaveLength(3);
      expect(results.every((r) => !r.metadata.deprecated)).toBe(true);
    });

    it('should combine multiple search criteria', () => {
      const results = service.search({
        category: 'math',
        tags: ['basic'],
      });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.category === 'math' && r.metadata.tags?.includes('basic'))).toBe(true);
    });
  });

  describe('validateTool', () => {
    it('should validate a correct tool registration', () => {
      const registration: ToolRegistration = {
        tool: new DynamicStructuredTool({
          name: 'valid_tool',
          description: 'Valid tool',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: 'valid_tool',
          version: '1.0.0',
          description: 'Valid tool',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        schema: z.object({ input: z.string() }),
      };

      const result = service.validateTool(registration);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect missing required fields', () => {
      const registration: ToolRegistration = {
        tool: new DynamicStructuredTool({
          name: 'invalid_tool',
          description: '',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: '',
          version: '',
          description: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = service.validateTool(registration);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool name is required');
      expect(result.errors).toContain('Tool description is required');
      expect(result.errors).toContain('Tool version is required');
    });

    it('should provide warnings and suggestions', () => {
      const registration: ToolRegistration = {
        tool: new DynamicStructuredTool({
          name: 'minimal_tool',
          description: 'Minimal tool',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: 'minimal_tool',
          version: 'v1',
          description: 'Minimal tool',
          deprecated: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = service.validateTool(registration);
      expect(result.warnings).toContain('Version should follow semantic versioning (e.g., 1.0.0)');
      expect(result.warnings).toContain('Deprecated tools should include a deprecation message');
      expect(result.suggestions).toContain('Consider adding permission controls for security');
      expect(result.suggestions).toContain('Consider adding rate limiting for resource protection');
    });
  });

  describe('metrics', () => {
    it('should track tool execution metrics', async () => {
      const tool = new DynamicStructuredTool({
        name: 'metrics_tool',
        description: 'Tool for metrics',
        schema: z.object({ input: z.string() }),
        func: async (input) => JSON.stringify({ result: 'success' }),
      });

      service.register({
        tool,
        metadata: {
          name: 'metrics_tool',
          version: '1.0.0',
          description: 'Tool for metrics',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        handler: {
          execute: async (input) => ({ result: 'success' }),
        },
      });

      // Get the tool and execute it
      const registration = service.get('metrics_tool');
      expect(registration).not.toBeNull();

      // Execute the tool multiple times
      await registration!.tool.invoke({ input: 'test' });
      await registration!.tool.invoke({ input: 'test' });
      await registration!.tool.invoke({ input: 'test' });

      const metrics = service.getMetrics('metrics_tool');
      expect(metrics).not.toBeNull();
      expect(metrics!.executions).toBe(3);
      expect(metrics!.successCount).toBe(3);
      expect(metrics!.errorCount).toBe(0);
    });

    it('should track error metrics', async () => {
      const tool = new DynamicStructuredTool({
        name: 'error_tool',
        description: 'Tool that errors',
        schema: z.object({ input: z.string() }),
        func: async (input) => {
          throw new Error('Test error');
        },
      });

      service.register({
        tool,
        metadata: {
          name: 'error_tool',
          version: '1.0.0',
          description: 'Tool that errors',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        handler: {
          execute: async () => {
            throw new Error('Test error');
          },
        },
      });

      const registration = service.get('error_tool');
      expect(registration).not.toBeNull();

      // Try to execute and expect error
      try {
        await registration!.tool.invoke({ input: 'test' });
      } catch (error) {
        // Expected
      }

      const metrics = service.getMetrics('error_tool');
      expect(metrics).not.toBeNull();
      expect(metrics!.executions).toBe(1);
      expect(metrics!.errorCount).toBe(1);
      expect(metrics!.errorRate).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all registered tools', () => {
      service.register({
        tool: new DynamicStructuredTool({
          name: 'tool1',
          description: 'Tool 1',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: 'tool1',
          version: '1.0.0',
          description: 'Tool 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      service.register({
        tool: new DynamicStructuredTool({
          name: 'tool2',
          description: 'Tool 2',
          schema: z.object({ input: z.string() }),
          func: async (input) => JSON.stringify(input),
        }),
        metadata: {
          name: 'tool2',
          version: '1.0.0',
          description: 'Tool 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(service.getAll().size).toBe(2);

      service.clear();

      expect(service.getAll().size).toBe(0);
      expect(service.isRegistered('tool1')).toBe(false);
      expect(service.isRegistered('tool2')).toBe(false);
    });
  });
});
