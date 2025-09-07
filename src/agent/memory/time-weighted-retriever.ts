import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import { MetricMemory } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { VectorStoreService } from '../../vectors/services/vector-store.service';

/**
 * Decay function types for time-weighted scoring
 */
export enum DecayFunction {
  /** Exponential decay: score * e^(-lambda * hours_ago) */
  EXPONENTIAL = 'exponential',
  /** Linear decay: score * max(0, 1 - (hours_ago / max_hours)) */
  LINEAR = 'linear',
  /** Logarithmic decay: score * (1 / (1 + log(1 + hours_ago))) */
  LOGARITHMIC = 'logarithmic',
  /** Step function: full score if recent, otherwise penalized */
  STEP = 'step',
}

/**
 * Configuration for time-weighted retrieval
 */
export interface TimeWeightedConfig {
  /** Type of decay function to use */
  decayFunction?: DecayFunction;
  /** Lambda parameter for exponential decay (higher = faster decay) */
  decayLambda?: number;
  /** Maximum hours for linear decay (memories older than this get 0 time score) */
  maxHours?: number;
  /** Hours threshold for step function */
  stepThresholdHours?: number;
  /** Penalty factor for step function (0-1) */
  stepPenalty?: number;
  /** Weight for semantic similarity score (0-1) */
  semanticWeight?: number;
  /** Weight for temporal recency score (0-1) */
  temporalWeight?: number;
  /** Minimum combined score threshold */
  minScore?: number;
  /** Whether to normalize final scores to 0-1 range */
  normalizeScores?: boolean;
}

/**
 * Memory with time-weighted scoring
 */
export interface TimeWeightedMemory {
  /** The document content and metadata */
  document: Document;
  /** Original semantic similarity score */
  semanticScore: number;
  /** Calculated temporal score based on recency */
  temporalScore: number;
  /** Combined weighted score */
  combinedScore: number;
  /** Age of the memory in hours */
  ageInHours: number;
  /** Timestamp when the memory was created */
  timestamp: number;
}

/**
 * TimeWeightedVectorStoreRetriever implements time-decay weighted retrieval
 * that combines semantic similarity with temporal recency to prioritize
 * recent memories while maintaining relevance.
 */
@Injectable()
export class TimeWeightedVectorStoreRetriever {
  private readonly logger = new Logger(TimeWeightedVectorStoreRetriever.name);
  private readonly defaultConfig: Required<TimeWeightedConfig> = {
    decayFunction: DecayFunction.EXPONENTIAL,
    decayLambda: 0.1, // Default: ~10% decay per hour
    maxHours: 168, // Default: 1 week
    stepThresholdHours: 24, // Default: 1 day
    stepPenalty: 0.5, // Default: 50% penalty after threshold
    semanticWeight: 0.6, // Default: 60% semantic, 40% temporal
    temporalWeight: 0.4,
    minScore: 0.3,
    normalizeScores: true,
  };

  constructor(private readonly vectorStoreService: VectorStoreService) {}

  /**
   * Retrieve memories with time-weighted scoring
   */
  @TraceAI({
    name: 'memory.time_weighted_retrieve',
    operation: 'memory_retrieve',
  })
  @MetricMemory({
    memoryType: 'time_weighted',
    operation: 'retrieve',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async retrieveWithTimeWeighting(
    query: string,
    threadId?: string,
    options: {
      limit?: number;
      config?: TimeWeightedConfig;
    } = {},
  ): Promise<TimeWeightedMemory[]> {
    const { limit = 10 } = options;
    const config = { ...this.defaultConfig, ...options.config };

    // Validate weights sum to 1
    const weightSum = config.semanticWeight + config.temporalWeight;
    if (Math.abs(weightSum - 1.0) > 0.001) {
      this.logger.warn(`Weights don't sum to 1 (${weightSum}), normalizing...`);
      config.semanticWeight = config.semanticWeight / weightSum;
      config.temporalWeight = config.temporalWeight / weightSum;
    }

    try {
      // Retrieve more candidates than requested to account for filtering
      const candidateLimit = limit * 3;

      // Get memories with semantic scores
      const memoriesWithScores = await this.vectorStoreService.retrieveRelevantMemoriesWithScore(query, threadId, {
        limit: candidateLimit,
        scoreThreshold: 0.1, // Lower threshold to get more candidates
      });

      if (memoriesWithScores.length === 0) {
        this.logger.debug('No memories found for time-weighted retrieval');
        return [];
      }

      // Calculate time-weighted scores
      const currentTime = Date.now();
      const timeWeightedMemories: TimeWeightedMemory[] = memoriesWithScores
        .map(([doc, semanticScore]) => {
          const timestamp = doc.metadata.timestamp || currentTime;
          const ageInHours = (currentTime - timestamp) / (1000 * 60 * 60);

          // Calculate temporal score based on decay function
          const temporalScore = this.calculateTemporalScore(ageInHours, config);

          // Calculate combined score
          const combinedScore = config.semanticWeight * semanticScore + config.temporalWeight * temporalScore;

          return {
            document: doc,
            semanticScore,
            temporalScore,
            combinedScore,
            ageInHours,
            timestamp,
          };
        })
        .filter((memory) => memory.combinedScore >= config.minScore)
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);

      // Normalize scores if requested
      if (config.normalizeScores && timeWeightedMemories.length > 0) {
        const maxScore = Math.max(...timeWeightedMemories.map((m) => m.combinedScore));
        if (maxScore > 0) {
          timeWeightedMemories.forEach((memory) => {
            memory.combinedScore = memory.combinedScore / maxScore;
          });
        }
      }

      this.logger.debug(`Retrieved ${timeWeightedMemories.length} time-weighted memories`, {
        query: query.substring(0, 100),
        threadId,
        candidatesEvaluated: memoriesWithScores.length,
        resultsReturned: timeWeightedMemories.length,
        config: {
          decayFunction: config.decayFunction,
          semanticWeight: config.semanticWeight,
          temporalWeight: config.temporalWeight,
        },
      });

      return timeWeightedMemories;
    } catch (error) {
      this.logger.error('Failed to retrieve time-weighted memories:', error);
      throw error;
    }
  }

  /**
   * Calculate temporal score based on age and decay function
   */
  private calculateTemporalScore(ageInHours: number, config: Required<TimeWeightedConfig>): number {
    switch (config.decayFunction) {
      case DecayFunction.EXPONENTIAL:
        // Exponential decay: e^(-lambda * age)
        return Math.exp(-config.decayLambda * ageInHours);

      case DecayFunction.LINEAR:
        // Linear decay: max(0, 1 - (age / maxHours))
        return Math.max(0, 1 - ageInHours / config.maxHours);

      case DecayFunction.LOGARITHMIC:
        // Logarithmic decay: 1 / (1 + log(1 + age))
        return 1 / (1 + Math.log(1 + ageInHours));

      case DecayFunction.STEP:
        // Step function: full score if recent, penalized otherwise
        return ageInHours <= config.stepThresholdHours ? 1.0 : config.stepPenalty;

      default:
        this.logger.warn(`Unknown decay function: ${config.decayFunction}, using exponential`);
        return Math.exp(-config.decayLambda * ageInHours);
    }
  }

  /**
   * Get memories as Documents (for compatibility with LangChain)
   */
  @TraceAI({
    name: 'memory.time_weighted_as_documents',
    operation: 'memory_retrieve',
  })
  async retrieveAsDocuments(
    query: string,
    threadId?: string,
    options: {
      limit?: number;
      config?: TimeWeightedConfig;
    } = {},
  ): Promise<Document[]> {
    const timeWeightedMemories = await this.retrieveWithTimeWeighting(query, threadId, options);

    // Return documents with combined score in metadata
    return timeWeightedMemories.map((memory) => {
      const doc = new Document({
        pageContent: memory.document.pageContent,
        metadata: {
          ...memory.document.metadata,
          timeWeightedScore: memory.combinedScore,
          semanticScore: memory.semanticScore,
          temporalScore: memory.temporalScore,
          ageInHours: memory.ageInHours,
        },
      });
      return doc;
    });
  }

  /**
   * Get optimal configuration for different use cases
   */
  static getPresetConfig(preset: 'recent_focus' | 'balanced' | 'long_term' | 'critical_24h'): TimeWeightedConfig {
    switch (preset) {
      case 'recent_focus':
        // Heavily prioritize recent memories (last few hours)
        return {
          decayFunction: DecayFunction.EXPONENTIAL,
          decayLambda: 0.5, // Fast decay
          semanticWeight: 0.4,
          temporalWeight: 0.6,
        };

      case 'balanced':
        // Balance between recency and relevance
        return {
          decayFunction: DecayFunction.EXPONENTIAL,
          decayLambda: 0.1,
          semanticWeight: 0.6,
          temporalWeight: 0.4,
        };

      case 'long_term':
        // Consider older memories with slower decay
        return {
          decayFunction: DecayFunction.LOGARITHMIC,
          semanticWeight: 0.7,
          temporalWeight: 0.3,
        };

      case 'critical_24h':
        // Strong preference for last 24 hours
        return {
          decayFunction: DecayFunction.STEP,
          stepThresholdHours: 24,
          stepPenalty: 0.3,
          semanticWeight: 0.5,
          temporalWeight: 0.5,
        };

      default:
        return {};
    }
  }

  /**
   * Analyze memory distribution over time
   */
  @TraceAI({
    name: 'memory.analyze_temporal_distribution',
    operation: 'memory_analysis',
  })
  async analyzeTemporalDistribution(
    threadId?: string,
    options: {
      bucketSizeHours?: number;
      maxBuckets?: number;
    } = {},
  ): Promise<{
    buckets: Array<{
      startHours: number;
      endHours: number;
      count: number;
      averageScore?: number;
    }>;
    totalMemories: number;
    oldestMemoryHours: number;
    newestMemoryHours: number;
  }> {
    const { bucketSizeHours = 24, maxBuckets = 7 } = options;

    try {
      // Retrieve all memories for analysis
      const memories = await this.vectorStoreService.retrieveRelevantMemoriesWithScore(
        '', // Empty query to get all
        threadId,
        {
          limit: 1000,
          scoreThreshold: 0,
        },
      );

      if (memories.length === 0) {
        return {
          buckets: [],
          totalMemories: 0,
          oldestMemoryHours: 0,
          newestMemoryHours: 0,
        };
      }

      const currentTime = Date.now();
      const memoryAges = memories.map(([doc, score]) => {
        const timestamp = doc.metadata.timestamp || currentTime;
        const ageInHours = (currentTime - timestamp) / (1000 * 60 * 60);
        return { ageInHours, score };
      });

      // Create buckets
      const buckets: Array<{
        startHours: number;
        endHours: number;
        count: number;
        averageScore: number;
      }> = [];

      for (let i = 0; i < maxBuckets; i++) {
        const startHours = i * bucketSizeHours;
        const endHours = (i + 1) * bucketSizeHours;

        const bucketed = memoryAges.filter((m) => m.ageInHours >= startHours && m.ageInHours < endHours);

        if (bucketed.length > 0) {
          const avgScore = bucketed.reduce((sum, m) => sum + m.score, 0) / bucketed.length;
          buckets.push({
            startHours,
            endHours,
            count: bucketed.length,
            averageScore: avgScore,
          });
        }
      }

      const oldestMemoryHours = Math.max(...memoryAges.map((m) => m.ageInHours));
      const newestMemoryHours = Math.min(...memoryAges.map((m) => m.ageInHours));

      return {
        buckets,
        totalMemories: memories.length,
        oldestMemoryHours,
        newestMemoryHours,
      };
    } catch (error) {
      this.logger.error('Failed to analyze temporal distribution:', error);
      throw error;
    }
  }
}
