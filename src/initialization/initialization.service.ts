import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { InfisicalService } from '../infisical/infisical.service';
import { RedisService } from '../messaging/redis/redis.service';
import { QdrantService } from '../vectors/services/qdrant.service';

// ==========================================
// Type Definitions
// ==========================================

export interface InitializationStatus {
  service: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface InitializationReport {
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'failed';
  services: InitializationStatus[];
  requiredActions: string[];
}

export interface InitializationState {
  version: string;
  lastRun: Date;
  firstRunCompleted: boolean;
  databasesCreated: string[];
  completedSteps: string[];
}

export interface DatabaseCreationConfig {
  name: string;
  owner?: string;
  encoding?: string;
  template?: string;
}

export interface DatabaseCreationResult {
  database: string;
  existed: boolean;
  created: boolean;
  error?: string;
}

export interface RequiredSecret {
  key: string;
  description: string;
  critical?: boolean;
}

// ==========================================
// Consolidated Initialization Service
// ==========================================

@Injectable()
export class InitializationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitializationService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 2000;
  private readonly stateFilePath = path.join(process.cwd(), '.initialization-state.json');
  private readonly currentVersion = '1.0.0';

  private initializationReport: InitializationReport = {
    timestamp: new Date(),
    overallStatus: 'healthy',
    services: [],
    requiredActions: [],
  };

  private state: InitializationState = {
    version: this.currentVersion,
    lastRun: new Date(),
    firstRunCompleted: false,
    databasesCreated: [],
    completedSteps: [],
  };

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private redisService: RedisService,
    private qdrantService: QdrantService,
    private configService: ConfigService,
    private infisicalService: InfisicalService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('🚀 Starting consolidated application initialization...');

    try {
      // Load initialization state
      await this.loadInitializationState();

      // Reset report
      this.initializationReport = {
        timestamp: new Date(),
        overallStatus: 'healthy',
        services: [],
        requiredActions: [],
      };

      // First-run setup if needed
      if (!this.state.firstRunCompleted) {
        await this.performFirstRunSetup();
      }

      // Critical services (must succeed)
      const criticalChecks = [this.checkDatabase(), this.checkRedis()];

      // Non-critical services (can fail gracefully)
      const nonCriticalChecks = [this.checkQdrant(), this.checkInfisical(), this.checkRequiredSecrets()];

      // Run critical checks
      try {
        await Promise.all(criticalChecks);
      } catch (error) {
        this.initializationReport.overallStatus = 'failed';
        this.logger.error('❌ Critical services failed to initialize', error);
        this.printInitializationReport();
        throw new Error('Application cannot start: Critical services failed. Check the initialization report above.');
      }

      // Run non-critical checks (continue even if they fail)
      const nonCriticalResults = await Promise.allSettled(nonCriticalChecks);

      // Check if any non-critical services failed
      const hasNonCriticalFailures = nonCriticalResults.some((result) => result.status === 'rejected');

      if (hasNonCriticalFailures) {
        this.initializationReport.overallStatus = 'degraded';
      }

      // Post-initialization tasks

      // Save state
      await this.saveInitializationState();

      // Print comprehensive report
      this.printInitializationReport();

      // Determine if we should continue or fail
      if (this.initializationReport.overallStatus === 'failed') {
        throw new Error('Application initialization failed. See report above for details.');
      }
      if (this.initializationReport.overallStatus === 'degraded') {
        this.logger.warn('⚠️  Application started in DEGRADED mode. Some features may be unavailable.');
      } else {
        this.logger.log('✅ Application initialized successfully!');
      }
    } catch (error) {
      this.logger.error('Initialization failed', error);
      throw error;
    }
  }

  // ==========================================
  // State Management
  // ==========================================

  private async loadInitializationState(): Promise<void> {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const stateData = fs.readFileSync(this.stateFilePath, 'utf-8');
        const loadedState = JSON.parse(stateData) as Partial<InitializationState>;

        this.state = {
          version: this.currentVersion,
          lastRun: new Date(),
          firstRunCompleted: loadedState.firstRunCompleted ?? false,
          databasesCreated: loadedState.databasesCreated ?? [],
          completedSteps: loadedState.completedSteps ?? [],
        };

        this.logger.debug('Loaded initialization state from file');
      } else {
        this.logger.log('No previous initialization state found - first run detected');
      }
    } catch (error) {
      this.logger.warn('Failed to load initialization state, using defaults', error);
    }
  }

  private async saveInitializationState(): Promise<void> {
    try {
      this.state.lastRun = new Date();
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
      this.logger.debug('Saved initialization state to file');
    } catch (error) {
      this.logger.error('Failed to save initialization state', error);
    }
  }

  private isFirstRun(): boolean {
    return !this.state.firstRunCompleted;
  }

  private markStepCompleted(step: string): void {
    if (!this.state.completedSteps.includes(step)) {
      this.state.completedSteps.push(step);
    }
  }

  // ==========================================
  // First Run Setup
  // ==========================================

  private async performFirstRunSetup(): Promise<void> {
    this.logger.log('🔧 Performing first-run setup...');

    try {
      // Create required databases
      await this.createRequiredDatabases();

      this.state.firstRunCompleted = true;
      this.markStepCompleted('first-run-setup');

      this.logger.log('✅ First-run setup completed');
    } catch (error) {
      this.logger.error('First-run setup failed', error);
      throw error;
    }
  }

  private async createRequiredDatabases(): Promise<void> {
    const requiredDatabases: DatabaseCreationConfig[] = [{ name: 'emily', owner: 'postgres' }];

    this.logger.log('Creating required databases...');

    for (const dbConfig of requiredDatabases) {
      try {
        const result = await this.createDatabase(dbConfig);

        if (result.created) {
          this.logger.log(`✅ Created database: ${result.database}`);
          this.state.databasesCreated.push(result.database);
        } else if (result.existed) {
          this.logger.log(`ℹ️  Database already exists: ${result.database}`);
          if (!this.state.databasesCreated.includes(result.database)) {
            this.state.databasesCreated.push(result.database);
          }
        } else if (result.error) {
          this.logger.error(`❌ Failed to create database ${result.database}: ${result.error}`);
          // Don't throw here - continue with other databases
        }
      } catch (error) {
        this.logger.error(`Unexpected error creating database ${dbConfig.name}:`, error);
        // Continue with other databases
      }
    }

    this.markStepCompleted('database-creation');
  }

  /**
   * Type guard to check if DataSourceOptions has PostgreSQL-specific properties
   */
  private isPostgresDataSourceOptions(options: DataSourceOptions): options is DataSourceOptions & {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
  } {
    return options.type === 'postgres';
  }

  private async createDatabase(config: DatabaseCreationConfig): Promise<DatabaseCreationResult> {
    try {
      // Create a separate connection to the 'postgres' database for administrative operations
      const { DataSource } = await import('typeorm');

      // Get the current connection configuration from the injected DataSource
      const currentConfig = this.dataSource.options;

      // Extract connection parameters safely with proper type checking
      let host: string;
      let port: number;
      let username: string;
      let password: string;

      if (this.isPostgresDataSourceOptions(currentConfig)) {
        // Use environment variables first, then fall back to DataSource options
        host = this.configService.get<string>('POSTGRES_HOST') || currentConfig.host || 'localhost';
        const portFromEnv = this.configService.get<string>('POSTGRES_PORT');
        port = portFromEnv ? Number.parseInt(portFromEnv, 10) : currentConfig.port || 5433;
        username = this.configService.get<string>('POSTGRES_USER') || currentConfig.username || 'postgres';
        password = this.configService.get<string>('POSTGRES_PASSWORD') || currentConfig.password || 'postgres';
      } else {
        // Fallback for non-PostgreSQL or incomplete configurations
        host = this.configService.get<string>('POSTGRES_HOST') || 'localhost';
        const portFromEnv = this.configService.get<string>('POSTGRES_PORT');
        port = portFromEnv ? Number.parseInt(portFromEnv, 10) : 5433;
        username = this.configService.get<string>('POSTGRES_USER') || 'postgres';
        password = this.configService.get<string>('POSTGRES_PASSWORD') || 'postgres';
      }

      this.logger.log(`Attempting to create database '${config.name}' - Connecting to PostgreSQL at ${host}:${port} as ${username}`);

      // Create admin connection to 'postgres' database
      // We need to ensure we're using postgres type configuration
      const adminDataSource = new DataSource({
        type: 'postgres',
        host,
        port,
        username,
        password,
        database: 'postgres', // Connect to postgres database for admin operations
        synchronize: true,
        logging: false,
      });

      await adminDataSource.initialize();
      this.logger.debug('Admin connection established to PostgreSQL');

      try {
        // Check if database exists
        const existsQuery = 'SELECT 1 FROM pg_database WHERE datname = $1';
        const existsResult = await adminDataSource.query(existsQuery, [config.name]);

        if (existsResult.length > 0) {
          return {
            database: config.name,
            existed: true,
            created: false,
          };
        }

        // Create database - Note: Cannot use parameters with CREATE DATABASE
        // Build the query safely
        const safeName = config.name.replace(/"/g, '""');
        let createQuery = `CREATE DATABASE "${safeName}"`;

        if (config.owner) {
          const safeOwner = config.owner.replace(/"/g, '""');
          createQuery += ` OWNER "${safeOwner}"`;
        }
        if (config.encoding) {
          createQuery += ` ENCODING '${config.encoding}'`;
        }
        if (config.template) {
          const safeTemplate = config.template.replace(/"/g, '""');
          createQuery += ` TEMPLATE "${safeTemplate}"`;
        }

        await adminDataSource.query(createQuery);

        // Grant privileges if owner specified
        if (config.owner) {
          const safeOwner = config.owner.replace(/"/g, '""');
          await adminDataSource.query(`GRANT ALL PRIVILEGES ON DATABASE "${safeName}" TO "${safeOwner}"`);
        }

        return {
          database: config.name,
          existed: false,
          created: true,
        };
      } finally {
        await adminDataSource.destroy();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if the error is because the database already exists (race condition)
      if (errorMessage.includes('already exists')) {
        return {
          database: config.name,
          existed: true,
          created: false,
        };
      }

      return {
        database: config.name,
        existed: false,
        created: false,
        error: errorMessage,
      };
    }
  }

  // ==========================================
  // Service Checks (Enhanced from original)
  // ==========================================

  private async checkDatabase(): Promise<void> {
    const serviceName = 'Database (PostgreSQL)';
    try {
      this.logger.log(`Checking ${serviceName}...`);

      // Check connection
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }

      // Check and run migrations
      const pendingMigrations = await this.dataSource.showMigrations();
      if (pendingMigrations) {
        this.logger.log('Running pending database migrations...');
        await this.dataSource.runMigrations();
      }

      // Verify critical tables
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        const tables = await queryRunner.getTables(['configurations']);
        if (tables.length === 0) {
          // Create initial schema if missing
          this.logger.warn('Configuration table not found, creating initial schema...');
          await this.dataSource.synchronize();
          this.initializationReport.requiredActions.push('Database schema was auto-created. Consider running proper migrations.');
        }
      } finally {
        await queryRunner.release();
      }

      this.addServiceStatus(serviceName, 'success', 'Connected and initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addServiceStatus(serviceName, 'error', `Failed: ${message}`);
      throw error;
    }
  }

  private async checkRedis(): Promise<void> {
    const serviceName = 'Redis';
    try {
      this.logger.log(`Checking ${serviceName}...`);

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          await this.redisService.ping();
          this.addServiceStatus(serviceName, 'success', 'Connected');
          return;
        } catch (error) {
          if (attempt === this.maxRetries) {
            throw error;
          }
          await this.delay(this.retryDelay * attempt);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addServiceStatus(serviceName, 'error', `Connection failed: ${message}`);
      throw error;
    }
  }

  private async checkQdrant(): Promise<void> {
    const serviceName = 'Qdrant (Vector DB)';
    try {
      this.logger.log(`Checking ${serviceName}...`);

      const collections = await this.qdrantService.client.getCollections();
      const collectionNames = collections.collections.map((c: { name: string }) => c.name);

      const requiredCollections = ['documents', 'memories'];
      const missingCollections = requiredCollections.filter((c) => !collectionNames.includes(c));

      if (missingCollections.length > 0) {
        this.logger.log(`Creating missing Qdrant collections: ${missingCollections.join(', ')}`);
        for (const collectionName of missingCollections) {
          await this.qdrantService.client.createCollection(collectionName, {
            vectors: {
              size: 768,
              distance: 'Cosine',
            },
          });
        }
        this.initializationReport.requiredActions.push(`Created Qdrant collections: ${missingCollections.join(', ')}`);
      }

      this.addServiceStatus(serviceName, 'success', 'Connected and collections verified');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addServiceStatus(serviceName, 'warning', `Not available: ${message}. Vector search features will be disabled.`);
      // Don't throw - this is non-critical
    }
  }

  private async checkInfisical(): Promise<void> {
    const serviceName = 'Infisical (Secrets)';
    try {
      this.logger.log(`Checking ${serviceName}...`);

      const isReady = this.infisicalService.isReady();
      if (!isReady) {
        const clientId = this.configService.get<string>('INFISICAL_CLIENT_ID');
        const clientSecret = this.configService.get<string>('INFISICAL_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
          this.addServiceStatus(serviceName, 'warning', 'Not configured. Using environment variables for secrets.');
          this.initializationReport.requiredActions.push('Configure INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET for secret management');
          return;
        }
      }

      this.addServiceStatus(serviceName, 'success', 'Connected and ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addServiceStatus(serviceName, 'warning', `Not available: ${message}. Using fallback configuration.`);
    }
  }

  private async checkRequiredSecrets(): Promise<void> {
    const serviceName = 'Required Secrets';
    const requiredSecrets: RequiredSecret[] = [
      { key: 'OPENAI_API_KEY', description: 'OpenAI API access', critical: false },
      { key: 'ANTHROPIC_API_KEY', description: 'Anthropic Claude API access', critical: false },
      { key: 'DATABASE_URL', description: 'PostgreSQL connection', critical: true },
    ];

    const missingSecrets: string[] = [];

    for (const { key, description } of requiredSecrets) {
      try {
        const value = (await this.infisicalService.getSecret(key)) || this.configService.get<string>(key);
        if (!value) {
          missingSecrets.push(`${key} (${description})`);
        }
      } catch {
        missingSecrets.push(`${key} (${description})`);
      }
    }

    if (missingSecrets.length > 0) {
      this.addServiceStatus(serviceName, 'warning', `Missing: ${missingSecrets.length} required secrets`);
      this.initializationReport.requiredActions.push(...missingSecrets.map((s) => `Configure secret: ${s}`));
    } else {
      this.addServiceStatus(serviceName, 'success', 'All required secrets configured');
    }
  }

  // ==========================================
  // Reporting and Utilities
  // ==========================================

  private addServiceStatus(service: string, status: 'success' | 'warning' | 'error', message: string, details?: Record<string, unknown>): void {
    this.initializationReport.services.push({
      service,
      status,
      message,
      details,
    });
  }

  private printInitializationReport(): void {
    const { overallStatus, services, requiredActions } = this.initializationReport;

    // Determine emoji based on status
    const statusEmoji = {
      healthy: '✅',
      degraded: '⚠️',
      failed: '❌',
    }[overallStatus];

    this.logger.log(`\n${'='.repeat(80)}`);
    this.logger.log(`${statusEmoji} INITIALIZATION REPORT - Status: ${overallStatus.toUpperCase()}`);
    this.logger.log('='.repeat(80));

    // Service statuses
    this.logger.log('\n📊 Service Status:');
    for (const service of services) {
      const icon = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
      }[service.status];

      this.logger.log(`  ${icon} ${service.service}: ${service.message}`);
      if (service.details) {
        this.logger.debug(`     Details: ${JSON.stringify(service.details)}`);
      }
    }

    // Required actions
    if (requiredActions.length > 0) {
      this.logger.log('\n📝 Required Actions:');
      requiredActions.forEach((action, index) => {
        this.logger.log(`  ${index + 1}. ${action}`);
      });
    }

    this.logger.log(`${'='.repeat(80)}\n`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current initialization status
   * Useful for health check endpoints
   */
  getInitializationStatus(): InitializationReport {
    return this.initializationReport;
  }

  /**
   * Get the current initialization state
   */
  getInitializationState(): InitializationState {
    return { ...this.state };
  }

  /**
   * Check if this is a first run
   */
  isFirstRunInstance(): boolean {
    return this.isFirstRun();
  }
}
