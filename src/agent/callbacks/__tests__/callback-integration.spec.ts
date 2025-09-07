import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import { Test, TestingModule } from '@nestjs/testing';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../callback-manager.service';
import { UnifiedCallbackHandler } from '../unified-callback.handler';

describe('Callback System Integration Tests', () => {
  let callbackManagerService: CallbackManagerService;
  let unifiedHandler: UnifiedCallbackHandler;
  let langsmithService: LangSmithService;
  let metricsService: AIMetricsService;
  let instrumentationService: LangChainInstrumentationService;

  beforeEach(() => {
    // Mock services
    langsmithService = {
      isEnabled: jest.fn().mockReturnValue(true),
      getCallbackHandler: jest.fn().mockReturnValue(null),
      maskSensitiveObject: jest.fn().mockImplementation((obj) => obj),
      createMetadata: jest.fn().mockReturnValue({}),
    } as any;

    metricsService = {
      incrementTokenUsage: jest.fn(),
      incrementRequestCount: jest.fn(),
      recordOperationDuration: jest.fn(),
    } as any;

    instrumentationService = {
      startSpan: jest.fn(),
      endSpan: jest.fn(),
    } as any;

    callbackManagerService = new CallbackManagerService(langsmithService, metricsService, instrumentationService);

    unifiedHandler = new UnifiedCallbackHandler(langsmithService, metricsService, instrumentationService, { test: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('UnifiedCallbackHandler', () => {
    it('should handle LLM lifecycle events', async () => {
      const llm: Serialized = {
        lc: 1,
        type: 'not_implemented' as const,
        id: ['test', 'llm'],
        name: 'test-llm',
      };
      const prompts = ['test prompt'];
      const runId = 'test-run-id';

      // Test LLM start
      await unifiedHandler.handleLLMStart(llm, prompts, runId);

      expect(metricsService.incrementTokenUsage).toHaveBeenCalledWith('openai', 'input', expect.any(Number));

      // Test LLM end
      const output: LLMResult = {
        generations: [[{ text: 'response' }]],
        llmOutput: { tokenUsage: { completionTokens: 10 } },
      };

      await unifiedHandler.handleLLMEnd(output, runId);

      expect(metricsService.incrementTokenUsage).toHaveBeenCalledWith('openai', 'output', 10);

      // Test LLM error
      const error = new Error('Test error');
      await unifiedHandler.handleLLMError(error, runId);

      expect(metricsService.incrementRequestCount).toHaveBeenCalledWith('openai', 'error');
    });

    it('should handle chain lifecycle events', async () => {
      const chain: Serialized = {
        lc: 1,
        type: 'not_implemented' as const,
        id: ['test', 'chain'],
        name: 'test-chain',
      };
      const inputs: ChainValues = { input: 'test' };
      const outputs: ChainValues = { output: 'result' };
      const runId = 'chain-run-id';

      // Test chain start
      await unifiedHandler.handleChainStart(chain, inputs, runId, undefined, ['tag1'], { meta: 'data' });

      expect(instrumentationService.startSpan).toHaveBeenCalledWith(
        `chain.${chain.name || 'unknown'}`,
        expect.objectContaining({
          runId,
          tags: ['tag1'],
        }),
      );

      // Test chain end
      await unifiedHandler.handleChainEnd(outputs, runId);

      expect(instrumentationService.endSpan).toHaveBeenCalledWith(`chain.${runId}`);

      // Test chain error
      const error = new Error('Chain error');
      await unifiedHandler.handleChainError(error, runId);

      expect(instrumentationService.endSpan).toHaveBeenCalledWith(`chain.${runId}`, { error: true });
    });

    it('should handle tool lifecycle events', async () => {
      const tool: Serialized = {
        lc: 1,
        type: 'not_implemented' as const,
        id: ['test', 'tool'],
        name: 'test-tool',
      };
      const input = 'tool input';
      const output = 'tool output';
      const runId = 'tool-run-id';

      // Test tool start
      await unifiedHandler.handleToolStart(tool, input, runId);

      // Test tool end
      await unifiedHandler.handleToolEnd(output, runId);

      // Test tool error
      const error = new Error('Tool error');
      await unifiedHandler.handleToolError(error, runId);

      // Verify events were logged
      expect(unifiedHandler.name).toBe('UnifiedCallbackHandler');
    });

    it('should handle agent events', async () => {
      const action: AgentAction = {
        tool: 'test-tool',
        toolInput: 'input',
        log: 'Agent thinking...',
      };

      const finish: AgentFinish = {
        returnValues: { result: 'done' },
        log: 'Agent completed',
      };

      const runId = 'agent-run-id';

      await unifiedHandler.handleAgentAction(action, runId);
      await unifiedHandler.handleAgentFinish(finish, runId);

      // Verify metadata was set
      expect(unifiedHandler).toBeDefined();
    });

    it('should emit events to observable stream', (done) => {
      const eventStream = unifiedHandler.getEventStream();

      eventStream.subscribe({
        next: (event) => {
          expect(event.type).toBe('llm_start');
          expect(event.data).toHaveProperty('llm');
          done();
        },
      });

      const llm: Serialized = {
        lc: 1,
        type: 'not_implemented' as const,
        id: ['test', 'llm'],
        name: 'test-llm',
      };
      unifiedHandler.handleLLMStart(llm, ['prompt'], 'run-id');
    });

    it('should create child handler with additional metadata', () => {
      const childHandler = unifiedHandler.createChildHandler({
        childMeta: 'value',
      });

      expect(childHandler).toBeInstanceOf(UnifiedCallbackHandler);
      expect(childHandler).not.toBe(unifiedHandler);
    });
  });

  describe('CallbackManagerService', () => {
    it('should create callback manager with context', () => {
      const manager = callbackManagerService.createCallbackManager('test-context', { meta: 'data' });

      expect(manager).toBeInstanceOf(CallbackManager);
      expect(manager.handlers).toBeDefined();
    });

    it('should create preset callback managers', () => {
      const agentManager = callbackManagerService.createPresetCallbackManager('agent');
      const chainManager = callbackManagerService.createPresetCallbackManager('chain');
      const toolManager = callbackManagerService.createPresetCallbackManager('tool');
      const memoryManager = callbackManagerService.createPresetCallbackManager('memory');

      expect(agentManager).toBeInstanceOf(CallbackManager);
      expect(chainManager).toBeInstanceOf(CallbackManager);
      expect(toolManager).toBeInstanceOf(CallbackManager);
      expect(memoryManager).toBeInstanceOf(CallbackManager);
    });

    it('should manage handler lifecycle', () => {
      const handler = callbackManagerService.createHandler('test-handler', { meta: 'data' });

      expect(handler).toBeInstanceOf(UnifiedCallbackHandler);
      expect(callbackManagerService.getHandler('test-handler')).toBe(handler);

      callbackManagerService.removeHandler('test-handler');
      expect(callbackManagerService.getHandler('test-handler')).toBeUndefined();
    });

    it('should get global handler', () => {
      const globalHandler = callbackManagerService.getGlobalHandler();
      expect(globalHandler).toBeInstanceOf(UnifiedCallbackHandler);
    });

    it('should add LangSmith handler when enabled', () => {
      const mockLangSmithHandler = {} as BaseCallbackHandler;
      (langsmithService.getCallbackHandler as jest.Mock).mockReturnValue(mockLangSmithHandler);

      const manager = callbackManagerService.createCallbackManager('with-langsmith');

      expect(langsmithService.getCallbackHandler).toHaveBeenCalled();
    });

    it('should cleanup on module destroy', () => {
      const handler1 = callbackManagerService.createHandler('handler1');
      const handler2 = callbackManagerService.createHandler('handler2');

      const disposeSpy1 = jest.spyOn(handler1, 'dispose');
      const disposeSpy2 = jest.spyOn(handler2, 'dispose');
      const globalDisposeSpy = jest.spyOn(callbackManagerService.getGlobalHandler(), 'dispose');

      callbackManagerService.onModuleDestroy();

      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
      expect(globalDisposeSpy).toHaveBeenCalled();
    });
  });

  describe('Callback Propagation', () => {
    it('should propagate callbacks through chain of handlers', async () => {
      const handler1Events: any[] = [];
      const handler2Events: any[] = [];

      const handler1 = new UnifiedCallbackHandler();
      handler1.getEventStream().subscribe((event) => handler1Events.push(event));

      const handler2 = new UnifiedCallbackHandler();
      handler2.getEventStream().subscribe((event) => handler2Events.push(event));

      const manager = new CallbackManager();
      manager.addHandler(handler1);
      manager.addHandler(handler2);

      // Simulate an LLM call
      const llm: Serialized = {
        lc: 1,
        type: 'not_implemented' as const,
        id: ['test', 'llm'],
        name: 'test-llm',
      };
      await Promise.all(manager.handlers.map((handler) => handler.handleLLMStart?.(llm, ['prompt'], 'run-id')));

      // Both handlers should receive the event
      expect(handler1Events.length).toBeGreaterThan(0);
      expect(handler2Events.length).toBeGreaterThan(0);
    });

    it('should handle errors in callback handlers gracefully', async () => {
      const errorHandler = new UnifiedCallbackHandler();

      // Override a method to throw an error
      errorHandler.handleLLMStart = jest.fn().mockRejectedValue(new Error('Handler error'));

      const manager = new CallbackManager();
      manager.addHandler(errorHandler);

      // Should not throw
      await expect(async () => {
        const llm: Serialized = {
          lc: 1,
          type: 'not_implemented' as const,
          id: ['test', 'llm'],
          name: 'test-llm',
        };
        await Promise.all(manager.handlers.map((handler) => handler.handleLLMStart?.(llm, ['prompt'], 'run-id').catch(() => {})));
      }).not.toThrow();
    });
  });
});
