import { Injectable, Logger, OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type UnleashConfig as ClientConfig, getVariant, initialize, isEnabled, type Unleash } from 'unleash-client';
import { InfisicalService } from '../infisical/infisical.service';
import {
  type CachedConfigValue,
  type ConfigValueResult,
  ConfigValueSource,
  type Environment,
  type UnleashApiUrl,
  type UnleashAppName,
  type UnleashClientKey,
  type UnleashConfig,
  type UnleashContext,
} from './interfaces/unleash-config.interface';

/**
 * Base error class for Unleash-related errors
 */
abstract class UnleashError extends Error {
  abstract readonly code: string;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    // Store cause as property for debugging
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
 * Configuration fetch error for Unleash configuration retrieval failures
 */
export class UnleashConfigFetchError extends UnleashError {
  readonly code = 'UNLEASH_CONFIG_FETCH_ERROR' as const;

  constructor(
    message: string,
    public readonly configKey: string,
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * Unleash initialization error
 */
export class UnleashInitializationError extends UnleashError {
  readonly code = 'UNLEASH_INITIALIZATION_ERROR' as const;
}

/**
 * Unleash service for feature flag based configuration management
 * Following the same patterns established by InfisicalService for consistency
 */
@Injectable()
export class UnleashService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnleashService.name);
  private client: Unleash | null = null;
  private configCache = new Map<string, CachedConfigValue>();
  private readonly config: UnleashConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly infisicalService: InfisicalService,
  ) {
    // Safe parsing with proper type validation
    const cacheTtlValue = this.configService.get<string>('UNLEASH_CACHE_TTL');
    const parsedCacheTtl = cacheTtlValue ? Number.parseInt(cacheTtlValue, 10) : 300000;

    if (Number.isNaN(parsedCacheTtl) || parsedCacheTtl < 0) {
      throw new Error(`Invalid UNLEASH_CACHE_TTL value: ${cacheTtlValue}. Must be a positive number.`);
    }

    const enabledValue = this.configService.get<string | boolean>('UNLEASH_ENABLED');

    this.config = {
      enabled: enabledValue === 'true' || enabledValue === true,
      url: this.configService.get<string>('UNLEASH_URL') as UnleashApiUrl,
      clientKey: undefined, // Will be fetched from Infisical during initialization
      appName: (this.configService.get<string>('UNLEASH_APP_NAME') || 'emily-ai-agent') as UnleashAppName,
      environment: (this.configService.get<string>('UNLEASH_ENVIRONMENT') ||
        this.configService.get<string>('NODE_ENV') ||
        'development') as Environment,
      instanceId: this.configService.get<string>('UNLEASH_INSTANCE_ID'),
      refreshInterval: Number.parseInt(this.configService.get<string>('UNLEASH_REFRESH_INTERVAL') || '15000', 10),
      metricsInterval: Number.parseInt(this.configService.get<string>('UNLEASH_METRICS_INTERVAL') || '60000', 10),
      cacheTtl: parsedCacheTtl,
      fallbackToEnv: this.configService.get<string>('UNLEASH_FALLBACK_TO_ENV') !== 'false',
      timeout: Number.parseInt(this.configService.get<string>('UNLEASH_TIMEOUT') || '10000', 10),
      retries: Number.parseInt(this.configService.get<string>('UNLEASH_RETRIES') || '2', 10),
    };
  }

  async onModuleInit() {
    this.logger.log('Initializing Unleash service...');
    await this.initialize();
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Destroying Unleash client...');
      this.client.destroy();
      this.client = null;
    }
  }

  private async initialize() {
    // Skip initialization if Unleash is not enabled
    if (!this.config.enabled) {
      this.logger.log('Unleash is disabled. Skipping initialization.');
      this.logger.debug('Config.enabled value:', this.config.enabled);
      return;
    }

    // If already initialized, do nothing
    if (this.isInitialized && this.client) {
      return;
    }

    // Concurrency guard: reuse in-flight initialization
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    try {
      this.initializationPromise = (async () => {
        // Try to wait for InfisicalService to be ready before fetching secrets
        try {
          await this.infisicalService.waitForReady();
        } catch (error) {
          this.logger.error('Failed to wait for InfisicalService readiness:', error);
          if (this.config.fallbackToEnv) {
            this.logger.warn('Proceeding with Unleash initialization despite Infisical failure (fallback enabled)');
            // Continue with initialization attempt
          } else {
            throw error;
          }
        }
        
        // Fetch the Unleash API key from Infisical
        const unleashApiKey = await this.infisicalService.getSecret('UNLEASH_API_KEY');

        if (!unleashApiKey) {
          throw new UnleashInitializationError('UNLEASH_API_KEY not found in Infisical secrets');
        }

        if (!this.config.url) {
          throw new UnleashInitializationError('UNLEASH_URL must be configured');
        }

        // Initialize Unleash client with proper typing
        const clientConfig: ClientConfig = {
          url: this.config.url,
          appName: this.config.appName,
          environment: this.config.environment,
          instanceId: this.config.instanceId,
          refreshInterval: this.config.refreshInterval,
          metricsInterval: this.config.metricsInterval,
          timeout: this.config.timeout,
          customHeaders: {
            Authorization: unleashApiKey as UnleashClientKey,
          },
        };

        this.logger.log('Initializing Unleash client...');
        this.logger.debug('Unleash config:', {
          url: this.config.url,
          appName: this.config.appName,
          environment: this.config.environment,
          instanceId: this.config.instanceId,
        });

        this.client = initialize(clientConfig);

        // Wait for client to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new UnleashInitializationError('Unleash client initialization timeout'));
          }, this.config.timeout || 10000);

          this.client!.on('ready', () => {
            clearTimeout(timeout);
            resolve();
          });

          this.client!.on('error', (error: Error) => {
            clearTimeout(timeout);
            reject(new UnleashInitializationError('Unleash client initialization failed', error));
          });
        });

        this.logger.log(`Unleash client initialized successfully for environment: ${this.config.environment}`);
        this.logger.log(`Connected to Unleash at: ${this.config.url}`);

        this.isInitialized = true;
      })();
      await this.initializationPromise;
    } catch (error) {
      this.logger.error('Failed to initialize Unleash client:', error);
      if (!this.config.fallbackToEnv) {
        throw error;
      }
      this.logger.warn('Falling back to environment variables due to Unleash initialization failure.');
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Get a configuration value from Unleash feature flag variant or fall back to environment variable
   * Uses Result pattern for better error handling with intelligent source tracking
   */
  async getConfigValue(key: string, defaultValue?: string): Promise<string | undefined> {
    // Ensure service is initialized before fetching config values
    if (!this.isInitialized && this.config.enabled) {
      await this.initialize();
    }

    const result = await this.getConfigValueWithSource(key, defaultValue);
    this.logConfigRetrieval(key, result);
    return result.value;
  }

  /**
   * Get a configuration value with source tracking for intelligent logging
   */
  private async getConfigValueWithSource(key: string, defaultValue?: string): Promise<ConfigValueResult> {
    // Check cache first
    const cached = this.configCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return {
        value: cached.value,
        source: ConfigValueSource.CACHE,
        found: true,
      };
    }

    // If Unleash is not enabled or initialized, use environment variable
    if (!this.config.enabled || !this.isInitialized || !this.client) {
      return this.getFromEnvWithSource(key, defaultValue);
    }

    try {
      // Create context for feature flag evaluation
      const context: UnleashContext = {
        environment: this.config.environment,
        appName: this.config.appName,
      };

      // Check if the feature flag is enabled
      if (!isEnabled(key, context, false)) {
        if (this.config.fallbackToEnv) {
          return this.getFromEnvWithSource(key, defaultValue);
        }

        if (defaultValue !== undefined) {
          return {
            value: defaultValue,
            source: ConfigValueSource.DEFAULT,
            found: true,
          };
        }

        return {
          value: undefined,
          source: null,
          found: false,
        };
      }

      // Get the variant for this feature flag
      const variant = getVariant(key, context);

      if (variant?.payload?.value) {
        const configValue = variant.payload.value;

        // Cache the config value with source tracking
        this.configCache.set(key, {
          value: configValue,
          expiry: Date.now() + this.config.cacheTtl,
          source: ConfigValueSource.UNLEASH,
        });

        return {
          value: configValue,
          source: ConfigValueSource.UNLEASH,
          found: true,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to fetch config value ${key} from Unleash:`, error);
      if (this.config.fallbackToEnv) {
        this.logger.log(`Falling back to environment variable for key: ${key}`);
        return this.getFromEnvWithSource(key, defaultValue);
      }
      throw new UnleashConfigFetchError(`Failed to fetch config value: ${key}`, key, error as Error);
    }

    // If config not found in Unleash and fallback is enabled
    if (this.config.fallbackToEnv) {
      return this.getFromEnvWithSource(key, defaultValue);
    }

    // Not found anywhere, use default if provided
    if (defaultValue !== undefined) {
      return {
        value: defaultValue,
        source: ConfigValueSource.DEFAULT,
        found: true,
      };
    }

    return {
      value: undefined,
      source: null,
      found: false,
    };
  }

  /**
   * Get multiple configuration values at once with type-safe key validation
   */
  async getConfigValues(keys: readonly string[]): Promise<Record<string, string | undefined>> {
    // Ensure service is initialized before fetching config values
    if (!this.isInitialized && this.config.enabled) {
      await this.initialize();
    }

    const results: Record<string, string | undefined> = {};

    // Process each key individually for now
    // In future, we could optimize this with batch operations if Unleash supports it
    for (const key of keys) {
      try {
        const result = await this.getConfigValueWithSource(key);
        results[key] = result.value;
        this.logConfigRetrieval(key, result);
      } catch (error) {
        this.logger.error(`Failed to fetch config value for key '${key}':`, error);
        if (this.config.fallbackToEnv) {
          const envResult = this.getFromEnvWithSource(key);
          results[key] = envResult.value;
          this.logConfigRetrieval(key, envResult);
        } else {
          results[key] = undefined;
          this.logConfigRetrieval(key, {
            value: undefined,
            source: null,
            found: false,
          });
        }
      }
    }

    return results;
  }

  /**
   * Clear the configuration cache
   */
  clearCache() {
    this.configCache.clear();
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureEnabled(flagName: string, context?: UnleashContext): boolean {
    if (!this.isInitialized || !this.client) {
      this.logger.warn(`Unleash not initialized, feature flag '${flagName}' defaulting to false`);
      return false;
    }

    const unleashContext = context || {
      environment: this.config.environment,
      appName: this.config.appName,
    };

    return isEnabled(flagName, unleashContext, false);
  }

  /**
   * Get configuration value from environment variable with source tracking
   */
  private getFromEnvWithSource(key: string, defaultValue?: string): ConfigValueResult {
    const envValue = process.env[key];

    if (envValue) {
      return {
        value: envValue,
        source: ConfigValueSource.ENVIRONMENT,
        found: true,
      };
    }

    if (defaultValue !== undefined) {
      return {
        value: defaultValue,
        source: ConfigValueSource.DEFAULT,
        found: true,
      };
    }

    return {
      value: undefined,
      source: null,
      found: false,
    };
  }

  /**
   * Log configuration retrieval with intelligent warning logic
   */
  private logConfigRetrieval(key: string, result: ConfigValueResult): void {
    switch (result.source) {
      case ConfigValueSource.UNLEASH:
        this.logger.debug(`Config value '${key}' retrieved from Unleash`);
        break;
      case ConfigValueSource.CACHE:
        this.logger.debug(`Config value '${key}' retrieved from cache`);
        break;
      case ConfigValueSource.ENVIRONMENT:
        this.logger.debug(`Config value '${key}' retrieved from environment variable`);
        break;
      case ConfigValueSource.DEFAULT:
        this.logger.debug(`Config value '${key}' using provided default value`);
        break;
      case null:
        // Not found anywhere - this is the only case that should warn
        this.logger.warn(`Config value '${key}' not found in any source (Unleash, environment, or defaults)`);
        break;
    }
  }

  /**
   * Check if Unleash is ready for dependent services
   * Returns true when initialization is complete and service can provide config values
   * This includes the case where Unleash is disabled but fallback is available
   */
  isReady(): boolean {
    // If Unleash is disabled, we're ready (will fall back to env vars)
    if (!this.config.enabled) {
      return true;
    }

    // If Unleash is enabled, we need to be initialized and operational
    return this.isInitialized && this.client !== null;
  }

  /**
   * Wait for the service to be ready with timeout and retry logic
   * Essential for dependent services that need to wait for Unleash initialization
   */
  async waitForReady(timeoutMs = 30000, retryIntervalMs = 1000): Promise<void> {
    const startTime = Date.now();

    while (!this.isReady()) {
      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(`UnleashService failed to become ready within ${timeoutMs}ms`);
      }

      // If Unleash is enabled but not initialized, try to initialize
      if (this.config.enabled && !this.isInitialized) {
        try {
          await this.initialize();
        } catch (error) {
          this.logger.warn('Retrying Unleash initialization:', error);
        }
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    this.logger.log('UnleashService is ready for dependent services');
  }

  /**
   * Check if Unleash is properly configured and operational
   */
  isOperational(): boolean {
    return this.config.enabled && this.isInitialized && this.client !== null;
  }

  /**
   * Get current configuration (for debugging/monitoring)
   * Uses utility type to safely exclude sensitive data
   */
  getConfig(): Omit<UnleashConfig, 'clientKey'> {
    const { clientKey: _clientKey, ...safeConfig } = this.config;
    return safeConfig as Omit<UnleashConfig, 'clientKey'>;
  }
}
