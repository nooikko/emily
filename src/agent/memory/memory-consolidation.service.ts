import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricMemory } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { VectorStoreService } from '../../vectors/services/vector-store.service';
import { ConversationSummaryMemory } from './conversation-summary.memory';
import { EntityMemory } from './entity.memory';
import { GraphMemory } from './graph.memory';
import { TimeWeightedVectorStoreRetriever } from './time-weighted-retriever';

/**
 * Memory consolidation strategies
 */
export enum ConsolidationStrategy {
  /** Merge similar memories into a single comprehensive memory */
  MERGE = 'merge',
  /** Summarize multiple memories into a concise version */
  SUMMARIZE = 'summarize',
  /** Cluster related memories and keep representatives */
  CLUSTER = 'cluster',
  /** Remove duplicate memories keeping the most informative */
  DEDUPLICATE = 'deduplicate',
  /** Archive old memories to secondary storage */
  ARCHIVE = 'archive',
  /** Compress memories for long-term storage */
  COMPRESS = 'compress',
}

/**
 * Memory lifecycle stages
 */
export enum MemoryLifecycleStage {
  /** Newly created memory */
  NEW = 'new',
  /** Active and frequently accessed */
  ACTIVE = 'active',
  /** Less frequently accessed */
  MATURE = 'mature',
  /** Old and rarely accessed */
  DORMANT = 'dormant',
  /** Marked for archival */
  ARCHIVE_READY = 'archive_ready',
  /** Archived to secondary storage */
  ARCHIVED = 'archived',
}

/**
 * Configuration for memory consolidation
 */
export interface ConsolidationConfig {
  /** Enable automatic consolidation */
  enabled?: boolean;
  /** Similarity threshold for deduplication (0-1) */
  similarityThreshold?: number;
  /** Minimum memories to trigger consolidation */
  minMemoriesForConsolidation?: number;
  /** Maximum memories to keep after consolidation */
  maxMemoriesAfterConsolidation?: number;
  /** Hours before memory becomes mature */
  maturityThresholdHours?: number;
  /** Hours before memory becomes dormant */
  dormancyThresholdHours?: number;
  /** Hours before memory is archived */
  archiveThresholdHours?: number;
  /** Importance decay rate per day */
  importanceDecayRate?: number;
  /** Minimum importance to keep memory */
  minImportanceThreshold?: number;
  /** Enable background consolidation */
  enableBackgroundConsolidation?: boolean;
  /** Consolidation interval in minutes */
  consolidationIntervalMinutes?: number;
}

/**
 * Memory with consolidation metadata
 */
export interface ConsolidatedMemory {
  /** Unique identifier */
  id?: string;
  /** Original document */
  document: Document;
  /** Content string for quick access */
  content?: string;
  /** Summary of the memory */
  summary?: string;
  /** Importance score (0-1) */
  importance: number;
  /** Alternative name for importance */
  importanceScore?: number;
  /** Access frequency */
  accessCount: number;
  /** Last access timestamp */
  lastAccessed: number;
  /** Creation timestamp */
  timestamp?: number;
  /** Lifecycle stage */
  lifecycleStage: MemoryLifecycleStage;
  /** Semantic embedding (if available) */
  embedding?: number[];
  /** Cluster ID (if clustered) */
  clusterId?: string;
  /** IDs of memories consolidated into this one */
  consolidatedFrom?: string[];
  /** Consolidation strategy used */
  consolidationStrategy?: ConsolidationStrategy;
  /** Compressed content for storage */
  compressedContent?: string;
  /** Compression ratio achieved */
  compressionRatio?: number;
  /** Original size before compression */
  originalSize?: number;
  /** Metadata for the memory */
  metadata?: {
    threadId?: string;
    messageType?: string;
    entities?: string[];
    topics?: string[];
    sentiment?: number;
    facts?: string[];
    fullContext?: string;
    rawMessages?: any[];
    [key: string]: any;
  };
}

/**
 * Consolidation result statistics
 */
export interface ConsolidationStats {
  /** Number of memories before consolidation */
  memoriesBefore: number;
  /** Number of memories after consolidation */
  memoriesAfter: number;
  /** Number of memories deduplicated */
  deduplicated: number;
  /** Number of memories merged */
  merged: number;
  /** Number of memories archived */
  archived: number;
  /** Average importance score */
  avgImportance: number;
  /** Processing time in ms */
  processingTime: number;
}

/**
 * MemoryConsolidationService provides advanced algorithms for
 * memory optimization, deduplication, clustering, and lifecycle management.
 * It ensures efficient memory storage and retrieval by consolidating
 * similar memories and managing memory importance over time.
 */
@Injectable()
export class MemoryConsolidationService {
  private readonly logger = new Logger(MemoryConsolidationService.name);
  private readonly defaultConfig: Required<ConsolidationConfig> = {
    enabled: true,
    similarityThreshold: 0.85,
    minMemoriesForConsolidation: 100,
    maxMemoriesAfterConsolidation: 50,
    maturityThresholdHours: 24,
    dormancyThresholdHours: 168, // 1 week
    archiveThresholdHours: 720, // 30 days
    importanceDecayRate: 0.1, // 10% per day
    minImportanceThreshold: 0.1,
    enableBackgroundConsolidation: false,
    consolidationIntervalMinutes: 60,
  };

  private memoryMetadata: Map<string, ConsolidatedMemory> = new Map();
  private isConsolidating = false;

  constructor(
    private readonly vectorStoreService: VectorStoreService,
    readonly _timeWeightedRetriever: TimeWeightedVectorStoreRetriever,
    readonly _conversationSummary: ConversationSummaryMemory,
    readonly _entityMemory: EntityMemory,
    private readonly graphMemory: GraphMemory,
  ) {}

  /**
   * Consolidate memories for a specific thread
   */
  @TraceAI({
    name: 'memory.consolidate',
    operation: 'memory_consolidation',
  })
  @MetricMemory({
    memoryType: 'consolidation',
    operation: 'consolidate',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async consolidateMemories(threadId: string, config: ConsolidationConfig = {}): Promise<ConsolidationStats> {
    const startTime = Date.now();
    const mergedConfig = { ...this.defaultConfig, ...config };

    if (this.isConsolidating) {
      this.logger.warn('Consolidation already in progress, skipping');
      return this.createEmptyStats();
    }

    this.isConsolidating = true;

    try {
      // Step 1: Retrieve all memories for the thread
      const memories = await this.retrieveAllMemories(threadId);
      const memoriesBefore = memories.length;

      if (memories.length < mergedConfig.minMemoriesForConsolidation) {
        this.logger.debug(`Not enough memories for consolidation (${memories.length})`);
        return this.createEmptyStats();
      }

      // Step 2: Update lifecycle stages
      const categorizedMemories = this.categorizeByLifecycle(memories, mergedConfig);

      // Step 3: Apply importance decay
      this.applyImportanceDecay(categorizedMemories, mergedConfig);

      // Step 4: Deduplicate similar memories
      const deduplicatedMemories = await this.deduplicateMemories(categorizedMemories.active, mergedConfig.similarityThreshold);

      // Step 5: Cluster and merge related memories
      const clusteredMemories = await this.clusterAndMergeMemories(deduplicatedMemories, mergedConfig);

      // Step 6: Archive old memories
      const archivedCount = await this.archiveOldMemories(categorizedMemories[MemoryLifecycleStage.ARCHIVE_READY]);

      // Step 7: Prune low-importance memories
      const prunedMemories = this.pruneByImportance(clusteredMemories, mergedConfig);

      // Step 8: Update vector store with consolidated memories
      await this.updateVectorStore(prunedMemories, threadId);

      // Step 9: Update graph relationships
      await this.updateGraphRelationships(prunedMemories, threadId);

      const processingTime = Date.now() - startTime;

      const stats: ConsolidationStats = {
        memoriesBefore,
        memoriesAfter: prunedMemories.length,
        deduplicated: memoriesBefore - deduplicatedMemories.length,
        merged: deduplicatedMemories.length - clusteredMemories.length,
        archived: archivedCount,
        avgImportance: this.calculateAverageImportance(prunedMemories),
        processingTime,
      };

      this.logger.log(`Consolidation completed for thread ${threadId}`, stats);
      return stats;
    } catch (error) {
      this.logger.error('Failed to consolidate memories:', error);
      throw error;
    } finally {
      this.isConsolidating = false;
    }
  }

  /**
   * Deduplicate similar memories using semantic similarity
   */
  @TraceAI({
    name: 'memory.deduplicate',
    operation: 'memory_deduplication',
  })
  async deduplicateMemories(memories: ConsolidatedMemory[], similarityThreshold: number): Promise<ConsolidatedMemory[]> {
    if (memories.length < 2) {
      return memories;
    }

    const deduplicated: ConsolidatedMemory[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < memories.length; i++) {
      if (processed.has(i)) {
        continue;
      }

      const memory = memories[i];
      const similarGroup: ConsolidatedMemory[] = [memory];
      processed.add(i);

      // Find all similar memories
      for (let j = i + 1; j < memories.length; j++) {
        if (processed.has(j)) {
          continue;
        }

        const similarity = await this.calculateSimilarity(memory, memories[j]);
        if (similarity >= similarityThreshold) {
          similarGroup.push(memories[j]);
          processed.add(j);
        }
      }

      // Merge similar memories into one
      if (similarGroup.length > 1) {
        const merged = this.mergeSimilarMemories(similarGroup);
        deduplicated.push(merged);
      } else {
        deduplicated.push(memory);
      }
    }

    this.logger.debug(`Deduplicated ${memories.length} memories to ${deduplicated.length}`);
    return deduplicated;
  }

  /**
   * Cluster memories and merge each cluster
   */
  @TraceAI({
    name: 'memory.cluster_merge',
    operation: 'memory_clustering',
  })
  async clusterAndMergeMemories(memories: ConsolidatedMemory[], config: Required<ConsolidationConfig>): Promise<ConsolidatedMemory[]> {
    if (memories.length < 3) {
      return memories;
    }

    // Use DBSCAN-like clustering based on semantic similarity
    const clusters = await this.performSemanticClustering(
      memories,
      config.similarityThreshold * 0.8, // Slightly lower threshold for clustering
    );

    const mergedMemories: ConsolidatedMemory[] = [];

    for (const cluster of clusters) {
      if (cluster.length > 1 && cluster.length <= 5) {
        // Merge small clusters
        const merged = await this.mergeCluster(cluster);
        mergedMemories.push(merged);
      } else if (cluster.length > 5) {
        // Summarize large clusters
        const summarized = await this.summarizeCluster(cluster);
        mergedMemories.push(summarized);
      } else {
        // Keep single memories as is
        mergedMemories.push(...cluster);
      }
    }

    return mergedMemories;
  }

  /**
   * Calculate importance score for a memory
   */
  calculateImportanceScore(memory: ConsolidatedMemory): number {
    const now = Date.now();
    const age = (now - memory.document.metadata.timestamp) / (1000 * 60 * 60); // Hours

    // Factors for importance calculation
    const recencyFactor = Math.exp(-0.01 * age); // Exponential decay
    const accessFactor = Math.min(1, memory.accessCount / 10); // Normalize access count
    const explicitImportance = memory.document.metadata.importance || 0.5;
    const lifecycleFactor = this.getLifecycleFactor(memory.lifecycleStage);

    // Weighted combination
    const importance = recencyFactor * 0.3 + accessFactor * 0.2 + explicitImportance * 0.3 + lifecycleFactor * 0.2;

    return Math.max(0, Math.min(1, importance));
  }

  /**
   * Apply importance decay over time
   */
  private applyImportanceDecay(categorizedMemories: Record<MemoryLifecycleStage, ConsolidatedMemory[]>, config: Required<ConsolidationConfig>): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (const stage of Object.values(MemoryLifecycleStage)) {
      const memories = categorizedMemories[stage as MemoryLifecycleStage] || [];

      for (const memory of memories) {
        const age = (now - memory.document.metadata.timestamp) / dayInMs;
        const decayFactor = Math.exp(-config.importanceDecayRate * age);
        memory.importance = memory.importance * decayFactor;
      }
    }
  }

  /**
   * Categorize memories by lifecycle stage
   */
  private categorizeByLifecycle(
    memories: ConsolidatedMemory[],
    config: Required<ConsolidationConfig>,
  ): Record<MemoryLifecycleStage, ConsolidatedMemory[]> {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const categorized: Record<MemoryLifecycleStage, ConsolidatedMemory[]> = {
      [MemoryLifecycleStage.NEW]: [],
      [MemoryLifecycleStage.ACTIVE]: [],
      [MemoryLifecycleStage.MATURE]: [],
      [MemoryLifecycleStage.DORMANT]: [],
      [MemoryLifecycleStage.ARCHIVE_READY]: [],
      [MemoryLifecycleStage.ARCHIVED]: [],
    };

    for (const memory of memories) {
      const ageHours = (now - memory.document.metadata.timestamp) / hourInMs;

      if (ageHours < config.maturityThresholdHours) {
        memory.lifecycleStage = MemoryLifecycleStage.ACTIVE;
        categorized[MemoryLifecycleStage.ACTIVE].push(memory);
      } else if (ageHours < config.dormancyThresholdHours) {
        memory.lifecycleStage = MemoryLifecycleStage.MATURE;
        categorized[MemoryLifecycleStage.MATURE].push(memory);
      } else if (ageHours < config.archiveThresholdHours) {
        memory.lifecycleStage = MemoryLifecycleStage.DORMANT;
        categorized[MemoryLifecycleStage.DORMANT].push(memory);
      } else {
        memory.lifecycleStage = MemoryLifecycleStage.ARCHIVE_READY;
        categorized[MemoryLifecycleStage.ARCHIVE_READY].push(memory);
      }
    }

    return categorized;
  }

  /**
   * Perform semantic clustering using similarity
   */
  private async performSemanticClustering(memories: ConsolidatedMemory[], threshold: number): Promise<ConsolidatedMemory[][]> {
    const clusters: ConsolidatedMemory[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < memories.length; i++) {
      if (assigned.has(i)) {
        continue;
      }

      const cluster: ConsolidatedMemory[] = [memories[i]];
      assigned.add(i);

      // Find all memories similar to this one
      for (let j = i + 1; j < memories.length; j++) {
        if (assigned.has(j)) {
          continue;
        }

        const similarity = await this.calculateSimilarity(memories[i], memories[j]);
        if (similarity >= threshold) {
          cluster.push(memories[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Merge similar memories into one comprehensive memory
   */
  private mergeSimilarMemories(memories: ConsolidatedMemory[]): ConsolidatedMemory {
    if (memories.length === 1) {
      return memories[0];
    }

    // Sort by importance and recency
    const sorted = memories.sort((a, b) => {
      const importanceDiff = b.importance - a.importance;
      if (Math.abs(importanceDiff) > 0.1) {
        return importanceDiff;
      }
      return b.document.metadata.timestamp - a.document.metadata.timestamp;
    });

    const primary = sorted[0];
    const consolidatedContent = this.mergeContent(memories.map((m) => m.document.pageContent));
    const consolidatedIds = memories.flatMap((m) => m.consolidatedFrom || [m.document.metadata.id as string]).filter(Boolean);

    return {
      document: new Document({
        pageContent: consolidatedContent,
        metadata: {
          ...primary.document.metadata,
          consolidatedAt: Date.now(),
          consolidatedCount: memories.length,
          consolidatedFrom: consolidatedIds,
        },
      }),
      importance: Math.max(...memories.map((m) => m.importance)),
      accessCount: memories.reduce((sum, m) => sum + m.accessCount, 0),
      lastAccessed: Math.max(...memories.map((m) => m.lastAccessed)),
      lifecycleStage: primary.lifecycleStage,
      consolidatedFrom: consolidatedIds,
      consolidationStrategy: ConsolidationStrategy.MERGE,
    };
  }

  /**
   * Merge cluster of memories
   */
  private async mergeCluster(cluster: ConsolidatedMemory[]): Promise<ConsolidatedMemory> {
    const merged = this.mergeSimilarMemories(cluster);
    merged.clusterId = `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    merged.consolidationStrategy = ConsolidationStrategy.CLUSTER;
    return merged;
  }

  /**
   * Summarize a large cluster of memories
   */
  private async summarizeCluster(cluster: ConsolidatedMemory[]): Promise<ConsolidatedMemory> {
    const contents = cluster.map((m) => m.document.pageContent);
    const summary = await this.generateSummary(contents);

    const mostImportant = cluster.reduce((prev, curr) => (prev.importance > curr.importance ? prev : curr));

    return {
      document: new Document({
        pageContent: summary,
        metadata: {
          ...mostImportant.document.metadata,
          isSummary: true,
          summarizedAt: Date.now(),
          summarizedCount: cluster.length,
          consolidatedFrom: cluster.flatMap((m) => m.consolidatedFrom || [m.document.metadata.id as string]).filter(Boolean),
        },
      }),
      importance: Math.max(...cluster.map((m) => m.importance)),
      accessCount: cluster.reduce((sum, m) => sum + m.accessCount, 0),
      lastAccessed: Math.max(...cluster.map((m) => m.lastAccessed)),
      lifecycleStage: mostImportant.lifecycleStage,
      clusterId: `summary-${Date.now()}`,
      consolidatedFrom: cluster.flatMap((m) => m.consolidatedFrom || [m.document.metadata.id as string]).filter(Boolean),
      consolidationStrategy: ConsolidationStrategy.SUMMARIZE,
    };
  }

  /**
   * Archive old memories to secondary storage
   */
  private async archiveOldMemories(memories: ConsolidatedMemory[]): Promise<number> {
    if (memories.length === 0) {
      return 0;
    }

    // In a real implementation, this would move memories to secondary storage
    // For now, we'll just mark them as archived
    for (const memory of memories) {
      memory.lifecycleStage = MemoryLifecycleStage.ARCHIVED;
      memory.document.metadata.archivedAt = Date.now();
    }

    this.logger.debug(`Archived ${memories.length} old memories`);
    return memories.length;
  }

  /**
   * Prune memories below importance threshold
   */
  private pruneByImportance(memories: ConsolidatedMemory[], config: Required<ConsolidationConfig>): ConsolidatedMemory[] {
    const filtered = memories.filter((m) => m.importance >= config.minImportanceThreshold);

    // If still too many, keep only the most important
    if (filtered.length > config.maxMemoriesAfterConsolidation) {
      return filtered.sort((a, b) => b.importance - a.importance).slice(0, config.maxMemoriesAfterConsolidation);
    }

    return filtered;
  }

  /**
   * Update vector store with consolidated memories
   */
  private async updateVectorStore(memories: ConsolidatedMemory[], threadId: string): Promise<void> {
    // Clear existing memories for the thread
    await this.vectorStoreService.clearThreadMemories(threadId);

    // Store consolidated memories
    const documents = memories.map((m) => ({
      content: m.document.pageContent,
      metadata: {
        threadId,
        timestamp: m.document.metadata.timestamp || Date.now(),
        messageType: (m.document.metadata.messageType || 'assistant') as 'user' | 'assistant' | 'system',
        importance: m.importance,
        lifecycleStage: m.lifecycleStage,
      },
    }));

    await this.vectorStoreService.storeMemories(documents);
  }

  /**
   * Update graph relationships for consolidated memories
   */
  private async updateGraphRelationships(memories: ConsolidatedMemory[], threadId: string): Promise<void> {
    // Clear existing graph for thread
    await this.graphMemory.clearThreadGraph(threadId);

    // Extract and rebuild relationships
    for (const memory of memories) {
      await this.graphMemory.extractNodesAndEdges(memory.document.pageContent, threadId);
    }
  }

  /**
   * Calculate similarity between two memories
   */
  private async calculateSimilarity(memory1: ConsolidatedMemory, memory2: ConsolidatedMemory): Promise<number> {
    // Use embeddings if available
    if (memory1.embedding && memory2.embedding) {
      return this.cosineSimilarity(memory1.embedding, memory2.embedding);
    }

    // Fallback to content-based similarity
    return this.jaccardSimilarity(memory1.document.pageContent, memory2.document.pageContent);
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate Jaccard similarity between text contents
   */
  private jaccardSimilarity(text1: string, text2: string): number {
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Merge multiple content strings
   */
  private mergeContent(contents: string[]): string {
    if (contents.length === 1) {
      return contents[0];
    }

    // Remove duplicates and combine
    const uniqueContents = [...new Set(contents)];
    return uniqueContents.join('\n\n---\n\n');
  }

  /**
   * Generate summary of multiple contents
   */
  private async generateSummary(contents: string[]): Promise<string> {
    // In a real implementation, this would use an LLM to generate a summary
    // For now, we'll create a simple concatenation with deduplication
    const combined = contents.join(' ');
    const sentences = combined.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    const uniqueSentences = [...new Set(sentences)];

    // Take first few sentences as summary
    return `${uniqueSentences.slice(0, 5).join('. ')}.`;
  }

  /**
   * Get lifecycle factor for importance calculation
   */
  private getLifecycleFactor(stage: MemoryLifecycleStage): number {
    switch (stage) {
      case MemoryLifecycleStage.NEW:
        return 1.0;
      case MemoryLifecycleStage.ACTIVE:
        return 0.9;
      case MemoryLifecycleStage.MATURE:
        return 0.7;
      case MemoryLifecycleStage.DORMANT:
        return 0.4;
      case MemoryLifecycleStage.ARCHIVE_READY:
        return 0.2;
      case MemoryLifecycleStage.ARCHIVED:
        return 0.1;
      default:
        return 0.5;
    }
  }

  /**
   * Retrieve all memories for a thread
   */
  private async retrieveAllMemories(threadId: string): Promise<ConsolidatedMemory[]> {
    const docs = await this.vectorStoreService.retrieveRelevantMemories(
      '', // Empty query to get all
      threadId,
      { limit: 1000 }, // High limit to get all memories
    );

    return docs.map((doc) => this.documentToConsolidatedMemory(doc));
  }

  /**
   * Convert Document to ConsolidatedMemory
   */
  private documentToConsolidatedMemory(doc: Document): ConsolidatedMemory {
    const metadata = this.memoryMetadata.get(doc.metadata.id as string) || {
      importance: doc.metadata.importance || 0.5,
      accessCount: 0,
      lastAccessed: Date.now(),
      lifecycleStage: MemoryLifecycleStage.NEW,
    };

    return {
      document: doc,
      importance: metadata.importance,
      accessCount: metadata.accessCount,
      lastAccessed: metadata.lastAccessed,
      lifecycleStage: metadata.lifecycleStage,
    };
  }

  /**
   * Calculate average importance
   */
  private calculateAverageImportance(memories: ConsolidatedMemory[]): number {
    if (memories.length === 0) {
      return 0;
    }
    const sum = memories.reduce((total, m) => total + m.importance, 0);
    return sum / memories.length;
  }

  /**
   * Create empty stats
   */
  private createEmptyStats(): ConsolidationStats {
    return {
      memoriesBefore: 0,
      memoriesAfter: 0,
      deduplicated: 0,
      merged: 0,
      archived: 0,
      avgImportance: 0,
      processingTime: 0,
    };
  }

  /**
   * Background consolidation job (if enabled)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async backgroundConsolidation(): Promise<void> {
    if (!this.defaultConfig.enableBackgroundConsolidation) {
      return;
    }

    this.logger.log('Starting background memory consolidation');

    try {
      // In a real implementation, this would process all active threads
      // For now, we'll skip automatic consolidation
      this.logger.debug('Background consolidation placeholder');
    } catch (error) {
      this.logger.error('Background consolidation failed:', error);
    }
  }

  /**
   * Get consolidation statistics for monitoring
   */
  async getConsolidationHealth(): Promise<{
    isConsolidating: boolean;
    lastConsolidation?: Date;
    memoryCount: number;
    averageImportance: number;
    lifecycleDistribution: Record<MemoryLifecycleStage, number>;
    compressionRatio?: number;
    deduplicationRate?: number;
  }> {
    const allMemories = Array.from(this.memoryMetadata.values());
    
    // Calculate lifecycle distribution
    const lifecycleDistribution = this.calculateLifecycleDistribution(allMemories);
    
    // Calculate compression ratio if we have compressed memories
    const compressionRatio = this.calculateCompressionRatio(allMemories);
    
    // Calculate deduplication rate from last consolidation
    const deduplicationRate = this.lastConsolidationStats?.deduplicated 
      ? this.lastConsolidationStats.deduplicated / (this.lastConsolidationStats.deduplicated + allMemories.length)
      : undefined;

    return {
      isConsolidating: this.isConsolidating,
      lastConsolidation: this.lastConsolidationStats?.timestamp,
      memoryCount: allMemories.length,
      averageImportance: this.calculateAverageImportance(allMemories),
      lifecycleDistribution,
      compressionRatio,
      deduplicationRate,
    };
  }

  /**
   * Calculate lifecycle distribution
   */
  private calculateLifecycleDistribution(memories: ConsolidatedMemory[]): Record<MemoryLifecycleStage, number> {
    const distribution: Record<MemoryLifecycleStage, number> = {
      [MemoryLifecycleStage.NEW]: 0,
      [MemoryLifecycleStage.ACTIVE]: 0,
      [MemoryLifecycleStage.MATURE]: 0,
      [MemoryLifecycleStage.DORMANT]: 0,
      [MemoryLifecycleStage.ARCHIVE_READY]: 0,
      [MemoryLifecycleStage.ARCHIVED]: 0,
    };

    for (const memory of memories) {
      distribution[memory.lifecycleStage]++;
    }

    return distribution;
  }

  /**
   * Calculate compression ratio for compressed memories
   */
  private calculateCompressionRatio(memories: ConsolidatedMemory[]): number | undefined {
    const compressedMemories = memories.filter(m => m.compressionRatio !== undefined);
    if (compressedMemories.length === 0) return undefined;
    
    const totalRatio = compressedMemories.reduce((sum, m) => sum + (m.compressionRatio || 1), 0);
    return totalRatio / compressedMemories.length;
  }

  /**
   * Compress memory content for long-term storage
   */
  @TraceAI({
    name: 'memory.compress',
    operation: 'memory_compression',
  })
  async compressMemory(memory: ConsolidatedMemory): Promise<ConsolidatedMemory> {
    const originalSize = JSON.stringify(memory).length;
    
    // Create compressed version with essential information only
    const compressed: ConsolidatedMemory = {
      ...memory,
      compressedContent: this.extractEssentialContent(memory),
      compressionRatio: undefined,
      originalSize,
    };

    // Remove detailed content to save space
    if (compressed.compressedContent) {
      compressed.content = compressed.compressedContent;
      delete compressed.compressedContent;
      delete compressed.metadata.fullContext;
      delete compressed.metadata.rawMessages;
      
      const compressedSize = JSON.stringify(compressed).length;
      compressed.compressionRatio = compressedSize / originalSize;
    }

    return compressed;
  }

  /**
   * Extract essential content from memory
   */
  private extractEssentialContent(memory: ConsolidatedMemory): string {
    // Extract key facts and entities
    const facts = memory.metadata.facts || [];
    const entities = memory.metadata.entities || [];
    const summary = memory.summary || memory.content.substring(0, 200);
    
    return `Summary: ${summary}\nKey Facts: ${facts.join('; ')}\nEntities: ${entities.join(', ')}`;
  }

  /**
   * Cleanup policies for different memory types
   */
  async applyCleanupPolicies(
    threadId: string,
    policies: {
      maxAge?: number; // Maximum age in days
      maxCount?: number; // Maximum number of memories
      minImportance?: number; // Minimum importance score to keep
      preserveKeywords?: string[]; // Keywords to always preserve
    },
  ): Promise<number> {
    const memories = await this.getMemoriesForThread(threadId);
    let removedCount = 0;

    for (const memory of memories) {
      if (this.shouldRemoveMemory(memory, policies)) {
        await this.removeMemory(memory.id);
        removedCount++;
      }
    }

    this.logger.debug(`Removed ${removedCount} memories based on cleanup policies`);
    return removedCount;
  }

  /**
   * Check if memory should be removed based on policies
   */
  private shouldRemoveMemory(
    memory: ConsolidatedMemory,
    policies: {
      maxAge?: number;
      minImportance?: number;
      preserveKeywords?: string[];
    },
  ): boolean {
    // Check age policy
    if (policies.maxAge) {
      const ageInDays = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
      if (ageInDays > policies.maxAge) {
        // Check if memory contains preserve keywords
        if (policies.preserveKeywords?.length) {
          const content = memory.content.toLowerCase();
          const hasKeyword = policies.preserveKeywords.some(keyword => 
            content.includes(keyword.toLowerCase())
          );
          if (hasKeyword) return false;
        }
        return true;
      }
    }

    // Check importance policy
    if (policies.minImportance && memory.importanceScore < policies.minImportance) {
      return true;
    }

    return false;
  }

  /**
   * Remove a memory from storage
   */
  private async removeMemory(memoryId: string): Promise<void> {
    this.memoryMetadata.delete(memoryId);
    // Additional cleanup in vector store would go here
  }

  /**
   * Get memories for a specific thread
   */
  private async getMemoriesForThread(threadId: string): Promise<ConsolidatedMemory[]> {
    return Array.from(this.memoryMetadata.values()).filter(
      m => m.metadata.threadId === threadId
    );
  }

  private lastConsolidationStats?: ConsolidationStats & { timestamp: Date };
}
