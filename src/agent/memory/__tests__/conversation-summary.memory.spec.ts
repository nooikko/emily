import { Test, TestingModule } from '@nestjs/testing';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConversationSummaryMemory } from '../conversation-summary.memory';

describe('ConversationSummaryMemory', () => {
  let conversationSummaryMemory: ConversationSummaryMemory;
  let mockLLM: jest.Mocked<BaseChatModel>;

  beforeEach(async () => {
    // Create a mock LLM
    mockLLM = {
      invoke: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConversationSummaryMemory,
          useFactory: () => new ConversationSummaryMemory(mockLLM),
        },
      ],
    }).compile();

    conversationSummaryMemory = module.get<ConversationSummaryMemory>(ConversationSummaryMemory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeThread', () => {
    it('should initialize a new thread with empty state', () => {
      const threadId = 'test-thread-1';
      
      conversationSummaryMemory.initializeThread(threadId);
      const state = conversationSummaryMemory.getSummaryState(threadId);

      expect(state).toBeDefined();
      expect(state?.summary).toBe('');
      expect(state?.messagesSummarized).toBe(0);
      expect(state?.pendingMessages).toEqual([]);
      expect(state?.lastSummaryUpdate).toBeGreaterThan(0);
    });
  });

  describe('addMessages', () => {
    it('should add messages to pending without summarizing when below threshold', async () => {
      const threadId = 'test-thread-2';
      const messages = [
        new HumanMessage('Hello, how are you?'),
        new AIMessage('I am doing well, thank you!'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 5,
      });

      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.pendingMessages).toHaveLength(2);
      expect(state?.summary).toBe('');
      expect(mockLLM.invoke).not.toHaveBeenCalled();
    });

    it('should trigger summarization when reaching threshold', async () => {
      const threadId = 'test-thread-3';
      mockLLM.invoke.mockResolvedValue({
        content: 'User greeted the assistant and they had a friendly exchange.',
      } as any);

      // Add messages up to threshold
      const messages = [
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
        new HumanMessage('How are you?'),
        new AIMessage('I am well'),
        new HumanMessage('What can you do?'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 5,
      });

      expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
      
      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.summary).toBe('User greeted the assistant and they had a friendly exchange.');
      expect(state?.pendingMessages).toHaveLength(0);
      expect(state?.messagesSummarized).toBe(5);
    });

    it('should filter system messages when includeSystemMessages is false', async () => {
      const threadId = 'test-thread-4';
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Hello'),
        new AIMessage('Hi'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        includeSystemMessages: false,
        maxMessagesBeforeSummary: 10,
      });

      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.pendingMessages).toHaveLength(2);
      expect(state?.pendingMessages[0]).toBeInstanceOf(HumanMessage);
      expect(state?.pendingMessages[1]).toBeInstanceOf(AIMessage);
    });

    it('should include system messages when includeSystemMessages is true', async () => {
      const threadId = 'test-thread-5';
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('Hello'),
        new AIMessage('Hi'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        includeSystemMessages: true,
        maxMessagesBeforeSummary: 10,
      });

      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.pendingMessages).toHaveLength(3);
    });
  });

  describe('forceSummarize', () => {
    it('should summarize pending messages even below threshold', async () => {
      const threadId = 'test-thread-6';
      mockLLM.invoke.mockResolvedValue({
        content: 'Brief conversation summary.',
      } as any);

      const messages = [
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 10,
      });

      const summary = await conversationSummaryMemory.forceSummarize(threadId);

      expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
      expect(summary).toBe('Brief conversation summary.');
      
      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.pendingMessages).toHaveLength(0);
      expect(state?.messagesSummarized).toBe(2);
    });

    it('should return empty string when no messages to summarize', async () => {
      const threadId = 'test-thread-7';
      conversationSummaryMemory.initializeThread(threadId);
      
      const summary = await conversationSummaryMemory.forceSummarize(threadId);
      
      expect(summary).toBe('');
      expect(mockLLM.invoke).not.toHaveBeenCalled();
    });

    it('should update existing summary when summarizing new messages', async () => {
      const threadId = 'test-thread-8';
      
      // Set up initial state with existing summary
      conversationSummaryMemory.initializeThread(threadId);
      const state = conversationSummaryMemory.getSummaryState(threadId)!;
      state.summary = 'Previous conversation about the weather.';
      state.messagesSummarized = 3;

      // Add new messages
      const messages = [
        new HumanMessage('What about sports?'),
        new AIMessage('I can discuss sports too!'),
      ];
      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 10,
      });

      mockLLM.invoke.mockResolvedValue({
        content: 'Conversation about weather and sports.',
      } as any);

      const summary = await conversationSummaryMemory.forceSummarize(threadId);

      expect(summary).toBe('Conversation about weather and sports.');
      expect(state.messagesSummarized).toBe(5);
      
      // Check that the prompt included the previous summary
      const invokeCalls = mockLLM.invoke.mock.calls;
      const promptMessages = invokeCalls[0][0] as any[];
      expect(promptMessages[1].content).toContain('Previous summary:');
      expect(promptMessages[1].content).toContain('Previous conversation about the weather.');
    });
  });

  describe('getContext', () => {
    it('should return empty array for non-existent thread', async () => {
      const context = await conversationSummaryMemory.getContext('non-existent');
      expect(context).toEqual([]);
    });

    it('should return summary as system message when available', async () => {
      const threadId = 'test-thread-9';
      conversationSummaryMemory.initializeThread(threadId);
      const state = conversationSummaryMemory.getSummaryState(threadId)!;
      state.summary = 'Conversation summary here.';
      state.messagesSummarized = 5;

      const context = await conversationSummaryMemory.getContext(threadId);

      expect(context).toHaveLength(1);
      expect(context[0]).toBeInstanceOf(SystemMessage);
      expect(context[0].content).toContain('Previous conversation summary (5 messages):');
      expect(context[0].content).toContain('Conversation summary here.');
    });

    it('should include pending messages when requested', async () => {
      const threadId = 'test-thread-10';
      const messages = [
        new HumanMessage('Recent message 1'),
        new AIMessage('Recent response 1'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 10,
      });

      const context = await conversationSummaryMemory.getContext(threadId, true);

      expect(context).toHaveLength(2);
      expect(context[0]).toBeInstanceOf(HumanMessage);
      expect(context[1]).toBeInstanceOf(AIMessage);
    });

    it('should exclude pending messages when not requested', async () => {
      const threadId = 'test-thread-11';
      const messages = [
        new HumanMessage('Recent message'),
        new AIMessage('Recent response'),
      ];

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 10,
      });

      const context = await conversationSummaryMemory.getContext(threadId, false);

      expect(context).toHaveLength(0); // No summary yet, and pending messages excluded
    });

    it('should return both summary and pending messages when both exist', async () => {
      const threadId = 'test-thread-12';
      conversationSummaryMemory.initializeThread(threadId);
      const state = conversationSummaryMemory.getSummaryState(threadId)!;
      state.summary = 'Previous summary.';
      state.messagesSummarized = 3;
      state.pendingMessages = [
        new HumanMessage('New message'),
        new AIMessage('New response'),
      ];

      const context = await conversationSummaryMemory.getContext(threadId, true);

      expect(context).toHaveLength(3);
      expect(context[0]).toBeInstanceOf(SystemMessage);
      expect(context[0].content).toContain('Previous summary.');
      expect(context[1]).toBeInstanceOf(HumanMessage);
      expect(context[2]).toBeInstanceOf(AIMessage);
    });
  });

  describe('fallback summarization', () => {
    it('should use fallback when LLM is not available', async () => {
      const memoryWithoutLLM = new ConversationSummaryMemory();
      const threadId = 'test-thread-13';

      const messages = [
        new HumanMessage('Message 1'),
        new AIMessage('Response 1'),
        new HumanMessage('Message 2'),
        new AIMessage('Response 2'),
        new HumanMessage('Message 3'),
      ];

      await memoryWithoutLLM.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 5,
      });

      const state = memoryWithoutLLM.getSummaryState(threadId);
      expect(state?.summary).toContain('Human: Message 1');
      expect(state?.summary).toContain('AI: Response 1');
      expect(state?.pendingMessages).toHaveLength(0);
      expect(state?.messagesSummarized).toBe(5);
    });

    it('should use fallback when LLM throws error', async () => {
      const threadId = 'test-thread-14';
      mockLLM.invoke.mockRejectedValue(new Error('LLM service unavailable'));

      const messages = Array(5).fill(null).map((_, i) => 
        new HumanMessage(`Message ${i + 1}`),
      );

      await conversationSummaryMemory.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 5,
      });

      const state = conversationSummaryMemory.getSummaryState(threadId);
      expect(state?.summary).toBeDefined();
      expect(state?.summary.length).toBeGreaterThan(0);
      expect(state?.pendingMessages).toHaveLength(0);
    });

    it('should truncate fallback summary to prevent unlimited growth', async () => {
      const memoryWithoutLLM = new ConversationSummaryMemory();
      const threadId = 'test-thread-15';

      // Create a very long message
      const longMessage = 'x'.repeat(3000);
      const messages = [new HumanMessage(longMessage)];

      await memoryWithoutLLM.addMessages(threadId, messages, {
        maxMessagesBeforeSummary: 1,
      });

      const state = memoryWithoutLLM.getSummaryState(threadId);
      expect(state?.summary.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('clearThread', () => {
    it('should remove all state for a thread', async () => {
      const threadId = 'test-thread-16';
      
      await conversationSummaryMemory.addMessages(threadId, [
        new HumanMessage('Test message'),
      ]);

      expect(conversationSummaryMemory.getSummaryState(threadId)).toBeDefined();

      conversationSummaryMemory.clearThread(threadId);

      expect(conversationSummaryMemory.getSummaryState(threadId)).toBeUndefined();
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics for multiple threads', async () => {
      // Set up multiple threads
      const thread1 = 'thread-1';
      const thread2 = 'thread-2';
      
      conversationSummaryMemory.initializeThread(thread1);
      conversationSummaryMemory.initializeThread(thread2);
      
      const state1 = conversationSummaryMemory.getSummaryState(thread1)!;
      state1.messagesSummarized = 10;
      
      const state2 = conversationSummaryMemory.getSummaryState(thread2)!;
      state2.messagesSummarized = 20;

      const stats = conversationSummaryMemory.getStatistics();

      expect(stats.totalThreads).toBe(2);
      expect(stats.totalMessagesSummarized).toBe(30);
      expect(stats.averageMessagesPerThread).toBe(15);
    });

    it('should handle empty state gracefully', () => {
      const stats = conversationSummaryMemory.getStatistics();

      expect(stats.totalThreads).toBe(0);
      expect(stats.totalMessagesSummarized).toBe(0);
      expect(stats.averageMessagesPerThread).toBe(0);
    });
  });
});