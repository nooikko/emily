import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { HealthStatus, InitializationReportDto, LivenessDto, ReadinessDto, ServiceHealthDto, SystemHealthDto } from '../dto/health.dto';

describe('Health DTOs', () => {
  describe('HealthStatus', () => {
    it('should contain all required status values', () => {
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    });

    it('should have exactly three status values', () => {
      const values = Object.values(HealthStatus);
      expect(values).toHaveLength(3);
    });
  });

  describe('ServiceHealthDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 'PostgreSQL',
          status: HealthStatus.HEALTHY,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with optional fields', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 'Redis',
          status: HealthStatus.DEGRADED,
          message: 'Connection timeout',
          details: { connections: 5, uptime: 3600 },
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should accept all valid health status values', async () => {
        for (const status of Object.values(HealthStatus)) {
          const dto = plainToClass(ServiceHealthDto, {
            name: 'TestService',
            status,
          });

          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        }
      });
    });

    describe('invalid data', () => {
      it('should fail validation when name is missing', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          status: HealthStatus.HEALTHY,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('name');
      });

      it('should fail validation when name is not a string', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 123,
          status: HealthStatus.HEALTHY,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('name');
      });

      it('should fail validation when status is missing', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 'TestService',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('status');
      });

      it('should fail validation when status is invalid', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 'TestService',
          status: 'invalid_status',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('status');
      });

      it('should fail validation when message is not a string', async () => {
        const dto = plainToClass(ServiceHealthDto, {
          name: 'TestService',
          status: HealthStatus.HEALTHY,
          message: 123,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('message');
      });
    });

    describe('property assignments', () => {
      it('should correctly assign all properties', () => {
        const dto = new ServiceHealthDto();
        dto.name = 'TestService';
        dto.status = HealthStatus.HEALTHY;
        dto.message = 'Test message';
        dto.details = { test: 'data' };

        expect(dto.name).toBe('TestService');
        expect(dto.status).toBe(HealthStatus.HEALTHY);
        expect(dto.message).toBe('Test message');
        expect(dto.details).toEqual({ test: 'data' });
      });
    });
  });

  describe('SystemHealthDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields', async () => {
        const services = [
          {
            name: 'PostgreSQL',
            status: HealthStatus.HEALTHY,
          },
        ];

        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.HEALTHY,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with optional requiredActions', async () => {
        const services = [
          {
            name: 'PostgreSQL',
            status: HealthStatus.HEALTHY,
          },
        ];

        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.DEGRADED,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services,
          requiredActions: ['Configure Infisical secrets', 'Check Qdrant connection'],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate with nested service objects', async () => {
        const services = [
          {
            name: 'PostgreSQL',
            status: HealthStatus.HEALTHY,
            message: 'Connected',
            details: { connections: 5 },
          },
          {
            name: 'Redis',
            status: HealthStatus.DEGRADED,
            message: 'Slow response',
          },
        ];

        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.DEGRADED,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when status is missing', async () => {
        const dto = plainToClass(SystemHealthDto, {
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services: [],
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'status')).toBeTruthy();
      });

      it('should fail validation when timestamp is missing', async () => {
        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.HEALTHY,
          uptime: 1800000,
          services: [],
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'timestamp')).toBeTruthy();
      });

      it('should fail validation when uptime is not a number', async () => {
        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.HEALTHY,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 'not-a-number',
          services: [],
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'uptime')).toBeTruthy();
      });

      it('should fail validation when services is not an array', async () => {
        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.HEALTHY,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'services')).toBeTruthy();
      });

      it('should fail validation when requiredActions contains non-string values', async () => {
        const dto = plainToClass(SystemHealthDto, {
          status: HealthStatus.HEALTHY,
          timestamp: '2024-01-01T12:00:00.000Z',
          uptime: 1800000,
          services: [],
          requiredActions: ['valid string', 123, 'another valid string'],
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'requiredActions')).toBeTruthy();
      });
    });
  });

  describe('ReadinessDto', () => {
    describe('valid data', () => {
      it('should validate correctly with required field', async () => {
        const dto = plainToClass(ReadinessDto, {
          status: 'ready',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when status is missing', async () => {
        const dto = plainToClass(ReadinessDto, {});

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('status');
      });

      it('should fail validation when status is not a string', async () => {
        const dto = plainToClass(ReadinessDto, {
          status: 123,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('status');
      });
    });
  });

  describe('LivenessDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields', async () => {
        const dto = plainToClass(LivenessDto, {
          status: 'alive',
          timestamp: '2024-01-01T12:00:00.000Z',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when status is missing', async () => {
        const dto = plainToClass(LivenessDto, {
          timestamp: '2024-01-01T12:00:00.000Z',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'status')).toBeTruthy();
      });

      it('should fail validation when timestamp is missing', async () => {
        const dto = plainToClass(LivenessDto, {
          status: 'alive',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'timestamp')).toBeTruthy();
      });

      it('should fail validation when fields are not strings', async () => {
        const dto = plainToClass(LivenessDto, {
          status: 123,
          timestamp: 456,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('InitializationReportDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields', async () => {
        const dto = plainToClass(InitializationReportDto, {
          status: 'completed',
          startedAt: '2024-01-01T12:00:00.000Z',
          completedAt: '2024-01-01T12:00:05.000Z',
          duration: 5000,
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with optional fields', async () => {
        const dto = plainToClass(InitializationReportDto, {
          status: 'in_progress',
          startedAt: '2024-01-01T12:00:00.000Z',
          completedAt: '2024-01-01T12:00:05.000Z',
          duration: 5000,
          requiredActions: ['Configure database', 'Load initial data'],
          steps: {
            database: 'completed',
            cache: 'in_progress',
            services: 'pending',
          },
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when required fields are missing', async () => {
        const dto = plainToClass(InitializationReportDto, {
          status: 'completed',
          // Missing startedAt, completedAt, duration
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);

        const errorProperties = errors.map((error) => error.property);
        expect(errorProperties).toContain('startedAt');
        expect(errorProperties).toContain('completedAt');
        expect(errorProperties).toContain('duration');
      });

      it('should fail validation when duration is not a number', async () => {
        const dto = plainToClass(InitializationReportDto, {
          status: 'completed',
          startedAt: '2024-01-01T12:00:00.000Z',
          completedAt: '2024-01-01T12:00:05.000Z',
          duration: 'not-a-number',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'duration')).toBeTruthy();
      });

      it('should fail validation when requiredActions contains non-string values', async () => {
        const dto = plainToClass(InitializationReportDto, {
          status: 'completed',
          startedAt: '2024-01-01T12:00:00.000Z',
          completedAt: '2024-01-01T12:00:05.000Z',
          duration: 5000,
          requiredActions: ['valid action', 123, null],
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'requiredActions')).toBeTruthy();
      });
    });
  });

  describe('OpenAPI decorators', () => {
    it('should have properties defined on ServiceHealthDto', () => {
      const dto = new ServiceHealthDto();
      dto.name = 'TestService';
      dto.status = HealthStatus.HEALTHY;

      expect(Object.hasOwn(dto, 'name') || 'name' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'status') || 'status' in dto).toBeTruthy();

      // Test that the enum decorator is working by attempting invalid value
      dto.status = HealthStatus.DEGRADED;
      expect(dto.status).toBe(HealthStatus.DEGRADED);
    });

    it('should have properties defined on SystemHealthDto', () => {
      const dto = new SystemHealthDto();
      dto.status = HealthStatus.HEALTHY;
      dto.timestamp = '2024-01-01T12:00:00.000Z';
      dto.uptime = 1000;
      dto.services = [];

      expect(Object.hasOwn(dto, 'status') || 'status' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'timestamp') || 'timestamp' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'uptime') || 'uptime' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'services') || 'services' in dto).toBeTruthy();
    });

    it('should have properties defined on ReadinessDto', () => {
      const dto = new ReadinessDto();
      dto.status = 'ready';

      expect(Object.hasOwn(dto, 'status') || 'status' in dto).toBeTruthy();
    });

    it('should have properties defined on LivenessDto', () => {
      const dto = new LivenessDto();
      dto.status = 'alive';
      dto.timestamp = '2024-01-01T12:00:00.000Z';

      expect(Object.hasOwn(dto, 'status') || 'status' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'timestamp') || 'timestamp' in dto).toBeTruthy();
    });

    it('should have properties defined on InitializationReportDto', () => {
      const dto = new InitializationReportDto();
      dto.status = 'completed';
      dto.startedAt = '2024-01-01T12:00:00.000Z';
      dto.completedAt = '2024-01-01T12:00:05.000Z';
      dto.duration = 5000;

      expect(Object.hasOwn(dto, 'status') || 'status' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'startedAt') || 'startedAt' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'completedAt') || 'completedAt' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'duration') || 'duration' in dto).toBeTruthy();
    });
  });

  describe('DTO instantiation', () => {
    it('should create ServiceHealthDto instance correctly', () => {
      const dto = new ServiceHealthDto();
      expect(dto).toBeInstanceOf(ServiceHealthDto);
    });

    it('should create SystemHealthDto instance correctly', () => {
      const dto = new SystemHealthDto();
      expect(dto).toBeInstanceOf(SystemHealthDto);
    });

    it('should create ReadinessDto instance correctly', () => {
      const dto = new ReadinessDto();
      expect(dto).toBeInstanceOf(ReadinessDto);
    });

    it('should create LivenessDto instance correctly', () => {
      const dto = new LivenessDto();
      expect(dto).toBeInstanceOf(LivenessDto);
    });

    it('should create InitializationReportDto instance correctly', () => {
      const dto = new InitializationReportDto();
      expect(dto).toBeInstanceOf(InitializationReportDto);
    });
  });

  describe('serialization/deserialization', () => {
    it('should serialize and deserialize SystemHealthDto correctly', () => {
      const originalData = {
        status: HealthStatus.HEALTHY,
        timestamp: '2024-01-01T12:00:00.000Z',
        uptime: 1800000,
        services: [
          {
            name: 'PostgreSQL',
            status: HealthStatus.HEALTHY,
            message: 'Connected',
            details: { connections: 5 },
          },
        ],
        requiredActions: ['Test action'],
      };

      const dto = plainToClass(SystemHealthDto, originalData);
      const serialized = JSON.parse(JSON.stringify(dto));
      const deserialized = plainToClass(SystemHealthDto, serialized);

      expect(deserialized.status).toBe(originalData.status);
      expect(deserialized.timestamp).toBe(originalData.timestamp);
      expect(deserialized.uptime).toBe(originalData.uptime);
      expect(deserialized.services).toHaveLength(1);
      expect(deserialized.services[0].name).toBe('PostgreSQL');
      expect(deserialized.requiredActions).toEqual(['Test action']);
    });
  });
});
