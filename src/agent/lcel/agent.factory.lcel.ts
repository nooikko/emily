import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import type { Runnable } from '@langchain/core/runnables';
import { RunnableConfig } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import * as dotenv from 'dotenv';
import type { AnthropicConfig, OpenAIConfig } from '../../infisical/infisical-config.factory';
import { AIMetricsService } from '../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../observability/services/langchain-instrumentation.service';
import { ModelProvider } from '../enum/model-provider.enum';
import type { HybridMemoryServiceInterface } from '../memory/types';
import { LCELReactAgentBuilder } from './agent.builder.lcel';

dotenv.config();

export interface ModelProviderConfigs {
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
}

export interface LCELAgentConfig {
  modelProvider: ModelProvider;
  tools: StructuredToolInterface[];
  configs: ModelProviderConfigs;
  hybridMemory?: HybridMemoryServiceInterface;
  checkpointer?: PostgresSaver;
  callbacks?: BaseCallbackHandler[];
  callbackManager?: CallbackManager;
  instrumentation?: LangChainInstrumentationService;
  metrics?: AIMetricsService;
  streaming?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Factory for creating LCEL-based agents with enhanced composition patterns
 */
export class LCELAgentFactory {
  /**
   * Creates a standard LCEL agent
   */
  public static createAgent(config: LCELAgentConfig) {
    const { modelProvider, tools, configs, checkpointer, instrumentation, metrics } = config;

    if (!modelProvider) {
      throw new Error('Model provider is required');
    }

    const model = LCELAgentFactory.createModel(modelProvider, configs, config);

    return new LCELReactAgentBuilder(
      tools,
      model,
      undefined, // No hybrid memory for standard agent
      instrumentation,
      metrics,
    ).build(checkpointer);
  }

  /**
   * Creates a memory-enhanced LCEL agent with hybrid memory capabilities
   */
  public static createMemoryEnhancedAgent(config: LCELAgentConfig) {
    const { modelProvider, tools, configs, hybridMemory, checkpointer, instrumentation, metrics } = config;

    if (!modelProvider) {
      throw new Error('Model provider is required');
    }
    if (!hybridMemory) {
      throw new Error('Hybrid memory service is required for memory-enhanced agent');
    }

    const model = LCELAgentFactory.createModel(modelProvider, configs, config);

    return new LCELReactAgentBuilder(tools, model, hybridMemory, instrumentation, metrics).build(checkpointer);
  }

  /**
   * Creates a standalone LCEL chain for custom composition
   */
  public static createLCELChain(config: LCELAgentConfig): Runnable {
    const { modelProvider, tools, configs, hybridMemory, instrumentation, metrics } = config;

    if (!modelProvider) {
      throw new Error('Model provider is required');
    }

    const model = LCELAgentFactory.createModel(modelProvider, configs, config);

    const builder = new LCELReactAgentBuilder(tools, model, hybridMemory, instrumentation, metrics);

    return builder.createStandaloneLCELChain();
  }

  /**
   * Creates individual LCEL chain components for custom composition
   */
  public static createChainComponents(config: LCELAgentConfig) {
    const { modelProvider, tools, configs, hybridMemory, instrumentation, metrics } = config;

    if (!modelProvider) {
      throw new Error('Model provider is required');
    }

    const model = LCELAgentFactory.createModel(modelProvider, configs, config);

    const builder = new LCELReactAgentBuilder(tools, model, hybridMemory, instrumentation, metrics);

    return builder.getChainComponents();
  }

  /**
   * Creates the appropriate chat model based on the provider
   */
  private static createModel(modelProvider: ModelProvider, configs: ModelProviderConfigs, options: Partial<LCELAgentConfig>) {
    const { callbacks, callbackManager, streaming, temperature, maxTokens } = options;

    // Create base configuration
    const baseConfig: RunnableConfig = {};
    if (callbacks) {
      baseConfig.callbacks = callbacks;
    }
    if (callbackManager) {
      // CallbackManager is handled through callbacks array
    }

    switch (modelProvider) {
      case ModelProvider.OPENAI: {
        return new ChatOpenAI({
          model: configs.openai.model,
          apiKey: configs.openai.apiKey,
          streaming: streaming ?? false,
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens,
          ...baseConfig,
        });
      }

      case ModelProvider.ANTHROPIC: {
        return new ChatAnthropic({
          model: configs.anthropic.model,
          apiKey: configs.anthropic.apiKey,
          streaming: streaming ?? false,
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens,
          ...baseConfig,
        });
      }

      default:
        throw new Error(`Unsupported model provider: ${modelProvider}`);
    }
  }

  /**
   * Creates a pre-configured agent with common settings
   */
  public static createPreConfiguredAgent(
    preset: 'conversational' | 'task-oriented' | 'research',
    modelProvider: ModelProvider,
    configs: ModelProviderConfigs,
    tools: StructuredToolInterface[] = [],
  ) {
    const presetConfigs = {
      conversational: {
        temperature: 0.7,
        maxTokens: 2000,
        streaming: true,
      },
      'task-oriented': {
        temperature: 0.3,
        maxTokens: 4000,
        streaming: false,
      },
      research: {
        temperature: 0.5,
        maxTokens: 8000,
        streaming: false,
      },
    };

    const presetConfig = presetConfigs[preset];

    return LCELAgentFactory.createAgent({
      modelProvider,
      tools,
      configs,
      ...presetConfig,
    });
  }
}
