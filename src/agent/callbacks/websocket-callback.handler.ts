import { EventEmitter } from 'node:events';
import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';

export interface WebSocketMessage {
  type: 'token' | 'message' | 'tool' | 'agent' | 'chain' | 'error' | 'ping' | 'pong' | 'reconnect';
  data: unknown;
  timestamp: number;
  sessionId: string;
  sequenceNumber?: number;
}

export interface WebSocketConfig {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  enableCompression?: boolean;
  bufferMessages?: boolean;
  maxBufferSize?: number;
}

/**
 * WebSocketCallbackHandler for bi-directional streaming with auto-reconnect
 * Provides robust WebSocket communication with connection resilience
 */
@Injectable()
export class WebSocketCallbackHandler extends BaseCallbackHandler {
  name = 'WebSocketCallbackHandler';
  private readonly logger = new Logger(WebSocketCallbackHandler.name);
  private readonly emitter = new EventEmitter();

  private ws: WebSocket | null = null;
  private sessionId: string;
  private sequenceNumber = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageBuffer: WebSocketMessage[] = [];
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(private readonly config: WebSocketConfig = {}) {
    super();
    this.sessionId = this.generateSessionId();

    // Auto-connect if URL provided
    if (this.config.url) {
      this.connect(this.config.url);
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect(url?: string): Promise<void> {
    const wsUrl = url || this.config.url;
    if (!wsUrl) {
      throw new Error('WebSocket URL is required');
    }

    // Prevent duplicate connections
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.logger.debug('WebSocket already connected');
      return;
    }

    this.isConnecting = true;
    this.connectionPromise = this.establishConnection(wsUrl);

    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Connecting to WebSocket: ${url}`);

        const options: WebSocket.ClientOptions = {
          perMessageDeflate: this.config.enableCompression !== false,
        };

        this.ws = new WebSocket(url, options);

        this.ws.on('open', () => {
          this.logger.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageBuffer();
          this.emitter.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleIncomingMessage(message);
          } catch (error) {
            this.logger.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('error', (error: Error) => {
          this.logger.error('WebSocket error:', error);
          this.emitter.emit('error', error);
          reject(error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.logger.warn(`WebSocket closed: ${code} - ${reason.toString()}`);
          this.stopHeartbeat();
          this.emitter.emit('disconnected', { code, reason: reason.toString() });
          this.handleReconnect();
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });

        this.ws.on('pong', () => {
          this.emitter.emit('pong');
        });

        // Set connection timeout
        const timeout = setTimeout(() => {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
        timeout.unref(); // Allow process to exit if this is the only timer

        this.ws.once('open', () => {
          clearTimeout(timeout);
        });
      } catch (error) {
        this.logger.error('Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.logger.debug('Disconnecting WebSocket');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    this.emitter.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
  }

  /**
   * Send message through WebSocket
   */
  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.config.bufferMessages !== false) {
        this.bufferMessage(message);
      }
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      this.emitter.emit('message_sent', message);
    } catch (error) {
      this.logger.error('Failed to send WebSocket message:', error);
      if (this.config.bufferMessages !== false) {
        this.bufferMessage(message);
      }
    }
  }

  /**
   * Buffer message for later sending
   */
  private bufferMessage(message: WebSocketMessage): void {
    const maxSize = this.config.maxBufferSize || 1000;

    if (this.messageBuffer.length >= maxSize) {
      this.logger.warn(`Message buffer full (${maxSize}), dropping oldest message`);
      this.messageBuffer.shift();
    }

    this.messageBuffer.push(message);
  }

  /**
   * Flush message buffer
   */
  private flushMessageBuffer(): void {
    if (this.messageBuffer.length === 0) {
      return;
    }

    this.logger.debug(`Flushing ${this.messageBuffer.length} buffered messages`);

    while (this.messageBuffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageBuffer.shift()!;
      this.sendMessage(message);
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (!this.config.url) {
      return; // No auto-reconnect without URL
    }

    const maxAttempts = this.config.maxReconnectAttempts ?? 5;

    if (this.reconnectAttempts >= maxAttempts) {
      this.logger.error(`Max reconnection attempts (${maxAttempts}) reached`);
      this.emitter.emit('max_reconnect_reached');
      return;
    }

    const interval = this.config.reconnectInterval || 5000;
    const delay = Math.min(interval * 2 ** this.reconnectAttempts, 30000); // Exponential backoff

    this.reconnectAttempts++;
    this.logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.config.url).catch((error) => {
        this.logger.error('Reconnection failed:', error);
      });
    }, delay);

    this.emitter.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (!this.config.heartbeatInterval) {
      return;
    }

    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleIncomingMessage(message: WebSocketMessage): void {
    if (message.type === 'pong') {
      this.emitter.emit('pong');
      return;
    }

    this.emitter.emit('message_received', message);
    this.emitter.emit(message.type, message.data);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // LangChain callback implementations

  async handleLLMNewToken(token: string, idx: unknown, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'token',
      data: { token, idx, runId, parentRunId },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleLLMStart(llm: Serialized, prompts: string[], runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'message',
      data: {
        action: 'llm_start',
        llm: llm.name,
        promptCount: prompts.length,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'message',
      data: {
        action: 'llm_end',
        generationCount: output.generations.length,
        tokenUsage: output.llmOutput?.tokenUsage,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleLLMError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'error',
      data: {
        source: 'llm',
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleChainStart(chain: Serialized, inputs: ChainValues, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'chain',
      data: {
        action: 'start',
        chain: chain.name,
        inputKeys: Object.keys(inputs),
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleChainEnd(outputs: ChainValues, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'chain',
      data: {
        action: 'end',
        outputKeys: Object.keys(outputs),
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleChainError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'error',
      data: {
        source: 'chain',
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleToolStart(tool: Serialized, input: string, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'tool',
      data: {
        action: 'start',
        tool: tool.name,
        input,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleToolEnd(output: string, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'tool',
      data: {
        action: 'end',
        output,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleToolError(err: Error, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'error',
      data: {
        source: 'tool',
        error: err.message,
        stack: err.stack,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleAgentAction(action: AgentAction, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'agent',
      data: {
        action: 'tool_use',
        tool: action.tool,
        toolInput: action.toolInput,
        log: action.log,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  async handleAgentFinish(finish: AgentFinish, runId: string, parentRunId?: string): Promise<void> {
    this.sendMessage({
      type: 'agent',
      data: {
        action: 'finish',
        returnValues: finish.returnValues,
        log: finish.log,
        runId,
        parentRunId,
      },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  /**
   * Subscribe to WebSocket events
   */
  on(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Unsubscribe from WebSocket events
   */
  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disconnect();
    this.emitter.removeAllListeners();
    this.messageBuffer = [];
  }
}
