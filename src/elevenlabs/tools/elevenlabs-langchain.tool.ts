import type { StructuredToolInterface } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ElevenLabsBasicService } from '../services/elevenlabs-basic.service';

/**
 * Strongly typed interfaces for ElevenLabs tool responses
 * Replaces unsafe any types with proper TypeScript interfaces
 */
export interface ElevenLabsToolResponse<T = unknown> {
  success: boolean;
  error?: string;
  errorCode?: string;
  data?: T;
}

export interface TtsToolResult {
  audioBase64: string;
  contentType: string;
  metadata: {
    characterCount: number;
    requestTime: number;
    audioSize: number;
  };
}

export interface SttToolResult {
  transcript: string;
  languageProbability?: number;
  speakers?: Array<{
    id: number;
    segments: Array<{
      start: number;
      end: number;
    }>;
  }>;
  timestamps?: Array<{
    word: string;
    start: number;
    end: number;
    speaker?: number;
  }>;
  metadata: {
    audioLengthMs: number;
    requestTime: number;
  };
}

export interface VoicesToolResult {
  voices: Array<{
    voiceId: string;
    name: string;
    description?: string;
    category: string;
    accent?: string;
    gender?: string;
    age?: string;
    useCase?: string;
    settings?: {
      stability: number;
      similarityBoost: number;
      style?: number;
      useSpeakerBoost?: boolean;
    };
  }>;
  count: number;
}

export interface HealthCheckToolResult {
  connected: boolean;
  endpoint: string;
  lastChecked: number;
  status: 'healthy' | 'unhealthy';
  error?: string;
  statistics?: {
    initialized: boolean;
    available: boolean;
    activeRequests: number;
    configuration: Record<string, unknown>;
  };
}

/**
 * Input schemas for ElevenLabs tools using Zod validation
 */
const TextToSpeechSchema = z.object({
  text: z.string().min(1).max(5000).describe('The text to convert to speech (max 5000 characters)'),
  voiceId: z.string().optional().describe('Voice ID to use for speech synthesis (optional)'),
  modelId: z.string().optional().describe('TTS model ID to use (optional)'),
  stability: z.number().min(0).max(1).optional().describe('Voice stability (0.0-1.0, optional)'),
  similarityBoost: z.number().min(0).max(1).optional().describe('Voice similarity boost (0.0-1.0, optional)'),
  style: z.number().min(0).max(1).optional().describe('Voice style strength (0.0-1.0, optional)'),
  useSpeakerBoost: z.boolean().optional().describe('Enable speaker boost for better quality (optional)'),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type TextToSpeechInput = z.infer<typeof TextToSpeechSchema>;
export type SpeechToTextInput = z.infer<typeof SpeechToTextSchema>;
export type GetVoicesInput = z.infer<typeof GetVoicesSchema>;
export type HealthCheckInput = z.infer<typeof HealthCheckSchema>;

const SpeechToTextSchema = z.object({
  audioBase64: z.string().min(1).describe('Base64 encoded audio data'),
  modelId: z.string().optional().describe('STT model ID to use (optional)'),
  languageCode: z.string().optional().describe('Expected language code (e.g., "en", "es", optional)'),
  numSpeakers: z.number().int().min(1).max(10).optional().describe('Number of speakers for diarization (1-10, optional)'),
  diarize: z.boolean().optional().describe('Enable speaker diarization (optional)'),
});

const GetVoicesSchema = z.object({
  includeSettings: z.boolean().optional().describe('Include voice settings in response (optional)'),
});

const HealthCheckSchema = z.object({
  detailed: z.boolean().optional().describe('Include detailed health information (optional)'),
});

/**
 * LangChain-compatible tool collection for ElevenLabs integration
 *
 * This service provides LangChain tools that wrap ElevenLabs functionality,
 * enabling agents to use text-to-speech, speech-to-text, and voice management
 * capabilities as part of their tool repertoire.
 *
 * Features:
 * - Text-to-Speech (TTS) tool with configurable voice settings
 * - Speech-to-Text (STT) tool with diarization support
 * - Voice listing and management tools
 * - Health monitoring tool for service availability
 * - Proper error handling and validation
 * - Type-safe input validation using Zod schemas
 */
@Injectable()
export class ElevenLabsLangChainTool {
  private readonly logger = new Logger(ElevenLabsLangChainTool.name);
  private tools: StructuredToolInterface[] | null = null;

  constructor(private readonly elevenLabsService: ElevenLabsBasicService) {}

  /**
   * Get all available ElevenLabs tools for LangChain agents
   */
  getAllTools(): StructuredToolInterface[] {
    if (!this.tools) {
      this.tools = [this.createTextToSpeechTool(), this.createSpeechToTextTool(), this.createGetVoicesTool(), this.createHealthCheckTool()];
    }
    return this.tools;
  }

  /**
   * Get a specific tool by name
   */
  getTool(toolName: string): StructuredToolInterface | null {
    const tools = this.getAllTools();
    return tools.find((tool) => tool.name === toolName) || null;
  }

  /**
   * Text-to-Speech tool for converting text to audio
   */
  private createTextToSpeechTool(): StructuredToolInterface {
    return new DynamicStructuredTool({
      name: 'elevenlabs_text_to_speech',
      description: `Convert text to speech using ElevenLabs TTS API.
      
      This tool generates high-quality speech audio from text input using advanced AI voice synthesis.
      You can customize voice characteristics, choose different voices, and adjust speech parameters.
      
      Use cases:
      - Generate audio content from text
      - Create voice responses for conversations
      - Produce audio narration or announcements
      - Test different voice styles and settings
      
      Returns base64-encoded audio data that can be played or saved as an audio file.`,

      schema: TextToSpeechSchema,

      func: async (input) => {
        const typedInput = input as TextToSpeechInput;
        this.logger.debug('Executing text-to-speech tool', { textLength: typedInput.text.length });

        try {
          const response = await this.elevenLabsService.generateSpeech({
            text: typedInput.text,
            voiceId: typedInput.voiceId,
            modelId: typedInput.modelId,
            voiceSettings: {
              stability: typedInput.stability,
              similarityBoost: typedInput.similarityBoost,
              style: typedInput.style,
              useSpeakerBoost: typedInput.useSpeakerBoost,
            },
          });

          const base64Audio = response.audioData.toString('base64');

          return JSON.stringify({
            success: true,
            audioBase64: base64Audio,
            contentType: response.contentType,
            metadata: {
              characterCount: response.metadata?.characterCount || 0,
              requestTime: response.metadata?.requestTime || 0,
              audioSize: response.audioData.length,
            },
          });
        } catch (error) {
          this.logger.error('Text-to-speech tool failed', error);
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Text-to-speech failed',
            errorCode: (error as { errorCode?: string })?.errorCode || 'TTS_ERROR',
          });
        }
      },
    });
  }

  /**
   * Speech-to-Text tool for converting audio to text
   */
  private createSpeechToTextTool(): StructuredToolInterface {
    return new DynamicStructuredTool({
      name: 'elevenlabs_speech_to_text',
      description: `Convert speech audio to text using ElevenLabs STT API.
      
      This tool transcribes audio content to text with high accuracy, supporting multiple languages
      and speaker identification features.
      
      Use cases:
      - Transcribe audio files or recordings
      - Convert voice messages to text
      - Extract text from multimedia content
      - Enable speech-based user interactions
      
      Supports speaker diarization to identify different speakers in multi-person conversations.
      Audio should be provided as base64-encoded data.`,

      schema: SpeechToTextSchema,

      func: async (input) => {
        const typedInput = input as SpeechToTextInput;
        this.logger.debug('Executing speech-to-text tool');

        try {
          const audioBuffer = Buffer.from(typedInput.audioBase64, 'base64');

          const response = await this.elevenLabsService.transcribeAudio({
            audioData: audioBuffer,
            modelId: typedInput.modelId,
            languageCode: typedInput.languageCode,
            numSpeakers: typedInput.numSpeakers,
            diarize: typedInput.diarize,
          });

          return JSON.stringify({
            success: true,
            transcript: response.transcript,
            languageProbability: response.languageProbability,
            speakers: response.speakers,
            timestamps: response.timestamps,
            metadata: {
              audioLengthMs: response.metadata?.audioLengthMs || 0,
              requestTime: response.metadata?.requestTime || 0,
            },
          });
        } catch (error) {
          this.logger.error('Speech-to-text tool failed', error);
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Speech-to-text failed',
            errorCode: (error as { errorCode?: string })?.errorCode || 'STT_ERROR',
          });
        }
      },
    });
  }

  /**
   * Get Voices tool for listing available voices
   */
  private createGetVoicesTool(): StructuredToolInterface {
    return new DynamicStructuredTool({
      name: 'elevenlabs_get_voices',
      description: `Get list of available voices from ElevenLabs.
      
      This tool retrieves all available voices that can be used for text-to-speech synthesis.
      Each voice has unique characteristics, accents, and speaking styles.
      
      Use cases:
      - Browse available voice options
      - Find voices suitable for specific content types
      - Get voice IDs for use in text-to-speech
      - Explore voice characteristics and samples
      
      Returns detailed information about each voice including name, description, and settings.`,

      schema: GetVoicesSchema,

      func: async (input) => {
        const typedInput = input as GetVoicesInput;
        this.logger.debug('Executing get-voices tool');

        try {
          const voices = await this.elevenLabsService.getVoices();

          return JSON.stringify({
            success: true,
            voices: voices.map((voice) => ({
              voiceId: voice.voiceId,
              name: voice.name,
              description: voice.description,
              category: voice.category,
              accent: (voice as any).accent,
              gender: (voice as any).gender,
              age: (voice as any).age,
              useCase: (voice as any).use_case,
              ...(typedInput.includeSettings && voice.settings
                ? {
                    settings: voice.settings,
                  }
                : {}),
            })),
            count: voices.length,
          });
        } catch (error) {
          this.logger.error('Get-voices tool failed', error);
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get voices',
            errorCode: (error as { errorCode?: string })?.errorCode || 'VOICES_ERROR',
          });
        }
      },
    });
  }

  /**
   * Health Check tool for monitoring ElevenLabs service availability
   */
  private createHealthCheckTool(): StructuredToolInterface {
    return new DynamicStructuredTool({
      name: 'elevenlabs_health_check',
      description: `Check the health and availability of ElevenLabs services.
      
      This tool verifies that the ElevenLabs API is accessible and functioning properly.
      It can be used to troubleshoot connectivity issues or verify service status.
      
      Use cases:
      - Verify service availability before making API calls
      - Troubleshoot connectivity issues
      - Monitor service health in applications
      - Get service configuration information
      
      Returns connection status, endpoint information, and optional detailed statistics.`,

      schema: HealthCheckSchema,

      func: async (input) => {
        const typedInput = input as HealthCheckInput;
        this.logger.debug('Executing health-check tool');

        try {
          const health = await this.elevenLabsService.checkHealth();

          const result: ElevenLabsToolResponse<Partial<HealthCheckToolResult>> & Partial<HealthCheckToolResult> = {
            success: true,
            connected: health.connected,
            endpoint: health.endpoint,
            lastChecked: health.lastChecked,
            status: health.connected ? 'healthy' : 'unhealthy',
          };

          if (health.error) {
            result.error = health.error;
          }

          if (typedInput.detailed) {
            const stats = this.elevenLabsService.getStatistics();
            result.statistics = {
              initialized: stats.initialized,
              available: stats.available,
              activeRequests: stats.activeRequests,
              configuration: stats.configuration,
            };
          }

          return JSON.stringify(result);
        } catch (error) {
          this.logger.error('Health-check tool failed', error);
          return JSON.stringify({
            success: false,
            connected: false,
            error: error instanceof Error ? error.message : 'Health check failed',
            errorCode: 'HEALTH_CHECK_ERROR',
          });
        }
      },
    });
  }

  /**
   * Get tool names for reference
   */
  getToolNames(): string[] {
    return this.getAllTools().map((tool) => tool.name);
  }

  /**
   * Check if ElevenLabs service is available
   */
  isServiceAvailable(): boolean {
    return this.elevenLabsService.isAvailable();
  }

  /**
   * Get service statistics
   */
  getServiceStatistics() {
    return this.elevenLabsService.getStatistics();
  }
}
