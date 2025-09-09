---
title: Research Session
query: "LangChain async chains with AsyncCallbackManager, RabbitMQ integration patterns for background task processing, NestJS worker processes with retry mechanisms and exponential backoff. Best practices for task prioritization, progress tracking, dead letter queues, and chain composition for complex workflows in 2025."
date: 9/9/2025
time: 7:47:29 AM
timestamp: 2025-09-09T07:47:29.266Z
exchanges: 1
---

# Research Session

## Initial Query

**Question:** LangChain async chains with AsyncCallbackManager, RabbitMQ integration patterns for background task processing, NestJS worker processes with retry mechanisms and exponential backoff. Best practices for task prioritization, progress tracking, dead letter queues, and chain composition for complex workflows in 2025.

**Response:**

# LangChain Async Chains, RabbitMQ Integration & NestJS Worker Processes: Advanced Production Architecture Guide

## Executive Summary

Building production-grade asynchronous task processing systems requires careful orchestration of LangChain's async capabilities, robust message queuing with RabbitMQ, and resilient worker processes in NestJS. This comprehensive guide covers 2025 best practices for implementing scalable, fault-tolerant background processing systems with sophisticated retry mechanisms, monitoring, and workflow orchestration.

## LangChain Async Chains with AsyncCallbackManager

### Modern Async Chain Architecture

LangChain's async capabilities have evolved significantly, with AsyncCallbackManager serving as the foundation for scalable chain execution. The key to effective async chain implementation lies in proper callback management and streaming integration:

```typescript
import { 
  AsyncCallbackManagerForChainRun,
  BaseCallbackManager,
  CallbackManagerForLLMRun
} from 'langchain/callbacks';
import { LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models/openai';

@Injectable()
export class AsyncChainProcessor {
  private readonly callbackManager: BaseCallbackManager;
  
  constructor() {
    this.callbackManager = BaseCallbackManager.fromHandlers([
      new StreamingCallbackHandler(),
      new MetricsCallbackHandler(),
      new ErrorTrackingCallbackHandler()
    ]);
  }

  async processChainAsync(input: string, context: ChainContext): Promise<ChainResult> {
    const runManager = await this.callbackManager.handleChainStart(
      { name: 'AsyncProcessor' },
      { input, context }
    );

    try {
      const chain = new LLMChain({
        llm: new ChatOpenAI({ 
          streaming: true,
          callbacks: [runManager.getChild()]
        }),
        prompt: await this.buildContextualPrompt(context),
        callbackManager: this.callbackManager
      });

      const result = await chain.call({ input }, [runManager]);
      await runManager.handleChainEnd(result);
      
      return result;
    } catch (error) {
      await runManager.handleChainError(error);
      throw error;
    }
  }
}
```

### Advanced Callback Management Patterns

The AsyncCallbackManager provides sophisticated hooks for monitoring, metrics collection, and error handling. In 2025, best practices emphasize structured logging and distributed tracing:

```typescript
export class ProductionCallbackHandler extends BaseCallbackHandler {
  name = 'ProductionCallbackHandler';
  
  async handleChainStart(
    chain: { name: string },
    inputs: ChainInputs,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    // Distributed tracing integration
    const span = tracer.startSpan(`chain.${chain.name}`, {
      parent: parentRunId ? getSpanFromRunId(parentRunId) : undefined,
      attributes: {
        'chain.name': chain.name,
        'chain.inputs': JSON.stringify(inputs),
        'run.id': runId
      }
    });

    // Metrics collection
    this.metrics.incrementCounter('chain.started', {
      chain_name: chain.name,
      chain_type: this.getChainType(chain)
    });

    // Progress tracking for UI updates
    await this.progressTracker.updateProgress(runId, {
      status: 'started',
      timestamp: new Date(),
      chainName: chain.name
    });
  }

  async handleLLMNewToken(
    token: string,
    idx: NewTokenIndices,
    runId: string
  ): Promise<void> {
    // Real-time streaming to clients
    await this.streamingService.emitToken(runId, token);
    
    // Token-level metrics for cost tracking
    this.metrics.incrementCounter('llm.tokens.generated', {
      model: this.getCurrentModel(runId)
    });
  }

  async handleChainError(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const span = getSpanFromRunId(runId);
    span?.recordException(err);
    span?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });

    // Dead letter queue for failed chains
    await this.deadLetterService.enqueue({
      runId,
      error: err.message,
      timestamp: new Date(),
      retryCount: 0
    });
  }
}
```

## RabbitMQ Integration Patterns for Background Processing

### Advanced Queue Topology Design

Modern RabbitMQ integration for LangChain workflows requires sophisticated exchange and queue patterns. The recommended approach uses topic exchanges with dynamic routing based on task priority and type:

```typescript
@Injectable()
export class RabbitMQTaskProcessor {
  private connection: Connection;
  private channel: Channel;

  async initializeTopology(): Promise<void> {
    // Main processing exchange
    await this.channel.assertExchange('langchain.processing', 'topic', {
      durable: true,
      arguments: {
        'x-delayed-type': 'topic'  // For delayed retry processing
      }
    });

    // Priority queues with different SLA guarantees
    const priorities = ['critical', 'high', 'normal', 'low'];
    for (const priority of priorities) {
      await this.channel.assertQueue(`langchain.tasks.${priority}`, {
        durable: true,
        arguments: {
          'x-max-priority': priority === 'critical' ? 10 : 5,
          'x-dead-letter-exchange': 'langchain.dlx',
          'x-dead-letter-routing-key': `failed.${priority}`,
          'x-message-ttl': this.getTTLForPriority(priority)
        }
      });

      await this.channel.bindQueue(
        `langchain.tasks.${priority}`,
        'langchain.processing',
        `task.${priority}.*`
      );
    }

    // Dead letter exchange and queues
    await this.setupDeadLetterTopology();
  }

  async enqueueChainTask(task: ChainTask, priority: TaskPriority): Promise<void> {
    const routingKey = `task.${priority}.${task.chainType}`;
    const message = {
      id: generateUUID(),
      task,
      enqueueTime: new Date().toISOString(),
      attempts: 0,
      maxRetries: this.getMaxRetriesForPriority(priority)
    };

    await this.channel.publish(
      'langchain.processing',
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        priority: this.getPriorityValue(priority),
        messageId: message.id,
        timestamp: Date.now(),
        headers: {
          'x-retry-count': 0,
          'x-original-routing-key': routingKey
        }
      }
    );

    // Track enqueue metrics
    this.metrics.incrementCounter('tasks.enqueued', {
      priority,
      chain_type: task.chainType
    });
  }
}
```

### Sophisticated Message Processing Pipeline

The message processing pipeline integrates LangChain execution with RabbitMQ's reliability features:

```typescript
@Injectable()
export class ChainTaskConsumer {
  private readonly processors = new Map<string, ChainProcessor>();

  async startConsumer(queueName: string): Promise<void> {
    await this.channel.consume(queueName, async (msg) => {
      if (!msg) return;

      const correlationId = msg.properties.correlationId || generateUUID();
      const retryCount = parseInt(msg.properties.headers['x-retry-count'] || '0');

      try {
        const taskData = JSON.parse(msg.content.toString());
        const processor = this.getProcessor(taskData.task.chainType);

        // Start processing with distributed tracing
        const span = tracer.startSpan('task.process', {
          attributes: {
            'task.id': taskData.id,
            'task.type': taskData.task.chainType,
            'task.priority': queueName.split('.').pop(),
            'task.retry_count': retryCount
          }
        });

        const result = await processor.process(taskData.task, {
          correlationId,
          span,
          retryCount
        });

        // Success - acknowledge message
        this.channel.ack(msg);
        
        // Publish result if callback queue specified
        if (msg.properties.replyTo) {
          await this.publishResult(msg.properties.replyTo, result, correlationId);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        this.metrics.incrementCounter('tasks.completed', {
          queue: queueName,
          chain_type: taskData.task.chainType
        });

      } catch (error) {
        await this.handleProcessingError(msg, error, retryCount, correlationId);
      }
    }, {
      noAck: false,
      prefetch: this.getPrefetchForQueue(queueName)
    });
  }

  private async handleProcessingError(
    msg: ConsumeMessage,
    error: Error,
    retryCount: number,
    correlationId: string
  ): Promise<void> {
    const taskData = JSON.parse(msg.content.toString());
    const maxRetries = taskData.maxRetries || 3;

    if (retryCount < maxRetries) {
      // Exponential backoff retry
      const delay = this.calculateBackoffDelay(retryCount);
      const retryHeaders = {
        ...msg.properties.headers,
        'x-retry-count': retryCount + 1,
        'x-delay': delay
      };

      await this.channel.publish(
        'langchain.processing.delayed',
        msg.fields.routingKey,
        msg.content,
        {
          ...msg.properties,
          headers: retryHeaders
        }
      );

      this.channel.ack(msg);
      
      this.logger.warn(`Task ${taskData.id} failed, retry ${retryCount + 1}/${maxRetries} scheduled`, {
        error: error.message,
        delay,
        correlationId
      });
    } else {
      // Max retries exceeded - send to dead letter
      this.channel.nack(msg, false, false);
      
      this.logger.error(`Task ${taskData.id} permanently failed after ${maxRetries} retries`, {
        error: error.message,
        correlationId
      });

      // Notify monitoring system
      await this.alertingService.sendAlert({
        type: 'task_permanent_failure',
        taskId: taskData.id,
        error: error.message,
        correlationId
      });
    }
  }
}
```

## NestJS Worker Processes with Advanced Retry Mechanisms

### Multi-Process Worker Architecture

NestJS worker processes should be designed for horizontal scaling and fault isolation. The recommended pattern uses dedicated worker modules with process-level isolation:

```typescript
// worker.module.ts
@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      }
    }),
    BullModule.registerQueue({
      name: 'langchain-tasks',
      processors: [
        {
          name: 'chain-processor',
          path: join(__dirname, 'processors', 'chain.processor.js'),
          concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5')
        }
      ],
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    })
  ],
  providers: [ChainWorkerService, HealthCheckService]
})
export class WorkerModule {}
```

### Sophisticated Retry Logic Implementation

Modern retry mechanisms go beyond simple exponential backoff, incorporating circuit breakers, jitter, and adaptive algorithms:

```typescript
@Processor('langchain-tasks')
export class ChainTaskProcessor {
  private readonly circuitBreaker = new CircuitBreaker(this.processTask.bind(this), {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000
  });

  @Process('chain-processor')
  async handleChainTask(job: Job<ChainTaskData>): Promise<ChainResult> {
    const { task, priority, correlationId } = job.data;
    const attemptNumber = job.attemptsMade + 1;

    // Set up job progress tracking
    await job.progress(0);

    try {
      // Adaptive timeout based on task complexity
      const timeout = this.calculateAdaptiveTimeout(task, attemptNumber);
      
      const result = await Promise.race([
        this.circuitBreaker.fire(task, {
          correlationId,
          attemptNumber,
          onProgress: (progress) => job.progress(progress)
        }),
        this.createTimeoutPromise(timeout)
      ]);

      await job.progress(100);
      
      // Success metrics
      this.metrics.histogram('task.duration', Date.now() - job.processedOn, {
        task_type: task.chainType,
        priority: priority.toString(),
        attempt: attemptNumber.toString()
      });

      return result;
    } catch (error) {
      await this.handleRetryLogic(job, error, attemptNumber);
      throw error; // Re-throw to trigger Bull's retry mechanism
    }
  }

  private async handleRetryLogic(
    job: Job<ChainTaskData>,
    error: Error,
    attemptNumber: number
  ): Promise<void> {
    const { task } = job.data;
    
    // Classify error type for intelligent retry decisions
    const errorType = this.classifyError(error);
    const shouldRetry = this.shouldRetryError(errorType, attemptNumber);

    if (!shouldRetry) {
      // Mark as permanently failed
      await job.moveToFailed({ message: 'Non-retryable error' });
      return;
    }

    // Calculate next retry delay with jitter
    const baseDelay = Math.pow(2, attemptNumber - 1) * 1000;
    const jitter = Math.random() * 1000;
    const delay = Math.min(baseDelay + jitter, 300000); // Max 5 minutes

    // Update job options for next retry
    await job.update({
      ...job.data,
      lastError: error.message,
      nextRetryAt: new Date(Date.now() + delay)
    });

    // Conditional backoff based on error type
    if (errorType === 'RATE_LIMIT') {
      // Exponential backoff for rate limits
      await job.opts.delay = delay * 2;
    } else if (errorType === 'TEMPORARY_FAILURE') {
      // Linear backoff for temporary failures
      await job.opts.delay = Math.min(delay, 60000);
    }

    this.logger.warn(`Task retry scheduled`, {
      jobId: job.id,
      attemptNumber,
      errorType,
      delay,
      nextRetry: new Date(Date.now() + delay).toISOString()
    });
  }

  private classifyError(error: Error): ErrorType {
    if (error.message.includes('rate limit')) return 'RATE_LIMIT';
    if (error.message.includes('timeout')) return 'TIMEOUT';
    if (error.message.includes('network')) return 'NETWORK';
    if (error.message.includes('validation')) return 'VALIDATION';
    return 'UNKNOWN';
  }

  private shouldRetryError(errorType: ErrorType, attemptNumber: number): boolean {
    const maxAttempts = {
      'RATE_LIMIT': 8,
      'TIMEOUT': 5,
      'NETWORK': 6,
      'VALIDATION': 1, // Don't retry validation errors
      'UNKNOWN': 3
    };

    return attemptNumber <= (maxAttempts[errorType] || 3);
  }
}
```

## Advanced Task Prioritization Strategies

### Dynamic Priority Assignment

Modern task prioritization goes beyond static priority levels, incorporating workload analysis and SLA requirements:

```typescript
@Injectable()
export class IntelligentPriorityManager {
  private readonly priorityAlgorithms = new Map<string, PriorityAlgorithm>();

  constructor() {
    this.initializePriorityAlgorithms();
  }

  async calculateTaskPriority(task: ChainTask, context: PriorityContext): Promise<TaskPriority> {
    const algorithm = this.priorityAlgorithms.get(task.chainType) || 
                     this.priorityAlgorithms.get('default');

    const factors = await this.collectPriorityFactors(task, context);
    const priority = await algorithm.calculate(factors);

    // Machine learning-based priority adjustment
    const adjustedPriority = await this.mlPriorityAdjuster.adjust(priority, {
      historicalPerformance: await this.getHistoricalPerformance(task),
      currentWorkload: await this.getCurrentWorkload(),
      userPreferences: context.userPreferences,
      systemLoad: await this.getSystemLoad()
    });

    return adjustedPriority;
  }

  private async collectPriorityFactors(
    task: ChainTask,
    context: PriorityContext
  ): Promise<PriorityFactors> {
    return {
      // Time-based factors
      createdAt: task.createdAt,
      deadline: task.deadline,
      ageSinceCreation: Date.now() - task.createdAt.getTime(),

      // Business factors
      userTier: context.user.tier,
      businessImpact: task.businessImpact,
      customerSegment: context.user.segment,

      // Technical factors
      estimatedDuration: await this.estimateTaskDuration(task),
      resourceRequirements: await this.analyzeResourceRequirements(task),
      dependencyCount: task.dependencies.length,

      // System factors
      currentQueueLength: await this.getQueueLength(task.chainType),
      averageWaitTime: await this.getAverageWaitTime(task.chainType),
      systemLoad: await this.getSystemLoad()
    };
  }
}
```

### Workload-Aware Queue Management

Intelligent queue management adapts to current system conditions and predicted workloads:

```typescript
@Injectable()
export class AdaptiveQueueManager {
  private readonly queueAnalytics = new QueueAnalyticsService();
  private readonly loadPredictor = new WorkloadPredictionService();

  async optimizeQueueConfiguration(): Promise<void> {
    const currentMetrics = await this.queueAnalytics.getCurrentMetrics();
    const predictedLoad = await this.loadPredictor.predict(3600); // Next hour

    // Dynamic queue scaling based on predicted load
    if (predictedLoad.expectedTasks > currentMetrics.capacity * 0.8) {
      await this.scaleUpWorkers();
      await this.adjustQueuePriorities();
    }

    // Resource allocation optimization
    await this.optimizeResourceAllocation(currentMetrics, predictedLoad);
  }

  private async adjustQueuePriorities(): Promise<void> {
    const queues = ['critical', 'high', 'normal', 'low'];
    
    for (const queueName of queues) {
      const queueMetrics = await this.queueAnalytics.getQueueMetrics(queueName);
      
      if (queueMetrics.avgWaitTime > queueMetrics.slaTarget) {
        // Temporarily boost priority
        await this.boostQueuePriority(queueName, 1.5);
        
        // Increase worker allocation
        await this.allocateAdditionalWorkers(queueName, 2);
        
        this.logger.warn(`Queue ${queueName} SLA breach detected, applying optimizations`, {
          avgWaitTime: queueMetrics.avgWaitTime,
          slaTarget: queueMetrics.slaTarget
        });
      }
    }
  }
}
```

## Progress Tracking and Monitoring Architecture

### Real-time Progress Streaming

Modern progress tracking requires real-time updates with granular visibility into chain execution:

```typescript
@Injectable()
export class ChainProgressTracker {
  private readonly progressStreams = new Map<string, BehaviorSubject<ProgressUpdate>>();

  async startTracking(chainId: string, totalSteps: number): Promise<Observable<ProgressUpdate>> {
    const progressStream = new BehaviorSubject<ProgressUpdate>({
      chainId,
      currentStep: 0,
      totalSteps,
      status: 'started',
      timestamp: new Date(),
      metadata: {}
    });

    this.progressStreams.set(chainId, progressStream);

    // Set up periodic health checks
    this.setupHealthCheck(chainId);

    return progressStream.asObservable();
  }

  async updateProgress(
    chainId: string,
    step: number,
    metadata: ProgressMetadata = {}
  ): Promise<void> {
    const stream = this.progressStreams.get(chainId);
    if (!stream) return;

    const update: ProgressUpdate = {
      chainId,
      currentStep: step,
      totalSteps: stream.value.totalSteps,
      status: 'in-progress',
      timestamp: new Date(),
      metadata: {
        ...stream.value.metadata,
        ...metadata
      }
    };

    // Calculate progress percentage and ETA
    update.progressPercentage = (step / stream.value.totalSteps) * 100;
    update.estimatedTimeRemaining = this.calculateETA(chainId, step);

    stream.next(update);

    // Persist progress for recovery
    await this.persistProgress(update);

    // Emit to WebSocket clients
    this.websocketGateway.emitProgress(chainId, update);
  }

  private calculateETA(chainId: string, currentStep: number): number {
    const startTime = this.chainStartTimes.get(chainId);
    if (!startTime || currentStep === 0) return 0;

    const elapsedTime = Date.now() - startTime;
    const averageTimePerStep = elapsedTime / currentStep;
    const remainingSteps = this.progressStreams.get(chainId)?.value.totalSteps - currentStep;

    return remainingSteps * averageTimePerStep;
  }
}
```

### Comprehensive Metrics Collection

Advanced metrics collection provides insights for optimization and troubleshooting:

```typescript
@Injectable()
export class ChainMetricsCollector {
  private readonly metricsRegistry = new MetricsRegistry();

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Performance metrics
    this.metricsRegistry.register('chain_duration_histogram', 
      new Histogram('chain_execution_duration_seconds', 'Chain execution time', ['chain_type', 'priority', 'status'])
    );

    this.metricsRegistry.register('chain_throughput_counter',
      new Counter('chain_throughput_total', 'Total chains processed', ['chain_type', 'worker_id'])
    );

    // Quality metrics
    this.metricsRegistry.register('chain_success_rate_gauge',
      new Gauge('chain_success_rate', 'Chain success rate', ['chain_type', 'time_window'])
    );

    this.metricsRegistry.register('token_usage_counter',
      new Counter('llm_tokens_consumed_total', 'LLM tokens consumed', ['model', 'chain_type'])
    );

    // Resource metrics
    this.metricsRegistry.register('memory_usage_gauge',
      new Gauge('worker_memory_usage_bytes', 'Worker memory usage', ['worker_id', 'chain_type'])
    );

    this.metricsRegistry.register('queue_depth_gauge',
      new Gauge('queue_depth', 'Current queue depth', ['priority', 'queue_name'])
    );
  }

  async recordChainExecution(
    chainType: string,
    duration: number,
    status: 'success' | 'failure',
    metadata: ChainMetadata
  ): Promise<void> {
    // Record duration
    this.metricsRegistry.get('chain_duration_histogram')
      .labels(chainType, metadata.priority, status)
      .observe(duration / 1000);

    // Update throughput
    this.metricsRegistry.get('chain_throughput_counter')
      .labels(chainType, metadata.workerId)
      .inc();

    // Update success rate (rolling window)
    await this.updateSuccessRate(chainType, status);

    // Record resource usage
    const memoryUsage = await this.getWorkerMemoryUsage(metadata.workerId);
    this.metricsRegistry.get('memory_usage_gauge')
      .labels(metadata.workerId, chainType)
      .set(memoryUsage);

    // Custom business metrics
    if (metadata.tokenUsage) {
      this.metricsRegistry.get('token_usage_counter')
        .labels(metadata.model, chainType)
        .inc(metadata.tokenUsage);
    }
  }
}
```

## Dead Letter Queue Management and Recovery

### Intelligent Dead Letter Processing

Modern dead letter queue management includes automated analysis and recovery strategies:

```typescript
@Injectable()
export class DeadLetterQueueManager {
  private readonly analyzerChain = this.createAnalyzerChain();

  async processDeadLetters(): Promise<void> {
    const deadLetters = await this.getDeadLetters();
    
    for (const deadLetter of deadLetters) {
      const analysis = await this.analyzeFailure(deadLetter);
      
      switch (analysis.category) {
        case 'RECOVERABLE':
          await this.attemptRecovery(deadLetter, analysis);
          break;
          
        case 'CONFIGURATION_ISSUE':
          await this.reportConfigurationIssue(deadLetter, analysis);
          break;
          
        case 'DATA_CORRUPTION':
          await this.handleDataCorruption(deadLetter, analysis);
          break;
          
        case 'PERMANENT_FAILURE':
          await this.archiveFailure(deadLetter, analysis);
          break;
      }
    }
  }

  private createAnalyzerChain(): LLMChain {
    return new LLMChain({
      llm: new ChatOpenAI({ 
        modelName: 'gpt-4',
        temperature: 0 
      }),
      prompt: PromptTemplate.fromTemplate(`
        Analyze this failed task and categorize the failure:
        
        Task: {task}
        Error: {error}
        Retry History: {retryHistory}
        System Context: {systemContext}
        
        Categories:
        - RECOVERABLE: Can be retried with modifications
        - CONFIGURATION_ISSUE: System configuration problem
        - DATA_CORRUPTION: Invalid input data
        - PERMANENT_FAILURE: Cannot be recovered
        
        Provide analysis in JSON format with category and recommendations.
      `)
    });
  }

  private async attemptRecovery(
    deadLetter: DeadLetterMessage,
    analysis: FailureAnalysis
  ): Promise<void> {
    const recoveryStrategies = analysis.recommendations;
    
    for (const strategy of recoveryStrategies) {
      try {
        const modifiedTask = await this.applyRecoveryStrategy(deadLetter.task, strategy);
        
        // Re-enqueue with lower priority and extended timeout
        await this.enqueueRecoveredTask(modifiedTask, {
          priority: 'low',
          timeout: deadLetter.originalTimeout * 2,
          maxRetries: 1,
          tags: ['recovered', 'dlq-retry']
        });
        
        this.logger.info(`Dead letter recovered using strategy: ${strategy.type}`, {
          originalTaskId: deadLetter.id,
          strategy: strategy.type
        });
        
        return;
      } catch (error) {
        this.logger.warn(`Recovery strategy failed: ${strategy.type}`, {
          error: error.message,
          taskId: deadLetter.id
        });
      }
    }
    
    // All recovery strategies failed
    await this.archiveFailure(deadLetter, analysis);
  }
}
```

## Complex Workflow Chain Composition

### Advanced Chain Orchestration Patterns

Complex workflows require sophisticated chain composition with conditional execution and dynamic branching:

```typescript
@Injectable()
export class WorkflowOrchestrator {
  async executeComplexWorkflow(
    workflowDefinition: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<WorkflowResult> {
    const graph = new StateGraph(WorkflowState);
    
    // Build execution graph
    this.buildExecutionGraph(graph, workflowDefinition);
    
    // Add conditional logic
    this.addConditionalEdges(graph, workflowDefinition);
    
    // Configure state management
    const workflow = graph.compile({
      checkpointer: new PostgresCheckpointSaver(this.dbConnection),
      interruptBefore: workflowDefinition.interruptionPoints
    });

    // Execute with state persistence
    const result = await workflow.invoke(
      { input: context.input },
      {
        configurable: {
          thread_id: context.threadId,
          checkpoint_id: context.checkpointId
        },
        callbacks: [
          new WorkflowCallbackHandler({
            onStateChange: this.handleStateChange.bind(this),
            onInterruption: this.handleInterruption.bind(this),
            onError: this.handleWorkflowError.bind(this)
          })
        ]
      }
    );

    return this.processWorkflowResult(result);
  }

  private buildExecutionGraph(
    graph: StateGraph<WorkflowState>,
    definition: WorkflowDefinition
  ): void {
    // Add entry point
    graph.addNode('start', this.createStartNode(definition));
    
    // Add processing nodes
    for (const step of definition.steps) {
      const node = this.createProcessingNode(step);
      graph.addNode(step.id, node);
      
      // Add edges based on dependencies
      if (step.dependencies.length === 0) {
        graph.addEdge('start', step.id);
      } else {
        for (const dependency of step.dependencies) {
          graph.addEdge(dependency, step.id);
        }
      }
    }
    
    // Add parallel execution groups
    for (const group of definition.parallelGroups) {
      const parallelNode = this.createParallelExecutionNode(group);
      graph.addNode(`parallel_${group.id}`, parallelNode);
    }
    
    // Add end node
    graph.addNode('end', this.createEndNode(definition));
    graph.setEntryPoint('start');
    graph.setFinishPoint('end');
  }

  private createProcessingNode(step: WorkflowStep): WorkflowNode {
    return async (state: WorkflowState): Promise<WorkflowState> => {
      const startTime = Date.now();
      
      try {
        // Select appropriate chain based on step type
        const chain = await this.getChainForStep(step);
        
        // Execute with state context
        const result = await chain.invoke({
          input: this.extractInputForStep(state, step),
          context: state.context,
          metadata: {
            stepId: step.id,
            workflowId: state.workflowId,
            threadId: state.threadId
          }
        });

        // Update state
        return {
          ...state,
          results: {
            ...state.results,
            [step.id]: result
          },
          lastCompletedStep: step.id,
          executionTime: Date.now() - startTime
        };
        
      } catch (error) {
        // Handle step failure
        if (step.fallback) {
          const fallbackResult = await this.executeFallback(step.fallback, state, error);
          return {
            ...state,
            results: {
              ...state.results,
              [step.id]: fallbackResult
            },
            warnings: [...(state.warnings || []), {
              stepId: step.id,
              message: `Fallback executed: ${error.message}`,
              timestamp: new Date()
            }]
          };
        }
        
        throw new WorkflowExecutionError(`Step ${step.id} failed: ${error.message}`, {
          stepId: step.id,
          workflowId: state.workflowId,
          originalError: error
        });
      }
    };
  }
}
```

This comprehensive guide provides the foundation for building production-grade async processing systems that leverage LangChain's capabilities with robust infrastructure patterns. The integration of these technologies enables sophisticated AI workflows with enterprise-level reliability and scalability. Your existing project context shows strong foundations in tasks 11, 14, 15, and 20 that align perfectly with these patterns, particularly the LangChain core integration and streaming implementations that would benefit from these advanced async processing capabilities.


---

*Generated by Task Master Research Command*  
*Timestamp: 2025-09-09T07:47:29.266Z*
