import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { SystemMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import { RunnableLambda, RunnableMap, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { type BaseCheckpointSaver, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { Injectable } from '@nestjs/common';
import { MetricAI } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { AIMetricsService } from '../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../observability/services/langchain-instrumentation.service';
import type { HybridMemoryServiceInterface } from '../memory/types';
import { REACT_AGENT_SYSTEM_PROMPT } from '../prompts';

/**
 * LCEL-based ReactAgentBuilder with enhanced composition patterns.
 * Uses LangChain Expression Language for more composable and maintainable chains.
 */
@Injectable()
export class LCELReactAgentBuilder {
  private readonly toolNode: ToolNode;
  private readonly model: BaseChatModel;
  private readonly tools: StructuredToolInterface[];
  private readonly stateGraph: StateGraph<typeof MessagesAnnotation>;
  private readonly hybridMemory?: HybridMemoryServiceInterface;
  private readonly instrumentation?: LangChainInstrumentationService;
  private readonly metrics?: AIMetricsService;

  // LCEL chain components
  private memoryEnrichmentChain?: Runnable;
  private modelInvocationChain?: Runnable;
  private responseProcessingChain?: Runnable;

  constructor(
    tools: StructuredToolInterface[],
    llm: BaseChatModel,
    hybridMemory?: HybridMemoryServiceInterface,
    instrumentation?: LangChainInstrumentationService,
    metrics?: AIMetricsService,
  ) {
    if (!llm) {
      throw new Error('Language model (llm) is required');
    }

    this.tools = tools || [];
    this.toolNode = new ToolNode(tools || []);
    this.model = llm;
    this.hybridMemory = hybridMemory;
    this.instrumentation = instrumentation;
    this.metrics = metrics;
    this.stateGraph = new StateGraph(MessagesAnnotation);

    // Initialize LCEL chains
    this.initializeLCELChains();
    this.initializeGraph();
  }

  /**
   * Initialize LCEL chains for different processing stages
   */
  private initializeLCELChains(): void {
    // Memory enrichment chain - enriches messages with context from memory
    if (this.hybridMemory) {
      this.memoryEnrichmentChain = RunnableSequence.from([
        RunnableMap.from({
          messages: new RunnablePassthrough(),
          threadId: new RunnableLambda({
            func: (input: any) => input.config?.configurable?.thread_id,
          }),
        }),
        new RunnableLambda({
          func: async ({ messages, threadId }: any) => {
            if (!threadId || !this.hybridMemory) {
              return messages;
            }

            try {
              const enrichedMessages = await this.hybridMemory.buildEnrichedContext(messages, threadId, {
                maxHistoryMessages: 15,
                includeSemanticMemories: true,
              });
              return enrichedMessages;
            } catch {
              // Fallback to original messages if enrichment fails
              return messages;
            }
          },
        }),
        // Ensure system prompt is included
        new RunnableLambda({
          func: (messages: BaseMessage[]) => {
            const hasSystemPrompt = messages.some((msg) => {
              const isSystemMsg = msg.constructor.name === 'SystemMessage';
              const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              return isSystemMsg && content.includes('You are a helpful');
            });

            if (!hasSystemPrompt) {
              return [new SystemMessage(REACT_AGENT_SYSTEM_PROMPT), ...messages];
            }
            return messages;
          },
        }),
      ]);
    } else {
      // Simple chain that just adds system prompt
      this.memoryEnrichmentChain = new RunnableLambda({
        func: (messages: BaseMessage[]) => {
          return [new SystemMessage(REACT_AGENT_SYSTEM_PROMPT), ...messages];
        },
      });
    }

    // Model invocation chain with tool binding
    const modelWithTools = this.model.bindTools ? this.model.bindTools(this.tools) : this.model;

    // Create model invocation chain - handle both instrumented and non-instrumented cases
    if (this.instrumentation) {
      this.modelInvocationChain = new RunnableLambda({
        func: async (messages: BaseMessage[]) => {
          return await this.instrumentation!.instrumentChainInvoke(
            'react_agent_lcel',
            'anthropic', // This could be dynamic
            'claude-3-sonnet',
            messages,
            async () => modelWithTools.invoke(messages),
          );
        },
      });
    } else {
      // Use the model directly - it's already a Runnable
      this.modelInvocationChain = modelWithTools;
    }

    // Response processing chain - handles memory storage
    if (this.hybridMemory) {
      this.responseProcessingChain = RunnableSequence.from([
        RunnableMap.from({
          response: new RunnablePassthrough(),
          originalMessages: new RunnableLambda({
            func: (input: any) => input.originalMessages,
          }),
          threadId: new RunnableLambda({
            func: (input: any) => input.threadId,
          }),
        }),
        new RunnableLambda({
          func: async ({ response, originalMessages, threadId }: any) => {
            if (this.hybridMemory && threadId) {
              try {
                const newMessages = [...originalMessages, response];
                await this.hybridMemory.processNewMessages(newMessages, threadId, {
                  batchStore: true,
                });
              } catch {
                // Silently handle memory storage failures
              }
            }
            return response;
          },
        }),
      ]);
    } else {
      // Simple passthrough if no memory
      this.responseProcessingChain = new RunnablePassthrough();
    }
  }

  /**
   * Create a full LCEL chain for model invocation
   */
  private createFullChain(): Runnable {
    return RunnableSequence.from([
      // Step 1: Enrich with memory context
      RunnableMap.from({
        enrichedMessages: this.memoryEnrichmentChain!,
        originalMessages: new RunnableLambda({
          func: (input: any) => input.messages,
        }),
        threadId: new RunnableLambda({
          func: (input: any) => input.config?.configurable?.thread_id,
        }),
      }),

      // Step 2: Invoke model
      new RunnableLambda({
        func: async ({ enrichedMessages, originalMessages, threadId }: any) => {
          const response = await this.modelInvocationChain!.invoke(enrichedMessages);
          return { response, originalMessages, threadId };
        },
      }),

      // Step 3: Process response (store in memory)
      this.responseProcessingChain!,

      // Step 4: Format output
      new RunnableLambda({
        func: (response: any) => ({ messages: response }),
      }),
    ]);
  }

  private shouldContinue(state: typeof MessagesAnnotation.State) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if ('tool_calls' in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls?.length) {
      return 'tools';
    }
    return END;
  }

  @TraceAI({
    name: 'agent.call_model_lcel',
    operation: 'agent_invoke_lcel',
    modelProvider: 'anthropic',
    modelName: 'claude-3-sonnet',
  })
  @MetricAI({
    measureDuration: true,
    trackSuccessRate: true,
    modelProvider: 'anthropic',
    operation: 'agent_invoke_lcel',
  })
  private async callModel(state: typeof MessagesAnnotation.State, config?: { configurable?: { thread_id?: string } }) {
    if (!this.model || !this.model.bindTools) {
      throw new Error('Invalid or missing language model (llm)');
    }

    // Use the LCEL chain for processing
    const fullChain = this.createFullChain();
    const result = await fullChain.invoke({ messages: state.messages, config });

    return result;
  }

  private initializeGraph(): void {
    this.stateGraph
      .addNode('agent', this.callModel.bind(this))
      .addNode('tools', this.toolNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', this.shouldContinue.bind(this), ['tools', END])
      .addEdge('tools', 'agent');
  }

  /**
   * Builds and compiles the state graph for the agent using LCEL patterns.
   * @param checkpointer - Optional PostgreSQL checkpointer for conversation state
   * @returns The compiled state graph with LCEL chains and optional hybrid memory
   */
  public build(checkpointer?: BaseCheckpointSaver) {
    return this.stateGraph.compile(
      checkpointer
        ? {
            checkpointer: checkpointer,
          }
        : {},
    );
  }

  /**
   * Creates a standalone LCEL chain for specific use cases
   */
  public createStandaloneLCELChain(): Runnable {
    return this.createFullChain();
  }

  /**
   * Gets individual LCEL chain components for composition
   */
  public getChainComponents() {
    return {
      memoryEnrichment: this.memoryEnrichmentChain,
      modelInvocation: this.modelInvocationChain,
      responseProcessing: this.responseProcessingChain,
    };
  }

  /**
   * Gets the hybrid memory service instance (if available)
   */
  public getHybridMemory(): HybridMemoryServiceInterface | null {
    return this.hybridMemory || null;
  }

  /**
   * Checks if this agent has memory enhancement enabled
   */
  public isMemoryEnhanced(): boolean {
    return !!this.hybridMemory;
  }
}
