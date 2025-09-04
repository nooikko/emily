import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { ReactAgent } from 'src/agent/implementations/react.agent';
import type { MessageContentDto, TextContentDto } from 'src/api/agent/dto/message.dto';
import { RedisService } from 'src/messaging/redis/redis.service';
import { AgentService } from '../agent.service';

jest.mock('src/agent/implementations/react.agent');

describe('AgentService', () => {
  let service: AgentService;
  let mockReactAgent: jest.Mocked<ReactAgent>;
  let mockRedisService: jest.Mocked<RedisService>;

  const messageDto = {
    threadId: 'threadId-12345678',
    content: [
      {
        type: 'text',
        text: 'Can you summarize in two paragraphs the history of Cameroon?',
      } as MessageContentDto,
    ],
    type: 'human' as const,
  };
  const sseMessageDto = {
    threadId: 'threadId-12345678',
    content: 'Can you summarize in two paragraphs the history of Cameroon?',
    type: 'human' as const,
  };
  beforeEach(async () => {
    mockReactAgent = {
      chat: jest.fn(),
      stream: jest.fn(),
      getHistory: jest.fn(),
    } as unknown as jest.Mocked<ReactAgent>;

    (ReactAgent as jest.Mock).mockImplementation(() => mockReactAgent);

    mockRedisService = {
      subscribe: jest.fn().mockReturnValue(
        of(
          JSON.stringify({
            data: { id: 'test-id', type: 'ai', content: 'Test chunk' },
            type: 'message',
          }),
          JSON.stringify({ data: { id: 'done', content: '' }, type: 'done' }),
        ),
      ),
      publish: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: AgentService,
          useFactory: () => new AgentService(mockReactAgent, mockRedisService),
        },
        {
          provide: ReactAgent,
          useValue: mockReactAgent,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  describe('chat', () => {
    it('should successfully return chat response', async () => {
      const mockResponse = new AIMessage({
        content: 'Test response',
        id: 'response-id',
      });
      mockReactAgent.chat.mockResolvedValue(mockResponse);

      const result = await service.chat(messageDto);

      expect(result).toStrictEqual({
        content: mockResponse.content,
        id: mockResponse.id,
        type: 'ai',
      });
      expect(mockReactAgent.chat).toHaveBeenCalledWith(
        {
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: (messageDto.content[0] as TextContentDto).text,
            }),
          ]),
        },
        expect.objectContaining({
          configurable: { thread_id: messageDto.threadId },
        }),
      );
    });

    it('should throw BadRequestException on error', async () => {
      const error = new Error('Test error');
      mockReactAgent.chat.mockRejectedValue(error);

      await expect(service.chat(messageDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('stream', () => {
    it('should successfully stream messages', async () => {
      const mockChunk = new AIMessageChunk({
        content: 'Test chunk',
        id: 'test-id',
      });

      mockReactAgent.stream.mockImplementation((_input, _chatOptions) => {
        return Promise.resolve(createMockAsyncIterableStream([mockChunk]) as AsyncIterable<unknown>);
      });

      const observable = await service.stream(sseMessageDto);
      const results: unknown[] = [];

      const subscription = observable.subscribe({
        next: (value) => results.push(value),
        error: (err) => {
          throw err;
        },
      });
      // Collect all emitted values from the observable
      const emitted = await firstValueFrom(observable.pipe(toArray()));

      expect(emitted).toEqual([
        {
          data: {
            id: 'test-id',
            type: 'ai',
            content: 'Test chunk',
          },
          type: 'message',
        },
        {
          data: { id: 'done', content: '' },
          type: 'done',
        },
      ]);
      subscription.unsubscribe();
    });

    it('should handle stream errors', async () => {
      // Simulate Redis emitting an error message
      mockRedisService.subscribe.mockReturnValueOnce(of(JSON.stringify({ type: 'error', data: { message: 'Stream error' } })));

      const observable = await service.stream(sseMessageDto);
      const emitted = await firstValueFrom(observable);

      expect(emitted).toEqual({
        type: 'error',
        data: { message: 'Stream error' },
      });
    });
  });

  describe('getHistory', () => {
    it('should successfully return message history', async () => {
      const mockHistory = [new AIMessage({ content: 'AI response', id: 'ai-1' }), new HumanMessage({ content: 'Human message', id: 'human-1' })];

      mockReactAgent.getHistory.mockResolvedValue(mockHistory);

      const result = await service.getHistory('test-thread-id');

      expect(result).toEqual([
        { type: 'ai', content: 'AI response', id: 'ai-1' },
        { type: 'human', content: 'Human message', id: 'human-1' },
      ]);
      expect(mockReactAgent.getHistory).toHaveBeenCalledWith('test-thread-id');
    });

    it('should throw BadRequestException when fetching history fails', async () => {
      const error = new Error('History fetch error');
      mockReactAgent.getHistory.mockRejectedValue(error);

      await expect(service.getHistory('test-thread-id')).rejects.toThrow(BadRequestException);
      expect(mockReactAgent.getHistory).toHaveBeenCalledWith('test-thread-id');
    });
  });
});

// Utility function to create a minimal async iterable stream mock
function createMockAsyncIterableStream<T>(chunks: T[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield [chunk];
      }
    },
    reader: {},
    ensureReader: () => {},
    [Symbol.asyncDispose]: () => {},
    locked: false,
    cancel: () => Promise.resolve(),
    getIterator: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
    pipeTo: () => Promise.resolve(),
    pipeThrough: () => ({}),
  } as unknown as AsyncIterable<T[]>;
}
