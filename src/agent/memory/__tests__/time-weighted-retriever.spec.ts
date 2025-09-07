import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreService } from '../../../vectors/services/vector-store.service';
import { DecayFunction, TimeWeightedVectorStoreRetriever } from '../time-weighted-retriever';

describe('TimeWeightedVectorStoreRetriever', () => {
  let retriever: TimeWeightedVectorStoreRetriever;
  let mockVectorStoreService: jest.Mocked<VectorStoreService>;

  beforeEach(async () => {
    // Create a mock VectorStoreService
    mockVectorStoreService = {
      retrieveRelevantMemoriesWithScore: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeWeightedVectorStoreRetriever,
        {
          provide: VectorStoreService,
          useValue: mockVectorStoreService,
        },
      ],
    }).compile();

    retriever = module.get<TimeWeightedVectorStoreRetriever>(TimeWeightedVectorStoreRetriever);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieveWithTimeWeighting', () => {
    it('should retrieve memories with time-weighted scoring', async () => {
      const currentTime = Date.now();
      const oneHourAgo = currentTime - 60 * 60 * 1000;
      const oneDayAgo = currentTime - 24 * 60 * 60 * 1000;
      const oneWeekAgo = currentTime - 7 * 24 * 60 * 60 * 1000;

      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Recent memory',
            metadata: { timestamp: oneHourAgo, threadId: 'test-thread' },
          }),
          0.8, // High semantic score
        ],
        [
          new Document({
            pageContent: 'Day old memory',
            metadata: { timestamp: oneDayAgo, threadId: 'test-thread' },
          }),
          0.9, // Higher semantic score but older
        ],
        [
          new Document({
            pageContent: 'Week old memory',
            metadata: { timestamp: oneWeekAgo, threadId: 'test-thread' },
          }),
          0.95, // Highest semantic score but very old
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', 'test-thread', {
        limit: 3,
        config: {
          decayFunction: DecayFunction.EXPONENTIAL,
          decayLambda: 0.1,
          semanticWeight: 0.6,
          temporalWeight: 0.4,
        },
      });

      expect(results).toHaveLength(3);
      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenCalledWith('test query', 'test-thread', {
        limit: 9,
        scoreThreshold: 0.1,
      });

      // Recent memory should have highest combined score due to time weighting
      expect(results[0].document.pageContent).toContain('Recent memory');
      expect(results[0].temporalScore).toBeGreaterThan(0.9);
      expect(results[0].combinedScore).toBeGreaterThan(results[1].combinedScore);
    });

    it('should handle empty results gracefully', async () => {
      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue([]);

      const results = await retriever.retrieveWithTimeWeighting('test query', 'test-thread');

      expect(results).toEqual([]);
      expect(mockVectorStoreService.retrieveRelevantMemoriesWithScore).toHaveBeenCalled();
    });

    it('should filter out memories below minimum score threshold', async () => {
      const currentTime = Date.now();
      const veryOld = currentTime - 30 * 24 * 60 * 60 * 1000; // 30 days old

      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Very old memory with low score',
            metadata: { timestamp: veryOld },
          }),
          0.3, // Low semantic score
        ],
        [
          new Document({
            pageContent: 'Recent memory with good score',
            metadata: { timestamp: currentTime - 1000 },
          }),
          0.7,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        config: {
          minScore: 0.5,
          semanticWeight: 0.5,
          temporalWeight: 0.5,
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].document.pageContent).toContain('Recent memory');
    });

    it('should normalize weights if they do not sum to 1', async () => {
      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Test memory',
            metadata: { timestamp: Date.now() },
          }),
          0.8,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        config: {
          semanticWeight: 0.7,
          temporalWeight: 0.7, // Sum is 1.4, should be normalized
        },
      });

      expect(results).toHaveLength(1);
      // Combined score should still be valid despite non-normalized input
      expect(results[0].combinedScore).toBeGreaterThan(0);
      expect(results[0].combinedScore).toBeLessThanOrEqual(1);
    });

    it('should normalize final scores when requested', async () => {
      const currentTime = Date.now();
      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Memory 1',
            metadata: { timestamp: currentTime },
          }),
          0.5,
        ],
        [
          new Document({
            pageContent: 'Memory 2',
            metadata: { timestamp: currentTime - 3600000 },
          }),
          0.4,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        config: {
          normalizeScores: true,
        },
      });

      if (results.length > 0) {
        // The highest score should be normalized to 1.0
        const maxScore = Math.max(...results.map((r) => r.combinedScore));
        expect(maxScore).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('decay functions', () => {
    const testDecayFunction = async (decayFunction: DecayFunction, expectedOrder: string[], additionalConfig: any = {}) => {
      const currentTime = Date.now();
      const memories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Very recent',
            metadata: { timestamp: currentTime - 1000 }, // 1 second ago
          }),
          0.7,
        ],
        [
          new Document({
            pageContent: 'Recent',
            metadata: { timestamp: currentTime - 60 * 60 * 1000 }, // 1 hour ago
          }),
          0.7,
        ],
        [
          new Document({
            pageContent: 'Day old',
            metadata: { timestamp: currentTime - 24 * 60 * 60 * 1000 }, // 1 day ago
          }),
          0.7,
        ],
        [
          new Document({
            pageContent: 'Week old',
            metadata: { timestamp: currentTime - 7 * 24 * 60 * 60 * 1000 }, // 1 week ago
          }),
          0.7,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(memories);

      const results = await retriever.retrieveWithTimeWeighting('test', undefined, {
        limit: 4,
        config: {
          decayFunction,
          semanticWeight: 0.3,
          temporalWeight: 0.7, // Heavy time weighting to test decay
          ...additionalConfig,
        },
      });

      const actualOrder = results.map((r) => r.document.pageContent);
      expect(actualOrder).toEqual(expectedOrder);
    };

    it('should apply exponential decay correctly', async () => {
      await testDecayFunction(
        DecayFunction.EXPONENTIAL,
        ['Very recent', 'Recent', 'Day old', 'Week old'],
        { decayLambda: 0.01, minScore: 0.1 }, // Slower decay and lower min score
      );
    });

    it('should apply linear decay correctly', async () => {
      await testDecayFunction(DecayFunction.LINEAR, ['Very recent', 'Recent', 'Day old', 'Week old'], { maxHours: 200 });
    });

    it('should apply logarithmic decay correctly', async () => {
      await testDecayFunction(DecayFunction.LOGARITHMIC, ['Very recent', 'Recent', 'Day old', 'Week old']);
    });

    it('should apply step function correctly', async () => {
      const currentTime = Date.now();
      const memories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Within threshold',
            metadata: { timestamp: currentTime - 12 * 60 * 60 * 1000 }, // 12 hours
          }),
          0.6,
        ],
        [
          new Document({
            pageContent: 'After threshold',
            metadata: { timestamp: currentTime - 36 * 60 * 60 * 1000 }, // 36 hours
          }),
          0.8, // Higher semantic score but will be penalized
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(memories);

      const results = await retriever.retrieveWithTimeWeighting('test', undefined, {
        config: {
          decayFunction: DecayFunction.STEP,
          stepThresholdHours: 24,
          stepPenalty: 0.3,
          semanticWeight: 0.5,
          temporalWeight: 0.5,
        },
      });

      // Memory within threshold should rank higher despite lower semantic score
      expect(results[0].document.pageContent).toBe('Within threshold');
      expect(results[0].temporalScore).toBe(1.0);
      expect(results[1].temporalScore).toBe(0.3);
    });
  });

  describe('retrieveAsDocuments', () => {
    it('should return documents with time-weighted metadata', async () => {
      const currentTime = Date.now();
      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Test content',
            metadata: { timestamp: currentTime, originalField: 'value' },
          }),
          0.8,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const documents = await retriever.retrieveAsDocuments('test query', 'thread-id');

      expect(documents).toHaveLength(1);
      expect(documents[0]).toBeInstanceOf(Document);
      expect(documents[0].metadata).toHaveProperty('timeWeightedScore');
      expect(documents[0].metadata).toHaveProperty('semanticScore');
      expect(documents[0].metadata).toHaveProperty('temporalScore');
      expect(documents[0].metadata).toHaveProperty('ageInHours');
      expect(documents[0].metadata.originalField).toBe('value'); // Original metadata preserved
    });
  });

  describe('preset configurations', () => {
    it('should provide recent_focus preset', () => {
      const config = TimeWeightedVectorStoreRetriever.getPresetConfig('recent_focus');

      expect(config.decayFunction).toBe(DecayFunction.EXPONENTIAL);
      expect(config.decayLambda).toBe(0.5); // Fast decay
      expect(config.temporalWeight).toBeGreaterThan(config.semanticWeight!);
    });

    it('should provide balanced preset', () => {
      const config = TimeWeightedVectorStoreRetriever.getPresetConfig('balanced');

      expect(config.decayFunction).toBe(DecayFunction.EXPONENTIAL);
      expect(config.semanticWeight).toBeGreaterThan(config.temporalWeight!);
    });

    it('should provide long_term preset', () => {
      const config = TimeWeightedVectorStoreRetriever.getPresetConfig('long_term');

      expect(config.decayFunction).toBe(DecayFunction.LOGARITHMIC);
      expect(config.semanticWeight).toBe(0.7);
      expect(config.temporalWeight).toBe(0.3);
    });

    it('should provide critical_24h preset', () => {
      const config = TimeWeightedVectorStoreRetriever.getPresetConfig('critical_24h');

      expect(config.decayFunction).toBe(DecayFunction.STEP);
      expect(config.stepThresholdHours).toBe(24);
      expect(config.stepPenalty).toBe(0.3);
    });
  });

  describe('analyzeTemporalDistribution', () => {
    it('should analyze memory distribution over time', async () => {
      const currentTime = Date.now();
      const hour = 60 * 60 * 1000;

      const mockMemories: [Document, number][] = [
        // Recent bucket (0-24h)
        [new Document({ pageContent: 'M1', metadata: { timestamp: currentTime - 2 * hour } }), 0.9],
        [new Document({ pageContent: 'M2', metadata: { timestamp: currentTime - 10 * hour } }), 0.8],

        // Day old bucket (24-48h)
        [new Document({ pageContent: 'M3', metadata: { timestamp: currentTime - 30 * hour } }), 0.7],

        // Week old bucket
        [new Document({ pageContent: 'M4', metadata: { timestamp: currentTime - 150 * hour } }), 0.6],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const analysis = await retriever.analyzeTemporalDistribution('test-thread', {
        bucketSizeHours: 24,
        maxBuckets: 7,
      });

      expect(analysis.totalMemories).toBe(4);
      expect(analysis.buckets.length).toBeGreaterThan(0);

      // First bucket should have 2 memories
      const firstBucket = analysis.buckets.find((b) => b.startHours === 0);
      expect(firstBucket?.count).toBe(2);
      expect(firstBucket?.averageScore).toBeCloseTo(0.85, 2);

      // Check oldest and newest
      expect(analysis.newestMemoryHours).toBeLessThan(3);
      expect(analysis.oldestMemoryHours).toBeGreaterThan(149);
    });

    it('should handle empty memories gracefully', async () => {
      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue([]);

      const analysis = await retriever.analyzeTemporalDistribution();

      expect(analysis.totalMemories).toBe(0);
      expect(analysis.buckets).toEqual([]);
      expect(analysis.oldestMemoryHours).toBe(0);
      expect(analysis.newestMemoryHours).toBe(0);
    });

    it('should handle missing timestamps', async () => {
      const currentTime = Date.now();
      const mockMemories: [Document, number][] = [
        [new Document({ pageContent: 'No timestamp', metadata: {} }), 0.8],
        [new Document({ pageContent: 'Has timestamp', metadata: { timestamp: currentTime - 3600000 } }), 0.7],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const analysis = await retriever.analyzeTemporalDistribution();

      expect(analysis.totalMemories).toBe(2);
      // Should handle missing timestamp by using current time
      expect(analysis.buckets.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle memories without timestamps', async () => {
      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'No timestamp memory',
            metadata: { threadId: 'test' }, // No timestamp
          }),
          0.8,
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query');

      expect(results).toHaveLength(1);
      // Should use current time as fallback
      expect(results[0].ageInHours).toBeCloseTo(0, 1);
      expect(results[0].temporalScore).toBeCloseTo(1, 1);
    });

    it('should handle very large time differences', async () => {
      const currentTime = Date.now();
      const veryOld = currentTime - 365 * 24 * 60 * 60 * 1000; // 1 year old

      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Ancient memory',
            metadata: { timestamp: veryOld },
          }),
          0.9, // High semantic score
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        config: {
          decayFunction: DecayFunction.EXPONENTIAL,
          decayLambda: 0.01, // Slow decay
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].temporalScore).toBeGreaterThan(0);
      expect(results[0].temporalScore).toBeLessThan(0.1); // Should be very low
    });

    it('should handle zero scores gracefully during normalization', async () => {
      const veryOld = Date.now() - 1000 * 24 * 60 * 60 * 1000; // 1000 days old

      const mockMemories: [Document, number][] = [
        [
          new Document({
            pageContent: 'Zero score memory',
            metadata: { timestamp: veryOld },
          }),
          0.01, // Very low semantic score
        ],
      ];

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        config: {
          decayFunction: DecayFunction.LINEAR,
          maxHours: 24, // Will result in 0 temporal score for old memory
          normalizeScores: true,
          minScore: 0, // Allow zero scores
        },
      });

      // Should handle normalization even with very low/zero scores
      expect(() => results).not.toThrow();
    });

    it('should limit results to requested limit', async () => {
      const currentTime = Date.now();
      const mockMemories: [Document, number][] = Array(20)
        .fill(null)
        .map((_, i) => [
          new Document({
            pageContent: `Memory ${i}`,
            metadata: { timestamp: currentTime - i * 3600000 },
          }),
          0.5 + i * 0.01,
        ]);

      mockVectorStoreService.retrieveRelevantMemoriesWithScore.mockResolvedValue(mockMemories);

      const results = await retriever.retrieveWithTimeWeighting('test query', undefined, {
        limit: 5,
      });

      expect(results).toHaveLength(5);
    });
  });
});
