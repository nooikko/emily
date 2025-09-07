import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { StructuredLoggerService } from '../services/structured-logger.service';

/**
 * Global interceptor that logs all HTTP requests and responses
 * with correlation IDs for request tracking across the system.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new StructuredLoggerService(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Generate or extract correlation ID
    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    // Extract request details
    const { method, url, body, query, headers, ip } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const startTime = Date.now();

    // Log incoming request
    this.logger.logInfo('Incoming request', {
      metadata: {
        correlationId,
        method,
        url,
        query,
        body: this.sanitizeBody(body),
        ip,
        userAgent,
        headers: this.sanitizeHeaders(headers),
      },
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          const statusCode = response.statusCode;

          // Log successful response
          this.logger.logInfo('Request completed', {
            metadata: {
              correlationId,
              method,
              url,
              statusCode,
              responseTime,
              responseSize: JSON.stringify(data).length,
            },
          });

          // Log slow requests
          if (responseTime > 1000) {
            this.logger.logWarn('Slow request detected', {
              metadata: {
                correlationId,
                method,
                url,
                responseTime,
                threshold: 1000,
              },
            });
          }
        },
        error: (error) => {
          const endTime = Date.now();
          const responseTime = endTime - startTime;

          // Error logging is handled by GlobalExceptionFilter
          // but we still log the response time here
          this.logger.logError('Request failed', error, {
            metadata: {
              correlationId,
              method,
              url,
              responseTime,
            },
          });
        },
      }),
    );
  }

  /**
   * Sanitize request body to remove sensitive information
   */
  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object' || body === null) {
      return body;
    }

    // Handle arrays
    if (Array.isArray(body)) {
      return body.map((item) => this.sanitizeBody(item));
    }

    // Handle objects
    const sanitized = { ...body } as Record<string, unknown>;
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key', 'access_token', 'refresh_token', 'creditCard', 'ssn'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
      // Also check for nested fields
      const fieldLower = field.toLowerCase();
      for (const key in sanitized) {
        if (key.toLowerCase().includes(fieldLower)) {
          sanitized[key] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'x-access-token'];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
