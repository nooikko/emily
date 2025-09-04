import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalModule } from './infisical.module';
import { type DatabaseConfig, InfisicalConfigFactory } from './infisical-config.factory';
import { InfisicalConfigModule } from './infisical-config.module';

/**
 * Database Configuration Module
 *
 * Provides centralized database configuration management using Infisical secrets.
 * This module fetches database connection parameters from Infisical instead of
 * environment variables for improved security.
 */
@Module({
  imports: [ConfigModule, InfisicalModule, InfisicalConfigModule],
  providers: [
    {
      provide: 'DATABASE_CONFIG',
      useFactory: async (infisicalConfigFactory: InfisicalConfigFactory): Promise<DatabaseConfig> => {
        return await infisicalConfigFactory.createDatabaseConfig();
      },
      inject: [InfisicalConfigFactory],
    },
  ],
  exports: ['DATABASE_CONFIG'],
})
export class DatabaseConfigModule {}
