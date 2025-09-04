import * as Joi from 'joi';

/**
 * Joi validation schema for ElevenLabs environment variables.
 * Ensures proper configuration validation at application startup.
 */
export const elevenlabsConfigSchema = Joi.object({
  // Core ElevenLabs Configuration
  ELEVENLABS_ENABLED: Joi.boolean().default(false).messages({
    'boolean.base': 'ELEVENLABS_ENABLED must be a boolean (true/false)',
  }),

  ELEVENLABS_API_KEY: Joi.when('ELEVENLABS_ENABLED', {
    is: true,
    // biome-ignore lint/suspicious/noThenProperty: Joi uses 'then' for conditional validation
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }).messages({
    'string.empty': 'ELEVENLABS_API_KEY is required when ElevenLabs is enabled',
    'any.required': 'ELEVENLABS_API_KEY is required when ElevenLabs is enabled',
  }),

  ELEVENLABS_BASE_URL: Joi.string().uri().default('https://api.elevenlabs.io').messages({
    'string.uri': 'ELEVENLABS_BASE_URL must be a valid URL',
  }),

  // Voice Configuration
  ELEVENLABS_DEFAULT_VOICE_ID: Joi.string().optional().messages({
    'string.empty': 'ELEVENLABS_DEFAULT_VOICE_ID cannot be empty if provided',
  }),

  // Model Configuration
  ELEVENLABS_DEFAULT_TTS_MODEL: Joi.string().default('eleven_multilingual_v2').messages({
    'string.empty': 'ELEVENLABS_DEFAULT_TTS_MODEL cannot be empty if provided',
  }),

  ELEVENLABS_DEFAULT_STT_MODEL: Joi.string().default('scribe_v1').messages({
    'string.empty': 'ELEVENLABS_DEFAULT_STT_MODEL cannot be empty if provided',
  }),

  // Rate Limiting Configuration
  ELEVENLABS_MAX_CONCURRENT_REQUESTS: Joi.number().integer().min(1).max(10).default(3).messages({
    'number.base': 'ELEVENLABS_MAX_CONCURRENT_REQUESTS must be a number',
    'number.integer': 'ELEVENLABS_MAX_CONCURRENT_REQUESTS must be an integer',
    'number.min': 'ELEVENLABS_MAX_CONCURRENT_REQUESTS must be at least 1',
    'number.max': 'ELEVENLABS_MAX_CONCURRENT_REQUESTS must be at most 10',
  }),

  ELEVENLABS_RATE_LIMIT_DELAY_MS: Joi.number().integer().min(100).max(10000).default(1000).messages({
    'number.base': 'ELEVENLABS_RATE_LIMIT_DELAY_MS must be a number',
    'number.integer': 'ELEVENLABS_RATE_LIMIT_DELAY_MS must be an integer',
    'number.min': 'ELEVENLABS_RATE_LIMIT_DELAY_MS must be at least 100ms',
    'number.max': 'ELEVENLABS_RATE_LIMIT_DELAY_MS must be at most 10000ms',
  }),

  // Retry Configuration
  ELEVENLABS_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(3).messages({
    'number.base': 'ELEVENLABS_MAX_RETRIES must be a number',
    'number.integer': 'ELEVENLABS_MAX_RETRIES must be an integer',
    'number.min': 'ELEVENLABS_MAX_RETRIES must be at least 0',
    'number.max': 'ELEVENLABS_MAX_RETRIES must be at most 5',
  }),

  ELEVENLABS_RETRY_DELAY_MS: Joi.number().integer().min(500).max(30000).default(2000).messages({
    'number.base': 'ELEVENLABS_RETRY_DELAY_MS must be a number',
    'number.integer': 'ELEVENLABS_RETRY_DELAY_MS must be an integer',
    'number.min': 'ELEVENLABS_RETRY_DELAY_MS must be at least 500ms',
    'number.max': 'ELEVENLABS_RETRY_DELAY_MS must be at most 30000ms',
  }),

  // Audio Configuration
  ELEVENLABS_DEFAULT_OUTPUT_FORMAT: Joi.string().default('mp3_44100_128').messages({
    'string.empty': 'ELEVENLABS_DEFAULT_OUTPUT_FORMAT cannot be empty if provided',
  }),

  ELEVENLABS_VOICE_STABILITY: Joi.number().min(0).max(1).default(0.5).messages({
    'number.base': 'ELEVENLABS_VOICE_STABILITY must be a number',
    'number.min': 'ELEVENLABS_VOICE_STABILITY must be between 0 and 1',
    'number.max': 'ELEVENLABS_VOICE_STABILITY must be between 0 and 1',
  }),

  ELEVENLABS_VOICE_SIMILARITY_BOOST: Joi.number().min(0).max(1).default(0.75).messages({
    'number.base': 'ELEVENLABS_VOICE_SIMILARITY_BOOST must be a number',
    'number.min': 'ELEVENLABS_VOICE_SIMILARITY_BOOST must be between 0 and 1',
    'number.max': 'ELEVENLABS_VOICE_SIMILARITY_BOOST must be between 0 and 1',
  }),

  ELEVENLABS_VOICE_STYLE: Joi.number().min(0).max(1).default(0).messages({
    'number.base': 'ELEVENLABS_VOICE_STYLE must be a number',
    'number.min': 'ELEVENLABS_VOICE_STYLE must be between 0 and 1',
    'number.max': 'ELEVENLABS_VOICE_STYLE must be between 0 and 1',
  }),

  ELEVENLABS_VOICE_USE_SPEAKER_BOOST: Joi.boolean().default(true).messages({
    'boolean.base': 'ELEVENLABS_VOICE_USE_SPEAKER_BOOST must be a boolean',
  }),

  // Security Configuration
  ELEVENLABS_ENABLE_LOGGING: Joi.boolean().default(true).messages({
    'boolean.base': 'ELEVENLABS_ENABLE_LOGGING must be a boolean',
  }),

  ELEVENLABS_LOG_AUDIO_DATA: Joi.boolean().default(false).messages({
    'boolean.base': 'ELEVENLABS_LOG_AUDIO_DATA must be a boolean',
  }),

  // Health Check Configuration
  ELEVENLABS_HEALTH_CHECK_ENABLED: Joi.boolean().default(true).messages({
    'boolean.base': 'ELEVENLABS_HEALTH_CHECK_ENABLED must be a boolean',
  }),

  ELEVENLABS_HEALTH_CHECK_INTERVAL_MS: Joi.number().integer().min(30000).max(300000).default(60000).messages({
    'number.base': 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS must be a number',
    'number.integer': 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS must be an integer',
    'number.min': 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS must be at least 30000ms (30s)',
    'number.max': 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS must be at most 300000ms (5m)',
  }),

  // General environment
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development').messages({
    'any.only': 'NODE_ENV must be one of: development, test, production',
  }),
});

/**
 * Validates ElevenLabs configuration and provides helpful error messages
 */
export function validateElevenLabsConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = elevenlabsConfigSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    throw new Error(`ElevenLabs configuration validation failed:\n${errorMessages.join('\n')}`);
  }

  return value;
}
