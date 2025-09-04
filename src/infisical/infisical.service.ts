import { type GetSecretOptions, InfisicalSDK, type ListSecretsOptions, type Secret } from '@infisical/sdk';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Type definitions for enhanced type safety
 * Using branded types to ensure type safety at runtime
 */
type ProjectId = string & { readonly __brand: 'ProjectId' };
type Environment = string & { readonly __brand: 'Environment' };

/**
 * Type guards for Infisical SDK responses
 * The SDK already provides proper Secret interface, so we use that directly
 */
function isValidSecret(obj: unknown): obj is Secret {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const objRecord = obj as Record<string, unknown>;

  return (
    'secretKey' in objRecord &&
    'secretValue' in objRecord &&
    typeof objRecord.secretKey === 'string' &&
    typeof objRecord.secretValue === 'string' &&
    'id' in objRecord &&
    'workspace' in objRecord &&
    'environment' in objRecord
  );
}

/**
 * Type guard for secret array validation
 */
function isValidSecretArray(obj: unknown): obj is Secret[] {
  return Array.isArray(obj) && obj.every(isValidSecret);
}

/**
 * Value source tracking for intelligent logging
 */
enum ValueSource {
  INFISICAL = 'infisical',
  ENVIRONMENT = 'environment',
  DEFAULT = 'default',
  CACHE = 'cache',
}

/**
 * Cached secret entry with immutable properties and source tracking
 */
interface CachedSecret {
  readonly value: string;
  readonly expiry: number;
  readonly source: ValueSource;
}

/**
 * Result of secret retrieval with source tracking
 */
interface SecretResult {
  readonly value: string | undefined;
  readonly source: ValueSource | null;
  readonly found: boolean;
}

export interface InfisicalConfig {
  readonly enabled: boolean;
  readonly siteUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly projectId?: ProjectId;
  readonly serviceToken?: string;
  readonly environment: Environment;
  readonly cacheTtl: number;
  readonly fallbackToEnv: boolean;
}

/**
 * Initialization state tracking for proper concurrent handling
 */
type InitializationState = 'idle' | 'initializing' | 'initialized' | 'failed';

@Injectable()
export class InfisicalService implements OnModuleInit {
  private readonly logger = new Logger(InfisicalService.name);
  private client: InfisicalSDK | null = null;
  private authenticatedClient: InfisicalSDK | null = null;
  private secretCache = new Map<string, CachedSecret>();
  private readonly config: InfisicalConfig;
  private isInitialized = false;
  
  /**
   * Promise-based initialization lock to prevent concurrent initialization attempts
   * This ensures that only one initialization process runs at a time
   */
  private initializationPromise: Promise<void> | null = null;
  private initializationState: InitializationState = 'idle';
  /**
   * Track if onModuleInit has been called to distinguish between startup and retry scenarios
   */
  private moduleInitCalled = false;

  constructor(private readonly configService: ConfigService) {
    // Safe parsing with proper type validation
    const cacheTtlValue = this.configService.get<string>('INFISICAL_CACHE_TTL');
    const parsedCacheTtl = cacheTtlValue ? Number.parseInt(cacheTtlValue, 10) : 300000;

    if (Number.isNaN(parsedCacheTtl) || parsedCacheTtl < 0) {
      throw new Error(`Invalid INFISICAL_CACHE_TTL value: ${cacheTtlValue}. Must be a positive number.`);
    }

    const enabledValue = this.configService.get<string | boolean>('INFISICAL_ENABLED');

    this.config = {
      enabled: enabledValue === 'true' || enabledValue === true,
      siteUrl: this.configService.get<string>('INFISICAL_SITE_URL'),
      clientId: this.configService.get<string>('INFISICAL_CLIENT_ID'),
      clientSecret: this.configService.get<string>('INFISICAL_CLIENT_SECRET'),
      projectId: this.configService.get<string>('INFISICAL_PROJECT_ID') as ProjectId,
      serviceToken: this.configService.get<string>('INFISICAL_SERVICE_TOKEN'),
      environment: (this.configService.get<string>('INFISICAL_ENVIRONMENT') ||
        this.configService.get<string>('NODE_ENV') ||
        'development') as Environment,
      cacheTtl: parsedCacheTtl,
      fallbackToEnv: this.configService.get<string>('INFISICAL_FALLBACK_TO_ENV') !== 'false',
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Infisical service...');
    this.moduleInitCalled = true;
    await this.ensureInitialized();
  }

  /**
   * Ensures the service is initialized, using the same concurrent-safe pattern as onModuleInit
   * This method can be called from other service methods that need initialization
   */
  private async ensureInitialized(): Promise<void> {
    // If already initialized or failed, no need to do anything
    if (this.initializationState === 'initialized' || this.initializationState === 'failed') {
      return;
    }
    
    // If currently initializing, wait for the existing promise
    if (this.initializationState === 'initializing' && this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Start new initialization
    this.initializationState = 'initializing';
    this.initializationPromise = this.initialize();
    
    try {
      await this.initializationPromise;
      // If initialize() completed without throwing, the initialization process succeeded
      // This includes cases where Infisical failed but fallback is enabled
      this.initializationState = 'initialized';
    } catch (error) {
      this.initializationState = 'failed';
      this.initializationPromise = null;
      // Re-throw the error - initialize() method already decided error handling policy
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    // Skip initialization if already initialized (defensive check)
    if (this.isInitialized && this.authenticatedClient) {
      this.logger.debug('InfisicalService already initialized, skipping duplicate initialization');
      return;
    }

    // Skip initialization if Infisical is not enabled
    if (!this.config.enabled) {
      this.logger.log('Infisical is disabled. Skipping initialization.');
      this.logger.debug('Config.enabled value:', this.config.enabled);
      this.isInitialized = true; // Mark as initialized even when disabled
      return;
    }

    try {
      // Check if we have service token (simpler approach)
      if (this.config.serviceToken) {
        this.logger.log('Using Infisical Service Token authentication...');

        // For service tokens, the token should be set as an environment variable
        // and the SDK will automatically pick it up
        if (!process.env.INFISICAL_TOKEN) {
          process.env.INFISICAL_TOKEN = this.config.serviceToken;
        }

        this.client = new InfisicalSDK({
          siteUrl: this.config.siteUrl,
        });

        this.authenticatedClient = this.client;

        // For service tokens, we still need projectId for API calls
        if (!this.config.projectId) {
          throw new Error('INFISICAL_PROJECT_ID is required even when using Service Token');
        }
      }
      // Fallback to Universal Auth (Machine Identity)
      else if (this.config.clientId && this.config.clientSecret && this.config.projectId) {
        this.logger.log('Using Infisical Universal Auth (Machine Identity)...');
        this.client = new InfisicalSDK({
          siteUrl: this.config.siteUrl,
        });

        // Authenticate using universal auth
        this.authenticatedClient = await this.client.auth().universalAuth.login({
          clientId: this.config.clientId!,
          clientSecret: this.config.clientSecret!,
        });
      } else {
        this.logger.warn(
          'Infisical credentials not configured. Need either INFISICAL_SERVICE_TOKEN or (INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET + INFISICAL_PROJECT_ID). Falling back to environment variables.',
        );
        return;
      }

      // Test connection and list available secrets
      // Both Service Token and Universal Auth require projectId in the API call
      const testOptions: ListSecretsOptions = {
        projectId: this.config.projectId!,
        environment: this.config.environment,
      };

      const secretsList = await this.authenticatedClient.secrets().listSecrets(testOptions);

      // Handle response format from the SDK
      let secrets: Secret[];

      if (Array.isArray(secretsList)) {
        // Direct array response (fallback)
        secrets = secretsList;
      } else if (secretsList?.secrets && Array.isArray(secretsList.secrets)) {
        // Standard API response format: { secrets: Secret[] }
        secrets = secretsList.secrets;
      } else {
        secrets = [];
      }

      // Log available secrets (keys only, not values for security)
      if (isValidSecretArray(secrets) && secrets.length > 0) {
        const secretKeys = secrets.map((secret) => secret.secretKey).sort();
        this.logger.log(`Infisical client initialized successfully for environment: ${this.config.environment}`);
        this.logger.log(`Found ${secrets.length} secrets in Infisical: [${secretKeys.join(', ')}]`);
      } else {
        this.logger.warn(`Infisical client initialized but no secrets found in environment: ${this.config.environment}`);
        this.logger.warn('Make sure secrets exist in the Infisical project for this environment');
      }

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize Infisical client:', error);
      if (!this.config.fallbackToEnv) {
        throw error;
      }
      this.logger.warn('Falling back to environment variables due to Infisical initialization failure.');
    }
  }

  /**
   * Get a secret value from Infisical or fall back to environment variable
   * Uses Result pattern for better error handling with intelligent source tracking
   */
  async getSecret(key: string, defaultValue?: string): Promise<string | undefined> {
    // Ensure service is initialized before fetching secrets
    if (!this.isInitialized && this.config.enabled) {
      await this.ensureInitialized();
    }

    const result = await this.getSecretWithSource(key, defaultValue);
    this.logSecretRetrieval(key, result);
    return result.value;
  }

  /**
   * Get a secret with source tracking for intelligent logging
   */
  private async getSecretWithSource(key: string, defaultValue?: string): Promise<SecretResult> {
    // Check cache first
    const cached = this.secretCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return {
        value: cached.value,
        source: ValueSource.CACHE,
        found: true,
      };
    }

    // If Infisical is not enabled or initialized, use environment variable
    if (!this.config.enabled || !this.isInitialized || !this.authenticatedClient) {
      return this.getFromEnvWithSource(key, defaultValue);
    }

    try {
      // Both Service Token and Universal Auth require projectId in the API call
      if (!this.config.projectId) {
        throw new Error('Project ID is required for secret retrieval');
      }

      const secretOptions: GetSecretOptions = {
        projectId: this.config.projectId!,
        environment: this.config.environment,
        secretName: key,
      };

      const secretResponse = await this.authenticatedClient.secrets().getSecret(secretOptions);

      // Validate the response type at runtime
      if (!isValidSecret(secretResponse)) {
        throw new Error(`Invalid secret response format for key: ${key}`);
      }

      if (secretResponse.secretValue) {
        // Cache the secret with source tracking
        this.secretCache.set(key, {
          value: secretResponse.secretValue,
          expiry: Date.now() + this.config.cacheTtl,
          source: ValueSource.INFISICAL,
        });
        return {
          value: secretResponse.secretValue,
          source: ValueSource.INFISICAL,
          found: true,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to fetch secret ${key} from Infisical:`, error);
      if (this.config.fallbackToEnv) {
        return this.getFromEnvWithSource(key, defaultValue);
      }
      throw error;
    }

    // If secret not found in Infisical and fallback is enabled
    if (this.config.fallbackToEnv) {
      return this.getFromEnvWithSource(key, defaultValue);
    }

    // Not found anywhere, use default if provided
    if (defaultValue !== undefined) {
      return {
        value: defaultValue,
        source: ValueSource.DEFAULT,
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
   * Get multiple secrets at once with type-safe key validation
   */
  async getSecrets(keys: readonly string[]): Promise<Record<string, string | undefined>> {
    // Ensure service is initialized before fetching secrets
    if (!this.isInitialized && this.config.enabled) {
      await this.ensureInitialized();
    }

    const results: Record<string, string | undefined> = {};

    // If Infisical is enabled and initialized, try batch fetch
    if (this.config.enabled && this.isInitialized && this.authenticatedClient) {
      try {
        // Ensure projectId exists before making the call
        if (!this.config.projectId) {
          throw new Error('Project ID is required but not configured');
        }

        const listOptions: ListSecretsOptions = {
          projectId: this.config.projectId!,
          environment: this.config.environment,
        };
        const secretsResponse = await this.authenticatedClient.secrets().listSecrets(listOptions);

        // Handle response format from the SDK
        // Based on API documentation, the response should be { secrets: Secret[] }
        // But we'll handle both formats for robustness
        let secrets: Secret[];
        if (Array.isArray(secretsResponse)) {
          // Direct array response (fallback)
          secrets = secretsResponse;
        } else if (secretsResponse?.secrets && Array.isArray(secretsResponse.secrets)) {
          // Standard API response format: { secrets: Secret[] }
          secrets = secretsResponse.secrets;
        } else {
          throw new Error('Invalid secrets list response format from Infisical');
        }

        // Validate the secrets array
        if (!isValidSecretArray(secrets)) {
          throw new Error('Invalid secrets array format from Infisical');
        }

        // Build a map of all secrets
        const secretMap = new Map<string, string>();
        for (const secret of secrets) {
          secretMap.set(secret.secretKey, secret.secretValue);
          // Cache each secret with source tracking
          this.secretCache.set(secret.secretKey, {
            value: secret.secretValue,
            expiry: Date.now() + this.config.cacheTtl,
            source: ValueSource.INFISICAL,
          });
        }

        // Get requested secrets with proper source tracking
        for (const key of keys) {
          const infisicalValue = secretMap.get(key);
          if (infisicalValue) {
            results[key] = infisicalValue;
            this.logSecretRetrieval(key, {
              value: infisicalValue,
              source: ValueSource.INFISICAL,
              found: true,
            });
          } else if (this.config.fallbackToEnv) {
            const envResult = this.getFromEnvWithSource(key);
            results[key] = envResult.value;
            this.logSecretRetrieval(key, envResult);
          } else {
            results[key] = undefined;
            this.logSecretRetrieval(key, {
              value: undefined,
              source: null,
              found: false,
            });
          }
        }

        return results;
      } catch (error) {
        this.logger.error('Failed to fetch secrets from Infisical:', error);
        if (!this.config.fallbackToEnv) {
          throw error;
        }
      }
    }

    // Fallback to individual fetches or env vars
    for (const key of keys) {
      results[key] = await this.getSecret(key);
    }

    return results;
  }

  /**
   * Clear the secret cache
   */
  clearCache() {
    this.secretCache.clear();
  }

  /**
   * Get configuration value from environment variable with source tracking
   */
  private getFromEnvWithSource(key: string, defaultValue?: string): SecretResult {
    const envValue = process.env[key];

    if (envValue) {
      return {
        value: envValue,
        source: ValueSource.ENVIRONMENT,
        found: true,
      };
    }

    if (defaultValue !== undefined) {
      return {
        value: defaultValue,
        source: ValueSource.DEFAULT,
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
   * Log secret retrieval with intelligent warning logic
   */
  private logSecretRetrieval(key: string, result: SecretResult): void {
    switch (result.source) {
      case ValueSource.INFISICAL:
        this.logger.debug(`Secret '${key}' retrieved from Infisical`);
        break;

      case ValueSource.CACHE:
        this.logger.debug(`Secret '${key}' retrieved from cache`);
        break;

      case ValueSource.ENVIRONMENT:
        this.logger.debug(`Secret '${key}' retrieved from environment variable`);
        break;

      case ValueSource.DEFAULT:
        this.logger.debug(`Secret '${key}' using provided default value`);
        break;

      case null:
        // Not found anywhere - this is the only case that should warn
        this.logger.warn(`Secret '${key}' not found in any source (Infisical, environment, or defaults)`);
        break;

      default:
        // Should never happen with proper typing, but defensive programming
        this.logger.warn(`Secret '${key}' retrieved from unknown source: ${String(result.source)}`);
        break;
    }
  }

  /**
   * Check if Infisical is ready for dependent services
   * Returns true when initialization is complete and service can provide secrets
   * This includes the case where Infisical is disabled but fallback is available
   */
  isReady(): boolean {
    // If Infisical is disabled, we're ready (will fall back to env vars)
    if (!this.config.enabled) {
      return true;
    }

    // If Infisical is enabled, we need to be fully initialized and operational
    return this.initializationState === 'initialized' && 
           this.isInitialized && 
           this.authenticatedClient !== null;
  }

  /**
   * Wait for the service to be ready with timeout and retry logic
   * Essential for dependent services that need to wait for Infisical initialization
   */
  async waitForReady(timeoutMs = 30000, retryIntervalMs = 1000): Promise<void> {
    const startTime = Date.now();

    while (!this.isReady()) {
      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(`InfisicalService failed to become ready within ${timeoutMs}ms`);
      }

      // If Infisical is enabled but failed permanently, don't keep retrying
      if (this.config.enabled && this.initializationState === 'failed') {
        throw new Error('InfisicalService initialization failed and will not retry');
      }

      // If Infisical is enabled but not ready, try to initialize
      if (this.config.enabled && this.initializationState !== 'initialized') {
        try {
          await this.ensureInitialized();
        } catch (error) {
          this.logger.warn('Retrying Infisical initialization:', error);
        }
      } else if (this.config.enabled && this.initializationState === 'initialized' && !this.isReady()) {
        // Initialization completed but service is not ready (fallback scenario)
        // If onModuleInit was called and fallback is enabled, the service can function but will never be "ready"
        if (this.moduleInitCalled && this.config.fallbackToEnv) {
          throw new Error('InfisicalService initialization completed but Infisical is not operational. Fallback to environment variables is available.');
        }
        // If onModuleInit was not called, reset state and retry initialization
        if (!this.moduleInitCalled) {
          this.initializationState = 'idle';
          this.initializationPromise = null;
          // Next loop will retry initialization
        }
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    this.logger.log('InfisicalService is ready for dependent services');
  }

  /**
   * Check if Infisical is properly configured and operational
   */
  isOperational(): boolean {
    return this.config.enabled && this.isInitialized && this.authenticatedClient !== null;
  }

  /**
   * Get current configuration (for debugging/monitoring)
   * Uses utility type to safely exclude sensitive data
   */
  getConfig(): Omit<InfisicalConfig, 'clientSecret'> {
    const { clientSecret: _clientSecret, ...safeConfig } = this.config;
    return safeConfig as Omit<InfisicalConfig, 'clientSecret'>;
  }
}
