import { infisicalConfigSchema, type ValidatedInfisicalConfig, validateInfisicalConfig } from '../infisical-config.validation';

describe('Infisical Configuration Validation', () => {
  describe('infisicalConfigSchema', () => {
    describe('INFISICAL_ENABLED', () => {
      it('should default to false when not provided', () => {
        const { error, value } = infisicalConfigSchema.validate({});

        expect(error).toBeUndefined();
        expect(value.INFISICAL_ENABLED).toBe(false);
      });

      it('should require credentials when enabled', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_ENABLED: true,
        });

        expect(error).toBeDefined();
        expect(error?.details.some((detail) => detail.message.includes('required when Infisical is enabled'))).toBe(true);
      });

      it('should accept boolean true with all required fields', () => {
        const { error, value } = infisicalConfigSchema.validate({
          INFISICAL_ENABLED: true,
          INFISICAL_CLIENT_ID: 'client-id',
          INFISICAL_CLIENT_SECRET: 'client-secret',
          INFISICAL_PROJECT_ID: 'project-id',
        });

        expect(error).toBeUndefined();
        expect(value.INFISICAL_ENABLED).toBe(true);
      });

      it('should accept boolean false', () => {
        const { error, value } = infisicalConfigSchema.validate({
          INFISICAL_ENABLED: false,
        });

        expect(error).toBeUndefined();
        expect(value.INFISICAL_ENABLED).toBe(false);
      });

      it('should reject non-boolean values', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_ENABLED: 'invalid',
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_ENABLED must be a boolean (true/false)');
      });
    });

    describe('INFISICAL_SITE_URL', () => {
      it('should be optional and accept valid URLs', () => {
        const validUrls = ['https://app.infisical.com', 'http://localhost:8080', 'https://self-hosted.example.com/api'];

        for (const url of validUrls) {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_SITE_URL: url,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_SITE_URL).toBe(url);
        }
      });

      it('should reject invalid URLs', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_SITE_URL: 'not-a-url',
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_SITE_URL must be a valid URL');
      });

      it('should be optional and undefined when not provided', () => {
        const { error, value } = infisicalConfigSchema.validate({});

        expect(error).toBeUndefined();
        expect(value.INFISICAL_SITE_URL).toBeUndefined();
      });
    });

    describe('Conditional validation when INFISICAL_ENABLED is true', () => {
      const enabledConfig = { INFISICAL_ENABLED: true };

      describe('INFISICAL_CLIENT_ID', () => {
        it('should be required when Infisical is enabled', () => {
          const { error } = infisicalConfigSchema.validate(enabledConfig);

          expect(error).toBeDefined();
          expect(
            error?.details.some(
              (detail) => detail.path.includes('INFISICAL_CLIENT_ID') && detail.message.includes('required when Infisical is enabled'),
            ),
          ).toBe(true);
        });

        it('should accept valid client ID when enabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: 'client-id-123',
            INFISICAL_CLIENT_SECRET: 'secret-123',
            INFISICAL_PROJECT_ID: 'project-123',
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_CLIENT_ID).toBe('client-id-123');
        });

        it('should reject empty string when enabled', () => {
          const { error } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: '',
            INFISICAL_CLIENT_SECRET: 'secret-123',
            INFISICAL_PROJECT_ID: 'project-123',
          });

          expect(error).toBeDefined();
          expect(error?.details[0].message).toBe('INFISICAL_CLIENT_ID is required when Infisical is enabled');
        });

        it('should be optional when Infisical is disabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_ENABLED: false,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_CLIENT_ID).toBeUndefined();
        });
      });

      describe('INFISICAL_CLIENT_SECRET', () => {
        it('should be required when Infisical is enabled', () => {
          const { error } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: 'client-123',
            INFISICAL_PROJECT_ID: 'project-123',
          });

          expect(error).toBeDefined();
          expect(
            error?.details.some(
              (detail) => detail.path.includes('INFISICAL_CLIENT_SECRET') && detail.message.includes('required when Infisical is enabled'),
            ),
          ).toBe(true);
        });

        it('should accept valid client secret when enabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: 'client-id-123',
            INFISICAL_CLIENT_SECRET: 'secret-123',
            INFISICAL_PROJECT_ID: 'project-123',
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_CLIENT_SECRET).toBe('secret-123');
        });

        it('should be optional when Infisical is disabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_ENABLED: false,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_CLIENT_SECRET).toBeUndefined();
        });
      });

      describe('INFISICAL_PROJECT_ID', () => {
        it('should be required when Infisical is enabled', () => {
          const { error } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: 'client-123',
            INFISICAL_CLIENT_SECRET: 'secret-123',
          });

          expect(error).toBeDefined();
          expect(
            error?.details.some(
              (detail) => detail.path.includes('INFISICAL_PROJECT_ID') && detail.message.includes('required when Infisical is enabled'),
            ),
          ).toBe(true);
        });

        it('should accept valid project ID when enabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            ...enabledConfig,
            INFISICAL_CLIENT_ID: 'client-id-123',
            INFISICAL_CLIENT_SECRET: 'secret-123',
            INFISICAL_PROJECT_ID: 'project-123',
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_PROJECT_ID).toBe('project-123');
        });

        it('should be optional when Infisical is disabled', () => {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_ENABLED: false,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_PROJECT_ID).toBeUndefined();
        });
      });
    });

    describe('INFISICAL_ENVIRONMENT', () => {
      it('should be optional and accept valid environment names', () => {
        const validEnvironments = ['development', 'staging', 'production', 'test'];

        for (const env of validEnvironments) {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_ENVIRONMENT: env,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_ENVIRONMENT).toBe(env);
        }
      });

      it('should reject empty string', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_ENVIRONMENT: '',
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_ENVIRONMENT cannot be empty if provided');
      });

      it('should be undefined when not provided', () => {
        const { error, value } = infisicalConfigSchema.validate({});

        expect(error).toBeUndefined();
        expect(value.INFISICAL_ENVIRONMENT).toBeUndefined();
      });
    });

    describe('INFISICAL_CACHE_TTL', () => {
      it('should default to 300000 when not provided', () => {
        const { error, value } = infisicalConfigSchema.validate({});

        expect(error).toBeUndefined();
        expect(value.INFISICAL_CACHE_TTL).toBe(300000);
      });

      it('should accept valid positive integers', () => {
        const validValues = [0, 1000, 300000, 3600000];

        for (const ttl of validValues) {
          const { error, value } = infisicalConfigSchema.validate({
            INFISICAL_CACHE_TTL: ttl,
          });

          expect(error).toBeUndefined();
          expect(value.INFISICAL_CACHE_TTL).toBe(ttl);
        }
      });

      it('should reject negative values', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_CACHE_TTL: -1000,
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_CACHE_TTL must be at least 0');
      });

      it('should reject values greater than max (1 hour)', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_CACHE_TTL: 3600001,
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_CACHE_TTL must be at most 3600000 (1 hour)');
      });

      it('should reject non-integer values', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_CACHE_TTL: 300.5,
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_CACHE_TTL must be an integer');
      });

      it('should reject non-numeric values', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_CACHE_TTL: 'not-a-number',
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_CACHE_TTL must be a number');
      });
    });

    describe('INFISICAL_FALLBACK_TO_ENV', () => {
      it('should default to true when not provided', () => {
        const { error, value } = infisicalConfigSchema.validate({});

        expect(error).toBeUndefined();
        expect(value.INFISICAL_FALLBACK_TO_ENV).toBe(true);
      });

      it('should accept boolean true', () => {
        const { error, value } = infisicalConfigSchema.validate({
          INFISICAL_FALLBACK_TO_ENV: true,
        });

        expect(error).toBeUndefined();
        expect(value.INFISICAL_FALLBACK_TO_ENV).toBe(true);
      });

      it('should accept boolean false', () => {
        const { error, value } = infisicalConfigSchema.validate({
          INFISICAL_FALLBACK_TO_ENV: false,
        });

        expect(error).toBeUndefined();
        expect(value.INFISICAL_FALLBACK_TO_ENV).toBe(false);
      });

      it('should reject non-boolean values', () => {
        const { error } = infisicalConfigSchema.validate({
          INFISICAL_FALLBACK_TO_ENV: 'invalid',
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toBe('INFISICAL_FALLBACK_TO_ENV must be a boolean (true/false)');
      });
    });

    describe('Complete valid configurations', () => {
      it('should validate minimal disabled configuration', () => {
        const config = {
          INFISICAL_ENABLED: false,
        };

        const { error, value } = infisicalConfigSchema.validate(config);

        expect(error).toBeUndefined();
        expect(value).toMatchObject({
          INFISICAL_ENABLED: false,
          INFISICAL_CACHE_TTL: 300000,
          INFISICAL_FALLBACK_TO_ENV: true,
        });
      });

      it('should validate complete enabled configuration', () => {
        const config = {
          INFISICAL_ENABLED: true,
          INFISICAL_SITE_URL: 'https://app.infisical.com',
          INFISICAL_CLIENT_ID: 'client-id-123',
          INFISICAL_CLIENT_SECRET: 'client-secret-456',
          INFISICAL_PROJECT_ID: 'project-id-789',
          INFISICAL_ENVIRONMENT: 'production',
          INFISICAL_CACHE_TTL: 600000,
          INFISICAL_FALLBACK_TO_ENV: false,
        };

        const { error, value } = infisicalConfigSchema.validate(config);

        expect(error).toBeUndefined();
        expect(value).toEqual(config);
      });

      it('should allow unknown fields with proper options', () => {
        const config = {
          INFISICAL_ENABLED: true,
          INFISICAL_CLIENT_ID: 'client-id',
          INFISICAL_CLIENT_SECRET: 'client-secret',
          INFISICAL_PROJECT_ID: 'project-id',
          UNKNOWN_FIELD: 'unknown-value',
        };

        const { error, value } = infisicalConfigSchema.validate(config, {
          allowUnknown: true,
        });

        expect(error).toBeUndefined();
        expect(value.UNKNOWN_FIELD).toBe('unknown-value');
      });
    });

    describe('Multiple validation errors', () => {
      it('should report all validation errors at once', () => {
        const config = {
          INFISICAL_ENABLED: true,
          INFISICAL_SITE_URL: 'invalid-url',
          INFISICAL_CACHE_TTL: -100,
          INFISICAL_FALLBACK_TO_ENV: 'not-boolean',
          // Missing required fields: CLIENT_ID, CLIENT_SECRET, PROJECT_ID
        };

        const { error } = infisicalConfigSchema.validate(config, {
          abortEarly: false,
        });

        expect(error).toBeDefined();
        expect(error?.details).toHaveLength(6); // All validation errors

        const messages = error?.details.map((detail) => detail.message) || [];
        expect(messages).toContain('INFISICAL_SITE_URL must be a valid URL');
        expect(messages).toContain('INFISICAL_CLIENT_ID is required when Infisical is enabled');
        expect(messages).toContain('INFISICAL_CLIENT_SECRET is required when Infisical is enabled');
        expect(messages).toContain('INFISICAL_PROJECT_ID is required when Infisical is enabled');
        expect(messages).toContain('INFISICAL_CACHE_TTL must be at least 0');
        expect(messages).toContain('INFISICAL_FALLBACK_TO_ENV must be a boolean (true/false)');
      });
    });
  });

  describe('validateInfisicalConfig', () => {
    it('should return validated config for valid input', () => {
      const input = {
        INFISICAL_ENABLED: true,
        INFISICAL_CLIENT_ID: 'client-id',
        INFISICAL_CLIENT_SECRET: 'client-secret',
        INFISICAL_PROJECT_ID: 'project-id',
        INFISICAL_ENVIRONMENT: 'production',
        OTHER_FIELD: 'other-value', // Should be preserved
      };

      const result = validateInfisicalConfig(input);

      expect(result.INFISICAL_ENABLED).toBe(true);
      expect(result.INFISICAL_CLIENT_ID).toBe('client-id');
      expect(result.INFISICAL_CLIENT_SECRET).toBe('client-secret');
      expect(result.INFISICAL_PROJECT_ID).toBe('project-id');
      expect(result.INFISICAL_ENVIRONMENT).toBe('production');
      expect(result.INFISICAL_CACHE_TTL).toBe(300000); // Default
      expect(result.INFISICAL_FALLBACK_TO_ENV).toBe(true); // Default
    });

    it('should throw error with detailed message for validation failures', () => {
      const input = {
        INFISICAL_ENABLED: true,
        INFISICAL_SITE_URL: 'invalid-url',
        INFISICAL_CACHE_TTL: -100,
        // Missing required fields
      };

      expect(() => validateInfisicalConfig(input)).toThrow(/Infisical configuration validation failed/);

      try {
        validateInfisicalConfig(input);
      } catch (error: unknown) {
        expect((error as Error).message).toContain('INFISICAL_SITE_URL: INFISICAL_SITE_URL must be a valid URL');
        expect((error as Error).message).toContain('INFISICAL_CLIENT_ID: INFISICAL_CLIENT_ID is required when Infisical is enabled');
        expect((error as Error).message).toContain('INFISICAL_CACHE_TTL: INFISICAL_CACHE_TTL must be at least 0');
      }
    });

    it('should format error messages with proper path and message structure', () => {
      const input = {
        INFISICAL_ENABLED: 'not-boolean',
        INFISICAL_CACHE_TTL: 'not-number',
      };

      try {
        validateInfisicalConfig(input);
        fail('Expected validation to throw');
      } catch (error: unknown) {
        const message = (error as Error).message;
        expect(message).toMatch(/INFISICAL_ENABLED: .* must be a boolean/);
        expect(message).toMatch(/INFISICAL_CACHE_TTL: .* must be a number/);
      }
    });

    it('should preserve defaults in validated output', () => {
      const input = {
        INFISICAL_ENABLED: false,
      };

      const result = validateInfisicalConfig(input);

      expect(result.INFISICAL_ENABLED).toBe(false);
      expect(result.INFISICAL_CACHE_TTL).toBe(300000);
      expect(result.INFISICAL_FALLBACK_TO_ENV).toBe(true);
      expect(result.INFISICAL_SITE_URL).toBeUndefined();
      expect(result.INFISICAL_CLIENT_ID).toBeUndefined();
      expect(result.INFISICAL_CLIENT_SECRET).toBeUndefined();
      expect(result.INFISICAL_PROJECT_ID).toBeUndefined();
      expect(result.INFISICAL_ENVIRONMENT).toBeUndefined();
    });

    it('should handle empty input object', () => {
      const result = validateInfisicalConfig({});

      expect(result.INFISICAL_ENABLED).toBe(false);
      expect(result.INFISICAL_CACHE_TTL).toBe(300000);
      expect(result.INFISICAL_FALLBACK_TO_ENV).toBe(true);
    });

    it('should validate boundary values correctly', () => {
      const input = {
        INFISICAL_ENABLED: false,
        INFISICAL_CACHE_TTL: 0, // Minimum valid value
      };

      const result = validateInfisicalConfig(input);

      expect(result.INFISICAL_CACHE_TTL).toBe(0);
    });

    it('should validate maximum cache TTL correctly', () => {
      const input = {
        INFISICAL_ENABLED: false,
        INFISICAL_CACHE_TTL: 3600000, // Maximum valid value (1 hour)
      };

      const result = validateInfisicalConfig(input);

      expect(result.INFISICAL_CACHE_TTL).toBe(3600000);
    });
  });

  describe('Type safety', () => {
    it('should return properly typed ValidatedInfisicalConfig', () => {
      const input = {
        INFISICAL_ENABLED: true,
        INFISICAL_CLIENT_ID: 'client-id',
        INFISICAL_CLIENT_SECRET: 'client-secret',
        INFISICAL_PROJECT_ID: 'project-id',
      };

      const result: ValidatedInfisicalConfig = validateInfisicalConfig(input);

      // TypeScript compilation ensures these properties exist and have correct types
      expect(typeof result.INFISICAL_ENABLED).toBe('boolean');
      expect(typeof result.INFISICAL_CACHE_TTL).toBe('number');
      expect(typeof result.INFISICAL_FALLBACK_TO_ENV).toBe('boolean');

      // Optional properties
      if (result.INFISICAL_SITE_URL !== undefined) {
        expect(typeof result.INFISICAL_SITE_URL).toBe('string');
      }
      if (result.INFISICAL_CLIENT_ID !== undefined) {
        expect(typeof result.INFISICAL_CLIENT_ID).toBe('string');
      }
      if (result.INFISICAL_CLIENT_SECRET !== undefined) {
        expect(typeof result.INFISICAL_CLIENT_SECRET).toBe('string');
      }
      if (result.INFISICAL_PROJECT_ID !== undefined) {
        expect(typeof result.INFISICAL_PROJECT_ID).toBe('string');
      }
      if (result.INFISICAL_ENVIRONMENT !== undefined) {
        expect(typeof result.INFISICAL_ENVIRONMENT).toBe('string');
      }
    });
  });
});
