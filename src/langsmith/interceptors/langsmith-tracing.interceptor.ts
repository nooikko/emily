import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { traceable } from 'langsmith/traceable';
import { firstValueFrom, Observable } from 'rxjs';
import { LangSmithService } from '../services/langsmith.service';

/**
 * LangSmithTracingInterceptor - Automatic tracing interceptor for NestJS
 *
 * This interceptor provides automatic tracing for all HTTP requests and method calls
 * in the NestJS application. It integrates with LangSmith's tracing system to provide
 * observability into application performance and behavior.
 *
 * Features:
 * - Automatic trace creation for HTTP requests
 * - Request/response metadata capture
 * - Error tracking and logging
 * - Performance monitoring (execution time)
 * - Sensitive data masking
 * - Integration with LangChain native tracing
 *
 * Usage:
 * - Apply globally for all routes: app.useGlobalInterceptors(new LangSmithTracingInterceptor(langsmithService))
 * - Apply to specific controllers: @UseInterceptors(LangSmithTracingInterceptor)
 * - Apply to specific methods: @UseInterceptors(LangSmithTracingInterceptor)
 */
@Injectable()
export class LangSmithTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LangSmithTracingInterceptor.name);

  constructor(private readonly langsmithService: LangSmithService) {}

  intercept<T = unknown>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    // Skip tracing if LangSmith is not enabled
    if (!this.langsmithService.isEnabled()) {
      return next.handle();
    }

    const startTime = performance.now();
    const _contextType = context.getType();
    const handler = context.getHandler();
    const className = context.getClass().name;
    const methodName = handler.name;

    // Create trace name
    const traceName = `${className}.${methodName}`;

    // Extract request information based on context type
    const metadata = this.extractContextMetadata(context, startTime);

    // Create traceable function wrapper
    const traceableFunction = traceable(
      async (_input: unknown) => {
        try {
          const result = await firstValueFrom(next.handle());
          return result;
        } catch (error) {
          // Log and re-throw the error so it's handled by the traceable wrapper
          this.logger.error(`Error in ${traceName}:`, error);
          throw error;
        }
      },
      {
        name: traceName,
        metadata: this.langsmithService.createMetadata(metadata as Record<string, string | number | boolean>),
        // Process inputs to mask sensitive data
        processInputs: (inputs) => this.langsmithService.maskSensitiveObject(inputs),
        // Process outputs to mask sensitive data
        processOutputs: (outputs) => this.langsmithService.maskSensitiveObject(outputs),
      },
    );

    // Execute the traceable function and return as Observable
    return new Observable((observer) => {
      traceableFunction({ metadata })
        .then((result) => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          this.logger.debug(`${traceName} completed`, {
            duration: `${duration.toFixed(2)}ms`,
            success: true,
          });

          if (result !== undefined) {
            observer.next(result);
          }
          observer.complete();
        })
        .catch((error) => {
          const endTime = performance.now();
          const duration = endTime - startTime;

          this.logger.error(`${traceName} failed`, {
            duration: `${duration.toFixed(2)}ms`,
            error: error.message,
          });

          observer.error(error);
        });
    });
  }

  /**
   * Extract metadata from execution context based on context type
   */
  private extractContextMetadata(context: ExecutionContext, startTime: number): Record<string, unknown> {
    const contextType = context.getType();
    const baseMetadata = {
      contextType,
      startTime,
      className: context.getClass().name,
      methodName: context.getHandler().name,
    };

    switch (contextType) {
      case 'http':
        return this.extractHttpMetadata(context, baseMetadata);
      case 'ws':
        return this.extractWebSocketMetadata(context, baseMetadata);
      case 'rpc':
        return this.extractRpcMetadata(context, baseMetadata);
      default:
        return baseMetadata;
    }
  }

  /**
   * Extract HTTP request metadata
   */
  private extractHttpMetadata(context: ExecutionContext, baseMetadata: Record<string, unknown>): Record<string, unknown> {
    try {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();

      return {
        ...baseMetadata,
        http: {
          method: request.method,
          url: request.url,
          path: request.route?.path,
          userAgent: request.get('user-agent'),
          contentType: request.get('content-type'),
          // Don't include headers that might contain sensitive info
          headers: this.filterSensitiveHeaders(request.headers),
          query: this.langsmithService.maskSensitiveObject(request.query),
          params: this.langsmithService.maskSensitiveObject(request.params),
          statusCode: response.statusCode,
          remoteAddress: request.ip || request.connection?.remoteAddress,
        },
      };
    } catch (error) {
      this.logger.warn('Failed to extract HTTP metadata:', error);
      return baseMetadata;
    }
  }

  /**
   * Extract WebSocket metadata
   */
  private extractWebSocketMetadata(context: ExecutionContext, baseMetadata: Record<string, unknown>): Record<string, unknown> {
    try {
      const client = context.switchToWs().getClient();
      const data = context.switchToWs().getData();

      return {
        ...baseMetadata,
        ws: {
          event: data?.event,
          clientId: client?.id,
          // Mask potentially sensitive WebSocket data
          data: this.langsmithService.maskSensitiveObject(data),
        },
      };
    } catch (error) {
      this.logger.warn('Failed to extract WebSocket metadata:', error);
      return baseMetadata;
    }
  }

  /**
   * Extract RPC metadata (for microservices)
   */
  private extractRpcMetadata(context: ExecutionContext, baseMetadata: Record<string, unknown>): Record<string, unknown> {
    try {
      const rpcContext = context.switchToRpc();
      const data = rpcContext.getData();

      return {
        ...baseMetadata,
        rpc: {
          pattern: data?.pattern,
          // Mask potentially sensitive RPC data
          data: this.langsmithService.maskSensitiveObject(data),
        },
      };
    } catch (error) {
      this.logger.warn('Failed to extract RPC metadata:', error);
      return baseMetadata;
    }
  }

  /**
   * Filter out sensitive headers from request headers
   */
  private filterSensitiveHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token', 'x-access-token', 'authentication'];

    const filteredHeaders: Record<string, unknown> = {};

    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        filteredHeaders[key] = '[REDACTED]';
      } else {
        filteredHeaders[key] = value;
      }
    });

    return filteredHeaders;
  }
}
