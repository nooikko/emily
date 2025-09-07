import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, of } from 'rxjs';
import { AgentController } from '../controller/agent.controller';
import { MessageContentDto, MessageDto, SseMessageDto } from '../dto/message.dto';
import { MessageResponseDto } from '../dto/message.response.dto';
import { SseMessage } from '../dto/sse.dto';
import { AgentService } from '../service/agent/agent.service';

// Mock the logger to avoid actual logging during tests
jest.mock('../../../observability/services/structured-logger.service', () => {
  return {
    StructuredLoggerService: jest.fn().mockImplementation(() => ({
      logInfo: jest.fn(),
      logError: jest.fn(),
      logWarn: jest.fn(),
      logDebug: jest.fn(),
      error: jest.fn(),
    })),
  };
});

describe('AgentController', () => {
  let controller: AgentController;
  let agentService: jest.Mocked<AgentService>;

  const mockAgentService = {
    chat: jest.fn(),
    stream: jest.fn(),
    getHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: mockAgentService,
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    agentService = module.get(AgentService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('chat', () => {
    const validMessageDto: MessageDto = {
      threadId: 'thread-123e4567-e89b-12d3-a456-426614174000',
      type: 'human',
      content: [
        {
          type: 'text',
          text: 'Hello, how can you help me today?',
        } as MessageContentDto,
      ],
    };

    const mockResponseDto: MessageResponseDto = {
      id: 'msg-123e4567-e89b-12d3-a456-426614174000',
      threadId: 'thread-123e4567-e89b-12d3-a456-426614174000',
      type: 'ai',
      content: 'Hello! I can help you with various tasks.',
      timestamp: '2024-01-01T12:00:00.000Z',
    };

    describe('successful requests', () => {
      beforeEach(() => {
        mockAgentService.chat.mockResolvedValue(mockResponseDto);
      });

      it('should process chat message successfully', async () => {
        const result = await controller.chat(validMessageDto);

        expect(result).toEqual(mockResponseDto);
        expect(mockAgentService.chat).toHaveBeenCalledWith(validMessageDto);
        expect(mockAgentService.chat).toHaveBeenCalledTimes(1);
      });

      it('should handle basic text messages', async () => {
        const textMessage: MessageDto = {
          threadId: 'thread-456',
          type: 'human',
          content: [
            {
              type: 'text',
              text: 'Simple text message',
            } as MessageContentDto,
          ],
        };

        await controller.chat(textMessage);

        expect(mockAgentService.chat).toHaveBeenCalledWith(textMessage);
      });

      it('should handle image URL messages', async () => {
        const imageMessage: MessageDto = {
          threadId: 'thread-789',
          type: 'human',
          content: [
            {
              type: 'text',
              text: 'What do you see in this image?',
            } as MessageContentDto,
            {
              type: 'image_url',
              imageUrl: 'https://example.com/image.jpg',
            } as MessageContentDto,
          ],
        };

        await controller.chat(imageMessage);

        expect(mockAgentService.chat).toHaveBeenCalledWith(imageMessage);
      });
    });

    describe('error handling', () => {
      it('should propagate service errors', async () => {
        const serviceError = new Error('Agent service unavailable');
        mockAgentService.chat.mockRejectedValue(serviceError);

        await expect(controller.chat(validMessageDto)).rejects.toThrow('Agent service unavailable');
        expect(mockAgentService.chat).toHaveBeenCalledWith(validMessageDto);
      });

      it('should handle HTTP exceptions from service', async () => {
        const httpException = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
        mockAgentService.chat.mockRejectedValue(httpException);

        await expect(controller.chat(validMessageDto)).rejects.toThrow(HttpException);
      });
    });
  });

  describe('stream', () => {
    const validSseMessageDto: SseMessageDto = {
      threadId: 'thread-123e4567-e89b-12d3-a456-426614174000',
      type: 'human',
      content: 'Hello, stream me a response!',
    };

    const mockSseMessage: SseMessage = {
      type: 'message',
      data: {
        id: 'chunk-1',
        content: 'Hello! This is a streamed',
      },
    };

    describe('successful streaming', () => {
      beforeEach(() => {
        mockAgentService.stream.mockResolvedValue(of(mockSseMessage));
      });

      it('should establish SSE connection successfully', async () => {
        const result = await controller.stream(validSseMessageDto);

        expect(result).toBeInstanceOf(Observable);
        expect(mockAgentService.stream).toHaveBeenCalledWith(validSseMessageDto);
        expect(mockAgentService.stream).toHaveBeenCalledTimes(1);
      });

      it('should handle query parameters correctly', async () => {
        const queryMessage: SseMessageDto = {
          threadId: 'thread-streaming',
          type: 'human',
          content: 'Stream this message please',
        };

        await controller.stream(queryMessage);

        expect(mockAgentService.stream).toHaveBeenCalledWith(queryMessage);
      });
    });

    describe('error handling', () => {
      it('should propagate streaming errors', async () => {
        const streamingError = new Error('Streaming service unavailable');
        mockAgentService.stream.mockRejectedValue(streamingError);

        await expect(controller.stream(validSseMessageDto)).rejects.toThrow('Streaming service unavailable');
        expect(mockAgentService.stream).toHaveBeenCalledWith(validSseMessageDto);
      });
    });
  });

  describe('getHistory', () => {
    const validThreadId = 'thread-123e4567-e89b-12d3-a456-426614174000';

    const mockHistoryResponse: MessageResponseDto[] = [
      {
        id: 'msg-1',
        threadId: validThreadId,
        type: 'human',
        content: 'Hello',
        timestamp: '2024-01-01T12:00:00.000Z',
      },
      {
        id: 'msg-2',
        threadId: validThreadId,
        type: 'ai',
        content: 'Hello! How can I help?',
        timestamp: '2024-01-01T12:00:01.000Z',
      },
    ];

    describe('successful history retrieval', () => {
      beforeEach(() => {
        mockAgentService.getHistory.mockResolvedValue(mockHistoryResponse);
      });

      it('should retrieve conversation history successfully', async () => {
        const result = await controller.getHistory(validThreadId);

        expect(result).toEqual(mockHistoryResponse);
        expect(result).toHaveLength(2);
        expect(mockAgentService.getHistory).toHaveBeenCalledWith(validThreadId);
        expect(mockAgentService.getHistory).toHaveBeenCalledTimes(1);
      });

      it('should handle empty history', async () => {
        mockAgentService.getHistory.mockResolvedValue([]);

        const result = await controller.getHistory(validThreadId);

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
        expect(mockAgentService.getHistory).toHaveBeenCalledWith(validThreadId);
      });
    });

    describe('error handling', () => {
      it('should handle thread not found errors', async () => {
        const notFoundError = new HttpException('Thread not found', HttpStatus.NOT_FOUND);
        mockAgentService.getHistory.mockRejectedValue(notFoundError);

        await expect(controller.getHistory(validThreadId)).rejects.toThrow(HttpException);
        expect(mockAgentService.getHistory).toHaveBeenCalledWith(validThreadId);
      });
    });
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have AgentService injected', () => {
      expect(agentService).toBeDefined();
    });
  });

  describe('logging integration', () => {
    it('should have logger instance with required methods', () => {
      // Check that the controller has a logger property with expected methods
      expect(controller).toHaveProperty('logger');
      expect((controller as any).logger).toHaveProperty('logInfo');
      expect((controller as any).logger).toHaveProperty('logError');
      expect((controller as any).logger).toHaveProperty('logWarn');
      expect((controller as any).logger).toHaveProperty('logDebug');
    });
  });
});
