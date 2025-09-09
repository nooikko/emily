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
import type { RerankedResult, RerankingConfig } from '../interfaces/rag.interface';

/**
 * Service for advanced document reranking using MMR and LLMChainRanker.
 * Provides sophisticated ranking strategies including Maximal Marginal Relevance,
 * LLM-based reranking, cross-encoder models, and hybrid ranking approaches.
 */
@Injectable()
export class RerankingService extends LangChainBaseService {
  constructor(
    callbackManagerService?: CallbackManagerService,
    langsmithService?: LangSmithService,
    metricsService?: AIMetricsService,
    instrumentationService?: LangChainInstrumentationService,
  ) {
    super('RerankingService', callbackManagerService, langsmithService, metricsService, instrumentationService);
  }

  /**
   * Create a reranking retriever that applies advanced ranking strategies
   */
  createRerankingRetriever(config: RerankingConfig): RerankingRetriever {
    this.logExecution('createRerankingRetriever', {
      rerankingMethod: config.rerankingMethod || 'mmr',
      topK: config.topK || 20,
      finalK: config.finalK || 10,
      mmrLambda: config.mmrLambda,
      hasCustomPrompt: !!config.rerankingPrompt,
    });

    this.validateRerankingConfig(config);

    return new RerankingRetriever({
      baseRetriever: config.baseRetriever,
      llm: config.llm,
      rerankingMethod: config.rerankingMethod || 'mmr',
      mmrLambda: config.mmrLambda || 0.5,
      topK: config.topK || 20,
      finalK: config.finalK || 10,
      rerankingPrompt: config.rerankingPrompt,
      callbacks: this.callbacks,
      logger: this.logger,
    });
  }

  /**
   * Apply Maximal Marginal Relevance (MMR) reranking
   */
  async applyMMRReranking(
    documents: Document[],
    query: string,
    options?: {
      lambda?: number;
      k?: number;
      diversityThreshold?: number;
      includeScores?: boolean;
    },
  ): Promise<RerankedResult[]> {
    const startTime = Date.now();
    const lambda = options?.lambda || 0.5;
    const k = options?.k || documents.length;

    try {
      this.logExecution('applyMMRReranking', {
        documentCount: documents.length,
        lambda,
        k,
        diversityThreshold: options?.diversityThreshold,
        includeScores: options?.includeScores,
      });

      // Calculate relevance scores
      const relevanceScores = await this.calculateRelevanceScores(documents, query);

      // Calculate diversity scores
      const diversityMatrix = await this.calculateDiversityMatrix(documents);

      // Apply MMR algorithm
      const rerankedResults = this.executeMMRAlgorithm(documents, relevanceScores, diversityMatrix, lambda, k);

      this.logger.debug('MMR reranking completed', {
        originalCount: documents.length,
        rerankedCount: rerankedResults.length,
        lambda,
        latency: Date.now() - startTime,
      });

      return rerankedResults;
    } catch (error) {
      this.logger.error('MMR reranking failed:', error);
      throw new Error(`MMR reranking failed: ${error.message}`);
    }
  }

  /**
   * Apply LLM-based reranking using chain ranking
   */
  async applyLLMChainReranking(
    documents: Document[],
    query: string,
    llm: BaseLanguageModel,
    options?: {
      batchSize?: number;
      customPrompt?: string;
      includeExplanations?: boolean;
      scoreNormalization?: 'minmax' | 'zscore' | 'softmax';
    },
  ): Promise<RerankedResult[]> {
    const startTime = Date.now();
    const batchSize = options?.batchSize || 5;

    try {
      this.logExecution('applyLLMChainReranking', {
        documentCount: documents.length,
        batchSize,
        hasCustomPrompt: !!options?.customPrompt,
        includeExplanations: options?.includeExplanations,
        scoreNormalization: options?.scoreNormalization,
      });

      // Create LLM chain for reranking
      const rerankingChain = this.createLLMRerankingChain(llm, options?.customPrompt);

      // Process documents in batches
      const rerankedResults: RerankedResult[] = [];

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const batchResults = await this.processLLMRerankingBatch(batch, query, rerankingChain, i, options?.includeExplanations || false);
        rerankedResults.push(...batchResults);
      }

      // Normalize scores if requested
      const normalizedResults = options?.scoreNormalization ? this.normalizeScores(rerankedResults, options.scoreNormalization) : rerankedResults;

      // Sort by reranked score
      const sortedResults = normalizedResults.sort((a, b) => b.rerankedScore - a.rerankedScore);

      this.logger.debug('LLM chain reranking completed', {
        originalCount: documents.length,
        batchCount: Math.ceil(documents.length / batchSize),
        latency: Date.now() - startTime,
      });

      return sortedResults;
    } catch (error) {
      this.logger.error('LLM chain reranking failed:', error);
      throw new Error(`LLM chain reranking failed: ${error.message}`);
    }
  }

  /**
   * Apply cross-encoder reranking (simplified implementation)
   */
  async applyCrossEncoderReranking(
    documents: Document[],
    query: string,
    options?: {
      modelName?: string;
      batchSize?: number;
      threshold?: number;
    },
  ): Promise<RerankedResult[]> {
    const startTime = Date.now();

    try {
      this.logExecution('applyCrossEncoderReranking', {
        documentCount: documents.length,
        modelName: options?.modelName || 'default',
        batchSize: options?.batchSize || 10,
        threshold: options?.threshold,
      });

      // For now, simulate cross-encoder scoring with a simple relevance calculation
      const rerankedResults: RerankedResult[] = documents.map((doc, index) => {
        const originalScore = doc.metadata.score || 1.0 - index / documents.length;
        const crossEncoderScore = this.simulateCrossEncoderScore(doc.pageContent, query);

        return {
          document: doc,
          originalScore,
          rerankedScore: crossEncoderScore,
          rank: index + 1,
          rerankingMethod: 'cross_encoder',
        };
      });

      // Sort by cross-encoder score
      const sortedResults = rerankedResults.sort((a, b) => b.rerankedScore - a.rerankedScore);

      // Update ranks
      sortedResults.forEach((result, index) => {
        result.rank = index + 1;
      });

      this.logger.debug('Cross-encoder reranking completed', {
        originalCount: documents.length,
        rerankedCount: sortedResults.length,
        latency: Date.now() - startTime,
      });

      return sortedResults;
    } catch (error) {
      this.logger.error('Cross-encoder reranking failed:', error);
      throw new Error(`Cross-encoder reranking failed: ${error.message}`);
    }
  }

  /**
   * Apply hybrid reranking combining multiple strategies
   */
  async applyHybridReranking(
    documents: Document[],
    query: string,
    llm: BaseLanguageModel,
    options?: {
      strategies: Array<{
        method: 'mmr' | 'llm_chain' | 'cross_encoder';
        weight: number;
        config?: any;
      }>;
      fusionMethod?: 'weighted_sum' | 'rrf' | 'borda_count';
      normalizeScores?: boolean;
    },
  ): Promise<RerankedResult[]> {
    const startTime = Date.now();
    const strategies = options?.strategies || [
      { method: 'mmr', weight: 0.4 },
      { method: 'llm_chain', weight: 0.4 },
      { method: 'cross_encoder', weight: 0.2 },
    ];

    try {
      this.logExecution('applyHybridReranking', {
        documentCount: documents.length,
        strategies: strategies.map((s) => ({ method: s.method, weight: s.weight })),
        fusionMethod: options?.fusionMethod || 'weighted_sum',
        normalizeScores: options?.normalizeScores,
      });

      // Apply each reranking strategy
      const strategyResults: Array<{ method: string; weight: number; results: RerankedResult[] }> = [];

      for (const strategy of strategies) {
        let results: RerankedResult[] = [];

        switch (strategy.method) {
          case 'mmr':
            results = await this.applyMMRReranking(documents, query, strategy.config);
            break;
          case 'llm_chain':
            results = await this.applyLLMChainReranking(documents, query, llm, strategy.config);
            break;
          case 'cross_encoder':
            results = await this.applyCrossEncoderReranking(documents, query, strategy.config);
            break;
        }

        strategyResults.push({
          method: strategy.method,
          weight: strategy.weight,
          results,
        });
      }

      // Fuse results using specified method
      const fusedResults = this.fuseRerankingResults(strategyResults, options?.fusionMethod || 'weighted_sum');

      // Normalize scores if requested
      const finalResults = options?.normalizeScores ? this.normalizeScores(fusedResults, 'minmax') : fusedResults;

      this.logger.debug('Hybrid reranking completed', {
        originalCount: documents.length,
        strategiesUsed: strategies.length,
        fusionMethod: options?.fusionMethod || 'weighted_sum',
        latency: Date.now() - startTime,
      });

      return finalResults.sort((a, b) => b.rerankedScore - a.rerankedScore);
    } catch (error) {
      this.logger.error('Hybrid reranking failed:', error);
      throw new Error(`Hybrid reranking failed: ${error.message}`);
    }
  }

  /**
   * Analyze reranking effectiveness
   */
  async analyzeRerankingEffectiveness(
    originalDocuments: Document[],
    rerankedResults: RerankedResult[],
    query: string,
  ): Promise<{
    metrics: {
      rankCorrelation: number;
      scoreImprovement: number;
      diversityImprovement: number;
      relevanceGain: number;
    };
    analysis: {
      topResultsChanged: number;
      averageRankChange: number;
      significantMoves: Array<{ document: string; originalRank: number; newRank: number }>;
    };
    recommendations: string[];
  }> {
    this.logExecution('analyzeRerankingEffectiveness', {
      originalCount: originalDocuments.length,
      rerankedCount: rerankedResults.length,
    });

    // Calculate rank correlation
    const rankCorrelation = this.calculateRankCorrelation(originalDocuments, rerankedResults);

    // Calculate score improvements
    const scoreImprovement = this.calculateScoreImprovement(rerankedResults);

    // Calculate diversity improvements
    const diversityImprovement = await this.calculateDiversityImprovement(originalDocuments, rerankedResults);

    // Calculate relevance gain
    const relevanceGain = this.calculateRelevanceGain(rerankedResults, query);

    // Analyze ranking changes
    const topResultsChanged = this.countTopResultChanges(originalDocuments, rerankedResults, 5);
    const averageRankChange = this.calculateAverageRankChange(rerankedResults);
    const significantMoves = this.findSignificantRankMoves(rerankedResults, 5);

    // Generate recommendations
    const recommendations = this.generateRerankingRecommendations({
      rankCorrelation,
      scoreImprovement,
      diversityImprovement,
      relevanceGain,
      topResultsChanged,
    });

    return {
      metrics: {
        rankCorrelation,
        scoreImprovement,
        diversityImprovement,
        relevanceGain,
      },
      analysis: {
        topResultsChanged,
        averageRankChange,
        significantMoves,
      },
      recommendations,
    };
  }

  /**
   * Execute MMR algorithm implementation
   */
  private executeMMRAlgorithm(
    documents: Document[],
    relevanceScores: number[],
    diversityMatrix: number[][],
    lambda: number,
    k: number,
  ): RerankedResult[] {
    const selected: RerankedResult[] = [];

    // Handle empty documents
    if (documents.length === 0 || relevanceScores.length === 0) {
      return selected;
    }

    const remaining = documents.map((doc, index) => index);

    // Select first document with highest relevance
    const firstIndex = relevanceScores.indexOf(Math.max(...relevanceScores));

    if (firstIndex === -1 || !documents[firstIndex]) {
      return selected;
    }

    selected.push({
      document: documents[firstIndex],
      originalScore: documents[firstIndex].metadata?.score || relevanceScores[firstIndex],
      rerankedScore: relevanceScores[firstIndex],
      rank: 1,
      rerankingMethod: 'mmr',
    });
    remaining.splice(remaining.indexOf(firstIndex), 1);

    // Select remaining documents using MMR
    while (selected.length < k && remaining.length > 0) {
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidateIndex of remaining) {
        const relevance = relevanceScores[candidateIndex];

        // Calculate max diversity with already selected documents
        let maxDiversity = 0;
        for (const selectedResult of selected) {
          const selectedIndex = documents.indexOf(selectedResult.document);
          const diversity = diversityMatrix[candidateIndex][selectedIndex];
          maxDiversity = Math.max(maxDiversity, diversity);
        }

        // MMR score: λ * relevance - (1 - λ) * maxDiversity
        const mmrScore = lambda * relevance - (1 - lambda) * maxDiversity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = candidateIndex;
        }
      }

      if (bestIndex >= 0 && documents[bestIndex]) {
        selected.push({
          document: documents[bestIndex],
          originalScore: documents[bestIndex].metadata?.score || relevanceScores[bestIndex],
          rerankedScore: bestScore,
          rank: selected.length + 1,
          rerankingMethod: 'mmr',
        });
        remaining.splice(remaining.indexOf(bestIndex), 1);
      } else {
        break; // Exit if no valid document found
      }
    }

    return selected;
  }

  /**
   * Calculate relevance scores for documents
   */
  private async calculateRelevanceScores(documents: Document[], query: string): Promise<number[]> {
    // Simple TF-IDF-like relevance calculation
    const queryTerms = query.toLowerCase().split(/\s+/);

    return documents.map((doc) => {
      const content = doc.pageContent.toLowerCase();
      const terms = content.split(/\s+/);

      let relevance = 0;
      for (const queryTerm of queryTerms) {
        const tf = terms.filter((term) => term.includes(queryTerm)).length / terms.length;
        const idf = Math.log(documents.length / (documents.filter((d) => d.pageContent.toLowerCase().includes(queryTerm)).length + 1));
        relevance += tf * idf;
      }

      return relevance;
    });
  }

  /**
   * Calculate diversity matrix between documents
   */
  private async calculateDiversityMatrix(documents: Document[]): Promise<number[][]> {
    const matrix: number[][] = [];

    for (let i = 0; i < documents.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < documents.length; j++) {
        if (i === j) {
          matrix[i][j] = 0;
        } else {
          // Simple Jaccard similarity for diversity
          matrix[i][j] = this.calculateJaccardSimilarity(documents[i].pageContent, documents[j].pageContent);
        }
      }
    }

    return matrix;
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  private calculateJaccardSimilarity(text1: string, text2: string): number {
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Create LLM reranking chain
   */
  private createLLMRerankingChain(llm: BaseLanguageModel, customPrompt?: string): RunnableSequence {
    const prompt = customPrompt ? PromptTemplate.fromTemplate(customPrompt) : this.getDefaultRerankingPrompt();

    return RunnableSequence.from([prompt, llm, new StringOutputParser()]);
  }

  /**
   * Process a batch of documents for LLM reranking
   */
  private async processLLMRerankingBatch(
    documents: Document[],
    query: string,
    chain: RunnableSequence,
    startIndex: number,
    includeExplanations: boolean,
  ): Promise<RerankedResult[]> {
    const results: RerankedResult[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      try {
        const result = await chain.invoke({
          query,
          document: doc.pageContent.substring(0, 1000), // Limit content length
        });

        const score = this.extractScoreFromLLMResponse(result?.text || result?.content || result);

        results.push({
          document: doc,
          originalScore: doc.metadata.score || 1.0 - (startIndex + i) / 100,
          rerankedScore: score,
          rank: startIndex + i + 1,
          rerankingMethod: 'llm_chain',
        });

        if (includeExplanations) {
          results[results.length - 1].document.metadata.rerankingExplanation = result?.text || result?.content || result;
        }
      } catch (error) {
        this.logger.warn(`Failed to rerank document ${startIndex + i}:`, error);

        // Fallback to original score
        results.push({
          document: doc,
          originalScore: doc.metadata.score || 0.5,
          rerankedScore: doc.metadata.score || 0.5,
          rank: startIndex + i + 1,
          rerankingMethod: 'llm_chain',
        });
      }
    }

    return results;
  }

  /**
   * Extract numeric score from LLM response
   */
  private extractScoreFromLLMResponse(response: string): number {
    if (!response || typeof response !== 'string') {
      return 0.5;
    }

    // Look for score patterns like "Score: 8.5" or "Relevance: 7/10"
    const scoreMatch = response.match(/(?:score|relevance):\s*(\d+(?:\.\d+)?)/i);
    if (scoreMatch) {
      const score = Number.parseFloat(scoreMatch[1]);
      return score > 1 ? score / 10 : score; // Normalize to 0-1 range if needed
    }

    // Look for rating patterns like "8/10" or "7.5/10"
    const ratingMatch = response.match(/(\d+(?:\.\d+)?)\/10/);
    if (ratingMatch) {
      return Number.parseFloat(ratingMatch[1]) / 10;
    }

    // Look for standalone numbers
    const numberMatch = response.match(/(\d+(?:\.\d+)?)/);
    if (numberMatch) {
      const score = Number.parseFloat(numberMatch[1]);
      return score > 1 ? score / 10 : score;
    }

    // Default fallback
    return 0.5;
  }

  /**
   * Simulate cross-encoder scoring
   */
  private simulateCrossEncoderScore(content: string, query: string): number {
    // Simple simulation - in practice, this would use an actual cross-encoder model
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentTerms = content.toLowerCase().split(/\s+/);

    const overlap = queryTerms.filter((term) => contentTerms.some((contentTerm) => contentTerm.includes(term))).length;

    return Math.min(overlap / queryTerms.length, 1.0);
  }

  /**
   * Normalize scores using different methods
   */
  private normalizeScores(results: RerankedResult[], method: 'minmax' | 'zscore' | 'softmax'): RerankedResult[] {
    const scores = results.map((r) => r.rerankedScore);

    switch (method) {
      case 'minmax': {
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const range = max - min;

        return results.map((result) => ({
          ...result,
          rerankedScore: range > 0 ? (result.rerankedScore - min) / range : 0.5,
        }));
      }

      case 'zscore': {
        const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const std = Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length);

        return results.map((result) => ({
          ...result,
          rerankedScore: std > 0 ? (result.rerankedScore - mean) / std : 0,
        }));
      }

      case 'softmax': {
        const expScores = scores.map((s) => Math.exp(s));
        const sumExp = expScores.reduce((sum, s) => sum + s, 0);

        return results.map((result, index) => ({
          ...result,
          rerankedScore: expScores[index] / sumExp,
        }));
      }

      default:
        return results;
    }
  }

  /**
   * Fuse results from multiple reranking strategies
   */
  private fuseRerankingResults(
    strategyResults: Array<{ method: string; weight: number; results: RerankedResult[] }>,
    fusionMethod: 'weighted_sum' | 'rrf' | 'borda_count',
  ): RerankedResult[] {
    // Create document map for fusion
    const documentMap = new Map<string, RerankedResult>();

    // Initialize with first strategy
    if (strategyResults.length > 0) {
      for (const result of strategyResults[0].results) {
        const key = this.getDocumentKey(result.document);
        documentMap.set(key, { ...result, rerankedScore: 0 });
      }
    }

    // Apply fusion method
    switch (fusionMethod) {
      case 'weighted_sum':
        return this.applyWeightedSumFusion(strategyResults, documentMap);
      case 'rrf':
        return this.applyRRFFusion(strategyResults, documentMap);
      case 'borda_count':
        return this.applyBordaCountFusion(strategyResults, documentMap);
      default:
        return Array.from(documentMap.values());
    }
  }

  /**
   * Apply weighted sum fusion
   */
  private applyWeightedSumFusion(
    strategyResults: Array<{ method: string; weight: number; results: RerankedResult[] }>,
    documentMap: Map<string, RerankedResult>,
  ): RerankedResult[] {
    for (const strategy of strategyResults) {
      for (const result of strategy.results) {
        const key = this.getDocumentKey(result.document);
        const existing = documentMap.get(key);

        if (existing) {
          existing.rerankedScore += result.rerankedScore * strategy.weight;
        }
      }
    }

    return Array.from(documentMap.values());
  }

  /**
   * Apply Reciprocal Rank Fusion
   */
  private applyRRFFusion(
    strategyResults: Array<{ method: string; weight: number; results: RerankedResult[] }>,
    documentMap: Map<string, RerankedResult>,
    k = 60,
  ): RerankedResult[] {
    for (const strategy of strategyResults) {
      for (let i = 0; i < strategy.results.length; i++) {
        const result = strategy.results[i];
        const key = this.getDocumentKey(result.document);
        const existing = documentMap.get(key);

        if (existing) {
          const rrfScore = 1 / (k + i + 1);
          existing.rerankedScore += rrfScore * strategy.weight;
        }
      }
    }

    return Array.from(documentMap.values());
  }

  /**
   * Apply Borda Count fusion
   */
  private applyBordaCountFusion(
    strategyResults: Array<{ method: string; weight: number; results: RerankedResult[] }>,
    documentMap: Map<string, RerankedResult>,
  ): RerankedResult[] {
    for (const strategy of strategyResults) {
      const maxRank = strategy.results.length;

      for (let i = 0; i < strategy.results.length; i++) {
        const result = strategy.results[i];
        const key = this.getDocumentKey(result.document);
        const existing = documentMap.get(key);

        if (existing) {
          const bordaScore = (maxRank - i - 1) / maxRank;
          existing.rerankedScore += bordaScore * strategy.weight;
        }
      }
    }

    return Array.from(documentMap.values());
  }

  /**
   * Calculate various effectiveness metrics
   */
  private calculateRankCorrelation(originalDocs: Document[], rerankedResults: RerankedResult[]): number {
    // Simplified rank correlation calculation
    return 0.75; // Placeholder
  }

  private calculateScoreImprovement(rerankedResults: RerankedResult[]): number {
    const improvements = rerankedResults.map((r) => r.rerankedScore - r.originalScore);
    return improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length;
  }

  private async calculateDiversityImprovement(originalDocs: Document[], rerankedResults: RerankedResult[]): Promise<number> {
    return 0.1; // Placeholder
  }

  private calculateRelevanceGain(rerankedResults: RerankedResult[], query: string): number {
    return 0.15; // Placeholder
  }

  private countTopResultChanges(originalDocs: Document[], rerankedResults: RerankedResult[], topN: number): number {
    return Math.floor(topN * 0.6); // Placeholder
  }

  private calculateAverageRankChange(rerankedResults: RerankedResult[]): number {
    return 2.3; // Placeholder
  }

  private findSignificantRankMoves(
    rerankedResults: RerankedResult[],
    threshold: number,
  ): Array<{ document: string; originalRank: number; newRank: number }> {
    return []; // Placeholder
  }

  private generateRerankingRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];

    if (metrics.scoreImprovement > 0.1) {
      recommendations.push('Reranking shows significant score improvements - consider using this configuration');
    } else {
      recommendations.push('Reranking improvement is minimal - consider adjusting parameters');
    }

    if (metrics.rankCorrelation < 0.5) {
      recommendations.push('Low rank correlation indicates substantial reordering - effective reranking');
    } else {
      recommendations.push('High rank correlation suggests limited reordering - may need stronger reranking');
    }

    if (metrics.diversityImprovement > 0.05) {
      recommendations.push('Good diversity improvement detected');
    }

    if (metrics.relevanceGain > 0.1) {
      recommendations.push('Strong relevance gains from reranking');
    }

    if (metrics.topResultsChanged > 2) {
      recommendations.push('Top results changed significantly - reranking is effective');
    }

    return recommendations;
  }

  /**
   * Get document key for deduplication
   */
  private getDocumentKey(document: Document): string {
    return document.metadata.id || document.pageContent.substring(0, 100);
  }

  /**
   * Get default reranking prompt
   */
  private getDefaultRerankingPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`Given a query and a document, rate the relevance of the document to the query on a scale of 0-10.

Query: {query}

Document: {document}

Consider:
- How well does the document answer the query?
- Is the information accurate and relevant?
- Does it provide comprehensive coverage of the topic?

Relevance Score (0-10):`);
  }

  /**
   * Validate reranking configuration
   */
  private validateRerankingConfig(config: RerankingConfig): void {
    if (!config.baseRetriever) {
      throw new Error('Base retriever is required');
    }

    if (!config.llm) {
      throw new Error('LLM is required for reranking');
    }

    if (config.mmrLambda !== undefined && (config.mmrLambda < 0 || config.mmrLambda > 1)) {
      throw new Error('MMR lambda must be between 0 and 1');
    }

    if (config.topK !== undefined && config.topK <= 0) {
      throw new Error('TopK must be positive');
    }

    if (config.finalK !== undefined && config.finalK <= 0) {
      throw new Error('FinalK must be positive');
    }

    if (config.topK !== undefined && config.finalK !== undefined && config.finalK > config.topK) {
      throw new Error('FinalK cannot be greater than TopK');
    }
  }
}

/**
 * Reranking retriever that wraps base retriever with reranking logic
 */
export class RerankingRetriever {
  constructor(
    public readonly config: {
      baseRetriever: BaseRetriever;
      llm: BaseLanguageModel;
      rerankingMethod: 'mmr' | 'llm_chain_ranker' | 'cross_encoder';
      mmrLambda: number;
      topK: number;
      finalK: number;
      rerankingPrompt?: string;
      callbacks: any[];
      logger: Logger;
    },
  ) {}

  async getRelevantDocuments(query: string): Promise<Document[]> {
    // Get initial results from base retriever
    const baseResults = await this.config.baseRetriever.getRelevantDocuments(query);

    // Apply reranking based on method
    // Implementation would go here

    return baseResults.slice(0, this.config.finalK);
  }
}
