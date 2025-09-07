import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalService } from './infisical.service';
import { InfisicalConfigFactory } from './infisical-config.factory';

/**
 * InfisicalModule - Centralized secret management module
 *
 * This module provides integration with Infisical for secure secret management,
 * replacing traditional .env file usage with a centralized, encrypted secret store.
 *
 * Features:
 * - Centralized secret management across environments
 * - Automatic secret rotation support
 * - Caching for performance optimization
 * - Fallback to environment variables for backward compatibility
 * - Environment-specific secret retrieval
 *
 * Configuration:
 * The module requires the following environment variables for Infisical connection:
 * - INFISICAL_ENABLED: Enable/disable Infisical integration (default: false)
 * - INFISICAL_SITE_URL: Infisical API URL (optional for cloud version)
 * - INFISICAL_CLIENT_ID: Service account client ID
 * - INFISICAL_CLIENT_SECRET: Service account client secret
 * - INFISICAL_PROJECT_ID: Infisical project ID
 * - INFISICAL_ENVIRONMENT: Environment to fetch secrets from (default: NODE_ENV)
 * - INFISICAL_CACHE_TTL: Cache duration in milliseconds (default: 300000)
 * - INFISICAL_FALLBACK_TO_ENV: Fall back to env vars if Infisical fails (default: true)
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [InfisicalService, InfisicalConfigFactory],
  exports: [InfisicalService, InfisicalConfigFactory],
})
export class InfisicalModule {}
