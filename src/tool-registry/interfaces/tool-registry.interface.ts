import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';

export interface ToolMetadata {
  name: string;
  version: string;
  description: string;
  category?: string;
  tags?: string[];
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  deprecated?: boolean;
  deprecationMessage?: string;
  permissions?: ToolPermission[];
  rateLimit?: RateLimitConfig;
  sandbox?: SandboxConfig;
}

export interface ToolPermission {
  role: string;
  actions: string[];
  restrictions?: Record<string, any>;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: any) => string;
}

export interface SandboxConfig {
  enabled: boolean;
  dockerImage?: string;
  resourceLimits?: {
    memory?: string;
    cpu?: string;
    timeout?: number;
  };
  networkPolicy?: 'none' | 'restricted' | 'full';
  volumes?: Array<{
    host: string;
    container: string;
    readOnly?: boolean;
  }>;
}

export interface ToolRegistration {
  tool: StructuredToolInterface;
  metadata: ToolMetadata;
  schema?: z.ZodSchema<any>;
  handler?: ToolHandler;
}

export interface ToolHandler {
  execute: (input: any, context?: ToolExecutionContext) => Promise<any>;
  validate?: (input: any) => boolean | Promise<boolean>;
  beforeExecute?: (input: any, context?: ToolExecutionContext) => void | Promise<void>;
  afterExecute?: (result: any, context?: ToolExecutionContext) => void | Promise<void>;
  onError?: (error: Error, context?: ToolExecutionContext) => void | Promise<void>;
}

export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  startTime?: number;
  endTime?: number;
  executionId?: string;
  parentExecutionId?: string;
}

export interface ToolDiscoveryOptions {
  paths?: string[];
  pattern?: RegExp;
  recursive?: boolean;
  autoRegister?: boolean;
  validateOnDiscovery?: boolean;
}

export interface ToolVersion {
  version: string;
  tool: StructuredToolInterface;
  metadata: ToolMetadata;
  createdAt: Date;
  changelog?: string;
  compatible?: string[];
}

export interface ToolRegistry {
  register(registration: ToolRegistration): void;
  unregister(name: string): boolean;
  get(name: string, version?: string): ToolRegistration | null;
  getAll(): Map<string, ToolRegistration>;
  search(query: ToolSearchQuery): ToolRegistration[];
  getVersions(name: string): ToolVersion[];
  isRegistered(name: string): boolean;
  clear(): void;
}

export interface ToolSearchQuery {
  name?: string;
  category?: string;
  tags?: string[];
  version?: string;
  deprecated?: boolean;
  permissions?: string[];
}

export interface ToolComposition {
  name: string;
  description: string;
  tools: string[];
  flow: ToolFlow[];
  errorHandling?: ErrorHandlingStrategy;
  retryPolicy?: RetryPolicy;
}

export interface ToolFlow {
  tool: string;
  input?: any;
  output?: string;
  condition?: (context: any) => boolean;
  transform?: (data: any) => any;
  parallel?: boolean;
}

export interface ErrorHandlingStrategy {
  type: 'fail-fast' | 'continue' | 'fallback' | 'retry';
  fallbackTool?: string;
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error, context: ToolExecutionContext) => void;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff?: 'linear' | 'exponential' | 'fixed';
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
}

export interface ToolValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

export interface ToolMetrics {
  name: string;
  version: string;
  executions: number;
  successCount: number;
  errorCount: number;
  averageExecutionTime: number;
  lastExecuted?: Date;
  errorRate: number;
  throughput: number;
}