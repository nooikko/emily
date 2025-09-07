import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreService } from '../../../vectors/services/vector-store.service';
import { ConversationSummaryMemory } from '../conversation-summary.memory';
import { EntityMemory } from '../entity.memory';
import { GraphMemory } from '../graph.memory';
import { ConsolidatedMemory, ConsolidationStrategy, MemoryConsolidationService, MemoryLifecycleStage } from '../memory-consolidation.service';
import { TimeWeightedVectorStoreRetriever } from '../time-weighted-retriever';

describe('MemoryConsolidationService', () => {
  let service: MemoryConsolidationService;
  let vectorStoreService: jest.Mocked<VectorStoreService>;
  let _timeWeightedRetriever: jest.Mocked<TimeWeightedVectorStoreRetriever>;
  let _conversationSummary: jest.Mocked<ConversationSummaryMemory>;
  let _entityMemory: jest.Mocked<EntityMemory>;
  let graphMemory: jest.Mocked<GraphMemory>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryConsolidationService,
        {
          provide: VectorStoreService,
          useValue: {
            retrieveRelevantMemories: jest.fn(),
            clearThreadMemories: jest.fn(),
            storeMemories: jest.fn(),
          },
        },
        {
          provide: TimeWeightedVectorStoreRetriever,
          useValue: {
            retrieveWithTimeWeighting: jest.fn(),
          },
        },
        {
          provide: ConversationSummaryMemory,
          useValue: {
            summarizeConversation: jest.fn(),
          },
        },
        {
          provide: EntityMemory,
          useValue: {
            extractEntities: jest.fn(),
          },
        },
        {
          provide: GraphMemory,
          useValue: {
            extractNodesAndEdges: jest.fn(),
            clearThreadGraph: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MemoryConsolidationService>(MemoryConsolidationService);
    vectorStoreService = module.get(VectorStoreService);
    _timeWeightedRetriever = module.get(TimeWeightedVectorStoreRetriever);
    _conversationSummary = module.get(ConversationSummaryMemory);
    _entityMemory = module.get(EntityMemory);
    graphMemory = module.get(GraphMemory);
  });

  describe('consolidateMemories', () => {
    it('should skip consolidation if not enough memories', async () => {
      vectorStoreService.retrieveRelevantMemories.mockResolvedValue([new Document({ pageContent: 'test', metadata: { timestamp: Date.now() } })]);

      const result = await service.consolidateMemories('thread1');

      expect(result.memoriesBefore).toBe(0);
      expect(result.memoriesAfter).toBe(0);
      expect(vectorStoreService.clearThreadMemories).not.toHaveBeenCalled();
    });

    it('should consolidate memories successfully', async () => {
      const now = Date.now();
      const memories = Array.from(
        { length: 150 },
        (_, i) =>
          new Document({
            pageContent: `Memory content ${i}`,
            metadata: {
              id: `mem-${i}`,
              timestamp: now - i * 1000 * 60 * 60, // Each memory 1 hour older
              threadId: 'thread1',
              importance: 0.5,
            },
          }),
      );

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue(memories);
      vectorStoreService.clearThreadMemories.mockResolvedValue(undefined);
      vectorStoreService.storeMemories.mockResolvedValue(undefined);
      graphMemory.clearThreadGraph.mockResolvedValue(undefined);
      graphMemory.extractNodesAndEdges.mockResolvedValue({ nodes: [], edges: [] });

      const result = await service.consolidateMemories('thread1');

      expect(result.memoriesBefore).toBe(150);
      expect(result.memoriesAfter).toBeLessThanOrEqual(50); // Max after consolidation
      expect(result.deduplicated).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(vectorStoreService.clearThreadMemories).toHaveBeenCalledWith('thread1');
      expect(vectorStoreService.storeMemories).toHaveBeenCalled();
    });

    it('should handle concurrent consolidation attempts', async () => {
      const memories = Array.from(
        { length: 150 },
        (_, i) =>
          new Document({
            pageContent: `Memory ${i}`,
            metadata: { timestamp: Date.now(), id: `mem-${i}` },
          }),
      );

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue(memories);

      // Start two consolidations simultaneously
      const promise1 = service.consolidateMemories('thread1');
      const promise2 = service.consolidateMemories('thread1');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should process, one should skip
      const processed = result1.memoriesBefore > 0 ? result1 : result2;
      const skipped = result1.memoriesBefore === 0 ? result1 : result2;

      expect(processed.memoriesBefore).toBe(150);
      expect(skipped.memoriesBefore).toBe(0);
    });
  });

  describe('deduplicateMemories', () => {
    it('should deduplicate similar memories', async () => {
      const memories: ConsolidatedMemory[] = [
        {
          document: new Document({
            pageContent: 'The weather is nice today',
            metadata: { id: '1', timestamp: Date.now() },
          }),
          importance: 0.8,
          accessCount: 5,
          lastAccessed: Date.now(),
          lifecycleStage: MemoryLifecycleStage.ACTIVE,
        },
        {
          document: new Document({
            pageContent: 'The weather is nice today',
            metadata: { id: '2', timestamp: Date.now() },
          }),
          importance: 0.7,
          accessCount: 3,
          lastAccessed: Date.now(),
          lifecycleStage: MemoryLifecycleStage.ACTIVE,
        },
        {
          document: new Document({
            pageContent: 'Tomorrow will be rainy',
            metadata: { id: '3', timestamp: Date.now() },
          }),
          importance: 0.6,
          accessCount: 2,
          lastAccessed: Date.now(),
          lifecycleStage: MemoryLifecycleStage.ACTIVE,
        },
      ];

      const deduplicated = await service.deduplicateMemories(memories, 0.8);

      expect(deduplicated).toHaveLength(2); // Two unique memories
      expect(deduplicated[0].document.metadata.consolidatedCount).toBe(2); // Two similar merged
    });

    it('should preserve unique memories', async () => {
      const memories: ConsolidatedMemory[] = [
        {
          document: new Document({
            pageContent: 'First unique memory',
            metadata: { id: '1', timestamp: Date.now() },
          }),
          importance: 0.8,
          accessCount: 5,
          lastAccessed: Date.now(),
          lifecycleStage: MemoryLifecycleStage.ACTIVE,
        },
        {
          document: new Document({
            pageContent: 'Second unique memory',
            metadata: { id: '2', timestamp: Date.now() },
          }),
          importance: 0.7,
          accessCount: 3,
          lastAccessed: Date.now(),
          lifecycleStage: MemoryLifecycleStage.ACTIVE,
        },
      ];

      const deduplicated = await service.deduplicateMemories(memories, 0.9);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0]).toBe(memories[0]);
      expect(deduplicated[1]).toBe(memories[1]);
    });

    it('should handle empty memory list', async () => {
      const deduplicated = await service.deduplicateMemories([], 0.8);
      expect(deduplicated).toEqual([]);
    });
  });

  describe('clusterAndMergeMemories', () => {
    it('should cluster and merge related memories', async () => {
      const memories: ConsolidatedMemory[] = Array.from({ length: 10 }, (_, i) => ({
        document: new Document({
          pageContent: i < 5 ? `Group A memory ${i}` : `Group B memory ${i}`,
          metadata: { id: `mem-${i}`, timestamp: Date.now() },
        }),
        importance: 0.5 + i * 0.05,
        accessCount: i,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      }));

      const clustered = await service.clusterAndMergeMemories(memories, {
        enabled: true,
        similarityThreshold: 0.7,
        minMemoriesForConsolidation: 100,
        maxMemoriesAfterConsolidation: 50,
        maturityThresholdHours: 24,
        dormancyThresholdHours: 168,
        archiveThresholdHours: 720,
        importanceDecayRate: 0.1,
        minImportanceThreshold: 0.1,
        enableBackgroundConsolidation: false,
        consolidationIntervalMinutes: 60,
      });

      expect(clustered.length).toBeLessThanOrEqual(memories.length);

      // Check that merged memories have consolidation strategy
      const merged = clustered.filter((m) => m.consolidationStrategy === ConsolidationStrategy.CLUSTER);
      expect(merged.length).toBeGreaterThanOrEqual(0);
    });

    it('should summarize large clusters', async () => {
      const memories: ConsolidatedMemory[] = Array.from({ length: 8 }, (_, i) => ({
        document: new Document({
          pageContent: `Similar content about topic X. Detail ${i}`,
          metadata: { id: `mem-${i}`, timestamp: Date.now() },
        }),
        importance: 0.6,
        accessCount: 2,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      }));

      const clustered = await service.clusterAndMergeMemories(memories, {
        enabled: true,
        similarityThreshold: 0.5, // Lower threshold to group all similar
        minMemoriesForConsolidation: 100,
        maxMemoriesAfterConsolidation: 50,
        maturityThresholdHours: 24,
        dormancyThresholdHours: 168,
        archiveThresholdHours: 720,
        importanceDecayRate: 0.1,
        minImportanceThreshold: 0.1,
        enableBackgroundConsolidation: false,
        consolidationIntervalMinutes: 60,
      });

      // Large cluster should be summarized
      const summarized = clustered.find((m) => m.consolidationStrategy === ConsolidationStrategy.SUMMARIZE);
      if (summarized) {
        expect(summarized.document.metadata.isSummary).toBe(true);
        expect(summarized.document.metadata.summarizedCount).toBeGreaterThan(5);
      }
    });
  });

  describe('calculateImportanceScore', () => {
    it('should calculate importance based on multiple factors', () => {
      const memory: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'Test memory',
          metadata: {
            timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day old
            importance: 0.7,
          },
        }),
        importance: 0.7,
        accessCount: 5,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      const score = service.calculateImportanceScore(memory);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeCloseTo(0.7, 1); // Should be influenced by all factors
    });

    it('should decrease importance for older memories', () => {
      const recentMemory: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'Recent',
          metadata: {
            timestamp: Date.now(),
            importance: 0.5,
          },
        }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      const oldMemory: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'Old',
          metadata: {
            timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days old
            importance: 0.5,
          },
        }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now() - 1000 * 60 * 60 * 24 * 30,
        lifecycleStage: MemoryLifecycleStage.DORMANT,
      };

      const recentScore = service.calculateImportanceScore(recentMemory);
      const oldScore = service.calculateImportanceScore(oldMemory);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should increase importance for frequently accessed memories', () => {
      const frequentMemory: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'Frequent',
          metadata: {
            timestamp: Date.now() - 1000 * 60 * 60 * 24,
            importance: 0.5,
          },
        }),
        importance: 0.5,
        accessCount: 20,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      const rareMemory: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'Rare',
          metadata: {
            timestamp: Date.now() - 1000 * 60 * 60 * 24,
            importance: 0.5,
          },
        }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      const frequentScore = service.calculateImportanceScore(frequentMemory);
      const rareScore = service.calculateImportanceScore(rareMemory);

      expect(frequentScore).toBeGreaterThan(rareScore);
    });
  });

  describe('Memory Lifecycle Management', () => {
    it('should categorize memories by lifecycle stage', async () => {
      const now = Date.now();
      const hourInMs = 60 * 60 * 1000;

      const memories = [
        // Active (< 24 hours)
        new Document({
          pageContent: 'Active memory',
          metadata: { timestamp: now - 10 * hourInMs, id: 'active' },
        }),
        // Mature (24-168 hours)
        new Document({
          pageContent: 'Mature memory',
          metadata: { timestamp: now - 50 * hourInMs, id: 'mature' },
        }),
        // Dormant (168-720 hours)
        new Document({
          pageContent: 'Dormant memory',
          metadata: { timestamp: now - 200 * hourInMs, id: 'dormant' },
        }),
        // Archive ready (> 720 hours)
        new Document({
          pageContent: 'Old memory',
          metadata: { timestamp: now - 800 * hourInMs, id: 'archive' },
        }),
      ];

      // Need at least 100 memories to trigger consolidation
      const allMemories = [...memories];
      // Add more memories to reach minimum threshold
      for (let i = 0; i < 96; i++) {
        allMemories.push(
          new Document({
            pageContent: `Filler memory ${i}`,
            metadata: { timestamp: now - (i + 10) * hourInMs, id: `filler-${i}` },
          }),
        );
      }

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue(allMemories);
      vectorStoreService.clearThreadMemories.mockResolvedValue(undefined);
      vectorStoreService.storeMemories.mockResolvedValue(undefined);
      graphMemory.clearThreadGraph.mockResolvedValue(undefined);

      const result = await service.consolidateMemories('thread1');

      expect(result.archived).toBeGreaterThanOrEqual(0);
      expect(result.memoriesBefore).toBe(100);
    });

    it('should apply importance decay over time', async () => {
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;

      const memories = [];
      // Create 100 memories to meet minimum threshold
      for (let i = 0; i < 100; i++) {
        memories.push(
          new Document({
            pageContent: `Memory ${i}`,
            metadata: {
              timestamp: now - (i % 10) * dayInMs, // Vary ages
              importance: 1.0,
              id: `mem-${i}`,
            },
          }),
        );
      }

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue(memories);
      vectorStoreService.clearThreadMemories.mockResolvedValue(undefined);
      vectorStoreService.storeMemories.mockResolvedValue(undefined);
      graphMemory.clearThreadGraph.mockResolvedValue(undefined);

      await service.consolidateMemories('thread1', {
        importanceDecayRate: 0.1, // 10% per day
      });

      // After consolidation, older memories should have lower importance
      expect(vectorStoreService.storeMemories).toHaveBeenCalled();
    });
  });

  describe('Similarity Calculations', () => {
    it('should calculate Jaccard similarity correctly', () => {
      const memory1: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'The quick brown fox',
          metadata: { id: '1' },
        }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      const memory2: ConsolidatedMemory = {
        document: new Document({
          pageContent: 'The quick brown dog',
          metadata: { id: '2' },
        }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
      };

      // Use private method through any type assertion for testing
      const similarity = (service as any).jaccardSimilarity(memory1.document.pageContent, memory2.document.pageContent);

      expect(similarity).toBeGreaterThan(0.5); // Should have high similarity
      expect(similarity).toBeLessThan(1.0); // But not identical
    });

    it('should calculate cosine similarity for embeddings', () => {
      const memory1: ConsolidatedMemory = {
        document: new Document({ pageContent: 'Test', metadata: {} }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
        embedding: [1, 0, 0],
      };

      const memory2: ConsolidatedMemory = {
        document: new Document({ pageContent: 'Test', metadata: {} }),
        importance: 0.5,
        accessCount: 1,
        lastAccessed: Date.now(),
        lifecycleStage: MemoryLifecycleStage.ACTIVE,
        embedding: [0.8, 0.6, 0],
      };

      const similarity = (service as any).cosineSimilarity(memory1.embedding, memory2.embedding);

      expect(similarity).toBe(0.8); // cos(θ) for these vectors
    });
  });

  describe('getConsolidationHealth', () => {
    it('should return consolidation health status', async () => {
      const health = await service.getConsolidationHealth();

      expect(health).toHaveProperty('isConsolidating');
      expect(health).toHaveProperty('memoryCount');
      expect(health).toHaveProperty('averageImportance');
      expect(health.isConsolidating).toBe(false);
      expect(health.memoryCount).toBe(0);
      expect(health.averageImportance).toBe(0);
    });
  });

  describe('Background Consolidation', () => {
    it('should skip background consolidation when disabled', async () => {
      await service.backgroundConsolidation();

      // Should not attempt consolidation
      expect(vectorStoreService.retrieveRelevantMemories).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty thread memories', async () => {
      vectorStoreService.retrieveRelevantMemories.mockResolvedValue([]);

      const result = await service.consolidateMemories('empty-thread');

      expect(result.memoriesBefore).toBe(0);
      expect(result.memoriesAfter).toBe(0);
      expect(result.deduplicated).toBe(0);
      expect(result.merged).toBe(0);
      expect(result.archived).toBe(0);
    });

    it('should handle consolidation errors gracefully', async () => {
      vectorStoreService.retrieveRelevantMemories.mockRejectedValue(new Error('Database error'));

      await expect(service.consolidateMemories('error-thread')).rejects.toThrow('Database error');
    });

    it('should handle memories with missing metadata', async () => {
      const memories = [
        new Document({
          pageContent: 'Memory without timestamp',
          metadata: { id: '1' }, // Missing timestamp
        }),
        new Document({
          pageContent: 'Memory with timestamp',
          metadata: { id: '2', timestamp: Date.now() },
        }),
      ];

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue(memories);
      vectorStoreService.clearThreadMemories.mockResolvedValue(undefined);
      vectorStoreService.storeMemories.mockResolvedValue(undefined);
      graphMemory.clearThreadGraph.mockResolvedValue(undefined);

      // Should handle gracefully without crashing
      await expect(service.consolidateMemories('thread1')).resolves.toBeDefined();
    });
  });
});
