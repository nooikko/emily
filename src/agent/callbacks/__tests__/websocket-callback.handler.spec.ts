import { AgentAction, AgentFinish } from '@langchain/core/agents';
import { Test, TestingModule } from '@nestjs/testing';
import WebSocket from 'ws';
import { WebSocketCallbackHandler } from '../websocket-callback.handler';

// Mock WebSocket
jest.mock('ws');

describe('WebSocketCallbackHandler', () => {
  let handler: WebSocketCallbackHandler;
  let mockWs: Partial<WebSocket> & {
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
    once: jest.Mock;
    removeAllListeners: jest.Mock;
    ping: jest.Mock;
    pong: jest.Mock;
  };

  beforeEach(() => {
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
      ping: jest.fn(),
      pong: jest.fn(),
    };

    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWs);

    handler = new WebSocketCallbackHandler({
      url: 'ws://localhost:8080',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 5000,
      bufferMessages: true,
    });
  });

  afterEach(() => {
    handler.dispose();
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect to WebSocket server', async () => {
      // Simulate connection
      const connectPromise = handler.connect('ws://test.com');

      // Trigger open event
      const openCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'open')?.[1] as Function;
      openCallback();

      await connectPromise;

      expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle disconnection', () => {
      handler.disconnect();

      expect(mockWs.removeAllListeners).toHaveBeenCalled();
      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    });

    it('should report connection status', () => {
      expect(handler.isConnected).toBe(true);

      mockWs.readyState = WebSocket.CLOSED;
      expect(handler.isConnected).toBe(false);
    });

    it('should generate unique session ID', () => {
      const sessionId = handler.getSessionId();

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^ws-\d+-[a-z0-9]+$/);
    });
  });

  describe('Message Handling', () => {
    it('should send LLM token messages', async () => {
      await handler.handleLLMNewToken('test token', 0, 'run-1');

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"token"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"token":"test token"'));
    });

    it('should send chain start messages', async () => {
      await handler.handleChainStart({ name: 'test-chain', lc: 1, type: 'not_implemented', id: ['test'] } as const, { input: 'test' }, 'run-1');

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"chain"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"action":"start"'));
    });

    it('should send error messages', async () => {
      const error = new Error('Test error');
      await handler.handleLLMError(error, 'run-1');

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"error":"Test error"'));
    });

    it('should include sequence numbers', async () => {
      await handler.handleLLMNewToken('token1', 0, 'run-1');
      await handler.handleLLMNewToken('token2', 1, 'run-1');

      const calls = mockWs.send.mock.calls;
      expect(calls[0][0]).toContain('"sequenceNumber":0');
      expect(calls[1][0]).toContain('"sequenceNumber":1');
    });
  });

  describe('Message Buffering', () => {
    it('should buffer messages when disconnected', async () => {
      mockWs.readyState = WebSocket.CONNECTING;

      await handler.handleLLMNewToken('buffered', 0, 'run-1');

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should flush buffer on reconnect', async () => {
      mockWs.readyState = WebSocket.CONNECTING;

      // Buffer some messages
      await handler.handleLLMNewToken('msg1', 0, 'run-1');
      await handler.handleLLMNewToken('msg2', 1, 'run-1');

      // Simulate reconnection
      mockWs.readyState = WebSocket.OPEN;
      const openCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'open')?.[1] as Function;
      openCallback();

      // Buffer should be flushed
      expect(mockWs.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Handling', () => {
    it('should emit connection events', (done) => {
      handler.on('connected', () => {
        done();
      });

      const openCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'open')?.[1] as Function;
      openCallback();
    });

    it('should emit disconnection events', (done) => {
      handler.on('disconnected', (data) => {
        expect(data.code).toBe(1000);
        done();
      });

      const closeCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'close')?.[1] as Function;
      closeCallback(1000, Buffer.from('Normal closure'));
    });

    it('should handle incoming messages', () => {
      const messageHandler = jest.fn();
      handler.on('message_received', messageHandler);

      const messageCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'message')?.[1] as Function;
      messageCallback(JSON.stringify({ type: 'test', data: 'hello' }));

      expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({ type: 'test', data: 'hello' }));
    });
  });

  describe('Heartbeat', () => {
    it('should send ping messages', () => {
      jest.useFakeTimers();

      const openCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'open')?.[1] as Function;
      openCallback();

      jest.advanceTimersByTime(5000);

      expect(mockWs.ping).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle pong responses', () => {
      const pongHandler = jest.fn();
      handler.on('pong', pongHandler);

      const pongCallback = mockWs.on.mock.calls.find((call: [string, Function]) => call[0] === 'pong')?.[1] as Function;
      pongCallback();

      expect(pongHandler).toHaveBeenCalled();
    });
  });

  describe('Agent and Tool Callbacks', () => {
    it('should handle agent actions', async () => {
      await handler.handleAgentAction(
        {
          tool: 'calculator',
          toolInput: { a: 1, b: 2 },
          log: 'Calculating...',
        } as AgentAction,
        'run-1',
      );

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"agent"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"action":"tool_use"'));
    });

    it('should handle agent finish', async () => {
      await handler.handleAgentFinish(
        {
          returnValues: { result: 'done' },
          log: 'Finished',
        } as AgentFinish,
        'run-1',
      );

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"action":"finish"'));
    });

    it('should handle tool execution', async () => {
      await handler.handleToolStart({ name: 'calculator' } as any, 'input', 'run-1');

      await handler.handleToolEnd('output', 'run-1');

      expect(mockWs.send).toHaveBeenCalledTimes(2);
      expect(mockWs.send).toHaveBeenNthCalledWith(1, expect.stringContaining('"action":"start"'));
      expect(mockWs.send).toHaveBeenNthCalledWith(2, expect.stringContaining('"action":"end"'));
    });
  });
});
