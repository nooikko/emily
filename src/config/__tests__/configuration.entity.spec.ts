import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigCategory, ConfigEnvironment, ConfigType, Configuration } from '../entities/configuration.entity';

describe('Configuration Entity', () => {
  describe('Enums', () => {
    describe('ConfigType', () => {
      it('should contain all required types', () => {
        expect(ConfigType.STRING).toBe('string');
        expect(ConfigType.NUMBER).toBe('number');
        expect(ConfigType.BOOLEAN).toBe('boolean');
        expect(ConfigType.ENUM).toBe('enum');
      });

      it('should have exactly four types', () => {
        const values = Object.values(ConfigType);
        expect(values).toHaveLength(4);
      });
    });

    describe('ConfigCategory', () => {
      it('should contain all required categories', () => {
        expect(ConfigCategory.FEATURE_FLAGS).toBe('feature_flags');
        expect(ConfigCategory.SERVICE_SETTINGS).toBe('service_settings');
        expect(ConfigCategory.MODEL_CONFIG).toBe('model_config');
        expect(ConfigCategory.PERFORMANCE).toBe('performance');
        expect(ConfigCategory.SECURITY).toBe('security');
        expect(ConfigCategory.LOGGING).toBe('logging');
        expect(ConfigCategory.VOICE_SETTINGS).toBe('voice_settings');
        expect(ConfigCategory.MEMORY_CONFIG).toBe('memory_config');
        expect(ConfigCategory.EMBEDDINGS).toBe('embeddings');
      });

      it('should have exactly nine categories', () => {
        const values = Object.values(ConfigCategory);
        expect(values).toHaveLength(9);
      });
    });

    describe('ConfigEnvironment', () => {
      it('should contain all required environments', () => {
        expect(ConfigEnvironment.DEVELOPMENT).toBe('development');
        expect(ConfigEnvironment.STAGING).toBe('staging');
        expect(ConfigEnvironment.PRODUCTION).toBe('production');
        expect(ConfigEnvironment.ALL).toBe('all');
      });

      it('should have exactly four environments', () => {
        const values = Object.values(ConfigEnvironment);
        expect(values).toHaveLength(4);
      });
    });
  });

  describe('Entity validation', () => {
    describe('valid configurations', () => {
      it('should validate a basic configuration', async () => {
        const config = plainToClass(Configuration, {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'ENABLE_FEATURE_X',
          value: 'true',
          type: ConfigType.BOOLEAN,
          environment: ConfigEnvironment.ALL,
          isSecret: false,
          isActive: true,
          version: 1,
        });

        const errors = await validate(config);
        expect(errors).toHaveLength(0);
      });

      it('should validate a configuration with all optional fields', async () => {
        const config = plainToClass(Configuration, {
          category: ConfigCategory.MODEL_CONFIG,
          key: 'MODEL_TEMPERATURE',
          value: '0.7',
          type: ConfigType.NUMBER,
          environment: ConfigEnvironment.PRODUCTION,
          description: 'Temperature setting for AI model responses',
          validationRules: {
            min: 0,
            max: 1,
            required: true,
          },
          isSecret: false,
          isActive: true,
          version: 2,
          createdBy: 'admin',
          updatedBy: 'system',
        });

        const errors = await validate(config);
        expect(errors).toHaveLength(0);
      });

      it('should accept all valid config types', async () => {
        for (const type of Object.values(ConfigType)) {
          const config = plainToClass(Configuration, {
            category: ConfigCategory.SERVICE_SETTINGS,
            key: `TEST_${type.toUpperCase()}`,
            value: 'test-value',
            type,
            environment: ConfigEnvironment.ALL,
            isSecret: false,
            isActive: true,
            version: 1,
          });

          const errors = await validate(config);
          expect(errors).toHaveLength(0);
        }
      });

      it('should accept all valid categories', async () => {
        for (const category of Object.values(ConfigCategory)) {
          const config = plainToClass(Configuration, {
            category,
            key: 'TEST_KEY',
            value: 'test-value',
            type: ConfigType.STRING,
            environment: ConfigEnvironment.ALL,
            isSecret: false,
            isActive: true,
            version: 1,
          });

          const errors = await validate(config);
          expect(errors).toHaveLength(0);
        }
      });

      it('should accept all valid environments', async () => {
        for (const environment of Object.values(ConfigEnvironment)) {
          const config = plainToClass(Configuration, {
            category: ConfigCategory.FEATURE_FLAGS,
            key: 'TEST_KEY',
            value: 'test-value',
            type: ConfigType.STRING,
            environment,
            isSecret: false,
            isActive: true,
            version: 1,
          });

          const errors = await validate(config);
          expect(errors).toHaveLength(0);
        }
      });
    });

    describe('invalid configurations', () => {
      it('should fail validation when required fields are missing', async () => {
        const config = plainToClass(Configuration, {
          // Missing category, key, value, type
          environment: ConfigEnvironment.ALL,
          isSecret: false,
          isActive: true,
          version: 1,
        });

        const errors = await validate(config);
        expect(errors.length).toBeGreaterThan(0);

        const errorProperties = errors.map((error) => error.property);
        expect(errorProperties).toContain('category');
        expect(errorProperties).toContain('key');
        expect(errorProperties).toContain('value');
        expect(errorProperties).toContain('type');
      });

      it('should fail validation with invalid category', async () => {
        const config = plainToClass(Configuration, {
          category: 'invalid_category' as ConfigCategory,
          key: 'TEST_KEY',
          value: 'test-value',
          type: ConfigType.STRING,
          environment: ConfigEnvironment.ALL,
          isSecret: false,
          isActive: true,
          version: 1,
        });

        const errors = await validate(config);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'category')).toBeTruthy();
      });

      it('should fail validation with invalid type', async () => {
        const config = plainToClass(Configuration, {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'TEST_KEY',
          value: 'test-value',
          type: 'invalid_type' as ConfigType,
          environment: ConfigEnvironment.ALL,
          isSecret: false,
          isActive: true,
          version: 1,
        });

        const errors = await validate(config);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'type')).toBeTruthy();
      });

      it('should fail validation with invalid environment', async () => {
        const config = plainToClass(Configuration, {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'TEST_KEY',
          value: 'test-value',
          type: ConfigType.STRING,
          environment: 'invalid_env' as ConfigEnvironment,
          isSecret: false,
          isActive: true,
          version: 1,
        });

        const errors = await validate(config);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'environment')).toBeTruthy();
      });

      it('should fail validation with invalid version', async () => {
        const config = plainToClass(Configuration, {
          category: ConfigCategory.FEATURE_FLAGS,
          key: 'TEST_KEY',
          value: 'test-value',
          type: ConfigType.STRING,
          environment: ConfigEnvironment.ALL,
          isSecret: false,
          isActive: true,
          version: 0, // Should be >= 1
        });

        const errors = await validate(config);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'version')).toBeTruthy();
      });
    });
  });

  describe('getTypedValue method', () => {
    it('should return boolean for BOOLEAN type', () => {
      const config = new Configuration();
      config.type = ConfigType.BOOLEAN;
      config.value = 'true';

      expect(config.getTypedValue()).toBe(true);

      config.value = 'false';
      expect(config.getTypedValue()).toBe(false);

      config.value = 'TRUE';
      expect(config.getTypedValue()).toBe(true);

      config.value = 'FALSE';
      expect(config.getTypedValue()).toBe(false);
    });

    it('should return number for NUMBER type', () => {
      const config = new Configuration();
      config.type = ConfigType.NUMBER;

      config.value = '42';
      expect(config.getTypedValue()).toBe(42);

      config.value = '3.14';
      expect(config.getTypedValue()).toBe(3.14);

      config.value = '-10';
      expect(config.getTypedValue()).toBe(-10);

      config.value = '0';
      expect(config.getTypedValue()).toBe(0);
    });

    it('should return string for STRING and ENUM types', () => {
      const config = new Configuration();

      config.type = ConfigType.STRING;
      config.value = 'test string';
      expect(config.getTypedValue()).toBe('test string');

      config.type = ConfigType.ENUM;
      config.value = 'option1';
      expect(config.getTypedValue()).toBe('option1');
    });

    it('should handle edge cases for boolean conversion', () => {
      const config = new Configuration();
      config.type = ConfigType.BOOLEAN;

      // Case insensitive
      config.value = 'True';
      expect(config.getTypedValue()).toBe(true);

      config.value = 'False';
      expect(config.getTypedValue()).toBe(false);

      // Any other value should be false
      config.value = '1';
      expect(config.getTypedValue()).toBe(false);

      config.value = 'yes';
      expect(config.getTypedValue()).toBe(false);
    });

    it('should handle invalid numbers', () => {
      const config = new Configuration();
      config.type = ConfigType.NUMBER;

      config.value = 'not-a-number';
      expect(Number.isNaN(config.getTypedValue())).toBe(true);

      config.value = '';
      expect(Number.isNaN(config.getTypedValue())).toBe(true);
    });
  });

  describe('validateValue method', () => {
    describe('without validation rules', () => {
      it('should return true when no validation rules are set', () => {
        const config = new Configuration();
        config.value = 'any value';
        config.type = ConfigType.STRING;

        expect(config.validateValue()).toBe(true);
      });
    });

    describe('required validation', () => {
      it('should validate required field correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.STRING;
        config.validationRules = { required: true };

        config.value = 'valid value';
        expect(config.validateValue()).toBe(true);

        config.value = '';
        expect(config.validateValue()).toBe(false);

        config.value = '   '; // Only whitespace
        expect(config.validateValue()).toBe(false);
      });

      it('should pass validation when required is false', () => {
        const config = new Configuration();
        config.type = ConfigType.STRING;
        config.validationRules = { required: false };

        config.value = '';
        expect(config.validateValue()).toBe(true);
      });
    });

    describe('number validation', () => {
      it('should validate minimum value correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.NUMBER;
        config.validationRules = { min: 10 };

        config.value = '15';
        expect(config.validateValue()).toBe(true);

        config.value = '10';
        expect(config.validateValue()).toBe(true);

        config.value = '5';
        expect(config.validateValue()).toBe(false);
      });

      it('should validate maximum value correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.NUMBER;
        config.validationRules = { max: 100 };

        config.value = '50';
        expect(config.validateValue()).toBe(true);

        config.value = '100';
        expect(config.validateValue()).toBe(true);

        config.value = '150';
        expect(config.validateValue()).toBe(false);
      });

      it('should validate min and max range correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.NUMBER;
        config.validationRules = { min: 10, max: 100 };

        config.value = '50';
        expect(config.validateValue()).toBe(true);

        config.value = '10';
        expect(config.validateValue()).toBe(true);

        config.value = '100';
        expect(config.validateValue()).toBe(true);

        config.value = '5';
        expect(config.validateValue()).toBe(false);

        config.value = '150';
        expect(config.validateValue()).toBe(false);
      });
    });

    describe('string validation', () => {
      it('should validate pattern correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.STRING;
        config.validationRules = { pattern: '^[a-zA-Z0-9]+$' };

        config.value = 'validString123';
        expect(config.validateValue()).toBe(true);

        config.value = 'invalid-string!';
        expect(config.validateValue()).toBe(false);

        config.value = '';
        expect(config.validateValue()).toBe(false);
      });

      it('should handle complex regex patterns', () => {
        const config = new Configuration();
        config.type = ConfigType.STRING;
        config.validationRules = { pattern: '^[a-z]{3,10}$' }; // 3-10 lowercase letters

        config.value = 'abc';
        expect(config.validateValue()).toBe(true);

        config.value = 'abcdefghij';
        expect(config.validateValue()).toBe(true);

        config.value = 'ab'; // Too short
        expect(config.validateValue()).toBe(false);

        config.value = 'abcdefghijk'; // Too long
        expect(config.validateValue()).toBe(false);

        config.value = 'ABC'; // Wrong case
        expect(config.validateValue()).toBe(false);
      });
    });

    describe('enum validation', () => {
      it('should validate enum values correctly', () => {
        const config = new Configuration();
        config.type = ConfigType.ENUM;
        config.validationRules = { enum: ['option1', 'option2', 'option3'] };

        config.value = 'option1';
        expect(config.validateValue()).toBe(true);

        config.value = 'option2';
        expect(config.validateValue()).toBe(true);

        config.value = 'invalid_option';
        expect(config.validateValue()).toBe(false);

        config.value = '';
        expect(config.validateValue()).toBe(false);
      });

      it('should be case sensitive for enum validation', () => {
        const config = new Configuration();
        config.type = ConfigType.ENUM;
        config.validationRules = { enum: ['Option1', 'Option2'] };

        config.value = 'Option1';
        expect(config.validateValue()).toBe(true);

        config.value = 'option1'; // Wrong case
        expect(config.validateValue()).toBe(false);
      });
    });

    describe('boolean validation', () => {
      it('should always pass validation for boolean type', () => {
        const config = new Configuration();
        config.type = ConfigType.BOOLEAN;
        config.validationRules = { required: true };

        config.value = 'true';
        expect(config.validateValue()).toBe(true);

        config.value = 'false';
        expect(config.validateValue()).toBe(true);

        config.value = 'invalid';
        expect(config.validateValue()).toBe(true); // Boolean conversion handles this
      });
    });

    describe('complex validation scenarios', () => {
      it('should handle multiple validation rules', () => {
        const config = new Configuration();
        config.type = ConfigType.NUMBER;
        config.validationRules = {
          required: true,
          min: 0,
          max: 100,
        };

        config.value = '50';
        expect(config.validateValue()).toBe(true);

        config.value = ''; // Fails required
        expect(config.validateValue()).toBe(false);

        config.value = '-10'; // Fails min
        expect(config.validateValue()).toBe(false);

        config.value = '150'; // Fails max
        expect(config.validateValue()).toBe(false);
      });
    });
  });

  describe('toSafeObject method', () => {
    it('should return all fields for non-secret configuration', () => {
      const config = new Configuration();
      config.id = 'test-id';
      config.category = ConfigCategory.FEATURE_FLAGS;
      config.key = 'TEST_KEY';
      config.value = 'test-value';
      config.type = ConfigType.STRING;
      config.environment = ConfigEnvironment.ALL;
      config.description = 'Test description';
      config.isSecret = false;
      config.isActive = true;
      config.version = 1;
      config.createdBy = 'admin';
      config.updatedBy = 'system';

      const safeObject = config.toSafeObject();

      expect(safeObject.id).toBe('test-id');
      expect(safeObject.category).toBe(ConfigCategory.FEATURE_FLAGS);
      expect(safeObject.key).toBe('TEST_KEY');
      expect(safeObject.value).toBe('test-value'); // Not redacted
      expect(safeObject.type).toBe(ConfigType.STRING);
      expect(safeObject.environment).toBe(ConfigEnvironment.ALL);
      expect(safeObject.description).toBe('Test description');
      expect(safeObject.isSecret).toBe(false);
      expect(safeObject.isActive).toBe(true);
      expect(safeObject.version).toBe(1);
      expect(safeObject.createdBy).toBe('admin');
      expect(safeObject.updatedBy).toBe('system');
    });

    it('should redact value for secret configuration', () => {
      const config = new Configuration();
      config.id = 'secret-id';
      config.category = ConfigCategory.SECURITY;
      config.key = 'SECRET_KEY';
      config.value = 'super-secret-value';
      config.type = ConfigType.STRING;
      config.environment = ConfigEnvironment.PRODUCTION;
      config.isSecret = true;
      config.isActive = true;
      config.version = 1;

      const safeObject = config.toSafeObject();

      expect(safeObject.key).toBe('SECRET_KEY');
      expect(safeObject.value).toBe('[REDACTED]'); // Redacted
      expect(safeObject.isSecret).toBe(true);
      expect(safeObject.type).toBe(ConfigType.STRING);
    });

    it('should handle undefined optional fields', () => {
      const config = new Configuration();
      config.id = 'test-id';
      config.category = ConfigCategory.FEATURE_FLAGS;
      config.key = 'TEST_KEY';
      config.value = 'test-value';
      config.type = ConfigType.STRING;
      config.environment = ConfigEnvironment.ALL;
      config.isSecret = false;
      config.isActive = true;
      config.version = 1;
      // description, createdBy, updatedBy are undefined

      const safeObject = config.toSafeObject();

      expect(safeObject.description).toBeUndefined();
      expect(safeObject.createdBy).toBeUndefined();
      expect(safeObject.updatedBy).toBeUndefined();
    });
  });

  describe('OpenAPI decorators integration', () => {
    it('should have properties accessible for OpenAPI documentation', () => {
      const config = new Configuration();

      // Test basic property assignment
      config.category = ConfigCategory.FEATURE_FLAGS;
      config.key = 'TEST_KEY';
      config.value = 'test-value';
      config.type = ConfigType.STRING;
      config.environment = ConfigEnvironment.ALL;
      config.isSecret = false;
      config.isActive = true;
      config.version = 1;

      expect(Object.hasOwn(config, 'category') || 'category' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'key') || 'key' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'value') || 'value' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'type') || 'type' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'environment') || 'environment' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'isSecret') || 'isSecret' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'isActive') || 'isActive' in config).toBeTruthy();
      expect(Object.hasOwn(config, 'version') || 'version' in config).toBeTruthy();
    });

    it('should handle validation rules object correctly', () => {
      const config = new Configuration();
      config.validationRules = {
        min: 0,
        max: 100,
        pattern: '^[a-zA-Z]+$',
        enum: ['option1', 'option2'],
        required: true,
      };

      expect(config.validationRules).toBeDefined();
      expect(typeof config.validationRules).toBe('object');
      expect(config.validationRules.min).toBe(0);
      expect(config.validationRules.max).toBe(100);
      expect(config.validationRules.pattern).toBe('^[a-zA-Z]+$');
      expect(config.validationRules.enum).toEqual(['option1', 'option2']);
      expect(config.validationRules.required).toBe(true);
    });
  });

  describe('Entity instantiation and serialization', () => {
    it('should create Configuration instance correctly', () => {
      const config = new Configuration();
      expect(config).toBeInstanceOf(Configuration);
    });

    it('should serialize and deserialize correctly', () => {
      const originalData = {
        id: 'test-id',
        category: ConfigCategory.MODEL_CONFIG,
        key: 'TEMPERATURE',
        value: '0.7',
        type: ConfigType.NUMBER,
        environment: ConfigEnvironment.PRODUCTION,
        description: 'Model temperature setting',
        validationRules: {
          min: 0,
          max: 1,
          required: true,
        },
        isSecret: false,
        isActive: true,
        version: 1,
        createdBy: 'admin',
        updatedBy: 'system',
      };

      const config = plainToClass(Configuration, originalData);
      const serialized = JSON.parse(JSON.stringify(config));
      const deserialized = plainToClass(Configuration, serialized);

      expect(deserialized.id).toBe(originalData.id);
      expect(deserialized.category).toBe(originalData.category);
      expect(deserialized.key).toBe(originalData.key);
      expect(deserialized.value).toBe(originalData.value);
      expect(deserialized.type).toBe(originalData.type);
      expect(deserialized.environment).toBe(originalData.environment);
      expect(deserialized.description).toBe(originalData.description);
      expect(deserialized.validationRules).toEqual(originalData.validationRules);
      expect(deserialized.isSecret).toBe(originalData.isSecret);
      expect(deserialized.isActive).toBe(originalData.isActive);
      expect(deserialized.version).toBe(originalData.version);
      expect(deserialized.createdBy).toBe(originalData.createdBy);
      expect(deserialized.updatedBy).toBe(originalData.updatedBy);
    });
  });
});
