import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { MetricMemory } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';

/**
 * Entity types that can be extracted and tracked
 */
export enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  LOCATION = 'location',
  PRODUCT = 'product',
  DATE = 'date',
  EVENT = 'event',
  CONCEPT = 'concept',
  CUSTOM = 'custom',
}

/**
 * Entity information stored in memory
 */
export interface Entity {
  /** Unique identifier for the entity */
  id: string;
  /** The entity name/value */
  name: string;
  /** Type of entity */
  type: EntityType;
  /** Descriptive information about the entity */
  description: string;
  /** Key facts and attributes */
  facts: string[];
  /** Relationships to other entities */
  relationships: Array<{
    entityId: string;
    entityName: string;
    relationshipType: string;
  }>;
  /** When the entity was first mentioned */
  firstMentioned: number;
  /** When the entity was last updated */
  lastUpdated: number;
  /** Number of times mentioned */
  mentionCount: number;
  /** Relevance score (0-1) */
  relevanceScore: number;
}

/**
 * Options for entity extraction
 */
export interface EntityExtractionOptions {
  /** Types of entities to extract */
  entityTypes?: EntityType[];
  /** Minimum confidence score for extraction */
  minConfidence?: number;
  /** Maximum entities to track per thread */
  maxEntitiesPerThread?: number;
  /** Custom extraction prompt */
  customExtractionPrompt?: string;
  /** Whether to extract relationships */
  extractRelationships?: boolean;
}

/**
 * Entity memory state for a thread
 */
export interface EntityMemoryState {
  /** Map of entity ID to entity */
  entities: Map<string, Entity>;
  /** Last extraction timestamp */
  lastExtractionTime: number;
  /** Total extractions performed */
  extractionCount: number;
}

/**
 * EntityMemory implementation for tracking entities across conversations
 * This memory type extracts and maintains information about entities
 * mentioned in conversations (people, places, concepts, etc).
 */
@Injectable()
export class EntityMemory {
  private readonly logger = new Logger(EntityMemory.name);
  private entityStates: Map<string, EntityMemoryState> = new Map();
  private readonly defaultOptions: Required<EntityExtractionOptions> = {
    entityTypes: Object.values(EntityType),
    minConfidence: 0.7,
    maxEntitiesPerThread: 100,
    customExtractionPrompt:
      'Extract entities (people, organizations, locations, products, dates, events, concepts) from the following conversation. For each entity, provide: name, type, description, key facts, and relationships to other entities.',
    extractRelationships: true,
  };

  constructor(private readonly llm?: BaseChatModel) {}

  /**
   * Initialize entity tracking for a thread
   */
  initializeThread(threadId: string): void {
    this.entityStates.set(threadId, {
      entities: new Map(),
      lastExtractionTime: Date.now(),
      extractionCount: 0,
    });
    this.logger.debug(`Initialized entity memory for thread ${threadId}`);
  }

  /**
   * Get entity state for a thread
   */
  getEntityState(threadId: string): EntityMemoryState | undefined {
    return this.entityStates.get(threadId);
  }

  /**
   * Extract entities from messages
   */
  @TraceAI({
    name: 'memory.extract_entities',
    operation: 'entity_extraction',
  })
  @MetricMemory({
    memoryType: 'entity',
    operation: 'extract',
    measureDuration: true,
  })
  async extractEntities(threadId: string, messages: BaseMessage[], options: EntityExtractionOptions = {}): Promise<Entity[]> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Initialize if needed
    if (!this.entityStates.has(threadId)) {
      this.initializeThread(threadId);
    }

    const state = this.entityStates.get(threadId)!;

    if (!this.llm) {
      this.logger.warn('No LLM provided for entity extraction, using fallback method');
      return this.fallbackEntityExtraction(state, messages);
    }

    try {
      // Format messages for extraction
      const conversationText = this.formatMessagesForExtraction(messages);

      // Create extraction prompt
      const extractionPrompt = `${mergedOptions.customExtractionPrompt}

Conversation:
${conversationText}

Return the entities in JSON format with the following structure:
{
  "entities": [
    {
      "name": "entity name",
      "type": "person|organization|location|product|date|event|concept",
      "description": "brief description",
      "facts": ["fact1", "fact2"],
      "relationships": [
        {
          "entityName": "related entity",
          "relationshipType": "type of relationship"
        }
      ]
    }
  ]
}`;

      // Call LLM for extraction
      const response = await this.llm.invoke([
        new SystemMessage('You are an expert at extracting and tracking entities from conversations.'),
        new HumanMessage(extractionPrompt),
      ]);

      // Parse extracted entities
      const extractedEntities = this.parseExtractedEntities(response.content.toString());

      // Update entity state
      const updatedEntities = this.updateEntityState(state, extractedEntities, mergedOptions);

      state.extractionCount++;
      state.lastExtractionTime = Date.now();

      this.logger.debug(`Extracted ${extractedEntities.length} entities for thread ${threadId}`);
      return updatedEntities;
    } catch (error) {
      this.logger.error('Failed to extract entities with LLM', error);
      return this.fallbackEntityExtraction(state, messages);
    }
  }

  /**
   * Parse extracted entities from LLM response
   */
  private parseExtractedEntities(response: string): Partial<Entity>[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.entities || [];
    } catch (error) {
      this.logger.error('Failed to parse entity extraction response', error);
      return [];
    }
  }

  /**
   * Update entity state with newly extracted entities
   */
  private updateEntityState(state: EntityMemoryState, extractedEntities: Partial<Entity>[], options: Required<EntityExtractionOptions>): Entity[] {
    const updatedEntities: Entity[] = [];

    for (const extracted of extractedEntities) {
      if (!extracted.name || !extracted.type) {
        continue;
      }

      const entityId = this.generateEntityId(extracted.name, extracted.type);
      const existingEntity = state.entities.get(entityId);

      if (existingEntity) {
        // Update existing entity
        existingEntity.mentionCount++;
        existingEntity.lastUpdated = Date.now();

        // Merge new facts
        if (extracted.facts) {
          const newFacts = extracted.facts.filter((fact) => !existingEntity.facts.includes(fact));
          existingEntity.facts.push(...newFacts);
        }

        // Merge new relationships
        if (extracted.relationships && options.extractRelationships) {
          for (const rel of extracted.relationships) {
            const relExists = existingEntity.relationships.some(
              (r) => r.entityName === rel.entityName && r.relationshipType === rel.relationshipType,
            );
            if (!relExists) {
              existingEntity.relationships.push({
                entityId: this.generateEntityId(rel.entityName, EntityType.CUSTOM),
                entityName: rel.entityName,
                relationshipType: rel.relationshipType,
              });
            }
          }
        }

        // Update relevance score based on mention frequency
        existingEntity.relevanceScore = Math.min(1, existingEntity.mentionCount / 10);

        updatedEntities.push(existingEntity);
      } else {
        // Create new entity
        const newEntity: Entity = {
          id: entityId,
          name: extracted.name,
          type: extracted.type as EntityType,
          description: extracted.description || '',
          facts: extracted.facts || [],
          relationships: options.extractRelationships
            ? (extracted.relationships || []).map((rel) => ({
                entityId: this.generateEntityId(rel.entityName, EntityType.CUSTOM),
                entityName: rel.entityName,
                relationshipType: rel.relationshipType,
              }))
            : [],
          firstMentioned: Date.now(),
          lastUpdated: Date.now(),
          mentionCount: 1,
          relevanceScore: 0.5,
        };

        // Check if we haven't exceeded max entities
        if (state.entities.size < options.maxEntitiesPerThread) {
          state.entities.set(entityId, newEntity);
          updatedEntities.push(newEntity);
        } else {
          // Remove least relevant entity if at capacity
          this.evictLeastRelevantEntity(state);
          state.entities.set(entityId, newEntity);
          updatedEntities.push(newEntity);
        }
      }
    }

    return updatedEntities;
  }

  /**
   * Fallback entity extraction using simple pattern matching
   */
  private fallbackEntityExtraction(state: EntityMemoryState, messages: BaseMessage[]): Entity[] {
    const entities: Entity[] = [];
    const text = this.formatMessagesForExtraction(messages);

    // Simple regex patterns for common entities
    const patterns = {
      person: /(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      url: /https?:\/\/[^\s]+/g,
      date: /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g,
    };

    // Extract using patterns
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const entityName = match[1] || match[0];
        const entityId = this.generateEntityId(entityName, EntityType.CUSTOM);

        if (!state.entities.has(entityId)) {
          const entity: Entity = {
            id: entityId,
            name: entityName,
            type: EntityType.CUSTOM,
            description: `Extracted ${type}`,
            facts: [],
            relationships: [],
            firstMentioned: Date.now(),
            lastUpdated: Date.now(),
            mentionCount: 1,
            relevanceScore: 0.3,
          };

          state.entities.set(entityId, entity);
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  /**
   * Evict the least relevant entity from memory
   */
  private evictLeastRelevantEntity(state: EntityMemoryState): void {
    let leastRelevant: Entity | null = null;
    let lowestScore = Number.POSITIVE_INFINITY;

    for (const entity of state.entities.values()) {
      const recencyScore = (Date.now() - entity.lastUpdated) / (1000 * 60 * 60 * 24); // Days old
      const combinedScore = entity.relevanceScore - recencyScore * 0.01;

      if (combinedScore < lowestScore) {
        lowestScore = combinedScore;
        leastRelevant = entity;
      }
    }

    if (leastRelevant) {
      state.entities.delete(leastRelevant.id);
      this.logger.debug(`Evicted entity ${leastRelevant.name} due to low relevance`);
    }
  }

  /**
   * Generate a unique entity ID
   */
  private generateEntityId(name: string, type: EntityType | string): string {
    return `${type}:${name.toLowerCase().replace(/\s+/g, '_')}`;
  }

  /**
   * Format messages for entity extraction
   */
  private formatMessagesForExtraction(messages: BaseMessage[]): string {
    return messages
      .filter((msg) => !(msg instanceof SystemMessage))
      .map((msg) => {
        const role = msg instanceof HumanMessage ? 'Human' : 'AI';
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n');
  }

  /**
   * Get entities for a thread
   */
  @TraceAI({
    name: 'memory.get_entities',
    operation: 'entity_retrieve',
  })
  getEntities(
    threadId: string,
    filter?: {
      types?: EntityType[];
      minRelevance?: number;
      searchTerm?: string;
    },
  ): Entity[] {
    const state = this.entityStates.get(threadId);
    if (!state) {
      return [];
    }

    let entities = Array.from(state.entities.values());

    // Apply filters
    if (filter) {
      if (filter.types && filter.types.length > 0) {
        entities = entities.filter((e) => filter.types!.includes(e.type));
      }
      if (filter.minRelevance !== undefined) {
        entities = entities.filter((e) => e.relevanceScore >= filter.minRelevance!);
      }
      if (filter.searchTerm) {
        const searchLower = filter.searchTerm.toLowerCase();
        entities = entities.filter(
          (e) =>
            e.name.toLowerCase().includes(searchLower) ||
            e.description.toLowerCase().includes(searchLower) ||
            e.facts.some((f) => f.toLowerCase().includes(searchLower)),
        );
      }
    }

    // Sort by relevance
    return entities.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get context messages with entity information
   */
  @TraceAI({
    name: 'memory.get_entity_context',
    operation: 'entity_context',
  })
  async getContext(threadId: string, relevantEntityNames?: string[]): Promise<BaseMessage[]> {
    const state = this.entityStates.get(threadId);
    if (!state || state.entities.size === 0) {
      return [];
    }

    // Get relevant entities
    let entities = Array.from(state.entities.values());

    if (relevantEntityNames && relevantEntityNames.length > 0) {
      const namesLower = relevantEntityNames.map((n) => n.toLowerCase());
      entities = entities.filter((e) => namesLower.some((name) => e.name.toLowerCase().includes(name)));
    } else {
      // Get top relevant entities
      entities = entities.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);
    }

    if (entities.length === 0) {
      return [];
    }

    // Format entity information
    const entityInfo = entities
      .map((e) => {
        let info = `${e.name} (${e.type}): ${e.description}`;
        if (e.facts.length > 0) {
          info += `\nFacts: ${e.facts.slice(0, 3).join('; ')}`;
        }
        if (e.relationships.length > 0) {
          const rels = e.relationships
            .slice(0, 3)
            .map((r) => `${r.relationshipType} ${r.entityName}`)
            .join(', ');
          info += `\nRelationships: ${rels}`;
        }
        return info;
      })
      .join('\n\n');

    return [
      new SystemMessage(
        `Known entities from the conversation:\n\n${entityInfo}\n\nUse this entity information to provide more contextual and informed responses.`,
      ),
    ];
  }

  /**
   * Update an entity manually
   */
  updateEntity(threadId: string, entityId: string, updates: Partial<Entity>): Entity | null {
    const state = this.entityStates.get(threadId);
    if (!state) {
      return null;
    }

    const entity = state.entities.get(entityId);
    if (!entity) {
      return null;
    }

    // Apply updates
    Object.assign(entity, updates, {
      lastUpdated: Date.now(),
    });

    this.logger.debug(`Updated entity ${entityId} in thread ${threadId}`);
    return entity;
  }

  /**
   * Clear entities for a thread
   */
  clearThread(threadId: string): void {
    this.entityStates.delete(threadId);
    this.logger.debug(`Cleared entity memory for thread ${threadId}`);
  }

  /**
   * Get statistics about entity extraction
   */
  getStatistics(): {
    totalThreads: number;
    totalEntities: number;
    averageEntitiesPerThread: number;
    topEntityTypes: Array<{ type: EntityType; count: number }>;
  } {
    const threads = Array.from(this.entityStates.values());
    const allEntities = threads.flatMap((state) => Array.from(state.entities.values()));

    // Count entity types
    const typeCounts = new Map<EntityType, number>();
    for (const entity of allEntities) {
      typeCounts.set(entity.type, (typeCounts.get(entity.type) || 0) + 1);
    }

    const topEntityTypes = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalThreads: threads.length,
      totalEntities: allEntities.length,
      averageEntitiesPerThread: threads.length > 0 ? allEntities.length / threads.length : 0,
      topEntityTypes,
    };
  }
}
