import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Prefix all routes with 'api'
  app.setGlobalPrefix('api');
  // Configure CORS from environment or use defaults
  // this are example if you are using https://github.com/Agentailor/agentailor-chat-ui
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
