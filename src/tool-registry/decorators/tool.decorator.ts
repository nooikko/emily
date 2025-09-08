import 'reflect-metadata';
import { z } from 'zod';
import type { RateLimitConfig, SandboxConfig, ToolInput, ToolMetadata, ToolPermission } from '../interfaces/tool-registry.interface';

export const TOOL_METADATA_KEY = Symbol('tool:metadata');
export const TOOL_SCHEMA_KEY = Symbol('tool:schema');
export const TOOL_HANDLER_KEY = Symbol('tool:handler');
export const TOOL_VERSION_KEY = Symbol('tool:version');

export interface ToolOptions {
  name: string;
  description: string;
  version?: string;
  category?: string;
  tags?: string[];
  author?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  permissions?: ToolPermission[];
  rateLimit?: RateLimitConfig;
  sandbox?: SandboxConfig;
  schema?: z.ZodSchema<ToolInput>;
}

/**
 * Main @tool decorator for marking classes or methods as LangChain tools
 */
// Type definitions for decorator targets - compatible with TypeScript decorators
type DecoratorTarget = object & {
  constructor: Function;
};

type ClassConstructor = Function & { prototype: DecoratorTarget };

export function tool(options: ToolOptions): ClassDecorator & MethodDecorator {
  return ((target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const metadata: ToolMetadata = {
      name: options.name,
      version: options.version || '1.0.0',
      description: options.description,
      category: options.category,
      tags: options.tags,
      author: options.author,
      deprecated: options.deprecated,
      deprecationMessage: options.deprecationMessage,
      permissions: options.permissions,
      rateLimit: options.rateLimit,
      sandbox: options.sandbox,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (propertyKey && descriptor) {
      // Method decorator
      Reflect.defineMetadata(TOOL_METADATA_KEY, metadata, target, propertyKey);
      if (options.schema) {
        Reflect.defineMetadata(TOOL_SCHEMA_KEY, options.schema, target, propertyKey);
      }

      // Store reference to the original method
      Reflect.defineMetadata(TOOL_HANDLER_KEY, descriptor.value, target, propertyKey);

      return descriptor;
    }
    // Class decorator
    Reflect.defineMetadata(TOOL_METADATA_KEY, metadata, target);
    if (options.schema) {
      Reflect.defineMetadata(TOOL_SCHEMA_KEY, options.schema, target);
    }

    return target;
  }) as ClassDecorator & MethodDecorator;
}

/**
 * Decorator for specifying tool version
 */
export function ToolVersion(version: string): ClassDecorator & MethodDecorator {
  return (target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol) => {
    if (propertyKey) {
      Reflect.defineMetadata(TOOL_VERSION_KEY, version, target, propertyKey);
    } else {
      Reflect.defineMetadata(TOOL_VERSION_KEY, version, target);
    }
  };
}

/**
 * Decorator for marking a method as the tool's main handler
 */
export function ToolHandler(): MethodDecorator {
  return (target: DecoratorTarget, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(TOOL_HANDLER_KEY, descriptor.value, target, propertyKey);
    return descriptor;
  };
}

/**
 * Decorator for defining tool input schema
 */
export function ToolSchema(schema: z.ZodSchema<ToolInput>): ClassDecorator & MethodDecorator {
  return (target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol) => {
    if (propertyKey) {
      Reflect.defineMetadata(TOOL_SCHEMA_KEY, schema, target, propertyKey);
    } else {
      Reflect.defineMetadata(TOOL_SCHEMA_KEY, schema, target);
    }
  };
}

/**
 * Decorator for marking tools as deprecated
 */
export function Deprecated(message?: string): ClassDecorator & MethodDecorator {
  return (target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol) => {
    // Wait for next tick to ensure @tool decorator has been applied
    process.nextTick(() => {
      const existingMetadata = propertyKey
        ? Reflect.getMetadata(TOOL_METADATA_KEY, target, propertyKey) || {}
        : Reflect.getMetadata(TOOL_METADATA_KEY, target) || {};

      const updatedMetadata = {
        ...existingMetadata,
        deprecated: true,
        deprecationMessage: message,
        updatedAt: new Date(),
      };

      if (propertyKey) {
        Reflect.defineMetadata(TOOL_METADATA_KEY, updatedMetadata, target, propertyKey);
      } else {
        Reflect.defineMetadata(TOOL_METADATA_KEY, updatedMetadata, target);
      }
    });

    // For immediate application in same decorator chain
    const existingMetadata = propertyKey
      ? Reflect.getMetadata(TOOL_METADATA_KEY, target, propertyKey) || {}
      : Reflect.getMetadata(TOOL_METADATA_KEY, target) || {};

    const updatedMetadata = {
      ...existingMetadata,
      deprecated: true,
      deprecationMessage: message,
    };

    if (propertyKey) {
      Reflect.defineMetadata(TOOL_METADATA_KEY, updatedMetadata, target, propertyKey);
    } else {
      Reflect.defineMetadata(TOOL_METADATA_KEY, updatedMetadata, target);
    }
  };
}

/**
 * Helper function to extract tool metadata from a decorated class or method
 */
export function getToolMetadata(target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol): ToolMetadata | undefined {
  if (propertyKey) {
    return Reflect.getMetadata(TOOL_METADATA_KEY, target, propertyKey);
  }
  return Reflect.getMetadata(TOOL_METADATA_KEY, target);
}

/**
 * Helper function to extract tool schema from a decorated class or method
 */
export function getToolSchema(target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol): z.ZodSchema<ToolInput> | undefined {
  if (propertyKey) {
    return Reflect.getMetadata(TOOL_SCHEMA_KEY, target, propertyKey);
  }
  return Reflect.getMetadata(TOOL_SCHEMA_KEY, target);
}

/**
 * Helper function to extract tool handler from a decorated class or method
 */
export function getToolHandler(target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol): Function | undefined {
  if (propertyKey) {
    return Reflect.getMetadata(TOOL_HANDLER_KEY, target, propertyKey);
  }
  return Reflect.getMetadata(TOOL_HANDLER_KEY, target);
}

/**
 * Helper function to check if a class or method is decorated with @tool
 */
export function isTool(target: DecoratorTarget | ClassConstructor, propertyKey?: string | symbol): boolean {
  if (propertyKey) {
    return Reflect.hasMetadata(TOOL_METADATA_KEY, target, propertyKey);
  }
  return Reflect.hasMetadata(TOOL_METADATA_KEY, target);
}
