import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { createTelemetryConfig } from '../../config/telemetry.config';
import { StructuredLoggerService } from '../structured-logger.service';
import { TelemetryService } from '../telemetry.service';

// Mock OpenTelemetry modules
jest.mock('@opentelemetry/api', () => ({
  diag: {
    setLogger: jest.fn(),
  },
  trace: {
    getTracer: jest.fn(),
    getTracerProvider: jest.fn(),
  },
  metrics: {
    getMeter: jest.fn(),
    getMeterProvider: jest.fn(),
  },
  DiagConsoleLogger: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}));

jest.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: jest.fn(),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn(),
}));

jest.mock('../../config/telemetry.config', () => ({
  createTelemetryConfig: jest.fn(),
  defaultMetricsConfig: {
    namespace: 'emily',
    defaultLabels: {},
    exportInterval: 5000,
  },
}));

jest.mock('../structured-logger.service');

describe('TelemetryService', () => {
  let service: TelemetryService;
  let mockNodeSDK: jest.Mocked<NodeSDK>;
  let mockTracer: jest.MockedObject<ReturnType<typeof trace.getTracer>>;
  let mockMeter: jest.MockedObject<ReturnType<typeof metrics.getMeter>>;
  let mockTracerProvider: any;
  let mockMeterProvider: any;

  const mockConfig = {
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    environment: 'test',
    otlp: {
      endpoint: 'http://localhost:4318',
      protocol: 'http/protobuf' as const,
      headers: { 'api-key': 'test-key' },
      compression: 'gzip' as const,
    },
    resource: {
      'service.name': 'test-service',
      'service.version': '1.0.0',
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
      level: 1,
      enableConsole: true,
      enableStructuredLogging: true,
    },
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock SDK instance
    mockNodeSDK = {
      start: jest.fn(),
      shutdown: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock tracer and meter
    mockTracer = { startActiveSpan: jest.fn() } as any;
    mockMeter = { createCounter: jest.fn() } as any;

    // Mock providers
    mockTracerProvider = {
      forceFlush: jest.fn().mockResolvedValue(undefined),
    };
    mockMeterProvider = {
      forceFlush: jest.fn().mockResolvedValue(undefined),
    };

    // Setup mocks
    (NodeSDK as jest.Mock).mockImplementation(() => mockNodeSDK);
    (createTelemetryConfig as jest.Mock).mockReturnValue(mockConfig);
    (trace.getTracer as jest.Mock).mockReturnValue(mockTracer);
    (metrics.getMeter as jest.Mock).mockReturnValue(mockMeter);
    (trace.getTracerProvider as jest.Mock).mockReturnValue(mockTracerProvider);
    (metrics.getMeterProvider as jest.Mock).mockReturnValue(mockMeterProvider);

    const module: TestingModule = await Test.createTestingModule({
      providers: [TelemetryService],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction and Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create telemetry configuration on construction', () => {
      expect(createTelemetryConfig).toHaveBeenCalled();
    });

    it('should initialize SDK on module init', async () => {
      await service.onModuleInit();

      expect(NodeSDK).toHaveBeenCalledWith({
        traceExporter: expect.any(Object),
        instrumentations: expect.any(Array),
      });
      expect(mockNodeSDK.start).toHaveBeenCalled();
    });

    it('should not initialize SDK twice', async () => {
      await service.onModuleInit();
      await service.onModuleInit();

      expect(mockNodeSDK.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('Configuration Management', () => {
    it('should return readonly configuration', () => {
      const config = service.getConfig();

      expect(config).toEqual(mockConfig);
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('should return deep frozen configuration to prevent mutations', () => {
      const config = service.getConfig();

      expect(() => {
        (config as any).serviceName = 'modified';
      }).toThrow();
    });
  });

  describe('Tracer and Meter Access', () => {
    it('should return tracer with correct name and version', () => {
      const tracer = service.getTracer('test-tracer', '2.0.0');

      expect(trace.getTracer).toHaveBeenCalledWith('test-tracer', '2.0.0');
      expect(tracer).toBe(mockTracer);
    });

    it('should return tracer with name only when version is not provided', () => {
      const tracer = service.getTracer('test-tracer');

      expect(trace.getTracer).toHaveBeenCalledWith('test-tracer', undefined);
      expect(tracer).toBe(mockTracer);
    });

    it('should return meter with correct name and version', () => {
      const meter = service.getMeter('test-meter', '2.0.0');

      expect(metrics.getMeter).toHaveBeenCalledWith('test-meter', '2.0.0');
      expect(meter).toBe(mockMeter);
    });

    it('should return meter with name only when version is not provided', () => {
      const meter = service.getMeter('test-meter');

      expect(metrics.getMeter).toHaveBeenCalledWith('test-meter', undefined);
      expect(meter).toBe(mockMeter);
    });
  });

  describe('Structured Logger Creation', () => {
    it('should create structured logger with context', () => {
      const logger = service.getStructuredLogger('test-context');

      expect(StructuredLoggerService).toHaveBeenCalledWith('test-context');
      expect(logger).toBeInstanceOf(StructuredLoggerService);
    });

    it('should create structured logger without context', () => {
      const logger = service.getStructuredLogger();

      expect(StructuredLoggerService).toHaveBeenCalledWith(undefined);
      expect(logger).toBeInstanceOf(StructuredLoggerService);
    });
  });

  describe('Health Status', () => {
    it('should return health status when not initialized', async () => {
      const health = await service.getHealthStatus();

      expect(health).toEqual({
        tracing: {
          enabled: true,
          exporting: false,
          lastExport: undefined,
        },
        metrics: {
          enabled: true,
          exporting: false,
          lastExport: undefined,
        },
        logging: {
          enabled: true,
          structured: true,
          level: '1',
        },
      });
    });

    it('should return health status when initialized', async () => {
      await service.onModuleInit();
      const health = await service.getHealthStatus();

      expect(health.tracing.exporting).toBe(true);
      expect(health.metrics.exporting).toBe(true);
      expect(health.tracing.lastExport).toBeGreaterThan(0);
      expect(health.metrics.lastExport).toBeGreaterThan(0);
    });
  });

  describe('Flush Operations', () => {
    it('should warn when trying to flush without SDK initialization', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.flush();

      expect(loggerSpy).toHaveBeenCalledWith('Cannot flush - SDK not initialized');
    });

    it('should flush tracer and meter providers successfully', async () => {
      await service.onModuleInit();

      await service.flush();

      expect(mockTracerProvider.forceFlush).toHaveBeenCalled();
      expect(mockMeterProvider.forceFlush).toHaveBeenCalled();
    });

    it('should handle providers without forceFlush method', async () => {
      await service.onModuleInit();
      (trace.getTracerProvider as jest.Mock).mockReturnValue({});
      (metrics.getMeterProvider as jest.Mock).mockReturnValue({});

      await expect(service.flush()).resolves.not.toThrow();
    });

    it('should throw error when flush fails critically', async () => {
      await service.onModuleInit();
      (trace.getTracerProvider as jest.Mock).mockImplementation(() => {
        throw new Error('Critical flush error');
      });

      await expect(service.flush()).rejects.toThrow('Critical flush error');
    });
  });

  describe('Shutdown Operations', () => {
    it('should not shutdown when not initialized', async () => {
      await service.onModuleDestroy();

      expect(mockNodeSDK.shutdown).not.toHaveBeenCalled();
    });

    it('should shutdown SDK when initialized', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockNodeSDK.shutdown).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing OTLP configuration', () => {
      const configWithoutOTLP = {
        ...mockConfig,
        otlp: {
          ...mockConfig.otlp,
          headers: undefined,
        },
      };
      (createTelemetryConfig as jest.Mock).mockReturnValue(configWithoutOTLP);

      // Create new service instance
      const service2 = new TelemetryService();
      expect(service2).toBeDefined();
    });

    it('should handle disabled instrumentation options', async () => {
      const configWithDisabledInstrumentation = {
        ...mockConfig,
        instrumentation: {
          http: false,
          express: false,
          nestjs: false,
          postgres: false,
          redis: false,
          langchain: false,
        },
      };
      (createTelemetryConfig as jest.Mock).mockReturnValue(configWithDisabledInstrumentation);

      const service2 = new TelemetryService();
      await service2.onModuleInit();

      expect(NodeSDK).toHaveBeenCalled();
    });
  });
});
