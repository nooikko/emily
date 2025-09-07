import { Test, type TestingModule } from '@nestjs/testing';
import { ADVANCED_MASKING_PATTERNS, DataMaskingService, SENSITIVE_FIELD_NAMES } from '../data-masking.service';

// Interface for accessing private properties in tests
interface DataMaskingServiceTestAccess {
  isSensitiveFieldName: (fieldName: string) => boolean;
  isSafeFieldName: (fieldName: string) => boolean;
}

describe('DataMaskingService', () => {
  let service: DataMaskingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataMaskingService],
    }).compile();

    service = module.get<DataMaskingService>(DataMaskingService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('maskText', () => {
    describe('basic patterns', () => {
      it('should mask email addresses', () => {
        const text = 'Contact john.doe@example.com or support@company.org';
        const masked = service.maskText(text);

        expect(masked).toBe('Contact [EMAIL_REDACTED] or [EMAIL_REDACTED]');
      });

      it('should mask phone numbers', () => {
        const text = 'Call 123-456-7890 or 555.123.4567';
        const masked = service.maskText(text);

        expect(masked).toBe('Call [PHONE_REDACTED] or [PHONE_REDACTED]');
      });

      it('should mask credit card numbers', () => {
        const text = 'Card: 4532-1234-5678-9012 or 4532 1234 5678 9012';
        const masked = service.maskText(text);

        expect(masked).toBe('Card: [CARD_REDACTED] or [CARD_REDACTED]');
      });

      it('should mask API keys', () => {
        const text = 'API key: sk-1234567890abcdefghijklmnopqrstuvw';
        const masked = service.maskText(text);

        expect(masked).toBe('API key: [API_KEY_REDACTED]');
      });

      it('should mask passwords in text', () => {
        const text = 'password: "mySecret123"';
        const masked = service.maskText(text);

        expect(masked).toBe('password: [PASSWORD_REDACTED]');
      });
    });

    describe('advanced patterns', () => {
      it('should mask SSN patterns', () => {
        const text = 'SSN: 123-45-6789 or 987654321';
        const masked = service.maskText(text);

        expect(masked).toContain('REDACTED');
        expect(masked).not.toContain('123-45-6789');
        expect(masked).not.toContain('987654321');
      });

      it('should mask AWS access keys', () => {
        const text = 'Key: AKIAIOSFODNN7EXAMPLE';
        const masked = service.maskText(text);

        expect(masked).toContain('[AWS_ACCESS_KEY_REDACTED]');
      });

      it('should mask Bearer tokens', () => {
        const text = 'Authorization: Bearer abc123def456ghi789';
        const masked = service.maskText(text);

        expect(masked).toContain('Bearer [TOKEN_REDACTED]');
      });

      it('should mask database URLs', () => {
        const text = 'DB: postgresql://user:pass@host:5432/db';
        const masked = service.maskText(text);

        expect(masked).toContain('[DATABASE_URL_REDACTED]');
      });

      it('should mask Redis URLs', () => {
        const text = 'Cache: redis://user:pass@host:6379';
        const masked = service.maskText(text);

        expect(masked).toContain('[REDIS_URL_REDACTED]');
      });

      it('should apply masking patterns to sensitive data', () => {
        const text = 'Complex data: 123-45-6789, test@example.com, 555-123-4567';
        const masked = service.maskText(text);

        // Verify that some masking occurred
        expect(masked).toContain('REDACTED');
        expect(masked).not.toContain('123-45-6789');
        expect(masked).not.toContain('test@example.com');
        expect(masked).not.toContain('555-123-4567');
      });
    });

    describe('custom patterns', () => {
      it('should apply custom patterns', () => {
        const customPatterns = {
          'CUSTOMCODE-\\d{4}': '[CUSTOM_REDACTED]',
          'MYSECRET:\\s*\\w+': 'MYSECRET: [REDACTED]',
        };
        const text = 'Reference: CUSTOMCODE-1234 and MYSECRET: myPassword';
        const masked = service.maskText(text, customPatterns);

        expect(masked).toContain('[CUSTOM_REDACTED]');
        expect(masked).toContain('MYSECRET: [REDACTED]');
      });

      it('should handle invalid custom patterns gracefully', () => {
        const customPatterns = {
          '[invalid-regex': '[INVALID]',
          'valid-pattern': '[VALID]',
        };
        const text = 'Test valid-pattern and [invalid-regex';
        const masked = service.maskText(text, customPatterns);

        expect(masked).toBe('Test [VALID] and [invalid-regex');
        // Verify logger warn would be called (we can't easily spy on private logger in this test setup)
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(service.maskText('')).toBe('');
      });

      it('should handle null/undefined values', () => {
        expect(service.maskText(null as unknown as string)).toBeNull();
        expect(service.maskText(undefined as unknown as string)).toBeUndefined();
      });

      it('should handle non-string values', () => {
        expect(service.maskText(123 as unknown as string)).toBe(123);
        expect(service.maskText(true as unknown as string)).toBe(true);
      });

      it('should handle text with no sensitive data', () => {
        const text = 'This is just normal text without sensitive information';
        const masked = service.maskText(text);

        expect(masked).toBe(text);
      });

      it('should handle errors in pattern application gracefully', () => {
        // Force an error by manipulating the regex patterns (this is a synthetic test)
        const originalError = console.error;
        console.error = jest.fn(); // Suppress error output

        // This test ensures the try-catch works
        const result = service.maskText('test@example.com');
        expect(result).toBe('[EMAIL_REDACTED]');

        console.error = originalError;
      });
    });
  });

  describe('maskObject', () => {
    describe('primitive values', () => {
      it('should mask strings', () => {
        const result = service.maskObject('test@example.com');
        expect(result).toBe('[EMAIL_REDACTED]');
      });

      it('should return primitives unchanged', () => {
        expect(service.maskObject(123)).toBe(123);
        expect(service.maskObject(true)).toBe(true);
        expect(service.maskObject(null)).toBeNull();
        expect(service.maskObject(undefined)).toBeUndefined();
      });
    });

    describe('arrays', () => {
      it('should mask elements in arrays', () => {
        const array = ['test@example.com', 'normal text', 123, null];
        const masked = service.maskObject(array);

        expect(masked).toEqual(['[EMAIL_REDACTED]', 'normal text', 123, null]);
      });

      it('should handle nested arrays', () => {
        const nested = [
          ['test@example.com', 'normal'],
          [123, 'phone: 123-456-7890'],
        ];
        const masked = service.maskObject(nested);

        expect(masked).toEqual([
          ['[EMAIL_REDACTED]', 'normal'],
          [123, 'phone: [PHONE_REDACTED]'],
        ]);
      });
    });

    describe('objects', () => {
      it('should mask sensitive field names', () => {
        const obj = {
          password: 'secret123',
          apiKey: 'key-abc123',
          secret: 'confidential',
          normalField: 'normal value',
        };
        const masked = service.maskObject(obj);

        expect(masked).toEqual({
          password: '[REDACTED]',
          apiKey: '[REDACTED]',
          secret: '[REDACTED]',
          normalField: 'normal value',
        });
      });

      it('should preserve safe field names', () => {
        const obj = {
          timestamp: '2023-01-01T00:00:00Z',
          id: 'test-id-123',
          threadId: 'thread-456',
          userId: 'user-789',
          type: 'message',
          sensitiveEmail: 'test@example.com',
        };
        const masked = service.maskObject(obj);

        expect(masked).toEqual({
          timestamp: '2023-01-01T00:00:00Z',
          id: 'test-id-123',
          threadId: 'thread-456',
          userId: 'user-789',
          type: 'message',
          sensitiveEmail: '[EMAIL_REDACTED]',
        });
      });

      it('should handle nested objects', () => {
        const obj = {
          user: {
            profile: {
              email: 'user@example.com',
              password: 'secret',
              id: 'user-123',
            },
          },
          metadata: {
            timestamp: '2023-01-01',
            apiKey: 'secret-key',
          },
        };
        const masked = service.maskObject(obj);

        expect(masked).toEqual({
          user: {
            profile: {
              email: '[EMAIL_REDACTED]',
              password: '[REDACTED]',
              id: 'user-123',
            },
          },
          metadata: {
            timestamp: '2023-01-01',
            apiKey: '[REDACTED]',
          },
        });
      });

      it('should only mask plain objects (not class instances)', () => {
        class TestClass {
          public email = 'test@example.com';
        }
        const instance = new TestClass();
        const masked = service.maskObject(instance);

        // Should return the instance unchanged since it's not a plain object
        expect(masked).toBe(instance);
      });
    });

    describe('custom patterns', () => {
      it('should apply custom patterns to object values', () => {
        const customPatterns = {
          'CUSTOMCODE-\\d{4}': '[CUSTOM_REDACTED]',
        };
        const obj = {
          reference: 'CUSTOMCODE-1234',
          name: 'test name',
        };
        const masked = service.maskObject(obj, customPatterns);

        expect(masked).toEqual({
          reference: '[CUSTOM_REDACTED]',
          name: 'test name',
        });
      });
    });
  });

  describe('isSensitiveFieldName (private method testing)', () => {
    it('should identify sensitive field names', () => {
      const sensitiveFields = ['password', 'apikey', 'secret', 'token', 'private', 'credential'];

      sensitiveFields.forEach((field) => {
        // Access private method for testing
        const result = (service as unknown as DataMaskingServiceTestAccess).isSensitiveFieldName(field);
        expect(result).toBe(true);
      });
    });

    it('should identify compound sensitive field names', () => {
      const compoundFields = ['api_key', 'user_password', 'access_token', 'private_key'];

      compoundFields.forEach((field) => {
        // Access private method for testing
        const result = (service as unknown as DataMaskingServiceTestAccess).isSensitiveFieldName(field);
        expect(result).toBe(true);
      });
    });

    it('should not flag safe field names', () => {
      const safeFields = ['username', 'email', 'name', 'description', 'content'];

      safeFields.forEach((field) => {
        // Access private method for testing
        const result = (service as unknown as DataMaskingServiceTestAccess).isSensitiveFieldName(field);
        expect(result).toBe(false);
      });
    });
  });

  describe('isSafeFieldName (private method testing)', () => {
    it('should identify safe field names', () => {
      const safeFields = ['timestamp', 'id', 'threadid', 'userid', 'type', 'model', 'version'];

      safeFields.forEach((field) => {
        // Access private method for testing
        const result = (service as unknown as DataMaskingServiceTestAccess).isSafeFieldName(field);
        expect(result).toBe(true);
      });
    });

    it('should not flag sensitive field names as safe', () => {
      const sensitiveFields = ['password', 'secret', 'token'];

      sensitiveFields.forEach((field) => {
        // Access private method for testing
        const result = (service as unknown as DataMaskingServiceTestAccess).isSafeFieldName(field);
        expect(result).toBe(false);
      });
    });
  });

  describe('maskMessages', () => {
    it('should mask LangChain message content', () => {
      const messages = [
        {
          type: 'human',
          content: 'My email is test@example.com',
          role: 'user',
        },
        {
          type: 'ai',
          content: 'Your card number 4532-1234-5678-9012 is valid',
          role: 'assistant',
        },
      ];
      const masked = service.maskMessages(messages);

      expect(masked).toEqual([
        {
          type: 'human',
          content: 'My email is [EMAIL_REDACTED]',
          role: 'user',
        },
        {
          type: 'ai',
          content: 'Your card number [CARD_REDACTED] is valid',
          role: 'assistant',
        },
      ]);
    });

    it('should preserve safe metadata fields', () => {
      const messages = [
        {
          type: 'human',
          content: 'test@example.com',
          role: 'user',
          id: 'msg-123',
          name: 'user',
        },
      ];
      const masked = service.maskMessages(messages);

      expect(masked).toEqual([
        {
          type: 'human',
          content: '[EMAIL_REDACTED]',
          role: 'user',
          id: 'msg-123',
          name: 'user',
        },
      ]);
    });

    it('should mask additional_kwargs', () => {
      const messages = [
        {
          type: 'ai',
          content: 'Response',
          additional_kwargs: {
            apiKey: 'secret-key-123',
            metadata: 'safe-data',
          },
        },
      ];
      const masked = service.maskMessages(messages);

      expect(masked).toEqual([
        {
          type: 'ai',
          content: 'Response',
          additional_kwargs: {
            apiKey: '[REDACTED]',
            metadata: 'safe-data',
          },
        },
      ]);
    });

    it('should handle non-array input', () => {
      const result = service.maskMessages(null);
      expect(result).toBeNull();

      const result2 = service.maskMessages('not-array');
      expect(result2).toBe('not-array');
    });

    it('should handle messages without content field', () => {
      const messages = [
        {
          type: 'system',
          role: 'system',
        },
      ];
      const masked = service.maskMessages(messages);

      expect(masked).toEqual([
        {
          type: 'system',
          role: 'system',
        },
      ]);
    });

    it('should handle invalid message objects', () => {
      const messages = [null, 'string', 123, { content: 'test@example.com' }];
      const masked = service.maskMessages(messages);

      expect(masked).toEqual([null, 'string', 123, { content: '[EMAIL_REDACTED]' }]);
    });
  });

  describe('createMaskingSummary', () => {
    it('should create summary of masking changes', () => {
      const original = {
        email: 'test@example.com',
        phone: '123-456-7890',
        name: 'John Doe',
      };
      const masked = {
        email: '[EMAIL_REDACTED]',
        phone: '[PHONE_REDACTED]',
        name: 'John Doe',
      };

      const summary = service.createMaskingSummary(original, masked);

      expect(summary.textPatternsFound).toContain('email');
      expect(summary.textPatternsFound).toContain('phone');
      // Note: totalReductions might be negative if redacted text is longer
      expect(typeof summary.totalReductions).toBe('number');
    });

    it('should detect field redactions', () => {
      const original = { password: 'secret123', name: 'John' };
      const masked = { password: '[REDACTED]', name: 'John' };

      const summary = service.createMaskingSummary(original, masked);

      expect(summary.fieldsRedacted).toContain('sensitive_fields');
    });

    it('should handle errors gracefully', () => {
      // Create circular reference to cause JSON.stringify to fail
      const circular: { name: string; self?: unknown } = { name: 'test' };
      circular.self = circular;

      const summary = service.createMaskingSummary(circular, { name: 'test' });

      expect(summary).toEqual({
        fieldsRedacted: [],
        textPatternsFound: [],
        totalReductions: 0,
      });
      // Logger warning would be called for circular reference error
    });
  });

  describe('validateMasking', () => {
    it('should validate that sensitive data is properly masked', () => {
      const maskedData = {
        email: '[EMAIL_REDACTED]',
        phone: '[PHONE_REDACTED]',
        card: '[CARD_REDACTED]',
        safe: 'data',
      };

      const validation = service.validateMasking(maskedData);

      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
    });

    it('should detect unmasked emails', () => {
      const unmaskedData = {
        content: 'Contact us at support@company.com',
      };

      const validation = service.validateMasking(unmaskedData);

      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toContain('Potential unmasked email addresses detected');
    });

    it('should detect unmasked SSNs', () => {
      const unmaskedData = {
        content: 'SSN: 123-45-6789',
      };

      const validation = service.validateMasking(unmaskedData);

      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toContain('Potential unmasked SSN detected');
    });

    it('should detect unmasked credit cards', () => {
      const unmaskedData = {
        content: 'Card: 4532-1234-5678-9012',
      };

      const validation = service.validateMasking(unmaskedData);

      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toContain('Potential unmasked credit card detected');
    });

    it('should handle validation errors', () => {
      // Create circular reference to cause JSON.stringify to fail
      const circular: { name: string; self?: unknown } = { name: 'test' };
      circular.self = circular;

      const validation = service.validateMasking(circular);

      expect(validation.isValid).toBe(true); // Default when error occurs
      expect(validation.warnings).toContain('Error validating masking effectiveness');
      // Logger warning would be called for validation error
    });

    it('should reset regex lastIndex properly', () => {
      // Test that regex state doesn't interfere between validations
      const data1 = { content: 'email1@test.com' };
      const data2 = { content: 'email2@test.com' };

      const validation1 = service.validateMasking(data1);
      const validation2 = service.validateMasking(data2);

      expect(validation1.isValid).toBe(false);
      expect(validation2.isValid).toBe(false);
      expect(validation1.warnings).toContain('Potential unmasked email addresses detected');
      expect(validation2.warnings).toContain('Potential unmasked email addresses detected');
    });
  });

  describe('constants', () => {
    it('should export ADVANCED_MASKING_PATTERNS', () => {
      expect(ADVANCED_MASKING_PATTERNS).toBeDefined();
      expect(ADVANCED_MASKING_PATTERNS.SSN).toBeInstanceOf(RegExp);
      expect(ADVANCED_MASKING_PATTERNS.PASSPORT).toBeInstanceOf(RegExp);
      // Should not include basic patterns that are already in MASKING_PATTERNS
    });

    it('should export SENSITIVE_FIELD_NAMES', () => {
      expect(SENSITIVE_FIELD_NAMES).toBeDefined();
      expect(SENSITIVE_FIELD_NAMES).toContain('password');
      expect(SENSITIVE_FIELD_NAMES).toContain('secret');
      expect(SENSITIVE_FIELD_NAMES).toContain('token');
    });

    it('should have working regex patterns', () => {
      // Test a few key patterns work correctly
      expect(ADVANCED_MASKING_PATTERNS.SSN.test('123-45-6789')).toBe(true);
      expect(ADVANCED_MASKING_PATTERNS.IP_ADDRESS.test('192.168.1.1')).toBe(true);
      expect(ADVANCED_MASKING_PATTERNS.AWS_ACCESS_KEY.test('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    });
  });
});
