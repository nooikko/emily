import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationSummaryMemory } from '../../../agent/memory/conversation-summary.memory';
import { ConversationThread, ThreadBranchType, ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { MessageContentType, MessageSender, ThreadMessage } from '../../entities/thread-message.entity';
import { ConversationStateService } from '../conversation-state.service';
import { SummarizationStrategy, ThreadSummaryMetadata, ThreadSummaryService } from '../thread-summary.service';

describe('ThreadSummaryService', () => {
  let service: ThreadSummaryService;
  let threadRepository: Repository<ConversationThread>;
  let messageRepository: Repository<ThreadMessage>;
  let conversationSummaryMemory: ConversationSummaryMemory;
  let conversationStateService: ConversationStateService;
  let mockLLM: BaseChatModel | undefined;

  const mockThread: ConversationThread = {
    id: 'test-thread-1',
    title: 'Test Thread',
    summary: null,
    status: ThreadStatus.ACTIVE,
    priority: ThreadPriority.NORMAL,
    tags: [],
    messageCount: 0,
    unreadCount: 0,
    branchType: ThreadBranchType.ROOT,
    isMainBranch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    updateLastActivity: jest.fn(),
    incrementMessageCount: jest.fn(),
    decrementMessageCount: jest.fn(),
    archive: jest.fn(),
    delete: jest.fn(),
    restore: jest.fn(),
    isActive: jest.fn().mockReturnValue(true),
    isArchived: jest.fn().mockReturnValue(false),
    isDeleted: jest.fn().mockReturnValue(false),
    generateTitle: jest.fn(),
    createBranch: jest.fn(),
    markAsMerged: jest.fn(),
    isBranch: jest.fn().mockReturnValue(false),
    isRoot: jest.fn().mockReturnValue(true),
    isMerged: jest.fn().mockReturnValue(false),
    getBranchDepth: jest.fn().mockResolvedValue(0),
    toSafeObject: jest.fn(),
  } as any;

  const mockMessages: ThreadMessage[] = [
    {
      id: 'msg-1',
      threadId: 'test-thread-1',
      sender: MessageSender.HUMAN,
      contentType: MessageContentType.TEXT,
      content: 'What is TypeScript?',
      role: 'user',
      sequenceNumber: 1,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ThreadMessage,
    {
      id: 'msg-2',
      threadId: 'test-thread-1',
      sender: MessageSender.ASSISTANT,
      contentType: MessageContentType.TEXT,
      content: 'TypeScript is a statically typed superset of JavaScript that compiles to plain JavaScript.',
      role: 'assistant',
      sequenceNumber: 2,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ThreadMessage,
  ];

  beforeEach(async () => {
    // Mock LLM
    mockLLM = {
      invoke: jest.fn().mockResolvedValue({
        content: 'This is a summarized conversation about TypeScript.',
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ThreadSummaryService,
          useFactory: (
            threadRepo: Repository<ConversationThread>,
            messageRepo: Repository<ThreadMessage>,
            summaryMemory: ConversationSummaryMemory,
            stateService: ConversationStateService,
          ) => new ThreadSummaryService(threadRepo, messageRepo, summaryMemory, stateService, mockLLM),
          inject: [getRepositoryToken(ConversationThread), getRepositoryToken(ThreadMessage), ConversationSummaryMemory, ConversationStateService],
        },
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(ThreadMessage),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: ConversationSummaryMemory,
          useValue: {
            initializeThread: jest.fn(),
            getSummaryState: jest.fn(),
            addMessages: jest.fn(),
            forceSummarize: jest.fn(),
            getContext: jest.fn(),
            getStatistics: jest.fn().mockReturnValue({
              totalThreads: 1,
              totalMessagesSummarized: 10,
              averageMessagesPerThread: 10,
            }),
          },
        },
        {
          provide: ConversationStateService,
          useValue: {
            getThreadMessages: jest.fn(),
            getThreadBranches: jest.fn(),
            getThreadHierarchy: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ThreadSummaryService>(ThreadSummaryService);
    threadRepository = module.get<Repository<ConversationThread>>(getRepositoryToken(ConversationThread));
    messageRepository = module.get<Repository<ThreadMessage>>(getRepositoryToken(ThreadMessage));
    conversationSummaryMemory = module.get<ConversationSummaryMemory>(ConversationSummaryMemory);
    conversationStateService = module.get<ConversationStateService>(ConversationStateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('determineSummarizationStrategy', () => {
    it('should return TECHNICAL strategy for technical conversations', async () => {
      const thread = {
        ...mockThread,
        tags: ['code', 'programming'],
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.TECHNICAL);
      expect(threadRepository.findOne).toHaveBeenCalledWith({ where: { id: 'test-thread-1' } });
    });

    it('should return SUPPORT strategy for support conversations', async () => {
      const thread = {
        ...mockThread,
        tags: ['help', 'issue'],
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.SUPPORT);
    });

    it('should return CREATIVE strategy for creative conversations', async () => {
      const thread = {
        ...mockThread,
        tags: ['brainstorm', 'idea'],
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.CREATIVE);
    });

    it('should return EDUCATIONAL strategy for educational conversations', async () => {
      const thread = {
        ...mockThread,
        metadata: { conversationType: 'educational' },
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.EDUCATIONAL);
    });

    it('should analyze message content when no metadata hints are available', async () => {
      const thread = { ...mockThread };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const technicalMessages = [
        {
          ...mockMessages[0],
          content: 'function test() { return "hello"; }',
        },
      ];
      (messageRepository.find as jest.Mock).mockResolvedValue(technicalMessages);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.TECHNICAL);
      expect(messageRepository.find).toHaveBeenCalled();
    });

    it('should return DETAILED strategy for long conversations', async () => {
      const thread = {
        ...mockThread,
        messageCount: 35,
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (messageRepository.find as jest.Mock).mockResolvedValue([]);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.DETAILED);
    });

    it('should return BASIC strategy as default', async () => {
      const thread = { ...mockThread };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (messageRepository.find as jest.Mock).mockResolvedValue([]);

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.BASIC);
    });

    it('should handle errors gracefully and return BASIC', async () => {
      (threadRepository.findOne as jest.Mock).mockRejectedValue(new Error('Database error'));

      const strategy = await service.determineSummarizationStrategy('test-thread-1');

      expect(strategy).toBe(SummarizationStrategy.BASIC);
    });
  });

  describe('summarizeThread', () => {
    const mockBaseMessages = [new HumanMessage('What is TypeScript?'), new AIMessage('TypeScript is a statically typed superset of JavaScript.')];

    beforeEach(() => {
      // Mock the private getThreadMessages method that is accessed via bracket notation
      (conversationStateService as any)['getThreadMessages'] = jest.fn().mockResolvedValue(mockBaseMessages);
    });

    it('should successfully summarize a thread', async () => {
      const thread = {
        ...mockThread,
        messageCount: 25,
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (threadRepository.save as jest.Mock).mockResolvedValue(thread);
      (conversationSummaryMemory.forceSummarize as jest.Mock).mockResolvedValue('Summary: Discussion about TypeScript basics.');

      const summary = await service.summarizeThread('test-thread-1');

      expect(summary).toBe('Summary: Discussion about TypeScript basics.');
      expect(conversationSummaryMemory.initializeThread).toHaveBeenCalledWith('test-thread-1');
      expect(conversationSummaryMemory.addMessages).toHaveBeenCalled();
      expect(conversationSummaryMemory.forceSummarize).toHaveBeenCalled();
      expect(threadRepository.save).toHaveBeenCalled();
    });

    it('should use provided strategy instead of determining one', async () => {
      const thread = { 
        ...mockThread, 
        messageCount: 25,  // Ensure it needs summarization
        summary: null      // No existing summary
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (threadRepository.save as jest.Mock).mockResolvedValue(thread);
      (conversationSummaryMemory.forceSummarize as jest.Mock).mockResolvedValue('Technical summary');

      await service.summarizeThread('test-thread-1', SummarizationStrategy.TECHNICAL);

      expect(conversationSummaryMemory.forceSummarize).toHaveBeenCalledWith(
        'test-thread-1',
        expect.objectContaining({
          maxMessagesBeforeSummary: 10,
          maxSummaryTokens: 600,
          includeSystemMessages: true,
        }),
      );
    });

    it('should not summarize if not enough new messages and not forced', async () => {
      const thread = {
        ...mockThread,
        messageCount: 5,
        summary: 'Existing summary',
        metadata: {
          summaryMessageCount: 3,
          summaryVersion: 1,
        },
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const summary = await service.summarizeThread('test-thread-1');

      expect(summary).toBe('Existing summary');
      expect(conversationSummaryMemory.forceSummarize).not.toHaveBeenCalled();
    });

    it('should force summarization when forceUpdate is true', async () => {
      const thread = {
        ...mockThread,
        messageCount: 5,
        summary: 'Old summary',
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (threadRepository.save as jest.Mock).mockResolvedValue(thread);
      (conversationSummaryMemory.forceSummarize as jest.Mock).mockResolvedValue('New forced summary');

      const summary = await service.summarizeThread('test-thread-1', undefined, true);

      expect(summary).toBe('New forced summary');
      expect(conversationSummaryMemory.forceSummarize).toHaveBeenCalled();
    });

    it('should prevent concurrent summarizations of the same thread', async () => {
      const thread = { 
        ...mockThread, 
        messageCount: 25,
        summary: null
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (threadRepository.save as jest.Mock).mockResolvedValue(thread);
      
      let resolveFirst: (value: string) => void;
      let firstCallStarted = false;
      
      (conversationSummaryMemory.forceSummarize as jest.Mock)
        .mockImplementation(() => {
          firstCallStarted = true;
          return new Promise((resolve) => { resolveFirst = resolve; });
        });

      // Start first summarization
      const promise1 = service.summarizeThread('test-thread-1');
      
      // Wait for first call to start
      while (!firstCallStarted) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      // Start second summarization (should be blocked)
      const promise2 = service.summarizeThread('test-thread-1');
      
      // Allow some time for the second call to be blocked
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Resolve the first promise
      resolveFirst!('Summary');
      
      const [result1, result2] = await Promise.all([promise1, promise2]);

      // First should complete, second should return empty
      expect(result1).toBe('Summary');
      expect(result2).toBe('');
    });

    it('should extract metadata from summary', async () => {
      const thread = { 
        ...mockThread, 
        metadata: {},
        messageCount: 25, // Ensure it needs summarization
        summary: null
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      let savedThread: any;
      (threadRepository.save as jest.Mock).mockImplementation((t) => {
        savedThread = t;
        return Promise.resolve(t);
      });

      (conversationSummaryMemory.forceSummarize as jest.Mock).mockResolvedValue(
        'Decision: We decided to use TypeScript. Question: How to configure TypeScript? Topic: TypeScript Configuration',
      );

      await service.summarizeThread('test-thread-1');

      expect(savedThread).toBeDefined();
      expect(savedThread.metadata).toMatchObject({
        summaryVersion: 1,
        summaryStrategy: expect.any(String),
      });
      // The regex extracts capitalized words, so check for actual extracted values
      expect(savedThread.metadata.summaryKeyTopics).toContain('Decision');
      expect(savedThread.metadata.summaryKeyTopics).toContain('Question');
      expect(savedThread.metadata.summaryKeyDecisions).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      (threadRepository.findOne as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.summarizeThread('test-thread-1')).rejects.toThrow('Database error');
    });
  });

  describe('retrieveThreadContextWithSummary', () => {
    it('should retrieve thread context with summary', async () => {
      const thread = {
        ...mockThread,
        summary: 'Thread summary',
        metadata: {
          summaryLastUpdated: new Date().toISOString(),
          summaryMessageCount: 10,
          summaryStrategy: SummarizationStrategy.DETAILED,
          summaryVersion: 1,
          summaryKeyTopics: 'TypeScript,JavaScript',
          summaryKeyDecisions: 'Use TypeScript',
          summaryUnresolvedQuestions: 'How to configure?',
        },
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);
      (conversationSummaryMemory.getSummaryState as jest.Mock).mockReturnValue({
        summary: 'Memory summary',
        pendingMessages: [new HumanMessage('Recent message')],
      });
      (conversationSummaryMemory.getContext as jest.Mock).mockResolvedValue([
        new SystemMessage('Previous summary'),
        new HumanMessage('Recent message'),
      ]);

      const result = await service.retrieveThreadContextWithSummary('test-thread-1');

      expect(result).toMatchObject({
        summary: 'Thread summary',
        recentMessages: [expect.any(HumanMessage)],
        metadata: expect.objectContaining({
          keyTopics: ['TypeScript', 'JavaScript'],
        }),
      });
    });

    it('should include recent messages when maxHistoryMessages is specified', async () => {
      const thread = { ...mockThread };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const messages = [new HumanMessage('Message 1'), new HumanMessage('Message 2'), new HumanMessage('Message 3')];
      (conversationStateService as any)['getThreadMessages'] = jest.fn().mockResolvedValue(messages);

      const result = await service.retrieveThreadContextWithSummary('test-thread-1', {
        maxHistoryMessages: 2,
      });

      expect(result.recentMessages).toHaveLength(2);
      expect(result.recentMessages[0].content).toBe('Message 2');
      expect(result.recentMessages[1].content).toBe('Message 3');
    });

    it('should filter by topic when specified', async () => {
      const thread = {
        ...mockThread,
        summary: 'Thread summary',
        metadata: {
          summaryKeyTopics: 'JavaScript,React',
        },
      };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const result = await service.retrieveThreadContextWithSummary('test-thread-1', {
        filterByTopic: ['TypeScript'],
      });

      expect(result.summary).toBeNull();
      expect(result.recentMessages).toHaveLength(0);
    });

    it('should include branch summaries when requested', async () => {
      const thread = { ...mockThread };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(thread);

      const branches = [
        { id: 'branch-1', summary: 'Branch 1 summary' },
        { id: 'branch-2', summary: null },
      ];
      (conversationStateService.getThreadBranches as jest.Mock).mockResolvedValue(branches);

      // Mock summarizeThread for branch without summary
      jest.spyOn(service, 'summarizeThread').mockResolvedValue('Generated branch 2 summary');

      const result = await service.retrieveThreadContextWithSummary('test-thread-1', {
        includeBranchSummaries: true,
      });

      expect(result.branchSummaries).toHaveLength(2);
      expect(result.branchSummaries![0]).toEqual({
        threadId: 'branch-1',
        summary: 'Branch 1 summary',
      });
      expect(result.branchSummaries![1]).toEqual({
        threadId: 'branch-2',
        summary: 'Generated branch 2 summary',
      });
    });

    it('should handle errors gracefully', async () => {
      (threadRepository.findOne as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.retrieveThreadContextWithSummary('test-thread-1')).rejects.toThrow('Database error');
    });
  });

  describe('aggregateThreadSummaries', () => {
    it('should aggregate summaries from multiple threads with LLM', async () => {
      const threads = [
        { ...mockThread, id: 'thread-1', title: 'Thread 1', summary: 'Summary 1' },
        { ...mockThread, id: 'thread-2', title: 'Thread 2', summary: 'Summary 2' },
      ];
      (threadRepository.findOne as jest.Mock).mockResolvedValueOnce(threads[0]).mockResolvedValueOnce(threads[1]);

      if (mockLLM) {
        (mockLLM.invoke as jest.Mock).mockResolvedValue({
          content: 'Aggregated summary of both threads',
        });
      }

      const result = await service.aggregateThreadSummaries(['thread-1', 'thread-2']);

      expect(result).toBe('Aggregated summary of both threads');
      expect(mockLLM?.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'system' }), expect.objectContaining({ role: 'user' })]),
      );
    });

    it('should fallback to concatenation when no LLM is available', async () => {
      // Remove LLM
      (service as any).llm = undefined;

      const threads = [
        { ...mockThread, id: 'thread-1', title: 'Thread 1', summary: 'Summary 1' },
        { ...mockThread, id: 'thread-2', title: 'Thread 2', summary: 'Summary 2' },
      ];
      (threadRepository.findOne as jest.Mock).mockResolvedValueOnce(threads[0]).mockResolvedValueOnce(threads[1]);

      const result = await service.aggregateThreadSummaries(['thread-1', 'thread-2']);

      expect(result).toContain('Thread "Thread 1":\nSummary 1');
      expect(result).toContain('Thread "Thread 2":\nSummary 2');
      expect(result).toContain('---');
    });

    it('should handle threads without summaries', async () => {
      const threadWithoutSummary = { ...mockThread, id: 'thread-1', title: 'Thread 1', summary: null };
      const threadWithSummary = { ...mockThread, id: 'thread-2', title: 'Thread 2', summary: 'Summary 2' };
      
      (threadRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(threadWithoutSummary)
        .mockResolvedValueOnce(threadWithSummary);

      // Remove LLM to trigger fallback behavior
      (service as any).llm = undefined;

      const result = await service.aggregateThreadSummaries(['thread-1', 'thread-2']);

      expect(result).not.toContain('Thread "Thread 1":\nnull');
      expect(result).toContain('Summary 2');
    });

    it('should return message when no summaries are available', async () => {
      (threadRepository.findOne as jest.Mock).mockResolvedValue({ ...mockThread, summary: null });

      const result = await service.aggregateThreadSummaries(['thread-1']);

      expect(result).toBe('No summaries available for aggregation.');
    });
  });

  describe('updateMergedThreadSummary', () => {
    it('should update merged thread with aggregated summary', async () => {
      const targetThread = { ...mockThread, id: 'target', messageCount: 50 };
      (threadRepository.findOne as jest.Mock).mockResolvedValue(targetThread);

      jest.spyOn(service, 'aggregateThreadSummaries').mockResolvedValue('Aggregated summary');

      let savedThread: any;
      (threadRepository.save as jest.Mock).mockImplementation((t) => {
        savedThread = t;
        return Promise.resolve(t);
      });

      const result = await service.updateMergedThreadSummary('target', ['source1', 'source2']);

      expect(result).toBe('Aggregated summary');
      expect(service.aggregateThreadSummaries).toHaveBeenCalledWith(['target', 'source1', 'source2']);
      expect(savedThread.summary).toBe('Aggregated summary');
      expect(savedThread.metadata.summaryStrategy).toBe(SummarizationStrategy.DETAILED);
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(service, 'aggregateThreadSummaries').mockRejectedValue(new Error('Aggregation failed'));

      await expect(service.updateMergedThreadSummary('target', ['source1'])).rejects.toThrow('Aggregation failed');
    });
  });

  describe('periodicSummarization', () => {
    it('should summarize active threads that need it', async () => {
      const threads = [
        { ...mockThread, id: 'thread-1', messageCount: 25 },
        { ...mockThread, id: 'thread-2', messageCount: 5 },
        { ...mockThread, id: 'thread-3', messageCount: 30, summary: 'Existing', metadata: { summaryMessageCount: 28 } },
      ];
      (threadRepository.find as jest.Mock).mockResolvedValue(threads);

      jest.spyOn(service, 'summarizeThread').mockResolvedValue('New summary');

      await service.periodicSummarization();

      expect(service.summarizeThread).toHaveBeenCalledTimes(1);
      expect(service.summarizeThread).toHaveBeenCalledWith('thread-1');
    });

    it('should handle errors for individual threads gracefully', async () => {
      const threads = [
        { ...mockThread, id: 'thread-1', messageCount: 25 },
        { ...mockThread, id: 'thread-2', messageCount: 30 },
      ];
      (threadRepository.find as jest.Mock).mockResolvedValue(threads);

      jest.spyOn(service, 'summarizeThread').mockRejectedValueOnce(new Error('Thread 1 error')).mockResolvedValueOnce('Thread 2 summary');

      await service.periodicSummarization();

      expect(service.summarizeThread).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors gracefully', async () => {
      (threadRepository.find as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.periodicSummarization()).resolves.not.toThrow();
    });
  });

  describe('getSummarizationStatistics', () => {
    it('should return correct statistics', async () => {
      const threads = [
        {
          ...mockThread,
          summary: 'Summary 1 with some content',
          metadata: {
            summaryStrategy: SummarizationStrategy.TECHNICAL,
            summaryLastUpdated: '2024-01-01T00:00:00.000Z',
          },
        },
        {
          ...mockThread,
          summary: 'Summary 2',
          metadata: {
            summaryStrategy: SummarizationStrategy.BASIC,
            summaryLastUpdated: '2024-01-02T00:00:00.000Z',
          },
        },
      ];

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(threads),
      };
      (threadRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const stats = await service.getSummarizationStatistics();

      expect(stats).toMatchObject({
        totalThreadsWithSummaries: 2,
        averageSummaryLength: expect.any(Number),
        strategiesUsed: {
          [SummarizationStrategy.TECHNICAL]: 1,
          [SummarizationStrategy.BASIC]: 1,
        },
        lastSummarizationTime: new Date('2024-01-02'),
      });
    });

    it('should handle empty results', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (threadRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const stats = await service.getSummarizationStatistics();

      expect(stats).toMatchObject({
        totalThreadsWithSummaries: 0,
        averageSummaryLength: 0,
        strategiesUsed: {},
        lastSummarizationTime: null,
      });
    });

    it('should handle errors gracefully', async () => {
      (threadRepository.createQueryBuilder as jest.Mock).mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.getSummarizationStatistics()).rejects.toThrow('Database error');
    });
  });
});
