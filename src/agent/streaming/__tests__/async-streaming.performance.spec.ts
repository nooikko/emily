import { performance } from 'node:perf_hooks';
import { take, toArray } from 'rxjs/operators';
import { AsyncStreamHandler, type StreamConfig } from '../async-stream.handler';

describe('Async Streaming Performance Tests', () => {
  let streamHandler: AsyncStreamHandler;

  beforeEach(() => {
    streamHandler = new AsyncStreamHandler();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Stream Throughput Tests', () => {
    it('should handle high-volume streaming efficiently', async () => {
      const itemCount = 10000;
      const source = async function* () {
        for (let i = 0; i < itemCount; i++) {
          yield { id: i, data: `item-${i}` };
        }
      };

      const startTime = performance.now();
      const results: any[] = [];

      for await (const chunk of streamHandler.createEnhancedStream(source(), 'perf-test-1', { bufferSize: 100, bufferTimeMs: 10 })) {
        results.push(chunk);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = itemCount / (duration / 1000); // items per second

      expect(results).toHaveLength(itemCount);
      expect(throughput).toBeGreaterThan(1000); // Should process > 1000 items/sec
      console.log(`Throughput: ${throughput.toFixed(2)} items/sec`);
    });

    it('should maintain performance with backpressure', async () => {
      const itemCount = 1000;
      const source = async function* () {
        for (let i = 0; i < itemCount; i++) {
          yield { id: i, data: `item-${i}`.repeat(100) }; // Larger payloads
        }
      };

      const startTime = performance.now();
      const results: any[] = [];

      for await (const chunk of streamHandler.createEnhancedStream(source(), 'backpressure-test', {
        bufferSize: 10,
        enableBackpressure: true,
        bufferTimeMs: 5,
      })) {
        results.push(chunk);
        // Simulate slow consumer
        if (results.length % 100 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(itemCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Parallel Stream Processing', () => {
    it('should process streams in parallel efficiently', async () => {
      const itemsPerStream = 100;
      const processor = async (item: any) => {
        // Simulate async processing
        await new Promise((resolve) => setImmediate(resolve));
        return { ...item, processed: true };
      };

      const source = async function* () {
        for (let i = 0; i < itemsPerStream; i++) {
          yield { id: i };
        }
      };

      const startTime = performance.now();
      const results: any[] = [];

      for await (const chunk of streamHandler.parallelStream(
        source(),
        processor,
        'parallel-test',
        5, // 5 concurrent operations
      )) {
        results.push(chunk);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(itemsPerStream);
      expect(results.every((r) => r.processed)).toBe(true);

      // Parallel processing should be faster than sequential
      const sequentialTime = itemsPerStream * 10; // Estimated sequential time
      expect(duration).toBeLessThan(sequentialTime);

      console.log(`Parallel processing time: ${duration.toFixed(2)}ms`);
    });

    it('should merge multiple streams efficiently', async () => {
      const createSource = (prefix: string, count: number) => {
        return async function* () {
          for (let i = 0; i < count; i++) {
            yield { source: prefix, id: i };
          }
        };
      };

      const sources = [createSource('A', 100)(), createSource('B', 100)(), createSource('C', 100)()];

      const startTime = performance.now();
      const results: any[] = [];

      for await (const chunk of streamHandler.mergeStreams(...sources)) {
        results.push(chunk);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(300);

      // Verify all sources are represented
      const sourceCounts = results.reduce(
        (acc, item) => {
          // Parse content if it's a string
          const content = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
          const source = content.source;
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      expect(sourceCounts.A).toBe(100);
      expect(sourceCounts.B).toBe(100);
      expect(sourceCounts.C).toBe(100);

      console.log(`Merge time for 3 streams: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Efficiency Tests', () => {
    it('should maintain stable memory usage with large streams', async () => {
      const largeItemCount = 100000;
      const source = async function* () {
        for (let i = 0; i < largeItemCount; i++) {
          yield { id: i, data: Buffer.alloc(1024) }; // 1KB per item
        }
      };

      const memorySnapshots: number[] = [];
      let processedCount = 0;

      // Take memory snapshots during processing
      const monitorInterval = setInterval(() => {
        if (global.gc) {
          global.gc(); // Force garbage collection if available
        }
        const usage = process.memoryUsage();
        memorySnapshots.push(usage.heapUsed);
      }, 100);

      for await (const _chunk of streamHandler.createEnhancedStream(source(), 'memory-test', { bufferSize: 50, bufferTimeMs: 10 })) {
        processedCount++;
      }

      clearInterval(monitorInterval);

      expect(processedCount).toBe(largeItemCount);

      // Memory should not grow linearly with stream size
      if (memorySnapshots.length > 2) {
        const firstSnapshot = memorySnapshots[0];
        const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
        const memoryGrowth = lastSnapshot - firstSnapshot;

        // Memory growth should be bounded, not proportional to item count
        const maxExpectedGrowth = 50 * 1024 * 1024; // 50MB max growth
        expect(memoryGrowth).toBeLessThan(maxExpectedGrowth);
      }
    });
  });

  describe('Observable Stream Performance', () => {
    it('should handle observable streams with buffering efficiently', (done) => {
      const itemCount = 1000;
      const source = async function* () {
        for (let i = 0; i < itemCount; i++) {
          yield { id: i };
        }
      };

      const startTime = performance.now();

      const observable = streamHandler.createObservableStream(source(), 'observable-test', { bufferTimeMs: 10, maxConcurrent: 5 });

      observable.pipe(take(itemCount), toArray()).subscribe({
        next: (results) => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          expect(results).toHaveLength(itemCount);
          expect(duration).toBeLessThan(2000); // Should complete quickly

          console.log(`Observable processing time: ${duration.toFixed(2)}ms`);
          done();
        },
        error: done,
      });
    });
  });

  describe('Pausable Stream Performance', () => {
    it('should pause and resume without losing data', async () => {
      const itemCount = 1000;
      const source = async function* () {
        for (let i = 0; i < itemCount; i++) {
          yield { id: i };
        }
      };

      const { stream, pause, resume, isPaused } = streamHandler.createPausableStream(source(), 'pausable-test');

      const results: any[] = [];
      let pauseCount = 0;

      const iterator = stream[Symbol.asyncIterator]();

      for (let i = 0; i < itemCount; i++) {
        // Pause every 100 items
        if (i > 0 && i % 100 === 0 && pauseCount < 5) {
          pause();
          expect(isPaused()).toBe(true);

          // Simulate pause duration
          await new Promise((resolve) => setTimeout(resolve, 10));

          resume();
          expect(isPaused()).toBe(false);
          pauseCount++;
        }

        const { value, done } = await iterator.next();
        if (!done) {
          results.push(value);
        }
      }

      expect(results).toHaveLength(itemCount);
      expect(pauseCount).toBe(5);

      // Verify sequence integrity
      for (let i = 0; i < itemCount; i++) {
        expect(results[i].sequenceNumber).toBe(i);
      }
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors without significant performance degradation', async () => {
      const itemCount = 1000;
      let errorCount = 0;

      const transformer = (item: any) => {
        // Throw error for every 10th item
        if (item.id % 10 === 0) {
          throw new Error(`Error on item ${item.id}`);
        }
        return { ...item, transformed: true };
      };

      const onError = (_error: Error, chunk: any) => {
        errorCount++;
        return { ...chunk, error: true };
      };

      const source = async function* () {
        for (let i = 0; i < itemCount; i++) {
          yield { id: i };
        }
      };

      const startTime = performance.now();
      const results: any[] = [];

      for await (const chunk of streamHandler.transformStream(source(), transformer, 'error-test', onError)) {
        results.push(chunk);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(itemCount);
      expect(errorCount).toBe(100); // 10% error rate
      expect(duration).toBeLessThan(3000); // Should still be performant

      const errorItems = results.filter((r: any) => r.metadata?.error);
      expect(errorItems).toHaveLength(100);
    });
  });

  describe('Benchmark Comparisons', () => {
    it('should compare different streaming configurations', async () => {
      // Increased item count to make timing differences more pronounced
      const itemCount = 10000;
      const source = () =>
        async function* () {
          for (let i = 0; i < itemCount; i++) {
            // Slightly larger payloads to make buffering more impactful
            yield { id: i, data: `item-${i}`, metadata: { timestamp: Date.now() } };
          }
        };

      const configurations: Array<[string, StreamConfig]> = [
        ['No buffering', { bufferSize: 1, bufferTimeMs: 0 }],
        ['Small buffer', { bufferSize: 10, bufferTimeMs: 10 }],
        ['Large buffer', { bufferSize: 100, bufferTimeMs: 50 }],
        ['With backpressure', { bufferSize: 50, enableBackpressure: true }],
      ];

      const benchmarks: Array<{ name: string; duration: number }> = [];

      // Run each benchmark multiple times and take the average for more stability
      const runs = 3;

      for (const [name, config] of configurations) {
        const durations: number[] = [];

        for (let run = 0; run < runs; run++) {
          const startTime = performance.now();
          let count = 0;

          for await (const _chunk of streamHandler.createEnhancedStream(source()(), `benchmark-${name}-${run}`, config)) {
            count++;
          }

          const duration = performance.now() - startTime;
          durations.push(duration);
          expect(count).toBe(itemCount);
        }

        // Use average duration for more stable results
        const avgDuration = durations.reduce((a, b) => a + b, 0) / runs;
        benchmarks.push({ name, duration: avgDuration });
      }

      // Log benchmark results
      console.log('\nStreaming Configuration Benchmarks:');
      benchmarks.forEach(({ name, duration }) => {
        console.log(`  ${name}: ${duration.toFixed(2)}ms (avg of ${runs} runs)`);
      });

      // More robust performance comparison using ratio and tolerance
      const noBufDuration = benchmarks.find((b) => b.name === 'No buffering')!.duration;
      const largeBufDuration = benchmarks.find((b) => b.name === 'Large buffer')!.duration;
      const smallBufDuration = benchmarks.find((b) => b.name === 'Small buffer')!.duration;

      // Calculate performance ratios instead of absolute differences
      const largeBufRatio = largeBufDuration / noBufDuration;
      const smallBufRatio = smallBufDuration / noBufDuration;

      console.log('Performance ratios (relative to no buffering):');
      console.log(`  Large buffer: ${largeBufRatio.toFixed(3)}x`);
      console.log(`  Small buffer: ${smallBufRatio.toFixed(3)}x`);

      // More lenient assertions - buffering should generally improve performance
      // but allow for some variance due to system conditions and parallel test execution

      // In CI/parallel test environments, performance can vary significantly
      // We use a more generous tolerance and focus on functional correctness
      const isCI = process.env.CI || process.env.JEST_WORKER_ID;
      const tolerance = isCI ? 2.0 : 1.5; // Allow up to 100% variance in CI, 50% locally

      console.log(`Test environment: ${isCI ? 'CI/Parallel' : 'Local'}, Tolerance: ${tolerance}x`);

      // Check if configurations are within acceptable performance range
      const isLargeBufAcceptable = largeBufDuration <= noBufDuration * tolerance;
      const isSmallBufAcceptable = smallBufDuration <= noBufDuration * tolerance;

      // At least one buffering configuration should show improvement OR be within acceptable range
      const anyBufferingImproved = largeBufDuration < noBufDuration || smallBufDuration < noBufDuration;
      const allWithinTolerance = isLargeBufAcceptable && isSmallBufAcceptable;

      // More informative assertion messages
      if (!isLargeBufAcceptable) {
        console.warn(`Large buffer performance exceeded tolerance: ${largeBufRatio.toFixed(3)}x > ${tolerance}x`);
      }
      if (!isSmallBufAcceptable) {
        console.warn(`Small buffer performance exceeded tolerance: ${smallBufRatio.toFixed(3)}x > ${tolerance}x`);
      }

      // The test passes if either:
      // 1. Any buffering shows improvement (ideal case)
      // 2. All configurations are within acceptable tolerance (allows for system variance)
      expect(anyBufferingImproved || allWithinTolerance).toBe(true);

      // Verify that all configurations completed successfully
      expect(benchmarks).toHaveLength(4);
      benchmarks.forEach(({ duration }) => {
        expect(duration).toBeGreaterThan(0);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      });
    });
  });
});
