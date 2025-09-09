import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { LangSmithService } from '../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../observability/services/langchain-instrumentation.service';

export interface CallbackEvent {
  type:
    | 'llm_start'
    | 'llm_end'
    | 'llm_error'
    | 'chain_start'
    | 'chain_end'
    | 'chain_error'
    | 'tool_start'
    | 'tool_end'
    | 'tool_error'
    | 'agent_action'
    | 'agent_finish';
  timestamp: number;
  data: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Unified callback handler that integrates with all observability services
 * and provides a consistent interface for monitoring LangChain operations
 */
@Injectable()
export class UnifiedCallbackHandler extends BaseCallbackHandler {
  name = 'UnifiedCallbackHandler';
  private readonly logger = new Logger(UnifiedCallbackHandler.name);
  private readonly events$ = new Subject<CallbackEvent>();

  constructor(
    private readonly langsmithService?: LangSmithService,
    private readonly metricsService?: AIMetricsService,
    private readonly instrumentationService?: LangChainInstrumentationService,
    private readonly metadata: Record<string, unknown> = {},
  ) {
    super();
  }

  /**
   * Get observable stream of callback events
   */
  getEventStream() {
    return this.events$.asObservable();
  }

  /**
   * LLM callbacks
   */
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const event: CallbackEvent = {
      type: 'llm_start',
      timestamp: Date.now(),
      data: {
        llm: llm.name || 'unknown',
        promptCount: prompts.length,
        runId,
        parentRunId,
      },
      metadata: { ...this.metadata, ...extraParams },
    };

    this.events$.next(event);

    // Track metrics
    if (this.metricsService) {
      this.metricsService.incrementTokenUsage(
        (llm.name || '').includes('anthropic') ? 'anthropic' : 'openai',
        'input',
        prompts.join(' ').length / 4, // Rough token estimate
      );
    }

    // Log for observability
    this.logger.debug(`LLM Start: ${llm.name} with ${prompts.length} prompts`);
  }

  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'llm_end',
      timestamp: Date.now(),
      data: {
        generationCount: output.generations.length,
        runId,
        parentRunId,
        llmOutput: output.llmOutput,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    // Track metrics
    if (this.metricsService && output.llmOutput?.tokenUsage) {
      const usage = output.llmOutput.tokenUsage;
      this.metricsService.incrementTokenUsage(
        'openai', // Default, should be dynamic
        'output',
        usage.completionTokens || 0,
      );
    }

    this.logger.debug(`LLM End: Generated ${output.generations.length} outputs`);
  }

  async handleLLMError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'llm_error',
      timestamp: Date.now(),
      data: {
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    // Track error metrics
    if (this.metricsService) {
      this.metricsService.incrementRequestCount('openai', 'error');
    }

    this.logger.error(`LLM Error: ${err.message}`, err.stack);
  }

  /**
   * Chain callbacks
   */
  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const event: CallbackEvent = {
      type: 'chain_start',
      timestamp: Date.now(),
      data: {
        chain: chain.name || 'unknown',
        inputKeys: Object.keys(inputs),
        runId,
        parentRunId,
        tags,
      },
      metadata: { ...this.metadata, ...metadata },
    };

    this.events$.next(event);

    // Start instrumentation span if available
    if (this.instrumentationService) {
      this.instrumentationService.startSpan(`chain.${chain.name}`, {
        runId,
        parentRunId,
        tags,
      });
    }

    this.logger.debug(`Chain Start: ${chain.name}`);
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'chain_end',
      timestamp: Date.now(),
      data: {
        outputKeys: Object.keys(outputs),
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    // End instrumentation span
    if (this.instrumentationService) {
      this.instrumentationService.endSpan(`chain.${runId}`);
    }

    this.logger.debug(`Chain End: Produced ${Object.keys(outputs).length} outputs`);
  }

  async handleChainError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'chain_error',
      timestamp: Date.now(),
      data: {
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    // End span with error
    if (this.instrumentationService) {
      this.instrumentationService.endSpan(`chain.${runId}`, { error: true });
    }

    this.logger.error(`Chain Error: ${err.message}`, err.stack);
  }

  /**
   * Tool callbacks
   */
  async handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'tool_start',
      timestamp: Date.now(),
      data: {
        tool: tool.name || 'unknown',
        inputLength: input.length,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    this.logger.debug(`Tool Start: ${tool.name}`);
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'tool_end',
      timestamp: Date.now(),
      data: {
        outputLength: output.length,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    this.logger.debug(`Tool End: Produced ${output.length} chars output`);
  }

  async handleToolError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'tool_error',
      timestamp: Date.now(),
      data: {
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    this.logger.error(`Tool Error: ${err.message}`, err.stack);
  }

  /**
   * Agent callbacks
   */
  async handleAgentAction(action: AgentAction, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'agent_action',
      timestamp: Date.now(),
      data: {
        tool: action.tool,
        toolInput: action.toolInput,
        log: action.log,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    this.logger.debug(`Agent Action: Using tool ${action.tool}`);
  }

  async handleAgentFinish(finish: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    const event: CallbackEvent = {
      type: 'agent_finish',
      timestamp: Date.now(),
      data: {
        returnValues: finish.returnValues,
        log: finish.log,
        runId,
        parentRunId,
      },
      metadata: this.metadata,
    };

    this.events$.next(event);

    this.logger.debug('Agent Finish: Completed execution');
  }

  /**
   * Create a child handler with additional metadata
   */
  createChildHandler(additionalMetadata: Record<string, unknown>): UnifiedCallbackHandler {
    return new UnifiedCallbackHandler(this.langsmithService, this.metricsService, this.instrumentationService, {
      ...this.metadata,
      ...additionalMetadata,
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.events$.complete();
  }
}
