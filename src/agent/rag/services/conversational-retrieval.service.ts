import { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
// Removed LLMChain import - using modern runnables instead
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import type { BaseRetriever } from '@langchain/core/retrievers';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { Injectable } from '@nestjs/common';
import { LangChainBaseService } from '../../../common/base/langchain-base.service';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { ConversationalRetrievalConfig, ConversationalRetrievalResult, RAGMetrics } from '../interfaces/rag.interface';

/**
 * Service for conversational retrieval with chat history support.
 * Implements ConversationalRetrievalQAChain with enhanced memory management
 * and conversation context tracking.
 */
@Injectable()
export class ConversationalRetrievalService extends LangChainBaseService {
  constructor(
    callbackManagerService?: CallbackManagerService,
    langsmithService?: LangSmithService,
    metricsService?: AIMetricsService,
    instrumentationService?: LangChainInstrumentationService,
  ) {
    super('ConversationalRetrievalService', callbackManagerService, langsmithService, metricsService, instrumentationService);
  }

  /**
   * Create a conversational retrieval chain with specified configuration
   */
  createConversationalChain(config: ConversationalRetrievalConfig): RunnableSequence {
    this.logExecution('createConversationalChain', {
      hasRetriever: !!config.retriever,
      hasLLM: !!config.llm,
      memoryWindowSize: config.memoryWindowSize,
      returnSourceDocs: config.returnSourceDocuments,
    });

    // Create custom prompts if provided
    let qaPrompt: ChatPromptTemplate | undefined;
    let questionGeneratorPrompt: ChatPromptTemplate | undefined;

    if (config.qaTemplate) {
      qaPrompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(config.qaTemplate),
        HumanMessagePromptTemplate.fromTemplate('{question}'),
      ]);
    }

    if (config.questionGeneratorTemplate) {
      questionGeneratorPrompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(config.questionGeneratorTemplate),
        HumanMessagePromptTemplate.fromTemplate(
          'Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.\n\nChat History:\n{chat_history}\nFollow Up Input: {question}\nStandalone question:',
        ),
      ]);
    }

    // Create the chain with proper configuration
    const chainConfig: {
      llm: BaseLanguageModel;
      retriever: BaseRetriever;
      returnSourceDocuments: boolean;
      verbose: boolean;
      qaTemplate?: ChatPromptTemplate;
      questionGeneratorTemplate?: ChatPromptTemplate;
      callbacks?: unknown;
    } = {
      llm: config.llm,
      retriever: config.retriever,
      returnSourceDocuments: config.returnSourceDocuments ?? true,
      verbose: true,
    };

    // Add custom prompts if provided
    if (qaPrompt) {
      chainConfig.qaTemplate = qaPrompt;
    }

    if (questionGeneratorPrompt) {
      chainConfig.questionGeneratorTemplate = questionGeneratorPrompt;
    }

    // Add callbacks for observability
    chainConfig.callbacks = this.callbacks;

    // Create modern conversational chain using runnables
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        config.qaTemplate || "Use the following pieces of context to answer the question. If you don't know the answer, say you don't know.",
      ),
      HumanMessagePromptTemplate.fromTemplate('{question}'),
    ]);

    return RunnableSequence.from([
      {
        context: config.retriever,
        question: new RunnablePassthrough(),
      },
      prompt,
      config.llm,
      new StringOutputParser(),
    ]);
  }

  /**
   * Execute conversational retrieval with chat history management
   */
  async executeConversationalRetrieval(
    chain: RunnableSequence,
    question: string,
    chatHistory: BaseMessage[] = [],
    config?: {
      maxContextTokens?: number;
      includeMetrics?: boolean;
    },
  ): Promise<ConversationalRetrievalResult> {
    const startTime = Date.now();

    try {
      this.logExecution('executeConversationalRetrieval', {
        questionLength: question.length,
        chatHistoryLength: chatHistory.length,
        maxContextTokens: config?.maxContextTokens,
      });

      // Truncate chat history if it exceeds context limits
      const truncatedHistory = this.truncateChatHistory(chatHistory, config?.maxContextTokens);

      // Format chat history for the chain
      const formattedHistory = this.formatChatHistoryForChain(truncatedHistory);

      // Execute the chain
      const result = await chain.invoke(
        {
          question,
          chat_history: formattedHistory,
        },
        this.createRunnableConfig({
          operation: 'conversational_retrieval',
          question: question.substring(0, 100),
          historyLength: truncatedHistory.length,
        }),
      );

      // Extract and format the response
      const response: ConversationalRetrievalResult = {
        answer: result.text || result.answer || '',
        sourceDocuments: result.sourceDocuments || [],
        chatHistory: [...truncatedHistory, new HumanMessage(question), new AIMessage(result.text || result.answer || '')],
      };

      // Add generated question if available
      if (result.generatedQuestion) {
        response.generatedQuestion = result.generatedQuestion;
      }

      // Calculate metrics if requested
      if (config?.includeMetrics) {
        const metrics: RAGMetrics = {
          retrievalLatency: 0, // Would need to be measured separately
          generationLatency: Date.now() - startTime,
          totalLatency: Date.now() - startTime,
          documentsRetrieved: response.sourceDocuments?.length || 0,
          documentsUsed: response.sourceDocuments?.length || 0,
          inputTokens: this.estimateTokens(question + formattedHistory),
          outputTokens: this.estimateTokens(response.answer),
        };

        // Add metrics to response metadata
        if (response.sourceDocuments) {
          response.sourceDocuments = response.sourceDocuments.map((doc) => ({
            ...doc,
            metadata: {
              ...doc.metadata,
              ragMetrics: metrics,
            },
          }));
        }
      }

      this.logger.debug('Conversational retrieval completed', {
        answerLength: response.answer.length,
        sourceDocsCount: response.sourceDocuments?.length || 0,
        totalLatency: Date.now() - startTime,
      });

      return response;
    } catch (error) {
      this.logger.error('Conversational retrieval failed:', error);
      throw new Error(`Conversational retrieval failed: ${error.message}`);
    }
  }

  /**
   * Create a conversational retrieval chain with memory integration
   */
  async createConversationalChainWithMemory(
    config: ConversationalRetrievalConfig & {
      memoryKey?: string;
      sessionId?: string;
    },
  ): Promise<RunnableSequence> {
    this.logExecution('createConversationalChainWithMemory', {
      memoryKey: config.memoryKey,
      sessionId: config.sessionId,
      memoryWindowSize: config.memoryWindowSize,
    });

    // Create base chain
    const chain = this.createConversationalChain(config);

    // Add memory integration if memory key is provided
    if (config.memoryKey || config.sessionId) {
      // This would integrate with the existing MemoryService
      // For now, we'll add logging to indicate memory integration
      this.logger.debug('Memory integration would be added here', {
        memoryKey: config.memoryKey,
        sessionId: config.sessionId,
      });
    }

    return chain;
  }

  /**
   * Truncate chat history to fit within token limits
   */
  private truncateChatHistory(chatHistory: BaseMessage[], maxTokens?: number): BaseMessage[] {
    if (!maxTokens || chatHistory.length === 0) {
      return chatHistory;
    }

    // Estimate tokens and truncate if necessary
    let totalTokens = 0;
    const truncatedHistory: BaseMessage[] = [];

    // Process history in reverse order (most recent first)
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const message = chatHistory[i];
      const messageTokens = this.estimateTokens(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));

      if (totalTokens + messageTokens > maxTokens) {
        break;
      }

      totalTokens += messageTokens;
      truncatedHistory.unshift(message);
    }

    if (truncatedHistory.length < chatHistory.length) {
      this.logger.debug('Chat history truncated', {
        originalLength: chatHistory.length,
        truncatedLength: truncatedHistory.length,
        estimatedTokens: totalTokens,
        maxTokens,
      });
    }

    return truncatedHistory;
  }

  /**
   * Format chat history for LangChain chain consumption
   */
  private formatChatHistoryForChain(chatHistory: BaseMessage[]): string {
    if (chatHistory.length === 0) {
      return '';
    }

    return chatHistory
      .map((message) => {
        const role = message instanceof HumanMessage ? 'Human' : 'AI';
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        return `${role}: ${content}`;
      })
      .join('\n');
  }

  /**
   * Simple token estimation (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Create a streaming conversational retrieval chain
   */
  createStreamingConversationalChain(
    config: ConversationalRetrievalConfig & {
      onToken?: (token: string) => void;
      onSourceDocuments?: (docs: Document[]) => void;
    },
  ): RunnableSequence {
    this.logExecution('createStreamingConversationalChain');

    // Create base chain
    const chain = this.createConversationalChain(config);

    // Add streaming callbacks if provided
    if (config.onToken || config.onSourceDocuments) {
      // This would add streaming capabilities
      // Implementation would depend on the specific streaming requirements
      this.logger.debug('Streaming callbacks would be configured here');
    }

    return chain;
  }

  /**
   * Validate conversational retrieval configuration
   */
  validateConfig(config: ConversationalRetrievalConfig): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!config.llm) {
      errors.push('LLM is required');
    }

    if (!config.retriever) {
      errors.push('Retriever is required');
    }

    // Optional field validation
    if (config.memoryWindowSize !== undefined && config.memoryWindowSize <= 0) {
      warnings.push('Memory window size should be positive');
    }

    if (config.maxContextTokens !== undefined && config.maxContextTokens <= 0) {
      warnings.push('Max context tokens should be positive');
    }

    // Template validation
    if (config.qaTemplate && !config.qaTemplate.includes('{question}')) {
      warnings.push('QA template should include {question} placeholder');
    }

    if (config.questionGeneratorTemplate && !config.questionGeneratorTemplate.includes('{chat_history}')) {
      warnings.push('Question generator template should include {chat_history} placeholder');
    }

    const isValid = errors.length === 0;

    this.logger.debug('Configuration validation completed', {
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return { isValid, errors, warnings };
  }

  /**
   * Get conversation summary for long chat histories
   */
  async summarizeConversation(llm: BaseLanguageModel, chatHistory: BaseMessage[], maxSummaryTokens = 200): Promise<string> {
    if (chatHistory.length === 0) {
      return '';
    }

    try {
      const conversationText = this.formatChatHistoryForChain(chatHistory);

      const summaryPrompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(
          'Summarize the following conversation in {maxTokens} tokens or less, focusing on key information and context that would be important for continuing the conversation:\n\n{conversation}',
        ),
      ]);

      const summaryChain = RunnableSequence.from([summaryPrompt, llm, new StringOutputParser()]);

      const result = await summaryChain.invoke({
        conversation: conversationText,
        maxTokens: maxSummaryTokens,
      });

      return typeof result === 'string'
        ? result
        : ((result as Record<string, unknown>)?.text as string) || ((result as Record<string, unknown>)?.answer as string) || '';
    } catch (error) {
      this.logger.error('Failed to summarize conversation:', error);
      return '';
    }
  }
}
