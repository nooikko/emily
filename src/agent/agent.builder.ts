import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { SystemMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { type BaseCheckpointSaver, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { Injectable } from '@nestjs/common';
import { MetricAI } from '../observability/decorators/metric.decorator';
import { TraceAI } from '../observability/decorators/trace.decorator';
import { AIMetricsService } from '../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../observability/services/langchain-instrumentation.service';
import type { HybridMemoryServiceInterface } from './memory/types';
import { REACT_AGENT_SYSTEM_PROMPT } from './prompts';

/**
 * ReactAgentBuilder with optional hybrid memory system integration and comprehensive observability.
 * This builder creates agents that can optionally use both PostgreSQL checkpointing
 * and Qdrant semantic memory for enhanced context management, with full telemetry support.
 */
@Injectable()
export class ReactAgentBuilder {
  private readonly toolNode: ToolNode;
  private readonly model: BaseChatModel;
  private readonly tools: StructuredToolInterface[];
  private readonly stateGraph: StateGraph<typeof MessagesAnnotation>;
  private readonly hybridMemory?: HybridMemoryServiceInterface;
  private readonly instrumentation?: LangChainInstrumentationService;

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
    this.initializeGraph();
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
    name: 'agent.call_model',
    operation: 'agent_invoke',
    modelProvider: 'anthropic', // This could be dynamic based on model
    modelName: 'claude-3-sonnet',
  })
  @MetricAI({
    measureDuration: true,
    trackSuccessRate: true,
    modelProvider: 'anthropic',
    operation: 'agent_invoke',
  })
  private async callModel(state: typeof MessagesAnnotation.State, config?: { configurable?: { thread_id?: string } }) {
    if (!this.model || !this.model.bindTools) {
      throw new Error('Invalid or missing language model (llm)');
    }

    const threadId = config?.configurable?.thread_id;

    // Build context - use hybrid memory system if available, otherwise basic context
    let enrichedMessages: BaseMessage[];

    if (this.hybridMemory && threadId) {
      try {
        enrichedMessages = await this.hybridMemory.buildEnrichedContext(state.messages, threadId, {
          maxHistoryMessages: 15, // Limit history to avoid token limits
          includeSemanticMemories: true,
        });
      } catch {
        // Fall back to basic context if memory context building fails
        enrichedMessages = [new SystemMessage(REACT_AGENT_SYSTEM_PROMPT), ...state.messages];
      }
    } else {
      // Basic context without memory enhancement
      enrichedMessages = [new SystemMessage(REACT_AGENT_SYSTEM_PROMPT), ...state.messages];
    }

    // Ensure system prompt is at the beginning if not already added by memory service
    if (
      !enrichedMessages.some((msg) => {
        const isSystemMsg = msg.constructor.name === 'SystemMessage';
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return isSystemMsg && content.includes('You are a helpful');
      })
    ) {
      enrichedMessages.unshift(new SystemMessage(REACT_AGENT_SYSTEM_PROMPT));
    }

    const modelInvoker = this.model.bindTools(this.tools);

    // Instrument the model invocation with observability
    const response = this.instrumentation
      ? await this.instrumentation.instrumentChainInvoke(
          'react_agent',
          'anthropic', // This could be dynamic
          'claude-3-sonnet',
          enrichedMessages,
          async () => modelInvoker.invoke(enrichedMessages),
        )
      : await modelInvoker.invoke(enrichedMessages);

    // Process the new messages for memory storage if memory system is available
    if (this.hybridMemory && threadId) {
      try {
        // Store both the input messages and the response in semantic memory
        const newMessages = [...state.messages, response];
        await this.hybridMemory.processNewMessages(newMessages, threadId, {
          batchStore: true,
        });
      } catch (_error) {
        // Log error but don't fail the request if memory storage fails
        // Failed to process new messages for memory storage - silently ignore
      }
    }

    return { messages: response };
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
   * Builds and compiles the state graph for the agent.
   * @param checkpointer - Optional PostgreSQL checkpointer for conversation state
   * @returns The compiled state graph with optional hybrid memory capabilities
   */
  public build(checkpointer?: BaseCheckpointSaver) {
    return this.stateGraph.compile(
      checkpointer
        ? {
            checkpointer: checkpointer,
            // Store can be used to enable persistence and memory that can be shared across threads
          }
        : {},
    );
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
