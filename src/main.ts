import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LangSmithTracingInterceptor } from './langsmith/interceptors/langsmith-tracing.interceptor';
import { LangSmithService } from './langsmith/services/langsmith.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Configure LangSmith tracing interceptor
  try {
    const langsmithService = app.get(LangSmithService, { strict: false });
    if (langsmithService) {
      const tracingInterceptor = new LangSmithTracingInterceptor(langsmithService);
      app.useGlobalInterceptors(tracingInterceptor);

      // Log LangSmith status
      langsmithService.logTracingStatus();

      logger.log('LangSmith tracing interceptor configured successfully');
    } else {
      logger.warn('LangSmith service not available - tracing disabled');
    }
  } catch (error) {
    logger.warn('Failed to configure LangSmith tracing interceptor', error);
  }

  // Prefix all routes with 'api'
  app.setGlobalPrefix('api');

  // Configure Swagger/OpenAPI documentation
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

  const document = SwaggerModule.createDocument(app, config);

  // Setup Swagger UI at /api endpoint (after global prefix is applied, it becomes /api/api)
  // To avoid this, we'll use a custom setup
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'api-json',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Configure CORS from environment or use defaults
  // this are example if you are using https://github.com/Agentailor/agentailor-chat-ui
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  logger.log(`Emily AI Agent is running on port ${port}`);
  logger.log(`API available at: http://localhost:${port}/api`);
  logger.log(`Swagger UI available at: http://localhost:${port}/api`);
  logger.log(`OpenAPI JSON spec available at: http://localhost:${port}/api-json`);
}
bootstrap();
