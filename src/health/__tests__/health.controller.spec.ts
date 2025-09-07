import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InfisicalService } from '../../infisical/infisical.service';
import { InitializationService } from '../../initialization/initialization.service';
import { RedisService } from '../../messaging/redis/redis.service';
import { QdrantService } from '../../vectors/services/qdrant.service';
import { HealthStatus, InitializationReportDto } from '../dto/health.dto';
import { HealthController } from '../health.controller';

// Mock the logger to avoid actual logging during tests
jest.mock('../../observability/services/structured-logger.service');

describe('HealthController', () => {
  let controller: HealthController;
  let _dataSource: jest.Mocked<DataSource>;
  let _infisicalService: jest.Mocked<InfisicalService>;
  let _initializationService: jest.Mocked<InitializationService>;
  let _redisService: jest.Mocked<RedisService>;
  let _qdrantService: jest.Mocked<QdrantService>;

  const mockDataSource = {
    isInitialized: true,
    query: jest.fn(),
  };

  const mockInfisicalService = {
    isReady: jest.fn(),
  };

  const mockInitializationService = {
    getInitializationStatus: jest.fn(),
  };

  const mockRedisService = {
    ping: jest.fn(),
  };

  const mockQdrantService = {
    client: {
      getCollections: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: InfisicalService,
          useValue: mockInfisicalService,
        },
        {
          provide: InitializationService,
          useValue: mockInitializationService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: QdrantService,
          useValue: mockQdrantService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    _dataSource = module.get(getDataSourceToken());
    _infisicalService = module.get(InfisicalService);
    _initializationService = module.get(InitializationService);
    _redisService = module.get(RedisService);
    _qdrantService = module.get(QdrantService);

    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset mockDataSource properties
    mockDataSource.isInitialized = true;
  });

  describe('getHealth', () => {
    beforeEach(() => {
      // Set up default successful responses
      mockDataSource.query.mockResolvedValue([{}]);
      mockRedisService.ping.mockResolvedValue('PONG');
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'test-collection' }],
      });
      mockInfisicalService.isReady.mockReturnValue(true);
      mockInitializationService.getInitializationStatus.mockReturnValue({
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        overallStatus: 'healthy',
        services: [],
        requiredActions: [],
      });
    });

    describe('healthy system', () => {
      it('should return healthy status when all services are operational', async () => {
        const result = await controller.getHealth();

        expect(result).toBeDefined();
        expect(result.status).toBe(HealthStatus.HEALTHY);
        expect(result.services).toHaveLength(4);
        expect(result.timestamp).toBeDefined();
        expect(result.uptime).toBeGreaterThan(0);

        // Check individual services
        const postgresqlService = result.services.find((s) => s.name === 'PostgreSQL');
        expect(postgresqlService?.status).toBe(HealthStatus.HEALTHY);
        expect(postgresqlService?.message).toBe('Connected and responsive');

        const redisService = result.services.find((s) => s.name === 'Redis');
        expect(redisService?.status).toBe(HealthStatus.HEALTHY);
        expect(redisService?.message).toBe('Connected and responsive');

        const qdrantService = result.services.find((s) => s.name === 'Qdrant');
        expect(qdrantService?.status).toBe(HealthStatus.HEALTHY);
        expect(qdrantService?.message).toBe('Connected, 1 collections');

        const infisicalService = result.services.find((s) => s.name === 'Infisical');
        expect(infisicalService?.status).toBe(HealthStatus.HEALTHY);
        expect(infisicalService?.message).toBe('Connected and ready');
      });

      it('should return empty requiredActions when system is healthy', async () => {
        const result = await controller.getHealth();

        expect(result.requiredActions).toBeUndefined();
      });

      it('should call all service health checks', async () => {
        await controller.getHealth();

        expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
        expect(mockRedisService.ping).toHaveBeenCalled();
        expect(mockQdrantService.client.getCollections).toHaveBeenCalled();
        expect(mockInfisicalService.isReady).toHaveBeenCalled();
        expect(mockInitializationService.getInitializationStatus).toHaveBeenCalled();
      });
    });

    describe('degraded system', () => {
      it('should return degraded status when optional services fail', async () => {
        // Make Qdrant fail (considered degraded, not unhealthy)
        mockQdrantService.client.getCollections.mockRejectedValue(new Error('Connection timeout'));
        mockInfisicalService.isReady.mockReturnValue(false);

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.DEGRADED);

        const qdrantService = result.services.find((s) => s.name === 'Qdrant');
        expect(qdrantService?.status).toBe(HealthStatus.DEGRADED);
        expect(qdrantService?.message).toBe('Not available - vector search disabled');

        const infisicalService = result.services.find((s) => s.name === 'Infisical');
        expect(infisicalService?.status).toBe(HealthStatus.DEGRADED);
        expect(infisicalService?.message).toBe('Not configured - using environment variables');
      });

      it('should include required actions when available', async () => {
        mockInitializationService.getInitializationStatus.mockReturnValue({
          timestamp: new Date('2024-01-01T12:00:00.000Z'),
          overallStatus: 'degraded',
          services: [],
          requiredActions: ['Configure Infisical secrets', 'Check Qdrant connection'],
        });

        const result = await controller.getHealth();

        expect(result.requiredActions).toEqual(['Configure Infisical secrets', 'Check Qdrant connection']);
      });
    });

    describe('unhealthy system', () => {
      it('should return unhealthy status when critical services fail', async () => {
        // Make critical services fail
        mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
        mockRedisService.ping.mockRejectedValue(new Error('Connection timeout'));

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);

        const postgresqlService = result.services.find((s) => s.name === 'PostgreSQL');
        expect(postgresqlService?.status).toBe(HealthStatus.UNHEALTHY);
        expect(postgresqlService?.message).toBe('Connection refused');

        const redisService = result.services.find((s) => s.name === 'Redis');
        expect(redisService?.status).toBe(HealthStatus.UNHEALTHY);
        expect(redisService?.message).toBe('Connection timeout');
      });

      it('should handle database not initialized', async () => {
        mockDataSource.isInitialized = false;

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);

        const postgresqlService = result.services.find((s) => s.name === 'PostgreSQL');
        expect(postgresqlService?.status).toBe(HealthStatus.UNHEALTHY);
        expect(postgresqlService?.message).toBe('Not initialized');
      });

      it('should handle non-Error exceptions', async () => {
        // For non-Error exceptions, the controller checks isInitialized first
        mockDataSource.isInitialized = false; // This will cause "Not initialized" message
        mockRedisService.ping.mockRejectedValue(123);

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);

        const postgresqlService = result.services.find((s) => s.name === 'PostgreSQL');
        expect(postgresqlService?.message).toBe('Not initialized');

        const redisService = result.services.find((s) => s.name === 'Redis');
        expect(redisService?.message).toBe('Connection failed');
      });
    });

    describe('mixed service states', () => {
      it('should prioritize unhealthy over degraded', async () => {
        // One critical service fails (unhealthy), one optional service fails (degraded)
        mockDataSource.query.mockRejectedValue(new Error('DB connection lost'));
        mockQdrantService.client.getCollections.mockRejectedValue(new Error('Qdrant unavailable'));

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.UNHEALTHY);
      });

      it('should return degraded when only optional services fail', async () => {
        // Ensure database is initialized and healthy
        mockDataSource.isInitialized = true;
        mockDataSource.query.mockResolvedValue([{}]);
        mockRedisService.ping.mockResolvedValue('PONG');
        // Make optional services fail
        mockQdrantService.client.getCollections.mockRejectedValue(new Error('Qdrant unavailable'));
        mockInfisicalService.isReady.mockReturnValue(false);

        const result = await controller.getHealth();

        expect(result.status).toBe(HealthStatus.DEGRADED);
      });
    });
  });

  describe('getReadiness', () => {
    describe('ready state', () => {
      beforeEach(() => {
        mockDataSource.query.mockResolvedValue([{}]);
        mockRedisService.ping.mockResolvedValue('PONG');
      });

      it('should return ready when critical services are available', async () => {
        const result = await controller.getReadiness();

        expect(result).toEqual({ status: 'ready' });
        expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
        expect(mockRedisService.ping).toHaveBeenCalled();
      });
    });

    describe('not ready state', () => {
      it('should throw ServiceUnavailableException when database fails', async () => {
        mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
        mockRedisService.ping.mockResolvedValue('PONG');

        await expect(controller.getReadiness()).rejects.toThrow(HttpException);

        try {
          await controller.getReadiness();
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

          const response = (error as HttpException).getResponse() as any;
          expect(response.statusCode).toBe(503);
          expect(response.message).toBe('Service not ready');
          expect(response.error).toBe('Service Unavailable');
          expect(response.timestamp).toBeDefined();
          expect(response.path).toBe('/health/ready');
          expect(response.details).toBe('Connection refused');
        }
      });

      it('should throw ServiceUnavailableException when Redis fails', async () => {
        mockDataSource.query.mockResolvedValue([{}]);
        mockRedisService.ping.mockRejectedValue(new Error('Redis timeout'));

        await expect(controller.getReadiness()).rejects.toThrow(HttpException);

        try {
          await controller.getReadiness();
        } catch (error) {
          const response = (error as HttpException).getResponse() as any;
          expect(response.details).toBe('Redis timeout');
        }
      });

      it('should handle non-Error exceptions', async () => {
        mockDataSource.query.mockRejectedValue('String error');
        mockRedisService.ping.mockResolvedValue('PONG');

        try {
          await controller.getReadiness();
        } catch (error) {
          const response = (error as HttpException).getResponse() as any;
          expect(response.details).toBe('Unknown error');
        }
      });
    });
  });

  describe('getLiveness', () => {
    it('should always return alive status', () => {
      const result = controller.getLiveness();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should return timestamp in ISO format', () => {
      const result = controller.getLiveness();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should not call any dependencies', () => {
      controller.getLiveness();

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockRedisService.ping).not.toHaveBeenCalled();
      expect(mockQdrantService.client.getCollections).not.toHaveBeenCalled();
      expect(mockInfisicalService.isReady).not.toHaveBeenCalled();
      expect(mockInitializationService.getInitializationStatus).not.toHaveBeenCalled();
    });
  });

  describe('getStartupReport', () => {
    it('should return initialization status from service', () => {
      const mockReport = {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        overallStatus: 'healthy' as const,
        services: [],
        requiredActions: ['Configure secrets'],
      };

      mockInitializationService.getInitializationStatus.mockReturnValue(mockReport);

      const expectedDto: InitializationReportDto = {
        status: 'healthy',
        startedAt: '2024-01-01T12:00:00.000Z',
        completedAt: '2024-01-01T12:00:00.000Z',
        duration: 0,
        requiredActions: ['Configure secrets'],
      };

      const result = controller.getStartupReport();

      expect(result).toEqual(expectedDto);
      expect(mockInitializationService.getInitializationStatus).toHaveBeenCalled();
    });

    it('should return different statuses from initialization service', () => {
      const incompleteReport = {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        overallStatus: 'degraded' as const,
        services: [],
        requiredActions: ['Wait for database migration', 'Load initial configuration'],
      };

      mockInitializationService.getInitializationStatus.mockReturnValue(incompleteReport);

      const result = controller.getStartupReport();

      expect(result.status).toBe('degraded');
      expect(result.requiredActions).toHaveLength(2);
    });
  });

  describe('error handling and logging', () => {
    it('should handle complex error scenarios gracefully', async () => {
      // Simulate mixed success and failure
      mockDataSource.query.mockResolvedValue([{}]); // Success
      mockRedisService.ping.mockRejectedValue(new Error('Redis connection lost')); // Failure
      mockQdrantService.client.getCollections.mockResolvedValue({ collections: [] }); // Success with no collections
      mockInfisicalService.isReady.mockReturnValue(true); // Success

      const result = await controller.getHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.services).toHaveLength(4);

      const healthyServices = result.services.filter((s) => s.status === HealthStatus.HEALTHY);
      const unhealthyServices = result.services.filter((s) => s.status === HealthStatus.UNHEALTHY);

      expect(healthyServices).toHaveLength(3); // PostgreSQL, Qdrant, and Infisical
      expect(unhealthyServices).toHaveLength(1); // Redis
    });

    it('should provide detailed error information', async () => {
      const specificError = new Error('Specific connection error with details');
      // Make sure dataSource is initialized so the query is actually called
      mockDataSource.isInitialized = true;
      mockDataSource.query.mockRejectedValue(specificError);

      const result = await controller.getHealth();

      const postgresqlService = result.services.find((s) => s.name === 'PostgreSQL');
      expect(postgresqlService?.message).toBe('Specific connection error with details');
    });
  });

  describe('timing and performance', () => {
    it('should calculate uptime correctly', async () => {
      // Set up successful health check
      mockDataSource.query.mockResolvedValue([{}]);
      mockRedisService.ping.mockResolvedValue('PONG');
      mockQdrantService.client.getCollections.mockResolvedValue({ collections: [] });
      mockInfisicalService.isReady.mockReturnValue(true);
      mockInitializationService.getInitializationStatus.mockReturnValue({
        timestamp: new Date(),
        overallStatus: 'healthy',
        services: [],
        requiredActions: [],
      });

      // Add a small delay to ensure uptime > 0
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await controller.getHealth();

      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof result.uptime).toBe('number');
    });

    it('should include recent timestamp', async () => {
      const beforeCall = Date.now();

      const result = await controller.getHealth();

      const afterCall = Date.now();
      const resultTime = new Date(result.timestamp).getTime();

      expect(resultTime).toBeGreaterThanOrEqual(beforeCall);
      expect(resultTime).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('service status aggregation', () => {
    it('should correctly aggregate multiple service statuses', async () => {
      // Simulate a complex real-world scenario - all critical services healthy, optional services degraded
      mockDataSource.isInitialized = true;
      mockDataSource.query.mockResolvedValue([{}]); // Healthy
      mockRedisService.ping.mockResolvedValue('PONG'); // Healthy
      mockQdrantService.client.getCollections.mockRejectedValue(new Error('Timeout')); // Degraded
      mockInfisicalService.isReady.mockReturnValue(false); // Degraded

      const result = await controller.getHealth();

      expect(result.status).toBe(HealthStatus.DEGRADED);

      const serviceStatuses = result.services.map((s) => s.status);
      expect(serviceStatuses).toContain(HealthStatus.HEALTHY);
      expect(serviceStatuses).toContain(HealthStatus.DEGRADED);
      expect(serviceStatuses).not.toContain(HealthStatus.UNHEALTHY);
    });
  });
});
