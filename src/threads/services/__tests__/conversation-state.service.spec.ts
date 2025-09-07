import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread, ThreadPriority, ThreadStatus } from '../../entities/conversation-thread.entity';
import { MessageContentType, MessageSender, ThreadMessage } from '../../entities/thread-message.entity';
import { ConversationContext, ConversationState, ConversationStateError, ConversationStateService } from '../conversation-state.service';
import { ThreadsService } from '../threads.service';

describe('ConversationStateService', () => {
  let service: ConversationStateService;
  let threadRepository: jest.Mocked<Repository<ConversationThread>>;
  let messageRepository: jest.Mocked<Repository<ThreadMessage>>;
  let threadsService: jest.Mocked<ThreadsService>;

  const mockThread: ConversationThread = {
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
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConversationThread;

  const mockMessage: ThreadMessage = {
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
  } as ThreadMessage;

  beforeEach(async () => {
    const mockThreadRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    const mockMessageRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
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
      threadsService.updateThreadActivity.mockResolvedValue();

      const result = await service.executeConversationFlow(threadId, initialMessage);

      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
      expect(result.messages).toContainEqual(initialMessage);
    });

    it('should handle errors gracefully', async () => {
      const threadId = 'test-thread-id';
      const initialMessage = new HumanMessage('Hello, world!');

      threadRepository.findOne.mockRejectedValue(new Error('Database error'));

      const result = await service.executeConversationFlow(threadId, initialMessage);

      expect(result.conversationPhase).toBe('error');
      expect(result.error).toBeDefined();

      const errorData = JSON.parse(result.error!);
      expect(errorData.code).toBe('DATABASE_ERROR');
      expect(errorData.message).toBe('Database error');
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
      threadsService.updateThreadActivity.mockResolvedValue();

      const result = await service.addMessageToConversation(threadId, message);

      expect(result).toBeDefined();
      expect(result.threadId).toBe(threadId);
    });

    it('should throw error for non-existent thread', async () => {
      const threadId = 'non-existent-thread';
      const message = new HumanMessage('New message');

      threadsService.findThreadById.mockResolvedValue(null);

      await expect(service.addMessageToConversation(threadId, message)).rejects.toThrow(`Thread not found: ${threadId}`);
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
      threadsService.updateThreadActivity.mockResolvedValue();

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

      // Mock a graph compilation error
      threadRepository.findOne.mockImplementation(() => {
        throw new Error('Graph compilation failed');
      });

      const result = await service.executeConversationFlow(threadId, message);
      expect(result.conversationPhase).toBe('error');
      expect(result.error).toBeDefined();

      const errorData: ConversationStateError = JSON.parse(result.error!);
      expect(errorData.code).toBe('DATABASE_ERROR');
      expect(errorData.details?.operation).toBe('initializeThread');
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
});
