import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { QueryRunner, Table } from 'typeorm';
import { RedisService } from '../../messaging/redis/redis.service';
import { QdrantService } from '../../vectors/services/qdrant.service';
import { InitializationService } from '../initialization.service';

// Mock external dependencies
jest.mock('../../messaging/redis/redis.service');
jest.mock('../../vectors/services/qdrant.service');

// Type definitions for mocks
type MockDataSource = {
  showMigrations: jest.MockedFunction<() => Promise<boolean>>;
  runMigrations: jest.MockedFunction<() => Promise<void>>;
  createQueryRunner: jest.MockedFunction<() => QueryRunner>;
} & Record<string, unknown>;

type MockQueryRunner = {
  getTables: jest.MockedFunction<(tableNames: string[]) => Promise<Table[]>>;
  release: jest.MockedFunction<() => Promise<void>>;
} & Record<string, unknown>;

type MockRedisService = {
  ping: jest.MockedFunction<() => Promise<void>>;
} & Record<string, unknown>;

type MockQdrantService = {
  client: {
    getCollections: jest.MockedFunction<() => Promise<{ collections: Array<{ name: string }> }>>;
    createCollection: jest.MockedFunction<(name: string, config: unknown) => Promise<void>>;
  };
} & Record<string, unknown>;

describe('InitializationService', () => {
  let service: InitializationService;
  let mockDataSource: MockDataSource;
  let mockQueryRunner: MockQueryRunner;
  let mockRedisService: MockRedisService;
  let mockQdrantService: MockQdrantService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup DataSource mock
    mockQueryRunner = {
      getTables: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    } as MockQueryRunner;

    mockDataSource = {
      showMigrations: jest.fn(),
      runMigrations: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as MockDataSource;

    // Setup RedisService mock
    mockRedisService = {
      ping: jest.fn(),
    } as MockRedisService;

    // Setup QdrantService mock
    mockQdrantService = {
      client: {
        getCollections: jest.fn(),
        createCollection: jest.fn(),
      },
    } as MockQdrantService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InitializationService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
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

    // Disable logging in tests
    module.useLogger(false);

    service = module.get<InitializationService>(InitializationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Ensure timers are reset after each test
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
  });

  describe('constructor and initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('should complete successful initialization on first attempt', async () => {
      // Setup successful responses
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }, { name: 'memories' }],
      });

      await service.onApplicationBootstrap();

      expect(mockDataSource.showMigrations).toHaveBeenCalled();
      expect(mockRedisService.ping).toHaveBeenCalled();
      expect(mockQdrantService.client.getCollections).toHaveBeenCalled();
    });

    it('should fail when database initialization fails', async () => {
      const databaseError = new Error('Database connection failed');
      mockDataSource.showMigrations.mockRejectedValue(databaseError);

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Database initialization failed: Database connection failed');
    });

    it('should fail when Redis initialization fails permanently', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockRejectedValue(new Error('Redis connection refused'));

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Failed to connect to Redis after 5 attempts');
      expect(mockRedisService.ping).toHaveBeenCalledTimes(5);
    });

    it('should fail when Qdrant initialization fails permanently', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockRejectedValue(new Error('Qdrant service unavailable'));

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Failed to initialize Qdrant after 5 attempts');
      expect(mockQdrantService.client.getCollections).toHaveBeenCalledTimes(5);
    });
  });

  describe('database initialization', () => {
    it('should complete successfully when no migrations are needed', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }, { name: 'memories' }],
      });

      await service.onApplicationBootstrap();

      expect(mockDataSource.showMigrations).toHaveBeenCalled();
      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
      expect(mockQueryRunner.getTables).toHaveBeenCalledWith(['configurations']);
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should run migrations when pending migrations exist', async () => {
      mockDataSource.showMigrations.mockResolvedValue(true);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }, { name: 'memories' }],
      });

      await service.onApplicationBootstrap();

      expect(mockDataSource.showMigrations).toHaveBeenCalled();
      expect(mockDataSource.runMigrations).toHaveBeenCalled();
    });

    it('should run migrations when configuration table does not exist', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }, { name: 'memories' }],
      });

      await service.onApplicationBootstrap();

      expect(mockDataSource.runMigrations).toHaveBeenCalledTimes(1);
    });

    it('should handle migration errors and throw wrapped error', async () => {
      const migrationError = new Error('Migration script failed');
      mockDataSource.showMigrations.mockResolvedValue(true);
      mockDataSource.runMigrations.mockRejectedValue(migrationError);

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Database initialization failed: Migration script failed');
    });

    it('should always release query runner even if error occurs', async () => {
      const tableError = new Error('Table query failed');
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockRejectedValue(tableError);

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Database initialization failed: Table query failed');
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('Qdrant initialization', () => {
    it('should succeed when all required collections exist', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }, { name: 'memories' }],
      });

      await service.onApplicationBootstrap();

      expect(mockQdrantService.client.getCollections).toHaveBeenCalledTimes(1);
      expect(mockQdrantService.client.createCollection).not.toHaveBeenCalled();
    });

    it('should create missing collections and succeed', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }], // Missing 'memories' collection
      });
      mockQdrantService.client.createCollection.mockResolvedValue();

      await service.onApplicationBootstrap();

      expect(mockQdrantService.client.createCollection).toHaveBeenCalledWith('memories', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
    });

    it('should create all required collections when none exist', async () => {
      mockDataSource.showMigrations.mockResolvedValue(false);
      mockQueryRunner.getTables.mockResolvedValue([{ name: 'configurations' } as Table]);
      mockRedisService.ping.mockResolvedValue();
      mockQdrantService.client.getCollections.mockResolvedValue({
        collections: [],
      });
      mockQdrantService.client.createCollection.mockResolvedValue();

      await service.onApplicationBootstrap();

      expect(mockQdrantService.client.createCollection).toHaveBeenCalledTimes(2);
      expect(mockQdrantService.client.createCollection).toHaveBeenCalledWith('documents', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
      expect(mockQdrantService.client.createCollection).toHaveBeenCalledWith('memories', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
    });
  });
});