import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ElevenLabsConfig } from '../elevenlabs/types/elevenlabs-config.interface';
import type { LangSmithConfig } from '../langsmith/types/langsmith-config.interface';
import { InfisicalService } from './infisical.service';

/**
 * Supported configuration value types with strict type constraints
 */
type ConfigValue = string | number | boolean | undefined;

/**
 * Utility type to ensure all keys in config map correspond to config object keys
 * Removes the constraint to work with readonly interfaces
 */
type ConfigMapping<T> = {
  readonly [K in keyof T]: string;
};

/**
 * Helper type to make interfaces compatible with ConfigObject constraint
 */
type MutableConfig<T> = {
  -readonly [K in keyof T]: T[K];
};

/**
 * Base error class for configuration-related errors
 */
abstract class ConfigError extends Error {
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
 * Configuration validation error with detailed error information
 */
export class ConfigValidationError extends ConfigError {
  readonly code = 'CONFIG_VALIDATION_ERROR' as const;

  constructor(
    message: string,
    public readonly missingKeys: readonly string[],
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * Configuration fetch error for secret retrieval failures
 */
export class ConfigFetchError extends ConfigError {
  readonly code = 'CONFIG_FETCH_ERROR' as const;

  constructor(
    message: string,
    public readonly secretKey: string,
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * Database configuration interface with strict typing
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

/**
 * Redis configuration interface with strict typing
 */
export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
}

/**
 * OpenAI configuration interface with strict typing
 */
export interface OpenAIConfig {
  readonly apiKey: string;
  readonly organization?: string;
  readonly model: string;
}

/**
 * Anthropic configuration interface with strict typing
 */
export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Factory for creating configuration objects using Infisical secrets
 * This provides a centralized way for other modules to fetch their configuration
 */
@Injectable()
export class InfisicalConfigFactory {
  private readonly logger = new Logger(InfisicalConfigFactory.name);

  constructor(
    private readonly infisicalService: InfisicalService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a configuration object by fetching secrets from Infisical
   * Uses proper generic constraints to ensure type safety
   * @param configMap - Map of config keys to secret keys
   * @param defaults - Default values for configs
   */
  async createConfig<T extends Record<string, ConfigValue>>(configMap: ConfigMapping<T>, defaults: Partial<T> = {}): Promise<T> {
    // Build configuration step by step with proper typing
    const result: Partial<T> = { ...defaults };
    const secretKeys = Object.values(configMap);

    // Fetch all secrets at once for efficiency
    const secrets = await this.infisicalService.getSecrets(secretKeys);

    // Process each config mapping with type-safe conversions
    for (const configKey in configMap) {
      if (Object.hasOwn(configMap, configKey)) {
        const secretKey = configMap[configKey];
        const secretValue = secrets[secretKey];

        if (secretValue !== undefined) {
          const convertedValue = this.convertSecretValue(secretValue, defaults[configKey]);
          if (convertedValue !== undefined) {
            // Type-safe assignment using proper key constraint
            (result as Record<string, ConfigValue>)[configKey] = convertedValue;
          }
        }
      }
    }

    // Validate that all required properties are present
    this.validateConfigCompleteness(result, configMap, defaults);

    return result as T;
  }

  /**
   * Convert secret string value to appropriate type based on default value
   * Uses type guards for safe conversion
   */
  private convertSecretValue(secretValue: string, defaultValue: ConfigValue): ConfigValue {
    // Handle undefined default separately for clarity
    if (defaultValue === undefined) {
      return secretValue;
    }
    // Type-safe conversions with validation
    switch (typeof defaultValue) {
      case 'boolean':
        return secretValue.toLowerCase() === 'true';

      case 'number': {
        const numValue = Number.parseFloat(secretValue);
        if (Number.isNaN(numValue)) {
          this.logger.warn(`Invalid number format for secret value: ${secretValue}, using default: ${defaultValue}`);
          return defaultValue;
        }
        return numValue;
      }

      case 'string':
        return secretValue;

      default:
        return secretValue;
    }
  }

  /**
   * Validates that all required configuration properties are present
   * Uses proper generic constraints for type safety
   * Validates fields that don't have defaults and are required
   */
  private validateConfigCompleteness<T extends Record<string, ConfigValue>>(
    config: Partial<T>,
    configMap: ConfigMapping<T>,
    defaults: Partial<T> = {},
  ): void {
    const missingKeys: string[] = [];

    // Check all mapped keys to see if they're missing
    for (const configKey in configMap) {
      if (Object.hasOwn(configMap, configKey)) {
        const secretKey = configMap[configKey];
        // Field is missing if it's not in config and not in defaults
        // But only require it if it's not an interface optional field
        if (config[configKey] === undefined && defaults[configKey] === undefined) {
          // Check common optional patterns to avoid false positives
          const isOptional =
            secretKey === 'REDIS_PASSWORD' ||
            secretKey === 'OPENAI_API_KEY' ||
            secretKey === 'OPENAI_ORGANIZATION' ||
            secretKey === 'ANTHROPIC_API_KEY' ||
            secretKey === 'LANGSMITH_API_KEY' ||
            secretKey === 'ELEVENLABS_API_KEY' ||
            secretKey === 'ELEVENLABS_DEFAULT_VOICE_ID' ||
            secretKey.includes('OPTIONAL');

          if (!isOptional) {
            missingKeys.push(secretKey);
          }
        }
      }
    }

    if (missingKeys.length > 0) {
      throw new ConfigValidationError(`Missing required configuration values for keys: ${missingKeys.join(', ')}`, missingKeys);
    }
  }

  /**
   * Create configuration for database connections
   * Gets non-secret values from environment, secret values from Infisical
   */
  async createDatabaseConfig(): Promise<DatabaseConfig> {
    // 1) Fetch HOST, PORT, and DB from environment (source of truth for non-secret DB settings)
    const envDefaults: Partial<MutableConfig<DatabaseConfig>> = {};

    try {
      const [host, port, database] = await Promise.all([
        this.configService.get<string>('POSTGRES_HOST'),
        this.configService.get<string>('POSTGRES_PORT'),
        this.configService.get<string>('POSTGRES_DB'),
      ]);

      if (host) {
        envDefaults.host = host;
      }
      if (port) {
        envDefaults.port = Number.parseInt(port, 10);
      }
      if (database) {
        envDefaults.database = database;
      }

      this.logger.debug('Fetched database defaults from environment:', envDefaults);
    } catch (error) {
      this.logger.warn('Failed to fetch database config from environment, using hardcoded defaults:', error);
    }

    const host = envDefaults.host || 'localhost';
    const port = envDefaults.port || 5432;
    const database = envDefaults.database || 'emily';

    // 2) Fetch USERNAME and PASSWORD from Infisical (secrets only). Do NOT ask Infisical for host/port/db.
    const [username, password] = await Promise.all([
      this.infisicalService.getSecret('POSTGRES_USERNAME'),
      this.infisicalService.getSecret('POSTGRES_PASSWORD'),
    ]);

    if (!username || !password) {
      const missing: string[] = [];
      if (!username) {
        missing.push('POSTGRES_USERNAME');
      }
      if (!password) {
        missing.push('POSTGRES_PASSWORD');
      }
      throw new ConfigValidationError(`Missing required database secrets: ${missing.join(', ')}`, missing);
    }

    // 3) Return consolidated config (Environment + Infisical)
    const config: DatabaseConfig = {
      host,
      port,
      database,
      username,
      password,
    };

    return config;
  }

  /**
   * Create configuration for Redis
   * Gets non-secret values from environment, secret values from Infisical
   */
  async createRedisConfig(): Promise<RedisConfig> {
    // Get non-secret values from environment first
    const envDefaults: Partial<MutableConfig<RedisConfig>> = {};

    try {
      const [host, port] = await Promise.all([this.configService.get<string>('REDIS_HOST'), this.configService.get<string>('REDIS_PORT')]);

      if (host) {
        envDefaults.host = host;
      }
      if (port) {
        envDefaults.port = Number.parseInt(port, 10);
      }

      this.logger.debug('Fetched Redis defaults from environment:', envDefaults);
    } catch (error) {
      this.logger.warn('Failed to fetch Redis config from environment, using hardcoded defaults:', error);
    }

    const host = envDefaults.host || 'localhost';
    const port = envDefaults.port || 6379;

    // Fetch PASSWORD from Infisical only (optional secret)
    const password = await this.infisicalService.getSecret('REDIS_PASSWORD');

    const config: RedisConfig = {
      host,
      port,
      password: password || undefined,
    };

    return config;
  }

  /**
   * Create configuration for LangSmith
   * Non-secrets (endpoint, project, flags) from environment; secret API key from Infisical
   */
  async createLangSmithConfig(): Promise<LangSmithConfig> {
    const envDefaults: Partial<
      Record<'endpoint' | 'projectName', string> & Record<'tracingEnabled' | 'backgroundCallbacks' | 'hideInputs' | 'hideOutputs', boolean>
    > = {};

    try {
      const [endpoint, projectName, tracingEnabled, backgroundCallbacks, hideInputs, hideOutputs] = await Promise.all([
        this.configService.get<string>('LANGSMITH_API_URL'),
        this.configService.get<string>('LANGSMITH_PROJECT'),
        this.configService.get<string>('LANGSMITH_TRACING_ENABLED'),
        this.configService.get<string>('LANGSMITH_BACKGROUND_CALLBACKS'),
        this.configService.get<string>('LANGSMITH_HIDE_INPUTS'),
        this.configService.get<string>('LANGSMITH_HIDE_OUTPUTS'),
      ]);

      if (endpoint) {
        envDefaults.endpoint = endpoint;
      }
      if (projectName) {
        envDefaults.projectName = projectName;
      }
      if (tracingEnabled !== undefined) {
        envDefaults.tracingEnabled = tracingEnabled.toLowerCase() === 'true';
      }
      if (backgroundCallbacks !== undefined) {
        envDefaults.backgroundCallbacks = backgroundCallbacks.toLowerCase() === 'true';
      }
      if (hideInputs !== undefined) {
        envDefaults.hideInputs = hideInputs.toLowerCase() === 'true';
      }
      if (hideOutputs !== undefined) {
        envDefaults.hideOutputs = hideOutputs.toLowerCase() === 'true';
      }
    } catch (error) {
      this.logger.warn('Failed to fetch LangSmith config from environment, using defaults:', error);
    }

    // Fetch API key from Infisical only (do not ask Infisical for non-secrets to avoid noisy logs)
    const apiKey = await this.infisicalService.getSecret('LANGSMITH_API_KEY');

    const config: LangSmithConfig = {
      apiKey: apiKey || '',
      endpoint: envDefaults.endpoint || 'https://api.smith.langchain.com',
      projectName: envDefaults.projectName || 'emily-ai-agent',
      tracingEnabled: envDefaults.tracingEnabled ?? false,
      backgroundCallbacks: envDefaults.backgroundCallbacks ?? true,
      hideInputs: envDefaults.hideInputs ?? false,
      hideOutputs: envDefaults.hideOutputs ?? false,
      defaultMetadata: {},
      maskingPatterns: {},
    } as LangSmithConfig;

    return config;
  }

  /**
   * Create configuration for ElevenLabs
   */
  async createElevenLabsConfig(): Promise<ElevenLabsConfig> {
    // Define a temporary interface for the raw config data
    interface RawElevenLabsConfig extends Record<string, ConfigValue> {
      apiKey?: string;
      baseUrl: string;
      defaultVoiceId?: string;
      defaultTtsModel: string;
      defaultSttModel: string;
      maxConcurrentRequests: number;
      rateLimitDelayMs: number;
      maxRetries: number;
      retryDelayMs: number;
      defaultOutputFormat: string;
      voiceStability: number;
      voiceSimilarityBoost: number;
      voiceStyle: number;
      voiceUseSpeakerBoost: boolean;
      enableLogging: boolean;
      logAudioData: boolean;
      healthCheckEnabled: boolean;
      healthCheckIntervalMs: number;
      nodeEnv: string;
    }

    const config = await this.createConfig<RawElevenLabsConfig>(
      {
        apiKey: 'ELEVENLABS_API_KEY',
        baseUrl: 'ELEVENLABS_BASE_URL',
        defaultVoiceId: 'ELEVENLABS_DEFAULT_VOICE_ID',
        defaultTtsModel: 'ELEVENLABS_DEFAULT_TTS_MODEL',
        defaultSttModel: 'ELEVENLABS_DEFAULT_STT_MODEL',
        maxConcurrentRequests: 'ELEVENLABS_MAX_CONCURRENT_REQUESTS',
        rateLimitDelayMs: 'ELEVENLABS_RATE_LIMIT_DELAY_MS',
        maxRetries: 'ELEVENLABS_MAX_RETRIES',
        retryDelayMs: 'ELEVENLABS_RETRY_DELAY_MS',
        defaultOutputFormat: 'ELEVENLABS_DEFAULT_OUTPUT_FORMAT',
        voiceStability: 'ELEVENLABS_VOICE_STABILITY',
        voiceSimilarityBoost: 'ELEVENLABS_VOICE_SIMILARITY_BOOST',
        voiceStyle: 'ELEVENLABS_VOICE_STYLE',
        voiceUseSpeakerBoost: 'ELEVENLABS_VOICE_USE_SPEAKER_BOOST',
        enableLogging: 'ELEVENLABS_ENABLE_LOGGING',
        logAudioData: 'ELEVENLABS_LOG_AUDIO_DATA',
        healthCheckEnabled: 'ELEVENLABS_HEALTH_CHECK_ENABLED',
        healthCheckIntervalMs: 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS',
        nodeEnv: 'NODE_ENV',
      },
      {
        baseUrl: 'https://api.elevenlabs.io',
        defaultTtsModel: 'eleven_multilingual_v2',
        defaultSttModel: 'scribe_v1',
        maxConcurrentRequests: 3,
        rateLimitDelayMs: 1000,
        maxRetries: 3,
        retryDelayMs: 2000,
        defaultOutputFormat: 'mp3_44100_128',
        voiceStability: 0.5,
        voiceSimilarityBoost: 0.75,
        voiceStyle: 0,
        voiceUseSpeakerBoost: true,
        enableLogging: true,
        logAudioData: false,
        healthCheckEnabled: true,
        healthCheckIntervalMs: 60000,
        nodeEnv: 'development',
      },
    );

    // Transform flat config to nested structure expected by ElevenLabsConfig interface
    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultVoiceId: config.defaultVoiceId,
      defaultTtsModel: config.defaultTtsModel,
      defaultSttModel: config.defaultSttModel,
      maxConcurrentRequests: config.maxConcurrentRequests,
      rateLimitDelayMs: config.rateLimitDelayMs,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      defaultOutputFormat: config.defaultOutputFormat,
      voiceSettings: {
        stability: config.voiceStability,
        similarityBoost: config.voiceSimilarityBoost,
        style: config.voiceStyle,
        useSpeakerBoost: config.voiceUseSpeakerBoost,
      },
      enableLogging: config.enableLogging,
      logAudioData: config.logAudioData,
      healthCheck: {
        enabled: config.healthCheckEnabled,
        intervalMs: config.healthCheckIntervalMs,
      },
      nodeEnv: config.nodeEnv,
    } as ElevenLabsConfig;
  }

  /**
   * Create configuration for OpenAI
   */
  async createOpenAIConfig(): Promise<OpenAIConfig> {
    return this.createConfig<MutableConfig<OpenAIConfig>>(
      {
        apiKey: 'OPENAI_API_KEY',
        organization: 'OPENAI_ORGANIZATION',
        model: 'OPENAI_MODEL',
      },
      {
        model: 'gpt-4',
      },
    );
  }

  /**
   * Create configuration for Anthropic
   */
  async createAnthropicConfig(): Promise<AnthropicConfig> {
    return this.createConfig<MutableConfig<AnthropicConfig>>(
      {
        apiKey: 'ANTHROPIC_API_KEY',
        model: 'ANTHROPIC_MODEL',
      },
      {
        model: 'claude-3-opus-20240229',
      },
    );
  }
}
