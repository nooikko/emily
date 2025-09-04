import { Injectable, Logger } from '@nestjs/common';
import { MASKING_PATTERNS } from '../config/langsmith.config';

/**
 * Advanced data masking patterns for sensitive information
 * These patterns cover common sensitive data types found in AI applications
 */
export const ADVANCED_MASKING_PATTERNS = {
  // Personal identifiers
  SSN: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  PASSPORT: /\b[A-Z]{1,2}\d{6,9}\b/g,
  DRIVER_LICENSE: /\b[A-Z]\d{7,8}\b/g,

  // Financial information
  BANK_ACCOUNT: /\b\d{8,17}\b/g,
  ROUTING_NUMBER: /\b\d{9}\b/g,
  IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,

  // Healthcare identifiers
  MEDICAL_RECORD: /\b(MRN|MR|MEDICAL)[:=\s]*\d{6,12}\b/gi,
  INSURANCE_ID: /\b(INS|INSURANCE|POLICY)[:=\s]*[A-Z0-9]{6,15}\b/gi,

  // Geographic data
  IP_ADDRESS: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  COORDINATES: /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g,

  // Organizational data
  EMPLOYEE_ID: /\b(EMP|EMPLOYEE|ID)[:=\s]*[A-Z0-9]{4,12}\b/gi,
  DEPARTMENT_CODE: /\b(DEPT|DEP)[:=\s]*[A-Z0-9]{2,8}\b/gi,

  // Technical identifiers
  AWS_ACCESS_KEY: /\bAKIA[0-9A-Z]{16}\b/g,
  AWS_SECRET_KEY: /\b[A-Za-z0-9/+=]{40}\b/g,
  JWT_TOKEN: /\beyJ[A-Za-z0-9_/+-]*\.eyJ[A-Za-z0-9_/+-]*\.[A-Za-z0-9_/+-]*/g,
  BEARER_TOKEN: /\bBearer\s+[A-Za-z0-9_/+=.-]+/gi,

  // Database connection strings
  DATABASE_URL: /\b(postgresql|mysql|mongodb):\/\/[^\s]+/gi,
  REDIS_URL: /\bredis:\/\/[^\s]+/gi,
} as const;

/**
 * Sensitive field names that should be automatically masked regardless of content
 */
export const SENSITIVE_FIELD_NAMES = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'key',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'private',
  'confidential',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
  'medical_record',
  'mrn',
  'insurance',
  'bank_account',
  'routing_number',
  'private_key',
  'public_key',
  'certificate',
  'x-api-key',
  'x-auth-token',
] as const;

/**
 * Data masking service for protecting sensitive information in traces
 *
 * This service provides comprehensive data masking capabilities for LangSmith traces,
 * protecting sensitive information while maintaining the utility of the data for
 * debugging and observability purposes.
 */
@Injectable()
export class DataMaskingService {
  private readonly logger = new Logger(DataMaskingService.name);

  /**
   * Masks sensitive data in text using comprehensive patterns
   */
  maskText(text: string, customPatterns?: Record<string, string>): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let maskedText = text;

    try {
      // Apply built-in basic patterns
      maskedText = maskedText.replace(MASKING_PATTERNS.EMAIL, '[EMAIL_REDACTED]');
      maskedText = maskedText.replace(MASKING_PATTERNS.PHONE, '[PHONE_REDACTED]');
      maskedText = maskedText.replace(MASKING_PATTERNS.CREDIT_CARD, '[CARD_REDACTED]');
      maskedText = maskedText.replace(MASKING_PATTERNS.API_KEY, '[API_KEY_REDACTED]');
      maskedText = maskedText.replace(MASKING_PATTERNS.PASSWORD, 'password: [PASSWORD_REDACTED]');

      // Apply advanced patterns
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.SSN, '[SSN_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.PASSPORT, '[PASSPORT_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.DRIVER_LICENSE, '[LICENSE_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.BANK_ACCOUNT, '[ACCOUNT_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.ROUTING_NUMBER, '[ROUTING_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.IBAN, '[IBAN_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.MEDICAL_RECORD, '[MRN_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.INSURANCE_ID, '[INSURANCE_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.IP_ADDRESS, '[IP_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.COORDINATES, '[COORDINATES_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.EMPLOYEE_ID, '[EMPLOYEE_ID_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.DEPARTMENT_CODE, '[DEPT_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.AWS_ACCESS_KEY, '[AWS_ACCESS_KEY_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.AWS_SECRET_KEY, '[AWS_SECRET_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.JWT_TOKEN, '[JWT_TOKEN_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.BEARER_TOKEN, 'Bearer [TOKEN_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.DATABASE_URL, '[DATABASE_URL_REDACTED]');
      maskedText = maskedText.replace(ADVANCED_MASKING_PATTERNS.REDIS_URL, '[REDIS_URL_REDACTED]');

      // Apply custom patterns if provided
      if (customPatterns) {
        Object.entries(customPatterns).forEach(([pattern, replacement]) => {
          try {
            const regex = new RegExp(pattern, 'gi');
            maskedText = maskedText.replace(regex, replacement);
          } catch (error) {
            this.logger.warn(`Invalid custom masking pattern: ${pattern}`, error);
          }
        });
      }
    } catch (error) {
      this.logger.error('Error applying text masking patterns', error);
      // Return partially masked text rather than original
    }

    return maskedText;
  }

  /**
   * Masks sensitive data in objects recursively with field-level masking
   */
  maskObject(obj: unknown, customPatterns?: Record<string, string>): unknown {
    if (!obj) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.maskText(obj, customPatterns);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskObject(item, customPatterns));
    }

    if (typeof obj === 'object' && obj !== null && obj.constructor === Object) {
      const masked: Record<string, unknown> = {};

      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        const lowerKey = key.toLowerCase();

        // Check if field name indicates sensitive data
        if (this.isSensitiveFieldName(lowerKey)) {
          masked[key] = '[REDACTED]';
          return;
        }

        // Skip masking for certain metadata keys that are safe
        if (this.isSafeFieldName(lowerKey)) {
          masked[key] = value;
          return;
        }

        // Recursively mask nested objects
        masked[key] = this.maskObject(value, customPatterns);
      });

      return masked;
    }

    return obj;
  }

  /**
   * Checks if a field name indicates sensitive data
   */
  private isSensitiveFieldName(fieldName: string): boolean {
    return SENSITIVE_FIELD_NAMES.some((sensitiveField) => fieldName.includes(sensitiveField.toLowerCase()));
  }

  /**
   * Checks if a field name is safe and shouldn't be masked
   */
  private isSafeFieldName(fieldName: string): boolean {
    const safeFields = [
      'timestamp',
      'id',
      'threadid',
      'userid',
      'messageid',
      'type',
      'role',
      'model',
      'provider',
      'version',
      'environment',
      'service',
      'method',
      'status',
      'duration',
      'count',
      'length',
      'score',
      'threshold',
      'limit',
      'available',
      'connected',
      'healthy',
      'enabled',
      'streaming',
    ];

    return safeFields.some((safeField) => fieldName === safeField);
  }

  /**
   * Masks sensitive data in LangChain messages while preserving structure
   */
  maskMessages(messages: unknown[] | unknown): unknown[] | unknown {
    if (!Array.isArray(messages)) {
      return messages;
    }

    return messages.map((message) => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      const maskedMessage = { ...message };

      // Mask content while preserving message structure
      if (maskedMessage.content && typeof maskedMessage.content === 'string') {
        maskedMessage.content = this.maskText(maskedMessage.content);
      }

      // Mask additional content fields if present
      if (maskedMessage.additional_kwargs) {
        maskedMessage.additional_kwargs = this.maskObject(maskedMessage.additional_kwargs);
      }

      // Keep safe metadata
      const safeFields = ['type', 'role', 'id', 'name'];
      Object.keys(maskedMessage).forEach((key) => {
        if (!safeFields.includes(key) && !['content', 'additional_kwargs'].includes(key)) {
          maskedMessage[key] = this.maskObject(maskedMessage[key]);
        }
      });

      return maskedMessage;
    });
  }

  /**
   * Creates a summary of what was masked for debugging purposes
   */
  createMaskingSummary(
    original: unknown,
    masked: unknown,
  ): {
    fieldsRedacted: string[];
    textPatternsFound: string[];
    totalReductions: number;
  } {
    const summary = {
      fieldsRedacted: [] as string[],
      textPatternsFound: [] as string[],
      totalReductions: 0,
    };

    try {
      const originalStr = JSON.stringify(original);
      const maskedStr = JSON.stringify(masked);

      summary.totalReductions = originalStr.length - maskedStr.length;

      // Identify which patterns were applied (simplified detection)
      if (maskedStr.includes('[EMAIL_REDACTED]')) {
        summary.textPatternsFound.push('email');
      }
      if (maskedStr.includes('[PHONE_REDACTED]')) {
        summary.textPatternsFound.push('phone');
      }
      if (maskedStr.includes('[CARD_REDACTED]')) {
        summary.textPatternsFound.push('credit_card');
      }
      if (maskedStr.includes('[API_KEY_REDACTED]')) {
        summary.textPatternsFound.push('api_key');
      }
      if (maskedStr.includes('[SSN_REDACTED]')) {
        summary.textPatternsFound.push('ssn');
      }
      if (maskedStr.includes('[REDACTED]')) {
        summary.fieldsRedacted.push('sensitive_fields');
      }
    } catch (error) {
      this.logger.warn('Error creating masking summary', error);
    }

    return summary;
  }

  /**
   * Validates masking effectiveness by checking for common sensitive patterns
   */
  validateMasking(maskedData: unknown): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let isValid = true;

    try {
      const dataStr = JSON.stringify(maskedData);

      // Check for patterns that should have been masked
      if (MASKING_PATTERNS.EMAIL.test(dataStr)) {
        warnings.push('Potential unmasked email addresses detected');
        isValid = false;
      }

      if (ADVANCED_MASKING_PATTERNS.SSN.test(dataStr)) {
        warnings.push('Potential unmasked SSN detected');
        isValid = false;
      }

      if (MASKING_PATTERNS.CREDIT_CARD.test(dataStr)) {
        warnings.push('Potential unmasked credit card detected');
        isValid = false;
      }

      // Reset regex lastIndex to avoid stateful behavior
      Object.values({ ...MASKING_PATTERNS, ...ADVANCED_MASKING_PATTERNS }).forEach((pattern) => {
        if (pattern.global) {
          pattern.lastIndex = 0;
        }
      });
    } catch (error) {
      warnings.push('Error validating masking effectiveness');
      this.logger.warn('Error validating masking', error);
    }

    return { isValid, warnings };
  }
}
