import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { UnifiedConfigService } from '../config/services/unified-config.service';
import { AIMetricsService } from './services/ai-metrics.service';
import { LangChainInstrumentationService } from './services/langchain-instrumentation.service';
import { StructuredLoggerService } from './services/structured-logger.service';
import { TelemetryService } from './services/telemetry.service';

/**
 * Global observability module that provides comprehensive telemetry capabilities
 *
 * This module includes:
 * - OpenTelemetry SDK initialization and management
 * - Structured logging with trace correlation
 * - LangChain operations instrumentation
 * - AI-specific metrics collection
 * - Custom decorators for tracing and metrics
 *
 * The module is marked as Global to make observability services available
 * throughout the application without explicit imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    TelemetryService,
    StructuredLoggerService,
    LangChainInstrumentationService,
    AIMetricsService,
    {
      provide: 'UnifiedConfigService',
      useExisting: UnifiedConfigService,
    },
  ],
  exports: [TelemetryService, StructuredLoggerService, LangChainInstrumentationService, AIMetricsService],
})
export class ObservabilityModule {}
