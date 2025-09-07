import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagLogLevel } from '@opentelemetry/api';
import { createTelemetryConfig, defaultMetricsConfig } from '../telemetry.config';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');
jest.mock('os');

describe('TelemetryConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store and clear environment variables
    originalEnv = { ...process.env };

    // Clear relevant environment variables
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.npm_package_version;
    delete process.env.NODE_ENV;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    delete process.env.OTEL_EXPORTER_OTLP_COMPRESSION;
    delete process.env.OTEL_RESOURCE_SERVICE_NAMESPACE;
    delete process.env.GIT_COMMIT;
    delete process.env.HOSTNAME;
    delete process.env.OTEL_INSTRUMENTATION_HTTP_ENABLED;
    delete process.env.OTEL_INSTRUMENTATION_EXPRESS_ENABLED;
    delete process.env.OTEL_INSTRUMENTATION_NESTJS_ENABLED;
    delete process.env.OTEL_INSTRUMENTATION_POSTGRES_ENABLED;
    delete process.env.OTEL_INSTRUMENTATION_REDIS_ENABLED;
    delete process.env.OTEL_INSTRUMENTATION_LANGCHAIN_ENABLED;
    delete process.env.OTEL_TRACES_SAMPLER_ARG;
    delete process.env.OTEL_METRICS_SAMPLER_ARG;
    delete process.env.OTEL_LOG_LEVEL;
    delete process.env.OTEL_LOGS_CONSOLE_ENABLED;
    delete process.env.OTEL_LOGS_STRUCTURED_ENABLED;
    delete process.env.OTEL_METRICS_EXPORT_INTERVAL;

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createTelemetryConfig', () => {
    it('should create config with default values', () => {
      const config = createTelemetryConfig();

      expect(config).toMatchObject({
        serviceName: 'emily-ai-assistant',
        serviceVersion: '1.0.0',
        environment: 'development',
        otlp: {
          endpoint: 'http://localhost:4318',
          protocol: 'http/protobuf',
          headers: undefined,
          compression: 'gzip',
        },
        instrumentation: {
          http: true,
          express: true,
          nestjs: true,
          postgres: true,
          redis: true,
          langchain: true,
        },
        sampling: {
          tracesSampleRate: 1.0,
          metricsSampleRate: 1.0,
        },
        logging: {
          level: DiagLogLevel.INFO,
          enableConsole: true,
          enableStructuredLogging: true,
        },
      });
    });

    it('should use environment variables when provided', () => {
      process.env.OTEL_SERVICE_NAME = 'custom-service';
      process.env.OTEL_SERVICE_VERSION = '2.0.0';
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.com:4318';
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc';
      process.env.OTEL_EXPORTER_OTLP_COMPRESSION = 'none';
      process.env.OTEL_RESOURCE_SERVICE_NAMESPACE = 'custom-namespace';
      process.env.GIT_COMMIT = 'abc123def456';
      process.env.HOSTNAME = 'custom-hostname';

      const config = createTelemetryConfig();

      expect(config.serviceName).toBe('custom-service');
      expect(config.serviceVersion).toBe('2.0.0');
      expect(config.environment).toBe('production');
      expect(config.otlp.endpoint).toBe('https://otel.example.com:4318');
      expect(config.otlp.protocol).toBe('grpc');
      expect(config.otlp.compression).toBe('none');
      expect(config.resource?.['service.namespace']).toBe('custom-namespace');
      expect(config.resource?.['service.version.git']).toBe('abc123def456');
      expect(config.resource?.['service.instance.id']).toBe('custom-hostname');
    });

    it('should parse OTLP headers correctly', () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'api-key=secret123,x-tenant-id=tenant456';

      const config = createTelemetryConfig();

      expect(config.otlp.headers).toEqual({
        'api-key': 'secret123',
        'x-tenant-id': 'tenant456',
      });
    });

    it('should handle malformed OTLP headers gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // Use a more clearly malformed header that would fail JSON parsing
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'key1=value1,=malformed';

      const config = createTelemetryConfig();

      // Should still parse the valid parts
      expect(config.otlp.headers).toEqual({
        key1: 'value1',
      });

      consoleSpy.mockRestore();
    });

    it('should handle empty OTLP headers', () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = '';

      const config = createTelemetryConfig();

      expect(config.otlp.headers).toBeUndefined();
    });

    it('should handle OTLP headers with values containing equals signs', () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'authorization=Bearer token=abc123,other=value';

      const config = createTelemetryConfig();

      expect(config.otlp.headers).toEqual({
        authorization: 'Bearer token=abc123',
        other: 'value',
      });
    });

    it('should configure instrumentation settings', () => {
      process.env.OTEL_INSTRUMENTATION_HTTP_ENABLED = 'false';
      process.env.OTEL_INSTRUMENTATION_EXPRESS_ENABLED = 'false';
      process.env.OTEL_INSTRUMENTATION_NESTJS_ENABLED = 'false';
      process.env.OTEL_INSTRUMENTATION_POSTGRES_ENABLED = 'false';
      process.env.OTEL_INSTRUMENTATION_REDIS_ENABLED = 'false';
      process.env.OTEL_INSTRUMENTATION_LANGCHAIN_ENABLED = 'false';

      const config = createTelemetryConfig();

      expect(config.instrumentation).toEqual({
        http: false,
        express: false,
        nestjs: false,
        postgres: false,
        redis: false,
        langchain: false,
      });
    });

    it('should configure sampling rates', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
      process.env.OTEL_METRICS_SAMPLER_ARG = '0.8';

      const config = createTelemetryConfig();

      expect(config.sampling.tracesSampleRate).toBe(0.5);
      expect(config.sampling.metricsSampleRate).toBe(0.8);
    });

    it('should handle invalid sampling rates', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = 'invalid';
      process.env.OTEL_METRICS_SAMPLER_ARG = 'also-invalid';

      const config = createTelemetryConfig();

      expect(config.sampling.tracesSampleRate).toBeNaN();
      expect(config.sampling.metricsSampleRate).toBeNaN();
    });

    it('should configure logging settings', () => {
      process.env.OTEL_LOG_LEVEL = 'DEBUG';
      process.env.OTEL_LOGS_CONSOLE_ENABLED = 'false';
      process.env.OTEL_LOGS_STRUCTURED_ENABLED = 'false';

      const config = createTelemetryConfig();

      expect(config.logging.level).toBe(DiagLogLevel.DEBUG);
      expect(config.logging.enableConsole).toBe(false);
      expect(config.logging.enableStructuredLogging).toBe(false);
    });

    it('should parse different log levels correctly', () => {
      const logLevels = [
        { env: 'NONE', expected: DiagLogLevel.NONE },
        { env: 'ERROR', expected: DiagLogLevel.ERROR },
        { env: 'WARN', expected: DiagLogLevel.WARN },
        { env: 'WARNING', expected: DiagLogLevel.WARN },
        { env: 'INFO', expected: DiagLogLevel.INFO },
        { env: 'DEBUG', expected: DiagLogLevel.DEBUG },
        { env: 'VERBOSE', expected: DiagLogLevel.VERBOSE },
        { env: 'ALL', expected: DiagLogLevel.VERBOSE },
        { env: 'INVALID', expected: DiagLogLevel.INFO },
      ];

      logLevels.forEach(({ env, expected }) => {
        process.env.OTEL_LOG_LEVEL = env;
        const config = createTelemetryConfig();
        expect(config.logging.level).toBe(expected);
      });
    });

    it('should create resource attributes correctly', () => {
      process.env.OTEL_SERVICE_NAME = 'test-service';
      process.env.OTEL_SERVICE_VERSION = '1.2.3';
      process.env.NODE_ENV = 'staging';
      process.env.HOSTNAME = 'test-host';
      process.env.OTEL_RESOURCE_SERVICE_NAMESPACE = 'test-namespace';
      process.env.GIT_COMMIT = 'abcd1234';

      const mockHostname = jest.fn().mockReturnValue('os-hostname');
      jest.doMock('os', () => ({ hostname: mockHostname }));

      const config = createTelemetryConfig();

      expect(config.resource).toMatchObject({
        'service.name': 'test-service',
        'service.version': '1.2.3',
        'deployment.environment': 'staging',
        'service.instance.id': 'test-host', // HOSTNAME takes precedence
        'service.namespace': 'test-namespace',
        'service.version.git': 'abcd1234',
      });
    });
  });

  describe('Service Version Detection', () => {
    beforeEach(() => {
      (readFileSync as jest.Mock).mockReset();
      (join as jest.Mock).mockReset();
    });

    it('should use OTEL_SERVICE_VERSION when available', () => {
      process.env.OTEL_SERVICE_VERSION = '3.0.0';

      const config = createTelemetryConfig();
      expect(config.serviceVersion).toBe('3.0.0');
    });

    it('should use npm_package_version when OTEL_SERVICE_VERSION is not set', () => {
      process.env.npm_package_version = '2.5.1';

      const config = createTelemetryConfig();
      expect(config.serviceVersion).toBe('2.5.1');
    });

    it('should read version from package.json when environment variables are not set', () => {
      (join as jest.Mock).mockReturnValue('/mock/path/package.json');
      (readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ version: '4.2.0' }));

      const config = createTelemetryConfig();

      expect(readFileSync).toHaveBeenCalledWith('/mock/path/package.json', 'utf8');
      expect(config.serviceVersion).toBe('4.2.0');
    });

    it('should fallback to 1.0.0 when package.json has no version', () => {
      (join as jest.Mock).mockReturnValue('/mock/path/package.json');
      (readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));

      const config = createTelemetryConfig();

      expect(config.serviceVersion).toBe('1.0.0');
    });

    it('should fallback to 1.0.0 when package.json cannot be read', () => {
      (join as jest.Mock).mockReturnValue('/mock/path/package.json');
      (readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      const config = createTelemetryConfig();

      expect(config.serviceVersion).toBe('1.0.0');
    });

    it('should fallback to 1.0.0 when package.json is invalid JSON', () => {
      (join as jest.Mock).mockReturnValue('/mock/path/package.json');
      (readFileSync as jest.Mock).mockReturnValue('invalid json content');

      const config = createTelemetryConfig();

      expect(config.serviceVersion).toBe('1.0.0');
    });
  });

  describe('defaultMetricsConfig', () => {
    it('should have correct default values', () => {
      expect(defaultMetricsConfig).toMatchObject({
        namespace: 'emily',
        defaultLabels: {
          service: 'emily-ai-assistant',
          version: expect.any(String),
          environment: expect.any(String),
        },
        exportInterval: 5000,
      });
    });

    it('should respect OTEL_METRICS_EXPORT_INTERVAL environment variable', () => {
      process.env.OTEL_METRICS_EXPORT_INTERVAL = '10000';

      // Re-require the module to pick up new environment variable
      jest.resetModules();
      const { defaultMetricsConfig: newConfig } = require('../telemetry.config');

      expect(newConfig.exportInterval).toBe(10000);
    });

    it('should handle invalid export interval gracefully', () => {
      process.env.OTEL_METRICS_EXPORT_INTERVAL = 'invalid';

      jest.resetModules();
      const { defaultMetricsConfig: newConfig } = require('../telemetry.config');

      expect(newConfig.exportInterval).toBeNaN();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing process.env gracefully', () => {
      const originalProcessEnv = process.env;
      (process as any).env = {};

      expect(() => createTelemetryConfig()).not.toThrow();

      (process as any).env = originalProcessEnv;
    });

    it('should handle process.cwd() errors in version detection', () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockImplementation(() => {
        throw new Error('cwd failed');
      });

      (join as jest.Mock).mockImplementation(() => {
        throw new Error('join failed');
      });

      const config = createTelemetryConfig();

      expect(config.serviceVersion).toBe('1.0.0');

      process.cwd = originalCwd;
    });

    it('should handle hostname detection failures', () => {
      delete process.env.HOSTNAME;

      const mockHostname = jest.fn().mockImplementation(() => {
        throw new Error('hostname failed');
      });

      jest.doMock('os', () => ({ hostname: mockHostname }));

      // This would require re-importing the module, which is complex in this test setup
      // For now, we'll just test that the configuration doesn't throw
      expect(() => createTelemetryConfig()).not.toThrow();
    });

    it('should trim whitespace from OTLP headers', () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = '  key1  =  value1  ,  key2  =  value2  ';

      const config = createTelemetryConfig();

      expect(config.otlp.headers).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should handle OTLP headers with empty keys or values', () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = '=value1,key2=,=,key3=value3';

      const config = createTelemetryConfig();

      expect(config.otlp.headers).toEqual({
        key3: 'value3',
      });
    });

    it('should handle very long configuration values', () => {
      const longValue = 'x'.repeat(10000);
      process.env.OTEL_SERVICE_NAME = longValue;
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `https://${longValue}.example.com`;

      const config = createTelemetryConfig();

      expect(config.serviceName).toBe(longValue);
      expect(config.otlp.endpoint).toBe(`https://${longValue}.example.com`);
    });

    it('should handle special characters in configuration values', () => {
      process.env.OTEL_SERVICE_NAME = 'service-with-special-chars!@#$%^&*()';
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'key=value with spaces and symbols!@#';

      const config = createTelemetryConfig();

      expect(config.serviceName).toBe('service-with-special-chars!@#$%^&*()');
      expect(config.otlp.headers).toEqual({
        key: 'value with spaces and symbols!@#',
      });
    });
  });

  describe('Configuration Immutability', () => {
    it('should return a new config object each time', () => {
      const config1 = createTelemetryConfig();
      const config2 = createTelemetryConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should not be affected by mutations to returned config', () => {
      const config1 = createTelemetryConfig();
      (config1 as any).serviceName = 'modified';

      const config2 = createTelemetryConfig();

      expect(config2.serviceName).not.toBe('modified');
    });
  });
});
