import { ChatAnthropic } from '@langchain/anthropic';
import { BaseMessage } from '@langchain/core/messages';
import { Runnable, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ErrorCategory } from '../interfaces/error-handling.interface';
// import { ChatOllama } from '@langchain/ollama';  // Optional dependency
import { RetryService } from './retry.service';

export interface FallbackChainConfig {
  name: string;
  description: string;
  priority: number;
  healthCheck?: () => Promise<boolean>;
  errorCategories?: ErrorCategory[];
  maxLatencyMs?: number;
}

export interface FallbackStrategy {
  primary: Runnable;
  fallbacks: Array<{
    runnable: Runnable;
    config: FallbackChainConfig;
  }>;
  onFallback?: (fromIndex: number, toIndex: number, error: Error) => void;
}

@Injectable()
export class FallbackChainService {
  private readonly logger = new Logger(FallbackChainService.name);
  private readonly healthStatus = new Map<string, boolean>();
  private readonly latencyMetrics = new Map<string, number[]>();

  constructor(private readonly retryService: RetryService) {
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Create a fallback chain with graceful degradation
   */
  createFallbackChain<T, U>(strategy: FallbackStrategy): Runnable<T, U> {
    const { primary, fallbacks, onFallback } = strategy;

    return new RunnablePassthrough<T>().pipe(async (input: T) => {
      const startTime = Date.now();

      // Try primary first
      try {
        const result = await this.executeWithMonitoring('primary', () => primary.invoke(input), startTime);
        return result as U;
      } catch (primaryError) {
        this.logger.warn(`Primary service failed: ${(primaryError as Error).message}`);

        // Try fallbacks in order of priority
        const sortedFallbacks = [...fallbacks].sort((a, b) => a.config.priority - b.config.priority);

        for (let i = 0; i < sortedFallbacks.length; i++) {
          const fallback = sortedFallbacks[i];

          // Check if fallback is healthy
          if (!(await this.isFallbackHealthy(fallback.config))) {
            this.logger.debug(`Skipping unhealthy fallback: ${fallback.config.name}`);
            continue;
          }

          // Check if error category matches
          if (!this.shouldUseFallback(primaryError as Error, fallback.config)) {
            this.logger.debug(`Fallback ${fallback.config.name} not suitable for error category`);
            continue;
          }

          try {
            onFallback?.(-1, i, primaryError as Error);

            const result = await this.executeWithMonitoring(fallback.config.name, () => fallback.runnable.invoke(input), Date.now());

            this.logger.log(`Successfully used fallback: ${fallback.config.name}`);
            return result as U;
          } catch (fallbackError) {
            this.logger.warn(`Fallback ${fallback.config.name} failed: ${(fallbackError as Error).message}`);

            if (i === sortedFallbacks.length - 1) {
              throw new Error(`All fallbacks exhausted. Primary error: ${(primaryError as Error).message}`);
            }
          }
        }

        throw primaryError;
      }
    }) as Runnable<T, U>;
  }

  /**
   * Create LLM fallback chain with multiple providers
   */
  createLLMFallbackChain(options?: { temperature?: number; maxTokens?: number; includeLocal?: boolean }): Runnable {
    const { temperature = 0.7, maxTokens = 1000, includeLocal = false } = options || {};

    // Primary: OpenAI GPT-4
    const primary = new ChatOpenAI({
      modelName: 'gpt-4',
      temperature,
      maxTokens,
    });

    // Fallback 1: Anthropic Claude
    const anthropicFallback = new ChatAnthropic({
      modelName: 'claude-3-opus-20240229',
      temperature,
      maxTokens,
    });

    // Fallback 2: OpenAI GPT-3.5
    const gpt35Fallback = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature,
      maxTokens,
    });

    const fallbacks: Array<{
      runnable: Runnable;
      config: FallbackChainConfig;
    }> = [
      {
        runnable: anthropicFallback,
        config: {
          name: 'anthropic-claude',
          description: 'Anthropic Claude fallback',
          priority: 1,
          errorCategories: [ErrorCategory.RATE_LIMIT, ErrorCategory.TIMEOUT],
          maxLatencyMs: 30000,
        },
      },
      {
        runnable: gpt35Fallback,
        config: {
          name: 'openai-gpt-3.5',
          description: 'OpenAI GPT-3.5 fallback',
          priority: 2,
          errorCategories: [ErrorCategory.RATE_LIMIT, ErrorCategory.TIMEOUT, ErrorCategory.EXTERNAL],
          maxLatencyMs: 20000,
        },
      },
    ];

    // Add local model if requested (requires @langchain/ollama)
    // if (includeLocal) {
    //   const ollamaFallback = new ChatOllama({
    //     model: 'llama2',
    //     temperature,
    //   });

    //   fallbacks.push({
    //     runnable: ollamaFallback,
    //     config: {
    //       name: 'ollama-local',
    //       description: 'Local Ollama model fallback',
    //       priority: 3,
    //       errorCategories: [
    //         ErrorCategory.NETWORK,
    //         ErrorCategory.EXTERNAL,
    //         ErrorCategory.RATE_LIMIT
    //       ],
    //       healthCheck: async () => {
    //         try {
    //           await ollamaFallback.invoke('test');
    //           return true;
    //         } catch {
    //           return false;
    //         }
    //       }
    //     }
    //   });
    // }

    return this.createFallbackChain({
      primary,
      fallbacks,
      onFallback: (from, to, error) => {
        const toName = to >= 0 ? fallbacks[to].config.name : 'none';
        this.logger.log(`Switching from primary to ${toName} due to: ${error.message}`);
      },
    });
  }

  /**
   * Create tool fallback chain for different tool providers
   */
  createToolFallbackChain(
    primaryTool: Runnable,
    fallbackTools: Runnable[],
    options?: {
      toolNames?: string[];
      healthChecks?: Array<() => Promise<boolean>>;
    },
  ): Runnable {
    const { toolNames = [], healthChecks = [] } = options || {};

    const fallbacks = fallbackTools.map((tool, index) => ({
      runnable: tool,
      config: {
        name: toolNames[index] || `tool-${index}`,
        description: `Fallback tool ${index}`,
        priority: index + 1,
        healthCheck: healthChecks[index],
        errorCategories: [ErrorCategory.EXTERNAL, ErrorCategory.TIMEOUT, ErrorCategory.RESOURCE],
        maxLatencyMs: 10000,
      },
    }));

    return this.createFallbackChain({
      primary: primaryTool,
      fallbacks,
      onFallback: (from, to, error) => {
        this.logger.log(`Tool fallback activated: ${fallbacks[to]?.config.name}`);
      },
    });
  }

  /**
   * Create a degraded service fallback chain
   */
  createDegradedServiceChain<T, U>(
    fullService: Runnable<T, U>,
    degradedServices: Array<{
      service: Runnable<T, Partial<U>>;
      name: string;
      capabilities: string[];
    }>,
  ): Runnable<T, U | Partial<U>> {
    const fallbacks = degradedServices.map((degraded, index) => ({
      runnable: degraded.service,
      config: {
        name: degraded.name,
        description: `Degraded service with capabilities: ${degraded.capabilities.join(', ')}`,
        priority: index + 1,
        errorCategories: [ErrorCategory.RESOURCE, ErrorCategory.INTERNAL],
        maxLatencyMs: 15000,
      },
    }));

    return this.createFallbackChain({
      primary: fullService,
      fallbacks,
      onFallback: (from, to, error) => {
        const service = degradedServices[to];
        this.logger.warn(`Degraded to ${service.name} with limited capabilities: ${service.capabilities.join(', ')}`);
      },
    });
  }

  private async executeWithMonitoring<T>(serviceName: string, operation: () => Promise<T>, startTime: number): Promise<T> {
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      this.recordLatency(serviceName, latency);
      this.updateHealth(serviceName, true);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.recordLatency(serviceName, latency);
      this.updateHealth(serviceName, false);
      throw error;
    }
  }

  private async isFallbackHealthy(config: FallbackChainConfig): Promise<boolean> {
    // Check custom health check if provided
    if (config.healthCheck) {
      try {
        return await config.healthCheck();
      } catch {
        return false;
      }
    }

    // Check cached health status
    const health = this.healthStatus.get(config.name);
    if (health !== undefined) {
      return health;
    }

    // Check latency if threshold is set
    if (config.maxLatencyMs) {
      const avgLatency = this.getAverageLatency(config.name);
      if (avgLatency > config.maxLatencyMs) {
        this.logger.debug(`Fallback ${config.name} exceeds latency threshold`);
        return false;
      }
    }

    return true;
  }

  private shouldUseFallback(error: Error, config: FallbackChainConfig): boolean {
    if (!config.errorCategories || config.errorCategories.length === 0) {
      return true;
    }

    const classification = this.retryService.classifyError(error);
    return config.errorCategories.includes(classification.category);
  }

  private recordLatency(serviceName: string, latency: number): void {
    const latencies = this.latencyMetrics.get(serviceName) || [];
    latencies.push(latency);

    // Keep only last 100 measurements
    if (latencies.length > 100) {
      latencies.shift();
    }

    this.latencyMetrics.set(serviceName, latencies);
  }

  private getAverageLatency(serviceName: string): number {
    const latencies = this.latencyMetrics.get(serviceName);
    if (!latencies || latencies.length === 0) {
      return 0;
    }

    const sum = latencies.reduce((acc, val) => acc + val, 0);
    return sum / latencies.length;
  }

  private updateHealth(serviceName: string, isHealthy: boolean): void {
    this.healthStatus.set(serviceName, isHealthy);
  }

  private startHealthMonitoring(): void {
    // Periodic health check every 30 seconds
    setInterval(() => {
      for (const [service, _] of this.healthStatus) {
        const avgLatency = this.getAverageLatency(service);
        this.logger.debug(`Service ${service} avg latency: ${avgLatency}ms`);
      }
    }, 30000);
  }

  getServiceHealth(): Map<string, boolean> {
    return new Map(this.healthStatus);
  }

  getLatencyMetrics(): Map<string, { average: number; min: number; max: number }> {
    const metrics = new Map<string, { average: number; min: number; max: number }>();

    for (const [service, latencies] of this.latencyMetrics) {
      if (latencies.length > 0) {
        const avg = this.getAverageLatency(service);
        const min = Math.min(...latencies);
        const max = Math.max(...latencies);
        metrics.set(service, { average: avg, min, max });
      }
    }

    return metrics;
  }
}
