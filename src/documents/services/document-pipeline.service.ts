import { Document } from '@langchain/core/documents';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DocumentChunkingConfig,
  DocumentLoadResult,
  DocumentTransformationConfig,
  DocumentVersioningConfig,
  MetadataExtractionConfig,
} from '../interfaces/document-loader.interface';
import { DocumentChunkingService } from './document-chunking.service';
import { DocumentLoaderService } from './document-loader.service';
import { DocumentTransformationService } from './document-transformation.service';
import { DocumentVersion, DocumentVersioningService } from './document-versioning.service';
import { MetadataExtractionService } from './metadata-extraction.service';

export interface PipelineStage {
  name: string;
  type: 'load' | 'transform' | 'chunk' | 'extract' | 'version' | 'custom';
  enabled: boolean;
  config?: any;
  runnable?: Runnable;
  retryCount?: number;
  timeout?: number;
  continueOnError?: boolean;
}

export interface DocumentPipelineConfig {
  name: string;
  description?: string;
  stages: PipelineStage[];
  parallel?: boolean;
  versioning?: DocumentVersioningConfig;
  errorHandling?: {
    stopOnError?: boolean;
    retryFailedStages?: boolean;
    maxRetries?: number;
    fallbackPipeline?: string;
  };
  monitoring?: {
    emitEvents?: boolean;
    collectMetrics?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface PipelineExecutionResult {
  pipelineId: string;
  pipelineName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  documentsProcessed: number;
  stages: {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
    documentsOutput?: number;
  }[];
  errors: string[];
  finalDocuments: Document[];
  versions?: DocumentVersion[];
}

export interface PipelineState {
  pipelineId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage?: string;
  progress: number;
  documentsProcessed: number;
  totalDocuments: number;
  startTime?: Date;
  errors: string[];
}

@Injectable()
export class DocumentPipelineService {
  private readonly logger = new Logger(DocumentPipelineService.name);
  private readonly pipelines = new Map<string, DocumentPipelineConfig>();
  private readonly pipelineStates = new Map<string, PipelineState>();
  private readonly executionHistory: PipelineExecutionResult[] = [];

  constructor(
    readonly _documentLoader: DocumentLoaderService,
    private readonly documentChunking: DocumentChunkingService,
    private readonly metadataExtraction: MetadataExtractionService,
    private readonly documentVersioning: DocumentVersioningService,
    private readonly documentTransformation: DocumentTransformationService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.logger.log('DocumentPipelineService initialized');
    this.initializeDefaultPipelines();
  }

  private initializeDefaultPipelines(): void {
    // Standard document processing pipeline
    this.registerPipeline({
      name: 'standard-processing',
      description: 'Standard document processing with chunking and metadata extraction',
      stages: [
        { name: 'transform-preprocessing', type: 'transform', enabled: true },
        { name: 'chunk-documents', type: 'chunk', enabled: true },
        { name: 'extract-metadata', type: 'extract', enabled: true },
        { name: 'version-documents', type: 'version', enabled: true },
      ],
      errorHandling: {
        stopOnError: false,
        retryFailedStages: true,
        maxRetries: 3,
      },
      monitoring: {
        emitEvents: true,
        collectMetrics: true,
        logLevel: 'info',
      },
    });

    // RAG-optimized pipeline
    this.registerPipeline({
      name: 'rag-optimized',
      description: 'Pipeline optimized for RAG applications with semantic chunking',
      stages: [
        { name: 'clean-text', type: 'transform', enabled: true },
        { name: 'semantic-chunk', type: 'chunk', enabled: true },
        { name: 'extract-entities', type: 'extract', enabled: true },
        { name: 'generate-embeddings', type: 'custom', enabled: true },
        { name: 'version-for-rag', type: 'version', enabled: true },
      ],
      parallel: false,
      errorHandling: {
        stopOnError: true,
        maxRetries: 2,
      },
    });

    // Quick analysis pipeline
    this.registerPipeline({
      name: 'quick-analysis',
      description: 'Fast pipeline for quick document analysis',
      stages: [
        { name: 'basic-clean', type: 'transform', enabled: true },
        { name: 'extract-summary', type: 'extract', enabled: true },
      ],
      parallel: true,
      errorHandling: {
        stopOnError: false,
      },
    });
  }

  registerPipeline(config: DocumentPipelineConfig): void {
    this.pipelines.set(config.name, config);
    this.logger.debug(`Registered pipeline: ${config.name}`);
  }

  async executePipeline(
    pipelineName: string,
    documents: Document[] | DocumentLoadResult,
    options?: { config?: RunnableConfig; metadata?: Record<string, any> },
  ): Promise<PipelineExecutionResult> {
    const pipeline = this.pipelines.get(pipelineName);
    if (!pipeline) {
      throw new Error(`Pipeline '${pipelineName}' not found`);
    }

    const pipelineId = this.generatePipelineId();
    const startTime = new Date();
    const state: PipelineState = {
      pipelineId,
      status: 'running',
      progress: 0,
      documentsProcessed: 0,
      totalDocuments: Array.isArray(documents) ? documents.length : documents.documents.length,
      startTime,
      errors: [],
    };

    this.pipelineStates.set(pipelineId, state);
    this.emitPipelineEvent('pipeline.started', { pipelineId, pipelineName, pipeline });

    const result: PipelineExecutionResult = {
      pipelineId,
      pipelineName,
      startTime,
      endTime: new Date(),
      duration: 0,
      success: true,
      documentsProcessed: 0,
      stages: [],
      errors: [],
      finalDocuments: [],
      versions: [],
    };

    try {
      // Normalize input to Document array
      let currentDocuments: Document[] = Array.isArray(documents) ? documents : documents.documents;

      // Execute each stage
      for (const stage of pipeline.stages) {
        if (!stage.enabled) {
          this.logger.debug(`Skipping disabled stage: ${stage.name}`);
          continue;
        }

        state.currentStage = stage.name;
        this.emitPipelineEvent('stage.started', { pipelineId, stageName: stage.name });

        const stageStartTime = Date.now();
        try {
          currentDocuments = await this.executeStage(stage, currentDocuments, pipeline, options);

          const stageDuration = Date.now() - stageStartTime;
          result.stages.push({
            name: stage.name,
            success: true,
            duration: stageDuration,
            documentsOutput: currentDocuments.length,
          });

          state.documentsProcessed = currentDocuments.length;
          state.progress = ((pipeline.stages.indexOf(stage) + 1) / pipeline.stages.length) * 100;

          this.emitPipelineEvent('stage.completed', { pipelineId, stageName: stage.name, duration: stageDuration });
        } catch (error) {
          const stageDuration = Date.now() - stageStartTime;
          const errorMessage = `Stage '${stage.name}' failed: ${error.message}`;

          result.stages.push({
            name: stage.name,
            success: false,
            duration: stageDuration,
            error: errorMessage,
          });

          result.errors.push(errorMessage);
          state.errors.push(errorMessage);

          this.emitPipelineEvent('stage.failed', { pipelineId, stageName: stage.name, error: errorMessage });

          if (pipeline.errorHandling?.stopOnError && !stage.continueOnError) {
            throw new Error(errorMessage);
          }
        }
      }

      // Apply versioning if configured
      if (pipeline.versioning?.enabled) {
        const versions = await this.applyVersioning(currentDocuments, pipeline.versioning);
        result.versions = versions;
      }

      result.finalDocuments = currentDocuments;
      result.documentsProcessed = currentDocuments.length;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      state.status = 'completed';
      state.progress = 100;

      this.emitPipelineEvent('pipeline.completed', { pipelineId, result });
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      state.status = 'failed';
      state.errors.push(error.message);

      this.emitPipelineEvent('pipeline.failed', { pipelineId, error: error.message });

      // Try fallback pipeline if configured
      if (pipeline.errorHandling?.fallbackPipeline) {
        this.logger.log(`Attempting fallback pipeline: ${pipeline.errorHandling.fallbackPipeline}`);
        return this.executePipeline(pipeline.errorHandling.fallbackPipeline, documents, options);
      }
    } finally {
      this.executionHistory.push(result);
      if (this.executionHistory.length > 100) {
        this.executionHistory.shift(); // Keep only last 100 executions
      }
    }

    return result;
  }

  private async executeStage(
    stage: PipelineStage,
    documents: Document[],
    pipeline: DocumentPipelineConfig,
    options?: { config?: RunnableConfig; metadata?: Record<string, any> },
  ): Promise<Document[]> {
    let retries = stage.retryCount || pipeline.errorHandling?.maxRetries || 1;
    let lastError: Error | undefined;

    while (retries > 0) {
      try {
        switch (stage.type) {
          case 'transform':
            return await this.executeTransformStage(stage, documents, options);
          case 'chunk':
            return await this.executeChunkStage(stage, documents);
          case 'extract':
            return await this.executeExtractStage(stage, documents);
          case 'version':
            return await this.executeVersionStage(stage, documents);
          case 'custom':
            return await this.executeCustomStage(stage, documents, options);
          default:
            throw new Error(`Unknown stage type: ${stage.type}`);
        }
      } catch (error) {
        lastError = error;
        retries--;
        if (retries > 0) {
          this.logger.debug(`Retrying stage ${stage.name}, ${retries} attempts remaining`);
          await this.delay(1000 * (stage.retryCount || 1 - retries)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error(`Stage ${stage.name} failed after all retries`);
  }

  private async executeTransformStage(
    stage: PipelineStage,
    documents: Document[],
    options?: { config?: RunnableConfig; metadata?: Record<string, any> },
  ): Promise<Document[]> {
    const transformConfig: DocumentTransformationConfig = stage.config || {
      cleaning: {
        removeExtraWhitespace: true,
        normalizeUnicode: true,
      },
    };

    const chain = await this.documentTransformation.createPreprocessingChain(transformConfig);
    const results: Document[] = [];

    for (const doc of documents) {
      const transformed = await chain.invoke(doc, options?.config);
      results.push(transformed as Document);
    }

    return results;
  }

  private async executeChunkStage(stage: PipelineStage, documents: Document[]): Promise<Document[]> {
    const chunkConfig: DocumentChunkingConfig = stage.config || {
      chunkSize: 1000,
      chunkOverlap: 200,
    };

    const allChunks: Document[] = [];
    for (const doc of documents) {
      const chunks = await this.documentChunking.chunkDocument(doc, chunkConfig);
      allChunks.push(...chunks);
    }

    return allChunks;
  }

  private async executeExtractStage(stage: PipelineStage, documents: Document[]): Promise<Document[]> {
    const extractConfig: MetadataExtractionConfig = stage.config || {
      extractFileProperties: true,
      extractContentMetadata: true,
    };

    return await this.metadataExtraction.batchExtractMetadata(documents, extractConfig);
  }

  private async executeVersionStage(stage: PipelineStage, documents: Document[]): Promise<Document[]> {
    const versionConfig: DocumentVersioningConfig = stage.config || {
      enabled: true,
      strategy: 'timestamp',
    };

    const versionedDocs: Document[] = [];
    for (const doc of documents) {
      const version = await this.documentVersioning.createVersion(doc, versionConfig);
      versionedDocs.push(version.document);
    }

    return versionedDocs;
  }

  private async executeCustomStage(
    stage: PipelineStage,
    documents: Document[],
    options?: { config?: RunnableConfig; metadata?: Record<string, any> },
  ): Promise<Document[]> {
    if (!stage.runnable) {
      throw new Error(`Custom stage '${stage.name}' has no runnable defined`);
    }

    const results: Document[] = [];
    for (const doc of documents) {
      const result = await stage.runnable.invoke(doc, options?.config);
      results.push(result as Document);
    }

    return results;
  }

  private async applyVersioning(documents: Document[], config: DocumentVersioningConfig): Promise<DocumentVersion[]> {
    const versions: DocumentVersion[] = [];
    for (const doc of documents) {
      const version = await this.documentVersioning.createVersion(doc, config);
      versions.push(version);
    }
    return versions;
  }

  async createCustomPipeline(name: string, stages: Array<{ chainName: string; config?: any }>): Promise<DocumentPipelineConfig> {
    const pipelineStages: PipelineStage[] = [];

    for (const stage of stages) {
      const chain = this.documentTransformation.transformationChains.get(stage.chainName);
      if (!chain) {
        throw new Error(`Chain '${stage.chainName}' not found`);
      }

      pipelineStages.push({
        name: stage.chainName,
        type: 'custom',
        enabled: true,
        config: stage.config,
        runnable: chain.chain,
      });
    }

    const pipeline: DocumentPipelineConfig = {
      name,
      description: `Custom pipeline with ${stages.length} stages`,
      stages: pipelineStages,
      errorHandling: {
        stopOnError: false,
        retryFailedStages: true,
        maxRetries: 2,
      },
      monitoring: {
        emitEvents: true,
        collectMetrics: true,
        logLevel: 'info',
      },
    };

    this.registerPipeline(pipeline);
    return pipeline;
  }

  async getPipelineState(pipelineId: string): Promise<PipelineState | null> {
    return this.pipelineStates.get(pipelineId) || null;
  }

  async cancelPipeline(pipelineId: string): Promise<boolean> {
    const state = this.pipelineStates.get(pipelineId);
    if (!state || state.status !== 'running') {
      return false;
    }

    state.status = 'cancelled';
    this.emitPipelineEvent('pipeline.cancelled', { pipelineId });
    return true;
  }

  async getPipelineHistory(limit = 10): Promise<PipelineExecutionResult[]> {
    return this.executionHistory.slice(-limit);
  }

  async getPipelineMetrics(pipelineName?: string): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    averageDocumentsProcessed: number;
    mostCommonErrors: Array<{ error: string; count: number }>;
  }> {
    const relevantExecutions = pipelineName ? this.executionHistory.filter((e) => e.pipelineName === pipelineName) : this.executionHistory;

    if (relevantExecutions.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        averageDocumentsProcessed: 0,
        mostCommonErrors: [],
      };
    }

    const successfulExecutions = relevantExecutions.filter((e) => e.success).length;
    const totalDuration = relevantExecutions.reduce((sum, e) => sum + e.duration, 0);
    const totalDocuments = relevantExecutions.reduce((sum, e) => sum + e.documentsProcessed, 0);

    // Count errors
    const errorCounts = new Map<string, number>();
    for (const execution of relevantExecutions) {
      for (const error of execution.errors) {
        errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
      }
    }

    const mostCommonErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    return {
      totalExecutions: relevantExecutions.length,
      successfulExecutions,
      failedExecutions: relevantExecutions.length - successfulExecutions,
      averageDuration: totalDuration / relevantExecutions.length,
      averageDocumentsProcessed: totalDocuments / relevantExecutions.length,
      mostCommonErrors,
    };
  }

  private generatePipelineId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private emitPipelineEvent(event: string, data: any): void {
    if (this.pipelines.get(data.pipelineName || '')?.monitoring?.emitEvents !== false) {
      this.eventEmitter.emit(event, data);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
