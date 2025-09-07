import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationController } from '../controllers/configuration.controller';
import { BulkConfigurationDto, CreateConfigurationDto, UpdateConfigurationDto } from '../dto/configuration.dto';
import { ConfigCategory, ConfigEnvironment, ConfigType, Configuration } from '../entities/configuration.entity';
import { ConfigurationService } from '../services/configuration.service';

// Mock the logger to avoid actual logging during tests
jest.mock('../../observability/services/structured-logger.service', () => {
  return {
    StructuredLoggerService: jest.fn().mockImplementation(() => ({
      logInfo: jest.fn(),
      logError: jest.fn(),
      logWarn: jest.fn(),
      logDebug: jest.fn(),
      error: jest.fn(),
    })),
  };
});

describe('ConfigurationController', () => {
  let controller: ConfigurationController;
  let configurationService: jest.Mocked<ConfigurationService>;

  const mockConfigurationService = {
    getAll: jest.fn(),
    getWithMetadata: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getByCategory: jest.fn(),
    getCategories: jest.fn(),
    bulkSet: jest.fn(),
    reloadCache: jest.fn(),
  };

  const mockConfiguration: Configuration = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    category: ConfigCategory.FEATURE_FLAGS,
    key: 'ENABLE_FEATURE_X',
    value: 'true',
    type: ConfigType.BOOLEAN,
    environment: ConfigEnvironment.ALL,
    description: 'Enable feature X for all users',
    isSecret: false,
    isActive: true,
    version: 1,
    createdAt: new Date('2024-01-01T12:00:00.000Z'),
    updatedAt: new Date('2024-01-01T12:00:00.000Z'),
    validationRules: undefined,
    createdBy: undefined,
    updatedBy: undefined,
    getTypedValue: () => true,
    validateValue: () => true,
    toSafeObject: () => ({
      id: '123e4567-e89b-12d3-a456-426614174000',
      category: ConfigCategory.FEATURE_FLAGS,
      key: 'ENABLE_FEATURE_X',
      value: 'true',
      type: ConfigType.BOOLEAN,
      environment: ConfigEnvironment.ALL,
      description: 'Enable feature X for all users',
      isSecret: false,
      isActive: true,
      version: 1,
      createdAt: new Date('2024-01-01T12:00:00.000Z'),
      updatedAt: new Date('2024-01-01T12:00:00.000Z'),
      validationRules: undefined,
      createdBy: undefined,
      updatedBy: undefined,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigurationController],
      providers: [
        {
          provide: ConfigurationService,
          useValue: mockConfigurationService,
        },
      ],
    }).compile();

    controller = module.get<ConfigurationController>(ConfigurationController);
    configurationService = module.get(ConfigurationService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    describe('successful requests', () => {
      beforeEach(() => {
        mockConfigurationService.getAll.mockResolvedValue([mockConfiguration]);
      });

      it('should retrieve all configurations', async () => {
        const result = await controller.getAll();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(mockConfiguration.id);
        expect(mockConfigurationService.getAll).toHaveBeenCalledWith({
          category: undefined,
          environment: undefined,
          isActive: undefined,
        });
      });

      it('should filter by category', async () => {
        await controller.getAll(ConfigCategory.FEATURE_FLAGS);

        expect(mockConfigurationService.getAll).toHaveBeenCalledWith({
          category: ConfigCategory.FEATURE_FLAGS,
          environment: undefined,
          isActive: undefined,
        });
      });

      it('should filter by environment', async () => {
        await controller.getAll(undefined, ConfigEnvironment.PRODUCTION);

        expect(mockConfigurationService.getAll).toHaveBeenCalledWith({
          category: undefined,
          environment: ConfigEnvironment.PRODUCTION,
          isActive: undefined,
        });
      });

      it('should filter by active status', async () => {
        await controller.getAll(undefined, undefined, true);

        expect(mockConfigurationService.getAll).toHaveBeenCalledWith({
          category: undefined,
          environment: undefined,
          isActive: true,
        });
      });

      it('should apply multiple filters', async () => {
        await controller.getAll(ConfigCategory.MODEL_CONFIG, ConfigEnvironment.STAGING, false);

        expect(mockConfigurationService.getAll).toHaveBeenCalledWith({
          category: ConfigCategory.MODEL_CONFIG,
          environment: ConfigEnvironment.STAGING,
          isActive: false,
        });
      });
    });

    describe('error handling', () => {
      it('should handle service errors', async () => {
        const serviceError = new Error('Database connection failed');
        mockConfigurationService.getAll.mockRejectedValue(serviceError);

        await expect(controller.getAll()).rejects.toThrow('Database connection failed');
      });
    });
  });

  describe('getById', () => {
    const configId = '123e4567-e89b-12d3-a456-426614174000';

    describe('successful requests', () => {
      beforeEach(() => {
        mockConfigurationService.getWithMetadata.mockResolvedValue(mockConfiguration);
      });

      it('should retrieve configuration by ID', async () => {
        const result = await controller.getById(configId);

        expect(result.id).toBe(mockConfiguration.id);
        expect(mockConfigurationService.getWithMetadata).toHaveBeenCalledWith(configId);
      });

      it('should return sanitized configuration object', async () => {
        const secretConfig = {
          ...mockConfiguration,
          isSecret: true,
          value: 'secret-value',
          toSafeObject: () => ({ ...mockConfiguration.toSafeObject(), value: '[REDACTED]', isSecret: true }),
        };

        mockConfigurationService.getWithMetadata.mockResolvedValue(secretConfig as any);

        const result = await controller.getById(configId);

        expect(result.value).toBe('[REDACTED]');
        expect(result.isSecret).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle configuration not found', async () => {
        const notFoundError = new HttpException('Configuration not found', HttpStatus.NOT_FOUND);
        mockConfigurationService.getWithMetadata.mockRejectedValue(notFoundError);

        await expect(controller.getById(configId)).rejects.toThrow(HttpException);
      });
    });
  });

  describe('getByKey', () => {
    const configKey = 'ENABLE_FEATURE_X';

    describe('successful requests', () => {
      beforeEach(() => {
        mockConfigurationService.get.mockResolvedValue(true);
        mockConfigurationService.getAll.mockResolvedValue([mockConfiguration]);
      });

      it('should retrieve configuration value by key', async () => {
        const result = await controller.getByKey(configKey);

        expect(result.key).toBe(configKey);
        expect(result.value).toBe(true);
        expect(result.type).toBe('boolean');
        expect(result.environment).toBe('all');
        expect(mockConfigurationService.get).toHaveBeenCalledWith(configKey, undefined);
      });

      it('should filter by environment', async () => {
        await controller.getByKey(configKey, ConfigEnvironment.PRODUCTION);

        expect(mockConfigurationService.get).toHaveBeenCalledWith(configKey, ConfigEnvironment.PRODUCTION);
      });
    });
  });

  describe('create', () => {
    const createDto: CreateConfigurationDto = {
      category: ConfigCategory.FEATURE_FLAGS,
      key: 'NEW_FEATURE',
      value: 'false',
      type: ConfigType.BOOLEAN,
      environment: ConfigEnvironment.ALL,
      description: 'New feature toggle',
      isSecret: false,
      isActive: true,
    };

    describe('successful creation', () => {
      beforeEach(() => {
        mockConfigurationService.set.mockResolvedValue(mockConfiguration);
      });

      it('should create new configuration', async () => {
        const result = await controller.create(createDto);

        expect(result.id).toBe(mockConfiguration.id);
        expect(mockConfigurationService.set).toHaveBeenCalledWith(createDto);
      });
    });

    describe('error handling', () => {
      it('should handle validation errors', async () => {
        const validationError = new HttpException('Validation failed', HttpStatus.BAD_REQUEST);
        mockConfigurationService.set.mockRejectedValue(validationError);

        await expect(controller.create(createDto)).rejects.toThrow(HttpException);
      });

      it('should handle conflict errors', async () => {
        const conflictError = new HttpException('Configuration already exists', HttpStatus.CONFLICT);
        mockConfigurationService.set.mockRejectedValue(conflictError);

        await expect(controller.create(createDto)).rejects.toThrow(HttpException);
      });
    });
  });

  describe('update', () => {
    const configId = '123e4567-e89b-12d3-a456-426614174000';
    const updateDto: UpdateConfigurationDto = {
      value: 'false',
      description: 'Updated description',
    };

    describe('successful update', () => {
      beforeEach(() => {
        mockConfigurationService.update.mockResolvedValue(mockConfiguration);
      });

      it('should update configuration', async () => {
        const result = await controller.update(configId, updateDto);

        expect(result.id).toBe(mockConfiguration.id);
        expect(mockConfigurationService.update).toHaveBeenCalledWith(configId, updateDto);
      });
    });

    describe('error handling', () => {
      it('should handle configuration not found', async () => {
        const notFoundError = new HttpException('Configuration not found', HttpStatus.NOT_FOUND);
        mockConfigurationService.update.mockRejectedValue(notFoundError);

        await expect(controller.update(configId, updateDto)).rejects.toThrow(HttpException);
      });
    });
  });

  describe('delete', () => {
    const configId = '123e4567-e89b-12d3-a456-426614174000';

    describe('successful deletion', () => {
      beforeEach(() => {
        mockConfigurationService.delete.mockResolvedValue(undefined);
      });

      it('should delete configuration', async () => {
        const result = await controller.delete(configId);

        expect(result.message).toBe('Configuration deleted successfully');
        expect(mockConfigurationService.delete).toHaveBeenCalledWith(configId);
      });
    });

    describe('error handling', () => {
      it('should handle configuration not found', async () => {
        const notFoundError = new HttpException('Configuration not found', HttpStatus.NOT_FOUND);
        mockConfigurationService.delete.mockRejectedValue(notFoundError);

        await expect(controller.delete(configId)).rejects.toThrow(HttpException);
      });
    });
  });

  describe('getByCategory', () => {
    const category = ConfigCategory.MODEL_CONFIG;

    describe('successful requests', () => {
      beforeEach(() => {
        mockConfigurationService.getByCategory.mockResolvedValue([mockConfiguration]);
      });

      it('should retrieve configurations by category', async () => {
        const result = await controller.getByCategory(category);

        expect(result).toHaveLength(1);
        expect(result[0].category).toBe(ConfigCategory.FEATURE_FLAGS);
        expect(mockConfigurationService.getByCategory).toHaveBeenCalledWith(category, undefined);
      });

      it('should filter by environment', async () => {
        await controller.getByCategory(category, ConfigEnvironment.PRODUCTION);

        expect(mockConfigurationService.getByCategory).toHaveBeenCalledWith(category, ConfigEnvironment.PRODUCTION);
      });
    });
  });

  describe('getCategories', () => {
    const mockCategories = Object.values(ConfigCategory);

    describe('successful requests', () => {
      beforeEach(() => {
        mockConfigurationService.getCategories.mockResolvedValue(mockCategories);
      });

      it('should retrieve all categories', async () => {
        const result = await controller.getCategories();

        expect(result).toEqual(mockCategories);
        expect(result).toHaveLength(9); // Should match the number of categories in the enum
        expect(mockConfigurationService.getCategories).toHaveBeenCalled();
      });
    });
  });

  describe('bulkUpdate', () => {
    const bulkDto: BulkConfigurationDto = {
      configurations: [
        {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'BULK_FEATURE_1',
          value: 'true',
          type: ConfigType.BOOLEAN,
          environment: ConfigEnvironment.ALL,
        },
        {
          category: ConfigCategory.MODEL_CONFIG,
          key: 'MODEL_TEMP',
          value: '0.7',
          type: ConfigType.NUMBER,
          environment: ConfigEnvironment.PRODUCTION,
        },
      ],
    };

    describe('successful bulk operations', () => {
      beforeEach(() => {
        const mockConfigs = [
          { ...mockConfiguration, version: 1, key: 'BULK_FEATURE_1' },
          { ...mockConfiguration, version: 2, key: 'MODEL_TEMP' },
        ];
        mockConfigurationService.bulkSet.mockResolvedValue(mockConfigs as any);
      });

      it('should process bulk configurations', async () => {
        const result = await controller.bulkUpdate(bulkDto);

        expect(result.created).toBe(1); // version 1
        expect(result.updated).toBe(1); // version 2
        expect(result.configurations).toHaveLength(2);
        expect(mockConfigurationService.bulkSet).toHaveBeenCalledWith(bulkDto.configurations);
      });
    });
  });

  describe('validate', () => {
    const validationDto: BulkConfigurationDto = {
      configurations: [
        {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'VALID_CONFIG',
          value: 'true',
          type: ConfigType.BOOLEAN,
          environment: ConfigEnvironment.ALL,
        },
        {
          category: ConfigCategory.MODEL_CONFIG,
          key: '', // Invalid - missing key
          value: '0.7',
          type: ConfigType.NUMBER,
          environment: ConfigEnvironment.PRODUCTION,
        },
      ],
    };

    it('should validate configuration set', async () => {
      const result = await controller.validate(validationDto);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].key).toBe('unknown');
      expect(result.errors[0].error).toContain('Missing required fields');
    });

    it('should return valid result for correct configurations', async () => {
      const validDto: BulkConfigurationDto = {
        configurations: [
          {
            category: ConfigCategory.FEATURE_FLAGS,
            key: 'VALID_CONFIG',
            value: 'true',
            type: ConfigType.BOOLEAN,
            environment: ConfigEnvironment.ALL,
          },
        ],
      };

      const result = await controller.validate(validDto);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('reloadCache', () => {
    describe('successful cache reload', () => {
      beforeEach(() => {
        mockConfigurationService.reloadCache.mockResolvedValue(undefined);
      });

      it('should reload configuration cache', async () => {
        const result = await controller.reloadCache();

        expect(result.message).toBe('Configuration cache reloaded successfully');
        expect(result.reloadedAt).toBeDefined();
        expect(new Date(result.reloadedAt)).toBeInstanceOf(Date);
        expect(mockConfigurationService.reloadCache).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle cache reload errors', async () => {
        const cacheError = new Error('Cache service unavailable');
        mockConfigurationService.reloadCache.mockRejectedValue(cacheError);

        await expect(controller.reloadCache()).rejects.toThrow('Cache service unavailable');
      });
    });
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have ConfigurationService injected', () => {
      expect(configurationService).toBeDefined();
    });
  });

  describe('logging integration', () => {
    it('should have logger instance with required methods', () => {
      // Check that the controller has a logger property with expected methods
      expect(controller).toHaveProperty('logger');
      expect((controller as any).logger).toHaveProperty('logInfo');
      expect((controller as any).logger).toHaveProperty('logError');
      expect((controller as any).logger).toHaveProperty('logWarn');
      expect((controller as any).logger).toHaveProperty('logDebug');
    });
  });

  describe('OpenAPI decorators integration', () => {
    it('should have all CRUD endpoints defined', () => {
      expect(controller.getAll).toBeDefined();
      expect(controller.getById).toBeDefined();
      expect(controller.getByKey).toBeDefined();
      expect(controller.create).toBeDefined();
      expect(controller.update).toBeDefined();
      expect(controller.delete).toBeDefined();
      expect(controller.getByCategory).toBeDefined();
      expect(controller.getCategories).toBeDefined();
      expect(controller.bulkUpdate).toBeDefined();
      expect(controller.validate).toBeDefined();
      expect(controller.reloadCache).toBeDefined();
    });

    it('should handle configuration entity OpenAPI properties', () => {
      // This would be tested more thoroughly in integration tests
      // Here we just verify the entity can be instantiated with all OpenAPI properties
      const config = mockConfiguration.toSafeObject() as Configuration;

      expect(config.id).toBeDefined();
      expect(config.category).toBeDefined();
      expect(config.key).toBeDefined();
      expect(config.value).toBeDefined();
      expect(config.type).toBeDefined();
      expect(config.environment).toBeDefined();
      expect(config.isSecret).toBeDefined();
      expect(config.isActive).toBeDefined();
      expect(config.version).toBeDefined();
    });
  });
});
