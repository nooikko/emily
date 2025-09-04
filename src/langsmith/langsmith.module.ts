import { Module } from '@nestjs/common';
import { LangSmithTracingInterceptor } from './interceptors/langsmith-tracing.interceptor';
import { LangSmithConfigModule } from './langsmith-config.module';
import { DataMaskingService } from './services/data-masking.service';
import { LangSmithService } from './services/langsmith.service';

/**
 * LangSmithModule - Main module for LangSmith integration
 *
 * This module provides comprehensive LangSmith integration for NestJS applications,
 * including configuration management, centralized logging, and automatic tracing.
 *
 * Features:
 * - Centralized configuration with validation
 * - LangSmith client initialization and management
 * - Automatic tracing interceptor
 * - Advanced data masking and security features
 * - Health monitoring and status checks
 * - Production-ready security defaults
 *
 * Usage:
 * Import this module in your AppModule to enable LangSmith integration:
 *
 * @Module({
 *   imports: [LangSmithModule],
 *   // ...
 * })
 * export class AppModule {}
 *
 * For automatic tracing, add the interceptor globally in main.ts:
 *
 * const app = await NestFactory.create(AppModule);
 * const langsmithService = app.get(LangSmithService);
 * app.useGlobalInterceptors(new LangSmithTracingInterceptor(langsmithService));
 */
@Module({
  imports: [LangSmithConfigModule],
  providers: [DataMaskingService, LangSmithService, LangSmithTracingInterceptor],
  exports: [DataMaskingService, LangSmithService, LangSmithTracingInterceptor],
})
export class LangSmithModule {}
