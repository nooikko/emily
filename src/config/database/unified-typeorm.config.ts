import { NestFactory } from '@nestjs/core';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppModule } from '../../app.module';
import type { DatabaseConfig } from '../../infisical/infisical-config.factory';
import { StructuredLoggerService } from '../../observability/services/structured-logger.service';
import { Configuration } from '../entities/configuration.entity';

/**
 * Unified TypeORM Configuration
 *
 * This module provides a single source of truth for database configuration
 * that works for both NestJS runtime and TypeORM CLI operations.
 *
 * It fetches configuration from the same sources used by the application:
 * - Database credentials from Infisical (secure)
 * - Database connection details from environment variables
 * - Falls back to environment variables only in development
 */

/**
 * Create TypeORM DataSource configuration using the same configuration
 * system as the main application (Environment + Infisical)
 */
async function createUnifiedConfig(): Promise<DataSourceOptions> {
  const logger = new StructuredLoggerService('UnifiedTypeOrmConfig');

  try {
    // Bootstrap a minimal NestJS context to access configuration
    const app = await NestFactory.create(AppModule, {
      logger: false, // Suppress logs during CLI operations
    });

    // Get database configuration from the injected provider
    const databaseConfig = app.get<DatabaseConfig>('DATABASE_CONFIG');

    // Clean up the temporary app context
    await app.close();

    logger.logInfo('Database configuration loaded successfully from Infisical/environment');

    return {
      type: 'postgres',
      host: databaseConfig.host,
      port: databaseConfig.port,
      username: databaseConfig.username,
      password: databaseConfig.password,
      database: databaseConfig.database,
      entities: [Configuration],
      migrations: ['src/config/database/migrations/*.ts'],
      migrationsTableName: 'migrations',
      synchronize: true, // Always use migrations in production
      logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'migration'] : ['error', 'migration'],
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };
  } catch (error) {
    logger.logWarn('Failed to load configuration from Infisical, falling back to environment variables only', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });

    // Fallback to environment variables for development/local usage
    return {
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USERNAME || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'emily',
      entities: [Configuration],
      migrations: ['src/config/database/migrations/*.ts'],
      migrationsTableName: 'migrations',
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'migration'] : ['error', 'migration'],
    };
  }
}

/**
 * Export the unified DataSource for TypeORM CLI
 * This ensures migrations use the same database configuration as the application
 */
export const unifiedDataSource = createUnifiedConfig().then((config) => new DataSource(config));

/**
 * Default export for TypeORM CLI compatibility
 */
export default unifiedDataSource;
