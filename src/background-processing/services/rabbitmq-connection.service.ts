import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { ConnectionPoolConfig, QueueConfiguration, TaskMessage, TaskPriority } from '../interfaces/queue.interface';

@Injectable()
export class RabbitMQConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConnectionService.name);
  private connection: amqp.Connection | null = null;
  private channels = new Map<string, amqp.Channel>();
  private connectionConfig: ConnectionPoolConfig;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private connectionAttempts = 0;
  private readonly maxConnectionAttempts = 10;

  constructor(private readonly configService: ConfigService) {
    this.connectionConfig = {
      host: this.configService.get<string>('RABBITMQ_HOST', 'localhost'),
      port: this.configService.get<number>('RABBITMQ_PORT', 5672),
      username: this.configService.get<string>('RABBITMQ_USERNAME', 'guest'),
      password: this.configService.get<string>('RABBITMQ_PASSWORD', 'guest'),
      vhost: this.configService.get<string>('RABBITMQ_VHOST', '/'),
      maxConnections: this.configService.get<number>('RABBITMQ_MAX_CONNECTIONS', 10),
      reconnectDelay: this.configService.get<number>('RABBITMQ_RECONNECT_DELAY', 5000),
      heartbeat: this.configService.get<number>('RABBITMQ_HEARTBEAT', 60),
    };
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.initializeTopology();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      this.logger.warn('Connection attempt already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      const connectionUrl = `amqp://${this.connectionConfig.username}:${this.connectionConfig.password}@${this.connectionConfig.host}:${this.connectionConfig.port}${this.connectionConfig.vhost}`;

      this.logger.log(`Connecting to RabbitMQ at ${this.connectionConfig.host}:${this.connectionConfig.port}`);

      this.connection = await amqp.connect(connectionUrl, {
        heartbeat: this.connectionConfig.heartbeat,
        clientProperties: {
          connection_name: 'Emily-BackgroundProcessor',
        },
      });

      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));

      this.connectionAttempts = 0;
      this.logger.log('Successfully connected to RabbitMQ');
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      await this.handleConnectionError(error);
    } finally {
      this.isConnecting = false;
    }
  }

  private async handleConnectionError(error: Error): Promise<void> {
    this.logger.error(`RabbitMQ connection error: ${error.message}`);
    this.connection = null;
    this.channels.clear();

    if (this.connectionAttempts < this.maxConnectionAttempts) {
      this.connectionAttempts++;
      const delay = this.connectionConfig.reconnectDelay * this.connectionAttempts;

      this.logger.log(`Attempting reconnection ${this.connectionAttempts}/${this.maxConnectionAttempts} in ${delay}ms`);

      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      this.logger.error('Max connection attempts reached. Manual intervention required.');
      throw new Error('Failed to establish RabbitMQ connection after maximum attempts');
    }
  }

  private handleConnectionClose(): void {
    this.logger.warn('RabbitMQ connection closed');
    this.connection = null;
    this.channels.clear();

    // Attempt to reconnect
    setTimeout(() => {
      this.connect();
    }, this.connectionConfig.reconnectDelay);
  }

  async getChannel(channelId = 'default'): Promise<amqp.Channel> {
    if (!this.connection) {
      throw new Error('RabbitMQ connection not established');
    }

    if (this.channels.has(channelId)) {
      const existingChannel = this.channels.get(channelId);

      // Verify channel is still open
      if (existingChannel && !existingChannel.connection.destroyed) {
        return existingChannel;
      }
      this.channels.delete(channelId);
    }

    try {
      const channel = await this.connection.createChannel();

      channel.on('error', (error) => {
        this.logger.error(`Channel ${channelId} error: ${error.message}`);
        this.channels.delete(channelId);
      });

      channel.on('close', () => {
        this.logger.warn(`Channel ${channelId} closed`);
        this.channels.delete(channelId);
      });

      // Set prefetch for fair work distribution
      await channel.prefetch(1);

      this.channels.set(channelId, channel);
      this.logger.log(`Created new channel: ${channelId}`);

      return channel;
    } catch (error) {
      this.logger.error(`Failed to create channel ${channelId}: ${error.message}`);
      throw error;
    }
  }

  private async initializeTopology(): Promise<void> {
    try {
      const channel = await this.getChannel('topology');

      // Main processing exchange with delayed message support
      await channel.assertExchange('langchain.processing', 'topic', {
        durable: true,
        arguments: {
          'x-delayed-type': 'topic',
        },
      });

      // Delayed retry exchange
      await channel.assertExchange('langchain.processing.delayed', 'topic', {
        durable: true,
      });

      // Dead letter exchange
      await channel.assertExchange('langchain.dlx', 'direct', {
        durable: true,
      });

      // Create priority-based queues
      const priorities: TaskPriority[] = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW];

      for (const priority of priorities) {
        const queueConfig: QueueConfiguration = {
          name: `langchain.tasks.${priority}`,
          priority: this.getPriorityValue(priority),
          durability: true,
          deadLetterExchange: 'langchain.dlx',
          deadLetterRoutingKey: `failed.${priority}`,
          messageTTL: this.getTTLForPriority(priority),
          maxRetries: this.getMaxRetriesForPriority(priority),
        };

        await this.createQueue(channel, queueConfig);

        // Bind queue to main exchange
        await channel.bindQueue(queueConfig.name, 'langchain.processing', `task.${priority}.*`);

        // Create corresponding dead letter queue
        await channel.assertQueue(`langchain.dlq.${priority}`, {
          durable: true,
          arguments: {
            'x-message-ttl': 7 * 24 * 60 * 60 * 1000, // 7 days TTL for DLQ
          },
        });

        await channel.bindQueue(`langchain.dlq.${priority}`, 'langchain.dlx', `failed.${priority}`);
      }

      // Health check queue
      await channel.assertQueue('langchain.health', {
        durable: false,
        autoDelete: true,
        messageTtl: 30000,
      });

      this.logger.log('RabbitMQ topology initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize topology: ${error.message}`);
      throw error;
    }
  }

  private async createQueue(channel: amqp.Channel, config: QueueConfiguration): Promise<void> {
    const args: any = {
      'x-max-priority': config.priority,
    };

    if (config.deadLetterExchange) {
      args['x-dead-letter-exchange'] = config.deadLetterExchange;
    }

    if (config.deadLetterRoutingKey) {
      args['x-dead-letter-routing-key'] = config.deadLetterRoutingKey;
    }

    if (config.messageTTL) {
      args['x-message-ttl'] = config.messageTTL;
    }

    await channel.assertQueue(config.name, {
      durable: config.durability,
      arguments: args,
    });

    this.logger.log(`Created queue: ${config.name} with priority ${config.priority}`);
  }

  async publishMessage<T>(routingKey: string, message: TaskMessage<T>, priority: TaskPriority = TaskPriority.NORMAL): Promise<boolean> {
    try {
      const channel = await this.getChannel('publisher');

      const messageBuffer = Buffer.from(JSON.stringify(message));
      const options: amqp.Options.Publish = {
        persistent: true,
        priority: this.getPriorityValue(priority),
        messageId: message.id,
        correlationId: message.metadata.correlationId,
        timestamp: Date.now(),
        headers: {
          'x-retry-count': message.metadata.retryCount,
          'x-original-routing-key': routingKey,
          'x-enqueued-at': message.enqueuedAt.toISOString(),
        },
      };

      const published = channel.publish('langchain.processing', routingKey, messageBuffer, options);

      if (published) {
        this.logger.debug(`Published message ${message.id} to ${routingKey}`);
      } else {
        this.logger.warn(`Failed to publish message ${message.id} - channel full`);
      }

      return published;
    } catch (error) {
      this.logger.error(`Failed to publish message: ${error.message}`);
      throw error;
    }
  }

  async getQueueInfo(queueName: string): Promise<amqp.Replies.AssertQueue> {
    const channel = await this.getChannel('admin');
    return channel.checkQueue(queueName);
  }

  async purgeQueue(queueName: string): Promise<amqp.Replies.PurgeQueue> {
    const channel = await this.getChannel('admin');
    const result = await channel.purgeQueue(queueName);
    this.logger.log(`Purged ${result.messageCount} messages from ${queueName}`);
    return result;
  }

  isConnected(): boolean {
    return this.connection !== null && !this.connection.destroyed;
  }

  private async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close all channels
    for (const [channelId, channel] of this.channels) {
      try {
        await channel.close();
        this.logger.log(`Closed channel: ${channelId}`);
      } catch (error) {
        this.logger.warn(`Error closing channel ${channelId}: ${error.message}`);
      }
    }
    this.channels.clear();

    // Close connection
    if (this.connection) {
      try {
        await this.connection.close();
        this.logger.log('RabbitMQ connection closed');
      } catch (error) {
        this.logger.warn(`Error closing connection: ${error.message}`);
      }
      this.connection = null;
    }
  }

  private getPriorityValue(priority: TaskPriority): number {
    const priorities = {
      [TaskPriority.CRITICAL]: 10,
      [TaskPriority.HIGH]: 7,
      [TaskPriority.NORMAL]: 5,
      [TaskPriority.LOW]: 1,
    };
    return priorities[priority] || 5;
  }

  private getTTLForPriority(priority: TaskPriority): number {
    const ttls = {
      [TaskPriority.CRITICAL]: 5 * 60 * 1000, // 5 minutes
      [TaskPriority.HIGH]: 15 * 60 * 1000, // 15 minutes
      [TaskPriority.NORMAL]: 60 * 60 * 1000, // 1 hour
      [TaskPriority.LOW]: 6 * 60 * 60 * 1000, // 6 hours
    };
    return ttls[priority] || 60 * 60 * 1000;
  }

  private getMaxRetriesForPriority(priority: TaskPriority): number {
    const retries = {
      [TaskPriority.CRITICAL]: 5,
      [TaskPriority.HIGH]: 4,
      [TaskPriority.NORMAL]: 3,
      [TaskPriority.LOW]: 2,
    };
    return retries[priority] || 3;
  }
}
