import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalModule } from './infisical.module';
import { InfisicalConfigFactory } from './infisical-config.factory';

/**
 * InfisicalConfigModule - Configuration factory module
 *
 * This module provides the InfisicalConfigFactory which depends on InfisicalService.
 * It's separated from InfisicalModule to avoid circular dependencies.
 */
@Module({
  imports: [ConfigModule, InfisicalModule],
  providers: [InfisicalConfigFactory],
  exports: [InfisicalConfigFactory],
})
export class InfisicalConfigModule {}
