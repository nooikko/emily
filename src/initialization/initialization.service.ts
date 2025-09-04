import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../messaging/redis/redis.service';
import { QdrantService } from '../vectors/services/qdrant.service';

@Injectable()
export class InitializationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitializationService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 2000;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private redisService: RedisService,
    private qdrantService: QdrantService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting application initialization checks...');

    try {
      await this.initializeDatabase();
      await this.initializeRedis();
      await this.initializeQdrant();

      this.logger.log('✅ All services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize services', error);
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    this.logger.log('Checking database initialization...');

    try {
      // Check if we need to run migrations
      const pendingMigrations = await this.dataSource.showMigrations();

      if (pendingMigrations) {
        this.logger.log('Running pending database migrations...');
        await this.dataSource.runMigrations();
        this.logger.log('Database migrations completed');
      }

      // Verify critical tables exist
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        // Configuration entity uses table name 'configurations'
        const tables = await queryRunner.getTables(['configurations']);

        if (tables.length === 0) {
          this.logger.warn('Configuration table not found, running initial setup...');
          await this.dataSource.runMigrations();
        }

        this.logger.log('✅ Database initialized');
      } finally {
        await queryRunner.release();
      }
    } catch (error: unknown) {
      this.logger.error('Database initialization failed', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Database initialization failed: ${errorMessage}`);
    }
  }

  private async initializeRedis(): Promise<void> {
    this.logger.log('Checking Redis connection...');

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.redisService.ping();
        this.logger.log('✅ Redis connected');
        return;
      } catch (_error) {
        this.logger.warn(`Redis connection attempt ${attempt}/${this.maxRetries} failed`);

        if (attempt === this.maxRetries) {
          throw new Error(`Failed to connect to Redis after ${this.maxRetries} attempts`);
        }

        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  private async initializeQdrant(): Promise<void> {
    this.logger.log('Checking Qdrant initialization...');

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Check if collections exist, create if needed
        const collections = await this.qdrantService.client.getCollections();
        const collectionNames = collections.collections.map((c: { name: string }) => c.name);

        const requiredCollections = ['documents', 'memories'];

        for (const collectionName of requiredCollections) {
          if (!collectionNames.includes(collectionName)) {
            this.logger.log(`Creating Qdrant collection: ${collectionName}`);
            await this.qdrantService.client.createCollection(collectionName, {
              vectors: {
                size: 768, // BGE-m3 embedding size
                distance: 'Cosine',
              },
            });
            this.logger.log(`✅ Created collection: ${collectionName}`);
          }
        }

        this.logger.log('✅ Qdrant initialized');
        return;
      } catch (_error) {
        this.logger.warn(`Qdrant initialization attempt ${attempt}/${this.maxRetries} failed`);

        if (attempt === this.maxRetries) {
          throw new Error(`Failed to initialize Qdrant after ${this.maxRetries} attempts`);
        }

        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
