import { CallbackManager } from '@langchain/core/callbacks/manager';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { LangSmithService } from '../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../observability/services/langchain-instrumentation.service';
import { UnifiedCallbackHandler } from './unified-callback.handler';

/**
 * Service for managing LangChain callbacks across the application
 * Provides centralized callback management with observability integration
 */
@Injectable()
export class CallbackManagerService implements OnModuleDestroy {
  private readonly handlers: Map<string, UnifiedCallbackHandler> = new Map();
  private readonly globalHandler: UnifiedCallbackHandler;

  constructor(
    private readonly langsmithService: LangSmithService,
    private readonly metricsService: AIMetricsService,
    private readonly instrumentationService: LangChainInstrumentationService,
  ) {
    // Create global handler
    this.globalHandler = new UnifiedCallbackHandler(langsmithService, metricsService, instrumentationService, { source: 'global' });
  }

  /**
   * Create a callback manager for a specific context
   */
  createCallbackManager(context: string, metadata: Record<string, unknown> = {}): CallbackManager {
    const handler = this.createHandler(context, metadata);

    const manager = new CallbackManager();
    manager.addHandler(handler);

    // Add global handler for comprehensive tracking
    manager.addHandler(this.globalHandler);

    // Add LangSmith handler if enabled
    if (this.langsmithService?.isEnabled()) {
      const langsmithHandler = this.langsmithService.getCallbackHandler();
      if (langsmithHandler) {
        manager.addHandler(langsmithHandler);
      }
    }

    return manager;
  }

  /**
   * Create a unified callback handler for a specific context
   */
  createHandler(context: string, metadata: Record<string, unknown> = {}): UnifiedCallbackHandler {
    const handler = new UnifiedCallbackHandler(this.langsmithService, this.metricsService, this.instrumentationService, { context, ...metadata });

    this.handlers.set(context, handler);
    return handler;
  }

  /**
   * Get an existing handler by context
   */
  getHandler(context: string): UnifiedCallbackHandler | undefined {
    return this.handlers.get(context);
  }

  /**
   * Get the global handler
   */
  getGlobalHandler(): UnifiedCallbackHandler {
    return this.globalHandler;
  }

  /**
   * Remove a handler
   */
  removeHandler(context: string): void {
    const handler = this.handlers.get(context);
    if (handler) {
      handler.dispose();
      this.handlers.delete(context);
    }
  }

  /**
   * Create a callback manager with common presets
   */
  createPresetCallbackManager(preset: 'agent' | 'chain' | 'tool' | 'memory', additionalMetadata: Record<string, unknown> = {}): CallbackManager {
    const presetMetadata = {
      agent: { type: 'agent', level: 'high' },
      chain: { type: 'chain', level: 'medium' },
      tool: { type: 'tool', level: 'low' },
      memory: { type: 'memory', level: 'medium' },
    };

    return this.createCallbackManager(preset, { ...presetMetadata[preset], ...additionalMetadata });
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    // Dispose all handlers
    this.handlers.forEach((handler) => {
      handler.dispose();
    });
    this.handlers.clear();

    // Dispose global handler
    this.globalHandler.dispose();
  }
}
