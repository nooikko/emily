import * as Joi from 'joi';

/**
 * Unleash configuration validation schema
 * Following the established pattern from other modules
 *
 * Validates environment variables used for Unleash configuration
 * Most fields are optional since Unleash can be disabled
 */
export const unleashConfigSchema = Joi.object({
  // Core Unleash settings
  UNLEASH_ENABLED: Joi.boolean().default(false).description('Enable/disable Unleash integration'),

  UNLEASH_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .description('Unleash API URL'),

  UNLEASH_APP_NAME: Joi.string().min(1).max(100).default('emily-ai-agent').description('Application name for Unleash'),

  UNLEASH_ENVIRONMENT: Joi.string().min(1).max(50).default('development').description('Environment for feature flag evaluation'),

  UNLEASH_INSTANCE_ID: Joi.string().min(1).max(100).optional().description('Unique instance identifier'),

  // Timing and performance settings
  UNLEASH_REFRESH_INTERVAL: Joi.number()
    .integer()
    .min(5000) // Minimum 5 seconds
    .max(300000) // Maximum 5 minutes
    .default(15000)
    .description('How often to refresh feature flags in milliseconds'),

  UNLEASH_METRICS_INTERVAL: Joi.number()
    .integer()
    .min(10000) // Minimum 10 seconds
    .max(600000) // Maximum 10 minutes
    .default(60000)
    .description('How often to send metrics in milliseconds'),

  UNLEASH_CACHE_TTL: Joi.number()
    .integer()
    .min(60000) // Minimum 1 minute
    .max(3600000) // Maximum 1 hour
    .default(300000)
    .description('Cache duration for config values in milliseconds'),

  UNLEASH_TIMEOUT: Joi.number()
    .integer()
    .min(1000) // Minimum 1 second
    .max(30000) // Maximum 30 seconds
    .default(10000)
    .description('Request timeout in milliseconds'),

  UNLEASH_RETRIES: Joi.number().integer().min(0).max(10).default(2).description('Number of retries for failed requests'),

  // Behavioral settings
  UNLEASH_FALLBACK_TO_ENV: Joi.boolean().default(true).description('Fall back to environment variables if Unleash fails'),

  // Note: UNLEASH_API_KEY is intentionally not validated here
  // because it's fetched from Infisical, not from environment variables
}).description('Unleash feature flag configuration validation schema');
