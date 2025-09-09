import type { BaseMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { bufferTime, filter, from, mergeMap, Observable, Subject } from 'rxjs';
import type { StreamChunk } from '../memory/types';

export interface StreamConfig {
  bufferSize?: number;
  bufferTimeMs?: number;
  enableBackpressure?: boolean;
  maxConcurrent?: number;
}

export interface EnhancedStreamChunk {
  content: string | Record<string, unknown> | Buffer;
  type?: string;
  timestamp: number;
  sequenceNumber: number;
  metadata?: Record<string, unknown>;
}

/**
 * Advanced async streaming handler with backpressure and buffering
 */
@Injectable()
export class AsyncStreamHandler {
  private readonly logger = new Logger(AsyncStreamHandler.name);
  private activeStreams: Map<string, Subject<EnhancedStreamChunk>> = new Map();
  private sequenceCounters: Map<string, number> = new Map();

  /**
   * Create an enhanced async generator with buffering and backpressure
   */
  async *createEnhancedStream<T>(source: AsyncIterable<T>, streamId: string, config: StreamConfig = {}): AsyncGenerator<EnhancedStreamChunk> {
    const { bufferSize = 10, bufferTimeMs = 100, enableBackpressure = true, maxConcurrent = 3 } = config;

    const subject = new Subject<EnhancedStreamChunk>();
    this.activeStreams.set(streamId, subject);
    this.sequenceCounters.set(streamId, 0);

    const buffer: EnhancedStreamChunk[] = [];
    let isBackpressured = false;

    try {
      for await (const chunk of source) {
        const sequenceNumber = this.incrementSequence(streamId);
        const transformed = this.transformToStreamChunk(chunk);
        const enhancedChunk: EnhancedStreamChunk = {
          content: this.extractContent(transformed),
          type: this.extractType(transformed),
          timestamp: Date.now(),
          sequenceNumber,
        };

        // Handle backpressure
        if (enableBackpressure && buffer.length >= bufferSize) {
          isBackpressured = true;
          this.logger.debug(`Stream ${streamId} backpressured at sequence ${sequenceNumber}`);

          // Wait for buffer to drain
          while (buffer.length >= bufferSize / 2) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          isBackpressured = false;
        }

        buffer.push(enhancedChunk);
        subject.next(enhancedChunk);

        // Yield buffered chunks
        if (buffer.length >= bufferSize || Date.now() - enhancedChunk.timestamp > bufferTimeMs) {
          while (buffer.length > 0) {
            yield buffer.shift()!;
          }
        }
      }

      // Yield remaining buffered chunks
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }
    } finally {
      subject.complete();
      this.activeStreams.delete(streamId);
      this.sequenceCounters.delete(streamId);
    }
  }

  /**
   * Create an RxJS observable from an async iterable with enhanced features
   */
  createObservableStream<T>(source: AsyncIterable<T>, streamId: string, config: StreamConfig = {}): Observable<EnhancedStreamChunk> {
    const subject = new Subject<EnhancedStreamChunk>();
    this.activeStreams.set(streamId, subject);
    this.sequenceCounters.set(streamId, 0);

    const { bufferTimeMs = 100, maxConcurrent = 3 } = config;

    // Process the async iterable
    (async () => {
      try {
        for await (const chunk of source) {
          const sequenceNumber = this.incrementSequence(streamId);
          const transformed = this.transformToStreamChunk(chunk);
          const enhancedChunk: EnhancedStreamChunk = {
            content: this.extractContent(transformed),
            type: this.extractType(transformed),
            timestamp: Date.now(),
            sequenceNumber,
          };
          subject.next(enhancedChunk);
        }
      } catch (error) {
        subject.error(error);
      } finally {
        subject.complete();
        this.activeStreams.delete(streamId);
        this.sequenceCounters.delete(streamId);
      }
    })();

    // Return observable with buffering and concurrency control
    return subject.asObservable().pipe(
      bufferTime(bufferTimeMs),
      filter((buffer) => buffer.length > 0),
      mergeMap((buffer) => from(buffer), maxConcurrent),
    );
  }

  /**
   * Stream with parallel processing of chunks
   */
  async *parallelStream<T, R>(
    source: AsyncIterable<T>,
    processor: (chunk: T) => Promise<R>,
    streamId: string,
    maxConcurrent = 3,
  ): AsyncGenerator<EnhancedStreamChunk> {
    const processingQueue: Promise<EnhancedStreamChunk>[] = [];
    let sequenceNumber = 0;

    for await (const chunk of source) {
      const currentSequence = sequenceNumber++;

      // Start processing
      const processingPromise = processor(chunk).then((result) => {
        const transformed = this.transformToStreamChunk(result);
        return {
          content: this.extractContent(transformed),
          type: this.extractType(transformed),
          timestamp: Date.now(),
          sequenceNumber: currentSequence,
          // Preserve all properties from the processed result
          ...(result && typeof result === 'object' ? result : {}),
        };
      });

      processingQueue.push(processingPromise);

      // If we've reached max concurrent, wait for one to complete
      if (processingQueue.length >= maxConcurrent) {
        const completed = await Promise.race(processingQueue);
        processingQueue.splice(
          processingQueue.findIndex((p) => p === Promise.resolve(completed)),
          1,
        );
        yield completed;
      }
    }

    // Process remaining items
    const remaining = await Promise.all(processingQueue);
    for (const chunk of remaining.sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      yield chunk;
    }
  }

  /**
   * Merge multiple async streams into one
   */
  async *mergeStreams<T>(...sources: AsyncIterable<T>[]): AsyncGenerator<EnhancedStreamChunk> {
    const iterators = sources.map((source) => source[Symbol.asyncIterator]());
    const results = new Map<number, Promise<IteratorResult<T>>>();

    // Initialize with first result from each iterator
    iterators.forEach((iterator, index) => {
      results.set(index, iterator.next());
    });

    let sequenceNumber = 0;

    while (results.size > 0) {
      // Race all pending results
      const entries = Array.from(results.entries());
      const { index, result } = await Promise.race(
        entries.map(async ([idx, promise]) => ({
          index: idx,
          result: await promise,
        })),
      );

      if (result.done) {
        results.delete(index);
      } else {
        // Yield the result
        const transformed = this.transformToStreamChunk(result.value);
        yield {
          content: this.extractContent(transformed),
          type: this.extractType(transformed),
          timestamp: Date.now(),
          sequenceNumber: sequenceNumber++,
          metadata: { sourceIndex: index },
        };

        // Queue next result from this iterator
        results.set(index, iterators[index].next());
      }
    }
  }

  /**
   * Transform stream chunks with error handling
   */
  async *transformStream<T, R>(
    source: AsyncIterable<T>,
    transformer: (chunk: T) => R | Promise<R>,
    streamId: string,
    onError?: (error: Error, chunk: T) => R | null,
  ): AsyncGenerator<EnhancedStreamChunk> {
    for await (const chunk of source) {
      try {
        const transformed = await transformer(chunk);
        const sequenceNumber = this.incrementSequence(streamId);

        const transformedChunk = this.transformToStreamChunk(transformed);
        yield {
          content: this.extractContent(transformedChunk),
          type: this.extractType(transformedChunk),
          timestamp: Date.now(),
          sequenceNumber,
        };
      } catch (error) {
        if (onError) {
          const fallback = onError(error as Error, chunk);
          if (fallback !== null) {
            const sequenceNumber = this.incrementSequence(streamId);
            const transformedFallback = this.transformToStreamChunk(fallback);
            yield {
              content: this.extractContent(transformedFallback),
              type: this.extractType(transformedFallback),
              timestamp: Date.now(),
              sequenceNumber,
              metadata: { error: (error as Error).message },
            };
          }
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Create a stream that can be paused and resumed
   */
  createPausableStream<T>(
    source: AsyncIterable<T>,
    streamId: string,
  ): {
    stream: AsyncIterable<EnhancedStreamChunk>;
    pause: () => void;
    resume: () => void;
    isPaused: () => boolean;
  } {
    let paused = false;
    let pausePromise: Promise<void> | null = null;
    let resumeResolve: (() => void) | null = null;

    const self = this;
    const pausableStream = async function* (): AsyncGenerator<EnhancedStreamChunk> {
      let sequenceNumber = 0;

      for await (const chunk of source) {
        // Check if paused
        while (paused) {
          if (!pausePromise) {
            pausePromise = new Promise<void>((resolve) => {
              resumeResolve = resolve;
            });
          }
          await pausePromise;
        }

        const transformed = self.transformToStreamChunk(chunk);
        yield {
          content: self.extractContent(transformed),
          type: self.extractType(transformed),
          timestamp: Date.now(),
          sequenceNumber: sequenceNumber++,
        } as EnhancedStreamChunk;
      }
    };

    return {
      stream: pausableStream(),
      pause: () => {
        paused = true;
        this.logger.debug(`Stream ${streamId} paused`);
      },
      resume: () => {
        paused = false;
        if (resumeResolve) {
          resumeResolve();
          pausePromise = null;
          resumeResolve = null;
        }
        this.logger.debug(`Stream ${streamId} resumed`);
      },
      isPaused: () => paused,
    };
  }

  /**
   * Helper to transform any value to StreamChunk
   */
  private transformToStreamChunk(value: unknown): StreamChunk {
    // If it's already a StreamChunk-like object
    if (value && typeof value === 'object' && 'content' in value) {
      return value as StreamChunk;
    }

    // Transform to StreamChunk format, preserving all properties
    return {
      content: typeof value === 'string' ? value : JSON.stringify(value),
      type: 'text',
      // Preserve all original properties if it's an object
      ...(value && typeof value === 'object' ? value : {}),
    } as StreamChunk;
  }

  /**
   * Safely extract content from transformed stream chunk
   */
  private extractContent(transformed: StreamChunk): string | Record<string, unknown> | Buffer {
    if (transformed && typeof transformed === 'object' && 'content' in transformed) {
      return transformed.content;
    }
    return '';
  }

  /**
   * Safely extract type from transformed stream chunk
   */
  private extractType(transformed: StreamChunk): string {
    if (transformed && typeof transformed === 'object' && 'type' in transformed && typeof transformed.type === 'string') {
      return transformed.type;
    }
    return 'text';
  }

  /**
   * Increment and get sequence number for a stream
   */
  private incrementSequence(streamId: string): number {
    const current = this.sequenceCounters.get(streamId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(streamId, next);
    return next;
  }

  /**
   * Get active stream by ID
   */
  getActiveStream(streamId: string): Subject<EnhancedStreamChunk> | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Cancel an active stream
   */
  cancelStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.complete();
      this.activeStreams.delete(streamId);
      this.sequenceCounters.delete(streamId);
      this.logger.debug(`Stream ${streamId} cancelled`);
    }
  }
}
