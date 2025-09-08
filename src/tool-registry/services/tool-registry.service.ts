import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef, DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  ToolRegistry,
  ToolRegistration,
  ToolMetadata,
  ToolSearchQuery,
  ToolVersion,
  ToolDiscoveryOptions,
  ToolValidationResult,
  ToolExecutionContext,
  ToolMetrics,
} from '../interfaces/tool-registry.interface';
import {
  getToolMetadata,
  getToolSchema,
  getToolHandler,
  isTool,
  TOOL_METADATA_KEY,
  TOOL_SCHEMA_KEY,
  TOOL_HANDLER_KEY,
} from '../decorators/tool.decorator';

@Injectable()
export class ToolRegistryService implements ToolRegistry, OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, ToolRegistration>();
  private readonly toolVersions = new Map<string, ToolVersion[]>();
  private readonly toolMetrics = new Map<string, ToolMetrics>();
  
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly discoveryService: DiscoveryService,
  ) {}

  async onModuleInit() {
    // Automatically discover and register tools on startup
    await this.discoverTools();
  }

  /**
   * Register a tool with the registry
   */
  register(registration: ToolRegistration): void {
    const { tool, metadata } = registration;
    const toolKey = this.getToolKey(metadata.name, metadata.version);
    
    // Check if tool already exists
    if (this.tools.has(toolKey)) {
      this.logger.warn(`Tool ${toolKey} is already registered. Overwriting.`);
    }
    
    // Store the tool
    this.tools.set(toolKey, registration);
    
    // Update version history
    this.addVersion(metadata.name, {
      version: metadata.version,
      tool,
      metadata,
      createdAt: new Date(),
    });
    
    // Initialize metrics
    if (!this.toolMetrics.has(metadata.name)) {
      this.toolMetrics.set(metadata.name, {
        name: metadata.name,
        version: metadata.version,
        executions: 0,
        successCount: 0,
        errorCount: 0,
        averageExecutionTime: 0,
        errorRate: 0,
        throughput: 0,
      });
    }
    
    this.logger.log(`Registered tool: ${metadata.name} v${metadata.version}`);
  }

  /**
   * Unregister a tool from the registry
   */
  unregister(name: string, version?: string): boolean {
    const toolKey = version ? this.getToolKey(name, version) : this.findLatestToolKey(name);
    
    if (!toolKey) {
      return false;
    }
    
    const deleted = this.tools.delete(toolKey);
    
    if (deleted) {
      this.logger.log(`Unregistered tool: ${toolKey}`);
      
      // Clean up version history if no versions remain
      if (version) {
        const versions = this.toolVersions.get(name);
        if (versions) {
          const filtered = versions.filter(v => v.version !== version);
          if (filtered.length === 0) {
            this.toolVersions.delete(name);
            this.toolMetrics.delete(name);
          } else {
            this.toolVersions.set(name, filtered);
          }
        }
      }
    }
    
    return deleted;
  }

  /**
   * Get a specific tool by name and optional version
   */
  get(name: string, version?: string): ToolRegistration | null {
    const toolKey = version ? this.getToolKey(name, version) : this.findLatestToolKey(name);
    
    if (!toolKey) {
      return null;
    }
    
    return this.tools.get(toolKey) || null;
  }

  /**
   * Get all registered tools
   */
  getAll(): Map<string, ToolRegistration> {
    return new Map(this.tools);
  }

  /**
   * Search for tools matching specific criteria
   */
  search(query: ToolSearchQuery): ToolRegistration[] {
    const results: ToolRegistration[] = [];
    
    for (const [_, registration] of this.tools) {
      const { metadata } = registration;
      
      // Check name
      if (query.name && !metadata.name.includes(query.name)) {
        continue;
      }
      
      // Check category
      if (query.category && metadata.category !== query.category) {
        continue;
      }
      
      // Check tags
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(tag => 
          metadata.tags?.includes(tag)
        );
        if (!hasAllTags) {
          continue;
        }
      }
      
      // Check version
      if (query.version && metadata.version !== query.version) {
        continue;
      }
      
      // Check deprecated status
      if (query.deprecated !== undefined && metadata.deprecated !== query.deprecated) {
        continue;
      }
      
      // Check permissions
      if (query.permissions && query.permissions.length > 0) {
        const hasRequiredPermissions = query.permissions.every(permission =>
          metadata.permissions?.some(p => p.role === permission)
        );
        if (!hasRequiredPermissions) {
          continue;
        }
      }
      
      results.push(registration);
    }
    
    return results;
  }

  /**
   * Get all versions of a specific tool
   */
  getVersions(name: string): ToolVersion[] {
    return this.toolVersions.get(name) || [];
  }

  /**
   * Check if a tool is registered
   */
  isRegistered(name: string, version?: string): boolean {
    if (version) {
      return this.tools.has(this.getToolKey(name, version));
    }
    
    // Check if any version exists
    for (const key of this.tools.keys()) {
      if (key.startsWith(`${name}@`)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.toolVersions.clear();
    this.toolMetrics.clear();
    this.logger.log('Cleared all registered tools');
  }

  /**
   * Discover and register tools automatically
   */
  async discoverTools(options?: ToolDiscoveryOptions): Promise<void> {
    this.logger.log('Starting automatic tool discovery...');
    
    // Discover from NestJS providers
    await this.discoverFromProviders();
    
    // Discover from file system if paths provided
    if (options?.paths) {
      await this.discoverFromFileSystem(options);
    }
  }

  /**
   * Discover tools from NestJS providers using decorators
   */
  private async discoverFromProviders(): Promise<void> {
    const providers = this.discoveryService.getProviders();
    
    for (const wrapper of providers) {
      if (!wrapper.metatype || !wrapper.instance) {
        continue;
      }
      
      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);
      
      // Check if class is decorated with @tool
      if (isTool(wrapper.metatype)) {
        this.registerClassTool(instance, wrapper.metatype);
      }
      
      // Check for method-level @tool decorators
      const methodNames = Object.getOwnPropertyNames(prototype);
      for (const methodName of methodNames) {
        if (methodName === 'constructor') continue;
        
        if (isTool(prototype, methodName)) {
          this.registerMethodTool(instance, prototype, methodName);
        }
      }
    }
  }

  /**
   * Register a class decorated with @tool
   */
  private registerClassTool(instance: any, metatype: any): void {
    const metadata = getToolMetadata(metatype);
    const schema = getToolSchema(metatype);
    
    if (!metadata) {
      return;
    }
    
    // Find the handler method (marked with @ToolHandler or default to 'execute')
    let handler: Function | undefined;
    const prototype = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(prototype);
    
    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;
      
      const methodHandler = getToolHandler(prototype, methodName);
      if (methodHandler) {
        handler = methodHandler.bind(instance);
        break;
      }
    }
    
    // Fallback to 'execute' method if exists
    if (!handler && typeof instance.execute === 'function') {
      handler = instance.execute.bind(instance);
    }
    
    if (!handler) {
      this.logger.warn(`Tool ${metadata.name} has no handler method`);
      return;
    }
    
    // Create LangChain tool
    const tool = this.createLangChainTool(metadata, schema, handler);
    
    this.register({
      tool,
      metadata,
      schema,
      handler: handler ? {
        execute: handler as (input: any, context?: ToolExecutionContext) => Promise<any>,
      } : undefined,
    });
  }

  /**
   * Register a method decorated with @tool
   */
  private registerMethodTool(instance: any, prototype: any, methodName: string): void {
    const metadata = getToolMetadata(prototype, methodName);
    const schema = getToolSchema(prototype, methodName);
    const handler = prototype[methodName].bind(instance);
    
    if (!metadata) {
      return;
    }
    
    // Create LangChain tool
    const tool = this.createLangChainTool(metadata, schema, handler);
    
    this.register({
      tool,
      metadata,
      schema,
      handler: handler ? {
        execute: handler as (input: any, context?: ToolExecutionContext) => Promise<any>,
      } : undefined,
    });
  }

  /**
   * Create a LangChain DynamicStructuredTool from metadata
   */
  private createLangChainTool(
    metadata: ToolMetadata,
    schema?: z.ZodSchema<any>,
    handler?: Function,
  ): StructuredToolInterface {
    // Use provided schema or create a default one
    const toolSchema = schema || z.object({
      input: z.any().describe('Tool input'),
    });
    
    return new DynamicStructuredTool({
      name: metadata.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      description: metadata.description,
      schema: toolSchema,
      func: async (input) => {
        // Track metrics
        const startTime = Date.now();
        const metrics = this.toolMetrics.get(metadata.name);
        
        try {
          // Check deprecation
          if (metadata.deprecated) {
            this.logger.warn(
              `Tool ${metadata.name} is deprecated: ${metadata.deprecationMessage || 'No message provided'}`
            );
          }
          
          // Execute handler
          const result = handler ? await handler(input) : input;
          
          // Update metrics
          if (metrics) {
            metrics.executions++;
            metrics.successCount++;
            metrics.lastExecuted = new Date();
            const executionTime = Date.now() - startTime;
            metrics.averageExecutionTime = 
              (metrics.averageExecutionTime * (metrics.executions - 1) + executionTime) / metrics.executions;
            metrics.errorRate = metrics.errorCount / metrics.executions;
            metrics.throughput = metrics.executions / ((Date.now() - metadata.createdAt.getTime()) / 1000);
          }
          
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          // Update error metrics
          if (metrics) {
            metrics.executions++;
            metrics.errorCount++;
            metrics.errorRate = metrics.errorCount / metrics.executions;
          }
          
          this.logger.error(`Tool ${metadata.name} execution failed:`, error);
          throw error;
        }
      },
    });
  }

  /**
   * Discover tools from file system
   */
  private async discoverFromFileSystem(options: ToolDiscoveryOptions): Promise<void> {
    const { paths = [], pattern = /\.tool\.[jt]s$/, recursive = true } = options;
    
    for (const searchPath of paths) {
      const files = await glob(
        recursive ? `${searchPath}/**/*` : `${searchPath}/*`,
        { nodir: true }
      );
      
      for (const file of files) {
        if (!pattern.test(file)) {
          continue;
        }
        
        try {
          // Dynamic import
          const module = await import(path.resolve(file));
          
          // Look for exported tools
          for (const key of Object.keys(module)) {
            const exported = module[key];
            
            if (exported && typeof exported === 'function' && isTool(exported)) {
              // Create instance if it's a class
              const instance = new exported();
              this.registerClassTool(instance, exported);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to load tool from ${file}:`, error);
        }
      }
    }
  }

  /**
   * Validate a tool registration
   */
  validateTool(registration: ToolRegistration): ToolValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    const { metadata, schema } = registration;
    
    // Validate required fields
    if (!metadata.name) {
      errors.push('Tool name is required');
    }
    
    if (!metadata.description) {
      errors.push('Tool description is required');
    }
    
    if (!metadata.version) {
      errors.push('Tool version is required');
    }
    
    // Validate version format
    if (metadata.version && !/^\d+\.\d+\.\d+/.test(metadata.version)) {
      warnings.push('Version should follow semantic versioning (e.g., 1.0.0)');
    }
    
    // Check for deprecation
    if (metadata.deprecated && !metadata.deprecationMessage) {
      warnings.push('Deprecated tools should include a deprecation message');
    }
    
    // Validate schema if provided
    if (schema) {
      try {
        // Try to parse an empty object to check if schema is valid
        schema.parse({});
      } catch (error) {
        // This is expected for required fields, but schema is valid
      }
    } else {
      suggestions.push('Consider adding a Zod schema for input validation');
    }
    
    // Check for permissions
    if (!metadata.permissions || metadata.permissions.length === 0) {
      suggestions.push('Consider adding permission controls for security');
    }
    
    // Check for rate limiting
    if (!metadata.rateLimit) {
      suggestions.push('Consider adding rate limiting for resource protection');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Get tool metrics
   */
  getMetrics(name: string): ToolMetrics | null {
    return this.toolMetrics.get(name) || null;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, ToolMetrics> {
    return new Map(this.toolMetrics);
  }

  /**
   * Helper to generate tool key
   */
  private getToolKey(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /**
   * Find the latest version key for a tool
   */
  private findLatestToolKey(name: string): string | null {
    const versions = this.getVersions(name);
    if (versions.length === 0) {
      return null;
    }
    
    // Sort versions and get latest
    const latest = versions.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
    
    return this.getToolKey(name, latest.version);
  }

  /**
   * Add a version to the history
   */
  private addVersion(name: string, version: ToolVersion): void {
    const versions = this.toolVersions.get(name) || [];
    
    // Check if version already exists
    const existingIndex = versions.findIndex(v => v.version === version.version);
    if (existingIndex >= 0) {
      versions[existingIndex] = version;
    } else {
      versions.push(version);
    }
    
    this.toolVersions.set(name, versions);
  }
}