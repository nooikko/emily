import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalConfigFactory } from '../infisical/infisical-config.factory';
import { InfisicalConfigModule } from '../infisical/infisical-config.module';
import type { ElevenLabsConfig } from './types/elevenlabs-config.interface';

/**
 * ElevenLabsConfigModule - Configuration module for ElevenLabs integration
 *
 * This module provides configuration dependency injection for ElevenLabs services.
 * It creates a typed configuration object from environment variables and makes it
 * available throughout the application via the ELEVENLABS_CONFIG token.
 *
 * Features:
 * - Type-safe configuration with validation
 * - Environment variable mapping with defaults
 * - Centralized configuration management
 * - Injectable configuration service
 *
 * Usage:
 * Import this module in ElevenLabsModule to enable configuration injection:
 *
 * @Module({
 *   imports: [ElevenLabsConfigModule],
 *   // ...
 * })
 * export class ElevenLabsModule {}
 *
 * Inject configuration in services:
 *
 * @Injectable()
 * export class MyService {
 *   constructor(@Inject('ELEVENLABS_CONFIG') private config: ElevenLabsConfig) {}
 * }
 */
@Module({
  imports: [ConfigModule, InfisicalConfigModule],
  providers: [
    {
      provide: 'ELEVENLABS_CONFIG',
      useFactory: async (infisicalConfigFactory: InfisicalConfigFactory): Promise<ElevenLabsConfig> => {
        return await infisicalConfigFactory.createElevenLabsConfig();
      },
      inject: [InfisicalConfigFactory],
    },
  ],
  exports: ['ELEVENLABS_CONFIG'],
})
export class ElevenLabsConfigModule {}
