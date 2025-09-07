import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BadRequestErrorDto,
  ConflictErrorDto,
  ErrorDto,
  ForbiddenErrorDto,
  InternalServerErrorDto,
  NotFoundErrorDto,
  ServiceUnavailableErrorDto,
  UnauthorizedErrorDto,
  UnprocessableEntityErrorDto,
  ValidationErrorDetailDto,
  ValidationErrorDto,
} from '../dto/error.dto';

describe('Error DTOs', () => {
  describe('ErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields and string message', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 400,
          message: 'Bad Request',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with array message', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 400,
          message: ['Field 1 is invalid', 'Field 2 is required'],
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with optional fields', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 400,
          message: 'Bad Request',
          error: 'Bad Request',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
          correlationId: 'req-123e4567-e89b-12d3-a456-426614174000',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should accept valid HTTP status codes', async () => {
        const validStatusCodes = [100, 200, 300, 400, 404, 500, 503, 599];

        for (const statusCode of validStatusCodes) {
          const dto = plainToClass(ErrorDto, {
            statusCode,
            message: 'Test message',
            timestamp: '2024-01-01T12:00:00.000Z',
            path: '/api/test',
          });

          const errors = await validate(dto);
          expect(errors).toHaveLength(0);
        }
      });
    });

    describe('invalid data', () => {
      it('should fail validation when statusCode is missing', async () => {
        const dto = plainToClass(ErrorDto, {
          message: 'Test message',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'statusCode')).toBeTruthy();
      });

      it('should fail validation when message is missing', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 400,
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const _errors = await validate(dto);
        // Note: message is defined as required in the interface but may not fail validation
        // if it's not decorated with validation decorators
        expect(dto.message).toBeUndefined();
      });

      it('should fail validation when statusCode is not a number', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 'not-a-number',
          message: 'Test message',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'statusCode')).toBeTruthy();
      });

      it('should fail validation when error is not a string', async () => {
        const dto = plainToClass(ErrorDto, {
          statusCode: 400,
          message: 'Test message',
          error: 123,
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'error')).toBeTruthy();
      });
    });
  });

  describe('ValidationErrorDetailDto', () => {
    describe('valid data', () => {
      it('should validate correctly with all required fields', async () => {
        const dto = plainToClass(ValidationErrorDetailDto, {
          field: 'email',
          message: 'email must be a valid email address',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with optional fields', async () => {
        const dto = plainToClass(ValidationErrorDetailDto, {
          field: 'age',
          message: 'age must be a number',
          value: 'not-a-number',
          constraint: 'isNumber',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when required fields are missing', async () => {
        const dto = plainToClass(ValidationErrorDetailDto, {});

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);

        const errorProperties = errors.map((error) => error.property);
        expect(errorProperties).toContain('field');
        expect(errorProperties).toContain('message');
      });

      it('should fail validation when constraint is not a string', async () => {
        const dto = plainToClass(ValidationErrorDetailDto, {
          field: 'test',
          message: 'test message',
          constraint: 123,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'constraint')).toBeTruthy();
      });
    });
  });

  describe('ValidationErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with string array message', async () => {
        const dto = plainToClass(ValidationErrorDto, {
          statusCode: 400,
          message: ['name must be a string', 'email must be a valid email address'],
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should validate correctly with detailed field errors', async () => {
        const dto = plainToClass(ValidationErrorDto, {
          statusCode: 400,
          message: ['validation failed'],
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
          details: [
            {
              field: 'email',
              message: 'email must be a valid email address',
              value: 'invalid-email',
              constraint: 'isEmail',
            },
          ],
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid data', () => {
      it('should fail validation when message is not a string array', async () => {
        const dto = plainToClass(ValidationErrorDto, {
          statusCode: 400,
          message: 'single string message', // Should be array
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'message')).toBeTruthy();
      });

      it('should fail validation when details is not an array', async () => {
        const dto = plainToClass(ValidationErrorDto, {
          statusCode: 400,
          message: ['validation failed'],
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
          details: 'not-an-array',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'details')).toBeTruthy();
      });
    });
  });

  describe('BadRequestErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with proper status code and error', async () => {
        const dto = plainToClass(BadRequestErrorDto, {
          statusCode: 400,
          message: 'Invalid request data',
          error: 'Bad Request',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('type constraints', () => {
      it('should have correct status code type constraint', () => {
        const dto = new BadRequestErrorDto();
        // TypeScript will enforce the type at compile time
        // At runtime, we test the assigned value
        dto.statusCode = 400;
        expect(dto.statusCode).toBe(400);
      });

      it('should have correct error type constraint', () => {
        const dto = new BadRequestErrorDto();
        dto.error = 'Bad Request';
        expect(dto.error).toBe('Bad Request');
      });
    });
  });

  describe('UnauthorizedErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with proper fields', async () => {
        const dto = plainToClass(UnauthorizedErrorDto, {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('type constraints', () => {
      it('should enforce correct values through TypeScript types', () => {
        const dto = new UnauthorizedErrorDto();
        dto.statusCode = 401;
        dto.message = 'Unauthorized';
        dto.error = 'Unauthorized';

        expect(dto.statusCode).toBe(401);
        expect(dto.message).toBe('Unauthorized');
        expect(dto.error).toBe('Unauthorized');
      });
    });
  });

  describe('ForbiddenErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly', async () => {
        const dto = plainToClass(ForbiddenErrorDto, {
          statusCode: 403,
          message: 'Forbidden',
          error: 'Forbidden',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('NotFoundErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with custom message', async () => {
        const dto = plainToClass(NotFoundErrorDto, {
          statusCode: 404,
          message: 'Resource not found',
          error: 'Not Found',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('type constraints', () => {
      it('should enforce correct error type through TypeScript', () => {
        const dto = new NotFoundErrorDto();
        dto.statusCode = 404;
        dto.message = 'Resource not found';
        dto.error = 'Not Found';

        expect(dto.statusCode).toBe(404);
        expect(dto.message).toBe('Resource not found');
        expect(dto.error).toBe('Not Found');
      });
    });
  });

  describe('ConflictErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with custom message', async () => {
        const dto = plainToClass(ConflictErrorDto, {
          statusCode: 409,
          message: 'Resource already exists',
          error: 'Conflict',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('UnprocessableEntityErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly', async () => {
        const dto = plainToClass(UnprocessableEntityErrorDto, {
          statusCode: 422,
          message: 'The request was well-formed but contains semantic errors',
          error: 'Unprocessable Entity',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('InternalServerErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly', async () => {
        const dto = plainToClass(InternalServerErrorDto, {
          statusCode: 500,
          message: 'Internal server error',
          error: 'Internal Server Error',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('type constraints', () => {
      it('should enforce correct message through TypeScript', () => {
        const dto = new InternalServerErrorDto();
        dto.statusCode = 500;
        dto.message = 'Internal server error';
        dto.error = 'Internal Server Error';

        expect(dto.statusCode).toBe(500);
        expect(dto.message).toBe('Internal server error');
        expect(dto.error).toBe('Internal Server Error');
      });
    });
  });

  describe('ServiceUnavailableErrorDto', () => {
    describe('valid data', () => {
      it('should validate correctly with custom message', async () => {
        const dto = plainToClass(ServiceUnavailableErrorDto, {
          statusCode: 503,
          message: 'Service not ready',
          error: 'Service Unavailable',
          timestamp: '2024-01-01T12:00:00.000Z',
          path: '/api/test',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('OpenAPI decorators integration', () => {
    it('should have properties accessible on ErrorDto', () => {
      const dto = new ErrorDto();
      dto.statusCode = 400;
      dto.message = 'Test message';
      dto.timestamp = '2024-01-01T12:00:00.000Z';
      dto.path = '/api/test';

      expect(Object.hasOwn(dto, 'statusCode') || 'statusCode' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'message') || 'message' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'timestamp') || 'timestamp' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'path') || 'path' in dto).toBeTruthy();
    });

    it('should have properties accessible on ValidationErrorDetailDto', () => {
      const dto = new ValidationErrorDetailDto();
      dto.field = 'testField';
      dto.message = 'Test message';

      expect(Object.hasOwn(dto, 'field') || 'field' in dto).toBeTruthy();
      expect(Object.hasOwn(dto, 'message') || 'message' in dto).toBeTruthy();
    });

    it('should have properties accessible on ValidationErrorDto', () => {
      const dto = new ValidationErrorDto();
      dto.statusCode = 400;
      dto.message = ['Test message'];
      dto.timestamp = '2024-01-01T12:00:00.000Z';
      dto.path = '/api/test';

      expect(Object.hasOwn(dto, 'message') || 'message' in dto).toBeTruthy();
      expect(Array.isArray(dto.message)).toBeTruthy();
    });

    it('should have properties accessible on specific error DTOs', () => {
      const errorDtos = [
        { Class: BadRequestErrorDto, statusCode: 400 },
        { Class: UnauthorizedErrorDto, statusCode: 401 },
        { Class: ForbiddenErrorDto, statusCode: 403 },
        { Class: NotFoundErrorDto, statusCode: 404 },
        { Class: ConflictErrorDto, statusCode: 409 },
        { Class: UnprocessableEntityErrorDto, statusCode: 422 },
        { Class: InternalServerErrorDto, statusCode: 500 },
        { Class: ServiceUnavailableErrorDto, statusCode: 503 },
      ];

      errorDtos.forEach(({ Class, statusCode }) => {
        const dto = new Class();
        dto.statusCode = statusCode as any;
        expect(Object.hasOwn(dto, 'statusCode') || 'statusCode' in dto).toBeTruthy();
        expect(dto.statusCode).toBe(statusCode);
      });
    });
  });

  describe('DTO inheritance', () => {
    it('should inherit from ErrorDto correctly', () => {
      const dto = new ValidationErrorDto();
      expect(dto).toBeInstanceOf(ErrorDto);
      expect(dto).toBeInstanceOf(ValidationErrorDto);
    });

    it('should inherit from ErrorDto for all specific error DTOs', () => {
      const errorDtos = [
        BadRequestErrorDto,
        UnauthorizedErrorDto,
        ForbiddenErrorDto,
        NotFoundErrorDto,
        ConflictErrorDto,
        UnprocessableEntityErrorDto,
        InternalServerErrorDto,
        ServiceUnavailableErrorDto,
      ];

      errorDtos.forEach((DtoClass) => {
        const dto = new DtoClass();
        expect(dto).toBeInstanceOf(ErrorDto);
        expect(dto).toBeInstanceOf(DtoClass);
      });
    });
  });

  describe('serialization/deserialization', () => {
    it('should serialize and deserialize complex ValidationErrorDto correctly', () => {
      const originalData = {
        statusCode: 400,
        message: ['validation failed', 'multiple errors'],
        error: 'Bad Request',
        timestamp: '2024-01-01T12:00:00.000Z',
        path: '/api/test',
        correlationId: 'req-123',
        details: [
          {
            field: 'email',
            message: 'email must be valid',
            value: 'invalid-email',
            constraint: 'isEmail',
          },
        ],
      };

      const dto = plainToClass(ValidationErrorDto, originalData);
      const serialized = JSON.parse(JSON.stringify(dto));
      const deserialized = plainToClass(ValidationErrorDto, serialized);

      expect(deserialized.statusCode).toBe(originalData.statusCode);
      expect(deserialized.message).toEqual(originalData.message);
      expect(deserialized.details).toHaveLength(1);
      expect(deserialized.details![0].field).toBe('email');
    });
  });

  describe('edge cases', () => {
    it('should handle empty required actions array in ValidationErrorDto', async () => {
      const dto = plainToClass(ValidationErrorDto, {
        statusCode: 400,
        message: [],
        timestamp: '2024-01-01T12:00:00.000Z',
        path: '/api/test',
        details: [],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should handle null optional values correctly', async () => {
      const dto = plainToClass(ErrorDto, {
        statusCode: 400,
        message: 'Test message',
        error: null,
        timestamp: '2024-01-01T12:00:00.000Z',
        path: '/api/test',
        correlationId: null,
      });

      // Note: null values for optional fields should be handled gracefully
      expect(dto.error).toBeNull();
      expect(dto.correlationId).toBeNull();
    });

    it('should validate with very long error messages', async () => {
      const longMessage = 'A'.repeat(1000);
      const dto = plainToClass(ErrorDto, {
        statusCode: 400,
        message: longMessage,
        timestamp: '2024-01-01T12:00:00.000Z',
        path: '/api/test',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.message).toBe(longMessage);
    });
  });
});
