import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Base error response DTO for consistent error formatting across all endpoints
 */
export class ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
    minimum: 100,
    maximum: 599,
  })
  @IsNumber()
  statusCode!: number;

  @ApiProperty({
    description: 'Error message or array of error messages',
    oneOf: [
      { type: 'string', example: 'Validation failed' },
      { type: 'array', items: { type: 'string' }, example: ['name must be a string', 'age must be a number'] },
    ],
  })
  message!: string | string[];

  @ApiPropertyOptional({
    description: 'Error type or category',
    example: 'Bad Request',
  })
  @IsString()
  @IsOptional()
  error?: string;

  @ApiProperty({
    description: 'Timestamp when the error occurred',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsString()
  timestamp!: string;

  @ApiProperty({
    description: 'API endpoint path where the error occurred',
    example: '/api/agent/chat',
  })
  @IsString()
  path!: string;

  @ApiPropertyOptional({
    description: 'Correlation ID for request tracing',
    example: 'req-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  correlationId?: string;
}

/**
 * Validation error details for form validation failures
 */
export class ValidationErrorDetailDto {
  @ApiProperty({
    description: 'Field name that failed validation',
    example: 'email',
  })
  @IsString()
  field!: string;

  @ApiProperty({
    description: 'Validation error message',
    example: 'email must be a valid email address',
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: 'Invalid value that was provided',
    example: 'invalid-email',
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'object' }, { type: 'array' }],
  })
  @IsOptional()
  value?: unknown;

  @ApiPropertyOptional({
    description: 'Constraint that was violated',
    example: 'isEmail',
  })
  @IsString()
  @IsOptional()
  constraint?: string;
}

/**
 * Extended validation error response DTO with detailed field-level errors
 */
export class ValidationErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'Array of validation error messages',
    type: [String],
    example: ['name must be a string', 'email must be a valid email address'],
  })
  @IsArray()
  @IsString({ each: true })
  declare message: string[];

  @ApiPropertyOptional({
    description: 'Detailed validation errors per field',
    type: [ValidationErrorDetailDto],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  details?: ValidationErrorDetailDto[];
}

/**
 * Common 400 Bad Request error response
 */
export class BadRequestErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
    enum: [400],
  })
  @IsNumber()
  declare statusCode: 400;

  @ApiProperty({
    description: 'Error type',
    example: 'Bad Request',
    enum: ['Bad Request'],
  })
  @IsString()
  declare error: 'Bad Request';
}

/**
 * Common 401 Unauthorized error response
 */
export class UnauthorizedErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 401,
    enum: [401],
  })
  @IsNumber()
  declare statusCode: 401;

  @ApiProperty({
    description: 'Error message',
    example: 'Unauthorized',
    enum: ['Unauthorized'],
  })
  @IsString()
  declare message: 'Unauthorized';

  @ApiProperty({
    description: 'Error type',
    example: 'Unauthorized',
    enum: ['Unauthorized'],
  })
  @IsString()
  declare error: 'Unauthorized';
}

/**
 * Common 403 Forbidden error response
 */
export class ForbiddenErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 403,
    enum: [403],
  })
  @IsNumber()
  declare statusCode: 403;

  @ApiProperty({
    description: 'Error message',
    example: 'Forbidden',
    enum: ['Forbidden'],
  })
  @IsString()
  declare message: 'Forbidden';

  @ApiProperty({
    description: 'Error type',
    example: 'Forbidden',
    enum: ['Forbidden'],
  })
  @IsString()
  declare error: 'Forbidden';
}

/**
 * Common 404 Not Found error response
 */
export class NotFoundErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 404,
    enum: [404],
  })
  @IsNumber()
  declare statusCode: 404;

  @ApiProperty({
    description: 'Error message',
    example: 'Not Found',
  })
  @IsString()
  declare message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Not Found',
    enum: ['Not Found'],
  })
  @IsString()
  declare error: 'Not Found';
}

/**
 * Common 409 Conflict error response
 */
export class ConflictErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 409,
    enum: [409],
  })
  @IsNumber()
  declare statusCode: 409;

  @ApiProperty({
    description: 'Error message',
    example: 'Resource already exists',
  })
  @IsString()
  declare message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Conflict',
    enum: ['Conflict'],
  })
  @IsString()
  declare error: 'Conflict';
}

/**
 * Common 422 Unprocessable Entity error response
 */
export class UnprocessableEntityErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 422,
    enum: [422],
  })
  @IsNumber()
  declare statusCode: 422;

  @ApiProperty({
    description: 'Error message',
    example: 'The request was well-formed but contains semantic errors',
  })
  @IsString()
  declare message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Unprocessable Entity',
    enum: ['Unprocessable Entity'],
  })
  @IsString()
  declare error: 'Unprocessable Entity';
}

/**
 * Common 500 Internal Server Error response
 */
export class InternalServerErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 500,
    enum: [500],
  })
  @IsNumber()
  declare statusCode: 500;

  @ApiProperty({
    description: 'Error message',
    example: 'Internal server error',
    enum: ['Internal server error'],
  })
  @IsString()
  declare message: 'Internal server error';

  @ApiProperty({
    description: 'Error type',
    example: 'Internal Server Error',
    enum: ['Internal Server Error'],
  })
  @IsString()
  declare error: 'Internal Server Error';
}

/**
 * Service unavailable error response for health checks
 */
export class ServiceUnavailableErrorDto extends ErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 503,
    enum: [503],
  })
  @IsNumber()
  declare statusCode: 503;

  @ApiProperty({
    description: 'Error message',
    example: 'Service not ready',
  })
  @IsString()
  declare message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Service Unavailable',
    enum: ['Service Unavailable'],
  })
  @IsString()
  declare error: 'Service Unavailable';
}
