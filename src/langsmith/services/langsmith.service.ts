import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';
import { MASKING_PATTERNS } from '../config/langsmith.config';
import type { LangSmithConfig, LangSmithHealthStatus } from '../types/langsmith-config.interface';

/**
 * Type for values that can be safely masked
 * Supports primitive types and nested objects/arrays
 */
type MaskableValue = string | number | boolean | null | undefined | MaskableObject | MaskableValue[];

/**
 * Type for objects that can be masked recursively
 */
type MaskableObject = {
  readonly [key: string]: MaskableValue;
};

/**
 * Union type for all possible input values to masking functions
 */
type MaskableInput = MaskableValue;

/**
 * LangSmithService - Centralized service for LangSmith integration
 *
 * This service provides:
 * - LangSmith client initialization and management
 * - Data masking for sensitive information
 * - Health monitoring and status checks
 * - Environment variable configuration for LangChain native logging
 * - Production-ready error handling and logging
 *
 * Key Features:
 * - Automatic environment variable setup for LangChain native tracing
 * - Built-in data masking with configurable patterns
 * - Health checks for monitoring LangSmith connectivity
 * - Type-safe configuration with dependency injection
 */
@Injectable()
export class LangSmithService implements OnModuleInit {
  private readonly logger = new Logger(LangSmithService.name);
  private client: Client | null = null;
  private isInitialized = false;

  constructor(@Inject('LANGSMITH_CONFIG') private readonly config: LangSmithConfig) {}

  /**
   * Initialize LangSmith service on module initialization
   * Sets up environment variables and creates the LangSmith client
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.initialize();
      this.logger.log('LangSmith service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize LangSmith service', error);
      // Don't throw to prevent application from failing if LangSmith is unavailable
    }
  }

  /**
   * Initialize LangSmith client and configure environment variables
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Configure environment variables for LangChain native tracing
    this.setupEnvironmentVariables();

    // Create LangSmith client
    this.client = new Client({
      apiKey: this.config.apiKey,
      apiUrl: this.config.endpoint,
      hideInputs: this.config.hideInputs,
      hideOutputs: this.config.hideOutputs,
      // Additional client configuration
      autoBatchTracing: this.config.backgroundCallbacks,
    });

    this.isInitialized = true;

    // Perform initial health check
    const health = await this.checkHealth();
    if (!health.connected) {
      this.logger.warn(`LangSmith health check failed: ${health.error}`);
    } else {
      this.logger.log(`LangSmith connected successfully to ${health.endpoint}`);
    }
  }

  /**
   * Setup environment variables for LangChain native tracing
   * This enables automatic tracing for all LangChain operations
   */
  private setupEnvironmentVariables(): void {
    // Core LangSmith configuration
    process.env.LANGSMITH_TRACING = this.config.tracingEnabled.toString();
    process.env.LANGSMITH_API_KEY = this.config.apiKey;
    process.env.LANGCHAIN_PROJECT = this.config.projectName;

    // Optional endpoint for self-hosted
    if (this.config.endpoint) {
      process.env.LANGSMITH_ENDPOINT = this.config.endpoint;
    }

    // Performance configuration
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = this.config.backgroundCallbacks.toString();

    // Security configuration
    process.env.LANGSMITH_HIDE_INPUTS = this.config.hideInputs.toString();
    process.env.LANGSMITH_HIDE_OUTPUTS = this.config.hideOutputs.toString();

    this.logger.debug('LangSmith environment variables configured', {
      tracingEnabled: this.config.tracingEnabled,
      projectName: this.config.projectName,
      endpoint: this.config.endpoint || 'default (cloud)',
      backgroundCallbacks: this.config.backgroundCallbacks,
      hideInputs: this.config.hideInputs,
      hideOutputs: this.config.hideOutputs,
    });
  }

  /**
   * Get the LangSmith client instance
   */
  getClient(): Client | null {
    if (!this.isInitialized) {
      this.logger.warn('LangSmith service not initialized, client not available');
      return null;
    }
    return this.client;
  }

  /**
   * Check if LangSmith service is enabled and initialized
   */
  isEnabled(): boolean {
    return this.config.tracingEnabled && this.isInitialized;
  }

  /**
   * Get current configuration (safe copy without sensitive data)
   */
  getConfig(): Omit<LangSmithConfig, 'apiKey'> {
    const { apiKey: _apiKey, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Mask sensitive data in text using configured patterns
   */
  maskSensitiveData(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let maskedText = text;

    // Apply built-in masking patterns
    maskedText = maskedText.replace(MASKING_PATTERNS.EMAIL, '[EMAIL_REDACTED]');
    maskedText = maskedText.replace(MASKING_PATTERNS.PHONE, '[PHONE_REDACTED]');
    maskedText = maskedText.replace(MASKING_PATTERNS.CREDIT_CARD, '[CARD_REDACTED]');
    maskedText = maskedText.replace(MASKING_PATTERNS.API_KEY, '[API_KEY_REDACTED]');
    maskedText = maskedText.replace(MASKING_PATTERNS.PASSWORD, 'password: [PASSWORD_REDACTED]');

    // Apply custom patterns from configuration
    if (this.config.maskingPatterns) {
      Object.entries(this.config.maskingPatterns).forEach(([pattern, replacement]) => {
        try {
          const regex = new RegExp(pattern, 'gi');
          maskedText = maskedText.replace(regex, replacement);
        } catch (error) {
          this.logger.warn(`Invalid masking pattern: ${pattern}`, error);
        }
      });
    }

    return maskedText;
  }

  /**
   * Mask sensitive data in objects recursively
   */
  maskSensitiveObject<T extends MaskableInput>(obj: T): T {
    if (!obj) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskSensitiveData(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskSensitiveObject(item)) as T;
    }

    if (typeof obj === 'object') {
      const masked = {} as Record<string, MaskableValue>;
      const sensitiveKeys = ['apiKey', 'api_key', 'password', 'token', 'secret', 'key', 'authorization', 'auth'];
      
      Object.entries(obj).forEach(([key, value]) => {
        // Skip masking for certain metadata keys
        if (['timestamp', 'id', 'threadId'].includes(key)) {
          masked[key] = value as MaskableValue;
        } else if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey.toLowerCase()))) {
          // Replace sensitive key values entirely
          masked[key] = '***REDACTED***' as MaskableValue;
        } else {
          masked[key] = this.maskSensitiveObject(value as MaskableValue);
        }
      });
      return masked as T;
    }

    return obj;
  }

  /**
   * Perform health check on LangSmith service
   */
  async checkHealth(): Promise<LangSmithHealthStatus> {
    const endpoint = this.config.endpoint || 'https://api.smith.langchain.com';
    const now = Date.now();

    if (!this.client) {
      return {
        connected: false,
        endpoint,
        lastChecked: now,
        error: 'LangSmith client not initialized',
      };
    }

    try {
      // Attempt to get info from LangSmith API
      await this.client.readProject({ projectName: this.config.projectName }).catch((projectError) => {
        // Only ignore 404 errors (project doesn't exist yet)
        if (projectError?.status === 404 || projectError?.message?.includes('not found')) {
          return; // Project not existing is ok
        }
        // Re-throw other errors (connection issues, authentication, etc.)
        throw projectError;
      });

      return {
        connected: true,
        endpoint,
        lastChecked: now,
      };
    } catch (error) {
      return {
        connected: false,
        endpoint,
        lastChecked: now,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create metadata object with default values and custom additions
   */
  createMetadata(customMetadata: Record<string, MaskableValue> = {}): Record<string, MaskableValue> {
    return {
      ...this.config.defaultMetadata,
      ...customMetadata,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log structured information about tracing status
   */
  logTracingStatus(): void {
    this.logger.log('LangSmith Tracing Status', {
      enabled: this.isEnabled(),
      project: this.config.projectName,
      endpoint: this.config.endpoint || 'cloud',
      backgroundCallbacks: this.config.backgroundCallbacks,
      dataProtection: {
        hideInputs: this.config.hideInputs,
        hideOutputs: this.config.hideOutputs,
        maskingEnabled: true,
      },
    });
  }

  /**
   * Create a traceable function wrapper for LangSmith tracing
   * @param name - Name for the traced operation
   * @param fn - Function to trace
   * @param metadata - Additional metadata to include
   */
  createTraceable<T extends (...args: any[]) => any>(name: string, fn: T, metadata: Record<string, any> = {}): T {
    if (!this.isEnabled()) {
      return fn;
    }

    return traceable(fn, {
      name,
      metadata: this.createMetadata(metadata),
      project_name: this.config.projectName,
      // Process inputs to mask sensitive data
      processInputs: (inputs) => this.maskSensitiveObject(inputs),
      // Process outputs to mask sensitive data
      processOutputs: (outputs) => this.maskSensitiveObject(outputs),
    }) as T;
  }

  /**
   * Get a LangChain callback handler for tracing
   */
  getCallbackHandler(): BaseCallbackHandler | null {
    if (!this.isEnabled() || !this.client) {
      return null;
    }

    return new LangChainTracer({
      projectName: this.config.projectName,
      exampleId: undefined,
      client: this.client,
    });
  }

  /**
   * Create a traced runnable with automatic LangSmith integration
   */
  createTracedRunnable<TInput, TOutput>(name: string, runnable: { invoke: (input: TInput) => Promise<TOutput> }, metadata: Record<string, any> = {}) {
    const tracedInvoke = this.createTraceable(name, runnable.invoke.bind(runnable), metadata);

    return {
      ...runnable,
      invoke: tracedInvoke,
    };
  }

  /**
   * Start a new tracing run
   */
  async startRun(name: string, runType: 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding' = 'chain', metadata: Record<string, any> = {}) {
    if (!this.client || !this.isEnabled()) {
      return null;
    }

    try {
      const run = await this.client.createRun({
        name,
        run_type: runType,
        project_name: this.config.projectName,
        extra: this.createMetadata(metadata),
        inputs: metadata.inputs ? this.maskSensitiveObject(metadata.inputs) : undefined,
      });
      return run;
    } catch (error) {
      this.logger.warn(`Failed to start LangSmith run: ${error.message}`);
      return null;
    }
  }

  /**
   * Update an existing run with outputs
   */
  async updateRun(runId: string, outputs: any, error?: Error) {
    if (!this.client || !this.isEnabled()) {
      return;
    }

    try {
      await this.client.updateRun(runId, {
        outputs: outputs ? this.maskSensitiveObject(outputs) : undefined,
        error: error?.message,
        end_time: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Failed to update LangSmith run: ${err.message}`);
    }
  }

  /**
   * Create a run tree for hierarchical tracing
   */
  createRunTree(name: string, runType: 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding' = 'chain', metadata: Record<string, any> = {}) {
    if (!this.client || !this.isEnabled()) {
      return null;
    }

    // Import RunTree dynamically to avoid issues if not available
    try {
      const { RunTree } = require('langsmith');
      return new RunTree({
        name,
        run_type: runType,
        project_name: this.config.projectName,
        client: this.client,
        extra: this.createMetadata(metadata),
      });
    } catch (error) {
      this.logger.warn('RunTree not available in current LangSmith version');
      return null;
    }
  }
}
