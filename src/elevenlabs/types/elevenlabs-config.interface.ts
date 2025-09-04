/**
 * Configuration interface for ElevenLabs integration
 */
export interface ElevenLabsConfig {
  // Core Configuration
  readonly apiKey: string;
  readonly baseUrl: string;

  // Voice Configuration
  readonly defaultVoiceId?: string;

  // Model Configuration
  readonly defaultTtsModel: string;
  readonly defaultSttModel: string;

  // Rate Limiting Configuration
  readonly maxConcurrentRequests: number;
  readonly rateLimitDelayMs: number;

  // Retry Configuration
  readonly maxRetries: number;
  readonly retryDelayMs: number;

  // Audio Configuration
  readonly defaultOutputFormat: string;
  readonly voiceSettings: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
  };

  // Security Configuration
  readonly enableLogging: boolean;
  readonly logAudioData: boolean;

  // Health Check Configuration
  readonly healthCheck: {
    enabled: boolean;
    intervalMs: number;
  };

  // Environment
  readonly nodeEnv: string;
}

/**
 * Health status interface for ElevenLabs service monitoring
 */
export interface ElevenLabsHealthStatus {
  readonly connected: boolean;
  readonly endpoint: string;
  readonly lastChecked: number;
  readonly error?: string;
  readonly apiStatus?: {
    charactersUsed?: number;
    charactersLimit?: number;
    concurrentRequestsActive?: number;
    concurrentRequestsLimit?: number;
  };
}

/**
 * Voice information interface
 */
export interface VoiceInfo {
  readonly voiceId: string;
  readonly name: string;
  readonly category: string;
  readonly labels: Record<string, string>;
  readonly description?: string;
  readonly previewUrl?: string;
  readonly availableForTiers: string[];
  readonly settings?: {
    stability: number;
    similarityBoost: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
}

/**
 * TTS Request interface
 */
export interface TtsRequest {
  readonly text: string;
  readonly voiceId?: string;
  readonly modelId?: string;
  readonly outputFormat?: string;
  readonly voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  readonly pronunciationDictionaryLocators?: Array<{
    pronunciationDictionaryId: string;
    versionId: string;
  }>;
  readonly seed?: number;
  readonly previousText?: string;
  readonly nextText?: string;
  readonly previousRequestIds?: string[];
  readonly nextRequestIds?: string[];
}

/**
 * TTS Response interface
 */
export interface TtsResponse {
  readonly audioData: Buffer;
  readonly contentType: string;
  readonly requestId?: string;
  readonly metadata?: {
    characterCount: number;
    requestTime: number;
  };
}

/**
 * STT Request interface
 */
export interface SttRequest {
  readonly audioData: Buffer;
  readonly modelId?: string;
  readonly languageCode?: string;
  readonly numSpeakers?: number;
  readonly diarize?: boolean;
}

/**
 * STT Response interface
 */
export interface SttResponse {
  readonly transcript: string;
  readonly languageProbability?: number;
  readonly timestamps?: Array<{
    word: string;
    start: number;
    end: number;
    speaker?: number;
  }>;
  readonly speakers?: Array<{
    id: number;
    segments: Array<{
      start: number;
      end: number;
    }>;
  }>;
  readonly metadata?: {
    audioLengthMs: number;
    requestTime: number;
  };
}

/**
 * Streaming configuration for TTS
 */
export interface StreamingConfig {
  readonly chunkLengthSchedule?: number[];
  readonly enableSsmlParsing?: boolean;
  readonly optimizeStreamingLatency?: number;
}

/**
 * Error types for ElevenLabs API
 */
export interface ElevenLabsError extends Error {
  statusCode?: number;
  errorCode?: string;
  details?: unknown;
  isRetryable?: boolean;
}

/**
 * Rate limiting information
 */
export interface RateLimitInfo {
  readonly charactersUsed: number;
  readonly charactersLimit: number;
  readonly charactersRemaining: number;
  readonly resetTime?: Date;
  readonly concurrentRequests: number;
  readonly concurrentLimit: number;
}
