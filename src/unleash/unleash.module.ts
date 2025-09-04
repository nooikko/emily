import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfisicalModule } from '../infisical/infisical.module';
import { UnleashService } from './unleash.service';
import { UnleashConfigFactory } from './unleash-config.factory';

/**
 * UnleashModule - Centralized feature flag based configuration management module
 *
 * This module provides integration with Unleash for feature flag based configuration,
 * allowing configuration values to be managed through feature flag variants.
 * This complements the Infisical module which handles secrets.
 *
 * Features:
 * - Feature flag based configuration management
 * - Configuration values stored in feature flag variants
 * - Automatic configuration refresh based on flag updates
 * - Caching for performance optimization
 * - Fallback to environment variables for backward compatibility
 * - Environment-specific configuration retrieval
 * - Integration with Infisical for API key management
 *
 * Configuration:
 * The module requires the following configuration for Unleash connection:
 * - UNLEASH_ENABLED: Enable/disable Unleash integration (default: false)
 * - UNLEASH_URL: Unleash API URL (required if enabled)
 * - UNLEASH_API_KEY: API key for Unleash (fetched from Infisical)
 * - UNLEASH_APP_NAME: Application name for Unleash (default: 'emily-ai-agent')
 * - UNLEASH_ENVIRONMENT: Environment for feature flags (default: NODE_ENV)
 * - UNLEASH_INSTANCE_ID: Unique instance identifier (optional)
 * - UNLEASH_REFRESH_INTERVAL: How often to refresh flags in ms (default: 15000)
 * - UNLEASH_METRICS_INTERVAL: How often to send metrics in ms (default: 60000)
 * - UNLEASH_CACHE_TTL: Cache duration in milliseconds (default: 300000)
 * - UNLEASH_FALLBACK_TO_ENV: Fall back to env vars if Unleash fails (default: true)
 * - UNLEASH_TIMEOUT: Request timeout in ms (default: 10000)
 * - UNLEASH_RETRIES: Number of retries for failed requests (default: 2)
 *
 * Dependencies:
 * - Requires InfisicalModule for fetching the UNLEASH_API_KEY
 * - Uses ConfigModule for environment variable access
 */
@Global()
@Module({
  imports: [ConfigModule, forwardRef(() => InfisicalModule)],
  providers: [UnleashService, UnleashConfigFactory],
  exports: [UnleashService, UnleashConfigFactory],
})
export class UnleashModule {}
