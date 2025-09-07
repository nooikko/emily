import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ElevenLabsConfigModule } from './elevenlabs-config.module';
import { ElevenLabsBasicService } from './services/elevenlabs-basic.service';
import { ElevenLabsLangChainTool } from './tools/elevenlabs-langchain.tool';

/**
 * ElevenLabsModule - Main module for ElevenLabs integration with LangChain tool support
 *
 * This module provides comprehensive ElevenLabs integration for NestJS applications,
 * including Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities with production-ready
 * features like rate limiting, retry logic, streaming support, health monitoring, and
 * LangChain tool integration for agent orchestration.
 *
 * Features:
 * - Text-to-Speech with streaming support and voice management
 * - Speech-to-Text with speaker diarization and multi-language support
 * - LangChain tool integration for agent-based workflows
 * - Centralized configuration with environment variable validation
 * - Automatic retry logic with exponential backoff for API failures
 * - Rate limiting and concurrent request management
 * - Comprehensive error handling for all API scenarios
 * - Health monitoring and connection status tracking
 * - Voice caching and management
 * - Production-ready logging and monitoring
 * - TypeScript support with comprehensive interfaces
 *
 * Core Services:
 * - ElevenLabsBasicService: Comprehensive TTS/STT operations with health monitoring
 * - ElevenLabsLangChainTool: LangChain tool collection for agent integration
 *
 * Usage:
 * Import this module in your AppModule to enable ElevenLabs integration:
 *
 * @Module({
 *   imports: [ElevenLabsModule],
 *   // ...
 * })
 * export class AppModule {}
 *
 * Direct service usage:
 *
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     private readonly elevenLabsService: ElevenLabsBasicService,
 *   ) {}
 *
 *   async generateSpeech(text: string): Promise<Buffer> {
 *     const response = await this.elevenLabsService.generateSpeech({
 *       text,
 *       voiceId: 'your-voice-id',
 *     });
 *     return response.audioData;
 *   }
 * }
 *
 * LangChain agent integration:
 *
 * @Injectable()
 * export class AgentService {
 *   constructor(
 *     private readonly elevenLabsTool: ElevenLabsLangChainTool,
 *   ) {}
 *
 *   createAgent(): CompiledStateGraph {
 *     const tools = this.elevenLabsTool.getAllTools();
 *     // Use tools in agent builder...
 *   }
 * }
 *
 * Configuration:
 * Required environment variables:
 * - ELEVENLABS_API_KEY: Your ElevenLabs API key
 *
 * Optional environment variables:
 * - ELEVENLABS_BASE_URL: API base URL (default: https://api.elevenlabs.io)
 * - ELEVENLABS_DEFAULT_VOICE_ID: Default voice for TTS operations
 * - ELEVENLABS_DEFAULT_TTS_MODEL: Default TTS model (default: eleven_multilingual_v2)
 * - ELEVENLABS_DEFAULT_STT_MODEL: Default STT model (default: scribe_v1)
 * - ELEVENLABS_MAX_CONCURRENT_REQUESTS: Rate limiting (default: 3)
 * - ELEVENLABS_MAX_RETRIES: Retry attempts (default: 3)
 * - ELEVENLABS_HEALTH_CHECK_ENABLED: Enable health monitoring (default: true)
 * - And many more configuration options...
 *
 * Error Handling:
 * All services include comprehensive error handling with structured error objects:
 * - 400: Bad request (invalid parameters)
 * - 401: Unauthorized (invalid API key)
 * - 403: Forbidden (quota exceeded)
 * - 404: Not found (voice not found)
 * - 422: Unprocessable entity (invalid settings)
 * - 429: Rate limited (automatic retry with backoff)
 * - 500+: Server errors (automatic retry with backoff)
 *
 * Health Monitoring:
 * Use ElevenLabsBasicService for health monitoring:
 *
 * const health = await this.elevenLabsService.checkHealth();
 * if (health.connected) {
 *   console.log('ElevenLabs is available');
 * }
 *
 * const stats = this.elevenLabsService.getStatistics();
 * console.log('Service statistics:', stats);
 */
@Module({
  imports: [
    ElevenLabsConfigModule,
    HttpModule.register({
      timeout: 30000, // 30 second timeout for API requests
      maxRedirects: 3,
    }),
  ],
  providers: [ElevenLabsBasicService, ElevenLabsLangChainTool],
  exports: [ElevenLabsBasicService, ElevenLabsLangChainTool],
})
export class ElevenLabsModule {}
