import type { LLMResult } from '@langchain/core/outputs';
import { Test, TestingModule } from '@nestjs/testing';
import { StreamingCallbackHandler, StreamingToken } from '../streaming-callback.handler';

describe('StreamingCallbackHandler', () => {
  let handler: StreamingCallbackHandler;

  beforeEach(() => {
    handler = new StreamingCallbackHandler('test-stream', {
      bufferSize: 5,
      flushInterval: 100,
      enableMetrics: true,
    });
  });

  afterEach(() => {
    handler.dispose();
  });

  describe('Token Streaming', () => {
    it('should handle new tokens', async () => {
      const tokens: StreamingToken[] = [];

      handler = new StreamingCallbackHandler('test', {
        onToken: async (token) => {
          tokens.push(token);
        },
      });

      await handler.handleLLMNewToken('Hello', 0, 'run-1');
      await handler.handleLLMNewToken(' world', 1, 'run-1');

      expect(tokens).toHaveLength(2);
      expect(tokens[0].content).toBe('Hello');
      expect(tokens[1].content).toBe(' world');
      expect(tokens[0].index).toBe(0);
      expect(tokens[1].index).toBe(1);
    });

    it('should buffer tokens correctly', async () => {
      const chunks: any[] = [];

      handler.subscribe('chunk', (event) => {
        chunks.push(event.data);
      });

      // Fill buffer
      for (let i = 0; i < 5; i++) {
        await handler.handleLLMNewToken(`token${i}`, i, 'run-1');
      }

      // Should trigger flush
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].count).toBe(5);
    });

    it('should handle completion', async () => {
      const completedTokens: StreamingToken[] = [];

      handler = new StreamingCallbackHandler('test', {
        onComplete: async (tokens) => {
          completedTokens.push(...tokens);
        },
      });

      await handler.handleLLMNewToken('test', 0, 'run-1');
      await handler.handleLLMEnd({ generations: [[{ text: 'test' }]], llmOutput: {} }, 'run-1');

      expect(completedTokens).toHaveLength(1);
      expect(completedTokens[0].content).toBe('test');
    });
  });

  describe('Event Streaming', () => {
    it('should emit streaming events', async () => {
      const events: any[] = [];

      handler.subscribe('token', (event) => {
        events.push(event);
      });

      await handler.handleLLMNewToken('test', 0, 'run-1');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('token');
      expect(events[0].data.content).toBe('test');
    });

    it('should emit start and end events', async () => {
      const events: any[] = [];

      handler.subscribe('start', (event) => events.push(event));
      handler.subscribe('end', (event) => events.push(event));

      await handler.handleLLMStart({ name: 'test-llm' } as any, ['prompt'], 'run-1');

      await handler.handleLLMEnd({ generations: [[{ text: 'response' }]], llmOutput: {} }, 'run-1');

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('end');
    });

    it('should handle errors', async () => {
      const errors: any[] = [];
      let errorHandlerCalled = false;

      handler = new StreamingCallbackHandler('test', {
        onError: (error) => {
          errorHandlerCalled = true;
        },
      });

      handler.subscribe('error', (event) => {
        errors.push(event);
      });

      const testError = new Error('Test error');
      await handler.handleLLMError(testError, 'run-1');

      expect(errors).toHaveLength(1);
      expect(errors[0].data.error).toBe('Test error');
      expect(errorHandlerCalled).toBe(true);
    });
  });

  describe('Async Iterator', () => {
    it('should provide async iterator for tokens', async () => {
      const tokens: StreamingToken[] = [];

      // Start consuming tokens
      const iteratorPromise = (async () => {
        for await (const token of handler.getTokenIterator()) {
          tokens.push(token);
          if (tokens.length >= 3) break;
        }
      })();

      // Generate tokens
      await handler.handleLLMNewToken('one', 0, 'test-stream');
      await handler.handleLLMNewToken('two', 1, 'test-stream');
      await handler.handleLLMNewToken('three', 2, 'test-stream');

      // Wait for iterator
      await iteratorPromise;

      expect(tokens).toHaveLength(3);
      expect(tokens.map((t) => t.content)).toEqual(['one', 'two', 'three']);
    });
  });

  describe('Metrics', () => {
    it('should emit metadata events when metrics enabled', async () => {
      const metadataEvents: any[] = [];

      handler.subscribe('metadata', (event) => {
        metadataEvents.push(event);
      });

      await handler.handleLLMNewToken('test', 0, 'run-1');

      expect(metadataEvents.length).toBeGreaterThan(0);
      expect(metadataEvents[0].data).toHaveProperty('bufferSize');
      expect(metadataEvents[0].data).toHaveProperty('totalStreams');
    });
  });

  describe('Auto Flush', () => {
    it('should auto-flush buffer on interval', async () => {
      const chunks: any[] = [];

      handler = new StreamingCallbackHandler('test', {
        bufferSize: 10,
        flushInterval: 50,
      });

      handler.subscribe('chunk', (event) => {
        chunks.push(event);
      });

      await handler.handleLLMNewToken('test', 0, 'run-1');

      // Wait for auto-flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
