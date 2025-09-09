import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { DeadLetterMessage, MessageMetadata, QueueHealthStats, TaskMessage, TaskPriority } from '../interfaces/queue.interface';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';

export interface QueueManagerOptions {
  prefetch?: number;
  retryDelay?: number;
  maxRetries?: number;
  enableDeadLetter?: boolean;
}

@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);
  private readonly consumers = new Map<string, amqp.Channel>();
  private readonly healthStats = new Map<string, QueueHealthStats>();
  private readonly messageCounters = new Map<string, number>();

  constructor(
    private readonly connectionService: RabbitMQConnectionService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.startHealthMonitoring();
  }

  async enqueueTask<T = any>(
    taskType: string,
    payload: T,
    options: {
      priority?: TaskPriority;
      correlationId?: string;
      delay?: number;
      maxRetries?: number;
    } = {},
  ): Promise<string> {
    const { priority = TaskPriority.NORMAL, correlationId = uuidv4(), delay = 0, maxRetries = 3 } = options;

    const messageId = uuidv4();
    const now = new Date();

    const metadata: MessageMetadata = {
      id: messageId,
      correlationId,
      timestamp: now,
      retryCount: 0,
      maxRetries,
      priority,
      originalRoutingKey: `task.${priority}.${taskType}`,
    };

    const message: TaskMessage<T> = {
      id: messageId,
      payload,
      metadata,
      enqueuedAt: now,
    };

    try {
      const routingKey = `task.${priority}.${taskType}`;

      if (delay > 0) {
        await this.enqueueDelayedMessage(message, routingKey, delay);
      } else {
        await this.connectionService.publishMessage(routingKey, message, priority);
      }

      // Update metrics
      this.incrementMessageCounter(`enqueued.${priority}`);

      // Emit event
      this.eventEmitter.emit('task.enqueued', {
        messageId,
        taskType,
        priority,
        correlationId,
      });

      this.logger.debug(`Enqueued task ${taskType} with ID ${messageId} and priority ${priority}`);

      return messageId;
    } catch (error) {
      this.logger.error(`Failed to enqueue task ${taskType}: ${error.message}`);
      throw error;
    }
  }

  async createConsumer(queueName: string, processor: (message: TaskMessage) => Promise<any>, options: QueueManagerOptions = {}): Promise<void> {
    const { prefetch = 1, retryDelay = 1000, maxRetries = 3, enableDeadLetter = true } = options;

    try {
      const channel = await this.connectionService.getChannel(`consumer-${queueName}`);
      await channel.prefetch(prefetch);

      const consumerTag = await channel.consume(queueName, async (msg) => {
        if (!msg) {
          return;
        }

        const startTime = Date.now();
        let taskMessage: TaskMessage;

        try {
          taskMessage = JSON.parse(msg.content.toString());

          this.logger.debug(`Processing message ${taskMessage.id} from ${queueName}`);

          // Update processing metrics
          this.incrementMessageCounter(`processing.${queueName}`);

          // Emit processing start event
          this.eventEmitter.emit('task.processing.started', {
            messageId: taskMessage.id,
            queueName,
            correlationId: taskMessage.metadata.correlationId,
          });

          // Process the message
          const result = await processor(taskMessage);

          // Successfully processed - acknowledge
          channel.ack(msg);

          const processingTime = Date.now() - startTime;
          this.updateHealthStats(queueName, processingTime, true);

          // Emit success event
          this.eventEmitter.emit('task.processing.completed', {
            messageId: taskMessage.id,
            queueName,
            correlationId: taskMessage.metadata.correlationId,
            result,
            processingTime,
          });

          this.incrementMessageCounter(`completed.${queueName}`);
          this.logger.debug(`Successfully processed message ${taskMessage.id} in ${processingTime}ms`);
        } catch (error) {
          await this.handleProcessingError(msg, error, queueName, retryDelay, maxRetries, enableDeadLetter);

          const processingTime = Date.now() - startTime;
          this.updateHealthStats(queueName, processingTime, false);

          this.incrementMessageCounter(`failed.${queueName}`);
        }
      });

      this.consumers.set(queueName, channel);
      this.logger.log(`Started consumer for queue ${queueName} with consumer tag ${consumerTag.consumerTag}`);
    } catch (error) {
      this.logger.error(`Failed to create consumer for ${queueName}: ${error.message}`);
      throw error;
    }
  }

  private async handleProcessingError(
    msg: amqp.ConsumeMessage,
    error: Error,
    queueName: string,
    retryDelay: number,
    maxRetries: number,
    enableDeadLetter: boolean,
  ): Promise<void> {
    let taskMessage: TaskMessage;

    try {
      taskMessage = JSON.parse(msg.content.toString());
    } catch (parseError) {
      this.logger.error(`Failed to parse message for error handling: ${parseError.message}`);
      // Reject malformed message
      const channel = this.consumers.get(queueName);
      if (channel) {
        channel.nack(msg, false, false);
      }
      return;
    }

    const retryCount = taskMessage.metadata.retryCount + 1;
    const shouldRetry = retryCount <= maxRetries && this.shouldRetryError(error);

    this.logger.warn(`Message ${taskMessage.id} processing failed`, {
      error: error.message,
      retryCount,
      maxRetries,
      willRetry: shouldRetry,
    });

    if (shouldRetry) {
      // Calculate exponential backoff with jitter
      const baseDelay = 2 ** (retryCount - 1) * retryDelay;
      const jitter = Math.random() * 1000;
      const delay = Math.min(baseDelay + jitter, 300000); // Max 5 minutes

      // Update retry metadata
      const retryMessage: TaskMessage = {
        ...taskMessage,
        metadata: {
          ...taskMessage.metadata,
          retryCount,
          timestamp: new Date(),
        },
      };

      try {
        await this.enqueueDelayedMessage(retryMessage, msg.fields.routingKey, delay);

        // Acknowledge original message since we've scheduled retry
        const channel = this.consumers.get(queueName);
        if (channel) {
          channel.ack(msg);
        }

        this.eventEmitter.emit('task.retry.scheduled', {
          messageId: taskMessage.id,
          retryCount,
          delay,
          error: error.message,
        });

        this.logger.debug(`Scheduled retry ${retryCount}/${maxRetries} for message ${taskMessage.id} with ${delay}ms delay`);
      } catch (retryError) {
        this.logger.error(`Failed to schedule retry: ${retryError.message}`);
        await this.sendToDeadLetter(msg, taskMessage, error, queueName, enableDeadLetter);
      }
    } else {
      await this.sendToDeadLetter(msg, taskMessage, error, queueName, enableDeadLetter);
    }
  }

  private async sendToDeadLetter(
    msg: amqp.ConsumeMessage,
    taskMessage: TaskMessage,
    error: Error,
    queueName: string,
    enableDeadLetter: boolean,
  ): Promise<void> {
    const channel = this.consumers.get(queueName);
    if (!channel) {
      return;
    }

    if (enableDeadLetter) {
      // Create dead letter message with additional metadata
      const _deadLetterMessage: DeadLetterMessage = {
        ...taskMessage,
        originalQueue: queueName,
        failureReason: error.message,
        failedAt: new Date(),
        originalError: error,
      };

      // Send to dead letter exchange (will be handled by message rejection)
      channel.nack(msg, false, false);

      this.eventEmitter.emit('task.dead.letter', {
        messageId: taskMessage.id,
        originalQueue: queueName,
        error: error.message,
        correlationId: taskMessage.metadata.correlationId,
      });

      this.logger.error(`Sent message ${taskMessage.id} to dead letter queue after max retries`);
    } else {
      // Simply reject without requeue
      channel.nack(msg, false, false);
      this.logger.error(`Discarded message ${taskMessage.id} - dead letter disabled`);
    }
  }

  private async enqueueDelayedMessage(message: TaskMessage, routingKey: string, delayMs: number): Promise<void> {
    try {
      const channel = await this.connectionService.getChannel('delayed-publisher');

      const messageBuffer = Buffer.from(JSON.stringify(message));
      const options: amqp.Options.Publish = {
        persistent: true,
        priority: this.connectionService.getPriorityValue(message.metadata.priority),
        messageId: message.id,
        correlationId: message.metadata.correlationId,
        headers: {
          'x-delay': delayMs,
          'x-retry-count': message.metadata.retryCount,
          'x-original-routing-key': routingKey,
        },
      };

      // Use the delayed exchange with routing to original queue after delay
      channel.publish('langchain.processing.delayed', routingKey, messageBuffer, options);

      this.logger.debug(`Scheduled delayed message ${message.id} with ${delayMs}ms delay`);
    } catch (error) {
      this.logger.error(`Failed to enqueue delayed message: ${error.message}`);
      throw error;
    }
  }

  private shouldRetryError(error: Error): boolean {
    // Don't retry validation errors or permanent failures
    const nonRetryableErrors = ['ValidationError', 'AuthenticationError', 'AuthorizationError', 'NotFoundError'];

    return !nonRetryableErrors.some((errorType) => error.name.includes(errorType) || error.message.includes(errorType));
  }

  async getQueueHealth(queueName?: string): Promise<QueueHealthStats[]> {
    if (queueName) {
      const stats = this.healthStats.get(queueName);
      return stats ? [stats] : [];
    }

    return Array.from(this.healthStats.values());
  }

  async stopConsumer(queueName: string): Promise<void> {
    const channel = this.consumers.get(queueName);
    if (channel) {
      try {
        await channel.cancel('*'); // Cancel all consumers on this channel
        await channel.close();
        this.consumers.delete(queueName);
        this.logger.log(`Stopped consumer for queue ${queueName}`);
      } catch (error) {
        this.logger.error(`Error stopping consumer for ${queueName}: ${error.message}`);
      }
    }
  }

  async stopAllConsumers(): Promise<void> {
    const stopPromises = Array.from(this.consumers.keys()).map((queueName) => this.stopConsumer(queueName));
    await Promise.all(stopPromises);
  }

  private updateHealthStats(queueName: string, processingTime: number, success: boolean): void {
    const stats = this.healthStats.get(queueName) || {
      queueName,
      messageCount: 0,
      consumerCount: 1,
      avgWaitTime: 0,
      throughputPerSecond: 0,
      errorRate: 0,
      lastProcessedAt: new Date(),
    };

    stats.messageCount++;
    stats.lastProcessedAt = new Date();

    // Update average processing time (simple moving average)
    stats.avgWaitTime = (stats.avgWaitTime * (stats.messageCount - 1) + processingTime) / stats.messageCount;

    // Update error rate
    if (!success) {
      const errorCount = stats.errorRate * (stats.messageCount - 1) + 1;
      stats.errorRate = errorCount / stats.messageCount;
    } else {
      const errorCount = stats.errorRate * (stats.messageCount - 1);
      stats.errorRate = errorCount / stats.messageCount;
    }

    this.healthStats.set(queueName, stats);
  }

  private incrementMessageCounter(key: string): void {
    const current = this.messageCounters.get(key) || 0;
    this.messageCounters.set(key, current + 1);
  }

  private startHealthMonitoring(): void {
    // Update health stats every 30 seconds
    setInterval(async () => {
      try {
        await this.updateQueueMetrics();
      } catch (error) {
        this.logger.error(`Health monitoring error: ${error.message}`);
      }
    }, 30000);
  }

  private async updateQueueMetrics(): Promise<void> {
    for (const queueName of this.consumers.keys()) {
      try {
        const queueInfo = await this.connectionService.getQueueInfo(queueName);
        const stats = this.healthStats.get(queueName);

        if (stats) {
          stats.messageCount = queueInfo.messageCount;
          stats.consumerCount = queueInfo.consumerCount;

          // Calculate throughput (messages per second over last interval)
          const now = Date.now();
          const timeDiff = now - stats.lastProcessedAt.getTime();
          const messagesDiff = this.messageCounters.get(`completed.${queueName}`) || 0;

          if (timeDiff > 0) {
            stats.throughputPerSecond = (messagesDiff * 1000) / timeDiff;
          }
        }
      } catch (error) {
        // Queue might not exist yet or connection issue
        this.logger.debug(`Could not update metrics for ${queueName}: ${error.message}`);
      }
    }
  }
}
