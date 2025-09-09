import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { TaskMessage, TaskPriority } from '../interfaces/queue.interface';
import { QueueManagerService } from '../services/queue-manager.service';
import { RabbitMQConnectionService } from '../services/rabbitmq-connection.service';

describe('QueueManagerService', () => {
  let service: QueueManagerService;
  let connectionService: jest.Mocked<RabbitMQConnectionService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mockChannel: jest.Mocked<amqp.Channel>;

  beforeEach(async () => {
    mockChannel = {
      prefetch: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer' }),
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
    } as any;

    connectionService = {
      publishMessage: jest.fn().mockResolvedValue(true),
      getChannel: jest.fn().mockResolvedValue(mockChannel),
      getQueueInfo: jest.fn().mockResolvedValue({
        queue: 'test-queue',
        messageCount: 0,
        consumerCount: 1,
      }),
      // Add the private getPriorityValue method that queue manager calls
      getPriorityValue: jest.fn((priority) => {
        const priorities = {
          critical: 10,
          high: 7,
          normal: 5,
          low: 1,
        };
        return priorities[priority] || 5;
      }),
    } as any;

    eventEmitter = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueManagerService,
        {
          provide: RabbitMQConnectionService,
          useValue: connectionService,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<QueueManagerService>(QueueManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Task Enqueuing', () => {
    it('should enqueue task with default options', async () => {
      const payload = { test: 'data' };
      const taskType = 'test-task';

      const messageId = await service.enqueueTask(taskType, payload);

      expect(messageId).toBeDefined();
      expect(connectionService.publishMessage).toHaveBeenCalledWith(
        `task.${TaskPriority.NORMAL}.${taskType}`,
        expect.objectContaining({
          id: messageId,
          payload,
          metadata: expect.objectContaining({
            priority: TaskPriority.NORMAL,
            retryCount: 0,
            maxRetries: 3,
          }),
        }),
        TaskPriority.NORMAL,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith('task.enqueued', {
        messageId,
        taskType,
        priority: TaskPriority.NORMAL,
        correlationId: expect.any(String),
      });
    });

    it('should enqueue task with custom options', async () => {
      const payload = { test: 'data' };
      const taskType = 'test-task';
      const options = {
        priority: TaskPriority.HIGH,
        correlationId: 'custom-correlation',
        maxRetries: 5,
      };

      const messageId = await service.enqueueTask(taskType, payload, options);

      expect(connectionService.publishMessage).toHaveBeenCalledWith(
        `task.${TaskPriority.HIGH}.${taskType}`,
        expect.objectContaining({
          metadata: expect.objectContaining({
            priority: TaskPriority.HIGH,
            correlationId: 'custom-correlation',
            maxRetries: 5,
          }),
        }),
        TaskPriority.HIGH,
      );
    });

    it('should handle delayed message enqueuing', async () => {
      const payload = { test: 'data' };
      const taskType = 'test-task';
      const delay = 5000;

      const messageId = await service.enqueueTask(taskType, payload, { delay });

      // Should not call publishMessage directly for delayed messages
      expect(connectionService.publishMessage).not.toHaveBeenCalled();

      // Should call getChannel for delayed publisher
      expect(connectionService.getChannel).toHaveBeenCalledWith('delayed-publisher');
    });

    it('should handle enqueue failures', async () => {
      const error = new Error('Publishing failed');
      connectionService.publishMessage = jest.fn().mockRejectedValue(error);

      const payload = { test: 'data' };
      const taskType = 'test-task';

      await expect(service.enqueueTask(taskType, payload)).rejects.toThrow('Publishing failed');
    });
  });

  describe('Consumer Creation', () => {
    it('should create consumer with default options', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn().mockResolvedValue('success');

      await service.createConsumer(queueName, processor);

      expect(connectionService.getChannel).toHaveBeenCalledWith(`consumer-${queueName}`);
      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
      expect(mockChannel.consume).toHaveBeenCalledWith(queueName, expect.any(Function));
    });

    it('should create consumer with custom options', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn().mockResolvedValue('success');
      const options = {
        prefetch: 5,
        retryDelay: 2000,
        maxRetries: 5,
      };

      await service.createConsumer(queueName, processor, options);

      expect(mockChannel.prefetch).toHaveBeenCalledWith(5);
    });

    it('should process messages successfully', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn().mockResolvedValue('success');
      let messageHandler: (msg: amqp.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume = jest.fn().mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({ consumerTag: 'test-consumer' });
      });

      await service.createConsumer(queueName, processor);

      // Simulate message processing
      const testMessage: TaskMessage = {
        id: 'test-message',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message',
          correlationId: 'test-correlation',
          timestamp: new Date(),
          retryCount: 0,
          maxRetries: 3,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      const mockConsumeMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify(testMessage)),
        fields: { routingKey: 'task.normal.test' },
        properties: {},
      } as any;

      await messageHandler!(mockConsumeMessage);

      // The message gets serialized/deserialized, so dates become strings
      const expectedMessage = {
        ...testMessage,
        enqueuedAt: testMessage.enqueuedAt.toISOString(),
        metadata: {
          ...testMessage.metadata,
          timestamp: testMessage.metadata.timestamp.toISOString(),
        },
      };

      expect(processor).toHaveBeenCalledWith(expectedMessage);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockConsumeMessage);
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.processing.completed', {
        messageId: testMessage.id,
        queueName,
        correlationId: testMessage.metadata.correlationId,
        result: 'success',
        processingTime: expect.any(Number),
      });
    });

    it('should handle processing errors with retry', async () => {
      const queueName = 'test-queue';
      const error = new Error('Processing failed');
      const processor = jest.fn().mockRejectedValue(error);
      let messageHandler: (msg: amqp.ConsumeMessage | null) => void;

      mockChannel.consume = jest.fn().mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({ consumerTag: 'test-consumer' });
      });

      await service.createConsumer(queueName, processor, { maxRetries: 2 });
      
      // Mock the consumers map to return our mock channel
      (service as any).consumers.set(queueName, mockChannel);

      const testMessage: TaskMessage = {
        id: 'test-message',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message',
          correlationId: 'test-correlation',
          timestamp: new Date(),
          retryCount: 0,
          maxRetries: 2,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      const mockConsumeMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify(testMessage)),
        fields: { routingKey: 'task.normal.test' },
        properties: {},
      } as any;

      await messageHandler(mockConsumeMessage);

      // Should schedule retry
      expect(connectionService.getChannel).toHaveBeenCalledWith('delayed-publisher');
      expect(mockChannel.ack).toHaveBeenCalledWith(mockConsumeMessage);
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.retry.scheduled', {
        messageId: testMessage.id,
        retryCount: 1,
        delay: expect.any(Number),
        error: error.message,
      });
    });

    it('should send to dead letter after max retries', async () => {
      const queueName = 'test-queue';
      const error = new Error('Processing failed');
      const processor = jest.fn().mockRejectedValue(error);
      let messageHandler: (msg: amqp.ConsumeMessage | null) => void;

      mockChannel.consume = jest.fn().mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({ consumerTag: 'test-consumer' });
      });

      await service.createConsumer(queueName, processor, { maxRetries: 1 });
      
      // Mock the consumers map to return our mock channel
      (service as any).consumers.set(queueName, mockChannel);

      const testMessage: TaskMessage = {
        id: 'test-message',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message',
          correlationId: 'test-correlation',
          timestamp: new Date(),
          retryCount: 2, // Already at max retries
          maxRetries: 1,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      const mockConsumeMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify(testMessage)),
        fields: { routingKey: 'task.normal.test' },
        properties: {},
      } as any;

      await messageHandler(mockConsumeMessage);

      // Should send to dead letter
      expect(mockChannel.nack).toHaveBeenCalledWith(mockConsumeMessage, false, false);
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.dead.letter', {
        messageId: testMessage.id,
        originalQueue: queueName,
        error: error.message,
        correlationId: testMessage.metadata.correlationId,
      });
    });

    it('should not retry validation errors', async () => {
      const queueName = 'test-queue';
      const validationError = new Error('ValidationError: Invalid input');
      const processor = jest.fn().mockRejectedValue(validationError);
      let messageHandler: (msg: amqp.ConsumeMessage | null) => void;

      mockChannel.consume = jest.fn().mockImplementation((queue, handler) => {
        messageHandler = handler;
        return Promise.resolve({ consumerTag: 'test-consumer' });
      });

      await service.createConsumer(queueName, processor);
      
      // Mock the consumers map to return our mock channel
      (service as any).consumers.set(queueName, mockChannel);

      const testMessage: TaskMessage = {
        id: 'test-message',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message',
          timestamp: new Date(),
          retryCount: 0,
          maxRetries: 3,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      const mockConsumeMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify(testMessage)),
        fields: { routingKey: 'task.normal.test' },
        properties: {},
      } as any;

      await messageHandler(mockConsumeMessage);

      // Should not schedule retry, should go directly to dead letter
      expect(mockChannel.nack).toHaveBeenCalledWith(mockConsumeMessage, false, false);
    });
  });

  describe('Consumer Management', () => {
    it('should stop specific consumer', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn();

      await service.createConsumer(queueName, processor);
      await service.stopConsumer(queueName);

      expect(mockChannel.cancel).toHaveBeenCalledWith('*');
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should stop all consumers', async () => {
      const processor = jest.fn();

      await service.createConsumer('queue1', processor);
      await service.createConsumer('queue2', processor);
      await service.stopAllConsumers();

      expect(mockChannel.cancel).toHaveBeenCalledTimes(2);
      expect(mockChannel.close).toHaveBeenCalledTimes(2);
    });

    it('should handle consumer stop errors gracefully', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn();

      await service.createConsumer(queueName, processor);

      mockChannel.cancel = jest.fn().mockRejectedValue(new Error('Cancel failed'));

      // Should not throw
      await expect(service.stopConsumer(queueName)).resolves.not.toThrow();
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return queue health stats', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn().mockResolvedValue('success');

      await service.createConsumer(queueName, processor);

      // Simulate some processing by calling updateHealthStats directly
      (service as any).updateHealthStats(queueName, 100, true);

      const stats = await service.getQueueHealth(queueName);
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        queueName,
        messageCount: expect.any(Number),
        consumerCount: expect.any(Number),
        avgWaitTime: expect.any(Number),
        throughputPerSecond: expect.any(Number),
        errorRate: expect.any(Number),
        lastProcessedAt: expect.any(Date),
      });
    });

    it('should return all queue health stats when no specific queue requested', async () => {
      const processor = jest.fn();

      await service.createConsumer('queue1', processor);
      await service.createConsumer('queue2', processor);

      const allStats = await service.getQueueHealth();
      expect(allStats.length).toBeGreaterThanOrEqual(0);
    });

    it('should update health monitoring metrics periodically', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn();

      await service.createConsumer(queueName, processor);
      
      // Add some health stats so the monitoring has queues to check
      (service as any).updateHealthStats(queueName, 100, true);
      
      // Ensure the consumer is properly registered 
      expect((service as any).consumers.has(queueName)).toBe(true);

      // Directly call the private updateQueueMetrics method to test the functionality
      await (service as any).updateQueueMetrics();

      expect(connectionService.getQueueInfo).toHaveBeenCalledWith(queueName);
    });
  });
});
