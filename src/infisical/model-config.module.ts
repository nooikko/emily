import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalModule } from './infisical.module';
import { type AnthropicConfig, InfisicalConfigFactory, type OpenAIConfig } from './infisical-config.factory';

export interface ModelConfigurations {
  readonly openai: OpenAIConfig;
  readonly anthropic: AnthropicConfig;
}

/**
 * Model Configuration Module
 *
 * Provides centralized AI model configuration management using Infisical secrets.
 * This module fetches API keys and model configurations from Infisical for both
 * OpenAI and Anthropic providers.
 */
@Module({
  imports: [ConfigModule, InfisicalModule],
  providers: [
    {
      provide: 'MODEL_CONFIGS',
      useFactory: async (infisicalConfigFactory: InfisicalConfigFactory): Promise<ModelConfigurations> => {
        const [openai, anthropic] = await Promise.all([infisicalConfigFactory.createOpenAIConfig(), infisicalConfigFactory.createAnthropicConfig()]);

        return { openai, anthropic };
      },
      inject: [InfisicalConfigFactory],
    },
  ],
  exports: ['MODEL_CONFIGS'],
})
export class ModelConfigModule {}
