import * as Joi from 'joi';

/**
 * Joi validation schema for LangSmith environment variables.
 * Ensures proper configuration validation at application startup.
 */
export const langsmithConfigSchema = Joi.object({
  // Core LangSmith Configuration
  LANGSMITH_ENABLED: Joi.boolean().default(false).messages({
    'boolean.base': 'LANGSMITH_ENABLED must be a boolean (true/false)',
  }),

  LANGSMITH_API_KEY: Joi.when('LANGSMITH_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'LANGSMITH_API_KEY is required when LangSmith is enabled',
    'any.required': 'LANGSMITH_API_KEY is required when LangSmith is enabled',
  }),

  LANGSMITH_TRACING: Joi.string().valid('true', 'false').default('true').messages({
    'any.only': 'LANGSMITH_TRACING must be either "true" or "false"',
  }),

  LANGCHAIN_PROJECT: Joi.when('LANGSMITH_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'LANGCHAIN_PROJECT is required when LangSmith is enabled',
    'any.required': 'LANGCHAIN_PROJECT is required when LangSmith is enabled',
  }),

  // Optional endpoint for self-hosted LangSmith
  LANGSMITH_ENDPOINT: Joi.string().uri().optional().messages({
    'string.uri': 'LANGSMITH_ENDPOINT must be a valid URL',
  }),

  // Performance Configuration
  LANGCHAIN_CALLBACKS_BACKGROUND: Joi.string().valid('true', 'false').default('true').messages({
    'any.only': 'LANGCHAIN_CALLBACKS_BACKGROUND must be either "true" or "false"',
  }),

  // Security Configuration
  LANGSMITH_HIDE_INPUTS: Joi.string().valid('true', 'false').default('false').messages({
    'any.only': 'LANGSMITH_HIDE_INPUTS must be either "true" or "false"',
  }),

  LANGSMITH_HIDE_OUTPUTS: Joi.string().valid('true', 'false').default('false').messages({
    'any.only': 'LANGSMITH_HIDE_OUTPUTS must be either "true" or "false"',
  }),

  // General environment
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development').messages({
    'any.only': 'NODE_ENV must be one of: development, test, production',
  }),
});

/**
 * Validates LangSmith configuration and provides helpful error messages
 */
export function validateLangSmithConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = langsmithConfigSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    throw new Error(`LangSmith configuration validation failed:\n${errorMessages.join('\n')}`);
  }

  return value;
}
