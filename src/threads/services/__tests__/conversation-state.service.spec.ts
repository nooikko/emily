import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread, ThreadBranchType, ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { MessageContentType, MessageSender, ThreadMessage } from '../../entities/thread-message.entity';
import {
  ConversationContext,
  ConversationState,
  ConversationStateError,
  ConversationStateService,
  ConversationStateType,
} from '../conversation-state.service';
import { ThreadsService } from '../threads.service';

// Mock LangGraph StateGraph - create factory to return new instances
const createMockStateGraph = () => ({
  addNode: jest.fn().mockReturnThis(),
  addEdge: jest.fn().mockReturnThis(),
  addConditionalEdges: jest.fn().mockReturnThis(),
  nodes: new Map(), // Add nodes property for tests
  compile: jest.fn().mockReturnValue({
    invoke: jest.fn().mockImplementation(async (initialState: ConversationStateType) => {
      return {
        ...initialState,
        conversationPhase: 'completion' as const,
        error: null,
      };
    }),
  }),
});

let mockStateGraph = createMockStateGraph();

jest.mock('@langchain/langgraph', () => {
  // Create the Annotation mock function with proper TypeScript typing
  const mockAnnotation = Object.assign(
    jest.fn().mockImplementation((config?: any) => {
      return {
        default: config?.default || (() => null),
        reducer: config?.reducer || ((current: any, update: any) => update ?? current),
      };
    }),
    {
      // Add Root method as a property of the mock function
      Root: jest.fn().mockImplementation((rootConfig: any) => {
        const processedConfig: any = {};

        // Process each field in the root configuration
        for (const [key, value] of Object.entries(rootConfig)) {
          if (typeof value === 'function') {
            processedConfig[key] = value();
          } else {
            processedConfig[key] = value;
          }
        }

        return {
          State: processedConfig,
        };
      }),
    },
  );

  return {
    StateGraph: jest.fn().mockImplementation(() => {
      // Return a new instance each time to support graph cleanup testing
      return createMockStateGraph();
    }),
    Annotation: mockAnnotation,
    START: '__start__',
    END: '__end__',
  };
});

describe('ConversationStateService', () => {
  let service: ConversationStateService;
  let threadRepository: jest.Mocked<Repository<ConversationThread>>;
  let messageRepository: jest.Mocked<Repository<ThreadMessage>>;
  let threadsService: jest.Mocked<ThreadsService>;

  const mockThread = Object.assign(new ConversationThread(), {
    id: 'test-thread-id',
    title: 'Test Thread',
    summary: 'Test summary',
    status: ThreadStatus.ACTIVE,
    priority: ThreadPriority.NORMAL,
    tags: ['test'],
    messageCount: 1,
    unreadCount: 0,
    lastActivityAt: new Date(),
    lastMessagePreview: 'Hello',
    lastMessageSender: 'human',
    metadata: { source: 'test' },
    branchType: ThreadBranchType.ROOT,
    isMainBranch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Add required methods for branching functionality
    createBranch: jest.fn().mockImplementation((branchPointMessageId: string, options: any = {}) => ({
      id: undefined, // Will be set by TypeORM
      title: options.title || 'Branch of Test Thread',
      parentThreadId: 'test-thread-id',
      branchType: ThreadBranchType.BRANCH,
      branchPointMessageId,
      branchMetadata: {
        branchReason: options.branchReason || 'Test branch',
        branchingStrategy: options.branchingStrategy || 'fork',
        contextPreserved: options.preserveContext !== false,
      },
      isMainBranch: false,
      status: ThreadStatus.ACTIVE,
      priority: ThreadPriority.NORMAL,
      tags: ['test', 'branch'],
      messageCount: 0,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    markAsMerged: jest.fn().mockImplementation((sourceThreadIds: string[], options: any = {}) => {
      mockThread.branchType = ThreadBranchType.MERGED;
      mockThread.metadata = {
        ...mockThread.metadata,
        sourceThreadIds: sourceThreadIds.join(','),
        mergeStrategy: options.mergeStrategy || 'sequential',
        mergedBy: options.mergedBy,
        mergedAt: new Date().toISOString(),
      };
    }),
  });

  const mockMessage = Object.assign(new ThreadMessage(), {
    id: 'test-message-id',
    threadId: 'test-thread-id',
    sender: MessageSender.HUMAN,
    contentType: MessageContentType.TEXT,
    content: 'Hello, how are you?',
    role: 'user',
    sequenceNumber: 1,
    tokenCount: 10,
    isEdited: false,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    // Reset the StateGraph mock to default behavior
    mockStateGraph = createMockStateGraph();

    const mockThreadRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };

    const mockMessageRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };

    const mockThreadsService = {
      findThreadById: jest.fn(),
      autoCreateThread: jest.fn(),
      updateThreadActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationStateService,
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: mockThreadRepository,
        },
        {
          provide: getRepositoryToken(ThreadMessage),
          useValue: mockMessageRepository,
        },
        {
          provide: ThreadsService,
          useValue: mockThreadsService,
        },
      ],
    }).compile();

    service = module.get<ConversationStateService>(ConversationStateService);
    threadRepository = module.get(getRepositoryToken(ConversationThread));
    messageRepository = module.get(getRepositoryToken(ThreadMessage));
    threadsService = module.get(ThreadsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeConversationGraph', () => {
    it('should initialize a conversation graph for a thread', async () => {
      const threadId = 'test-thread-id';

      const graph = await service.initializeConversationGraph(threadId);

      expect(graph).toBeDefined();
      expect(graph.nodes).toBeDefined();
    });

    it('should store the graph in the internal map', async () => {
      const threadId = 'test-thread-id';

      await service.initializeConversationGraph(threadId);

      // Verify graph is stored by calling again and checking it returns the same instance
      const graph1 = await service.initializeConversationGraph(threadId);
      const graph2 = await service.initializeConversationGraph(threadId);

      expect(graph1).toBe(graph2);
    });
  });

  describe('executeConversationFlow', () => {
    it('should execute conversation flow with valid input', async () => {
      const threadId = 'test-thread-id';
      const initialMessage = new HumanMessage('Hello, world!');

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadsService.findThreadById.mockResolvedValue({
        id: threadId,
        title: 'Test Thread',
      } as any);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      messageRepository.create.mockReturnValue(mockMessage);
      messageRepository.save.mockResolvedValue(mockMessage);
      threadsService.updateThreadActivity.mockResolvedValue(undefined);

      // The StateGraph mock is already set up in the __mocks__ file
      // Just verify the expected behavior works with our existing mock

      const result = await service.executeConversationFlow(threadId, initialMessage);

      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
      expect(result.messages).toContainEqual(initialMessage);
    });

    it('should handle errors gracefully', async () => {
      const threadId = 'test-thread-id';
      const initialMessage = new HumanMessage('Hello, world!');

      // Mock a failing compilation - override the StateGraph constructor temporarily
      const { StateGraph: OriginalStateGraph } = jest.requireMock('@langchain/langgraph');
      const mockFailingGraph = createMockStateGraph();
      mockFailingGraph.compile = jest.fn().mockReturnValue({
        invoke: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      jest.mocked(OriginalStateGraph).mockImplementationOnce(() => mockFailingGraph);

      await expect(service.executeConversationFlow(threadId, initialMessage)).rejects.toThrow();

      try {
        await service.executeConversationFlow(threadId, initialMessage);
      } catch (error) {
        const errorString = error instanceof Error ? error.message : String(error);
        const errorData = JSON.parse(errorString);
        expect(errorData.code).toBe('GRAPH_EXECUTION_FAILED');
        expect(errorData.message).toBe('Database error');
      }
    });
  });

  describe('addMessageToConversation', () => {
    it('should add a message to existing conversation', async () => {
      const threadId = 'test-thread-id';
      const message = new HumanMessage('New message');

      threadsService.findThreadById.mockResolvedValue({
        id: threadId,
        title: 'Test Thread',
      } as any);
      threadRepository.findOne.mockResolvedValue(mockThread);
      messageRepository.find.mockResolvedValue([mockMessage]);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      messageRepository.create.mockReturnValue(mockMessage);
      messageRepository.save.mockResolvedValue(mockMessage);
      threadsService.updateThreadActivity.mockResolvedValue(undefined);

      // The existing StateGraph mock will handle this correctly

      const result = await service.addMessageToConversation(threadId, message);

      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
    });

    it('should throw error for non-existent thread', async () => {
      const threadId = 'non-existent-thread';
      const message = new HumanMessage('New message');

      threadsService.findThreadById.mockResolvedValue(null);

      await expect(service.addMessageToConversation(threadId, message)).rejects.toThrow();

      // Verify the error structure
      try {
        await service.addMessageToConversation(threadId, message);
      } catch (error) {
        const errorString = error instanceof Error ? error.message : String(error);
        const errorData: ConversationStateError = JSON.parse(errorString);
        expect(errorData.code).toBe('THREAD_NOT_FOUND');
        expect(errorData.message).toBe(`Thread not found: ${threadId}`);
      }
    });
  });

  describe('getConversationState', () => {
    it('should return conversation state for existing thread', async () => {
      const threadId = 'test-thread-id';

      threadRepository.findOne.mockResolvedValue(mockThread);
      messageRepository.find.mockResolvedValue([mockMessage]);

      const result = await service.getConversationState(threadId);

      expect(result).toBeDefined();
      expect(result!.threadId).toBe(threadId);
      expect(result!.thread).toBe(mockThread);
      expect(result!.messages).toHaveLength(1);
    });

    it('should return null for non-existent thread', async () => {
      const threadId = 'non-existent-thread';

      threadRepository.findOne.mockResolvedValue(null);

      const result = await service.getConversationState(threadId);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const threadId = 'test-thread-id';

      threadRepository.findOne.mockRejectedValue(new Error('Database error'));

      const result = await service.getConversationState(threadId);

      expect(result).toBeNull();
    });
  });

  describe('message conversion', () => {
    it('should convert ThreadMessage to BaseMessage correctly', async () => {
      const threadId = 'test-thread-id';
      const humanMessage = { ...mockMessage, sender: MessageSender.HUMAN } as unknown as ThreadMessage;
      const assistantMessage = { ...mockMessage, sender: MessageSender.ASSISTANT } as unknown as ThreadMessage;
      const systemMessage = { ...mockMessage, sender: MessageSender.SYSTEM } as unknown as ThreadMessage;

      threadRepository.findOne.mockResolvedValue(mockThread);
      messageRepository.find.mockResolvedValue([humanMessage, assistantMessage, systemMessage]);

      const result = await service.getConversationState(threadId);

      expect(result!.messages).toHaveLength(3);
      expect(result!.messages[0]).toBeInstanceOf(HumanMessage);
      expect(result!.messages[1]).toBeInstanceOf(AIMessage);
      expect(result!.messages[2]).toBeInstanceOf(SystemMessage);
    });
  });

  describe('cleanupConversationGraph', () => {
    it('should remove graph from internal map', async () => {
      const threadId = 'test-thread-id';

      // Initialize graph first
      const initialGraph = await service.initializeConversationGraph(threadId);

      // Clean up
      service.cleanupConversationGraph(threadId);

      // Verify cleanup by checking that a new graph is created
      const newGraph = await service.initializeConversationGraph(threadId);

      expect(initialGraph).not.toBe(newGraph); // Should be different instances after cleanup
    });
  });

  describe('state graph node implementations', () => {
    let conversationState: typeof ConversationState.State;

    beforeEach(() => {
      conversationState = {
        threadId: 'test-thread-id',
        thread: null,
        messages: [new HumanMessage('Hello')],
        currentMessage: new HumanMessage('Hello'),
        conversationPhase: 'initialization',
        context: {},
        error: null,
      };
    });

    describe('initializeThreadNode', () => {
      it('should initialize thread successfully', async () => {
        threadRepository.findOne.mockResolvedValue(mockThread);

        const result = await (service as any).initializeThreadNode(conversationState);

        expect(result.thread).toBe(mockThread);
        expect(result.conversationPhase).toBe('active');
        expect(result.error).toBeNull();
      });

      it('should auto-create thread if not found', async () => {
        threadRepository.findOne.mockResolvedValue(null);
        threadsService.autoCreateThread.mockResolvedValue({
          id: 'new-thread-id',
          title: 'Auto-created Thread',
        } as any);
        threadRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(mockThread);

        const result = await (service as any).initializeThreadNode(conversationState);

        expect(threadsService.autoCreateThread).toHaveBeenCalled();
        expect(result.thread).toBe(mockThread);
        expect(result.conversationPhase).toBe('active');
      });

      it('should handle deleted threads', async () => {
        const deletedThread = { ...mockThread, status: ThreadStatus.DELETED } as unknown as ConversationThread;
        threadRepository.findOne.mockResolvedValue(deletedThread);

        const result = await (service as any).initializeThreadNode(conversationState);

        expect(result.conversationPhase).toBe('error');
        expect(result.error).toBe('Thread not available or deleted');
      });
    });

    describe('processMessageNode', () => {
      it('should process message successfully', async () => {
        const result = await (service as any).processMessageNode(conversationState);

        expect(result.conversationPhase).toBe('active');
        expect(result.error).toBeNull();
      });

      it('should handle missing current message', async () => {
        conversationState.currentMessage = null;

        const result = await (service as any).processMessageNode(conversationState);

        expect(result.conversationPhase).toBe('error');
        expect(result.error).toBe('No current message to process');
      });
    });

    describe('persistStateNode', () => {
      it('should persist state successfully', async () => {
        conversationState.thread = mockThread;
        messageRepository.findOne.mockResolvedValue({ sequenceNumber: 5 } as any);
        messageRepository.create.mockReturnValue(mockMessage);
        messageRepository.save.mockResolvedValue(mockMessage);
        threadsService.updateThreadActivity.mockResolvedValue();

        const result = await (service as any).persistStateNode(conversationState);

        expect(result.conversationPhase).toBe('completion');
        expect(result.error).toBeNull();
        expect(messageRepository.save).toHaveBeenCalled();
        expect(threadsService.updateThreadActivity).toHaveBeenCalled();
      });

      it('should handle missing message or thread', async () => {
        conversationState.currentMessage = null;

        const result = await (service as any).persistStateNode(conversationState);

        expect(result.conversationPhase).toBe('error');
        expect(result.error).toBe('Missing message or thread for persistence');
      });
    });
  });

  describe('conditional edge functions', () => {
    let conversationState: typeof ConversationState.State;

    beforeEach(() => {
      conversationState = {
        threadId: 'test-thread-id',
        thread: mockThread,
        messages: [new HumanMessage('Hello')],
        currentMessage: new HumanMessage('Hello'),
        conversationPhase: 'active',
        context: {},
        error: null,
      };
    });

    describe('shouldProcessMessage', () => {
      it('should return process for active phase', () => {
        const result = (service as any).shouldProcessMessage(conversationState);
        expect(result).toBe('process');
      });

      it('should return error when error exists', () => {
        conversationState.error = 'Some error';
        const result = (service as any).shouldProcessMessage(conversationState);
        expect(result).toBe('error');
      });

      it('should return error for initialization phase', () => {
        conversationState.conversationPhase = 'initialization';
        const result = (service as any).shouldProcessMessage(conversationState);
        expect(result).toBe('error');
      });

      it('should return error for tool_use phase', () => {
        conversationState.conversationPhase = 'tool_use';
        const result = (service as any).shouldProcessMessage(conversationState);
        expect(result).toBe('error');
      });
    });

    describe('shouldFinalize', () => {
      it('should return finalize for completion phase', () => {
        conversationState.conversationPhase = 'completion';
        const result = (service as any).shouldFinalize(conversationState);
        expect(result).toBe('finalize');
      });

      it('should return error when error exists', () => {
        conversationState.error = 'Some error';
        const result = (service as any).shouldFinalize(conversationState);
        expect(result).toBe('error');
      });

      it('should return continue for other phases', () => {
        conversationState.conversationPhase = 'active';
        const result = (service as any).shouldFinalize(conversationState);
        expect(result).toBe('continue');
      });

      it('should return continue for initialization phase', () => {
        conversationState.conversationPhase = 'initialization';
        const result = (service as any).shouldFinalize(conversationState);
        expect(result).toBe('continue');
      });

      it('should return continue for tool_use phase', () => {
        conversationState.conversationPhase = 'tool_use';
        const result = (service as any).shouldFinalize(conversationState);
        expect(result).toBe('continue');
      });
    });
  });

  describe('ConversationContext type safety', () => {
    it('should handle complex conversation context', async () => {
      const threadId = 'test-thread-id';
      const complexContext: ConversationContext = {
        session: {
          id: 'session-123',
          userId: 'user-456',
          source: 'web',
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.1',
        },
        modelConfig: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          systemPrompt: 'You are a helpful assistant',
        },
        conversation: {
          language: 'en',
          topic: 'technical support',
          priority: 'high',
          category: 'support',
          tags: ['urgent', 'technical'],
        },
        capabilities: {
          availableTools: ['calculator', 'search'],
          restrictedActions: ['file_delete'],
          featureFlags: {
            enableAdvancedMode: true,
            enableDebugMode: false,
          },
        },
        processing: {
          startTime: Date.now(),
          stepCount: 3,
          tokenUsage: {
            prompt: 100,
            completion: 200,
            total: 300,
          },
        },
        custom: {
          strings: { customField: 'value' },
          numbers: { priority: 1 },
          booleans: { isVip: true },
          objects: { metadata: { key: 'value' } },
        },
      };

      const message = new HumanMessage('Complex context test');

      threadRepository.findOne.mockResolvedValue(mockThread);
      threadsService.findThreadById.mockResolvedValue(mockThread as any);
      messageRepository.find.mockResolvedValue([mockMessage]);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      messageRepository.create.mockReturnValue(mockMessage);
      messageRepository.save.mockResolvedValue(mockMessage);
      threadsService.updateThreadActivity.mockResolvedValue(undefined);

      // Update the mock to return the context properly
      const { StateGraph: OriginalStateGraph } = jest.requireMock('@langchain/langgraph');
      const mockContextGraph = createMockStateGraph();
      mockContextGraph.compile = jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue({
          threadId,
          thread: mockThread,
          messages: [message],
          currentMessage: message,
          conversationPhase: 'completion',
          context: complexContext,
          error: null,
        } as ConversationStateType),
      });

      jest.mocked(OriginalStateGraph).mockImplementationOnce(() => mockContextGraph);

      const result = await service.executeConversationFlow(threadId, message, complexContext);

      expect(result).toBeDefined();
      expect(result.context).toEqual(
        expect.objectContaining({
          session: expect.objectContaining({
            id: 'session-123',
            source: 'web',
          }),
          modelConfig: expect.objectContaining({
            model: 'gpt-4',
            temperature: 0.7,
          }),
        }),
      );
    });
  });

  describe('ConversationStateError handling', () => {
    it('should create properly structured error for thread not found', async () => {
      const threadId = 'non-existent-thread';
      const message = new HumanMessage('Test message');

      threadsService.findThreadById.mockResolvedValue(null);

      await expect(service.addMessageToConversation(threadId, message)).rejects.toThrow();

      // Verify error structure
      try {
        await service.addMessageToConversation(threadId, message);
      } catch (error) {
        const errorData: ConversationStateError = JSON.parse(error.message);
        expect(errorData.code).toBe('THREAD_NOT_FOUND');
        expect(errorData.message).toBe(`Thread not found: ${threadId}`);
        expect(errorData.details).toEqual({
          threadId,
          operation: 'addMessageToConversation',
          timestamp: expect.any(Number),
        });
      }
    });

    it('should handle database errors with proper error structure', async () => {
      const threadId = 'test-thread-id';
      const dbError = new Error('Connection timeout');

      threadRepository.findOne.mockRejectedValue(dbError);

      const state = {
        threadId,
        thread: null,
        messages: [new HumanMessage('Hello')],
        currentMessage: new HumanMessage('Hello'),
        conversationPhase: 'initialization' as const,
        context: {},
        error: null,
      };

      const result = await (service as any).initializeThreadNode(state);

      expect(result.conversationPhase).toBe('error');
      expect(result.error).toBeDefined();

      const errorData: ConversationStateError = JSON.parse(result.error);
      expect(errorData.code).toBe('DATABASE_ERROR');
      expect(errorData.message).toBe('Connection timeout');
      expect(errorData.details?.originalError).toEqual({});
    });

    it('should handle graph execution failures', async () => {
      const threadId = 'test-thread-id';
      const message = new HumanMessage('Test message');

      // Mock StateGraph to throw error during compilation/execution
      const { StateGraph: OriginalStateGraph } = jest.requireMock('@langchain/langgraph');
      const mockFailingGraph = createMockStateGraph();
      mockFailingGraph.compile = jest.fn().mockReturnValue({
        invoke: jest.fn().mockRejectedValue(new Error('Graph compilation failed')),
      });

      jest.mocked(OriginalStateGraph).mockImplementationOnce(() => mockFailingGraph);

      await expect(service.executeConversationFlow(threadId, message)).rejects.toThrow();

      try {
        await service.executeConversationFlow(threadId, message);
      } catch (error) {
        const errorString = error instanceof Error ? error.message : String(error);
        const errorData: ConversationStateError = JSON.parse(errorString);
        expect(errorData.code).toBe('GRAPH_EXECUTION_FAILED');
        expect(errorData.message).toBe('Graph compilation failed');
      }
    });
  });

  describe('message conversion type guards', () => {
    it('should handle unknown message types gracefully', () => {
      const unknownMessage = {
        content: 'Test content',
        additional_kwargs: {},
        response_metadata: {},
      } as BaseMessage;

      expect(() => {
        (service as any).convertToThreadMessage(unknownMessage, 'thread-1', 1);
      }).toThrow('Unsupported message type');
    });

    it('should convert complex message content types', async () => {
      const threadId = 'test-thread-id';
      const _complexMessage = new HumanMessage('Hello complex message');

      threadRepository.findOne.mockResolvedValue(mockThread);
      messageRepository.find.mockResolvedValue([
        {
          ...mockMessage,
          content: JSON.stringify({ text: 'Hello', type: 'complex' }),
          rawContent: [
            {
              type: 'text' as const,
              text: 'Hello world',
            },
            {
              type: 'image_url' as const,
              imageUrl: 'https://example.com/image.jpg',
              detail: 'high' as const,
            },
          ],
        } as unknown as ThreadMessage,
      ]);

      const result = await service.getConversationState(threadId);

      expect(result).toBeDefined();
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0]).toBeInstanceOf(HumanMessage);
      expect(result!.messages[0].additional_kwargs?.rawContent).toEqual([
        { type: 'text', text: 'Hello world' },
        { type: 'image_url', imageUrl: 'https://example.com/image.jpg', detail: 'high' },
      ]);
    });

    it('should handle message metadata correctly', async () => {
      const threadId = 'test-thread-id';
      const messageWithMetadata = {
        ...mockMessage,
        sender: MessageSender.ASSISTANT,
        model: 'gpt-4-turbo',
        temperature: 0.8,
        metadata: {
          confidence: 0.95,
          processingTime: 1200,
          tokens: { input: 50, output: 100 },
        },
      } as unknown as ThreadMessage;

      threadRepository.findOne.mockResolvedValue(mockThread);
      messageRepository.find.mockResolvedValue([messageWithMetadata]);

      const result = await service.getConversationState(threadId);

      expect(result!.messages[0]).toBeInstanceOf(AIMessage);
      expect(result!.messages[0].additional_kwargs).toEqual({
        messageId: messageWithMetadata.id,
        metadata: messageWithMetadata.metadata,
        contentType: messageWithMetadata.contentType,
        model: 'gpt-4-turbo',
        temperature: 0.8,
      });
    });
  });

  describe('state persistence validation', () => {
    it('should validate state before persistence', async () => {
      const invalidState = {
        threadId: 'test-thread-id',
        thread: null,
        messages: [new HumanMessage('Hello')],
        currentMessage: null, // Invalid: missing current message
        conversationPhase: 'active' as const,
        context: {},
        error: null,
      };

      const result = await (service as any).persistStateNode(invalidState);

      expect(result.conversationPhase).toBe('error');
      expect(result.error).toBe('Missing message or thread for persistence');
    });

    it('should handle sequence number calculation correctly', async () => {
      const state = {
        threadId: 'test-thread-id',
        thread: mockThread,
        messages: [new HumanMessage('Hello')],
        currentMessage: new HumanMessage('Hello'),
        conversationPhase: 'active' as const,
        context: {},
        error: null,
      };

      const lastMessage = { ...mockMessage, sequenceNumber: 15 } as unknown as ThreadMessage;
      messageRepository.findOne.mockResolvedValue(lastMessage);
      messageRepository.create.mockReturnValue({ ...mockMessage, sequenceNumber: 16 } as unknown as ThreadMessage);
      messageRepository.save.mockResolvedValue({ ...mockMessage, sequenceNumber: 16 } as unknown as ThreadMessage);
      threadsService.updateThreadActivity.mockResolvedValue();

      const result = await (service as any).persistStateNode(state);

      expect(result.conversationPhase).toBe('completion');
      expect(messageRepository.create).toHaveBeenCalledWith(expect.objectContaining({ sequenceNumber: 16 }));
    });
  });

  describe('Thread Branching and Merging', () => {
    const mockParentThread: ConversationThread = Object.assign(new ConversationThread(), {
      ...mockThread,
      id: 'parent-thread-id',
      title: 'Parent Thread',
      branchType: ThreadBranchType.ROOT,
    });

    const mockBranchPointMessage = Object.assign(new ThreadMessage(), {
      ...mockMessage,
      id: 'branch-point-message-id',
      threadId: 'parent-thread-id',
      sequenceNumber: 5,
      content: 'This is the branch point',
    });

    const mockBranchThread = Object.assign(new ConversationThread(), {
      ...mockThread,
      id: 'branch-thread-id',
      title: 'Branch of Parent Thread',
      parentThreadId: 'parent-thread-id',
      branchType: ThreadBranchType.BRANCH,
      branchPointMessageId: 'branch-point-message-id',
      branchMetadata: {
        branchReason: 'Alternative approach',
        branchingStrategy: 'fork',
        contextPreserved: true,
      },
      isMainBranch: false,
    });

    describe('createThreadBranch', () => {
      it('should create a branch from an existing thread successfully', async () => {
        threadRepository.findOne.mockResolvedValue(mockParentThread);
        messageRepository.findOne.mockResolvedValue(mockBranchPointMessage);
        threadRepository.create.mockReturnValue(mockBranchThread);
        threadRepository.save.mockResolvedValue(mockBranchThread);
        messageRepository.find.mockResolvedValue([mockMessage]);
        messageRepository.create.mockReturnValue(mockMessage);
        messageRepository.save.mockResolvedValue(mockMessage);

        const result = await service.createThreadBranch('parent-thread-id', 'branch-point-message-id', {
          title: 'Alternative Approach',
          branchReason: 'Exploring different solution',
          branchingStrategy: 'fork',
        });

        expect(result).toBeDefined();
        expect(result.id).toBe('branch-thread-id');
        expect(result.parentThreadId).toBe('parent-thread-id');
        expect(result.branchType).toBe(ThreadBranchType.BRANCH);
        expect(threadRepository.save).toHaveBeenCalled();
      });

      it('should throw error for non-existent parent thread', async () => {
        threadRepository.findOne.mockResolvedValue(null);

        await expect(service.createThreadBranch('non-existent-thread', 'message-id')).rejects.toThrow();

        expect(threadRepository.save).not.toHaveBeenCalled();
      });

      it('should throw error for non-existent branch point message', async () => {
        threadRepository.findOne.mockResolvedValue(mockParentThread);
        messageRepository.findOne.mockResolvedValue(null);

        await expect(service.createThreadBranch('parent-thread-id', 'non-existent-message')).rejects.toThrow();

        expect(threadRepository.save).not.toHaveBeenCalled();
      });

      it('should copy messages to branch when preserveContext is true', async () => {
        threadRepository.findOne.mockResolvedValue(mockParentThread);
        messageRepository.findOne.mockResolvedValue(mockBranchPointMessage);
        threadRepository.create.mockReturnValue(mockBranchThread);
        threadRepository.save.mockResolvedValue(mockBranchThread);

        const messagesToCopy = [
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'msg-1', sequenceNumber: 1 }),
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'msg-2', sequenceNumber: 2 }),
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'msg-3', sequenceNumber: 5 }), // branch point
        ];

        messageRepository.find.mockResolvedValue(messagesToCopy);
        messageRepository.create.mockReturnValue(mockMessage);
        messageRepository.save.mockResolvedValue(mockMessage);

        await service.createThreadBranch('parent-thread-id', 'branch-point-message-id', { preserveContext: true });

        expect(messageRepository.save).toHaveBeenCalledTimes(3); // 3 for copied messages
        expect(threadRepository.save).toHaveBeenCalledTimes(1); // Only thread save
      });

      it('should not copy messages when preserveContext is false', async () => {
        threadRepository.findOne.mockResolvedValue(mockParentThread);
        messageRepository.findOne.mockResolvedValue(mockBranchPointMessage);
        threadRepository.create.mockReturnValue(mockBranchThread);
        threadRepository.save.mockResolvedValue(mockBranchThread);

        await service.createThreadBranch('parent-thread-id', 'branch-point-message-id', { preserveContext: false });

        expect(messageRepository.save).toHaveBeenCalledTimes(0); // No messages copied when preserveContext is false
        expect(threadRepository.save).toHaveBeenCalledTimes(1); // Only thread save
      });
    });

    describe('mergeThreads', () => {
      const mockTargetThread = Object.assign(new ConversationThread(), {
        ...mockThread,
        id: 'target-thread-id',
        title: 'Target Thread',
        messageCount: 5,
      });

      const mockSourceThread1 = Object.assign(new ConversationThread(), {
        ...mockThread,
        id: 'source-thread-1',
        title: 'Source Thread 1',
        messageCount: 3,
      });

      const mockSourceThread2 = Object.assign(new ConversationThread(), {
        ...mockThread,
        id: 'source-thread-2',
        title: 'Source Thread 2',
        messageCount: 2,
      });

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('should merge threads successfully with sequential strategy', async () => {
        threadRepository.findOne.mockResolvedValue(mockTargetThread);
        threadRepository.find.mockResolvedValue([mockSourceThread1, mockSourceThread2]);

        const sourceMessages1 = [
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src1-msg1', sequenceNumber: 1 }),
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src1-msg2', sequenceNumber: 2 }),
        ];

        const sourceMessages2 = [Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src2-msg1', sequenceNumber: 1 })];

        messageRepository.find
          .mockResolvedValueOnce(sourceMessages1) // First source thread
          .mockResolvedValueOnce(sourceMessages2); // Second source thread

        messageRepository.findOne.mockResolvedValue({ sequenceNumber: 5 } as ThreadMessage); // Last message in target
        messageRepository.create.mockReturnValue(mockMessage);
        messageRepository.save.mockResolvedValue(mockMessage);
        messageRepository.count.mockResolvedValue(8); // New total count
        const mergedThread = Object.assign(new ConversationThread(), {
          ...mockTargetThread,
          branchType: ThreadBranchType.MERGED,
        });
        threadRepository.save.mockResolvedValue(mergedThread);
        threadRepository.update.mockResolvedValue(undefined as any);

        const result = await service.mergeThreads('target-thread-id', ['source-thread-1', 'source-thread-2'], {
          mergeStrategy: 'sequential',
        });

        expect(result).toBeDefined();
        expect(result.branchType).toBe(ThreadBranchType.MERGED);
        expect(messageRepository.save).toHaveBeenCalledTimes(3); // 3 messages copied
        expect(threadRepository.update).toHaveBeenCalledWith(['source-thread-1', 'source-thread-2'], {
          status: ThreadStatus.ARCHIVED,
          metadata: {
            mergedIntoThread: 'target-thread-id',
            mergedAt: expect.any(Date),
          },
        });
      });

      it('should merge threads with interleaved strategy', async () => {
        threadRepository.findOne.mockResolvedValue(mockTargetThread);
        threadRepository.find.mockResolvedValue([mockSourceThread1]);

        const now = new Date();
        const sourceMessages = [
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src-msg1', createdAt: new Date(now.getTime() - 1000) }),
          Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src-msg2', createdAt: new Date(now.getTime() + 1000) }),
        ];

        messageRepository.find.mockResolvedValue(sourceMessages);
        messageRepository.findOne.mockResolvedValue({ sequenceNumber: 5 } as ThreadMessage);
        messageRepository.create.mockReturnValue(mockMessage);
        messageRepository.save.mockResolvedValue(mockMessage);
        messageRepository.count.mockResolvedValue(7);
        const mergedThread = Object.assign(new ConversationThread(), {
          ...mockTargetThread,
          branchType: ThreadBranchType.MERGED,
        });
        threadRepository.save.mockResolvedValue(mergedThread);
        threadRepository.update.mockResolvedValue(undefined as any);

        const result = await service.mergeThreads('target-thread-id', ['source-thread-1'], {
          mergeStrategy: 'interleaved',
        });

        expect(result).toBeDefined();
        expect(result.branchType).toBe(ThreadBranchType.MERGED);
      });

      it('should merge threads with manual strategy preserving timestamps', async () => {
        threadRepository.findOne.mockResolvedValue(mockTargetThread);
        threadRepository.find.mockResolvedValue([mockSourceThread1]);

        const originalTimestamp = new Date('2024-01-01T10:00:00Z');
        const sourceMessages = [Object.assign(new ThreadMessage(), { ...mockMessage, id: 'src-msg1', createdAt: originalTimestamp })];

        messageRepository.find.mockResolvedValue(sourceMessages);
        messageRepository.findOne.mockResolvedValue({ sequenceNumber: 5 } as ThreadMessage);
        const manualMessage = Object.assign(new ThreadMessage(), {
          ...mockMessage,
          createdAt: originalTimestamp,
          metadata: { requiresManualOrdering: true },
        });
        messageRepository.create.mockReturnValue(manualMessage);
        messageRepository.save.mockResolvedValue(mockMessage);
        messageRepository.count.mockResolvedValue(6);
        const mergedThread = Object.assign(new ConversationThread(), {
          ...mockTargetThread,
          branchType: ThreadBranchType.MERGED,
        });
        threadRepository.save.mockResolvedValue(mergedThread);
        threadRepository.update.mockResolvedValue(undefined as any);

        const result = await service.mergeThreads('target-thread-id', ['source-thread-1'], {
          mergeStrategy: 'manual',
        });

        expect(result).toBeDefined();
        expect(messageRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            createdAt: originalTimestamp,
            metadata: expect.objectContaining({
              requiresManualOrdering: true,
            }),
          }),
        );
      });

      it('should throw error for non-existent target thread', async () => {
        threadRepository.findOne.mockResolvedValue(null);

        await expect(service.mergeThreads('non-existent-target', ['source-1'])).rejects.toThrow();
      });

      it('should throw error for non-existent source threads', async () => {
        threadRepository.findOne.mockResolvedValue(mockTargetThread);
        threadRepository.find.mockResolvedValue([]); // No source threads found

        await expect(service.mergeThreads('target-thread-id', ['non-existent-source'])).rejects.toThrow();
      });

      it('should not archive source threads when archiveSourceThreads is false', async () => {
        threadRepository.findOne.mockResolvedValue(mockTargetThread);
        threadRepository.find.mockResolvedValue([mockSourceThread1]);
        messageRepository.find.mockResolvedValue([]);
        messageRepository.findOne.mockResolvedValue({ sequenceNumber: 5 } as ThreadMessage);
        messageRepository.count.mockResolvedValue(5);
        const mergedThread = Object.assign(new ConversationThread(), {
          ...mockTargetThread,
          branchType: ThreadBranchType.MERGED,
        });
        threadRepository.save.mockResolvedValue(mergedThread);

        await service.mergeThreads('target-thread-id', ['source-thread-1'], {
          archiveSourceThreads: false,
        });

        expect(threadRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('getThreadBranches', () => {
      it('should return all active branch threads for a parent', async () => {
        const branches = [
          Object.assign(new ConversationThread(), { ...mockBranchThread, id: 'branch-1' }),
          Object.assign(new ConversationThread(), { ...mockBranchThread, id: 'branch-2' }),
        ];

        threadRepository.find.mockResolvedValue(branches);

        const result = await service.getThreadBranches('parent-thread-id');

        expect(result).toEqual(branches);
        expect(threadRepository.find).toHaveBeenCalledWith({
          where: {
            parentThreadId: 'parent-thread-id',
            status: ThreadStatus.ACTIVE,
            branchType: ThreadBranchType.BRANCH,
          },
          order: { createdAt: 'ASC' },
        });
      });

      it('should return empty array when no branches exist', async () => {
        threadRepository.find.mockResolvedValue([]);

        const result = await service.getThreadBranches('parent-thread-id');

        expect(result).toEqual([]);
      });

      it('should handle database errors gracefully', async () => {
        threadRepository.find.mockRejectedValue(new Error('Database error'));

        const result = await service.getThreadBranches('parent-thread-id');

        expect(result).toEqual([]);
      });
    });

    describe('getThreadHierarchy', () => {
      it('should return complete thread hierarchy', async () => {
        const rootThread = Object.assign(new ConversationThread(), {
          ...mockThread,
          id: 'root-id',
          branchType: ThreadBranchType.ROOT,
        });

        const childThread = Object.assign(new ConversationThread(), {
          ...mockThread,
          id: 'child-id',
          parentThreadId: 'root-id',
          branchType: ThreadBranchType.BRANCH,
        });

        // Mock the parentThread property to return the root thread
        Object.defineProperty(childThread, 'parentThread', {
          get: () => Promise.resolve(rootThread),
          configurable: true,
        });

        const siblings = [
          Object.assign(new ConversationThread(), {
            ...mockThread,
            id: 'sibling-1',
            parentThreadId: 'root-id',
          }),
        ];

        const children = [
          Object.assign(new ConversationThread(), {
            ...mockThread,
            id: 'grandchild-1',
            parentThreadId: 'child-id',
          }),
        ];

        threadRepository.findOne.mockResolvedValue(childThread);
        threadRepository.find
          .mockResolvedValueOnce(children) // Children of current thread
          .mockResolvedValueOnce([childThread, ...siblings]); // All siblings

        const result = await service.getThreadHierarchy('child-id');

        expect(result).toEqual({
          root: rootThread,
          parent: rootThread,
          current: childThread,
          children,
          siblings,
        });
      });

      it('should handle root thread correctly', async () => {
        const rootThread = Object.assign(new ConversationThread(), {
          ...mockThread,
          id: 'root-id',
          branchType: ThreadBranchType.ROOT,
        });

        const children = [
          Object.assign(new ConversationThread(), {
            ...mockThread,
            id: 'child-1',
          }),
        ];

        threadRepository.findOne.mockResolvedValue(rootThread);
        threadRepository.find.mockResolvedValue(children);

        const result = await service.getThreadHierarchy('root-id');

        expect(result).toEqual({
          root: rootThread,
          parent: null,
          current: rootThread,
          children,
          siblings: [],
        });
      });

      it('should return null values for non-existent thread', async () => {
        threadRepository.findOne.mockResolvedValue(null);

        const result = await service.getThreadHierarchy('non-existent');

        expect(result).toEqual({
          root: null,
          parent: null,
          current: null,
          children: [],
          siblings: [],
        });
      });

      it('should handle database errors gracefully', async () => {
        threadRepository.findOne.mockRejectedValue(new Error('Database error'));

        const result = await service.getThreadHierarchy('thread-id');

        expect(result).toEqual({
          root: null,
          parent: null,
          current: null,
          children: [],
          siblings: [],
        });
      });
    });

    describe('helper methods', () => {
      it('should calculate next sequence number correctly', async () => {
        const lastMessage = { sequenceNumber: 10 } as ThreadMessage;
        messageRepository.findOne.mockResolvedValue(lastMessage);

        const result = await (service as any).getNextSequenceNumber('thread-id');

        expect(result).toBe(11);
        expect(messageRepository.findOne).toHaveBeenCalledWith({
          where: { threadId: 'thread-id' },
          order: { sequenceNumber: 'DESC' },
        });
      });

      it('should return 1 for thread with no messages', async () => {
        messageRepository.findOne.mockResolvedValue(null);

        const result = await (service as any).getNextSequenceNumber('thread-id');

        expect(result).toBe(1);
      });
    });
  });
});
