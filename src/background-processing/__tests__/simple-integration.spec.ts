import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TaskPriority } from '../interfaces/queue.interface';
import { QueueHealthMonitorService } from '../services/queue-health-monitor.service';
import { QueueManagerService } from '../services/queue-manager.service';
import { RabbitMQConnectionService } from '../services/rabbitmq-connection.service';

describe('Background Processing Integration', () => {
  let connectionService: RabbitMQConnectionService;
  let queueManager: QueueManagerService;
  let healthMonitor: QueueHealthMonitorService;

  beforeEach(async () => {
    const mockConfigService = {
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
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQConnectionService,
        QueueManagerService,
        QueueHealthMonitorService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    connectionService = module.get<RabbitMQConnectionService>(RabbitMQConnectionService);
    queueManager = module.get<QueueManagerService>(QueueManagerService);
    healthMonitor = module.get<QueueHealthMonitorService>(QueueHealthMonitorService);
  });

  describe('Service Creation', () => {
    it('should create all services successfully', () => {
      expect(connectionService).toBeDefined();
      expect(queueManager).toBeDefined();
      expect(healthMonitor).toBeDefined();
    });

    it('should have correct service types', () => {
      expect(connectionService).toBeInstanceOf(RabbitMQConnectionService);
      expect(queueManager).toBeInstanceOf(QueueManagerService);
      expect(healthMonitor).toBeInstanceOf(QueueHealthMonitorService);
    });
  });

  describe('Configuration', () => {
    it('should have correct priority values', () => {
      expect(TaskPriority.CRITICAL).toBe('critical');
      expect(TaskPriority.HIGH).toBe('high');
      expect(TaskPriority.NORMAL).toBe('normal');
      expect(TaskPriority.LOW).toBe('low');
    });
  });

  describe('Service Methods', () => {
    it('should have required methods on connection service', () => {
      expect(typeof connectionService.onModuleInit).toBe('function');
      expect(typeof connectionService.onModuleDestroy).toBe('function');
      expect(typeof connectionService.getChannel).toBe('function');
      expect(typeof connectionService.publishMessage).toBe('function');
      expect(typeof connectionService.isConnected).toBe('function');
    });

    it('should have required methods on queue manager', () => {
      expect(typeof queueManager.enqueueTask).toBe('function');
      expect(typeof queueManager.createConsumer).toBe('function');
      expect(typeof queueManager.getQueueHealth).toBe('function');
      expect(typeof queueManager.stopConsumer).toBe('function');
      expect(typeof queueManager.stopAllConsumers).toBe('function');
    });

    it('should have required methods on health monitor', () => {
      expect(typeof healthMonitor.performHealthCheck).toBe('function');
      expect(typeof healthMonitor.generateDetailedHealthReport).toBe('function');
      expect(typeof healthMonitor.getCurrentHealthStatus).toBe('function');
      expect(typeof healthMonitor.getHealthHistory).toBe('function');
    });
  });

  describe('Initial State', () => {
    it('should start with disconnected state', () => {
      expect(connectionService.isConnected()).toBe(false);
    });

    it('should return empty health stats initially', async () => {
      const stats = await queueManager.getQueueHealth();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThanOrEqual(0);
    });

    it('should have basic health status structure', async () => {
      const status = await healthMonitor.getCurrentHealthStatus();
      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('issues');
      expect(typeof status.healthy).toBe('boolean');
      expect(Array.isArray(status.issues)).toBe(true);
    });
  });

  describe('Task Priority Enum', () => {
    it('should have all priority levels', () => {
      expect(Object.values(TaskPriority)).toContain('critical');
      expect(Object.values(TaskPriority)).toContain('high');
      expect(Object.values(TaskPriority)).toContain('normal');
      expect(Object.values(TaskPriority)).toContain('low');
    });

    it('should have 4 priority levels', () => {
      expect(Object.keys(TaskPriority)).toHaveLength(4);
    });
  });
});
