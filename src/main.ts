import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LangSmithTracingInterceptor } from './langsmith/interceptors/langsmith-tracing.interceptor';
import { LangSmithService } from './langsmith/services/langsmith.service';
import { GlobalExceptionFilter } from './observability/filters/global-exception.filter';
import { LoggingInterceptor } from './observability/interceptors/logging.interceptor';
import { StructuredLoggerService } from './observability/services/structured-logger.service';
import { TelemetryService } from './observability/services/telemetry.service';

async function bootstrap(): Promise<void> {
  const logger = new StructuredLoggerService('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Initialize telemetry service
  try {
    const telemetryService = app.get(TelemetryService);
    await telemetryService.onModuleInit();

    const _healthStatus = await telemetryService.getHealthStatus();
    logger.logInfo('Telemetry service initialized');
  } catch (error) {
    logger.error('Failed to initialize telemetry service', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Configure global exception filter for comprehensive error logging
  app.useGlobalFilters(new GlobalExceptionFilter());
  logger.logInfo('Global exception filter configured');

  // Configure global logging interceptor for request/response tracking
  app.useGlobalInterceptors(new LoggingInterceptor());
  logger.logInfo('Request/response logging interceptor configured');

  // Configure LangSmith tracing interceptor
  try {
    const langsmithService = app.get(LangSmithService, { strict: false });
    if (langsmithService) {
      const tracingInterceptor = new LangSmithTracingInterceptor(langsmithService);
      app.useGlobalInterceptors(tracingInterceptor);

      // Log LangSmith status
      langsmithService.logTracingStatus();

      logger.logInfo('LangSmith tracing interceptor configured successfully');
    } else {
      logger.warn('LangSmith service not available - tracing disabled');
    }
  } catch (error) {
    logger.warn('Failed to configure LangSmith tracing interceptor', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Configure global validation pipe for comprehensive input validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
      whitelist: true, // Strip properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are found
      skipMissingProperties: false, // Do not skip missing properties during validation
      forbidUnknownValues: true, // Ensure unknown objects fail validation
      disableErrorMessages: false, // Show detailed validation error messages
      validationError: {
        target: false, // Don't expose the target object in validation errors
        value: false, // Don't expose the value in validation errors
      },
    }),
  );
  logger.logInfo('Global validation pipe configured with strict validation rules');

  // Prefix all routes with 'api'
  app.setGlobalPrefix('api');

  // Configure Swagger/OpenAPI documentation with comprehensive metadata
  const config = new DocumentBuilder()
    .setTitle('Emily AI Agent API')
    .setDescription(`
      **Emily AI Agent - Personal AI Assistant API**
      
      This API provides endpoints for interacting with Emily, a personal AI assistant built on LangChain and NestJS.
      
      **Features:**
      - Real-time conversational AI with streaming responses
      - Multi-modal support (text and images)
      - Vector-based memory and context management
      - Health monitoring and observability
      - Dynamic configuration management
      
      **Authentication:**
      Most endpoints require Bearer token authentication. Use the "Authorize" button to configure your token.
      
      **Response Formats:**
      - Standard REST endpoints return JSON responses
      - Chat endpoints support Server-Sent Events (SSE) for streaming
      - All responses follow OpenAPI 3.0 specifications for optimal code generation
    `)
    .setVersion('0.0.1')
    .setContact('Emily AI Agent', 'https://github.com/Agentailor/agentailor-emily', 'support@agentailor.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3002', 'Local Development Server')
    .addServer('https://api.emily.agentailor.com', 'Production Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Bearer token for authentication',
      },
      'bearer',
    )
    .addTag('agent', 'AI Agent chat and conversation endpoints')
    .addTag('health', 'Health check and system monitoring endpoints')
    .addTag('config', 'Dynamic configuration management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      // Create consistent, predictable operation IDs for better code generation
      const cleanControllerKey = controllerKey.replace(/Controller$/, '');
      return `${cleanControllerKey.toLowerCase()}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`;
    },
    deepScanRoutes: true,
    ignoreGlobalPrefix: false,
    extraModels: [
      // Ensure error DTOs are included in schema generation
      require('./common/dto/error.dto').ErrorDto,
      require('./common/dto/error.dto').ValidationErrorDto,
      require('./common/dto/error.dto').BadRequestErrorDto,
      require('./common/dto/error.dto').UnauthorizedErrorDto,
      require('./common/dto/error.dto').ForbiddenErrorDto,
      require('./common/dto/error.dto').NotFoundErrorDto,
      require('./common/dto/error.dto').ConflictErrorDto,
      require('./common/dto/error.dto').InternalServerErrorDto,
      require('./common/dto/error.dto').ServiceUnavailableErrorDto,
    ],
  });

  // Setup Swagger UI with enhanced options for code generation
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'api-json',
    yamlDocumentUrl: 'api-yaml',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      validatorUrl: null, // Disable online validator for faster loading
      oauth2RedirectUrl: undefined,
      showMutatedRequest: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
      displayOperationId: true,
      displayRequestDuration: true,
      maxDisplayedTags: 20,
      deepLinking: true,
      showExtensions: true,
      showRequestDuration: true,
      requestInterceptor: undefined,
      responseInterceptor: undefined,
      presets: ['SwaggerUIBundle.presets.apis', 'SwaggerUIBundle.presets.standalone'],
      plugins: ['SwaggerUIBundle.plugins.DownloadUrl', 'SwaggerUIBundle.plugins.DeepLinking'],
    },
    customSiteTitle: 'Emily AI Agent API Documentation',
    customfavIcon: '/favicon.ico',
    customJs: [
      // Add enhanced code generation utilities
      'https://unpkg.com/swagger-ui-dist@5.12.0/swagger-ui-bundle.js',
    ],
    customCssUrl: ['https://unpkg.com/swagger-ui-dist@5.12.0/swagger-ui.css'],
    customCss: `
      .swagger-ui .info .title {
        color: #3b82f6;
      }
      .swagger-ui .scheme-container {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 10px;
      }
      .swagger-ui .info .description {
        font-size: 14px;
        line-height: 1.6;
      }
      .swagger-ui .opblock.opblock-post {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.1);
      }
      .swagger-ui .opblock.opblock-get {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.1);
      }
      .swagger-ui .opblock.opblock-put {
        border-color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }
      .swagger-ui .opblock.opblock-delete {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
    `,
  });

  logger.logInfo('Swagger documentation configured with enhanced code generation support');

  // Configure CORS from environment or use defaults
  // this are example if you are using https://github.com/Agentailor/agentailor-chat-ui
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3002'];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  logger.logInfo(`Emily AI Agent started successfully on port ${port}`);
}
bootstrap();
