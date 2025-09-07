import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagLogLevel } from '@opentelemetry/api';
import { SEMRESATTRS_DEPLOYMENT_ENVIRONMENT, SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { UnifiedConfigService } from '../../config/services/unified-config.service';
import type { MetricsConfig, TelemetryConfig } from '../types/telemetry.types';

/**
 * Gets the service version from package.json or environment
 */
function getServiceVersion(): string {
  if (process.env.OTEL_SERVICE_VERSION) {
    return process.env.OTEL_SERVICE_VERSION;
  }

  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Creates the telemetry configuration from environment variables with proper type safety
 * This is used as a fallback when UnifiedConfigService is not available
 */
export function createTelemetryConfig(): TelemetryConfig {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'emily-ai-assistant';
  const serviceVersion = getServiceVersion();
  const environment = process.env.NODE_ENV || 'development';

  const config: TelemetryConfig = {
    serviceName,
    serviceVersion,
    environment,

    otlp: {
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
      protocol: (process.env.OTEL_EXPORTER_OTLP_PROTOCOL as 'http/protobuf' | 'grpc') || 'http/protobuf',
      headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      compression: (process.env.OTEL_EXPORTER_OTLP_COMPRESSION as 'gzip' | 'none') || 'gzip',
    },

    resource: {
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
      'service.instance.id': process.env.HOSTNAME || require('node:os').hostname(),
      'service.namespace': process.env.OTEL_RESOURCE_SERVICE_NAMESPACE || 'emily',
      // Add git commit hash if available
      ...(process.env.GIT_COMMIT && { 'service.version.git': process.env.GIT_COMMIT }),
    },

    instrumentation: {
      http: process.env.OTEL_INSTRUMENTATION_HTTP_ENABLED !== 'false',
      express: process.env.OTEL_INSTRUMENTATION_EXPRESS_ENABLED !== 'false',
      nestjs: process.env.OTEL_INSTRUMENTATION_NESTJS_ENABLED !== 'false',
      postgres: process.env.OTEL_INSTRUMENTATION_POSTGRES_ENABLED !== 'false',
      redis: process.env.OTEL_INSTRUMENTATION_REDIS_ENABLED !== 'false',
      langchain: process.env.OTEL_INSTRUMENTATION_LANGCHAIN_ENABLED !== 'false',
    },

    sampling: {
      tracesSampleRate: Number.parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
      metricsSampleRate: Number.parseFloat(process.env.OTEL_METRICS_SAMPLER_ARG || '1.0'),
    },

    logging: {
      level: parseLogLevel(process.env.OTEL_LOG_LEVEL || 'INFO'),
      enableConsole: process.env.OTEL_LOGS_CONSOLE_ENABLED !== 'false',
      enableStructuredLogging: process.env.OTEL_LOGS_STRUCTURED_ENABLED !== 'false',
    },
  };

  return config;
}

/**
 * Parses OTLP headers from environment variable with proper validation
 */
function parseOtlpHeaders(headersString?: string): Record<string, string> | undefined {
  if (!headersString?.trim()) {
    return undefined;
  }

  try {
    const headers: Record<string, string> = {};
    const pairs = headersString.split(',').filter((pair) => pair.trim());

    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      const value = valueParts.join('='); // Handle values with = in them

      if (key?.trim() && value?.trim()) {
        headers[key.trim()] = value.trim();
      }
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  } catch {
    console.warn('Failed to parse OTLP headers, using default configuration');
    return undefined;
  }
}

/**
 * Parses log level from string
 */
function parseLogLevel(level: string): DiagLogLevel {
  const upperLevel = level.toUpperCase();
  switch (upperLevel) {
    case 'NONE':
      return DiagLogLevel.NONE;
    case 'ERROR':
      return DiagLogLevel.ERROR;
    case 'WARN':
    case 'WARNING':
      return DiagLogLevel.WARN;
    case 'INFO':
      return DiagLogLevel.INFO;
    case 'DEBUG':
      return DiagLogLevel.DEBUG;
    case 'VERBOSE':
    case 'ALL':
      return DiagLogLevel.VERBOSE;
    default:
      return DiagLogLevel.INFO;
  }
}

/**
 * Creates telemetry configuration using UnifiedConfigService for centralized configuration
 */
export async function createTelemetryConfigWithUnified(configService: UnifiedConfigService): Promise<TelemetryConfig> {
  // Fetch all OTEL configuration from environment/Infisical
  const serviceName = (await configService.getConfig('OTEL_SERVICE_NAME', { defaultValue: 'emily-ai-assistant' })) || 'emily-ai-assistant';
  const serviceVersion = getServiceVersion();
  const environment = (await configService.getConfig('NODE_ENV', { defaultValue: 'development' })) || 'development';

  const config: TelemetryConfig = {
    serviceName,
    serviceVersion,
    environment,

    otlp: {
      endpoint: (await configService.getConfig('OTEL_EXPORTER_OTLP_ENDPOINT', { defaultValue: 'http://localhost:4318' })) || 'http://localhost:4318',
      protocol: ((await configService.getConfig('OTEL_EXPORTER_OTLP_PROTOCOL', { defaultValue: 'http/protobuf' })) || 'http/protobuf') as
        | 'http/protobuf'
        | 'grpc',
      headers: parseOtlpHeaders((await configService.getConfig('OTEL_EXPORTER_OTLP_HEADERS', { defaultValue: '' })) || ''),
      compression: ((await configService.getConfig('OTEL_EXPORTER_OTLP_COMPRESSION', { defaultValue: 'gzip' })) || 'gzip') as 'gzip' | 'none',
    },

    resource: {
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
      'service.instance.id': process.env.HOSTNAME || require('node:os').hostname(),
      'service.namespace': (await configService.getConfig('OTEL_RESOURCE_SERVICE_NAMESPACE', { defaultValue: 'emily' })) || 'emily',
      // Add git commit hash if available
      ...(process.env.GIT_COMMIT && { 'service.version.git': process.env.GIT_COMMIT }),
    },

    instrumentation: {
      http: ((await configService.getConfig('OTEL_INSTRUMENTATION_HTTP_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      express: ((await configService.getConfig('OTEL_INSTRUMENTATION_EXPRESS_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      nestjs: ((await configService.getConfig('OTEL_INSTRUMENTATION_NESTJS_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      postgres: ((await configService.getConfig('OTEL_INSTRUMENTATION_POSTGRES_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      redis: ((await configService.getConfig('OTEL_INSTRUMENTATION_REDIS_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      langchain: ((await configService.getConfig('OTEL_INSTRUMENTATION_LANGCHAIN_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
    },

    sampling: {
      tracesSampleRate: Number.parseFloat((await configService.getConfig('OTEL_TRACES_SAMPLER_ARG', { defaultValue: '1.0' })) || '1.0'),
      metricsSampleRate: Number.parseFloat((await configService.getConfig('OTEL_METRICS_SAMPLER_ARG', { defaultValue: '1.0' })) || '1.0'),
    },

    logging: {
      level: parseLogLevel((await configService.getConfig('OTEL_LOG_LEVEL', { defaultValue: 'INFO' })) || 'INFO'),
      enableConsole: ((await configService.getConfig('OTEL_LOGS_CONSOLE_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
      enableStructuredLogging: ((await configService.getConfig('OTEL_LOGS_STRUCTURED_ENABLED', { defaultValue: 'true' })) || 'true') === 'true',
    },
  };

  return config;
}

/**
 * Default metrics configuration with proper typing
 */
export const defaultMetricsConfig: MetricsConfig = {
  namespace: 'emily',
  defaultLabels: {
    service: 'emily-ai-assistant',
    version: getServiceVersion(),
    environment: process.env.NODE_ENV || 'development',
  },
  exportInterval: Number.parseInt(process.env.OTEL_METRICS_EXPORT_INTERVAL || '5000', 10),
} as const;
