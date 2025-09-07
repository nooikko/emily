import { DataSource } from 'typeorm';
import { Configuration } from '../entities/configuration.entity';

/**
 * Local Development Database Configuration
 *
 * This configuration is used only for local development when Infisical
 * and Infisical services are not available. It reads from environment
 * variables or uses sensible defaults.
 *
 * Usage: Set NODE_ENV=local-dev to use this configuration
 */
export const localDevDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USERNAME || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'emily',
  entities: [Configuration],
  migrations: ['src/config/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: true, // Always use migrations
  logging: ['query', 'error', 'migration'],
});

export default localDevDataSource;
