import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DocumentMetadata, VectorDocument } from '../../vectors/interfaces/embeddings.interface';
import { QdrantService } from '../../vectors/services/qdrant.service';
import { DocumentTransformationService } from './document-transformation.service';
import { MetadataExtractionService } from './metadata-extraction.service';

export interface IntegrationConfig {
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
  collectionName: string;
  enableMonitoring: boolean;
  maxRetries: number;
  retryDelay: number;
}

export interface IndexingResult {
  documentId: string;
  chunks: number;
  vectorsStored: number;
  processingTime: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}

export interface BatchProcessingResult {
  totalDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  totalVectors: number;
  processingTime: number;
  results: IndexingResult[];
}

export interface RetrievalOptions {
  query: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
  collectionName?: string;
}

@Injectable()
export class DocumentVectorIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(DocumentVectorIntegrationService.name);
  private readonly defaultConfig: IntegrationConfig = {
    batchSize: 10,
    chunkSize: 1000,
    chunkOverlap: 200,
    collectionName: 'documents',
    enableMonitoring: true,
    maxRetries: 3,
    retryDelay: 1000,
  };

  private textSplitter: RecursiveCharacterTextSplitter;
  private processingMetrics = {
    totalDocumentsProcessed: 0,
    totalChunksCreated: 0,
    totalVectorsStored: 0,
    averageProcessingTime: 0,
    failureRate: 0,
  };

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly transformationService: DocumentTransformationService,
    private readonly metadataService: MetadataExtractionService,
  ) {}

  async onModuleInit() {
    this.initializeTextSplitter();
    this.logger.log('DocumentVectorIntegrationService initialized');
  }

  private initializeTextSplitter(config?: Partial<IntegrationConfig>) {
    const finalConfig = { ...this.defaultConfig, ...config };
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: finalConfig.chunkSize,
      chunkOverlap: finalConfig.chunkOverlap,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });
  }

  private ensureTextSplitter(config?: Partial<IntegrationConfig>) {
    if (!this.textSplitter) {
      this.initializeTextSplitter(config);
    }
  }

  /**
   * Process and index a single document
   */
  async indexDocument(document: Document, config?: Partial<IntegrationConfig>): Promise<IndexingResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };
    const result: IndexingResult = {
      documentId: document.metadata?.id || `doc_${Date.now()}`,
      chunks: 0,
      vectorsStored: 0,
      processingTime: 0,
      status: 'success',
      errors: [],
    };

    try {
      // Step 1: Apply preprocessing transformations
      const preprocessingChain = await this.transformationService.createPreprocessingChain();
      const preprocessedDoc = await preprocessingChain.invoke({ document });

      // Step 2: Extract and enrich metadata
      const enrichedMetadata = await this.metadataService.extractMetadata(preprocessedDoc.pageContent);
      preprocessedDoc.metadata = {
        ...preprocessedDoc.metadata,
        ...enrichedMetadata,
        indexedAt: new Date().toISOString(),
      };

      // Step 3: Split into chunks
      this.ensureTextSplitter(finalConfig);
      const chunks = await this.textSplitter.splitDocuments([preprocessedDoc]);
      result.chunks = chunks.length;

      // Step 4: Prepare vector documents
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        content: chunk.pageContent,
        metadata: {
          ...chunk.metadata,
          documentId: result.documentId,
          chunkIndex: index,
          totalChunks: chunks.length,
        } as DocumentMetadata,
      }));

      // Step 5: Store in vector database
      await this.qdrantService.addDocuments(vectorDocuments, finalConfig.collectionName);
      result.vectorsStored = vectorDocuments.length;

      // Update metrics
      this.updateMetrics(result);

      result.processingTime = Date.now() - startTime;
      this.logger.debug(`Indexed document ${result.documentId}: ${result.chunks} chunks, ${result.vectorsStored} vectors`);

      return result;
    } catch (error) {
      result.status = 'failed';
      result.errors?.push(error instanceof Error ? error.message : String(error));
      result.processingTime = Date.now() - startTime;

      this.logger.error(`Failed to index document ${result.documentId}:`, error);
      throw error;
    }
  }

  /**
   * Process and index multiple documents in batch
   */
  async indexDocumentBatch(documents: Document[], config?: Partial<IntegrationConfig>): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };
    const batchResult: BatchProcessingResult = {
      totalDocuments: documents.length,
      successfulDocuments: 0,
      failedDocuments: 0,
      totalChunks: 0,
      totalVectors: 0,
      processingTime: 0,
      results: [],
    };

    // Process documents in batches
    for (let i = 0; i < documents.length; i += finalConfig.batchSize) {
      const batch = documents.slice(i, i + finalConfig.batchSize);
      const batchPromises = batch.map(async (doc) => {
        let retries = 0;
        while (retries < finalConfig.maxRetries) {
          try {
            const result = await this.indexDocument(doc, config);
            return result;
          } catch (error) {
            retries++;
            if (retries < finalConfig.maxRetries) {
              await this.delay(finalConfig.retryDelay * retries);
            } else {
              return {
                documentId: doc.metadata?.id || `doc_${Date.now()}`,
                chunks: 0,
                vectorsStored: 0,
                processingTime: 0,
                status: 'failed' as const,
                errors: [error instanceof Error ? error.message : String(error)],
              };
            }
          }
        }
      });

      const batchResults = await Promise.all(batchPromises.filter(Boolean) as Promise<IndexingResult>[]);

      // Aggregate results
      for (const result of batchResults) {
        batchResult.results.push(result);
        if (result.status === 'success') {
          batchResult.successfulDocuments++;
          batchResult.totalChunks += result.chunks;
          batchResult.totalVectors += result.vectorsStored;
        } else {
          batchResult.failedDocuments++;
        }
      }

      // Add delay between batches to prevent overwhelming the system
      if (i + finalConfig.batchSize < documents.length) {
        await this.delay(500);
      }
    }

    batchResult.processingTime = Date.now() - startTime;

    this.logger.log(
      `Batch processing complete: ${batchResult.successfulDocuments}/${batchResult.totalDocuments} documents, ` +
        `${batchResult.totalChunks} chunks, ${batchResult.totalVectors} vectors in ${batchResult.processingTime}ms`,
    );

    return batchResult;
  }

  /**
   * Create and execute a custom indexing pipeline
   */
  async createIndexingPipeline(
    pipelineConfig: {
      name: string;
      steps: Array<{
        name: string;
        type: 'transform' | 'enrich' | 'chunk' | 'index';
        config?: Record<string, unknown>;
      }>;
    },
    config?: Partial<IntegrationConfig>,
  ): Promise<(documents: Document[]) => Promise<BatchProcessingResult>> {
    const finalConfig = { ...this.defaultConfig, ...config };

    return async (documents: Document[]) => {
      let processedDocs = documents;

      for (const step of pipelineConfig.steps) {
        switch (step.type) {
          case 'transform': {
            const transformations = (step.config?.transformations as string[]) || [];
            const transformChain = await this.transformationService.createCustomTransformation(transformations);
            processedDocs = await Promise.all(processedDocs.map((doc) => transformChain.invoke({ document: doc })));
            break;
          }

          case 'enrich': {
            const enrichments = (step.config?.enrichments as string[]) || [];
            const enrichmentChain = await this.transformationService.createEnrichmentChain(enrichments);
            processedDocs = await Promise.all(processedDocs.map((doc) => enrichmentChain.invoke({ document: doc })));
            break;
          }

          case 'chunk': {
            const chunkSize = (step.config?.chunkSize as number) || finalConfig.chunkSize;
            const chunkOverlap = (step.config?.chunkOverlap as number) || finalConfig.chunkOverlap;
            const splitter = new RecursiveCharacterTextSplitter({
              chunkSize,
              chunkOverlap,
              separators: ['\n\n', '\n', '. ', ' ', ''],
            });
            const chunkedDocs: Document[] = [];
            for (const doc of processedDocs) {
              const chunks = await splitter.splitDocuments([doc]);
              chunkedDocs.push(...chunks);
            }
            processedDocs = chunkedDocs;
            break;
          }

          case 'index':
            // Final indexing step
            return this.indexDocumentBatch(processedDocs, finalConfig);
        }
      }

      // If no explicit index step, perform default indexing
      return this.indexDocumentBatch(processedDocs, finalConfig);
    };
  }

  /**
   * Retrieve relevant documents based on query
   */
  async retrieveDocuments(options: RetrievalOptions): Promise<Document[]> {
    const { query, limit = 10, scoreThreshold = 0.7, filter, includeMetadata = true, collectionName = this.defaultConfig.collectionName } = options;

    try {
      const results = await this.qdrantService.similaritySearch(query, limit, collectionName, { filter });

      // Filter by score threshold and convert to Documents
      const documents = results
        .filter((result) => result.score >= scoreThreshold)
        .map(
          (result) =>
            new Document({
              pageContent: result.content,
              metadata: includeMetadata ? result.metadata : {},
            }),
        );

      this.logger.debug(`Retrieved ${documents.length} documents for query: "${query.substring(0, 50)}..."`);

      return documents;
    } catch (error) {
      this.logger.error('Failed to retrieve documents:', error);
      throw error;
    }
  }

  /**
   * Retrieve documents with their similarity scores
   */
  async retrieveDocumentsWithScores(options: RetrievalOptions): Promise<Array<[Document, number]>> {
    const { query, limit = 10, scoreThreshold = 0.7, filter, includeMetadata = true, collectionName = this.defaultConfig.collectionName } = options;

    try {
      const results = await this.qdrantService.similaritySearch(query, limit, collectionName, { filter });

      // Filter by score threshold and convert to [Document, score] pairs
      const documentsWithScores = results
        .filter((result) => result.score >= scoreThreshold)
        .map(
          (result) =>
            [
              new Document({
                pageContent: result.content,
                metadata: includeMetadata ? result.metadata : {},
              }),
              result.score,
            ] as [Document, number],
        );

      this.logger.debug(`Retrieved ${documentsWithScores.length} documents with scores for query: "${query.substring(0, 50)}..."`);

      return documentsWithScores;
    } catch (error) {
      this.logger.error('Failed to retrieve documents with scores:', error);
      throw error;
    }
  }

  /**
   * Get indexing metrics
   */
  getIndexingMetrics() {
    return { ...this.processingMetrics };
  }

  /**
   * Reset indexing metrics
   */
  resetMetrics() {
    this.processingMetrics = {
      totalDocumentsProcessed: 0,
      totalChunksCreated: 0,
      totalVectorsStored: 0,
      averageProcessingTime: 0,
      failureRate: 0,
    };
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName?: string) {
    const collection = collectionName || this.defaultConfig.collectionName;
    try {
      const info = await this.qdrantService.getCollectionInfo(collection);
      return {
        name: info.name,
        vectorsCount: info.vectorsCount,
        indexedVectorsCount: info.indexedVectorsCount,
        pointsCount: info.pointsCount,
        status: info.status,
        config: info.config,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats for ${collection}:`, error);
      throw error;
    }
  }

  /**
   * Clear all documents from a collection
   */
  async clearCollection(collectionName?: string): Promise<void> {
    const collection = collectionName || this.defaultConfig.collectionName;
    try {
      await this.qdrantService.deleteCollection(collection);
      this.logger.log(`Cleared collection: ${collection}`);
    } catch (error) {
      this.logger.error(`Failed to clear collection ${collection}:`, error);
      throw error;
    }
  }

  private updateMetrics(result: IndexingResult) {
    if (!this.defaultConfig.enableMonitoring) {
      return;
    }

    this.processingMetrics.totalDocumentsProcessed++;
    this.processingMetrics.totalChunksCreated += result.chunks;
    this.processingMetrics.totalVectorsStored += result.vectorsStored;

    // Update average processing time
    const currentTotal = this.processingMetrics.averageProcessingTime * (this.processingMetrics.totalDocumentsProcessed - 1);
    this.processingMetrics.averageProcessingTime = (currentTotal + result.processingTime) / this.processingMetrics.totalDocumentsProcessed;

    // Update failure rate
    if (result.status === 'failed') {
      const failedCount = Math.floor(this.processingMetrics.failureRate * this.processingMetrics.totalDocumentsProcessed);
      this.processingMetrics.failureRate = (failedCount + 1) / this.processingMetrics.totalDocumentsProcessed;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
