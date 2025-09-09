import type { BaseMessage } from '@langchain/core/messages';
import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { HybridMemoryServiceInterface, RetrievedMemory } from '../../agent/memory/types';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { ConversationThread } from '../entities/conversation-thread.entity';
import { ThreadSummaryService } from './thread-summary.service';
import { ThreadsService } from './threads.service';

/**
 * Memory isolation levels for cross-thread sharing
 */
export enum MemoryIsolationLevel {
  /** Complete isolation - no cross-thread access */
  STRICT = 'strict',
  /** Allow read-only access to public memories */
  READ_ONLY = 'read_only',
  /** Allow reading shared memories from same category */
  CATEGORY_SCOPED = 'category_scoped',
  /** Allow reading from parent/child threads */
  HIERARCHY_SCOPED = 'hierarchy_scoped',
  /** Allow reading from explicitly shared threads */
  EXPLICIT_SHARED = 'explicit_shared',
  /** Full access to all memories (admin/debug mode) */
  UNRESTRICTED = 'unrestricted',
}

/**
 * Memory access scope definition
 */
export interface MemoryScope {
  /** Primary thread ID */
  threadId: string;
  /** Isolation level */
  isolationLevel: MemoryIsolationLevel;
  /** Allowed thread IDs for sharing */
  allowedThreads?: string[];
  /** Allowed categories for sharing */
  allowedCategories?: string[];
  /** User/owner context for access control */
  userId?: string;
  /** Role-based access control */
  userRole?: 'viewer' | 'contributor' | 'owner' | 'admin';
  /** Time-based access restrictions */
  timeWindow?: {
    start: Date;
    end: Date;
  };
}

/**
 * Shared memory pool configuration
 */
export interface SharedMemoryPool {
  /** Pool identifier */
  id: string;
  /** Pool name */
  name: string;
  /** Thread IDs participating in the pool */
  threadIds: string[];
  /** Pool-wide isolation level */
  isolationLevel: MemoryIsolationLevel;
  /** Pool metadata */
  metadata?: {
    purpose?: string;
    tags?: string[];
    createdAt?: Date;
    expiresAt?: Date;
  };
}

/**
 * Memory sharing request
 */
export interface MemorySharingRequest {
  /** Source thread requesting access */
  sourceThreadId: string;
  /** Target thread to access */
  targetThreadId: string;
  /** Type of access requested */
  accessType: 'read' | 'write' | 'delete';
  /** Reason for access */
  reason?: string;
  /** User making the request */
  userId?: string;
}

/**
 * Memory synchronization options
 */
export interface MemorySyncOptions {
  /** Synchronization direction */
  direction: 'pull' | 'push' | 'bidirectional';
  /** Filter for selective sync */
  filter?: {
    tags?: string[];
    timeRange?: {
      start: Date;
      end: Date;
    };
    importance?: number;
  };
  /** Conflict resolution strategy */
  conflictResolution?: 'newer_wins' | 'older_wins' | 'merge' | 'manual';
}

/**
 * Access control result
 */
export interface AccessControlResult {
  /** Whether access is granted */
  granted: boolean;
  /** Reason if access is denied */
  reason?: string;
  /** Restricted scope if partially granted */
  restrictedScope?: Partial<MemoryScope>;
  /** Audit trail entry */
  auditEntry?: {
    timestamp: Date;
    action: string;
    result: 'granted' | 'denied';
    metadata?: Record<string, unknown>;
  };
}

/**
 * ThreadMemorySharingService provides controlled memory sharing between threads
 *
 * This service implements:
 * - Configurable isolation levels for memory access
 * - Shared memory pools for collaborative contexts
 * - Access control mechanisms based on thread relationships
 * - Memory synchronization between threads
 * - Audit logging for compliance and debugging
 */
@Injectable()
export class ThreadMemorySharingService {
  private readonly logger = new Logger(ThreadMemorySharingService.name);
  private readonly memoryPools = new Map<string, SharedMemoryPool>();
  private readonly accessCache = new Map<string, AccessControlResult>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(ConversationThread)
    private readonly threadRepository: Repository<ConversationThread>,
    readonly _threadsService: ThreadsService,
    readonly _threadSummaryService: ThreadSummaryService,
    @Optional()
    @Inject('MEMORY_SERVICE')
    private readonly memoryService?: HybridMemoryServiceInterface,
  ) {}

  /**
   * Create a memory scope for a thread
   */
  @TraceAI({ name: 'thread_memory_sharing.create_scope' })
  async createMemoryScope(
    threadId: string,
    isolationLevel: MemoryIsolationLevel = MemoryIsolationLevel.CATEGORY_SCOPED,
    options?: Partial<MemoryScope>,
  ): Promise<MemoryScope> {
    this.logger.debug(`Creating memory scope for thread ${threadId} with isolation level ${isolationLevel}`);

    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['category', 'parentThread', 'childThreads'],
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    const scope: MemoryScope = {
      threadId,
      isolationLevel,
      ...options,
    };

    // Auto-populate allowed threads based on isolation level
    if (isolationLevel === MemoryIsolationLevel.HIERARCHY_SCOPED) {
      const childThreadIds: string[] = [];
      if (thread.childThreads) {
        const children = await thread.childThreads;
        childThreadIds.push(...children.map((child) => child.id));
      }

      scope.allowedThreads = [...(thread.parentThread ? [thread.parentThread.id] : []), ...childThreadIds];
    } else if (isolationLevel === MemoryIsolationLevel.CATEGORY_SCOPED && thread.category) {
      scope.allowedCategories = [thread.category.id];
    }

    return scope;
  }

  /**
   * Check if memory access is allowed between threads
   */
  @TraceAI({ name: 'thread_memory_sharing.check_access' })
  async checkMemoryAccess(request: MemorySharingRequest): Promise<AccessControlResult> {
    const cacheKey = `${request.sourceThreadId}-${request.targetThreadId}-${request.accessType}`;

    // Check cache first
    const cached = this.accessCache.get(cacheKey);
    if (cached?.auditEntry && Date.now() - cached.auditEntry.timestamp.getTime() < this.CACHE_TTL) {
      return cached;
    }

    const [sourceThread, targetThread] = await Promise.all([
      this.threadRepository.findOne({
        where: { id: request.sourceThreadId },
        relations: ['category', 'parentThread'],
      }),
      this.threadRepository.findOne({
        where: { id: request.targetThreadId },
        relations: ['category'],
      }),
    ]);

    if (!sourceThread || !targetThread) {
      return this.createAccessResult(false, 'Thread not found');
    }

    // Check various access patterns
    let result: AccessControlResult;

    // 1. Same thread always allowed
    if (request.sourceThreadId === request.targetThreadId) {
      result = this.createAccessResult(true);
    }
    // 2. Parent-child relationship
    else if (sourceThread.parentThreadId === request.targetThreadId || targetThread.parentThreadId === request.sourceThreadId) {
      result = this.createAccessResult(
        request.accessType === 'read',
        request.accessType !== 'read' ? 'Write access denied for parent-child relationship' : undefined,
      );
    }
    // 3. Same category
    else if (sourceThread.categoryId && sourceThread.categoryId === targetThread.categoryId) {
      result = this.createAccessResult(
        request.accessType === 'read',
        request.accessType !== 'read' ? 'Write access denied for category-scoped sharing' : undefined,
      );
    }
    // 4. Check shared memory pools
    else if (await this.areThreadsInSamePool(request.sourceThreadId, request.targetThreadId)) {
      result = this.createAccessResult(true);
    }
    // 5. Default deny
    else {
      result = this.createAccessResult(false, 'No sharing relationship exists between threads');
    }

    // Cache the result
    this.accessCache.set(cacheKey, result);

    // Log audit entry
    this.logger.debug(`Access control: ${request.sourceThreadId} -> ${request.targetThreadId} (${request.accessType}): ${result.granted}`);

    return result;
  }

  /**
   * Retrieve memories with isolation controls
   */
  @TraceAI({ name: 'thread_memory_sharing.retrieve_with_isolation' })
  async retrieveMemoriesWithIsolation(query: string, scope: MemoryScope, limit = 10): Promise<RetrievedMemory[]> {
    if (!this.memoryService) {
      return [];
    }

    const memories: RetrievedMemory[] = [];

    // Always include own thread memories
    const ownMemories = await this.memoryService.retrieveRelevantMemories(query, scope.threadId, { limit, includeGlobalMemories: false });
    memories.push(...ownMemories);

    // Add memories based on isolation level
    switch (scope.isolationLevel) {
      case MemoryIsolationLevel.STRICT:
        // Only own memories
        break;

      case MemoryIsolationLevel.READ_ONLY:
        // Add public/shared memories
        if (scope.allowedThreads) {
          for (const threadId of scope.allowedThreads) {
            const sharedMemories = await this.memoryService.retrieveRelevantMemories(query, threadId, {
              limit: Math.floor(limit / 2),
              includeGlobalMemories: false,
            });
            memories.push(...sharedMemories.map((m) => ({ ...m, relevanceScore: m.relevanceScore * 0.8 }))); // Reduce relevance for shared
          }
        }
        break;

      case MemoryIsolationLevel.CATEGORY_SCOPED:
        // Add memories from same category threads
        if (scope.allowedCategories && scope.allowedCategories.length > 0) {
          const categoryThreads = await this.threadRepository.find({
            where: { categoryId: scope.allowedCategories[0] },
            select: ['id'],
          });

          for (const thread of categoryThreads) {
            if (thread.id !== scope.threadId) {
              const categoryMemories = await this.memoryService.retrieveRelevantMemories(query, thread.id, {
                limit: Math.floor(limit / 3),
                includeGlobalMemories: false,
              });
              memories.push(...categoryMemories.map((m) => ({ ...m, relevanceScore: m.relevanceScore * 0.7 })));
            }
          }
        }
        break;

      case MemoryIsolationLevel.HIERARCHY_SCOPED:
        // Add memories from parent/child threads
        if (scope.allowedThreads) {
          for (const threadId of scope.allowedThreads) {
            const hierarchyMemories = await this.memoryService.retrieveRelevantMemories(query, threadId, {
              limit: Math.floor(limit / 2),
              includeGlobalMemories: false,
            });
            memories.push(...hierarchyMemories.map((m) => ({ ...m, relevanceScore: m.relevanceScore * 0.9 }))); // Higher relevance for hierarchy
          }
        }
        break;

      case MemoryIsolationLevel.EXPLICIT_SHARED:
        // Only explicitly shared threads
        if (scope.allowedThreads) {
          for (const threadId of scope.allowedThreads) {
            const explicitMemories = await this.memoryService.retrieveRelevantMemories(query, threadId, {
              limit: Math.floor(limit / scope.allowedThreads.length),
              includeGlobalMemories: false,
            });
            memories.push(...explicitMemories);
          }
        }
        break;

      case MemoryIsolationLevel.UNRESTRICTED: {
        // Include global memories
        const globalMemories = await this.memoryService.retrieveRelevantMemories(query, scope.threadId, { limit, includeGlobalMemories: true });
        return globalMemories;
      }
    }

    // Sort by relevance and deduplicate
    const uniqueMemories = this.deduplicateMemories(memories);
    uniqueMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return uniqueMemories.slice(0, limit);
  }

  /**
   * Create a shared memory pool
   */
  @TraceAI({ name: 'thread_memory_sharing.create_pool' })
  async createSharedMemoryPool(
    name: string,
    threadIds: string[],
    isolationLevel: MemoryIsolationLevel = MemoryIsolationLevel.EXPLICIT_SHARED,
    metadata?: SharedMemoryPool['metadata'],
  ): Promise<SharedMemoryPool> {
    const poolId = `pool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate all threads exist
    const threads = await this.threadRepository.findByIds(threadIds);
    if (threads.length !== threadIds.length) {
      throw new NotFoundException('One or more threads not found');
    }

    const pool: SharedMemoryPool = {
      id: poolId,
      name,
      threadIds,
      isolationLevel,
      metadata: {
        ...metadata,
        createdAt: new Date(),
      },
    };

    this.memoryPools.set(poolId, pool);
    this.logger.log(`Created shared memory pool ${poolId} with ${threadIds.length} threads`);

    return pool;
  }

  /**
   * Synchronize memories between threads
   */
  @TraceAI({ name: 'thread_memory_sharing.sync_memories' })
  async synchronizeMemories(
    sourceThreadId: string,
    targetThreadId: string,
    options: MemorySyncOptions,
  ): Promise<{ synchronized: number; conflicts: number }> {
    // Check access permissions
    const accessCheck = await this.checkMemoryAccess({
      sourceThreadId,
      targetThreadId,
      accessType: options.direction === 'push' ? 'write' : 'read',
    });

    if (!accessCheck.granted) {
      throw new ForbiddenException(accessCheck.reason);
    }

    if (!this.memoryService) {
      return { synchronized: 0, conflicts: 0 };
    }

    let synchronized = 0;
    const conflicts = 0;

    // Get memories based on direction
    if (options.direction === 'pull' || options.direction === 'bidirectional') {
      const sourceMessages = await this.memoryService.getConversationHistory(targetThreadId);

      // Filter messages based on options
      const filteredMessages = this.filterMessages(sourceMessages, options.filter);

      // Store in target thread
      if (filteredMessages.length > 0) {
        await this.memoryService.storeConversationMemory(filteredMessages, sourceThreadId, { tags: ['synchronized', `from_${targetThreadId}`] });
        synchronized += filteredMessages.length;
      }
    }

    if (options.direction === 'push' || options.direction === 'bidirectional') {
      const targetMessages = await this.memoryService.getConversationHistory(sourceThreadId);

      // Filter messages based on options
      const filteredMessages = this.filterMessages(targetMessages, options.filter);

      // Store in source thread
      if (filteredMessages.length > 0) {
        await this.memoryService.storeConversationMemory(filteredMessages, targetThreadId, { tags: ['synchronized', `from_${sourceThreadId}`] });
        synchronized += filteredMessages.length;
      }
    }

    this.logger.log(`Synchronized ${synchronized} memories between threads ${sourceThreadId} and ${targetThreadId}`);

    return { synchronized, conflicts };
  }

  /**
   * Get cross-thread context for enhanced responses
   */
  @TraceAI({ name: 'thread_memory_sharing.get_cross_thread_context' })
  async getCrossThreadContext(
    threadId: string,
    query: string,
    scope: MemoryScope,
  ): Promise<{
    primaryContext: RetrievedMemory[];
    sharedContext: RetrievedMemory[];
    summaries: Array<{ threadId: string; summary: string }>;
  }> {
    // Get primary thread memories
    const primaryContext = await this.retrieveMemoriesWithIsolation(query, scope, 5);

    // Get shared context based on scope
    const sharedContext: RetrievedMemory[] = [];
    const summaries: Array<{ threadId: string; summary: string }> = [];

    if (scope.isolationLevel !== MemoryIsolationLevel.STRICT) {
      // Get related thread summaries for additional context
      const relatedThreadIds = scope.allowedThreads || [];

      if (scope.allowedCategories && scope.allowedCategories.length > 0) {
        const categoryThreads = await this.threadRepository.find({
          where: { categoryId: scope.allowedCategories[0] },
          select: ['id'],
          take: 5,
        });
        relatedThreadIds.push(...categoryThreads.map((t) => t.id));
      }

      // Get summaries from related threads
      for (const relatedId of [...new Set(relatedThreadIds)]) {
        if (relatedId !== threadId) {
          const thread = await this.threadRepository.findOne({ where: { id: relatedId } });
          if (thread?.summary) {
            summaries.push({
              threadId: relatedId,
              summary: thread.summary,
            });
          }

          // Get top memories from related thread
          if (this.memoryService) {
            const relatedMemories = await this.memoryService.retrieveRelevantMemories(query, relatedId, { limit: 2, includeGlobalMemories: false });
            sharedContext.push(
              ...relatedMemories.map((m) => ({
                ...m,
                relevanceScore: m.relevanceScore * 0.7,
                metadata: { ...m.metadata, sourceThreadId: relatedId },
              })),
            );
          }
        }
      }
    }

    return {
      primaryContext,
      sharedContext,
      summaries,
    };
  }

  /**
   * Clear access cache (for testing or forced refresh)
   */
  clearAccessCache(): void {
    this.accessCache.clear();
    this.logger.debug('Access cache cleared');
  }

  /**
   * Get all memory pools
   */
  getMemoryPools(): SharedMemoryPool[] {
    return Array.from(this.memoryPools.values());
  }

  /**
   * Delete a memory pool
   */
  deleteMemoryPool(poolId: string): boolean {
    const deleted = this.memoryPools.delete(poolId);
    if (deleted) {
      this.logger.log(`Deleted memory pool ${poolId}`);
    }
    return deleted;
  }

  /**
   * Private helper methods
   */

  private createAccessResult(granted: boolean, reason?: string): AccessControlResult {
    return {
      granted,
      reason,
      auditEntry: {
        timestamp: new Date(),
        action: 'memory_access_check',
        result: granted ? 'granted' : 'denied',
        metadata: reason ? { reason } : undefined,
      },
    };
  }

  private async areThreadsInSamePool(threadId1: string, threadId2: string): Promise<boolean> {
    for (const pool of this.memoryPools.values()) {
      if (pool.threadIds.includes(threadId1) && pool.threadIds.includes(threadId2)) {
        return true;
      }
    }
    return false;
  }

  private deduplicateMemories(memories: RetrievedMemory[]): RetrievedMemory[] {
    const seen = new Set<string>();
    return memories.filter((memory) => {
      const key = `${memory.content}_${memory.timestamp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private filterMessages(messages: BaseMessage[], filter?: MemorySyncOptions['filter']): BaseMessage[] {
    if (!filter) {
      return messages;
    }

    return messages.filter((message) => {
      // Apply time range filter
      if (filter.timeRange) {
        const timestamp = message.additional_kwargs?.timestamp;
        const messageTime = typeof timestamp === 'number' ? timestamp : Date.now();
        if (messageTime < filter.timeRange.start.getTime() || messageTime > filter.timeRange.end.getTime()) {
          return false;
        }
      }

      // Apply tag filter
      if (filter.tags && message.additional_kwargs?.tags) {
        const messageTags = message.additional_kwargs.tags as string[];
        if (!filter.tags.some((tag) => messageTags.includes(tag))) {
          return false;
        }
      }

      // Apply importance filter
      if (filter.importance !== undefined && message.additional_kwargs?.importance) {
        if ((message.additional_kwargs.importance as number) < filter.importance) {
          return false;
        }
      }

      return true;
    });
  }
}
