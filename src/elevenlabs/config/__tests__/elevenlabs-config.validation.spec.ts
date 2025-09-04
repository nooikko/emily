import { elevenlabsConfigSchema, validateElevenLabsConfig } from '../elevenlabs-config.validation';

describe('ElevenLabs Configuration Validation', () => {
  describe('elevenlabsConfigSchema', () => {
    describe('required fields validation', () => {
      it('should require ELEVENLABS_API_KEY when ElevenLabs is enabled', () => {
        const config = {
          ELEVENLABS_ENABLED: true,
          // Missing ELEVENLABS_API_KEY
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeDefined();
        expect(error?.details).toHaveLength(1);
        expect(error?.details[0].path).toEqual(['ELEVENLABS_API_KEY']);
        expect(error?.details[0].type).toBe('any.required');
        expect(error?.details[0].message).toBe('ELEVENLABS_API_KEY is required when ElevenLabs is enabled');
      });

      it('should reject empty ELEVENLABS_API_KEY', () => {
        const config = {
          ELEVENLABS_ENABLED: true,
          ELEVENLABS_API_KEY: '',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeDefined();
        expect(error?.details[0].path).toEqual(['ELEVENLABS_API_KEY']);
        expect(error?.details[0].type).toBe('string.empty');
        expect(error?.details[0].message).toBe('ELEVENLABS_API_KEY is required when ElevenLabs is enabled');
      });

      it('should accept valid ELEVENLABS_API_KEY', () => {
        const config = {
          ELEVENLABS_API_KEY: 'valid-api-key-12345',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeUndefined();
      });
    });

    describe('URL validation', () => {
      it('should accept valid ELEVENLABS_BASE_URL', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
          ELEVENLABS_BASE_URL: 'https://api.elevenlabs.io',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeUndefined();
      });

      it('should accept custom HTTPS URL for ELEVENLABS_BASE_URL', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
          ELEVENLABS_BASE_URL: 'https://custom-api.example.com',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeUndefined();
      });

      it('should reject invalid URL for ELEVENLABS_BASE_URL', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
          ELEVENLABS_BASE_URL: 'not-a-valid-url',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeDefined();
        expect(error?.details[0].path).toEqual(['ELEVENLABS_BASE_URL']);
        expect(error?.details[0].type).toBe('string.uri');
        expect(error?.details[0].message).toBe('ELEVENLABS_BASE_URL must be a valid URL');
      });

      it('should use default URL when ELEVENLABS_BASE_URL is not provided', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
        };

        const { error, value } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeUndefined();
        expect(value.ELEVENLABS_BASE_URL).toBe('https://api.elevenlabs.io');
      });
    });

    describe('string field validation', () => {
      const stringFields = [
        { key: 'ELEVENLABS_DEFAULT_VOICE_ID', required: false },
        { key: 'ELEVENLABS_DEFAULT_TTS_MODEL', required: false, default: 'eleven_multilingual_v2' },
        { key: 'ELEVENLABS_DEFAULT_STT_MODEL', required: false, default: 'scribe_v1' },
        { key: 'ELEVENLABS_DEFAULT_OUTPUT_FORMAT', required: false, default: 'mp3_44100_128' },
      ];

      stringFields.forEach(({ key, required, default: defaultValue }) => {
        it(`should handle ${key} correctly - optional: ${!required}`, () => {
          const config = {
            ELEVENLABS_API_KEY: 'test-key',
            [key]: 'custom-value',
          };

          const { error } = elevenlabsConfigSchema.validate(config);

          expect(error).toBeUndefined();
        });

        if (defaultValue) {
          it(`should use default value for ${key} when not provided`, () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
            };

            const { error, value } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
            expect(value[key]).toBe(defaultValue);
          });
        }

        it(`should reject empty string for ${key}`, () => {
          const config = {
            ELEVENLABS_API_KEY: 'test-key',
            [key]: '',
          };

          const { error } = elevenlabsConfigSchema.validate(config);

          expect(error).toBeDefined();
          expect(error?.details[0].path).toEqual([key]);
          expect(error?.details[0].type).toBe('string.empty');
          expect(error?.details[0].message).toBe(`${key} cannot be empty if provided`);
        });
      });
    });

    describe('numeric field validation', () => {
      const numericFields = [
        {
          key: 'ELEVENLABS_MAX_CONCURRENT_REQUESTS',
          min: 1,
          max: 10,
          default: 3,
          validValues: [1, 5, 10],
          invalidValues: [0, 11, -1],
        },
        {
          key: 'ELEVENLABS_RATE_LIMIT_DELAY_MS',
          min: 100,
          max: 10000,
          default: 1000,
          validValues: [100, 5000, 10000],
          invalidValues: [99, 10001, -100],
        },
        {
          key: 'ELEVENLABS_MAX_RETRIES',
          min: 0,
          max: 5,
          default: 3,
          validValues: [0, 3, 5],
          invalidValues: [-1, 6, 10],
        },
        {
          key: 'ELEVENLABS_RETRY_DELAY_MS',
          min: 500,
          max: 30000,
          default: 2000,
          validValues: [500, 15000, 30000],
          invalidValues: [499, 30001, -500],
        },
        {
          key: 'ELEVENLABS_HEALTH_CHECK_INTERVAL_MS',
          min: 30000,
          max: 300000,
          default: 60000,
          validValues: [30000, 150000, 300000],
          invalidValues: [29999, 300001, -30000],
        },
      ];

      numericFields.forEach(({ key, min, max, default: defaultValue, validValues, invalidValues }) => {
        describe(key, () => {
          it(`should accept valid values within range ${min}-${max}`, () => {
            validValues.forEach((validValue) => {
              const config = {
                ELEVENLABS_API_KEY: 'test-key',
                [key]: validValue,
              };

              const { error } = elevenlabsConfigSchema.validate(config);

              expect(error).toBeUndefined();
            });
          });

          it(`should reject values outside range ${min}-${max}`, () => {
            invalidValues.forEach((invalidValue) => {
              const config = {
                ELEVENLABS_API_KEY: 'test-key',
                [key]: invalidValue,
              };

              const { error } = elevenlabsConfigSchema.validate(config);

              expect(error).toBeDefined();
              expect(error?.details[0].path).toEqual([key]);
            });
          });

          it(`should use default value ${defaultValue} when not provided`, () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
            };

            const { error, value } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
            expect(value[key]).toBe(defaultValue);
          });

          it('should reject non-numeric values', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: 'not-a-number',
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeDefined();
            expect(error?.details[0].path).toEqual([key]);
            expect(error?.details[0].type).toBe('number.base');
            expect(error?.details[0].message).toBe(`${key} must be a number`);
          });

          it('should reject non-integer values', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: 3.14,
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeDefined();
            expect(error?.details[0].path).toEqual([key]);
            expect(error?.details[0].type).toBe('number.integer');
            expect(error?.details[0].message).toBe(`${key} must be an integer`);
          });
        });
      });
    });

    describe('voice settings validation', () => {
      const voiceSettings = [
        {
          key: 'ELEVENLABS_VOICE_STABILITY',
          min: 0,
          max: 1,
          default: 0.5,
          validValues: [0, 0.5, 1, 0.25, 0.75],
          invalidValues: [-0.1, 1.1, 2, -1],
        },
        {
          key: 'ELEVENLABS_VOICE_SIMILARITY_BOOST',
          min: 0,
          max: 1,
          default: 0.75,
          validValues: [0, 0.5, 1, 0.25, 0.75],
          invalidValues: [-0.1, 1.1, 2, -1],
        },
        {
          key: 'ELEVENLABS_VOICE_STYLE',
          min: 0,
          max: 1,
          default: 0,
          validValues: [0, 0.5, 1, 0.25, 0.75],
          invalidValues: [-0.1, 1.1, 2, -1],
        },
      ];

      voiceSettings.forEach(({ key, min, max, default: defaultValue, validValues, invalidValues }) => {
        describe(key, () => {
          it(`should accept valid values within range ${min}-${max}`, () => {
            validValues.forEach((validValue) => {
              const config = {
                ELEVENLABS_API_KEY: 'test-key',
                [key]: validValue,
              };

              const { error } = elevenlabsConfigSchema.validate(config);

              expect(error).toBeUndefined();
            });
          });

          it(`should reject values outside range ${min}-${max}`, () => {
            invalidValues.forEach((invalidValue) => {
              const config = {
                ELEVENLABS_API_KEY: 'test-key',
                [key]: invalidValue,
              };

              const { error } = elevenlabsConfigSchema.validate(config);

              expect(error).toBeDefined();
              expect(error?.details[0].path).toEqual([key]);
              expect(error?.details[0].message).toBe(`${key} must be between 0 and 1`);
            });
          });

          it(`should use default value ${defaultValue} when not provided`, () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
            };

            const { error, value } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
            expect(value[key]).toBe(defaultValue);
          });

          it('should reject non-numeric values', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: 'not-a-number',
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeDefined();
            expect(error?.details[0].path).toEqual([key]);
            expect(error?.details[0].type).toBe('number.base');
            expect(error?.details[0].message).toBe(`${key} must be a number`);
          });
        });
      });
    });

    describe('boolean field validation', () => {
      const booleanFields = [
        { key: 'ELEVENLABS_VOICE_USE_SPEAKER_BOOST', default: true },
        { key: 'ELEVENLABS_ENABLE_LOGGING', default: true },
        { key: 'ELEVENLABS_LOG_AUDIO_DATA', default: false },
        { key: 'ELEVENLABS_HEALTH_CHECK_ENABLED', default: true },
      ];

      booleanFields.forEach(({ key, default: defaultValue }) => {
        describe(key, () => {
          it('should accept true value', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: true,
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
          });

          it('should accept false value', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: false,
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
          });

          it(`should use default value ${defaultValue} when not provided`, () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
            };

            const { error, value } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeUndefined();
            expect(value[key]).toBe(defaultValue);
          });

          it('should reject non-boolean values', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: 'not-a-boolean',
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeDefined();
            expect(error?.details[0].path).toEqual([key]);
            expect(error?.details[0].type).toBe('boolean.base');
            expect(error?.details[0].message).toBe(`${key} must be a boolean`);
          });

          it('should reject numeric values', () => {
            const config = {
              ELEVENLABS_API_KEY: 'test-key',
              [key]: 1,
            };

            const { error } = elevenlabsConfigSchema.validate(config);

            expect(error).toBeDefined();
            expect(error?.details[0].path).toEqual([key]);
            expect(error?.details[0].type).toBe('boolean.base');
          });
        });
      });
    });

    describe('NODE_ENV validation', () => {
      it('should accept valid NODE_ENV values', () => {
        const validEnvs = ['development', 'test', 'production'];

        validEnvs.forEach((env) => {
          const config = {
            ELEVENLABS_API_KEY: 'test-key',
            NODE_ENV: env,
          };

          const { error } = elevenlabsConfigSchema.validate(config);

          expect(error).toBeUndefined();
        });
      });

      it('should reject invalid NODE_ENV values', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
          NODE_ENV: 'staging',
        };

        const { error } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeDefined();
        expect(error?.details[0].path).toEqual(['NODE_ENV']);
        expect(error?.details[0].type).toBe('any.only');
        expect(error?.details[0].message).toBe('NODE_ENV must be one of: development, test, production');
      });

      it('should use development as default NODE_ENV', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
        };

        const { error, value } = elevenlabsConfigSchema.validate(config);

        expect(error).toBeUndefined();
        expect(value.NODE_ENV).toBe('development');
      });
    });

    describe('schema options', () => {
      it('should allow unknown fields', () => {
        const config = {
          ELEVENLABS_API_KEY: 'test-key',
          UNKNOWN_FIELD: 'unknown-value',
          ANOTHER_UNKNOWN: 123,
        };

        const { error } = elevenlabsConfigSchema.validate(config, {
          allowUnknown: true,
        });

        expect(error).toBeUndefined();
      });

      it('should collect all validation errors when abortEarly is false', () => {
        const config = {
          ELEVENLABS_ENABLED: true,
          // Missing API key
          ELEVENLABS_BASE_URL: 'invalid-url',
          ELEVENLABS_MAX_CONCURRENT_REQUESTS: 15, // Out of range
          NODE_ENV: 'invalid-env',
        };

        const { error } = elevenlabsConfigSchema.validate(config, {
          allowUnknown: true,
          abortEarly: false,
        });

        expect(error).toBeDefined();
        expect(error?.details).toHaveLength(4); // Should collect all errors

        const errorPaths = error?.details.map((d) => d.path[0]);
        expect(errorPaths).toContain('ELEVENLABS_API_KEY');
        expect(errorPaths).toContain('ELEVENLABS_BASE_URL');
        expect(errorPaths).toContain('ELEVENLABS_MAX_CONCURRENT_REQUESTS');
        expect(errorPaths).toContain('NODE_ENV');
      });
    });
  });

  describe('validateElevenLabsConfig function', () => {
    it('should return validated value for valid configuration', () => {
      const config = {
        ELEVENLABS_API_KEY: 'test-key-12345',
        ELEVENLABS_BASE_URL: 'https://api.elevenlabs.io',
        NODE_ENV: 'test',
      };

      const result = validateElevenLabsConfig(config);

      expect(result).toBeDefined();
      expect(result.ELEVENLABS_API_KEY).toBe('test-key-12345');
      expect(result.ELEVENLABS_BASE_URL).toBe('https://api.elevenlabs.io');
      expect(result.NODE_ENV).toBe('test');
    });

    it('should include default values in returned configuration', () => {
      const config = {
        ELEVENLABS_API_KEY: 'test-key-12345',
      };

      const result = validateElevenLabsConfig(config);

      expect(result.ELEVENLABS_BASE_URL).toBe('https://api.elevenlabs.io');
      expect(result.ELEVENLABS_DEFAULT_TTS_MODEL).toBe('eleven_multilingual_v2');
      expect(result.ELEVENLABS_DEFAULT_STT_MODEL).toBe('scribe_v1');
      expect(result.ELEVENLABS_MAX_CONCURRENT_REQUESTS).toBe(3);
      expect(result.ELEVENLABS_RATE_LIMIT_DELAY_MS).toBe(1000);
      expect(result.ELEVENLABS_MAX_RETRIES).toBe(3);
      expect(result.ELEVENLABS_RETRY_DELAY_MS).toBe(2000);
      expect(result.ELEVENLABS_DEFAULT_OUTPUT_FORMAT).toBe('mp3_44100_128');
      expect(result.ELEVENLABS_VOICE_STABILITY).toBe(0.5);
      expect(result.ELEVENLABS_VOICE_SIMILARITY_BOOST).toBe(0.75);
      expect(result.ELEVENLABS_VOICE_STYLE).toBe(0);
      expect(result.ELEVENLABS_VOICE_USE_SPEAKER_BOOST).toBe(true);
      expect(result.ELEVENLABS_ENABLE_LOGGING).toBe(true);
      expect(result.ELEVENLABS_LOG_AUDIO_DATA).toBe(false);
      expect(result.ELEVENLABS_HEALTH_CHECK_ENABLED).toBe(true);
      expect(result.ELEVENLABS_HEALTH_CHECK_INTERVAL_MS).toBe(60000);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should throw descriptive error for invalid configuration', () => {
      const config = {
        // Missing required API key
        ELEVENLABS_BASE_URL: 'invalid-url',
        ELEVENLABS_MAX_CONCURRENT_REQUESTS: 15,
      };

      expect(() => validateElevenLabsConfig(config)).toThrow(/ElevenLabs configuration validation failed:/);
    });

    it('should include all error messages in thrown error', () => {
      const config = {
        ELEVENLABS_ENABLED: true,
        ELEVENLABS_BASE_URL: 'invalid-url',
        ELEVENLABS_MAX_CONCURRENT_REQUESTS: 15,
        NODE_ENV: 'invalid',
      };

      let thrownError: Error | null = null;
      try {
        validateElevenLabsConfig(config);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('ELEVENLABS_API_KEY is required when ElevenLabs is enabled');
      expect(thrownError?.message).toContain('ELEVENLABS_BASE_URL must be a valid URL');
      expect(thrownError?.message).toContain('ELEVENLABS_MAX_CONCURRENT_REQUESTS must be at most 10');
      expect(thrownError?.message).toContain('NODE_ENV must be one of: development, test, production');
    });

    it('should handle empty configuration object', () => {
      const config = { ELEVENLABS_ENABLED: true };

      expect(() => validateElevenLabsConfig(config)).toThrow('ELEVENLABS_API_KEY is required when ElevenLabs is enabled');
    });

    it('should handle null or undefined configuration', () => {
      expect(() => validateElevenLabsConfig(null as unknown as never)).toThrow('"value" must be of type object');
      // undefined returns undefined from Joi, which the function returns as-is
      const result = validateElevenLabsConfig(undefined as unknown as never);
      expect(result).toBeUndefined();
    });

    it('should preserve unknown fields when allowUnknown is used in schema', () => {
      const config = {
        ELEVENLABS_API_KEY: 'test-key-12345',
        CUSTOM_FIELD: 'custom-value',
      };

      const result = validateElevenLabsConfig(config);

      expect(result.ELEVENLABS_API_KEY).toBe('test-key-12345');
      expect(result.CUSTOM_FIELD).toBe('custom-value');
    });
  });

  describe('error message quality', () => {
    it('should provide helpful error messages for common mistakes', () => {
      const testCases = [
        {
          config: { ELEVENLABS_ENABLED: true, ELEVENLABS_API_KEY: '' },
          expectedMessage: 'ELEVENLABS_API_KEY is required when ElevenLabs is enabled',
        },
        {
          config: { ELEVENLABS_API_KEY: 'test', ELEVENLABS_BASE_URL: 'not-a-url' },
          expectedMessage: 'ELEVENLABS_BASE_URL must be a valid URL',
        },
        {
          config: { ELEVENLABS_API_KEY: 'test', ELEVENLABS_MAX_CONCURRENT_REQUESTS: 0 },
          expectedMessage: 'ELEVENLABS_MAX_CONCURRENT_REQUESTS must be at least 1',
        },
        {
          config: { ELEVENLABS_API_KEY: 'test', ELEVENLABS_VOICE_STABILITY: 2 },
          expectedMessage: 'ELEVENLABS_VOICE_STABILITY must be between 0 and 1',
        },
        {
          config: { ELEVENLABS_API_KEY: 'test', NODE_ENV: 'staging' },
          expectedMessage: 'NODE_ENV must be one of: development, test, production',
        },
      ];

      testCases.forEach(({ config, expectedMessage }) => {
        expect(() => validateElevenLabsConfig(config)).toThrow(expectedMessage);
      });
    });
  });
});
