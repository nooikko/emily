import { ConfigService } from '@nestjs/config';
import type { LangSmithConfig, LangSmithEnvironment } from '../types/langsmith-config.interface';

/**
 * Factory function to create LangSmith configuration from environment variables.
 * Provides sensible defaults and production-ready security settings.
 */
export const createLangSmithConfig = (configService: ConfigService): LangSmithConfig => {
  const env: LangSmithEnvironment = {
    LANGSMITH_API_KEY: configService.get<string>('LANGSMITH_API_KEY'),
    LANGSMITH_TRACING: configService.get<string>('LANGSMITH_TRACING'),
    LANGCHAIN_PROJECT: configService.get<string>('LANGCHAIN_PROJECT'),
    LANGSMITH_ENDPOINT: configService.get<string>('LANGSMITH_ENDPOINT'),
    LANGCHAIN_CALLBACKS_BACKGROUND: configService.get<string>('LANGCHAIN_CALLBACKS_BACKGROUND'),
    LANGSMITH_HIDE_INPUTS: configService.get<string>('LANGSMITH_HIDE_INPUTS'),
    LANGSMITH_HIDE_OUTPUTS: configService.get<string>('LANGSMITH_HIDE_OUTPUTS'),
    NODE_ENV: configService.get<string>('NODE_ENV'),
  };

  const isProduction = env.NODE_ENV === 'production';

  return {
    apiKey: env.LANGSMITH_API_KEY!,
    tracingEnabled: env.LANGSMITH_TRACING !== 'false',
    projectName: env.LANGCHAIN_PROJECT!,
    endpoint: env.LANGSMITH_ENDPOINT,
    backgroundCallbacks: env.LANGCHAIN_CALLBACKS_BACKGROUND !== 'false',

    // Security defaults: hide sensitive data in production
    hideInputs: env.LANGSMITH_HIDE_INPUTS === 'true' || isProduction,
    hideOutputs: env.LANGSMITH_HIDE_OUTPUTS === 'true' || isProduction,

    // Default metadata to include with all traces
    defaultMetadata: {
      environment: env.NODE_ENV || 'development',
      service: 'Emily-AI-Agent',
      version: process.env.npm_package_version || '0.0.1',
    },

    // Common regex patterns for masking sensitive data
    maskingPatterns: {
      // Email addresses
      email: '[EMAIL_REDACTED]',
      // Phone numbers (various formats)
      phone: '[PHONE_REDACTED]',
      // Credit card numbers
      creditCard: '[CARD_REDACTED]',
      // API keys and tokens
      apiKey: '[API_KEY_REDACTED]',
      // Passwords
      password: '[PASSWORD_REDACTED]',
    },
  };
};

/**
 * Default LangSmith endpoints for different regions
 */
export const LANGSMITH_ENDPOINTS = {
  US: 'https://api.smith.langchain.com',
  EU: 'https://eu.api.smith.langchain.com',
} as const;

/**
 * Common regex patterns for data masking
 */
export const MASKING_PATTERNS = {
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  API_KEY: /\b[A-Za-z0-9_-]{32,}\b/g,
  PASSWORD: /password['":\s]*['"]\w+['"]?/gi,
} as const;
