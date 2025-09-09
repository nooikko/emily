import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityMemory, EntityType } from '../entity.memory';

describe('EntityMemory', () => {
  let entityMemory: EntityMemory;
  let mockLLM: jest.Mocked<BaseChatModel>;

  beforeEach(async () => {
    // Create a mock LLM
    mockLLM = {
      invoke: jest.fn(),
    } as jest.Mocked<Pick<BaseChatModel, 'invoke'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EntityMemory,
          useFactory: () => new EntityMemory(mockLLM),
        },
      ],
    }).compile();

    entityMemory = module.get<EntityMemory>(EntityMemory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeThread', () => {
    it('should initialize a new thread with empty entity state', () => {
      const threadId = 'test-thread-1';

      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId);

      expect(state).toBeDefined();
      expect(state?.entities.size).toBe(0);
      expect(state?.extractionCount).toBe(0);
      expect(state?.lastExtractionTime).toBeGreaterThan(0);
    });
  });

  describe('extractEntities', () => {
    it('should extract entities from messages using LLM', async () => {
      const threadId = 'test-thread-2';
      const messages = [
        new HumanMessage('I am John Smith from Microsoft in Seattle.'),
        new AIMessage('Nice to meet you, John! Microsoft is a great company.'),
      ];

      const mockResponse = {
        entities: [
          {
            name: 'John Smith',
            type: 'person',
            description: 'User introducing themselves',
            facts: ['Works at Microsoft', 'Located in Seattle'],
            relationships: [
              { entityName: 'Microsoft', relationshipType: 'works at' },
              { entityName: 'Seattle', relationshipType: 'located in' },
            ],
          },
          {
            name: 'Microsoft',
            type: 'organization',
            description: 'Technology company',
            facts: ['Employer of John Smith'],
            relationships: [{ entityName: 'John Smith', relationshipType: 'employs' }],
          },
          {
            name: 'Seattle',
            type: 'location',
            description: 'City in Washington',
            facts: ['Location of John Smith'],
            relationships: [],
          },
        ],
      };

      mockLLM.invoke.mockResolvedValue({
        content: JSON.stringify(mockResponse),
      } as Awaited<ReturnType<BaseChatModel['invoke']>>);

      const entities = await entityMemory.extractEntities(threadId, messages);

      expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
      expect(entities).toHaveLength(3);
      expect(entities[0].name).toBe('John Smith');
      expect(entities[0].type).toBe(EntityType.PERSON);
      expect(entities[1].name).toBe('Microsoft');
      expect(entities[1].type).toBe(EntityType.ORGANIZATION);
      expect(entities[2].name).toBe('Seattle');
      expect(entities[2].type).toBe(EntityType.LOCATION);
    });

    it('should update existing entities when mentioned again', async () => {
      const threadId = 'test-thread-3';

      // First extraction
      const firstMessages = [new HumanMessage('John Smith works at Microsoft.')];
      const firstResponse = {
        entities: [
          {
            name: 'John Smith',
            type: 'person',
            description: 'Employee',
            facts: ['Works at Microsoft'],
            relationships: [],
          },
        ],
      };

      mockLLM.invoke.mockResolvedValue({
        content: JSON.stringify(firstResponse),
      } as Awaited<ReturnType<BaseChatModel['invoke']>>);

      await entityMemory.extractEntities(threadId, firstMessages);

      // Second extraction with same entity
      const secondMessages = [new HumanMessage('John Smith is a software engineer.')];
      const secondResponse = {
        entities: [
          {
            name: 'John Smith',
            type: 'person',
            description: 'Software engineer',
            facts: ['Is a software engineer'],
            relationships: [],
          },
        ],
      };

      mockLLM.invoke.mockResolvedValue({
        content: JSON.stringify(secondResponse),
      } as Awaited<ReturnType<BaseChatModel['invoke']>>);

      await entityMemory.extractEntities(threadId, secondMessages);

      const entities = entityMemory.getEntities(threadId);
      const johnEntity = entities.find((e: Entity) => e.name === 'John Smith');

      expect(johnEntity).toBeDefined();
      expect(johnEntity?.mentionCount).toBe(2);
      expect(johnEntity?.facts).toContain('Works at Microsoft');
      expect(johnEntity?.facts).toContain('Is a software engineer');
      // Relevance score is calculated as mentionCount / 10, so 2 mentions = 0.2
      expect(johnEntity?.relevanceScore).toBe(0.2);
    });

    it('should filter entities by type', async () => {
      const threadId = 'test-thread-4';

      // Set up state with various entity types
      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      state.entities.set('person:john', {
        id: 'person:john',
        name: 'John',
        type: EntityType.PERSON,
        description: 'A person',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      state.entities.set('org:microsoft', {
        id: 'org:microsoft',
        name: 'Microsoft',
        type: EntityType.ORGANIZATION,
        description: 'A company',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      const personEntities = entityMemory.getEntities(threadId, {
        types: [EntityType.PERSON],
      });

      expect(personEntities).toBeDefined();
      expect(personEntities.length).toBe(1);
      expect(personEntities[0].type).toBe(EntityType.PERSON);
    });

    it('should filter entities by relevance score', async () => {
      const threadId = 'test-thread-5';

      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      // Add entities with different relevance scores
      state.entities.set('entity1', {
        id: 'entity1',
        name: 'High Relevance',
        type: EntityType.CONCEPT,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 10,
        relevanceScore: 0.9,
      });

      state.entities.set('entity2', {
        id: 'entity2',
        name: 'Low Relevance',
        type: EntityType.CONCEPT,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.3,
      });

      const relevantEntities = entityMemory.getEntities(threadId, {
        minRelevance: 0.5,
      });

      expect(relevantEntities).toBeDefined();
      expect(relevantEntities.length).toBe(1);
      expect(relevantEntities[0].name).toBe('High Relevance');
    });

    it('should search entities by term', async () => {
      const threadId = 'test-thread-6';

      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      state.entities.set('entity1', {
        id: 'entity1',
        name: 'John Smith',
        type: EntityType.PERSON,
        description: 'Software engineer at Microsoft',
        facts: ['Expert in TypeScript'],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      state.entities.set('entity2', {
        id: 'entity2',
        name: 'Jane Doe',
        type: EntityType.PERSON,
        description: 'Product manager',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      // Search by name
      const johnResults = entityMemory.getEntities(threadId, {
        searchTerm: 'John',
      });
      expect(johnResults).toBeDefined();
      expect(johnResults.length).toBe(1);
      expect(johnResults[0].name).toBe('John Smith');

      // Search by description
      const microsoftResults = entityMemory.getEntities(threadId, {
        searchTerm: 'Microsoft',
      });
      expect(microsoftResults).toBeDefined();
      expect(microsoftResults.length).toBe(1);
      expect(microsoftResults[0].name).toBe('John Smith');

      // Search by fact
      const typescriptResults = entityMemory.getEntities(threadId, {
        searchTerm: 'TypeScript',
      });
      expect(typescriptResults).toBeDefined();
      expect(typescriptResults.length).toBe(1);
      expect(typescriptResults[0].name).toBe('John Smith');
    });
  });

  describe('fallback entity extraction', () => {
    it('should use fallback extraction when LLM is not available', async () => {
      const memoryWithoutLLM = new EntityMemory();
      const threadId = 'test-thread-7';

      const messages = [new HumanMessage('Contact Dr. Smith at john.smith@example.com or visit https://example.com')];

      const entities = await memoryWithoutLLM.extractEntities(threadId, messages);

      expect(entities.length).toBeGreaterThan(0);

      // Should extract email
      const emailEntity = entities.find((e) => e.name.includes('@'));
      expect(emailEntity).toBeDefined();

      // Should extract URL
      const urlEntity = entities.find((e) => e.name.includes('https://'));
      expect(urlEntity).toBeDefined();
    });

    it('should use fallback when LLM throws error', async () => {
      const threadId = 'test-thread-8';
      mockLLM.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      const messages = [new HumanMessage('Meeting on 12/25/2024 with Dr. Johnson')];

      const entities = await entityMemory.extractEntities(threadId, messages);

      // Should still extract some entities using fallback
      expect(entities.length).toBeGreaterThan(0);
    });

    it('should handle malformed LLM response gracefully', async () => {
      const threadId = 'test-thread-9';
      mockLLM.invoke.mockResolvedValue({
        content: 'This is not valid JSON',
      } as Awaited<ReturnType<BaseChatModel['invoke']>>);

      const messages = [new HumanMessage('John works at Microsoft')];

      const entities = await entityMemory.extractEntities(threadId, messages);

      // Should fall back to pattern matching
      expect(entities).toEqual([]);
    });
  });

  describe('entity eviction', () => {
    it('should evict least relevant entity when at max capacity', async () => {
      const threadId = 'test-thread-10';
      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      // Fill up to max capacity (set to 3 for testing)
      const oldEntity = {
        id: 'old',
        name: 'Old Entity',
        type: EntityType.CONCEPT,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now() - 1000000,
        lastUpdated: Date.now() - 1000000,
        mentionCount: 1,
        relevanceScore: 0.1,
      };

      state.entities.set('old', oldEntity);
      state.entities.set('medium', {
        ...oldEntity,
        id: 'medium',
        name: 'Medium Entity',
        relevanceScore: 0.5,
      });
      state.entities.set('recent', {
        ...oldEntity,
        id: 'recent',
        name: 'Recent Entity',
        lastUpdated: Date.now(),
        relevanceScore: 0.9,
      });

      // Try to add new entity when at capacity
      const mockResponse = {
        entities: [
          {
            name: 'New Entity',
            type: 'concept',
            description: 'Brand new',
            facts: [],
            relationships: [],
          },
        ],
      };

      mockLLM.invoke.mockResolvedValue({
        content: JSON.stringify(mockResponse),
      } as AIMessage);

      await entityMemory.extractEntities(threadId, [new HumanMessage('New Entity is important')], { maxEntitiesPerThread: 3 });

      const entities = entityMemory.getEntities(threadId);

      // Old entity should be evicted
      expect(entities.find((e: Entity) => e.name === 'Old Entity')).toBeUndefined();
      // New entity should be added
      expect(entities.find((e: Entity) => e.name === 'New Entity')).toBeDefined();
      // Should still have 3 entities
      expect(Array.isArray(entities)).toBe(true);
      expect(entities.length).toBe(3);
    });
  });

  describe('getContext', () => {
    it('should return empty array for thread with no entities', async () => {
      const context = await entityMemory.getContext('non-existent-thread');
      expect(context).toEqual([]);
    });

    it('should return context with top relevant entities', async () => {
      const threadId = 'test-thread-11';
      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      // Add multiple entities with varying relevance
      for (let i = 0; i < 15; i++) {
        state.entities.set(`entity${i}`, {
          id: `entity${i}`,
          name: `Entity ${i}`,
          type: EntityType.CONCEPT,
          description: `Description ${i}`,
          facts: [`Fact about ${i}`],
          relationships: [],
          firstMentioned: Date.now(),
          lastUpdated: Date.now(),
          mentionCount: i,
          relevanceScore: i / 15,
        });
      }

      const context = await entityMemory.getContext(threadId);

      expect(context).toHaveLength(1);
      expect(context[0]).toBeInstanceOf(SystemMessage);

      const content = context[0].content as string;
      expect(content).toContain('Known entities from the conversation');
      // Should include top 10 most relevant entities
      expect(content).toContain('Entity 14');
      expect(content).toContain('Entity 13');
      // Should not include least relevant
      expect(content).not.toContain('Entity 0');
    });

    it('should filter context by relevant entity names', async () => {
      const threadId = 'test-thread-12';
      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      state.entities.set('john', {
        id: 'john',
        name: 'John Smith',
        type: EntityType.PERSON,
        description: 'Software engineer',
        facts: ['Works at Microsoft'],
        relationships: [{ entityId: 'microsoft', entityName: 'Microsoft', relationshipType: 'works at' }],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 5,
        relevanceScore: 0.8,
      });

      state.entities.set('jane', {
        id: 'jane',
        name: 'Jane Doe',
        type: EntityType.PERSON,
        description: 'Product manager',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 2,
        relevanceScore: 0.4,
      });

      const context = await entityMemory.getContext(threadId, ['John']);

      expect(context).toHaveLength(1);
      const content = context[0].content as string;
      expect(content).toContain('John Smith');
      expect(content).toContain('Works at Microsoft');
      expect(content).not.toContain('Jane Doe');
    });
  });

  describe('updateEntity', () => {
    it('should update existing entity', () => {
      const threadId = 'test-thread-13';
      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;

      const originalEntity = {
        id: 'test-entity',
        name: 'Test Entity',
        type: EntityType.CONCEPT,
        description: 'Original description',
        facts: ['Original fact'],
        relationships: [],
        firstMentioned: Date.now() - 1000,
        lastUpdated: Date.now() - 1000,
        mentionCount: 1,
        relevanceScore: 0.5,
      };

      state.entities.set('test-entity', originalEntity);

      const updated = entityMemory.updateEntity(threadId, 'test-entity', {
        description: 'Updated description',
        facts: ['Original fact', 'New fact'],
        relevanceScore: 0.8,
      });

      expect(updated).toBeDefined();
      expect(updated?.description).toBe('Updated description');
      expect(updated?.facts).toHaveLength(2);
      expect(updated?.relevanceScore).toBe(0.8);
      expect(updated?.lastUpdated).toBeGreaterThanOrEqual(originalEntity.lastUpdated);
    });

    it('should return null for non-existent entity', () => {
      const result = entityMemory.updateEntity('thread', 'non-existent', {
        description: 'New description',
      });

      expect(result).toBeNull();
    });
  });

  describe('clearThread', () => {
    it('should remove all entities for a thread', async () => {
      const threadId = 'test-thread-14';

      entityMemory.initializeThread(threadId);
      const state = entityMemory.getEntityState(threadId)!;
      state.entities.set('entity1', {
        id: 'entity1',
        name: 'Test Entity',
        type: EntityType.CONCEPT,
        description: 'Test description',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      } as Entity);

      expect(entityMemory.getEntityState(threadId)).toBeDefined();

      entityMemory.clearThread(threadId);

      expect(entityMemory.getEntityState(threadId)).toBeUndefined();
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      // Set up multiple threads with entities
      const thread1 = 'thread-1';
      const thread2 = 'thread-2';

      entityMemory.initializeThread(thread1);
      entityMemory.initializeThread(thread2);

      const state1 = entityMemory.getEntityState(thread1)!;
      state1.entities.set('person1', {
        id: 'person1',
        name: 'Person 1',
        type: EntityType.PERSON,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });
      state1.entities.set('org1', {
        id: 'org1',
        name: 'Org 1',
        type: EntityType.ORGANIZATION,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      const state2 = entityMemory.getEntityState(thread2)!;
      state2.entities.set('person2', {
        id: 'person2',
        name: 'Person 2',
        type: EntityType.PERSON,
        description: '',
        facts: [],
        relationships: [],
        firstMentioned: Date.now(),
        lastUpdated: Date.now(),
        mentionCount: 1,
        relevanceScore: 0.5,
      });

      const stats = entityMemory.getStatistics();

      expect(stats.totalThreads).toBe(2);
      expect(stats.totalEntities).toBe(3);
      expect(stats.averageEntitiesPerThread).toBe(1.5);
      expect(stats.topEntityTypes).toContainEqual({ type: EntityType.PERSON, count: 2 });
      expect(stats.topEntityTypes).toContainEqual({ type: EntityType.ORGANIZATION, count: 1 });
    });

    it('should handle empty state gracefully', () => {
      const stats = entityMemory.getStatistics();

      expect(stats.totalThreads).toBe(0);
      expect(stats.totalEntities).toBe(0);
      expect(stats.averageEntitiesPerThread).toBe(0);
      expect(stats.topEntityTypes).toEqual([]);
    });
  });
});
