/**
 * ElevenLabs Integration Module
 *
 * This module provides comprehensive ElevenLabs integration for NestJS applications
 * with Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities.
 *
 * @example
 * ```typescript
 * import { ElevenLabsModule, ElevenLabsBasicService } from './elevenlabs';
 *
 * @Module({
 *   imports: [ElevenLabsModule],
 * })
 * export class AppModule {}
 *
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly elevenLabsService: ElevenLabsBasicService) {}
 *
 *   async generateSpeech(text: string) {
 *     return this.elevenLabsService.generateSpeech({ text });
 *   }
 * }
 * ```
 */

// Configuration exports
export { elevenlabsConfigSchema, validateElevenLabsConfig } from './config/elevenlabs-config.validation';
// Main module export
export { ElevenLabsModule } from './elevenlabs.module';
export { ElevenLabsConfigModule } from './elevenlabs-config.module';
// Service exports
export { ElevenLabsBasicService } from './services/elevenlabs-basic.service';
// LangChain tool exports
export { ElevenLabsLangChainTool } from './tools/elevenlabs-langchain.tool';

// Type exports
export type {
  ElevenLabsConfig,
  ElevenLabsError,
  ElevenLabsHealthStatus,
  RateLimitInfo,
  StreamingConfig,
  SttRequest,
  SttResponse,
  TtsRequest,
  TtsResponse,
  VoiceInfo,
} from './types/elevenlabs-config.interface';
