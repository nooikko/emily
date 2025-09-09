import { Document } from '@langchain/core/documents';
import { Runnable } from '@langchain/core/runnables';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentChunkingService } from './document-chunking.service';
import { DocumentLoaderService } from './document-loader.service';
import { DocumentPipelineService } from './document-pipeline.service';
import { DocumentTransformationService } from './document-transformation.service';
import { DocumentVersioningService } from './document-versioning.service';
import { MetadataExtractionService } from './metadata-extraction.service';

describe('DocumentPipelineService', () => {
  let service: DocumentPipelineService;
  let _documentLoader: jest.Mocked<DocumentLoaderService>;
  let documentChunking: jest.Mocked<DocumentChunkingService>;
  let metadataExtraction: jest.Mocked<MetadataExtractionService>;
  let documentVersioning: jest.Mocked<DocumentVersioningService>;
  let documentTransformation: jest.Mocked<DocumentTransformationService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentPipelineService,
        {
          provide: DocumentLoaderService,
          useValue: {
            load: jest.fn(),
          },
        },
        {
          provide: DocumentChunkingService,
          useValue: {
            chunkDocument: jest.fn(),
          },
        },
        {
          provide: MetadataExtractionService,
          useValue: {
            batchExtractMetadata: jest.fn(),
            extractMetadata: jest.fn(),
            enrichDocument: jest.fn(),
          },
        },
        {
          provide: DocumentVersioningService,
          useValue: {
            createVersion: jest.fn(),
          },
        },
        {
          provide: DocumentTransformationService,
          useValue: {
            createPreprocessingChain: jest.fn(),
            createEnrichmentChain: jest.fn(),
            transformationChains: new Map(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentPipelineService>(DocumentPipelineService);
    _documentLoader = module.get(DocumentLoaderService) as jest.Mocked<DocumentLoaderService>;
    documentChunking = module.get(DocumentChunkingService) as jest.Mocked<DocumentChunkingService>;
    metadataExtraction = module.get(MetadataExtractionService) as jest.Mocked<MetadataExtractionService>;
    documentVersioning = module.get(DocumentVersioningService) as jest.Mocked<DocumentVersioningService>;
    documentTransformation = module.get(DocumentTransformationService) as jest.Mocked<DocumentTransformationService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  describe('pipeline registration', () => {
    it('should initialize default pipelines', () => {
      const standardPipeline = service.pipelines.get('standard-processing');
      const ragPipeline = service.pipelines.get('rag-optimized');
      const quickPipeline = service.pipelines.get('quick-analysis');

      expect(standardPipeline).toBeDefined();
      expect(standardPipeline?.stages).toHaveLength(4);
      expect(ragPipeline).toBeDefined();
      expect(ragPipeline?.stages).toHaveLength(5);
      expect(quickPipeline).toBeDefined();
      expect(quickPipeline?.stages).toHaveLength(2);
    });

    it('should register a custom pipeline', () => {
      const customPipeline = {
        name: 'custom-pipeline',
        description: 'Custom test pipeline',
        stages: [
          { name: 'stage1', type: 'transform' as const, enabled: true },
          { name: 'stage2', type: 'chunk' as const, enabled: true },
        ],
      };

      service.registerPipeline(customPipeline);
      const registered = service.pipelines.get('custom-pipeline');

      expect(registered).toBeDefined();
      expect(registered?.name).toBe('custom-pipeline');
      expect(registered?.stages).toHaveLength(2);
    });
  });

  describe('executePipeline', () => {
    it('should execute a simple pipeline successfully', async () => {
      const documents = [new Document({ pageContent: 'Test content', metadata: {} })];
      const transformedDoc = new Document({ pageContent: 'Transformed content', metadata: { transformed: true } });
      const chunkedDocs = [new Document({ pageContent: 'Chunk 1', metadata: {} }), new Document({ pageContent: 'Chunk 2', metadata: {} })];

      // Mock transformation chain
      const mockChain: Runnable = {
        invoke: jest.fn().mockResolvedValue(transformedDoc),
      } as Runnable;
      documentTransformation.createPreprocessingChain.mockResolvedValue(mockChain);

      // Mock chunking
      documentChunking.chunkDocument.mockResolvedValue(chunkedDocs);

      // Mock metadata extraction
      metadataExtraction.batchExtractMetadata.mockResolvedValue(chunkedDocs);

      // Mock versioning
      documentVersioning.createVersion.mockResolvedValue({
        versionId: 'v1',
        versionNumber: 1,
        timestamp: new Date(),
        hash: 'hash123',
        document: chunkedDocs[0],
        metadata: {
          validFrom: new Date(),
          changeType: 'create',
        },
      });

      const pipeline = {
        name: 'test-pipeline',
        stages: [
          { name: 'transform', type: 'transform' as const, enabled: true },
          { name: 'chunk', type: 'chunk' as const, enabled: true },
        ],
      };

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('test-pipeline', documents);

      expect(result.success).toBe(true);
      expect(result.pipelineName).toBe('test-pipeline');
      expect(result.stages).toHaveLength(2);
      expect(result.finalDocuments).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(eventEmitter.emit).toHaveBeenCalledWith('pipeline.started', expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith('pipeline.completed', expect.any(Object));
    });

    it('should handle pipeline errors with stopOnError=false', async () => {
      const documents = [new Document({ pageContent: 'Test content' })];

      // Mock a failing transformation
      documentTransformation.createPreprocessingChain.mockRejectedValue(new Error('Transform failed'));

      const pipeline = {
        name: 'error-pipeline',
        stages: [
          { name: 'transform', type: 'transform' as const, enabled: true },
          { name: 'chunk', type: 'chunk' as const, enabled: true },
        ],
        errorHandling: {
          stopOnError: false,
        },
      };

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('error-pipeline', documents);

      expect(result.success).toBe(true); // Pipeline continues despite error
      expect(result.errors).toContain("Stage 'transform' failed: Transform failed");
      expect(result.stages[0].success).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith('stage.failed', expect.any(Object));
    });

    it('should handle pipeline errors with stopOnError=true', async () => {
      const documents = [new Document({ pageContent: 'Test content' })];

      documentTransformation.createPreprocessingChain.mockRejectedValue(new Error('Critical error'));

      const pipeline = {
        name: 'strict-pipeline',
        stages: [{ name: 'transform', type: 'transform' as const, enabled: true }],
        errorHandling: {
          stopOnError: true,
        },
      };

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('strict-pipeline', documents);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Stage 'transform' failed: Critical error");
      expect(eventEmitter.emit).toHaveBeenCalledWith('pipeline.failed', expect.any(Object));
    });

    it('should skip disabled stages', async () => {
      const documents = [new Document({ pageContent: 'Test content' })];

      const pipeline = {
        name: 'partial-pipeline',
        stages: [
          { name: 'transform', type: 'transform' as const, enabled: false },
          { name: 'chunk', type: 'chunk' as const, enabled: true },
        ],
      };

      documentChunking.chunkDocument.mockResolvedValue([documents[0]]);

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('partial-pipeline', documents);

      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].name).toBe('chunk');
      expect(documentTransformation.createPreprocessingChain).not.toHaveBeenCalled();
    });

    it('should throw error for non-existent pipeline', async () => {
      const documents = [new Document({ pageContent: 'Test' })];
      await expect(service.executePipeline('non-existent', documents)).rejects.toThrow("Pipeline 'non-existent' not found");
    });

    it('should apply versioning when configured', async () => {
      const documents = [new Document({ pageContent: 'Test content' })];

      const pipeline = {
        name: 'versioned-pipeline',
        stages: [],
        versioning: {
          enabled: true,
          strategy: 'timestamp' as const,
        },
      };

      const mockVersion = {
        versionId: 'v1',
        versionNumber: 1,
        timestamp: new Date(),
        hash: 'hash123',
        document: documents[0],
        metadata: {
          validFrom: new Date(),
          changeType: 'create' as const,
        },
      };

      documentVersioning.createVersion.mockResolvedValue(mockVersion);

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('versioned-pipeline', documents);

      expect(result.versions).toHaveLength(1);
      expect(result.versions![0]).toBe(mockVersion);
      expect(documentVersioning.createVersion).toHaveBeenCalledWith(documents[0], pipeline.versioning);
    });

    it('should handle fallback pipeline on failure', async () => {
      const documents = [new Document({ pageContent: 'Test content' })];

      // Main pipeline fails
      documentTransformation.createPreprocessingChain.mockRejectedValueOnce(new Error('Main pipeline failed'));

      // Fallback pipeline succeeds
      documentTransformation.createPreprocessingChain.mockResolvedValueOnce({
        invoke: jest.fn().mockResolvedValue(documents[0]),
      } as Runnable);

      const mainPipeline = {
        name: 'main-pipeline',
        stages: [{ name: 'transform', type: 'transform' as const, enabled: true }],
        errorHandling: {
          stopOnError: true,
          fallbackPipeline: 'fallback-pipeline',
        },
      };

      const fallbackPipeline = {
        name: 'fallback-pipeline',
        stages: [{ name: 'simple-transform', type: 'transform' as const, enabled: true }],
      };

      service.registerPipeline(mainPipeline);
      service.registerPipeline(fallbackPipeline);

      const result = await service.executePipeline('main-pipeline', documents);

      expect(result.pipelineName).toBe('fallback-pipeline');
      expect(result.success).toBe(true);
    });
  });

  describe('pipeline state management', () => {
    it('should track pipeline state during execution', async () => {
      const documents = [new Document({ pageContent: 'Test' })];

      const pipeline = {
        name: 'state-pipeline',
        stages: [{ name: 'stage1', type: 'transform' as const, enabled: true }],
      };

      documentTransformation.createPreprocessingChain.mockResolvedValue({
        invoke: jest.fn().mockImplementation(async () => {
          // Check state during execution
          const pipelineId = Array.from(service.pipelineStates.keys())[0];
          const state = await service.getPipelineState(pipelineId);
          expect(state?.status).toBe('running');
          expect(state?.currentStage).toBe('stage1');
          return documents[0];
        }),
      } as Runnable);

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('state-pipeline', documents);

      const state = await service.getPipelineState(result.pipelineId);
      expect(state?.status).toBe('completed');
      expect(state?.progress).toBe(100);
    });

    it('should cancel running pipeline', async () => {
      const _documents = [new Document({ pageContent: 'Test' })];

      // Create a state manually
      const pipelineId = 'test-pipeline-id';
      service.pipelineStates.set(pipelineId, {
        pipelineId,
        status: 'running',
        progress: 50,
        documentsProcessed: 1,
        totalDocuments: 2,
        errors: [],
      });

      const cancelled = await service.cancelPipeline(pipelineId);
      expect(cancelled).toBe(true);

      const state = await service.getPipelineState(pipelineId);
      expect(state?.status).toBe('cancelled');
      expect(eventEmitter.emit).toHaveBeenCalledWith('pipeline.cancelled', { pipelineId });
    });

    it('should not cancel non-running pipeline', async () => {
      const pipelineId = 'completed-pipeline';
      service.pipelineStates.set(pipelineId, {
        pipelineId,
        status: 'completed',
        progress: 100,
        documentsProcessed: 1,
        totalDocuments: 1,
        errors: [],
      });

      const cancelled = await service.cancelPipeline(pipelineId);
      expect(cancelled).toBe(false);
    });
  });

  describe('pipeline metrics', () => {
    it('should track pipeline execution history', async () => {
      // Add some execution history
      service.executionHistory.push({
        pipelineId: 'exec1',
        pipelineName: 'test-pipeline',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        success: true,
        documentsProcessed: 5,
        stages: [],
        errors: [],
        finalDocuments: [],
      });

      service.executionHistory.push({
        pipelineId: 'exec2',
        pipelineName: 'test-pipeline',
        startTime: new Date(),
        endTime: new Date(),
        duration: 2000,
        success: false,
        documentsProcessed: 3,
        stages: [],
        errors: ['Error 1', 'Error 1'],
        finalDocuments: [],
      });

      const history = await service.getPipelineHistory(2);
      expect(history).toHaveLength(2);

      const metrics = await service.getPipelineMetrics('test-pipeline');
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(1);
      expect(metrics.averageDuration).toBe(1500);
      expect(metrics.averageDocumentsProcessed).toBe(4);
      expect(metrics.mostCommonErrors).toContainEqual({ error: 'Error 1', count: 2 });
    });

    it('should return empty metrics for no executions', async () => {
      const metrics = await service.getPipelineMetrics('non-existent');
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.successfulExecutions).toBe(0);
      expect(metrics.averageDuration).toBe(0);
    });
  });

  describe('createCustomPipeline', () => {
    it('should create custom pipeline from transformation chains', async () => {
      // Mock transformation chains
      documentTransformation.transformationChains.set('chain1', {
        name: 'chain1',
        description: 'Test chain 1',
        type: 'preprocessing',
        chain: { invoke: jest.fn() } as Runnable,
      });

      documentTransformation.transformationChains.set('chain2', {
        name: 'chain2',
        description: 'Test chain 2',
        type: 'enrichment',
        chain: { invoke: jest.fn() } as Runnable,
      });

      const customPipeline = await service.createCustomPipeline('my-custom', [
        { chainName: 'chain1', config: { option1: true } },
        { chainName: 'chain2' },
      ]);

      expect(customPipeline.name).toBe('my-custom');
      expect(customPipeline.stages).toHaveLength(2);
      expect(customPipeline.stages[0].name).toBe('chain1');
      expect(customPipeline.stages[0].config).toEqual({ option1: true });
      expect(customPipeline.stages[1].name).toBe('chain2');

      const registered = service.pipelines.get('my-custom');
      expect(registered).toBeDefined();
    });

    it('should throw error for non-existent chain', async () => {
      await expect(service.createCustomPipeline('invalid', [{ chainName: 'non-existent' }])).rejects.toThrow("Chain 'non-existent' not found");
    });
  });

  describe('stage execution with retries', () => {
    it('should retry failed stages', async () => {
      const documents = [new Document({ pageContent: 'Test' })];
      let attempts = 0;

      // Fail twice, succeed on third attempt
      documentTransformation.createPreprocessingChain.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return {
          invoke: jest.fn().mockResolvedValue(documents[0]),
        } as Runnable;
      });

      const pipeline = {
        name: 'retry-pipeline',
        stages: [{ name: 'transform', type: 'transform' as const, enabled: true, retryCount: 3 }],
      };

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('retry-pipeline', documents);

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const documents = [new Document({ pageContent: 'Test' })];

      documentTransformation.createPreprocessingChain.mockRejectedValue(new Error('Persistent failure'));

      const pipeline = {
        name: 'fail-pipeline',
        stages: [{ name: 'transform', type: 'transform' as const, enabled: true }],
        errorHandling: {
          maxRetries: 2,
          stopOnError: true,
        },
      };

      service.registerPipeline(pipeline);
      const result = await service.executePipeline('fail-pipeline', documents);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Persistent failure');
    });
  });
});
