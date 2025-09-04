/**
 * Unleash configuration interface with strict typing
 * Following the established pattern from Infisical configuration
 */

/**
 * Type definitions for enhanced type safety
 * Using branded types to ensure type safety at runtime
 */
export type UnleashApiUrl = string & { readonly __brand: 'UnleashApiUrl' };
export type UnleashClientKey = string & { readonly __brand: 'UnleashClientKey' };
export type UnleashAppName = string & { readonly __brand: 'UnleashAppName' };
export type Environment = string & { readonly __brand: 'Environment' };

/**
 * Unleash feature flag variant payload
 * Unleash variants contain configuration values as string payloads
 */
export interface UnleashVariantPayload {
  readonly type: 'string' | 'number' | 'json';
  readonly value: string;
}

/**
 * Unleash feature flag variant
 * Used to store configuration values through feature flag variants
 */
export interface UnleashVariant {
  readonly name: string;
  readonly enabled: boolean;
  readonly payload?: UnleashVariantPayload;
}

/**
 * Unleash feature flag definition
 * Represents a feature flag with its variants
 */
export interface UnleashFeatureFlag {
  readonly name: string;
  readonly enabled: boolean;
  readonly variant: UnleashVariant;
  readonly impressionData?: boolean;
}

/**
 * Value source tracking for intelligent logging
 * Similar to Infisical's ValueSource enum
 */
export enum ConfigValueSource {
  UNLEASH = 'unleash',
  ENVIRONMENT = 'environment',
  DEFAULT = 'default',
  CACHE = 'cache',
}

/**
 * Cached config entry with immutable properties and source tracking
 */
export interface CachedConfigValue {
  readonly value: string;
  readonly expiry: number;
  readonly source: ConfigValueSource;
}

/**
 * Result of configuration value retrieval with source tracking
 */
export interface ConfigValueResult {
  readonly value: string | undefined;
  readonly source: ConfigValueSource | null;
  readonly found: boolean;
}

/**
 * Unleash client configuration interface
 * Matches the structure expected by unleash-client
 */
export interface UnleashConfig {
  readonly enabled: boolean;
  readonly url?: UnleashApiUrl;
  readonly clientKey?: UnleashClientKey;
  readonly appName: UnleashAppName;
  readonly environment: Environment;
  readonly instanceId?: string;
  readonly refreshInterval?: number;
  readonly metricsInterval?: number;
  readonly cacheTtl: number;
  readonly fallbackToEnv: boolean;
  readonly timeout?: number;
  readonly retries?: number;
  readonly backup?: {
    readonly url: string;
    readonly interval: number;
  };
}

/**
 * Unleash context for feature flag evaluation
 * Used to provide context when evaluating feature flags
 * Simplified to match unleash-client Context type requirements
 */
export interface UnleashContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly remoteAddress?: string;
  readonly environment?: string;
  readonly appName?: string;
  readonly [key: string]: string | undefined;
}

/**
 * Configuration key mapping interface
 * Maps configuration keys to Unleash feature flag names
 */
export interface ConfigKeyMapping {
  readonly [configKey: string]: string; // Feature flag name
}

/**
 * Type guard for Unleash variant payload validation
 */
export function isValidVariantPayload(obj: unknown): obj is UnleashVariantPayload {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const payload = obj as Record<string, unknown>;

  return (
    'type' in payload &&
    'value' in payload &&
    typeof payload.type === 'string' &&
    typeof payload.value === 'string' &&
    ['string', 'number', 'json'].includes(payload.type)
  );
}

/**
 * Type guard for Unleash variant validation
 */
export function isValidVariant(obj: unknown): obj is UnleashVariant {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const variant = obj as Record<string, unknown>;

  return (
    'name' in variant &&
    'enabled' in variant &&
    typeof variant.name === 'string' &&
    typeof variant.enabled === 'boolean' &&
    (variant.payload === undefined || isValidVariantPayload(variant.payload))
  );
}

/**
 * Type guard for feature flag validation
 */
export function isValidFeatureFlag(obj: unknown): obj is UnleashFeatureFlag {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const flag = obj as Record<string, unknown>;

  return (
    'name' in flag &&
    'enabled' in flag &&
    'variant' in flag &&
    typeof flag.name === 'string' &&
    typeof flag.enabled === 'boolean' &&
    isValidVariant(flag.variant)
  );
}
