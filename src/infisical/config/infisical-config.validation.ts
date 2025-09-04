import * as Joi from 'joi';

/**
 * Type-safe validation result
 */
interface ValidationResult<T> {
  readonly error?: Joi.ValidationError;
  readonly value: T;
}

/**
 * Validated Infisical configuration type
 */
export interface ValidatedInfisicalConfig {
  readonly INFISICAL_ENABLED: boolean;
  readonly INFISICAL_SITE_URL?: string;
  readonly INFISICAL_CLIENT_ID?: string;
  readonly INFISICAL_CLIENT_SECRET?: string;
  readonly INFISICAL_PROJECT_ID?: string;
  readonly INFISICAL_ENVIRONMENT?: string;
  readonly INFISICAL_CACHE_TTL: number;
  readonly INFISICAL_FALLBACK_TO_ENV: boolean;
}

/**
 * Joi validation schema for Infisical configuration
 * These variables control how the application connects to Infisical for secret management
 */
export const infisicalConfigSchema = Joi.object({
  // Core Infisical Configuration
  INFISICAL_ENABLED: Joi.boolean().default(false).messages({
    'boolean.base': 'INFISICAL_ENABLED must be a boolean (true/false)',
  }),

  INFISICAL_SITE_URL: Joi.string().uri().optional().messages({
    'string.uri': 'INFISICAL_SITE_URL must be a valid URL',
  }),

  // Service Token (simpler authentication)
  INFISICAL_SERVICE_TOKEN: Joi.string().optional().messages({
    'string.empty': 'INFISICAL_SERVICE_TOKEN cannot be empty if provided',
  }),

  // Universal Auth credentials (Machine Identity) - required if enabled and no service token
  INFISICAL_CLIENT_ID: Joi.when('INFISICAL_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.when('INFISICAL_SERVICE_TOKEN', {
      is: Joi.exist(),
      // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
      then: Joi.string().optional(),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'INFISICAL_CLIENT_ID is required when Infisical is enabled',
    'any.required': 'INFISICAL_CLIENT_ID is required when Infisical is enabled',
  }),

  INFISICAL_CLIENT_SECRET: Joi.when('INFISICAL_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.when('INFISICAL_SERVICE_TOKEN', {
      is: Joi.exist(),
      // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
      then: Joi.string().optional(),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'INFISICAL_CLIENT_SECRET is required when Infisical is enabled',
    'any.required': 'INFISICAL_CLIENT_SECRET is required when Infisical is enabled',
  }),

  INFISICAL_PROJECT_ID: Joi.when('INFISICAL_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.when('INFISICAL_SERVICE_TOKEN', {
      is: Joi.exist(),
      // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
      then: Joi.string().optional(),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'INFISICAL_PROJECT_ID is required when Infisical is enabled',
    'any.required': 'INFISICAL_PROJECT_ID is required when Infisical is enabled',
  }),

  INFISICAL_ENVIRONMENT: Joi.string().optional().messages({
    'string.empty': 'INFISICAL_ENVIRONMENT cannot be empty if provided',
  }),

  INFISICAL_CACHE_TTL: Joi.number().integer().min(0).max(3600000).default(300000).messages({
    'number.base': 'INFISICAL_CACHE_TTL must be a number',
    'number.integer': 'INFISICAL_CACHE_TTL must be an integer',
    'number.min': 'INFISICAL_CACHE_TTL must be at least 0',
    'number.max': 'INFISICAL_CACHE_TTL must be at most 3600000 (1 hour)',
  }),

  INFISICAL_FALLBACK_TO_ENV: Joi.boolean().default(true).messages({
    'boolean.base': 'INFISICAL_FALLBACK_TO_ENV must be a boolean (true/false)',
  }),
});

/**
 * Validates Infisical configuration with proper typing
 */
export function validateInfisicalConfig(config: Record<string, unknown>): ValidatedInfisicalConfig {
  const { error, value }: ValidationResult<ValidatedInfisicalConfig> = infisicalConfigSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => `${detail.path.join('.')}: ${detail.message}`);
    throw new Error(`Infisical configuration validation failed:\n  - ${errorMessages.join('\n  - ')}`);
  }

  return value;
}
