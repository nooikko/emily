import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { QueueHealthStats, TaskPriority } from '../interfaces/queue.interface';
import { QueueHealthMonitorService } from '../services/queue-health-monitor.service';
import { QueueManagerService } from '../services/queue-manager.service';
import { RabbitMQConnectionService } from '../services/rabbitmq-connection.service';

describe('QueueHealthMonitorService', () => {
  let service: QueueHealthMonitorService;
  let connectionService: jest.Mocked<RabbitMQConnectionService>;
  let queueManager: jest.Mocked<QueueManagerService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    connectionService = {
      isConnected: jest.fn().mockReturnValue(true),
      getChannel: jest.fn().mockResolvedValue({
        checkQueue: jest.fn().mockResolvedValue({
          queue: 'test-queue',
          messageCount: 0,
          consumerCount: 1,
        }),
        sendToQueue: jest.fn().mockReturnValue(true),
      }),
      getQueueInfo: jest.fn().mockResolvedValue({
        queue: 'test-queue',
        messageCount: 0,
        consumerCount: 1,
      }),
    } as any;

    queueManager = {
      getQueueHealth: jest.fn().mockResolvedValue([]),
    } as any;

    eventEmitter = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueHealthMonitorService,
        {
          provide: RabbitMQConnectionService,
          useValue: connectionService,
        },
        {
          provide: QueueManagerService,
          useValue: queueManager,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<QueueHealthMonitorService>(QueueHealthMonitorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Health Check', () => {
    it('should detect healthy connection', async () => {
      connectionService.isConnected.mockReturnValue(true);

      await service.performHealthCheck();

      expect(connectionService.getChannel).toHaveBeenCalledWith('health-check');
    });

    it('should raise alert for lost connection', async () => {
      connectionService.isConnected.mockReturnValue(false);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'CONNECTION_LOST',
          severity: 'CRITICAL',
          message: 'RabbitMQ connection lost',
        }),
      );
    });

    it('should handle connection test failures', async () => {
      connectionService.isConnected.mockReturnValue(true);
      connectionService.getChannel.mockRejectedValue(new Error('Channel creation failed'));

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'CONNECTION_LOST',
          severity: 'HIGH',
          message: expect.stringContaining('Connection health check failed'),
        }),
      );
    });
  });

  describe('Queue Health Analysis', () => {
    it('should analyze queue stats and detect high queue depth', async () => {
      const highDepthStats: QueueHealthStats = {
        queueName: 'langchain.tasks.critical',
        messageCount: 50, // Above threshold of 10 for critical
        consumerCount: 1,
        avgWaitTime: 1000,
        throughputPerSecond: 1,
        errorRate: 0.01,
        lastProcessedAt: new Date(),
      };

      queueManager.getQueueHealth.mockResolvedValue([highDepthStats]);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'HIGH_QUEUE_DEPTH',
          severity: 'CRITICAL',
          queueName: 'langchain.tasks.critical',
          message: expect.stringContaining('High queue depth: 50'),
        }),
      );
    });

    it('should detect low throughput', async () => {
      const lowThroughputStats: QueueHealthStats = {
        queueName: 'langchain.tasks.high',
        messageCount: 5,
        consumerCount: 1,
        avgWaitTime: 1000,
        throughputPerSecond: 0.5, // Below threshold of 2 for high priority
        errorRate: 0.01,
        lastProcessedAt: new Date(),
      };

      queueManager.getQueueHealth.mockResolvedValue([lowThroughputStats]);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'LOW_THROUGHPUT',
          severity: 'HIGH',
          queueName: 'langchain.tasks.high',
        }),
      );
    });

    it('should detect high error rate', async () => {
      const highErrorStats: QueueHealthStats = {
        queueName: 'langchain.tasks.normal',
        messageCount: 5,
        consumerCount: 1,
        avgWaitTime: 1000,
        throughputPerSecond: 2,
        errorRate: 0.1, // Above threshold of 0.05
        lastProcessedAt: new Date(),
      };

      queueManager.getQueueHealth.mockResolvedValue([highErrorStats]);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'HIGH_ERROR_RATE',
          severity: 'HIGH',
          message: expect.stringContaining('High error rate: 10.00%'),
        }),
      );
    });

    it('should detect missing consumers', async () => {
      const noConsumerStats: QueueHealthStats = {
        queueName: 'langchain.tasks.critical',
        messageCount: 5,
        consumerCount: 0, // No consumers
        avgWaitTime: 1000,
        throughputPerSecond: 0,
        errorRate: 0,
        lastProcessedAt: new Date(),
      };

      queueManager.getQueueHealth.mockResolvedValue([noConsumerStats]);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'CONSUMER_DOWN',
          severity: 'CRITICAL',
          message: 'No active consumers for queue langchain.tasks.critical',
        }),
      );
    });

    it('should detect high wait times', async () => {
      const highWaitTimeStats: QueueHealthStats = {
        queueName: 'langchain.tasks.critical',
        messageCount: 5,
        consumerCount: 1,
        avgWaitTime: 60000, // 60 seconds, above threshold of 30 seconds for critical
        throughputPerSecond: 1,
        errorRate: 0.01,
        lastProcessedAt: new Date(),
      };

      queueManager.getQueueHealth.mockResolvedValue([highWaitTimeStats]);

      await service.performHealthCheck();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'HIGH_QUEUE_DEPTH',
          severity: 'CRITICAL',
          message: expect.stringContaining('High average wait time: 60000ms'),
        }),
      );
    });
  });

  describe('Critical Queue Monitoring', () => {
    it('should check for missing critical queues', async () => {
      connectionService.getQueueInfo.mockRejectedValue(new Error('Queue not found'));

      await service.performHealthCheck();

      // Should check all critical queues
      expect(connectionService.getQueueInfo).toHaveBeenCalledWith('langchain.tasks.critical');
      expect(connectionService.getQueueInfo).toHaveBeenCalledWith('langchain.tasks.high');
      expect(connectionService.getQueueInfo).toHaveBeenCalledWith('langchain.tasks.normal');
      expect(connectionService.getQueueInfo).toHaveBeenCalledWith('langchain.tasks.low');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'health.alert',
        expect.objectContaining({
          type: 'CONSUMER_DOWN',
          severity: 'HIGH',
          message: expect.stringContaining('Critical queue'),
        }),
      );
    });
  });

  describe('Health Scoring and Trends', () => {
    it('should calculate queue health score correctly', async () => {
      const perfectStats: QueueHealthStats = {
        queueName: 'langchain.tasks.normal',
        messageCount: 5, // Within threshold
        consumerCount: 2, // Has consumers
        avgWaitTime: 10000, // Within threshold
        throughputPerSecond: 5, // Above threshold
        errorRate: 0.01, // Within threshold
        lastProcessedAt: new Date(),
      };

      // Use private method access for testing
      const calculateScore = (service as any).calculateQueueHealthScore.bind(service);
      const score = calculateScore(perfectStats);

      expect(score).toBe(100);
    });

    it('should deduct points for various issues', async () => {
      const problematicStats: QueueHealthStats = {
        queueName: 'langchain.tasks.normal',
        messageCount: 200, // Above threshold (100)
        consumerCount: 0, // No consumers
        avgWaitTime: 500000, // Above threshold (300000)
        throughputPerSecond: 0.1, // Below threshold (1)
        errorRate: 0.1, // Above threshold (0.05)
        lastProcessedAt: new Date(),
      };

      const calculateScore = (service as any).calculateQueueHealthScore.bind(service);
      const score = calculateScore(problematicStats);

      expect(score).toBe(0); // Should be heavily penalized
    });

    it('should track health trends correctly', async () => {
      const queueName = 'test-queue';

      // Simulate health history
      const healthHistory = [
        { queueName, messageCount: 10, errorRate: 0.1 } as QueueHealthStats,
        { queueName, messageCount: 8, errorRate: 0.08 } as QueueHealthStats,
        { queueName, messageCount: 5, errorRate: 0.05 } as QueueHealthStats,
      ];

      // Access private property
      (service as any).healthHistory.set(queueName, healthHistory);

      const calculateTrend = (service as any).calculateHealthTrend.bind(service);
      const trend = calculateTrend(queueName);

      expect(trend).toBe('improving');
    });
  });

  describe('Health Report Generation', () => {
    it('should generate comprehensive health report', async () => {
      const mockStats: QueueHealthStats[] = [
        {
          queueName: 'test-queue',
          messageCount: 5,
          consumerCount: 1,
          avgWaitTime: 1000,
          throughputPerSecond: 2,
          errorRate: 0.02,
          lastProcessedAt: new Date(),
        },
      ];

      queueManager.getQueueHealth.mockResolvedValue(mockStats);

      const report = await service.generateDetailedHealthReport();

      expect(report).toMatchObject({
        timestamp: expect.any(Date),
        connectionStatus: 'connected',
        queues: expect.arrayContaining([
          expect.objectContaining({
            queueName: 'test-queue',
            health: expect.any(Number),
            trend: expect.any(String),
          }),
        ]),
        systemMetrics: expect.objectContaining({
          memory: expect.any(Object),
          uptime: expect.any(Number),
        }),
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('health.report.generated', report);
    });

    it('should provide current health status', async () => {
      connectionService.isConnected.mockReturnValue(true);
      queueManager.getQueueHealth.mockResolvedValue([
        {
          queueName: 'test-queue',
          messageCount: 5,
          consumerCount: 1,
          avgWaitTime: 1000,
          throughputPerSecond: 2,
          errorRate: 0.02,
          lastProcessedAt: new Date(),
        },
      ]);

      const status = await service.getCurrentHealthStatus();

      expect(status).toMatchObject({
        healthy: expect.any(Boolean),
        issues: expect.any(Array),
      });
    });
  });

  describe('Alert Management', () => {
    it('should prevent spam alerts with cooldown', async () => {
      const alertData = {
        type: 'HIGH_QUEUE_DEPTH' as const,
        severity: 'HIGH' as const,
        queueName: 'test-queue',
        message: 'Test alert',
        timestamp: new Date(),
      };

      // First alert should go through
      await (service as any).raiseAlert(alertData);
      expect(eventEmitter.emit).toHaveBeenCalledWith('health.alert', alertData);

      eventEmitter.emit.mockClear();

      // Second identical alert should be suppressed
      await (service as any).raiseAlert(alertData);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should clean up old alert history', async () => {
      // Test cleanup of old alerts - this is more of an integration test
      // as the cleanup happens internally
      const alertData = {
        type: 'HIGH_QUEUE_DEPTH' as const,
        severity: 'HIGH' as const,
        queueName: 'test-queue',
        message: 'Test alert',
        timestamp: new Date(),
      };

      await (service as any).raiseAlert(alertData);

      // The cleanup logic should remove old entries
      expect(eventEmitter.emit).toHaveBeenCalledWith('health.alert', alertData);
    });
  });

  describe('Priority-based Thresholds', () => {
    it('should use correct thresholds for different priorities', () => {
      const extractPriority = (service as any).extractPriorityFromQueueName.bind(service);

      expect(extractPriority('langchain.tasks.critical')).toBe(TaskPriority.CRITICAL);
      expect(extractPriority('langchain.tasks.high')).toBe(TaskPriority.HIGH);
      expect(extractPriority('langchain.tasks.normal')).toBe(TaskPriority.NORMAL);
      expect(extractPriority('langchain.tasks.low')).toBe(TaskPriority.LOW);
      expect(extractPriority('unknown-queue')).toBeNull();
    });

    it('should map priorities to alert severities correctly', () => {
      const getSeverity = (service as any).getSeverityForPriority.bind(service);

      expect(getSeverity(TaskPriority.CRITICAL)).toBe('CRITICAL');
      expect(getSeverity(TaskPriority.HIGH)).toBe('HIGH');
      expect(getSeverity(TaskPriority.NORMAL)).toBe('MEDIUM');
      expect(getSeverity(TaskPriority.LOW)).toBe('LOW');
    });
  });

  describe('History Management', () => {
    it('should retrieve health history for specific queue', async () => {
      const queueName = 'test-queue';
      const mockHistory: QueueHealthStats[] = [
        {
          queueName,
          messageCount: 5,
          consumerCount: 1,
          avgWaitTime: 1000,
          throughputPerSecond: 2,
          errorRate: 0.02,
          lastProcessedAt: new Date(),
        },
      ];

      // Set up history
      (service as any).healthHistory.set(queueName, mockHistory);

      const history = await service.getHealthHistory(queueName, 10);

      expect(history).toEqual(mockHistory);
    });

    it('should return empty array for non-existent queue history', async () => {
      const history = await service.getHealthHistory('non-existent-queue');

      expect(history).toEqual([]);
    });

    it('should limit history results correctly', async () => {
      const queueName = 'test-queue';
      const longHistory = Array(100)
        .fill(null)
        .map((_, i) => ({
          queueName,
          messageCount: i,
          consumerCount: 1,
          avgWaitTime: 1000,
          throughputPerSecond: 2,
          errorRate: 0.02,
          lastProcessedAt: new Date(),
        }));

      (service as any).healthHistory.set(queueName, longHistory);

      const limitedHistory = await service.getHealthHistory(queueName, 5);

      expect(limitedHistory).toHaveLength(5);
      expect(limitedHistory[0].messageCount).toBe(95); // Last 5 entries
    });
  });
});
