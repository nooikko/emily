import { CallbackManagerForChainRun } from '@langchain/core/callbacks/manager';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BasePromptTemplate } from '@langchain/core/prompts';
import type { ChainValues } from '@langchain/core/utils/types';
import { Injectable, Logger } from '@nestjs/common';
import { AsyncIteratorCallbackHandler } from '../callbacks/async-iterator-callback.handler';
import type { StreamingToken } from '../callbacks/streaming-callback.handler';
import { StreamingCallbackHandler } from '../callbacks/streaming-callback.handler';

export interface StreamingChainConfig {
  streamingEnabled?: boolean;
  partialResultHandling?: boolean;
  bufferSize?: number;
  flushInterval?: number;
  enableCaching?: boolean;
  cacheSize?: number;
  parallelProcessing?: boolean;
  maxConcurrent?: number;
}

export interface PartialResult {
  content: string;
  isComplete: boolean;
  tokenCount: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * StreamingLLMChain with optimizations for low-latency streaming
 * Implements partial result handling and performance optimizations
 */
@Injectable()
export class StreamingLLMChain {
  private readonly logger = new Logger(StreamingLLMChain.name);
  private readonly partialResults = new Map<string, PartialResult[]>();
  private readonly cache = new Map<string, any>();
  private tokenBuffer: StreamingToken[] = [];

  private llm: BaseLanguageModel;
  private prompt: BasePromptTemplate;
  private outputKey: string;
  private outputParser?: any;

  constructor(
    fields: {
      llm: BaseLanguageModel;
      prompt: BasePromptTemplate;
      outputKey?: string;
      outputParser?: any;
    },
    private readonly config: StreamingChainConfig = {},
  ) {
    this.llm = fields.llm;
    this.prompt = fields.prompt;
    this.outputKey = fields.outputKey || 'text';
    this.outputParser = fields.outputParser;
  }

  get inputKeys(): string[] {
    return this.prompt.inputVariables;
  }

  get outputKeys(): string[] {
    return [this.outputKey];
  }

  /**
   * Stream tokens with optimized buffering
   */
  async *streamTokens(values: ChainValues, runManager?: CallbackManagerForChainRun): AsyncGenerator<StreamingToken> {
    const streamingHandler = new StreamingCallbackHandler(`stream-${Date.now()}`, {
      bufferSize: this.config.bufferSize || 10,
      flushInterval: this.config.flushInterval || 100,
      onToken: async (token) => {
        this.tokenBuffer.push(token);
      },
    });

    // Add streaming handler to callbacks
    const callbacks = runManager?.getChild() ?? undefined;
    if (callbacks) {
      callbacks.addHandler(streamingHandler);
    }

    try {
      // Start the chain
      const chainPromise = this._call(values, runManager);

      // Yield tokens as they arrive
      const iterator = streamingHandler.getTokenIterator();
      for await (const token of iterator) {
        yield token;
      }

      // Wait for chain completion
      await chainPromise;
    } finally {
      streamingHandler.dispose();
    }
  }

  /**
   * Stream with partial results
   */
  async *streamPartialResults(values: ChainValues, runManager?: CallbackManagerForChainRun): AsyncGenerator<PartialResult> {
    if (!this.config.partialResultHandling) {
      throw new Error('Partial result handling not enabled');
    }

    const runId = `run-${Date.now()}`;
    const partials: PartialResult[] = [];
    let tokenCount = 0;
    let accumulatedContent = '';

    const asyncIteratorHandler = new AsyncIteratorCallbackHandler({
      includeMetadata: true,
      filterTypes: ['token', 'complete'],
    });

    // Add handler to callbacks
    const callbacks = runManager?.getChild() ?? undefined;
    if (callbacks) {
      callbacks.addHandler(asyncIteratorHandler);
    }

    try {
      // Start the chain
      const chainPromise = this._call(values, runManager);

      // Process events as they arrive
      for await (const event of asyncIteratorHandler) {
        if (event.type === 'token') {
          tokenCount++;
          accumulatedContent += event.content;

          const partial: PartialResult = {
            content: accumulatedContent,
            isComplete: false,
            tokenCount,
            timestamp: Date.now(),
            metadata: event.metadata,
          };

          partials.push(partial);
          this.partialResults.set(runId, partials);

          yield partial;
        } else if (event.type === 'complete') {
          const finalPartial: PartialResult = {
            content: accumulatedContent,
            isComplete: true,
            tokenCount,
            timestamp: Date.now(),
            metadata: event.metadata,
          };

          partials.push(finalPartial);
          this.partialResults.set(runId, partials);

          yield finalPartial;
          break;
        }
      }

      // Wait for chain completion
      await chainPromise;
    } finally {
      asyncIteratorHandler.dispose();
      // Clean up partial results after a delay
      setTimeout(() => {
        this.partialResults.delete(runId);
      }, 60000); // Keep for 1 minute
    }
  }

  /**
   * Optimized call with caching
   */
  async _call(values: ChainValues, runManager?: CallbackManagerForChainRun): Promise<ChainValues> {
    // Check cache if enabled
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(values);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        this.logger.debug('Returning cached result');
        return cached;
      }
    }

    // Format prompt and call LLM
    const formatted = await this.prompt.format(values);
    const response = await this.llm.invoke(formatted, {
      callbacks: runManager?.getChild(),
    });

    // Parse response
    const text = typeof response === 'string' ? response : response.content?.toString() || '';
    const result = { [this.outputKey]: text };

    // Cache result if enabled
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(values);
      this.cache.set(cacheKey, result);

      // Limit cache size
      if (this.cache.size > (this.config.cacheSize || 100)) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
    }

    return result;
  }

  /**
   * Parallel streaming for multiple inputs
   */
  async *streamParallel(inputs: ChainValues[], runManager?: CallbackManagerForChainRun): AsyncGenerator<{ index: number; result: PartialResult }> {
    if (!this.config.parallelProcessing) {
      throw new Error('Parallel processing not enabled');
    }

    const maxConcurrent = this.config.maxConcurrent || 3;
    const activeStreams = new Map<number, AsyncGenerator<PartialResult>>();
    const results: { index: number; result: PartialResult }[] = [];

    // Start initial streams
    for (let i = 0; i < Math.min(maxConcurrent, inputs.length); i++) {
      activeStreams.set(i, this.streamPartialResults(inputs[i], runManager));
    }

    let nextIndex = maxConcurrent;
    const completed = new Set<number>();

    while (activeStreams.size > 0 || nextIndex < inputs.length) {
      // Race all active streams
      const promises = Array.from(activeStreams.entries()).map(async ([index, stream]) => {
        const result = await stream.next();
        return { index, result };
      });

      const { index, result } = await Promise.race(promises);

      if (result.done) {
        // Stream completed
        activeStreams.delete(index);
        completed.add(index);

        // Start next stream if available
        if (nextIndex < inputs.length) {
          activeStreams.set(nextIndex, this.streamPartialResults(inputs[nextIndex], runManager));
          nextIndex++;
        }
      } else {
        // Yield partial result
        yield { index, result: result.value };
      }
    }
  }

  /**
   * Optimize prompt with caching
   */
  async formatPrompt(values: ChainValues): Promise<string> {
    const cacheKey = `prompt-${JSON.stringify(values)}`;

    if (this.config.enableCaching) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const formatted = await this.prompt.format(values);

    if (this.config.enableCaching) {
      this.cache.set(cacheKey, formatted);
    }

    return formatted;
  }

  /**
   * Get partial results for a run
   */
  getPartialResults(runId: string): PartialResult[] | undefined {
    return this.partialResults.get(runId);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.partialResults.clear();
    this.tokenBuffer = [];
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    partialResultsSize: number;
    tokenBufferSize: number;
  } {
    return {
      cacheSize: this.cache.size,
      partialResultsSize: this.partialResults.size,
      tokenBufferSize: this.tokenBuffer.length,
    };
  }

  /**
   * Generate cache key for values
   */
  private getCacheKey(values: ChainValues): string {
    // Sort keys for consistent cache keys
    const sortedKeys = Object.keys(values).sort();
    const keyValues = sortedKeys.map((key) => `${key}:${values[key]}`);
    return keyValues.join('|');
  }

  /**
   * Create optimized streaming chain
   */
  static fromLLM(llm: BaseLanguageModel, prompt: BasePromptTemplate, config?: StreamingChainConfig): StreamingLLMChain {
    return new StreamingLLMChain(
      {
        llm,
        prompt,
      },
      config,
    );
  }
}
