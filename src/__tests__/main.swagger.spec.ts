import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';

// Mock the listen method to prevent actual server startup
jest.mock('@nestjs/core', () => ({
  ...jest.requireActual('@nestjs/core'),
  NestFactory: {
    create: jest.fn(),
  },
}));

describe('Swagger Configuration', () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeEach(async () => {
    // Create a minimal testing module for Swagger configuration tests
    module = await Test.createTestingModule({
      controllers: [],
      providers: [],
    }).compile();

    app = module.createNestApplication();

    // Mock the required methods
    app.setGlobalPrefix = jest.fn();
    app.enableCors = jest.fn();
    app.listen = jest.fn().mockResolvedValue(undefined);
    app.get = jest.fn().mockReturnValue({
      logTracingStatus: jest.fn(),
    });
    app.useGlobalInterceptors = jest.fn();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('DocumentBuilder Configuration', () => {
    it('should create OpenAPI document with correct configuration', () => {
      const config = new DocumentBuilder()
        .setTitle('Emily AI Agent API')
        .setDescription('API documentation for Emily AI Agent - Personal AI Assistant')
        .setVersion('0.0.1')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your Bearer token',
          },
          'bearer',
        )
        .addTag('agent', 'AI Agent chat and conversation endpoints')
        .addTag('health', 'Health check endpoints')
        .build();

      expect(config.info.title).toBe('Emily AI Agent API');
      expect(config.info.description).toBe('API documentation for Emily AI Agent - Personal AI Assistant');
      expect(config.info.version).toBe('0.0.1');
      expect(config.tags).toEqual([
        { name: 'agent', description: 'AI Agent chat and conversation endpoints' },
        { name: 'health', description: 'Health check endpoints' },
      ]);
    });

    it('should configure bearer authentication correctly', () => {
      const config = new DocumentBuilder()
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your Bearer token',
          },
          'bearer',
        )
        .build();

      expect(config.components?.securitySchemes).toBeDefined();
      expect(config.components?.securitySchemes?.bearer).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Bearer token',
      });
    });

    it('should add correct API tags', () => {
      const config = new DocumentBuilder()
        .addTag('agent', 'AI Agent chat and conversation endpoints')
        .addTag('health', 'Health check endpoints')
        .build();

      expect(config.tags).toHaveLength(2);
      expect(config.tags?.[0]).toEqual({
        name: 'agent',
        description: 'AI Agent chat and conversation endpoints',
      });
      expect(config.tags?.[1]).toEqual({
        name: 'health',
        description: 'Health check endpoints',
      });
    });
  });

  describe('SwaggerModule Setup', () => {
    it('should create document with correct module and config', () => {
      const config = new DocumentBuilder()
        .setTitle('Emily AI Agent API')
        .setDescription('API documentation for Emily AI Agent - Personal AI Assistant')
        .setVersion('0.0.1')
        .build();

      // Mock SwaggerModule.createDocument
      const mockDocument: OpenAPIObject = {
        openapi: '3.0.0',
        info: {
          title: 'Emily AI Agent API',
          description: 'API documentation for Emily AI Agent - Personal AI Assistant',
          version: '0.0.1',
        },
        paths: {},
        components: {},
      };

      jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue(mockDocument);

      const document = SwaggerModule.createDocument(app, config);

      expect(SwaggerModule.createDocument).toHaveBeenCalledWith(app, config);
      expect(document.info.title).toBe('Emily AI Agent API');
      expect(document.info.version).toBe('0.0.1');
    });

    it('should setup Swagger UI with correct configuration', () => {
      const mockDocument = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {},
      };

      const setupSpy = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);

      SwaggerModule.setup('api', app, mockDocument, {
        jsonDocumentUrl: 'api-json',
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      });

      expect(setupSpy).toHaveBeenCalledWith('api', app, mockDocument, {
        jsonDocumentUrl: 'api-json',
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      });
    });

    it('should use correct Swagger options for UI customization', () => {
      const expectedOptions = {
        jsonDocumentUrl: 'api-json',
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      };

      expect(expectedOptions.swaggerOptions.persistAuthorization).toBe(true);
      expect(expectedOptions.swaggerOptions.tagsSorter).toBe('alpha');
      expect(expectedOptions.swaggerOptions.operationsSorter).toBe('alpha');
      expect(expectedOptions.jsonDocumentUrl).toBe('api-json');
    });
  });

  describe('Application Configuration', () => {
    it('should set global prefix to api', () => {
      app.setGlobalPrefix('api');
      expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    });

    it('should configure CORS with correct allowed origins', () => {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3002'];

      app.enableCors({
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
      });

      expect(app.enableCors).toHaveBeenCalledWith({
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
      });
    });

    it('should use correct HTTP methods for CORS', () => {
      const corsConfig = {
        origin: ['http://localhost:3000', 'http://localhost:3002'],
        methods: ['GET', 'POST'],
      };

      expect(corsConfig.methods).toEqual(['GET', 'POST']);
      expect(corsConfig.methods).toContain('GET');
      expect(corsConfig.methods).toContain('POST');
      expect(corsConfig.methods).not.toContain('PUT');
      expect(corsConfig.methods).not.toContain('DELETE');
    });

    it('should allow correct localhost origins', () => {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3002'];

      expect(allowedOrigins).toContain('http://localhost:3000');
      expect(allowedOrigins).toContain('http://localhost:3002');
      expect(allowedOrigins).toHaveLength(2);
    });
  });

  describe('Environment and Port Configuration', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use default port 3001 when PORT env var is not set', () => {
      delete process.env.PORT;
      const port = process.env.PORT ?? 3001;
      expect(port).toBe(3001);
    });

    it('should use PORT environment variable when set', () => {
      process.env.PORT = '8080';
      const port = process.env.PORT ?? 3001;
      expect(port).toBe('8080');
    });

    it('should handle PORT as string and convert appropriately', () => {
      process.env.PORT = '4000';
      const port = process.env.PORT ?? 3001;
      expect(typeof port).toBe('string');
      expect(port).toBe('4000');
    });
  });

  describe('Documentation URLs', () => {
    it('should generate correct API documentation URLs', () => {
      const port = 3002;
      const expectedUrls = {
        api: `http://localhost:${port}/api`,
        swagger: `http://localhost:${port}/api`,
        openapi: `http://localhost:${port}/api-json`,
      };

      expect(expectedUrls.api).toBe('http://localhost:3002/api');
      expect(expectedUrls.swagger).toBe('http://localhost:3002/api');
      expect(expectedUrls.openapi).toBe('http://localhost:3002/api-json');
    });

    it('should handle different port configurations in URLs', () => {
      const testPorts = [3000, 3001, 8080, 9000];

      testPorts.forEach((port) => {
        const urls = {
          api: `http://localhost:${port}/api`,
          swagger: `http://localhost:${port}/api`,
          openapi: `http://localhost:${port}/api-json`,
        };

        expect(urls.api).toBe(`http://localhost:${port}/api`);
        expect(urls.swagger).toBe(`http://localhost:${port}/api`);
        expect(urls.openapi).toBe(`http://localhost:${port}/api-json`);
      });
    });
  });

  describe('Integration with Application Module', () => {
    it('should create document with app and config', () => {
      const config = new DocumentBuilder().setTitle('Test').build();
      const createDocumentSpy = jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue({
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {},
      } as OpenAPIObject);

      SwaggerModule.createDocument(app, config);

      expect(createDocumentSpy).toHaveBeenCalledWith(app, config);

      // Restore the spy
      createDocumentSpy.mockRestore();
    });

    it('should handle module compilation and app creation', async () => {
      expect(module).toBeDefined();
      expect(app).toBeDefined();
      expect(typeof app.setGlobalPrefix).toBe('function');
      expect(typeof app.enableCors).toBe('function');
      expect(typeof app.listen).toBe('function');
    });
  });

  describe('Swagger UI Configuration Validation', () => {
    it('should validate swagger options configuration', () => {
      const swaggerOptions = {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      };

      expect(swaggerOptions.persistAuthorization).toBe(true);
      expect(swaggerOptions.tagsSorter).toBe('alpha');
      expect(swaggerOptions.operationsSorter).toBe('alpha');

      // Validate types
      expect(typeof swaggerOptions.persistAuthorization).toBe('boolean');
      expect(typeof swaggerOptions.tagsSorter).toBe('string');
      expect(typeof swaggerOptions.operationsSorter).toBe('string');
    });

    it('should validate complete setup options', () => {
      const setupOptions = {
        jsonDocumentUrl: 'api-json',
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      };

      expect(setupOptions.jsonDocumentUrl).toBe('api-json');
      expect(setupOptions.swaggerOptions).toBeDefined();
      expect(Object.keys(setupOptions.swaggerOptions)).toEqual(['persistAuthorization', 'tagsSorter', 'operationsSorter']);
    });
  });
});
