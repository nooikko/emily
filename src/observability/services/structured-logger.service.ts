import { ConsoleLogger, Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { LogContext } from '../types/telemetry.types';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

/**
 * Structured log entry
 */
export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: LogContext;
  readonly data?: Record<string, unknown>;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/**
 * Enhanced logging service with OpenTelemetry trace correlation and structured logging
 * Extends NestJS ConsoleLogger to maintain compatibility while adding observability features
 */
@Injectable()
export class StructuredLoggerService extends ConsoleLogger implements NestLoggerService {
  private readonly enableStructuredLogging: boolean;
  private readonly enableTraceCorrelation: boolean;
  private readonly additionalContext?: Partial<LogContext>;

  constructor(context?: string, additionalContext?: Partial<LogContext>) {
    super(context || 'StructuredLogger');
    this.enableStructuredLogging = process.env.OTEL_LOGS_STRUCTURED_ENABLED !== 'false';
    this.enableTraceCorrelation = process.env.OTEL_LOGS_TRACE_CORRELATION_ENABLED !== 'false';
    this.additionalContext = additionalContext;
  }

  /**
   * Creates a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLoggerService {
    return new StructuredLoggerService(this.context, {
      ...this.additionalContext,
      ...additionalContext,
    });
  }

  /**
   * Logs an error with structured format and trace correlation
   */
  logError(message: string, error?: Error | string, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(LogLevel.ERROR, message, context, undefined, typeof error === 'string' ? new Error(error) : error);
    } else {
      super.error(message, typeof error === 'string' ? error : error?.stack, this.context);
    }
  }

  /**
   * Logs a warning with structured format and trace correlation
   */
  logWarn(message: string, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(LogLevel.WARN, message, context);
    } else {
      super.warn(message, this.context);
    }
  }

  /**
   * Logs an info message with structured format and trace correlation
   */
  logInfo(message: string, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(LogLevel.INFO, message, context);
    } else {
      super.log(message, this.context);
    }
  }

  /**
   * Logs a debug message with structured format and trace correlation
   */
  logDebug(message: string, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(LogLevel.DEBUG, message, context);
    } else {
      super.debug(message, this.context);
    }
  }

  /**
   * Logs a verbose message with structured format and trace correlation
   */
  logVerbose(message: string, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(LogLevel.VERBOSE, message, context);
    } else {
      super.verbose(message, this.context);
    }
  }

  /**
   * Logs structured data with full context
   */
  logData(level: LogLevel, message: string, data: Record<string, unknown>, context?: LogContext): void {
    if (this.enableStructuredLogging) {
      this.logStructured(level, message, context, data);
    } else {
      const logMessage = `${message} ${JSON.stringify(data)}`;
      switch (level) {
        case LogLevel.ERROR:
          super.error(logMessage, '', this.context);
          break;
        case LogLevel.WARN:
          super.warn(logMessage, this.context);
          break;
        case LogLevel.DEBUG:
          super.debug(logMessage, this.context);
          break;
        case LogLevel.VERBOSE:
          super.verbose(logMessage, this.context);
          break;
        default:
          super.log(logMessage, this.context);
      }
    }
  }

  /**
   * Logs AI operation events with specific context
   */
  logAIOperation(operation: string, duration: number, success: boolean, metadata: Record<string, unknown> = {}, error?: Error): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `AI Operation: ${operation} ${success ? 'completed' : 'failed'} in ${duration}ms`;

    const context: LogContext = {
      operation,
      component: 'ai-system',
      metadata: {
        duration,
        success,
        ...metadata,
      },
    };

    if (this.enableStructuredLogging) {
      this.logStructured(level, message, context, undefined, error);
    } else if (error) {
      super.error(message, error.stack, this.context);
    } else {
      super.log(message, this.context);
    }
  }

  /**
   * Logs conversation events with thread context
   */
  logConversation(event: string, threadId: string, messageCount: number, metadata: Record<string, unknown> = {}): void {
    const message = `Conversation ${event}: Thread ${threadId} (${messageCount} messages)`;

    const context: LogContext = {
      threadId,
      conversationId: threadId,
      operation: 'conversation',
      component: 'conversation-system',
      metadata: {
        event,
        messageCount,
        ...metadata,
      },
    };

    this.logInfo(message, context);
  }

  /**
   * Logs memory operations with performance metrics
   */
  logMemoryOperation(operation: string, threadId: string, duration: number, success: boolean, metadata: Record<string, unknown> = {}): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    const message = `Memory ${operation}: Thread ${threadId} (${duration}ms)`;

    const context: LogContext = {
      threadId,
      operation: `memory-${operation}`,
      component: 'memory-system',
      metadata: {
        duration,
        success,
        ...metadata,
      },
    };

    if (level === LogLevel.INFO) {
      this.logInfo(message, context);
    } else {
      this.logWarn(message, context);
    }
  }

  /**
   * Creates the structured log entry with trace correlation
   */
  private logStructured(level: LogLevel, message: string, context?: LogContext, data?: Record<string, unknown>, error?: Error): void {
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.buildLogContext(context),
      data,
    };

    if (error) {
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
      (logEntry as { error?: typeof errorInfo }).error = errorInfo;
    }

    // Output as structured JSON
    console.log(JSON.stringify(logEntry, null, process.env.NODE_ENV === 'development' ? 2 : 0));

    // Also emit to OpenTelemetry logs if available
    this.emitToOtelLogs(logEntry);
  }

  /**
   * Builds the complete log context with trace correlation
   */
  private buildLogContext(userContext?: LogContext): LogContext {
    const mutableContext: Record<string, unknown> = {
      component: this.context,
      ...this.additionalContext,
      ...userContext,
    };

    // Add trace correlation if enabled
    if (this.enableTraceCorrelation) {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        mutableContext.traceId = spanContext.traceId;
        mutableContext.spanId = spanContext.spanId;
      }
    }

    return mutableContext as LogContext;
  }

  /**
   * Emits log entries to OpenTelemetry logs
   */
  private emitToOtelLogs(_logEntry: StructuredLogEntry): void {
    try {
      // This would emit to OTEL logs when the logs API is stable
      // For now, we rely on console output being captured by collectors
    } catch (_error) {
      // Silently ignore OTEL logging errors to prevent log loops
    }
  }
}
