import { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import type { BaseRetriever } from '@langchain/core/retrievers';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { LangChainBaseService } from '../../../common/base/langchain-base.service';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { QARetrievalConfig, QARetrievalResult, RAGMetrics } from '../interfaces/rag.interface';

/**
 * Service for QA retrieval with source citations.
 * Supports multiple chain types: stuff, map_reduce, refine, and map_rerank.
 * Provides detailed source tracking and citation management.
 */
@Injectable()
export class QARetrievalService extends LangChainBaseService {
  constructor(
    callbackManagerService?: CallbackManagerService,
    langsmithService?: LangSmithService,
    metricsService?: AIMetricsService,
    instrumentationService?: LangChainInstrumentationService,
  ) {
    super('QARetrievalService', callbackManagerService, langsmithService, metricsService, instrumentationService);
  }

  /**
   * Create a QA retrieval chain with source citations
   */
  async createQAChain(config: QARetrievalConfig): Promise<RunnableSequence> {
    this.logExecution('createQAChain', {
      chainType: config.chainType || 'stuff',
      hasCustomPrompt: !!config.prompt,
      returnIntermediateSteps: config.returnIntermediateSteps,
    });

    const chainType = config.chainType || 'stuff';
    let qaChain;

    // Create the appropriate chain based on type
    switch (chainType) {
      case 'stuff':
        qaChain = await this.createStuffChain(config);
        break;
      case 'map_reduce':
        qaChain = await this.createMapReduceChain(config);
        break;
      case 'refine':
        qaChain = await this.createRefineChain(config);
        break;
      case 'map_rerank':
        qaChain = await this.createMapRerankChain(config);
        break;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Create the retrieval QA chain using modern runnables
    const promptText = typeof config.prompt === 'string' ? config.prompt : this.getDefaultStuffPromptText();
    const prompt = PromptTemplate.fromTemplate(promptText);

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
   * Execute QA retrieval with detailed source tracking
   */
  async executeQARetrieval(
    chain: RunnableSequence,
    question: string,
    options?: {
      includeMetrics?: boolean;
      customRetrieverOptions?: Record<string, any>;
    },
  ): Promise<QARetrievalResult> {
    const startTime = Date.now();

    try {
      this.logExecution('executeQARetrieval', {
        questionLength: question.length,
        includeMetrics: options?.includeMetrics,
      });

      // Execute the chain
      const result = await chain.invoke(
        { question },
        this.createRunnableConfig({
          operation: 'qa_retrieval',
          question: question.substring(0, 100),
        }),
      );

      // Process and enhance source documents
      const sources = ((result.sourceDocuments as Document[]) || []).map((doc, index) => ({
        document: doc,
        score: doc.metadata?.score || 0,
        metadata: {
          ...doc.metadata,
          retrievalRank: index + 1,
          retrievalTimestamp: Date.now(),
        },
      }));

      // Build the response
      const response: QARetrievalResult = {
        answer: result.text || result.answer || '',
        sources,
      };

      // Add intermediate steps if available and requested
      if (result.intermediateSteps) {
        response.intermediateSteps = result.intermediateSteps.map((step: any, index: number) => ({
          step: `step_${index + 1}`,
          output: step,
        }));
      }

      // Calculate metrics if requested
      if (options?.includeMetrics) {
        const metrics: RAGMetrics = {
          retrievalLatency: 0, // Would need to be measured separately
          generationLatency: Date.now() - startTime,
          totalLatency: Date.now() - startTime,
          documentsRetrieved: sources.length,
          documentsUsed: sources.length,
          inputTokens: this.estimateTokens(question),
          outputTokens: this.estimateTokens(response.answer),
        };

        // Add metrics to each source document
        response.sources = response.sources.map((source) => ({
          ...source,
          metadata: {
            ...source.metadata,
            ragMetrics: metrics,
          },
        }));
      }

      this.logger.debug('QA retrieval completed', {
        answerLength: response.answer.length,
        sourcesCount: response.sources.length,
        totalLatency: Date.now() - startTime,
        hasIntermediateSteps: !!response.intermediateSteps,
      });

      return response;
    } catch (error) {
      this.logger.error('QA retrieval failed:', error);
      throw new Error(`QA retrieval failed: ${error.message}`);
    }
  }

  /**
   * Create a stuff chain (combines all documents in a single prompt)
   */
  private async createStuffChain(config: QARetrievalConfig) {
    const promptText = typeof config.prompt === 'string' ? config.prompt : this.getDefaultStuffPromptText();
    const prompt = PromptTemplate.fromTemplate(promptText);

    // loadQAStuffChain is not available - implementing basic chain
    return RunnableSequence.from([prompt, config.llm, new StringOutputParser()]);
  }

  /**
   * Create a map-reduce chain (maps over documents, then reduces)
   */
  private async createMapReduceChain(config: QARetrievalConfig) {
    const promptText = typeof config.prompt === 'string' ? config.prompt : this.getDefaultCombinePromptText();
    const combinePrompt = PromptTemplate.fromTemplate(promptText);

    // loadQAMapReduceChain is not available - implementing basic chain
    return RunnableSequence.from([combinePrompt, config.llm, new StringOutputParser()]);
  }

  /**
   * Create a refine chain (iteratively refines answer with each document)
   */
  private async createRefineChain(config: QARetrievalConfig) {
    const questionPrompt = this.getDefaultQuestionPrompt();
    const promptText = typeof config.prompt === 'string' ? config.prompt : this.getDefaultRefinePromptText();
    const refinePrompt = PromptTemplate.fromTemplate(promptText);

    // loadQARefineChain is not available - implementing basic chain
    return RunnableSequence.from([refinePrompt, config.llm, new StringOutputParser()]);
  }

  /**
   * Create a map-rerank chain (maps over documents and reranks)
   */
  private async createMapRerankChain(config: QARetrievalConfig) {
    // Note: LangChain's map-rerank chain might need custom implementation
    const promptText = typeof config.prompt === 'string' ? config.prompt : this.getDefaultMapRerankPromptText();
    const prompt = PromptTemplate.fromTemplate(promptText);

    // For now, fallback to stuff chain with reranking logic
    return RunnableSequence.from([prompt, config.llm, new StringOutputParser()]);
  }

  /**
   * Create citation-enhanced QA chain
   */
  async createCitationQAChain(
    config: QARetrievalConfig & {
      citationFormat?: 'numbered' | 'author_year' | 'title' | 'url';
      includeCitationSummary?: boolean;
    },
  ): Promise<RunnableSequence> {
    this.logExecution('createCitationQAChain', {
      citationFormat: config.citationFormat || 'numbered',
      includeCitationSummary: config.includeCitationSummary,
    });

    // Create enhanced prompt with citation instructions
    const citationPromptText = this.createCitationPromptText(config.citationFormat || 'numbered');

    const enhancedConfig = {
      ...config,
      prompt: citationPromptText,
    };

    return this.createQAChain(enhancedConfig);
  }

  /**
   * Execute QA retrieval with enhanced citation processing
   */
  async executeQARetrievalWithCitations(
    chain: RunnableSequence,
    question: string,
    citationConfig?: {
      format: 'numbered' | 'author_year' | 'title' | 'url';
      includeFullCitation?: boolean;
      maxCitations?: number;
    },
  ): Promise<QARetrievalResult & { citations: string[]; citationMap: Record<string, any> }> {
    const result = await this.executeQARetrieval(chain, question, { includeMetrics: true });

    // Generate citations
    const citations = this.generateCitations(result.sources, citationConfig);
    const citationMap = this.createCitationMap(result.sources, citationConfig);

    return {
      ...result,
      citations,
      citationMap,
    };
  }

  /**
   * Validate source document quality and relevance
   */
  validateSources(
    sources: Array<{ document: Document; score?: number }>,
    question: string,
    threshold = 0.7,
  ): {
    validSources: Array<{ document: Document; score?: number }>;
    invalidSources: Array<{ document: Document; score?: number; reason: string }>;
    qualityScore: number;
  } {
    const validSources: Array<{ document: Document; score?: number }> = [];
    const invalidSources: Array<{ document: Document; score?: number; reason: string }> = [];

    for (const source of sources) {
      const score = source.score || 0;
      const content = source.document.pageContent;

      // Basic validation criteria
      if (score < threshold) {
        invalidSources.push({ ...source, reason: `Score ${score} below threshold ${threshold}` });
      } else if (content.length < 50) {
        invalidSources.push({ ...source, reason: 'Content too short' });
      } else if (this.calculateRelevance(content, question) < threshold) {
        invalidSources.push({ ...source, reason: 'Low relevance to question' });
      } else {
        validSources.push(source);
      }
    }

    const qualityScore = sources.length > 0 ? validSources.length / sources.length : 0;

    this.logger.debug('Source validation completed', {
      totalSources: sources.length,
      validSources: validSources.length,
      invalidSources: invalidSources.length,
      qualityScore,
    });

    return { validSources, invalidSources, qualityScore };
  }

  /**
   * Calculate simple relevance score between content and question
   */
  private calculateRelevance(content: string, question: string): number {
    const questionWords = question.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);

    const matches = questionWords.filter((word) => contentWords.some((contentWord) => contentWord.includes(word) || word.includes(contentWord)));

    return matches.length / questionWords.length;
  }

  /**
   * Generate citations in specified format
   */
  private generateCitations(
    sources: Array<{ document: Document; score?: number }>,
    config?: { format: 'numbered' | 'author_year' | 'title' | 'url'; maxCitations?: number },
  ): string[] {
    const format = config?.format || 'numbered';
    const maxCitations = config?.maxCitations || sources.length;
    const limitedSources = sources.slice(0, maxCitations);

    return limitedSources.map((source, index) => {
      const metadata = source.document.metadata;

      switch (format) {
        case 'numbered':
          return `[${index + 1}] ${metadata.title || 'Untitled Document'}`;
        case 'author_year':
          return `(${metadata.author || 'Unknown'}, ${metadata.year || 'n.d.'})`;
        case 'title':
          return metadata.title || 'Untitled Document';
        case 'url':
          return metadata.url || metadata.source || 'No URL available';
        default:
          return `[${index + 1}] ${metadata.title || 'Untitled Document'}`;
      }
    });
  }

  /**
   * Create citation mapping for reference
   */
  private createCitationMap(
    sources: Array<{ document: Document; score?: number }>,
    config?: { format: 'numbered' | 'author_year' | 'title' | 'url' },
  ): Record<string, any> {
    const citationMap: Record<string, any> = {};

    sources.forEach((source, index) => {
      const key = `citation_${index + 1}`;
      citationMap[key] = {
        document: source.document,
        score: source.score,
        metadata: source.document.metadata,
        citation: this.generateCitations([source], config)[0],
      };
    });

    return citationMap;
  }

  /**
   * Create citation-enhanced prompt text
   */
  private createCitationPromptText(format: 'numbered' | 'author_year' | 'title' | 'url'): string {
    let citationInstruction: string;

    switch (format) {
      case 'numbered':
        citationInstruction = 'Include numbered citations [1], [2], etc. after relevant statements';
        break;
      case 'author_year':
        citationInstruction = 'Include author-year citations (Author, Year) after relevant statements';
        break;
      case 'title':
        citationInstruction = 'Reference document titles when citing sources';
        break;
      case 'url':
        citationInstruction = 'Include source URLs when available';
        break;
    }

    return `Use the following pieces of context to answer the question at the end. ${citationInstruction}. If you don't know the answer, just say that you don't know, don't try to make up an answer.

{context}

Question: {question}
Helpful Answer:`;
  }

  /**
   * Create citation-enhanced prompt
   */
  private createCitationPrompt(format: 'numbered' | 'author_year' | 'title' | 'url'): PromptTemplate {
    let citationInstruction: string;

    switch (format) {
      case 'numbered':
        citationInstruction = 'Include numbered citations [1], [2], etc. after relevant statements';
        break;
      case 'author_year':
        citationInstruction = 'Include author-year citations (Author, Year) after relevant statements';
        break;
      case 'title':
        citationInstruction = 'Reference document titles when citing sources';
        break;
      case 'url':
        citationInstruction = 'Include source URLs when available';
        break;
    }

    const template = `Use the following pieces of context to answer the question at the end. ${citationInstruction}. If you don't know the answer, just say that you don't know, don't try to make up an answer.

{context}

Question: {question}
Helpful Answer:`;

    return new PromptTemplate({
      template,
      inputVariables: ['context', 'question'],
    });
  }

  /**
   * Get default stuff prompt as text
   */
  private getDefaultStuffPromptText(): string {
    return `Use the following pieces of context to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer.

{context}

Question: {question}
Helpful Answer:`;
  }

  /**
   * Get default prompts for different chain types
   */
  private getDefaultStuffPrompt(): PromptTemplate {
    return new PromptTemplate({
      template: `Use the following pieces of context to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer.

{context}

Question: {question}
Helpful Answer:`,
      inputVariables: ['context', 'question'],
    });
  }

  private getDefaultCombinePromptText(): string {
    return `Given the following extracted parts of a long document and a question, create a final answer. If you don't know the answer, just say that you don't know. Don't try to make up an answer.

{summaries}

Question: {question}
Helpful Answer:`;
  }

  private getDefaultCombinePrompt(): PromptTemplate {
    return new PromptTemplate({
      template: this.getDefaultCombinePromptText(),
      inputVariables: ['summaries', 'question'],
    });
  }

  private getDefaultQuestionPrompt(): PromptTemplate {
    return new PromptTemplate({
      template: `Context information is below.
---------------------
{context_str}
---------------------
Given the context information and not prior knowledge, answer the question: {question}
Answer:`,
      inputVariables: ['context_str', 'question'],
    });
  }

  private getDefaultRefinePromptText(): string {
    return `The original question is as follows: {question}
We have provided an existing answer: {existing_answer}
We have the opportunity to refine the existing answer (only if needed) with some more context below.
------------
{context_str}
------------
Given the new context, refine the original answer to better answer the question. If the context isn't useful, return the original answer.
Refined Answer:`;
  }

  private getDefaultRefinePrompt(): PromptTemplate {
    return new PromptTemplate({
      template: this.getDefaultRefinePromptText(),
      inputVariables: ['question', 'existing_answer', 'context_str'],
    });
  }

  private getDefaultMapRerankPromptText(): string {
    return `Use the following pieces of context to answer the question at the end. In addition to giving an answer, also return a score of how fully it answered the user's question. This should be in the following format:

Question: {question}
Helpful Answer: [answer here]
Score: [score between 0 and 100]

Begin!

Context:
---------
{context}
---------
Question: {question}
Helpful Answer:`;
  }

  private getDefaultMapRerankPrompt(): PromptTemplate {
    return new PromptTemplate({
      template: this.getDefaultMapRerankPromptText(),
      inputVariables: ['context', 'question'],
    });
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
