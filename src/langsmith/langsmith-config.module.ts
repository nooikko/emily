import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalConfigFactory } from '../infisical/infisical-config.factory';
import { InfisicalConfigModule } from '../infisical/infisical-config.module';
import { langsmithConfigSchema } from './config/langsmith-config.validation';
import type { LangSmithConfig } from './types/langsmith-config.interface';

/**
 * LangSmith Configuration Module
 *
 * Provides centralized configuration management for LangSmith integration.
 * Includes validation, environment variable parsing, and dependency injection setup.
 *
 * Features:
 * - Environment variable validation with Joi
 * - Production-ready security defaults
 * - Type-safe configuration injection
 * - Flexible endpoint configuration for cloud/self-hosted
 */
@Module({
  imports: [ConfigModule, InfisicalConfigModule],
  providers: [
    {
      provide: 'LANGSMITH_CONFIG',
      useFactory: async (infisicalConfigFactory: InfisicalConfigFactory): Promise<LangSmithConfig> => {
        // Validate environment variables (keeping validation for non-Infisical vars)
        const validatedEnv = langsmithConfigSchema.validate(process.env, {
          allowUnknown: true,
          abortEarly: false,
        });

        if (validatedEnv.error) {
          const errorMessages = validatedEnv.error.details.map((detail) => detail.message);
          throw new Error(`LangSmith configuration validation failed:\n${errorMessages.join('\n')}`);
        }

        return await infisicalConfigFactory.createLangSmithConfig();
      },
      inject: [InfisicalConfigFactory],
    },
  ],
  exports: ['LANGSMITH_CONFIG'],
})
export class LangSmithConfigModule {}
