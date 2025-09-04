import 'reflect-metadata';
import { ConfigCategory, ConfigEnvironment, ConfigType, Configuration } from '../entities/configuration.entity';

/**
 * Configuration Module Smoke Tests
 *
 * Basic tests to ensure the configuration system compiles and validates correctly.
 * Full integration tests should be created by the unit-test-maintainer.
 */
describe('Configuration Entity Validation Tests', () => {
  it('should create configuration entity with typed values', () => {
    const config = new Configuration();
    config.key = 'TEST_BOOLEAN';
    config.value = 'true';
    config.type = ConfigType.BOOLEAN;
    config.category = ConfigCategory.FEATURE_FLAGS;
    config.environment = ConfigEnvironment.ALL;

    expect(config.getTypedValue()).toBe(true);
    expect(config.validateValue()).toBe(true);
  });

  it('should handle number type conversion', () => {
    const config = new Configuration();
    config.key = 'TEST_NUMBER';
    config.value = '42.5';
    config.type = ConfigType.NUMBER;
    config.category = ConfigCategory.PERFORMANCE;
    config.environment = ConfigEnvironment.ALL;

    expect(config.getTypedValue()).toBe(42.5);
    expect(typeof config.getTypedValue()).toBe('number');
  });

  it('should redact secret values in safe object', () => {
    const config = new Configuration();
    config.key = 'SECRET_VALUE';
    config.value = 'sensitive_data';
    config.type = ConfigType.STRING;
    config.category = ConfigCategory.SECURITY;
    config.environment = ConfigEnvironment.ALL;
    config.isSecret = true;

    const safeObject = config.toSafeObject();
    expect(safeObject.value).toBe('[REDACTED]');
    expect(safeObject.isSecret).toBe(true);
  });

  it('should validate enum values', () => {
    const config = new Configuration();
    config.key = 'LOG_LEVEL';
    config.value = 'info';
    config.type = ConfigType.ENUM;
    config.category = ConfigCategory.LOGGING;
    config.environment = ConfigEnvironment.ALL;
    config.validationRules = {
      enum: ['error', 'warn', 'info', 'debug'],
    };

    expect(config.validateValue()).toBe(true);

    config.value = 'invalid';
    expect(config.validateValue()).toBe(false);
  });

  it('should validate number ranges', () => {
    const config = new Configuration();
    config.key = 'TIMEOUT_MS';
    config.value = '5000';
    config.type = ConfigType.NUMBER;
    config.category = ConfigCategory.PERFORMANCE;
    config.environment = ConfigEnvironment.ALL;
    config.validationRules = {
      min: 1000,
      max: 10000,
    };

    expect(config.validateValue()).toBe(true);

    config.value = '15000';
    expect(config.validateValue()).toBe(false);
  });

  it('should handle all configuration categories', () => {
    const categories = Object.values(ConfigCategory);
    expect(categories).toContain(ConfigCategory.FEATURE_FLAGS);
    expect(categories).toContain(ConfigCategory.SERVICE_SETTINGS);
    expect(categories).toContain(ConfigCategory.MODEL_CONFIG);
    expect(categories).toContain(ConfigCategory.PERFORMANCE);
    expect(categories).toContain(ConfigCategory.SECURITY);
    expect(categories).toContain(ConfigCategory.VOICE_SETTINGS);
    expect(categories).toContain(ConfigCategory.MEMORY_CONFIG);
    expect(categories).toContain(ConfigCategory.EMBEDDINGS);
  });

  it('should handle all configuration environments', () => {
    const environments = Object.values(ConfigEnvironment);
    expect(environments).toContain(ConfigEnvironment.DEVELOPMENT);
    expect(environments).toContain(ConfigEnvironment.STAGING);
    expect(environments).toContain(ConfigEnvironment.PRODUCTION);
    expect(environments).toContain(ConfigEnvironment.ALL);
  });

  it('should handle all configuration types', () => {
    const types = Object.values(ConfigType);
    expect(types).toContain(ConfigType.STRING);
    expect(types).toContain(ConfigType.NUMBER);
    expect(types).toContain(ConfigType.BOOLEAN);
    expect(types).toContain(ConfigType.ENUM);
  });
});
