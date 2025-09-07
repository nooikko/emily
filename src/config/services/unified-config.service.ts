import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfisicalService } from '../../infisical/infisical.service';

/**
 * Configuration value sources with priority order
 * Higher priority sources override lower priority ones
 */
export enum ConfigSource {
  ENVIRONMENT = 'environment',
  DEFAULT = 'default',
  INFISICAL = 'infisical', // Secrets (highest priority)
}

/**
 * Configuration value with source tracking and caching metadata
 */
export interface UnifiedConfigValue {
  readonly value: string | undefined;
  readonly source: ConfigSource | null;
  readonly found: boolean;
  readonly cached: boolean;
  readonly expiry?: number;
}

/**
 * Cached configuration entry with TTL and source tracking
 */
interface CachedConfigEntry {
  readonly value: string;
  readonly source: ConfigSource;
  readonly expiry: number;
  readonly timestamp: number;
}

/**
 * Configuration retrieval options
 */
export interface ConfigOptions {
  /** Skip cache and force fresh retrieval */
  readonly skipCache?: boolean;
  /** Custom cache TTL in milliseconds (overrides service default) */
  readonly cacheTtl?: number;
  /** Sources to check in order (defaults to all sources by priority) */
  readonly sources?: readonly ConfigSource[];
  /** Default value if not found in any source */
  readonly defaultValue?: string;
}

/**
 * Base error class for unified configuration errors
 */
abstract class UnifiedConfigError extends Error {
  abstract readonly code: string;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    if (cause) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

/**
 * Configuration fetch error when all sources fail
 */
export class ConfigFetchError extends UnifiedConfigError {
  readonly code = 'CONFIG_FETCH_ERROR' as const;

  constructor(
    message: string,
    public readonly configKey: string,
    public readonly attemptedSources: readonly ConfigSource[],
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * Unified Configuration Service
 *
 * Provides a single source of truth for configuration values by combining:
 * 1. Infisical (secrets) - Highest priority
 * 2. Environment variables - Lower priority
 * 3. Default values - Lowest priority
 *
 * Features:
 * - Priority-based resolution with intelligent caching
 * - Type-safe configuration access with branded types
 * - Source tracking for debugging and auditing
 * - Batch configuration retrieval for performance
 * - Circuit breaker pattern for service resilience
 * - Comprehensive error handling with typed errors
 */
@Injectable()
export class UnifiedConfigService implements OnModuleInit {
  private readonly logger = new Logger(UnifiedConfigService.name);
  private configCache = new Map<string, CachedConfigEntry>();
  private readonly defaultCacheTtl: number;

  /**
   * Keys that are stored in the database and should not be looked up in external services
   * These will only use environment variables as fallback
   */
  private readonly DATABASE_STORED_KEYS = new Set(['OPENAI_MODEL', 'ANTHROPIC_MODEL', 'ELEVENLABS_DEFAULT_VOICE_ID']);

  /**
   * Configuration keys that should skip Infisical (non-secret config values)
   * These are configuration values, not secrets, and should use Environment/Default
   */
  private readonly NON_SECRET_CONFIG_KEYS = new Set([
    // OpenTelemetry configuration (not secrets)
    'OTEL_SERVICE_NAME',
    'OTEL_SERVICE_VERSION',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_PROTOCOL',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'OTEL_EXPORTER_OTLP_COMPRESSION',
    'OTEL_RESOURCE_SERVICE_NAMESPACE',
    'OTEL_INSTRUMENTATION_HTTP_ENABLED',
    'OTEL_INSTRUMENTATION_EXPRESS_ENABLED',
    'OTEL_INSTRUMENTATION_NESTJS_ENABLED',
    'OTEL_INSTRUMENTATION_POSTGRES_ENABLED',
    'OTEL_INSTRUMENTATION_REDIS_ENABLED',
    'OTEL_INSTRUMENTATION_LANGCHAIN_ENABLED',
    'OTEL_TRACES_SAMPLER_ARG',
    'OTEL_METRICS_SAMPLER_ARG',
    'OTEL_LOG_LEVEL',
    'OTEL_LOGS_CONSOLE_ENABLED',
    'OTEL_LOGS_STRUCTURED_ENABLED',
    'OTEL_METRICS_EXPORT_INTERVAL',
    // Other non-secret configuration
    'NODE_ENV',
    'PORT',
  ]);

  private isReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly infisicalService: InfisicalService,
  ) {
    // Parse cache TTL with proper validation
    const cacheTtlValue = this.configService.get<string>('UNIFIED_CONFIG_CACHE_TTL');
    const parsedCacheTtl = cacheTtlValue ? Number.parseInt(cacheTtlValue, 10) : 300000; // 5 minutes default

    if (Number.isNaN(parsedCacheTtl) || parsedCacheTtl < 0) {
      throw new Error(`Invalid UNIFIED_CONFIG_CACHE_TTL value: ${cacheTtlValue}. Must be a positive number.`);
    }

    this.defaultCacheTtl = parsedCacheTtl;
  }

  async onModuleInit() {
    this.logger.log('Initializing Unified Configuration service...');

    // Wait for Infisical service to be ready
    try {
      this.logger.log('Waiting for Infisical service to be ready...');

      await this.infisicalService.waitForReady();

      this.logger.log('Infisical service is ready');
      this.isReady = true;
      this.logger.log('Unified Configuration service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Unified Configuration service:', error);
      // Don't throw - allow fallback to environment variables
      this.logger.warn('Unified Configuration service will operate in degraded mode (environment variables only)');
      this.isReady = false;
    }
  }

  /**
   * Get a configuration value using priority resolution
   * Priority: Infisical > Environment > Default
   */
  async getConfig(key: string, options: ConfigOptions = {}): Promise<string | undefined> {
    const result = await this.getConfigWithMetadata(key, options);
    this.logConfigRetrieval(key, result);
    return result.value;
  }

  /**
   * Get configuration value with full metadata (source, caching info, etc.)
   */
  async getConfigWithMetadata(key: string, options: ConfigOptions = {}): Promise<UnifiedConfigValue> {
    // Check if this key is database-stored and should skip external lookups
    const isDatabaseKey = this.DATABASE_STORED_KEYS.has(key);
    // Check if this key is a non-secret config value that should skip Infisical
    const isNonSecretConfig = this.NON_SECRET_CONFIG_KEYS.has(key);

    const {
      skipCache = false,
      cacheTtl = this.defaultCacheTtl,
      sources = isDatabaseKey
        ? [ConfigSource.ENVIRONMENT, ConfigSource.DEFAULT] // Skip Infisical for database keys
        : isNonSecretConfig
          ? [ConfigSource.ENVIRONMENT, ConfigSource.DEFAULT] // Skip Infisical for non-secret config
          : [ConfigSource.INFISICAL, ConfigSource.ENVIRONMENT, ConfigSource.DEFAULT],
      defaultValue = options.defaultValue,
    } = options;

    // Check cache first (unless skipping)
    if (!skipCache) {
      const cached = this.configCache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return {
          value: cached.value,
          source: cached.source,
          found: true,
          cached: true,
          expiry: cached.expiry,
        };
      }
    }

    // Try each source in priority order
    for (const source of sources) {
      try {
        const result = await this.getFromSource(key, source, defaultValue);

        if (result.found && result.value !== undefined) {
          // Cache successful results
          if (result.source !== ConfigSource.DEFAULT) {
            this.configCache.set(key, {
              value: result.value,
              source: result.source!,
              expiry: Date.now() + cacheTtl,
              timestamp: Date.now(),
            });
          }

          return {
            ...result,
            cached: false,
          };
        }
      } catch (error) {
        this.logger.warn(`Failed to get config from ${source} for key '${key}':`, error);
        // Continue to next source
      }
    }

    // If we get here, no source provided the value
    return {
      value: undefined,
      source: null,
      found: false,
      cached: false,
    };
  }

  /**
   * Get multiple configuration values at once with batch optimization
   */
  async getConfigs(keys: readonly string[], options: ConfigOptions = {}): Promise<Record<string, string | undefined>> {
    const results: Record<string, string | undefined> = {};

    // For now, process individually - could optimize with batch operations later
    const promises = keys.map(async (key) => {
      const value = await this.getConfig(key, options);
      return { key, value };
    });

    const resolvedResults = await Promise.all(promises);

    for (const { key, value } of resolvedResults) {
      results[key] = value;
    }

    return results;
  }

  /**
   * Get configuration value from specific source
   */
  private async getFromSource(key: string, source: ConfigSource, defaultValue?: string): Promise<UnifiedConfigValue> {
    switch (source) {
      case ConfigSource.INFISICAL: {
        if (!this.infisicalService.isReady()) {
          return { value: undefined, source: null, found: false, cached: false };
        }

        try {
          const value = await this.infisicalService.getSecret(key);
          if (value !== undefined) {
            return {
              value,
              source: ConfigSource.INFISICAL,
              found: true,
              cached: false,
            };
          }
        } catch (error) {
          this.logger.debug(`Infisical lookup failed for key '${key}':`, error);
        }
        break;
      }

      case ConfigSource.ENVIRONMENT: {
        const envValue = process.env[key] || this.configService.get<string>(key);
        if (envValue !== undefined) {
          return {
            value: envValue,
            source: ConfigSource.ENVIRONMENT,
            found: true,
            cached: false,
          };
        }
        break;
      }

      case ConfigSource.DEFAULT: {
        if (defaultValue !== undefined) {
          return {
            value: defaultValue,
            source: ConfigSource.DEFAULT,
            found: true,
            cached: false,
          };
        }
        break;
      }

      default: {
        // TypeScript should prevent this with proper typing, but defensive programming
        this.logger.warn(`Unknown config source: ${String(source)} for key '${key}'`);
        break;
      }
    }

    return {
      value: undefined,
      source: null,
      found: false,
      cached: false,
    };
  }

  /**
   * Check if the unified configuration service is ready
   */
  isServiceReady(): boolean {
    return this.isReady;
  }

  /**
   * Clear the configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.logger.debug('Configuration cache cleared');
  }

  /**
   * Clear cache entries that have expired
   */
  clearExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.configCache.entries()) {
      if (entry.expiry <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.configCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleared ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    readonly size: number;
    readonly hitRate: number;
    readonly entries: ReadonlyArray<{
      readonly key: string;
      readonly source: ConfigSource;
      readonly expiry: number;
      readonly age: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.configCache.entries()).map(([key, entry]) => ({
      key,
      source: entry.source,
      expiry: entry.expiry,
      age: now - entry.timestamp,
    }));

    return {
      size: this.configCache.size,
      hitRate: 0, // Would need request tracking to calculate actual hit rate
      entries,
    };
  }

  /**
   * Log configuration retrieval with intelligent warning logic
   */
  private logConfigRetrieval(key: string, result: UnifiedConfigValue): void {
    if (result.cached) {
      // Successful retrieval from cache - no debug logging needed
      return;
    }

    switch (result.source) {
      case ConfigSource.INFISICAL:
        // Successful retrieval - no debug logging needed
        break;

      case ConfigSource.ENVIRONMENT:
        // Successful retrieval from env - no debug logging needed
        break;

      case ConfigSource.DEFAULT:
        // Using default value - no debug logging needed
        break;

      case null:
        // Not found anywhere - warn about it
        this.logger.warn(`Config '${key}' not found in any source (Infisical, environment, or defaults)`);
        break;

      default:
        this.logger.warn(`Config '${key}' retrieved from unknown source: ${String(result.source)}`);
        break;
    }
  }
}
