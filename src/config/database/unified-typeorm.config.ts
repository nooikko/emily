import { DataSource, type DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { Configuration } from '../entities/configuration.entity';
import type { DatabaseConfig } from '../../infisical/infisical-config.factory';

/**
 * Unified TypeORM Configuration
 * 
 * This module provides a single source of truth for database configuration
 * that works for both NestJS runtime and TypeORM CLI operations.
 * 
 * It fetches configuration from the same sources used by the application:
 * - Database credentials from Infisical (secure)
 * - Database connection details from Unleash (non-secret)
 * - Falls back to environment variables only in development
 */

/**
 * Create TypeORM DataSource configuration using the same configuration
 * system as the main application (Infisical + Unleash)
 */
async function createUnifiedConfig(): Promise<DataSourceOptions> {
  try {
    // Bootstrap a minimal NestJS context to access configuration
    const app = await NestFactory.create(AppModule, { 
      logger: false // Suppress logs during CLI operations
    });
    
    // Get database configuration from the injected provider
    const databaseConfig = app.get<DatabaseConfig>('DATABASE_CONFIG');
    
    // Clean up the temporary app context
    await app.close();

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
      synchronize: false, // Always use migrations in production
      logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'migration'] : ['error', 'migration'],
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };
  } catch (error) {
    console.warn('Failed to load configuration from Infisical/Unleash, falling back to environment variables');
    console.warn('Error:', error instanceof Error ? error.message : error);
    
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
export const unifiedDataSource = createUnifiedConfig().then(config => new DataSource(config));

/**
 * Default export for TypeORM CLI compatibility
 */
export default unifiedDataSource;