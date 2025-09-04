import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfisicalModule } from '../infisical/infisical.module';
import { UnleashModule } from '../unleash/unleash.module';
import { ConfigurationController } from './controllers/configuration.controller';
import { Configuration } from './entities/configuration.entity';
import { ConfigurationRepository } from './repositories/configuration.repository';
import { ConfigurationService } from './services/configuration.service';
import { UnifiedConfigService } from './services/unified-config.service';

/**
 * Dynamic Configuration Module
 *
 * Provides database-backed configuration management with runtime updates,
 * validation, and environment-specific settings. This module enables
 * the application to change configuration without restarts.
 * 
 * Also includes the UnifiedConfigService for priority-based configuration
 * resolution across Infisical (secrets), Unleash (feature flags), and 
 * environment variables.
 */
@Module({
  imports: [
    NestConfigModule, 
    TypeOrmModule.forFeature([Configuration]),
    InfisicalModule,
    UnleashModule,
  ],
  providers: [ConfigurationService, ConfigurationRepository, UnifiedConfigService],
  controllers: [ConfigurationController],
  exports: [ConfigurationService, ConfigurationRepository, UnifiedConfigService],
})
export class ConfigModule {}
