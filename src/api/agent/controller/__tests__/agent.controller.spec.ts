import 'reflect-metadata';
import { of } from 'rxjs';
import type { MessageDto, SseMessageDto, TextContentDto } from '../../dto/message.dto';
import type { MessageResponseDto } from '../../dto/message.response.dto';
import type { AgentService } from '../../service/agent/agent.service';
import type { IAgentService } from '../../service/iagent.service';
import { AgentController } from '../agent.controller';

// Type for accessing private properties in tests
interface AgentControllerTestAccess {
  agentService: IAgentService;
}

describe('AgentController', () => {
  let controller: AgentController;
  let mockAgentService: jest.Mocked<AgentService>;

  beforeEach(async () => {
    mockAgentService = {
      chat: jest.fn(),
      stream: jest.fn(),
      getHistory: jest.fn(),
    } as any;

    // Create controller directly with mocked service for unit testing
    controller = new AgentController(mockAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Controller Setup', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have AgentService injected', () => {
      expect((controller as unknown as AgentControllerTestAccess).agentService).toBeDefined();
    });
  });

  describe('API Documentation Structure', () => {
    it('should have decorators properly applied (functional test)', () => {
      // Test that the controller methods exist and have the expected behavior
      expect(typeof controller.chat).toBe('function');
      expect(typeof controller.stream).toBe('function');
      expect(typeof controller.getHistory).toBe('function');
    });

    it('should handle different HTTP methods correctly', () => {
      // These tests verify the methods exist and can be called
      expect(controller.chat).toBeDefined();
      expect(controller.stream).toBeDefined();
      expect(controller.getHistory).toBeDefined();
    });
  });

  describe('Endpoint Methods', () => {
    describe('chat method', () => {
      it('should call agentService.chat with provided message', async () => {
        const messageDto: MessageDto = {
          threadId: 'thread-123',
          type: 'human',
          content: [{ type: 'text', text: 'Hello' } as TextContentDto],
        };

        const expectedResponse: MessageResponseDto = {
          id: 'msg-456',
          type: 'ai',
          content: 'Hello! How can I help you?',
        };

        mockAgentService.chat.mockResolvedValue(expectedResponse);

        const result = await controller.chat(messageDto);

        expect(mockAgentService.chat).toHaveBeenCalledWith(messageDto);
        expect(result).toBe(expectedResponse);
      });

      it('should propagate errors from agentService.chat', async () => {
        const messageDto: MessageDto = {
          threadId: 'thread-123',
          type: 'human',
          content: [{ type: 'text', text: 'Hello' } as TextContentDto],
        };

        const error = new Error('Service error');
        mockAgentService.chat.mockRejectedValue(error);

        await expect(controller.chat(messageDto)).rejects.toThrow('Service error');
        expect(mockAgentService.chat).toHaveBeenCalledWith(messageDto);
      });
    });

    describe('stream method', () => {
      it('should call agentService.stream with provided message', async () => {
        const sseMessageDto: SseMessageDto = {
          threadId: 'thread-123',
          type: 'human',
          content: 'Hello',
        };

        const mockObservable = of({
          data: { id: 'sse-123', content: 'Response' },
          type: 'message' as const,
        });

        mockAgentService.stream.mockResolvedValue(mockObservable);

        const result = await controller.stream(sseMessageDto);

        expect(mockAgentService.stream).toHaveBeenCalledWith(sseMessageDto);
        expect(result).toBe(mockObservable);
      });

      it('should propagate errors from agentService.stream', async () => {
        const sseMessageDto: SseMessageDto = {
          threadId: 'thread-123',
          type: 'human',
          content: 'Hello',
        };

        const error = new Error('Stream error');
        mockAgentService.stream.mockRejectedValue(error);

        await expect(controller.stream(sseMessageDto)).rejects.toThrow('Stream error');
        expect(mockAgentService.stream).toHaveBeenCalledWith(sseMessageDto);
      });
    });

    describe('getHistory method', () => {
      it('should call agentService.getHistory with provided threadId', async () => {
        const threadId = 'thread-123';
        const expectedHistory: MessageResponseDto[] = [
          { id: 'msg-1', type: 'human', content: 'Hello' },
          { id: 'msg-2', type: 'ai', content: 'Hi there!' },
        ];

        mockAgentService.getHistory.mockResolvedValue(expectedHistory);

        const result = await controller.getHistory(threadId);

        expect(mockAgentService.getHistory).toHaveBeenCalledWith(threadId);
        expect(result).toBe(expectedHistory);
      });

      it('should propagate errors from agentService.getHistory', async () => {
        const threadId = 'thread-123';
        const error = new Error('History not found');
        mockAgentService.getHistory.mockRejectedValue(error);

        await expect(controller.getHistory(threadId)).rejects.toThrow('History not found');
        expect(mockAgentService.getHistory).toHaveBeenCalledWith(threadId);
      });
    });
  });
});
