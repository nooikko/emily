import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import type {
  ElevenLabsConfig,
  ElevenLabsError,
  ElevenLabsHealthStatus,
  SttRequest,
  SttResponse,
  TtsRequest,
  TtsResponse,
  VoiceInfo,
} from '../types/elevenlabs-config.interface';

/**
 * API response types for ElevenLabs
 */
interface VoicesApiResponse {
  voices: VoiceInfo[];
}

interface CharacterAlignment {
  char: string;
  start_time_seconds: number;
  end_time_seconds: number;
  speaker: number;
}

interface SpeakerSegment {
  start_time_seconds: number;
  end_time_seconds: number;
}

interface SpeakerInfo {
  segments: SpeakerSegment[];
}

interface SttApiResponse {
  transcript: string;
  language_probability?: number;
  detected_language?: string;
  audio_length_seconds?: number;
  alignment?: {
    chars: CharacterAlignment[];
  };
  speakers?: SpeakerInfo[];
}

/**
 * Axios error with proper typing
 */
interface AxiosErrorResponse {
  response?: {
    status: number;
    data?: {
      detail?: string;
      [key: string]: unknown;
    };
  };
  message: string;
  name?: string;
}

/**
 * ElevenLabsBasicService - Basic implementation using HTTP client
 *
 * This service provides ElevenLabs integration using direct HTTP calls
 * with comprehensive error handling, rate limiting, and retry logic.
 *
 * Features:
 * - Text-to-Speech (TTS) generation
 * - Speech-to-Text (STT) transcription
 * - Health monitoring and connection testing
 * - Rate limiting and retry logic
 * - Proper error handling for all API scenarios
 */
@Injectable()
export class ElevenLabsBasicService implements OnModuleInit {
  private readonly logger = new Logger(ElevenLabsBasicService.name);
  private isInitialized = false;
  private lastHealthCheck: ElevenLabsHealthStatus | null = null;
  private activeRequests = 0;

  constructor(
    @Inject('ELEVENLABS_CONFIG') private readonly config: ElevenLabsConfig,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Initialize service on module initialization
   */
  async onModuleInit(): Promise<void> {
    // Skip initialization in test environment to prevent hanging tests
    if (process.env.NODE_ENV === 'test') {
      this.isInitialized = true;
      return;
    }

    try {
      await this.initialize();
      this.logger.log('ElevenLabsBasicService initialized successfully');
    } catch (error) {
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Failed to initialize ElevenLabsBasicService: ${msg}`);
      // Don't throw to prevent application from failing
    }
  }

  /**
   * Initialize the service
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Perform initial health check
    const health = await this.checkHealth();
    this.lastHealthCheck = health;

    if (!health.connected) {
      const missingEnv = this.getMissingConfigKeys();
      if (missingEnv.length > 0) {
        this.logger.warn(`ElevenLabs health check failed: ${health.error} | missing: ${missingEnv.join(', ')}`);
      } else {
        this.logger.warn(`ElevenLabs health check failed: ${health.error}`);
      }
    } else {
      this.logger.log(`ElevenLabs connected successfully to ${health.endpoint}`);
    }

    this.isInitialized = true;

    this.logger.debug('ElevenLabsBasicService configuration', {
      baseUrl: this.config.baseUrl,
      defaultTtsModel: this.config.defaultTtsModel,
      defaultSttModel: this.config.defaultSttModel,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(request: TtsRequest): Promise<TtsResponse> {
    return this.executeWithRetry(() => this.internalGenerateSpeech(request));
  }

  /**
   * Transcribe audio to text
   */
  async transcribeAudio(request: SttRequest): Promise<SttResponse> {
    return this.executeWithRetry(() => this.internalTranscribeAudio(request));
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<VoiceInfo[]> {
    return this.executeWithRetry(async () => {
      const response = await firstValueFrom(
        this.httpService.get<VoicesApiResponse>('/v1/voices', {
          baseURL: this.config.baseUrl,
          headers: this.getHeaders(),
        }),
      );

      return response.data.voices || [];
    });
  }

  /**
   * Perform health check
   */
  async checkHealth(): Promise<ElevenLabsHealthStatus> {
    const endpoint = this.config.baseUrl;
    const now = Date.now();

    try {
      // Test API connection by fetching voices
      const response = await firstValueFrom(
        this.httpService.get('/v1/voices', {
          baseURL: this.config.baseUrl,
          headers: this.getHeaders(),
          timeout: 10000, // 10 second timeout
        }),
      );

      const healthStatus: ElevenLabsHealthStatus = {
        connected: response.status === 200,
        endpoint,
        lastChecked: now,
      };

      this.lastHealthCheck = healthStatus;
      return healthStatus;
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      const detail = axiosError?.response?.data?.detail;
      const errMsg = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : axiosError?.message || 'Unknown error';
      const healthStatus: ElevenLabsHealthStatus = {
        connected: false,
        endpoint,
        lastChecked: now,
        error: errMsg,
      };

      this.lastHealthCheck = healthStatus;
      return healthStatus;
    }
  }

  private getMissingConfigKeys(): string[] {
    const missing: string[] = [];
    if (!this.config.apiKey) {
      missing.push('ELEVENLABS_API_KEY');
    }
    if (!this.config.baseUrl) {
      missing.push('ELEVENLABS_BASE_URL');
    }
    return missing;
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): ElevenLabsHealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Get service configuration (without API key)
   */
  getConfig(): Omit<ElevenLabsConfig, 'apiKey'> {
    const { apiKey: _apiKey, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      initialized: this.isInitialized,
      available: this.isAvailable(),
      lastHealthCheck: this.lastHealthCheck,
      activeRequests: this.activeRequests,
      configuration: {
        baseUrl: this.config.baseUrl,
        defaultTtsModel: this.config.defaultTtsModel,
        defaultSttModel: this.config.defaultSttModel,
        maxConcurrentRequests: this.config.maxConcurrentRequests,
        maxRetries: this.config.maxRetries,
      },
    };
  }

  /**
   * Internal method to generate speech
   */
  private async internalGenerateSpeech(request: TtsRequest): Promise<TtsResponse> {
    return this.executeWithRateLimit(async () => {
      const voiceId = request.voiceId || this.config.defaultVoiceId;
      if (!voiceId) {
        throw this.createError('Voice ID is required', 400, 'VOICE_ID_REQUIRED');
      }

      const startTime = Date.now();

      const payload = {
        text: request.text,
        model_id: request.modelId || this.config.defaultTtsModel,
        voice_settings: {
          stability: request.voiceSettings?.stability ?? this.config.voiceSettings.stability,
          similarity_boost: request.voiceSettings?.similarityBoost ?? this.config.voiceSettings.similarityBoost,
          style: request.voiceSettings?.style ?? this.config.voiceSettings.style,
          use_speaker_boost: request.voiceSettings?.useSpeakerBoost ?? this.config.voiceSettings.useSpeakerBoost,
        },
      };

      this.logger.debug('Starting TTS generation', {
        voiceId,
        textLength: request.text.length,
        modelId: payload.model_id,
      });

      try {
        const response: AxiosResponse<ArrayBuffer> = await firstValueFrom(
          this.httpService.post(`/v1/text-to-speech/${voiceId}`, payload, {
            baseURL: this.config.baseUrl,
            headers: {
              ...this.getHeaders(),
              Accept: request.outputFormat || this.config.defaultOutputFormat,
            },
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
          }),
        );

        const endTime = Date.now();
        const requestTime = endTime - startTime;

        this.logger.debug('TTS generation completed', {
          voiceId,
          textLength: request.text.length,
          audioSize: response.data.byteLength,
          requestTime,
        });

        return {
          audioData: Buffer.from(response.data),
          contentType: response.headers['content-type'] || 'audio/mpeg',
          metadata: {
            characterCount: request.text.length,
            requestTime,
          },
        };
      } catch (error: unknown) {
        const axiosError = error as AxiosErrorResponse;
        this.logger.error('TTS generation failed', axiosError);
        throw this.handleApiError(axiosError);
      }
    });
  }

  /**
   * Internal method to transcribe audio
   */
  private async internalTranscribeAudio(request: SttRequest): Promise<SttResponse> {
    return this.executeWithRateLimit(async () => {
      if (!request.audioData || request.audioData.length === 0) {
        throw this.createError('Audio data is required', 400, 'AUDIO_DATA_REQUIRED');
      }

      const startTime = Date.now();
      const modelId = request.modelId || this.config.defaultSttModel;

      this.logger.debug('Starting STT transcription', {
        modelId,
        audioSize: request.audioData.length,
        languageCode: request.languageCode,
        numSpeakers: request.numSpeakers,
        diarize: request.diarize,
      });

      try {
        // Create form data
        const formData = new FormData();
        const audioBlob = new Blob([new Uint8Array(request.audioData)], { type: 'audio/mpeg' });
        formData.append('audio', audioBlob, 'audio.mp3');
        formData.append('model_id', modelId);

        if (request.languageCode) {
          formData.append('language_code', request.languageCode);
        }

        if (request.numSpeakers) {
          formData.append('num_speakers', request.numSpeakers.toString());
        }

        if (request.diarize) {
          formData.append('diarize', request.diarize.toString());
        }

        const response = await firstValueFrom(
          this.httpService.post<SttApiResponse>('/v1/speech-to-text', formData, {
            baseURL: this.config.baseUrl,
            headers: {
              ...this.getHeaders(),
              'Content-Type': 'multipart/form-data',
            },
            timeout: 60000, // 60 second timeout for STT
          }),
        );

        const endTime = Date.now();
        const requestTime = endTime - startTime;

        this.logger.debug('STT transcription completed', {
          transcriptLength: response.data.transcript?.length || 0,
          languageDetected: response.data.detected_language,
          requestTime,
        });

        return {
          transcript: response.data.transcript || '',
          languageProbability: response.data.language_probability,
          timestamps: response.data.alignment?.chars?.map((char) => ({
            word: char.char,
            start: char.start_time_seconds,
            end: char.end_time_seconds,
            speaker: char.speaker,
          })),
          speakers: response.data.speakers?.map((speaker, index) => ({
            id: index,
            segments:
              speaker.segments?.map((segment) => ({
                start: segment.start_time_seconds,
                end: segment.end_time_seconds,
              })) || [],
          })),
          metadata: {
            audioLengthMs: (response.data.audio_length_seconds || 0) * 1000,
            requestTime,
          },
        };
      } catch (error: unknown) {
        const axiosError = error as AxiosErrorResponse;
        this.logger.error('STT transcription failed', axiosError);
        throw this.handleApiError(axiosError);
      }
    });
  }

  /**
   * Execute request with rate limiting
   */
  private async executeWithRateLimit<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for previous requests if we're at the limit
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      await new Promise((resolve) => setTimeout(resolve, this.config.rateLimitDelayMs));
    }

    this.activeRequests++;

    try {
      return await operation();
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: ElevenLabsError;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = this.handleApiError(this.ensureAxiosError(error));

        if (attempt === this.config.maxRetries || !this.isRetryableError(lastError)) {
          throw lastError;
        }

        const delayMs = this.calculateRetryDelay(attempt);
        this.logger.warn(`Retrying request (attempt ${attempt + 1}/${this.config.maxRetries + 1}) after ${delayMs}ms`, {
          error: lastError.message,
          statusCode: lastError.statusCode,
          attempt,
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError!;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelayMs;
    const exponentialDelay = baseDelay * 2 ** attempt;
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: ElevenLabsError): boolean {
    if (!error.statusCode) {
      return true; // Network errors are retryable
    }

    return [429, 500, 502, 503, 504].includes(error.statusCode);
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'xi-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Ensure error conforms to AxiosErrorResponse interface
   */
  private ensureAxiosError(error: unknown): AxiosErrorResponse {
    // If it's already an AxiosError-like object, return it
    if (typeof error === 'object' && error !== null && 'response' in error) {
      return error as AxiosErrorResponse;
    }

    // If it's an Error object, wrap it
    if (error instanceof Error) {
      return {
        message: error.message,
        name: error.name,
      };
    }

    // For any other type, create a generic error structure
    return {
      message: String(error),
      name: 'UnknownError',
    };
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: AxiosErrorResponse): ElevenLabsError {
    if (error.response) {
      const statusCode = error.response.status;
      let message = error.response.data?.detail || error.message || 'Unknown API error';
      let errorCode = 'UNKNOWN_ERROR';
      let isRetryable = false;

      switch (statusCode) {
        case 400:
          errorCode = 'BAD_REQUEST';
          message = 'Invalid request parameters';
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          message = 'Invalid API key or authentication failed';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          message = 'Insufficient permissions or quota exceeded';
          break;
        case 404:
          errorCode = 'NOT_FOUND';
          message = 'Voice or resource not found';
          break;
        case 422:
          errorCode = 'UNPROCESSABLE_ENTITY';
          message = 'Invalid voice settings or parameters';
          break;
        case 429:
          errorCode = 'RATE_LIMITED';
          message = 'Rate limit exceeded';
          isRetryable = true;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorCode = 'SERVER_ERROR';
          message = 'ElevenLabs server error';
          isRetryable = true;
          break;
      }

      return this.createError(message, statusCode, errorCode, isRetryable, error.response.data);
    }

    return this.createError(error.message || 'Network error occurred', undefined, 'NETWORK_ERROR', true);
  }

  /**
   * Create structured error object
   */
  private createError(message: string, statusCode?: number, errorCode?: string, isRetryable = false, details?: unknown): ElevenLabsError {
    const error = new Error(message) as ElevenLabsError;
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    error.isRetryable = isRetryable;
    error.details = details;
    return error;
  }
}
