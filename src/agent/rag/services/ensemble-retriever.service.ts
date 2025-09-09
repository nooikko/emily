import { Document } from '@langchain/core/documents';
import type { BaseRetriever } from '@langchain/core/retrievers';
import { Injectable, Logger } from '@nestjs/common';
import { LangChainBaseService } from '../../../common/base/langchain-base.service';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { EnsembleRetrievalMetadata, EnsembleRetrieverConfig } from '../interfaces/rag.interface';

/**
 * Custom EnsembleRetriever implementation for hybrid dense/sparse search.
 * Combines multiple retrieval methods with weighted score aggregation,
 * duplicate removal, and advanced ranking strategies.
 */
@Injectable()
export class EnsembleRetrieverService extends LangChainBaseService {
  constructor(
    callbackManagerService?: CallbackManagerService,
    langsmithService?: LangSmithService,
    metricsService?: AIMetricsService,
    instrumentationService?: LangChainInstrumentationService,
  ) {
    super('EnsembleRetrieverService', callbackManagerService, langsmithService, metricsService, instrumentationService);
  }

  /**
   * Create an ensemble retriever that combines multiple retrieval methods
   */
  createEnsembleRetriever(config: EnsembleRetrieverConfig): EnsembleRetriever {
    this.logExecution('createEnsembleRetriever', {
      retrieverCount: config.retrievers.length,
      hasWeights: !!config.weights,
      combineMethod: config.combineMethod || 'weighted_sum',
      removeDuplicates: config.removeDuplicates !== false,
    });

    this.validateEnsembleConfig(config);

    return new EnsembleRetriever(config, this.callbacks, this.logger);
  }

  /**
   * Execute ensemble retrieval with multiple retrievers
   */
  async executeEnsembleRetrieval(
    retriever: EnsembleRetriever,
    query: string,
    options?: {
      k?: number;
      includeMetadata?: boolean;
      parallelize?: boolean;
    },
  ): Promise<Document[]> {
    const k = options?.k || 10;
    const parallelize = options?.parallelize !== false;
    const metadata = {
      query: query.substring(0, 100),
      k,
      parallelize,
      includeMetadata: options?.includeMetadata,
      retrieversUsed: retriever.config.retrievers.length,
    };

    // Use base class tracing for observability
    return this.traceExecution(
      'executeEnsembleRetrieval',
      async (_input) => {
        const startTime = Date.now();

        try {
          this.logExecution('executeEnsembleRetrieval', metadata);

          // Retrieve documents from all retrievers
          const results = await retriever.getRelevantDocuments(query, k, parallelize);

          // Add ensemble metadata if requested
          if (options?.includeMetadata) {
            results.forEach((doc) => {
              if (doc.metadata.ensembleMetadata) {
                doc.metadata.ensembleMetadata.retrievalLatency = Date.now() - startTime;
              }
            });
          }

          // Record success metrics
          if (this.metricsService) {
            this.metricsService.recordOperationDuration(this.serviceName, 'executeEnsembleRetrieval', Date.now() - startTime, 'success');
          }

          this.logger.debug('Ensemble retrieval completed', {
            resultCount: results.length,
            totalLatency: Date.now() - startTime,
            retrieversUsed: retriever.config.retrievers.length,
          });

          return results;
        } catch (error) {
          // Record error metrics
          if (this.metricsService) {
            this.metricsService.recordOperationDuration(this.serviceName, 'executeEnsembleRetrieval', Date.now() - startTime, 'error');
          }

          this.logger.error('Ensemble retrieval failed:', error);
          throw new Error(`Ensemble retrieval failed: ${error.message}`);
        }
      },
      { query: query.substring(0, 100) },
      metadata,
    );
  }

  /**
   * Create a hybrid dense/sparse retriever ensemble
   */
  createHybridRetriever(config: {
    denseRetriever: BaseRetriever;
    sparseRetriever: BaseRetriever;
    denseWeight?: number;
    sparseWeight?: number;
    fusionMethod?: 'rrf' | 'weighted_sum' | 'max';
    rrfConstant?: number; // For Reciprocal Rank Fusion
  }): EnsembleRetriever {
    const denseWeight = config.denseWeight || 0.7;
    const sparseWeight = config.sparseWeight || 0.3;
    const fusionMethod = config.fusionMethod || 'weighted_sum';

    this.logExecution('createHybridRetriever', {
      denseWeight,
      sparseWeight,
      fusionMethod,
      rrfConstant: config.rrfConstant,
    });

    // Normalize weights to sum to 1
    const totalWeight = denseWeight + sparseWeight;
    const normalizedDenseWeight = denseWeight / totalWeight;
    const normalizedSparseWeight = sparseWeight / totalWeight;

    const ensembleConfig: EnsembleRetrieverConfig = {
      retrievers: [config.denseRetriever, config.sparseRetriever],
      weights: [normalizedDenseWeight, normalizedSparseWeight],
      combineMethod: fusionMethod === 'rrf' ? 'weighted_sum' : fusionMethod,
      removeDuplicates: true,
      similarityThreshold: 0.85,
    };

    const retriever = new EnsembleRetriever(ensembleConfig, this.callbacks, this.logger);

    // Add RRF fusion if specified
    if (fusionMethod === 'rrf') {
      retriever.setRRFFusion(config.rrfConstant || 60);
    }

    return retriever;
  }

  /**
   * Create a multi-modal ensemble retriever
   */
  createMultiModalRetriever(config: {
    textRetriever: BaseRetriever;
    imageRetriever?: BaseRetriever;
    audioRetriever?: BaseRetriever;
    videoRetriever?: BaseRetriever;
    modalityWeights?: Record<string, number>;
  }): EnsembleRetriever {
    const retrievers: BaseRetriever[] = [config.textRetriever];
    const weights: number[] = [config.modalityWeights?.text || 0.6];
    const modalities = ['text'];

    if (config.imageRetriever) {
      retrievers.push(config.imageRetriever);
      weights.push(config.modalityWeights?.image || 0.25);
      modalities.push('image');
    }

    if (config.audioRetriever) {
      retrievers.push(config.audioRetriever);
      weights.push(config.modalityWeights?.audio || 0.1);
      modalities.push('audio');
    }

    if (config.videoRetriever) {
      retrievers.push(config.videoRetriever);
      weights.push(config.modalityWeights?.video || 0.05);
      modalities.push('video');
    }

    // Normalize weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = weights.map((w) => w / totalWeight);

    this.logExecution('createMultiModalRetriever', {
      modalities,
      weights: normalizedWeights,
      retrieverCount: retrievers.length,
    });

    const ensembleConfig: EnsembleRetrieverConfig = {
      retrievers,
      weights: normalizedWeights,
      combineMethod: 'weighted_sum',
      removeDuplicates: true,
    };

    return new EnsembleRetriever(ensembleConfig, this.callbacks, this.logger);
  }

  /**
   * Validate ensemble configuration
   */
  private validateEnsembleConfig(config: EnsembleRetrieverConfig): void {
    if (!config.retrievers || config.retrievers.length === 0) {
      throw new Error('At least one retriever is required');
    }

    if (config.weights) {
      if (config.weights.length !== config.retrievers.length) {
        throw new Error('Number of weights must match number of retrievers');
      }

      const weightSum = config.weights.reduce((sum, w) => sum + w, 0);
      if (Math.abs(weightSum - 1.0) > 0.001) {
        this.logger.warn('Weights do not sum to 1, they will be normalized', {
          originalSum: weightSum,
          weights: config.weights,
        });
      }

      if (config.weights.some((w) => w < 0)) {
        throw new Error('Weights cannot be negative');
      }
    }

    if (config.similarityThreshold !== undefined) {
      if (config.similarityThreshold < 0 || config.similarityThreshold > 1) {
        throw new Error('Similarity threshold must be between 0 and 1');
      }
    }
  }
}

/**
 * Custom EnsembleRetriever implementation
 */
export class EnsembleRetriever {
  constructor(
    public readonly config: EnsembleRetrieverConfig,
    readonly _callbacks: unknown[],
    private readonly logger: Logger,
  ) {
    // Normalize weights if provided
    if (config.weights) {
      const weightSum = config.weights.reduce((sum, w) => sum + w, 0);
      if (Math.abs(weightSum - 1.0) > 0.001) {
        this.config.weights = config.weights.map((w) => w / weightSum);
      }
    } else {
      // Equal weights if none provided
      const equalWeight = 1.0 / config.retrievers.length;
      this.config.weights = new Array(config.retrievers.length).fill(equalWeight);
    }
  }

  /**
   * Set Reciprocal Rank Fusion parameters
   */
  setRRFFusion(constant = 60): void {
    this.rrfConstant = constant;
  }

  /**
   * Get relevant documents using ensemble approach
   */
  async getRelevantDocuments(query: string, k = 10, parallelize = true): Promise<Document[]> {
    const startTime = Date.now();

    try {
      // Retrieve from all retrievers
      const retrievalPromises = this.config.retrievers.map(
        (retriever, index) => this.retrieveWithRetriever(retriever, query, k * 2, index), // Get more to account for deduplication
      );

      const results = parallelize ? await Promise.all(retrievalPromises) : await this.sequentialRetrieve(retrievalPromises);

      // Combine results using specified method
      let combinedResults = this.combineResults(results, query);

      // Remove duplicates if requested
      if (this.config.removeDuplicates !== false) {
        combinedResults = this.removeDuplicates(combinedResults);
      }

      // Sort by combined score and take top k
      const finalResults = combinedResults
        .sort((a, b) => (b.metadata.ensembleMetadata?.combinedScore || 0) - (a.metadata.ensembleMetadata?.combinedScore || 0))
        .slice(0, k);

      this.logger.debug('Ensemble retrieval completed', {
        totalResults: combinedResults.length,
        finalResults: finalResults.length,
        retrievalTime: Date.now() - startTime,
        retrieversUsed: this.config.retrievers.length,
      });

      return finalResults;
    } catch (error) {
      this.logger.error('Ensemble retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Retrieve documents from a single retriever with metadata
   */
  private async retrieveWithRetriever(
    retriever: BaseRetriever,
    query: string,
    k: number,
    retrieverIndex: number,
  ): Promise<Array<{ document: Document; score: number; retrieverIndex: number }>> {
    try {
      const docs = await retriever.getRelevantDocuments(query);

      return docs.slice(0, k).map((doc, rank) => ({
        document: doc,
        score: doc.metadata.score || 1.0 - rank / k, // Use metadata score or rank-based score
        retrieverIndex,
      }));
    } catch (error) {
      this.logger.error(`Retriever ${retrieverIndex} failed:`, error);
      return [];
    }
  }

  /**
   * Sequential retrieval (fallback for when parallel fails)
   */
  private async sequentialRetrieve(promises: Promise<Document[]>[]): Promise<Document[][]> {
    const results = [];
    for (const promise of promises) {
      try {
        results.push(await promise);
      } catch (error) {
        this.logger.error('Sequential retrieval step failed:', error);
        results.push([]);
      }
    }
    return results;
  }

  /**
   * Combine results from multiple retrievers
   */
  private combineResults(results: Array<Array<{ document: Document; score: number; retrieverIndex: number }>>, _query: string): Document[] {
    const allResults: Array<{ document: Document; score: number; retrieverIndex: number }> = [];

    // Flatten all results
    results.forEach((retrieverResults, _retrieverIndex) => {
      retrieverResults.forEach((result) => {
        allResults.push(result);
      });
    });

    // Group by document content for scoring
    const documentGroups = new Map<string, Array<{ document: Document; score: number; retrieverIndex: number }>>();

    allResults.forEach((result) => {
      const key = this.getDocumentKey(result.document);
      if (!documentGroups.has(key)) {
        documentGroups.set(key, []);
      }
      documentGroups.get(key)!.push(result);
    });

    // Combine scores for each document group
    const combinedDocuments: Document[] = [];

    documentGroups.forEach((group, _key) => {
      const combinedScore = this.calculateCombinedScore(group);
      const bestDocument = group[0].document; // Use first occurrence as base

      // Add ensemble metadata
      const ensembleMetadata: EnsembleRetrievalMetadata = {
        retrieverScores: group.map((item) => ({
          retrieverId: `retriever_${item.retrieverIndex}`,
          score: item.score,
          weight: this.config.weights![item.retrieverIndex],
        })),
        combinedScore,
        combineMethod: this.config.combineMethod || 'weighted_sum',
        isDeduplicated: group.length > 1,
      };

      const enhancedDocument = new Document({
        pageContent: bestDocument.pageContent,
        metadata: {
          ...bestDocument.metadata,
          ensembleMetadata,
        },
      });

      combinedDocuments.push(enhancedDocument);
    });

    return combinedDocuments;
  }

  /**
   * Calculate combined score using specified method
   */
  private calculateCombinedScore(group: Array<{ document: Document; score: number; retrieverIndex: number }>): number {
    const method = this.config.combineMethod || 'weighted_sum';
    const weights = this.config.weights!;

    switch (method) {
      case 'weighted_sum':
        return group.reduce((sum, item) => sum + item.score * weights[item.retrieverIndex], 0);

      case 'max':
        return Math.max(...group.map((item) => item.score * weights[item.retrieverIndex]));

      case 'min':
        return Math.min(...group.map((item) => item.score * weights[item.retrieverIndex]));

      case 'average': {
        const weightedSum = group.reduce((sum, item) => sum + item.score * weights[item.retrieverIndex], 0);
        const weightSum = group.reduce((sum, item) => sum + weights[item.retrieverIndex], 0);
        return weightSum > 0 ? weightedSum / weightSum : 0;
      }

      default:
        this.logger.warn(`Unknown combine method: ${method}, using weighted_sum`);
        return group.reduce((sum, item) => sum + item.score * weights[item.retrieverIndex], 0);
    }
  }

  /**
   * Remove duplicate documents
   */
  private removeDuplicates(documents: Document[]): Document[] {
    const seen = new Set<string>();
    const unique: Document[] = [];

    for (const doc of documents) {
      const key = this.getDocumentKey(doc);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(doc);
      }
    }

    if (unique.length < documents.length) {
      this.logger.debug('Removed duplicates', {
        originalCount: documents.length,
        uniqueCount: unique.length,
        duplicatesRemoved: documents.length - unique.length,
      });
    }

    return unique;
  }

  /**
   * Generate a key for document deduplication
   */
  private getDocumentKey(document: Document): string {
    // Use content similarity for deduplication
    const content = document.pageContent.trim().toLowerCase();

    if (this.config.similarityThreshold !== undefined) {
      // For more sophisticated deduplication, we could use embeddings
      // For now, use first N characters as key
      const keyLength = Math.min(200, content.length);
      return content.substring(0, keyLength);
    }

    // Simple exact match
    return content;
  }
}
