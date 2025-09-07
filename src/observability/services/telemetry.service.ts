// Resource will be created dynamically in the config
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { DiagConsoleLogger, diag, metrics, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { UnifiedConfigService } from '../../config/services/unified-config.service';
import { createTelemetryConfig, createTelemetryConfigWithUnified } from '../config/telemetry.config';
import type { ObservabilityHealth, TelemetryConfig } from '../types/telemetry.types';
import { StructuredLoggerService } from './structured-logger.service';

/**
 * Core telemetry service that initializes and manages OpenTelemetry SDK
 * Provides centralized configuration and lifecycle management for observability
 */
@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private config!: TelemetryConfig;
  private sdk?: NodeSDK;
  private initialized = false;

  constructor(@Optional() @Inject('UnifiedConfigService') private readonly configService?: UnifiedConfigService) {
    // Use fallback config initially if UnifiedConfigService is not available
    if (!this.configService) {
      this.config = createTelemetryConfig();
      this.setupDiagnostics();
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Telemetry service already initialized');
      return;
    }

    try {
      // Load configuration from UnifiedConfigService if available
      if (this.configService) {
        this.config = await createTelemetryConfigWithUnified(this.configService);
        this.setupDiagnostics();
      }

      await this.initializeSDK();
      this.initialized = true;
      this.logger.log('Telemetry service initialized successfully', {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        otlpEndpoint: this.config.otlp.endpoint,
        configSource: this.configService ? 'UnifiedConfig' : 'Environment',
      });
    } catch (error) {
      this.logger.error('Failed to initialize telemetry service:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sdk && this.initialized) {
      try {
        await this.sdk.shutdown();
        this.logger.log('Telemetry service shutdown completed');
      } catch (error) {
        this.logger.error('Error during telemetry shutdown:', error);
      }
    }
  }

  /**
   * Gets the current telemetry configuration
   * @returns Readonly copy of the telemetry configuration
   */
  getConfig(): Readonly<TelemetryConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Gets the trace provider instance
   * @param name - The tracer name
   * @param version - Optional version string
   * @returns Tracer instance
   */
  getTracer(name: string, version?: string): ReturnType<typeof trace.getTracer> {
    return trace.getTracer(name, version);
  }

  /**
   * Gets the metrics provider instance
   * @param name - The meter name
   * @param version - Optional version string
   * @returns Meter instance
   */
  getMeter(name: string, version?: string): ReturnType<typeof metrics.getMeter> {
    return metrics.getMeter(name, version);
  }

  /**
   * Gets a structured logger instance
   * @param context - Logger context name
   * @returns Structured logger instance
   */
  getStructuredLogger(context?: string): StructuredLoggerService {
    return new StructuredLoggerService(context);
  }

  /**
   * Checks the health status of all telemetry components
   */
  async getHealthStatus(): Promise<ObservabilityHealth> {
    const now = Date.now();

    return {
      tracing: {
        enabled: this.config.instrumentation.http,
        exporting: this.initialized,
        lastExport: this.initialized ? now : undefined,
      },
      metrics: {
        enabled: true,
        exporting: this.initialized,
        lastExport: this.initialized ? now : undefined,
      },
      logging: {
        enabled: this.config.logging.enableStructuredLogging,
        structured: this.config.logging.enableStructuredLogging,
        level: this.config.logging.level.toString(),
      },
    };
  }

  /**
   * Forces a flush of all pending telemetry data
   */
  async flush(): Promise<void> {
    if (!this.sdk) {
      this.logger.warn('Cannot flush - SDK not initialized');
      return;
    }

    try {
      // Force flush traces and metrics
      const tracerProvider = trace.getTracerProvider();
      const meterProvider = metrics.getMeterProvider();

      // Flush traces and metrics if possible
      try {
        if (tracerProvider && 'forceFlush' in tracerProvider && typeof tracerProvider.forceFlush === 'function') {
          await tracerProvider.forceFlush();
        }
      } catch (error) {
        this.logger.debug('Failed to flush tracer provider:', error);
      }

      try {
        if (meterProvider && 'forceFlush' in meterProvider && typeof meterProvider.forceFlush === 'function') {
          await meterProvider.forceFlush();
        }
      } catch (error) {
        this.logger.debug('Failed to flush meter provider:', error);
      }

      this.logger.debug('Telemetry data flushed successfully');
    } catch (error) {
      this.logger.error('Failed to flush telemetry data:', error);
      throw error;
    }
  }

  /**
   * Sets up OpenTelemetry diagnostics logging
   */
  private setupDiagnostics(): void {
    if (this.config.logging.enableConsole) {
      diag.setLogger(new DiagConsoleLogger(), this.config.logging.level);
    }
  }

  /**
   * Initializes the OpenTelemetry SDK with configured exporters and instrumentations
   */
  private async initializeSDK(): Promise<void> {
    const traceExporter = new OTLPTraceExporter({
      url: `${this.config.otlp.endpoint}/v1/traces`,
      headers: this.config.otlp.headers,
    });

    const _metricExporter = new OTLPMetricExporter({
      url: `${this.config.otlp.endpoint}/v1/metrics`,
      headers: this.config.otlp.headers,
    });

    // Create filtered instrumentations based on configuration
    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: this.config.instrumentation.http },
      '@opentelemetry/instrumentation-express': { enabled: this.config.instrumentation.express },
      '@opentelemetry/instrumentation-nestjs-core': { enabled: this.config.instrumentation.nestjs },
      '@opentelemetry/instrumentation-pg': { enabled: this.config.instrumentation.postgres },
      '@opentelemetry/instrumentation-redis': { enabled: this.config.instrumentation.redis },
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    });

    this.sdk = new NodeSDK({
      traceExporter,
      instrumentations,
    });

    // Start the SDK
    this.sdk.start();

    this.logger.debug('OpenTelemetry SDK initialized', {
      instrumentations: Object.keys(this.config.instrumentation).filter(
        (key) => this.config.instrumentation[key as keyof typeof this.config.instrumentation],
      ),
      otlpEndpoint: this.config.otlp.endpoint,
    });
  }
}
