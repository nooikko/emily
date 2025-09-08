import { Injectable, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import * as path from 'path';
import { getToolMetadata, isTool } from '../decorators/tool.decorator';
import type { ToolDiscoveryOptions, ToolMetadata } from '../interfaces/tool-registry.interface';

@Injectable()
export class ToolDiscoveryService {
  private readonly logger = new Logger(ToolDiscoveryService.name);
  private discoveredTools = new Map<string, DiscoveredTool>();

  constructor(private readonly modulesContainer: ModulesContainer) {}

  /**
   * Discover all tools in the application
   */
  async discoverAll(options?: ToolDiscoveryOptions): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    // Discover from NestJS modules
    const moduleTools = await this.discoverFromModules();
    tools.push(...moduleTools);

    // Discover from file system if paths provided
    if (options?.paths && options.paths.length > 0) {
      const fileTools = await this.discoverFromFiles(options);
      tools.push(...fileTools);
    }

    // Cache discovered tools
    tools.forEach((tool) => {
      this.discoveredTools.set(tool.metadata.name, tool);
    });

    this.logger.log(`Discovered ${tools.length} tools`);
    return tools;
  }

  /**
   * Discover tools from NestJS modules
   */
  private async discoverFromModules(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    for (const [, module] of this.modulesContainer.entries()) {
      for (const [, wrapper] of module.providers) {
        const discovered = await this.discoverFromProvider(wrapper);
        tools.push(...discovered);
      }
    }

    return tools;
  }

  /**
   * Discover tools from a single provider
   */
  private async discoverFromProvider(wrapper: InstanceWrapper): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    if (!wrapper.instance || !wrapper.metatype) {
      return tools;
    }

    const instance = wrapper.instance;
    const constructor = wrapper.metatype;

    // Check class-level @tool decorator
    if (isTool(constructor)) {
      const metadata = getToolMetadata(constructor);
      if (metadata) {
        tools.push({
          type: 'class',
          metadata,
          target: constructor,
          instance,
          location: {
            module: wrapper.host?.name || 'Unknown',
            provider: constructor.name,
          },
        });
      }
    }

    // Check method-level @tool decorators
    const prototype = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      if (isTool(prototype, methodName)) {
        const metadata = getToolMetadata(prototype, methodName);
        if (metadata) {
          tools.push({
            type: 'method',
            metadata,
            target: prototype,
            instance,
            methodName,
            location: {
              module: wrapper.host?.name || 'Unknown',
              provider: constructor.name,
              method: methodName,
            },
          });
        }
      }
    }

    return tools;
  }

  /**
   * Discover tools from file system
   */
  private async discoverFromFiles(options: ToolDiscoveryOptions): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];
    const { paths = [], pattern = /\.tool\.[jt]s$/, recursive = true } = options;

    for (const searchPath of paths) {
      try {
        const fileTools = await this.discoverFromPath(searchPath, pattern, recursive);
        tools.push(...fileTools);
      } catch (error) {
        this.logger.error(`Failed to discover tools from path ${searchPath}:`, error);
      }
    }

    return tools;
  }

  /**
   * Discover tools from a specific path
   */
  private async discoverFromPath(searchPath: string, pattern: RegExp, recursive: boolean): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    // Resolve absolute path
    const absolutePath = path.resolve(searchPath);

    // Check if path exists
    try {
      await fs.access(absolutePath);
    } catch {
      this.logger.warn(`Path does not exist: ${absolutePath}`);
      return tools;
    }

    // Find matching files
    const globPattern = recursive ? `${absolutePath}/**/*` : `${absolutePath}/*`;
    const files = await glob(globPattern, { nodir: true });

    for (const file of files) {
      if (!pattern.test(file)) {
        continue;
      }

      try {
        const fileTools = await this.loadToolsFromFile(file);
        tools.push(...fileTools);
      } catch (error) {
        this.logger.error(`Failed to load tools from ${file}:`, error);
      }
    }

    return tools;
  }

  /**
   * Load tools from a specific file
   */
  private async loadToolsFromFile(filePath: string): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    // Dynamic import
    const module = await import(filePath);

    // Check all exports
    for (const [exportName, exported] of Object.entries(module)) {
      if (!exported) continue;

      // Check if it's a class with @tool decorator
      if (typeof exported === 'function' && isTool(exported)) {
        const metadata = getToolMetadata(exported);
        if (metadata) {
          tools.push({
            type: 'class',
            metadata,
            target: exported,
            location: {
              file: filePath,
              export: exportName,
            },
          });
        }
      }

      // Check if it's an object with tool methods
      if (typeof exported === 'object' && !Array.isArray(exported)) {
        const prototype = Object.getPrototypeOf(exported);
        const methodNames = Object.getOwnPropertyNames(prototype);

        for (const methodName of methodNames) {
          if (methodName === 'constructor') continue;

          if (isTool(prototype, methodName)) {
            const metadata = getToolMetadata(prototype, methodName);
            if (metadata) {
              tools.push({
                type: 'method',
                metadata,
                target: prototype,
                instance: exported,
                methodName,
                location: {
                  file: filePath,
                  export: exportName,
                  method: methodName,
                },
              });
            }
          }
        }
      }
    }

    return tools;
  }

  /**
   * Get a discovered tool by name
   */
  getDiscoveredTool(name: string): DiscoveredTool | undefined {
    return this.discoveredTools.get(name);
  }

  /**
   * Get all discovered tools
   */
  getAllDiscoveredTools(): DiscoveredTool[] {
    return Array.from(this.discoveredTools.values());
  }

  /**
   * Clear discovered tools cache
   */
  clearCache(): void {
    this.discoveredTools.clear();
  }

  /**
   * Watch for tool changes in file system
   * Note: Requires chokidar to be installed separately
   */
  async watchForChanges(paths: string[], callback: (tools: DiscoveredTool[]) => void): Promise<void> {
    try {
      // Dynamic import to make it optional
      const chokidar = await import('chokidar' as any);

      const watcher = chokidar.watch(paths, {
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on('add', async (filePath: string) => {
        if (/\.tool\.[jt]s$/.test(filePath)) {
          const tools = await this.loadToolsFromFile(filePath);
          callback(tools);
        }
      });

      watcher.on('change', async (filePath: string) => {
        if (/\.tool\.[jt]s$/.test(filePath)) {
          // Clear module cache
          delete require.cache[require.resolve(filePath)];

          const tools = await this.loadToolsFromFile(filePath);
          callback(tools);
        }
      });

      watcher.on('unlink', (filePath: string) => {
        if (/\.tool\.[jt]s$/.test(filePath)) {
          // Remove tools from this file
          const remainingTools = Array.from(this.discoveredTools.values()).filter((tool) => tool.location.file !== filePath);

          this.discoveredTools.clear();
          remainingTools.forEach((tool) => {
            this.discoveredTools.set(tool.metadata.name, tool);
          });

          callback([]);
        }
      });
    } catch (error) {
      this.logger.warn('File watching not available. Install chokidar to enable this feature.');
      throw new Error('File watching requires chokidar package to be installed');
    }
  }
}

/**
 * Represents a discovered tool
 */
export interface DiscoveredTool {
  type: 'class' | 'method';
  metadata: ToolMetadata;
  target: any;
  instance?: any;
  methodName?: string;
  location: {
    module?: string;
    provider?: string;
    method?: string;
    file?: string;
    export?: string;
  };
}
