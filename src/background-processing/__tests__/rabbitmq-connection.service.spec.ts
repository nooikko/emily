import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { TaskMessage, TaskPriority } from '../interfaces/queue.interface';
import { RabbitMQConnectionService } from '../services/rabbitmq-connection.service';

// Mock amqplib
jest.mock('amqplib');
const mockAmqp = amqp as jest.Mocked<typeof amqp>;

describe('RabbitMQConnectionService', () => {
  let service: RabbitMQConnectionService;
  let configService: ConfigService;
  let mockConnection: jest.Mocked<amqp.Connection>;
  let mockChannel: jest.Mocked<amqp.Channel>;

  beforeEach(async () => {
    // Create mocked connection and channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue', messageCount: 0, consumerCount: 0 }),
      bindQueue: jest.fn().mockResolvedValue({}),
      prefetch: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
      checkQueue: jest.fn().mockResolvedValue({ queue: 'test-queue', messageCount: 0, consumerCount: 0 }),
      purgeQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
      connection: { destroyed: false },
    } as any;

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
      destroyed: false,
    } as any;

    mockAmqp.connect = jest.fn().mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQConnectionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                RABBITMQ_HOST: 'localhost',
                RABBITMQ_PORT: 5672,
                RABBITMQ_USERNAME: 'test',
                RABBITMQ_PASSWORD: 'test',
                RABBITMQ_VHOST: '/',
                RABBITMQ_MAX_CONNECTIONS: 10,
                RABBITMQ_RECONNECT_DELAY: 1000,
                RABBITMQ_HEARTBEAT: 60,
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQConnectionService>(RabbitMQConnectionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish connection on module init', async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;

      await service.onModuleInit();

      expect(mockAmqp.connect).toHaveBeenCalledWith(
        'amqp://test:test@localhost:5672/',
        expect.objectContaining({
          heartbeat: 60,
          clientProperties: {
            connection_name: 'Emily-BackgroundProcessor',
          },
        }),
      );
    });

    it('should initialize topology with exchanges and queues', async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;

      await service.onModuleInit();

      // Verify main exchange creation
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'langchain.processing',
        'topic',
        expect.objectContaining({
          durable: true,
          arguments: {
            'x-delayed-type': 'topic',
          },
        }),
      );

      // Verify dead letter exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('langchain.dlx', 'direct', { durable: true });

      // Verify priority queues creation
      const priorities = ['critical', 'high', 'normal', 'low'];
      for (const priority of priorities) {
        expect(mockChannel.assertQueue).toHaveBeenCalledWith(
          `langchain.tasks.${priority}`,
          expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({
              'x-dead-letter-exchange': 'langchain.dlx',
              'x-dead-letter-routing-key': `failed.${priority}`,
            }),
          }),
        );

        expect(mockChannel.bindQueue).toHaveBeenCalledWith(`langchain.tasks.${priority}`, 'langchain.processing', `task.${priority}.*`);
      }
    });

    it('should handle connection errors gracefully', async () => {
      const connectionError = new Error('Connection failed');
      mockAmqp.connect = jest.fn().mockRejectedValue(connectionError);

      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      await expect(service.onModuleInit()).rejects.toThrow();
    });

    it('should return connection status correctly', async () => {
      expect(service.isConnected()).toBe(false);

      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);

      await service.onModuleDestroy();
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('Channel Management', () => {
    beforeEach(async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;
      await service.onModuleInit();
    });

    it('should create and cache channels', async () => {
      const channel1 = await service.getChannel('test-channel');
      const channel2 = await service.getChannel('test-channel');

      expect(channel1).toBe(channel2);
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(2); // Once for topology, once for test-channel
    });

    it('should create new channel if cached channel is closed', async () => {
      const channel1 = await service.getChannel('test-channel');

      // Simulate channel closure
      mockChannel.connection.destroyed = true;

      const channel2 = await service.getChannel('test-channel');

      expect(channel1).not.toBe(channel2);
    });

    it('should set prefetch on new channels', async () => {
      await service.getChannel('test-channel');

      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
    });

    it('should throw error when connection is not established', async () => {
      const newService = new RabbitMQConnectionService(configService);

      await expect(newService.getChannel('test')).rejects.toThrow('RabbitMQ connection not established');
    });
  });

  describe('Message Publishing', () => {
    beforeEach(async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;
      await service.onModuleInit();
    });

    it('should publish message with correct parameters', async () => {
      const taskMessage: TaskMessage = {
        id: 'test-message-1',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message-1',
          correlationId: 'corr-123',
          timestamp: new Date(),
          retryCount: 0,
          maxRetries: 3,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      const result = await service.publishMessage('task.normal.test', taskMessage, TaskPriority.NORMAL);

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'langchain.processing',
        'task.normal.test',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          priority: 5,
          messageId: taskMessage.id,
          correlationId: taskMessage.metadata.correlationId,
          headers: expect.objectContaining({
            'x-retry-count': 0,
            'x-original-routing-key': 'task.normal.test',
          }),
        }),
      );
    });

    it('should handle publishing failures', async () => {
      const taskMessage: TaskMessage = {
        id: 'test-message-1',
        payload: { test: 'data' },
        metadata: {
          id: 'test-message-1',
          timestamp: new Date(),
          retryCount: 0,
          maxRetries: 3,
          priority: TaskPriority.NORMAL,
        },
        enqueuedAt: new Date(),
      };

      mockChannel.publish = jest.fn().mockImplementation(() => {
        throw new Error('Publishing failed');
      });

      await expect(service.publishMessage('task.normal.test', taskMessage)).rejects.toThrow('Publishing failed');
    });

    it('should use correct priority values for different priorities', async () => {
      const priorities = [
        { priority: TaskPriority.CRITICAL, expectedValue: 10 },
        { priority: TaskPriority.HIGH, expectedValue: 7 },
        { priority: TaskPriority.NORMAL, expectedValue: 5 },
        { priority: TaskPriority.LOW, expectedValue: 1 },
      ];

      for (const { priority, expectedValue } of priorities) {
        const taskMessage: TaskMessage = {
          id: `test-message-${priority}`,
          payload: { test: 'data' },
          metadata: {
            id: `test-message-${priority}`,
            timestamp: new Date(),
            retryCount: 0,
            maxRetries: 3,
            priority,
          },
          enqueuedAt: new Date(),
        };

        await service.publishMessage(`task.${priority}.test`, taskMessage, priority);

        expect(mockChannel.publish).toHaveBeenCalledWith(
          'langchain.processing',
          `task.${priority}.test`,
          expect.any(Buffer),
          expect.objectContaining({
            priority: expectedValue,
          }),
        );
      }
    });
  });

  describe('Queue Operations', () => {
    beforeEach(async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;
      await service.onModuleInit();
    });

    it('should get queue information', async () => {
      const expectedQueueInfo = {
        queue: 'test-queue',
        messageCount: 5,
        consumerCount: 2,
      };

      mockChannel.checkQueue = jest.fn().mockResolvedValue(expectedQueueInfo);

      const result = await service.getQueueInfo('test-queue');

      expect(result).toEqual(expectedQueueInfo);
      expect(mockChannel.checkQueue).toHaveBeenCalledWith('test-queue');
    });

    it('should purge queue and return message count', async () => {
      const expectedPurgeResult = { messageCount: 10 };
      mockChannel.purgeQueue = jest.fn().mockResolvedValue(expectedPurgeResult);

      const result = await service.purgeQueue('test-queue');

      expect(result).toEqual(expectedPurgeResult);
      expect(mockChannel.purgeQueue).toHaveBeenCalledWith('test-queue');
    });
  });

  describe('Resource Cleanup', () => {
    beforeEach(async () => {
      // Mock the private connection property to simulate successful connection
      (service as any).connection = mockConnection;
      await service.onModuleInit();
    });

    it('should close all channels and connection on destroy', async () => {
      // Create some channels
      await service.getChannel('channel1');
      await service.getChannel('channel2');

      await service.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalledTimes(3); // topology + 2 test channels
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle errors during cleanup gracefully', async () => {
      await service.getChannel('test-channel');

      mockChannel.close = jest.fn().mockRejectedValue(new Error('Close failed'));
      mockConnection.close = jest.fn().mockRejectedValue(new Error('Connection close failed'));

      // Should not throw
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('Priority and Configuration Helpers', () => {
    it('should return correct TTL values for priorities', () => {
      const service = new RabbitMQConnectionService(configService);

      // Access private method for testing
      const getTTLForPriority = (service as any).getTTLForPriority.bind(service);

      expect(getTTLForPriority(TaskPriority.CRITICAL)).toBe(5 * 60 * 1000);
      expect(getTTLForPriority(TaskPriority.HIGH)).toBe(15 * 60 * 1000);
      expect(getTTLForPriority(TaskPriority.NORMAL)).toBe(60 * 60 * 1000);
      expect(getTTLForPriority(TaskPriority.LOW)).toBe(6 * 60 * 60 * 1000);
    });

    it('should return correct max retries for priorities', () => {
      const service = new RabbitMQConnectionService(configService);

      const getMaxRetriesForPriority = (service as any).getMaxRetriesForPriority.bind(service);

      expect(getMaxRetriesForPriority(TaskPriority.CRITICAL)).toBe(5);
      expect(getMaxRetriesForPriority(TaskPriority.HIGH)).toBe(4);
      expect(getMaxRetriesForPriority(TaskPriority.NORMAL)).toBe(3);
      expect(getMaxRetriesForPriority(TaskPriority.LOW)).toBe(2);
    });
  });
});
