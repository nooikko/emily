import { Injectable, Logger } from '@nestjs/common';
import type { ElevenLabsConfig } from '../elevenlabs/types/elevenlabs-config.interface';
import type { LangSmithConfig } from '../langsmith/types/langsmith-config.interface';
import { UnleashService } from './unleash.service';

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
export class UnleashConfigValidationError extends ConfigError {
  readonly code = 'UNLEASH_CONFIG_VALIDATION_ERROR' as const;

  constructor(
    message: string,
    public readonly missingKeys: readonly string[],
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * Configuration fetch error for config value retrieval failures
 */
export class UnleashConfigFetchError extends ConfigError {
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
 * Database configuration interface with strict typing
 * Shared with Infisical implementation for consistency
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
 * Shared with Infisical implementation for consistency
 */
export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
}

/**
 * OpenAI configuration interface with strict typing
 * Shared with Infisical implementation for consistency
 */
export interface OpenAIConfig {
  readonly apiKey: string;
  readonly organization?: string;
  readonly model: string;
}

/**
 * Anthropic configuration interface with strict typing
 * Shared with Infisical implementation for consistency
 */
export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Factory for creating configuration objects using Unleash feature flag variants
 * This provides a centralized way for other modules to fetch their configuration
 * from Unleash feature flags instead of traditional configuration sources
 */
@Injectable()
export class UnleashConfigFactory {
  private readonly logger = new Logger(UnleashConfigFactory.name);

  constructor(private readonly unleashService: UnleashService) {}

  /**
   * Create a configuration object by fetching config values from Unleash feature flag variants
   * Uses proper generic constraints to ensure type safety
   * @param configMap - Map of config keys to feature flag names
   * @param defaults - Default values for configs
   */
  async createConfig<T extends Record<string, ConfigValue>>(configMap: ConfigMapping<T>, defaults: Partial<T> = {}): Promise<T> {
    // Build configuration step by step with proper typing
    const result: Partial<T> = { ...defaults };
    const flagNames = Object.values(configMap);

    // Fetch all config values at once for efficiency
    const configValues = await this.unleashService.getConfigValues(flagNames);

    // Process each config mapping with type-safe conversions
    for (const configKey in configMap) {
      if (Object.hasOwn(configMap, configKey)) {
        const flagName = configMap[configKey];
        const configValue = configValues[flagName];

        if (configValue !== undefined) {
          const convertedValue = this.convertConfigValue(configValue, defaults[configKey]);
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
   * Convert config string value to appropriate type based on default value
   * Uses type guards for safe conversion
   */
  private convertConfigValue(configValue: string, defaultValue: ConfigValue): ConfigValue {
    // Handle undefined default separately for clarity
    if (defaultValue === undefined) {
      return configValue;
    }
    // Type-safe conversions with validation
    switch (typeof defaultValue) {
      case 'boolean':
        return configValue.toLowerCase() === 'true';

      case 'number': {
        const numValue = Number.parseFloat(configValue);
        if (Number.isNaN(numValue)) {
          this.logger.warn(`Invalid number format for config value: ${configValue}, using default: ${defaultValue}`);
          return defaultValue;
        }
        return numValue;
      }

      case 'string':
        return configValue;

      default:
        return configValue;
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
        const flagName = configMap[configKey];
        // Field is missing if it's not in config and not in defaults
        // But only require it if it's not an interface optional field
        if (config[configKey] === undefined && defaults[configKey] === undefined) {
          // Check common optional patterns to avoid false positives
          const isOptional =
            flagName === 'REDIS_PASSWORD' ||
            flagName === 'OPENAI_API_KEY' ||
            flagName === 'OPENAI_ORGANIZATION' ||
            flagName === 'ANTHROPIC_API_KEY' ||
            flagName === 'LANGSMITH_API_KEY' ||
            flagName === 'ELEVENLABS_API_KEY' ||
            flagName === 'ELEVENLABS_DEFAULT_VOICE_ID' ||
            flagName.includes('OPTIONAL');

          if (!isOptional) {
            missingKeys.push(flagName);
          }
        }
      }
    }

    if (missingKeys.length > 0) {
      throw new UnleashConfigValidationError(`Missing required configuration values for feature flags: ${missingKeys.join(', ')}`, missingKeys);
    }
  }

  /**
   * Create configuration for database connections
   */
  async createDatabaseConfig(): Promise<DatabaseConfig> {
    return this.createConfig<MutableConfig<DatabaseConfig>>(
      {
        host: 'POSTGRES_HOST',
        port: 'POSTGRES_PORT',
        username: 'POSTGRES_USERNAME',
        password: 'POSTGRES_PASSWORD',
        database: 'POSTGRES_DB',
      },
      {
        host: 'localhost',
        port: 5432,
        database: 'emily',
      },
    );
  }

  /**
   * Create configuration for Redis
   */
  async createRedisConfig(): Promise<RedisConfig> {
    return this.createConfig<MutableConfig<RedisConfig>>(
      {
        host: 'REDIS_HOST',
        port: 'REDIS_PORT',
        password: 'REDIS_PASSWORD',
      },
      {
        host: 'localhost',
        port: 6379,
      },
    );
  }

  /**
   * Create configuration for LangSmith
   */
  async createLangSmithConfig(): Promise<LangSmithConfig> {
    // Define a temporary interface for the raw config data
    interface RawLangSmithConfig extends Record<string, ConfigValue> {
      apiKey: string;
      endpoint: string;
      projectName: string;
      tracingEnabled: boolean;
      backgroundCallbacks: boolean;
      hideInputs: boolean;
      hideOutputs: boolean;
    }

    const baseConfig = await this.createConfig<RawLangSmithConfig>(
      {
        apiKey: 'LANGSMITH_API_KEY',
        endpoint: 'LANGSMITH_API_URL',
        projectName: 'LANGSMITH_PROJECT',
        tracingEnabled: 'LANGSMITH_TRACING_ENABLED',
        backgroundCallbacks: 'LANGSMITH_BACKGROUND_CALLBACKS',
        hideInputs: 'LANGSMITH_HIDE_INPUTS',
        hideOutputs: 'LANGSMITH_HIDE_OUTPUTS',
      },
      {
        endpoint: 'https://api.smith.langchain.com',
        projectName: 'emily-ai-agent',
        tracingEnabled: false,
        backgroundCallbacks: true,
        hideInputs: false,
        hideOutputs: false,
      },
    );

    // Return properly typed LangSmithConfig
    return {
      apiKey: baseConfig.apiKey,
      tracingEnabled: baseConfig.tracingEnabled,
      projectName: baseConfig.projectName,
      endpoint: baseConfig.endpoint,
      backgroundCallbacks: baseConfig.backgroundCallbacks,
      hideInputs: baseConfig.hideInputs,
      hideOutputs: baseConfig.hideOutputs,
      // Optional properties with defaults
      defaultMetadata: {},
      maskingPatterns: {},
    } as LangSmithConfig;
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
