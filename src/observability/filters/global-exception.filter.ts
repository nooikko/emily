import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { StructuredLoggerService } from '../services/structured-logger.service';

/**
 * Global exception filter that catches all exceptions and logs them
 * with structured logging before returning appropriate error responses.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLoggerService(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract error message and details
    const errorResponse = this.getErrorResponse(exception, status, request);

    // Log the error with appropriate severity
    if (status >= 500) {
      this.logger.logError('Unhandled server error', exception as Error, {
        metadata: {
          status,
          path: request.url,
          method: request.method,
          body: request.body,
          query: request.query,
          headers: this.sanitizeHeaders(request.headers),
          correlationId: request.headers['x-correlation-id'] || 'unknown',
        },
      });
    } else if (status >= 400) {
      this.logger.logWarn('Client error occurred', {
        metadata: {
          error: errorResponse.message,
          status,
          path: request.url,
          method: request.method,
          query: request.query,
          correlationId: request.headers['x-correlation-id'] || 'unknown',
        },
      });
    }

    // Send response
    response.status(status).json(errorResponse);
  }

  private getErrorResponse(exception: unknown, status: number, request: Request): Record<string, unknown> {
    const timestamp = new Date().toISOString();
    const path = request.url;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      // Handle NestJS validation errors
      if (typeof response === 'object' && response !== null) {
        return {
          ...response,
          timestamp,
          path,
          correlationId: request.headers['x-correlation-id'] || 'unknown',
        };
      }

      return {
        statusCode: status,
        message: exception.message,
        timestamp,
        path,
        correlationId: request.headers['x-correlation-id'] || 'unknown',
      };
    }

    // Handle non-HTTP exceptions
    const error = exception as Error;
    return {
      statusCode: status,
      message: error?.message || 'Internal server error',
      error: status === 500 ? 'Internal Server Error' : 'Bad Request',
      timestamp,
      path,
      correlationId: request.headers['x-correlation-id'] || 'unknown',
    };
  }

  /**
   * Sanitize headers to remove sensitive information before logging
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'x-access-token'];

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
