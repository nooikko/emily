import {
  isValidFeatureFlag,
  isValidVariant,
  isValidVariantPayload,
  type UnleashFeatureFlag,
  type UnleashVariant,
  type UnleashVariantPayload,
} from '../interfaces/unleash-config.interface';

describe('Unleash Interface Type Guards', () => {
  describe('isValidVariantPayload', () => {
    describe('Valid payloads', () => {
      it('should validate string payload', () => {
        const payload: UnleashVariantPayload = {
          type: 'string',
          value: 'test-value',
        };

        expect(isValidVariantPayload(payload)).toBe(true);
      });

      it('should validate number payload', () => {
        const payload: UnleashVariantPayload = {
          type: 'number',
          value: '123',
        };

        expect(isValidVariantPayload(payload)).toBe(true);
      });

      it('should validate json payload', () => {
        const payload: UnleashVariantPayload = {
          type: 'json',
          value: '{"key": "value"}',
        };

        expect(isValidVariantPayload(payload)).toBe(true);
      });
    });

    describe('Invalid payloads', () => {
      it('should reject null', () => {
        expect(isValidVariantPayload(null)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidVariantPayload(undefined)).toBe(false);
      });

      it('should reject non-object values', () => {
        expect(isValidVariantPayload('string')).toBe(false);
        expect(isValidVariantPayload(123)).toBe(false);
        expect(isValidVariantPayload(true)).toBe(false);
        expect(isValidVariantPayload([])).toBe(false);
      });

      it('should reject empty object', () => {
        expect(isValidVariantPayload({})).toBe(false);
      });

      it('should reject object missing type property', () => {
        const invalidPayload = {
          value: 'test-value',
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });

      it('should reject object missing value property', () => {
        const invalidPayload = {
          type: 'string',
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });

      it('should reject object with non-string type', () => {
        const invalidPayload = {
          type: 123,
          value: 'test-value',
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });

      it('should reject object with non-string value', () => {
        const invalidPayload = {
          type: 'string',
          value: 123,
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });

      it('should reject object with invalid type value', () => {
        const invalidPayload = {
          type: 'invalid-type',
          value: 'test-value',
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });

      it('should reject object with extra properties but invalid required ones', () => {
        const invalidPayload = {
          type: 'invalid-type',
          value: 'test-value',
          extraProperty: 'extra',
        };

        expect(isValidVariantPayload(invalidPayload)).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should accept empty string value', () => {
        const payload = {
          type: 'string',
          value: '',
        };

        expect(isValidVariantPayload(payload)).toBe(true);
      });

      it('should accept object with extra properties if required ones are valid', () => {
        const payloadWithExtra = {
          type: 'string',
          value: 'test-value',
          extraProperty: 'should-be-ignored',
        };

        expect(isValidVariantPayload(payloadWithExtra)).toBe(true);
      });

      it('should handle objects with prototype pollution attempts', () => {
        const maliciousPayload = {
          type: 'string',
          value: 'test-value',
          __proto__: { malicious: true },
          constructor: { prototype: { evil: true } },
        };

        expect(isValidVariantPayload(maliciousPayload)).toBe(true);
      });
    });
  });

  describe('isValidVariant', () => {
    describe('Valid variants', () => {
      it('should validate variant with valid payload', () => {
        const variant: UnleashVariant = {
          name: 'test-variant',
          enabled: true,
          payload: {
            type: 'string',
            value: 'test-value',
          },
        };

        expect(isValidVariant(variant)).toBe(true);
      });

      it('should validate variant without payload', () => {
        const variant: UnleashVariant = {
          name: 'test-variant',
          enabled: false,
        };

        expect(isValidVariant(variant)).toBe(true);
      });

      it('should validate variant with undefined payload', () => {
        const variant = {
          name: 'test-variant',
          enabled: true,
          payload: undefined,
        };

        expect(isValidVariant(variant)).toBe(true);
      });
    });

    describe('Invalid variants', () => {
      it('should reject null', () => {
        expect(isValidVariant(null)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidVariant(undefined)).toBe(false);
      });

      it('should reject non-object values', () => {
        expect(isValidVariant('string')).toBe(false);
        expect(isValidVariant(123)).toBe(false);
        expect(isValidVariant(true)).toBe(false);
        expect(isValidVariant([])).toBe(false);
      });

      it('should reject empty object', () => {
        expect(isValidVariant({})).toBe(false);
      });

      it('should reject object missing name property', () => {
        const invalidVariant = {
          enabled: true,
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });

      it('should reject object missing enabled property', () => {
        const invalidVariant = {
          name: 'test-variant',
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });

      it('should reject object with non-string name', () => {
        const invalidVariant = {
          name: 123,
          enabled: true,
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });

      it('should reject object with non-boolean enabled', () => {
        const invalidVariant = {
          name: 'test-variant',
          enabled: 'true',
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });

      it('should reject object with invalid payload', () => {
        const invalidVariant = {
          name: 'test-variant',
          enabled: true,
          payload: {
            type: 'invalid-type',
            value: 'test-value',
          },
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });

      it('should reject object with non-object payload (when payload is not undefined)', () => {
        const invalidVariant = {
          name: 'test-variant',
          enabled: true,
          payload: 'invalid-payload',
        };

        expect(isValidVariant(invalidVariant)).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should accept empty string name', () => {
        const variant = {
          name: '',
          enabled: true,
        };

        expect(isValidVariant(variant)).toBe(true);
      });

      it('should accept variant with extra properties', () => {
        const variantWithExtra = {
          name: 'test-variant',
          enabled: true,
          payload: {
            type: 'string',
            value: 'test-value',
          },
          extraProperty: 'should-be-ignored',
        };

        expect(isValidVariant(variantWithExtra)).toBe(true);
      });

      it('should handle null payload specifically', () => {
        const variantWithNullPayload = {
          name: 'test-variant',
          enabled: true,
          payload: null,
        };

        expect(isValidVariant(variantWithNullPayload)).toBe(false);
      });
    });
  });

  describe('isValidFeatureFlag', () => {
    describe('Valid feature flags', () => {
      it('should validate complete feature flag', () => {
        const featureFlag: UnleashFeatureFlag = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
            payload: {
              type: 'string',
              value: 'test-value',
            },
          },
          impressionData: true,
        };

        expect(isValidFeatureFlag(featureFlag)).toBe(true);
      });

      it('should validate feature flag without impressionData', () => {
        const featureFlag = {
          name: 'test-flag',
          enabled: false,
          variant: {
            name: 'test-variant',
            enabled: false,
          },
        };

        expect(isValidFeatureFlag(featureFlag)).toBe(true);
      });

      it('should validate feature flag with variant without payload', () => {
        const featureFlag = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
          impressionData: false,
        };

        expect(isValidFeatureFlag(featureFlag)).toBe(true);
      });
    });

    describe('Invalid feature flags', () => {
      it('should reject null', () => {
        expect(isValidFeatureFlag(null)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidFeatureFlag(undefined)).toBe(false);
      });

      it('should reject non-object values', () => {
        expect(isValidFeatureFlag('string')).toBe(false);
        expect(isValidFeatureFlag(123)).toBe(false);
        expect(isValidFeatureFlag(true)).toBe(false);
        expect(isValidFeatureFlag([])).toBe(false);
      });

      it('should reject empty object', () => {
        expect(isValidFeatureFlag({})).toBe(false);
      });

      it('should reject object missing name property', () => {
        const invalidFlag = {
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object missing enabled property', () => {
        const invalidFlag = {
          name: 'test-flag',
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object missing variant property', () => {
        const invalidFlag = {
          name: 'test-flag',
          enabled: true,
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object with non-string name', () => {
        const invalidFlag = {
          name: 123,
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object with non-boolean enabled', () => {
        const invalidFlag = {
          name: 'test-flag',
          enabled: 'true',
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object with invalid variant', () => {
        const invalidFlag = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 123, // Invalid variant name
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });

      it('should reject object with non-object variant', () => {
        const invalidFlag = {
          name: 'test-flag',
          enabled: true,
          variant: 'invalid-variant',
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should accept empty string name', () => {
        const flag = {
          name: '',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(flag)).toBe(true);
      });

      it('should accept feature flag with extra properties', () => {
        const flagWithExtra = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
          impressionData: true,
          extraProperty: 'should-be-ignored',
        };

        expect(isValidFeatureFlag(flagWithExtra)).toBe(true);
      });

      it('should handle impressionData as optional property', () => {
        const flagWithoutImpressionData = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
        };

        expect(isValidFeatureFlag(flagWithoutImpressionData)).toBe(true);

        const flagWithImpressionData = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
          },
          impressionData: false,
        };

        expect(isValidFeatureFlag(flagWithImpressionData)).toBe(true);
      });

      it('should reject feature flag with complex nested variant payload errors', () => {
        const invalidFlag = {
          name: 'test-flag',
          enabled: true,
          variant: {
            name: 'test-variant',
            enabled: true,
            payload: {
              type: 'string', // Valid type
              value: 123, // Invalid value type
            },
          },
        };

        expect(isValidFeatureFlag(invalidFlag)).toBe(false);
      });
    });
  });

  describe('Integration tests', () => {
    it('should validate complex nested structure', () => {
      const complexFeatureFlag = {
        name: 'complex-flag',
        enabled: true,
        variant: {
          name: 'complex-variant',
          enabled: true,
          payload: {
            type: 'json',
            value: JSON.stringify({
              config: {
                apiUrl: 'https://api.example.com',
                timeout: 5000,
                features: ['feature1', 'feature2'],
              },
            }),
          },
        },
        impressionData: true,
      };

      expect(isValidFeatureFlag(complexFeatureFlag)).toBe(true);
    });

    it('should handle real-world Unleash response structure', () => {
      const unleashResponse = {
        name: 'new-payment-flow',
        enabled: true,
        variant: {
          name: 'treatment',
          enabled: true,
          payload: {
            type: 'string',
            value: 'stripe-checkout-v2',
          },
        },
        impressionData: false,
      };

      expect(isValidFeatureFlag(unleashResponse)).toBe(true);
    });

    it('should properly cascade validation failures', () => {
      // Test that variant validation failure causes feature flag validation failure
      const flagWithBadVariant = {
        name: 'test-flag',
        enabled: true,
        variant: {
          name: 'test-variant',
          enabled: true,
          payload: {
            type: 'invalid-type', // This should cause variant validation to fail
            value: 'test-value',
          },
        },
      };

      expect(isValidVariant(flagWithBadVariant.variant)).toBe(false);
      expect(isValidFeatureFlag(flagWithBadVariant)).toBe(false);
    });

    it('should handle defensive programming scenarios', () => {
      // Test with objects that have been tampered with
      const tamperedFlag = {
        name: 'test-flag',
        enabled: true,
        variant: {
          name: 'test-variant',
          enabled: true,
        },
      };

      // Simulate prototype pollution or property manipulation
      (tamperedFlag as any).__proto__.malicious = true;
      delete (tamperedFlag as any).enabled;
      (tamperedFlag as any).enabled = true; // Re-add it

      expect(isValidFeatureFlag(tamperedFlag)).toBe(true);
    });
  });

  describe('Performance and memory considerations', () => {
    it('should handle large payload values efficiently', () => {
      const largeValue = 'x'.repeat(10000); // 10KB string
      const largePayload = {
        type: 'string',
        value: largeValue,
      };

      const startTime = Date.now();
      const result = isValidVariantPayload(largePayload);
      const endTime = Date.now();

      expect(result).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle deeply nested objects gracefully', () => {
      // Create a deeply nested object to test stack overflow protection
      let deepObject: any = { type: 'string', value: 'test' };
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject, type: 'string', value: 'test' };
      }

      // Should not crash, just return false for invalid structure
      expect(() => isValidVariantPayload(deepObject)).not.toThrow();
    });
  });
});
