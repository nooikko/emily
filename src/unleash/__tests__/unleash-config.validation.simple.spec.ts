import { unleashConfigSchema } from '../config/unleash-config.validation';

describe('unleashConfigSchema - Basic Functionality', () => {
  it('should be a valid Joi schema object', () => {
    expect(unleashConfigSchema).toBeDefined();
    expect(typeof unleashConfigSchema.validate).toBe('function');
    expect(typeof unleashConfigSchema.describe).toBe('function');
  });

  it('should validate empty config with defaults', () => {
    const result = unleashConfigSchema.validate({});
    expect(result.error).toBeUndefined();
    expect(result.value).toBeDefined();
    expect(result.value.UNLEASH_ENABLED).toBe(false);
    expect(result.value.UNLEASH_APP_NAME).toBe('emily-ai-agent');
    expect(result.value.UNLEASH_ENVIRONMENT).toBe('development');
  });

  it('should validate a complete configuration', () => {
    const config = {
      UNLEASH_ENABLED: true,
      UNLEASH_URL: 'https://unleash.example.com',
      UNLEASH_APP_NAME: 'test-app',
      UNLEASH_ENVIRONMENT: 'production',
      UNLEASH_CACHE_TTL: 600000,
      UNLEASH_FALLBACK_TO_ENV: false,
    };

    const result = unleashConfigSchema.validate(config);
    expect(result.error).toBeUndefined();
    expect(result.value.UNLEASH_ENABLED).toBe(true);
    expect(result.value.UNLEASH_URL).toBe('https://unleash.example.com');
    expect(result.value.UNLEASH_APP_NAME).toBe('test-app');
    expect(result.value.UNLEASH_ENVIRONMENT).toBe('production');
    expect(result.value.UNLEASH_CACHE_TTL).toBe(600000);
    expect(result.value.UNLEASH_FALLBACK_TO_ENV).toBe(false);
  });

  it('should reject invalid URL schemes', () => {
    const config = {
      UNLEASH_ENABLED: true,
      UNLEASH_URL: 'ftp://unleash.example.com',
    };

    const result = unleashConfigSchema.validate(config);
    expect(result.error).toBeDefined();
  });

  it('should reject invalid numeric values', () => {
    const config = {
      UNLEASH_CACHE_TTL: -1000,
    };

    const result = unleashConfigSchema.validate(config);
    expect(result.error).toBeDefined();
  });

  it('should have proper schema structure', () => {
    const description = unleashConfigSchema.describe();
    expect(description).toBeDefined();
    expect(description.type).toBe('object');
    expect(description.keys).toBeDefined();
  });
});
