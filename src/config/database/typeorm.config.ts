import { DataSource } from 'typeorm';
import { Configuration } from '../entities/configuration.entity';

/**
 * @deprecated This configuration is deprecated. Use unified-typeorm.config.ts instead.
 * 
 * Legacy TypeORM configuration for the Configuration module
 *
 * This configuration has been replaced with unified-typeorm.config.ts which
 * integrates with the same Infisical + Unleash configuration system used
 * by the main application.
 * 
 * TODO: Remove this file once all references are updated.
 */
export const configDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USERNAME || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'emily',
  entities: [Configuration],
  migrations: ['src/config/database/migrations/*.ts'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
});
