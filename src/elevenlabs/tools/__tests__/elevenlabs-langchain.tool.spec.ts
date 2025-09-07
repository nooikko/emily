import { Test, TestingModule } from '@nestjs/testing';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { ElevenLabsBasicService } from '../../services/elevenlabs-basic.service';
import type { ElevenLabsHealthStatus, SttResponse, TtsResponse, VoiceInfo } from '../../types/elevenlabs-config.interface';
import { ElevenLabsLangChainTool, ElevenLabsToolResponse, SttToolResult, TtsToolResult } from '../elevenlabs-langchain.tool';
import elevenLabsHandlers from './msw-handlers';

describe('ElevenLabsLangChainTool', () => {
  let tool: ElevenLabsLangChainTool;
  let elevenLabsService: jest.Mocked<ElevenLabsBasicService>;

  // MSW server for HTTP mocking
  const server = setupServer(...elevenLabsHandlers);

  const mockTtsResponse: TtsResponse = {
    audioData: Buffer.from('mock-audio-data'),
    contentType: 'audio/mpeg',
    metadata: {
      characterCount: 13,
      requestTime: 1500,
    },
  };

  const mockSttResponse: SttResponse = {
    transcript: 'Hello, this is a test transcript.',
    languageProbability: 0.95,
    timestamps: [
      { word: 'Hello', start: 0, end: 0.5, speaker: 0 },
      { word: 'this', start: 0.6, end: 0.8, speaker: 0 },
    ],
    speakers: [{ id: 0, segments: [{ start: 0, end: 2.5 }] }],
    metadata: {
      audioLengthMs: 2500,
      requestTime: 2000,
    },
  };

  const mockVoices: VoiceInfo[] = [
    {
      voiceId: 'voice-1',
      name: 'Alice',
      description: 'A clear female voice',
      category: 'conversational',
      labels: {
        accent: 'american',
        gender: 'female',
        age: 'young_adult',
        use_case: 'narration',
      },
      availableForTiers: ['free', 'starter', 'growing', 'professional'],
      settings: {
        stability: 0.8,
        similarityBoost: 0.7,
        style: 0.2,
        useSpeakerBoost: true,
      },
    },
    {
      voiceId: 'voice-2',
      name: 'Bob',
      description: 'A deep male voice',
      category: 'conversational',
      labels: {
        accent: 'british',
        gender: 'male',
        age: 'middle_aged',
        use_case: 'audiobook',
      },
      availableForTiers: ['free', 'starter'],
    },
  ];

  const mockHealthStatus: ElevenLabsHealthStatus = {
    connected: true,
    endpoint: 'https://api.elevenlabs.io',
    lastChecked: Date.now(),
  };

  beforeAll(() => {
    // Start MSW server
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    // Stop MSW server
    server.close();
  });

  beforeEach(async () => {
    // Reset MSW handlers
    server.resetHandlers();

    const mockElevenLabsService = {
      generateSpeech: jest.fn(),
      transcribeAudio: jest.fn(),
      getVoices: jest.fn(),
      checkHealth: jest.fn(),
      isAvailable: jest.fn(),
      getStatistics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevenLabsLangChainTool,
        {
          provide: ElevenLabsBasicService,
          useValue: mockElevenLabsService,
        },
      ],
    }).compile();

    tool = module.get<ElevenLabsLangChainTool>(ElevenLabsLangChainTool);
    elevenLabsService = module.get(ElevenLabsBasicService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTools', () => {
    it('should return all available tools', () => {
      const tools = tool.getAllTools();

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toEqual([
        'elevenlabs_text_to_speech',
        'elevenlabs_speech_to_text',
        'elevenlabs_get_voices',
        'elevenlabs_health_check',
      ]);
    });

    it('should return the same tools instance on multiple calls', () => {
      const tools1 = tool.getAllTools();
      const tools2 = tool.getAllTools();

      expect(tools1).toBe(tools2);
    });
  });

  describe('getTool', () => {
    it('should return specific tool by name', () => {
      const ttsTool = tool.getTool('elevenlabs_text_to_speech');
      const sttTool = tool.getTool('elevenlabs_speech_to_text');

      expect(ttsTool).toBeDefined();
      expect(ttsTool!.name).toBe('elevenlabs_text_to_speech');
      expect(sttTool).toBeDefined();
      expect(sttTool!.name).toBe('elevenlabs_speech_to_text');
    });

    it('should return null for non-existent tool', () => {
      const tool_result = tool.getTool('non_existent_tool');

      expect(tool_result).toBeNull();
    });
  });

  describe('text-to-speech tool', () => {
    let ttsTool: any;

    beforeEach(() => {
      ttsTool = tool.getTool('elevenlabs_text_to_speech');
    });

    it('should generate speech successfully', async () => {
      elevenLabsService.generateSpeech.mockResolvedValue(mockTtsResponse);

      const result = await ttsTool.func({
        text: 'Hello, world!',
        voiceId: 'voice-1',
        stability: 0.8,
        similarityBoost: 0.7,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.audioBase64).toBeDefined();
      expect(parsedResult.contentType).toBe('audio/mpeg');
      expect(parsedResult.metadata.characterCount).toBe(13);

      expect(elevenLabsService.generateSpeech).toHaveBeenCalledWith({
        text: 'Hello, world!',
        voiceId: 'voice-1',
        modelId: undefined,
        voiceSettings: {
          stability: 0.8,
          similarityBoost: 0.7,
          style: undefined,
          useSpeakerBoost: undefined,
        },
      });
    });

    it('should handle TTS errors gracefully', async () => {
      const error = new Error('TTS failed');
      (error as any).errorCode = 'TTS_ERROR';
      elevenLabsService.generateSpeech.mockRejectedValue(error);

      const result = await ttsTool.func({
        text: 'Hello, world!',
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBe('TTS failed');
      expect(parsedResult.errorCode).toBe('TTS_ERROR');
    });

    it('should validate input schema', () => {
      expect(ttsTool.schema).toBeDefined();

      // Test valid input
      const validInput = {
        text: 'Hello, world!',
        voiceId: 'voice-1',
        stability: 0.8,
      };
      expect(() => ttsTool.schema.parse(validInput)).not.toThrow();

      // Test invalid input
      const invalidInput = {
        text: '', // Empty text should fail
      };
      expect(() => ttsTool.schema.parse(invalidInput)).toThrow();
    });
  });

  describe('speech-to-text tool', () => {
    let sttTool: any;

    beforeEach(() => {
      sttTool = tool.getTool('elevenlabs_speech_to_text');
    });

    it('should transcribe speech successfully', async () => {
      elevenLabsService.transcribeAudio.mockResolvedValue(mockSttResponse);

      const audioBase64 = Buffer.from('mock-audio-data').toString('base64');
      const result = await sttTool.func({
        audioBase64,
        languageCode: 'en',
        diarize: true,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.transcript).toBe('Hello, this is a test transcript.');
      expect(parsedResult.languageProbability).toBe(0.95);
      expect(parsedResult.speakers).toHaveLength(1);
      expect(parsedResult.timestamps).toHaveLength(2);

      expect(elevenLabsService.transcribeAudio).toHaveBeenCalledWith({
        audioData: expect.any(Buffer),
        modelId: undefined,
        languageCode: 'en',
        numSpeakers: undefined,
        diarize: true,
      });
    });

    it('should handle STT errors gracefully', async () => {
      const error = new Error('STT failed');
      (error as any).errorCode = 'STT_ERROR';
      elevenLabsService.transcribeAudio.mockRejectedValue(error);

      const audioBase64 = Buffer.from('mock-audio-data').toString('base64');
      const result = await sttTool.func({
        audioBase64,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBe('STT failed');
      expect(parsedResult.errorCode).toBe('STT_ERROR');
    });

    it('should validate input schema', () => {
      expect(sttTool.schema).toBeDefined();

      // Test valid input
      const validInput = {
        audioBase64: 'bW9jay1hdWRpby1kYXRh', // base64 encoded string
        languageCode: 'en',
        numSpeakers: 2,
      };
      expect(() => sttTool.schema.parse(validInput)).not.toThrow();

      // Test invalid input
      const invalidInput = {
        audioBase64: '', // Empty base64 should fail
      };
      expect(() => sttTool.schema.parse(invalidInput)).toThrow();
    });
  });

  describe('get-voices tool', () => {
    let voicesTool: any;

    beforeEach(() => {
      voicesTool = tool.getTool('elevenlabs_get_voices');
    });

    it('should get voices successfully', async () => {
      elevenLabsService.getVoices.mockResolvedValue(mockVoices);

      const result = await voicesTool.func({
        includeSettings: true,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.voices).toHaveLength(2);
      expect(parsedResult.count).toBe(2);

      // Check first voice
      expect(parsedResult.voices[0]).toMatchObject({
        voiceId: 'voice-1',
        name: 'Alice',
        description: 'A clear female voice',
        category: 'conversational',
        settings: mockVoices[0].settings,
      });

      // Check second voice (no settings)
      expect(parsedResult.voices[1]).not.toHaveProperty('settings');
    });

    it('should get voices without settings when not requested', async () => {
      elevenLabsService.getVoices.mockResolvedValue(mockVoices);

      const result = await voicesTool.func({
        includeSettings: false,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.voices[0]).not.toHaveProperty('settings');
    });

    it('should handle get voices errors gracefully', async () => {
      const error = new Error('Failed to get voices');
      (error as any).errorCode = 'VOICES_ERROR';
      elevenLabsService.getVoices.mockRejectedValue(error);

      const result = await voicesTool.func({});

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBe('Failed to get voices');
      expect(parsedResult.errorCode).toBe('VOICES_ERROR');
    });
  });

  describe('health-check tool', () => {
    let healthTool: any;

    beforeEach(() => {
      healthTool = tool.getTool('elevenlabs_health_check');
    });

    it('should perform health check successfully', async () => {
      elevenLabsService.checkHealth.mockResolvedValue(mockHealthStatus);

      const result = await healthTool.func({
        detailed: false,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.connected).toBe(true);
      expect(parsedResult.endpoint).toBe('https://api.elevenlabs.io');
      expect(parsedResult.status).toBe('healthy');
      expect(parsedResult.lastChecked).toBeDefined();
    });

    it('should return detailed statistics when requested', async () => {
      const mockStats = {
        initialized: true,
        available: true,
        lastHealthCheck: mockHealthStatus,
        activeRequests: 0,
        configuration: {
          baseUrl: 'https://api.elevenlabs.io',
          defaultTtsModel: 'eleven_multilingual_v2',
          defaultSttModel: 'whisper-1',
          maxConcurrentRequests: 3,
          maxRetries: 3,
        },
      };

      elevenLabsService.checkHealth.mockResolvedValue(mockHealthStatus);
      elevenLabsService.getStatistics.mockReturnValue(mockStats);

      const result = await healthTool.func({
        detailed: true,
      });

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.statistics).toEqual(
        expect.objectContaining({
          initialized: true,
          available: true,
          activeRequests: 0,
          configuration: expect.objectContaining({
            baseUrl: 'https://api.elevenlabs.io',
            defaultTtsModel: 'eleven_multilingual_v2',
            defaultSttModel: 'whisper-1',
            maxConcurrentRequests: 3,
            maxRetries: 3,
          }),
        }),
      );
    });

    it('should handle unhealthy status', async () => {
      const unhealthyStatus = {
        ...mockHealthStatus,
        connected: false,
        error: 'API key invalid',
      };
      elevenLabsService.checkHealth.mockResolvedValue(unhealthyStatus);

      const result = await healthTool.func({});

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.connected).toBe(false);
      expect(parsedResult.status).toBe('unhealthy');
      expect(parsedResult.error).toBe('API key invalid');
    });

    it('should handle health check errors gracefully', async () => {
      const error = new Error('Health check failed');
      elevenLabsService.checkHealth.mockRejectedValue(error);

      const result = await healthTool.func({});

      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.connected).toBe(false);
      expect(parsedResult.error).toBe('Health check failed');
      expect(parsedResult.errorCode).toBe('HEALTH_CHECK_ERROR');
    });
  });

  describe('utility methods', () => {
    it('should return tool names', () => {
      const toolNames = tool.getToolNames();

      expect(toolNames).toEqual(['elevenlabs_text_to_speech', 'elevenlabs_speech_to_text', 'elevenlabs_get_voices', 'elevenlabs_health_check']);
    });

    it('should check service availability', () => {
      elevenLabsService.isAvailable.mockReturnValue(true);

      const isAvailable = tool.isServiceAvailable();

      expect(isAvailable).toBe(true);
      expect(elevenLabsService.isAvailable).toHaveBeenCalled();
    });

    it('should get service statistics', () => {
      const mockStats = {
        initialized: true,
        available: true,
        lastHealthCheck: null,
        activeRequests: 2,
        configuration: {
          baseUrl: 'https://api.elevenlabs.io',
          defaultTtsModel: 'eleven_multilingual_v2',
          defaultSttModel: 'whisper-1',
          maxConcurrentRequests: 3,
          maxRetries: 3,
        },
      };
      elevenLabsService.getStatistics.mockReturnValue(mockStats);

      const stats = tool.getServiceStatistics();

      expect(stats).toEqual(mockStats);
      expect(elevenLabsService.getStatistics).toHaveBeenCalled();
    });
  });

  describe('tool descriptions and schemas', () => {
    it('should have proper descriptions for all tools', () => {
      const tools = tool.getAllTools();

      for (const toolInstance of tools) {
        expect(toolInstance.description).toBeDefined();
        expect(toolInstance.description.length).toBeGreaterThan(50);
        expect(toolInstance.schema).toBeDefined();
      }
    });

    it('should have comprehensive TTS tool description', () => {
      const ttsTool = tool.getTool('elevenlabs_text_to_speech');

      expect(ttsTool!.description).toContain('Convert text to speech');
      expect(ttsTool!.description).toContain('Use cases:');
      expect(ttsTool!.description).toContain('Returns base64-encoded audio');
    });

    it('should have comprehensive STT tool description', () => {
      const sttTool = tool.getTool('elevenlabs_speech_to_text');

      expect(sttTool!.description).toContain('Convert speech audio to text');
      expect(sttTool!.description).toContain('speaker diarization');
      expect(sttTool!.description).toContain('base64-encoded data');
    });
  });

  describe('comprehensive error scenarios', () => {
    describe('TTS tool error handling', () => {
      let ttsTool: any;

      beforeEach(() => {
        ttsTool = tool.getTool('elevenlabs_text_to_speech');
      });

      it('should handle network timeout errors', async () => {
        const timeoutError = new Error('Request timeout');
        (timeoutError as any).code = 'ETIMEDOUT';
        elevenLabsService.generateSpeech.mockRejectedValue(timeoutError);

        const result = await ttsTool.func({ text: 'Test timeout' });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Request timeout');
        expect(parsedResult.errorCode).toBe('TTS_ERROR');
      });

      it('should handle API rate limiting errors', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        (rateLimitError as any).errorCode = 'RATE_LIMIT_EXCEEDED';
        (rateLimitError as any).retryAfter = 60;
        elevenLabsService.generateSpeech.mockRejectedValue(rateLimitError);

        const result = await ttsTool.func({ text: 'Test rate limit' });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Rate limit exceeded');
        expect(parsedResult.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      });

      it('should handle authentication errors', async () => {
        const authError = new Error('Invalid API key');
        (authError as any).errorCode = 'UNAUTHORIZED';
        elevenLabsService.generateSpeech.mockRejectedValue(authError);

        const result = await ttsTool.func({ text: 'Test auth error' });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Invalid API key');
        expect(parsedResult.errorCode).toBe('UNAUTHORIZED');
      });

      it('should handle text length validation errors', async () => {
        const textTooLongError = new Error('Text exceeds maximum length');
        (textTooLongError as any).errorCode = 'TEXT_TOO_LONG';
        elevenLabsService.generateSpeech.mockRejectedValue(textTooLongError);

        const longText = 'a'.repeat(6000); // Exceeds 5000 char limit
        const result = await ttsTool.func({ text: longText });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Text exceeds maximum length');
        expect(parsedResult.errorCode).toBe('TEXT_TOO_LONG');
      });

      it('should handle voice not found errors', async () => {
        const voiceNotFoundError = new Error('Voice not found');
        (voiceNotFoundError as any).errorCode = 'VOICE_NOT_FOUND';
        elevenLabsService.generateSpeech.mockRejectedValue(voiceNotFoundError);

        const result = await ttsTool.func({
          text: 'Test voice error',
          voiceId: 'nonexistent-voice',
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Voice not found');
        expect(parsedResult.errorCode).toBe('VOICE_NOT_FOUND');
      });

      it('should handle corrupted audio data', async () => {
        const corruptedResponse: TtsResponse = {
          audioData: Buffer.from('corrupted-data'),
          contentType: 'audio/mpeg',
          metadata: {
            characterCount: 13,
            requestTime: 1500,
          },
        };

        elevenLabsService.generateSpeech.mockResolvedValue(corruptedResponse);

        const result = await ttsTool.func({ text: 'Test corrupted audio' });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(true);
        expect(parsedResult.audioBase64).toBe(corruptedResponse.audioData.toString('base64'));
        expect(parsedResult.metadata.audioSize).toBe(corruptedResponse.audioData.length);
      });
    });

    describe('STT tool error handling', () => {
      let sttTool: any;

      beforeEach(() => {
        sttTool = tool.getTool('elevenlabs_speech_to_text');
      });

      it('should handle unsupported audio format errors', async () => {
        const formatError = new Error('Unsupported audio format');
        (formatError as any).errorCode = 'UNSUPPORTED_FORMAT';
        elevenLabsService.transcribeAudio.mockRejectedValue(formatError);

        const result = await sttTool.func({
          audioBase64: Buffer.from('invalid-audio-data').toString('base64'),
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Unsupported audio format');
        expect(parsedResult.errorCode).toBe('UNSUPPORTED_FORMAT');
      });

      it('should handle audio file too large errors', async () => {
        const fileSizeError = new Error('Audio file too large');
        (fileSizeError as any).errorCode = 'FILE_TOO_LARGE';
        elevenLabsService.transcribeAudio.mockRejectedValue(fileSizeError);

        const largeAudioData = Buffer.alloc(50 * 1024 * 1024); // 50MB
        const result = await sttTool.func({
          audioBase64: largeAudioData.toString('base64'),
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Audio file too large');
        expect(parsedResult.errorCode).toBe('FILE_TOO_LARGE');
      });

      it('should handle invalid base64 audio data', async () => {
        const base64Error = new Error('Invalid base64 data');
        elevenLabsService.transcribeAudio.mockImplementation(() => {
          throw base64Error;
        });

        const result = await sttTool.func({
          audioBase64: 'invalid-base64-data!!!',
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Invalid base64 data');
      });

      it('should handle language detection failures', async () => {
        const languageError = new Error('Could not detect language');
        (languageError as any).errorCode = 'LANGUAGE_DETECTION_FAILED';
        elevenLabsService.transcribeAudio.mockRejectedValue(languageError);

        const result = await sttTool.func({
          audioBase64: Buffer.from('audio-data').toString('base64'),
          languageCode: 'unknown',
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Could not detect language');
        expect(parsedResult.errorCode).toBe('LANGUAGE_DETECTION_FAILED');
      });

      it('should handle speaker diarization errors', async () => {
        const diarizationError = new Error('Speaker diarization failed');
        (diarizationError as any).errorCode = 'DIARIZATION_FAILED';
        elevenLabsService.transcribeAudio.mockRejectedValue(diarizationError);

        const result = await sttTool.func({
          audioBase64: Buffer.from('audio-data').toString('base64'),
          diarize: true,
          numSpeakers: 3,
        });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Speaker diarization failed');
        expect(parsedResult.errorCode).toBe('DIARIZATION_FAILED');
      });
    });

    describe('Voices tool error handling', () => {
      let voicesTool: any;

      beforeEach(() => {
        voicesTool = tool.getTool('elevenlabs_get_voices');
      });

      it('should handle API service unavailable errors', async () => {
        const serviceError = new Error('Service temporarily unavailable');
        (serviceError as any).errorCode = 'SERVICE_UNAVAILABLE';
        elevenLabsService.getVoices.mockRejectedValue(serviceError);

        const result = await voicesTool.func({});
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Service temporarily unavailable');
        expect(parsedResult.errorCode).toBe('SERVICE_UNAVAILABLE');
      });

      it('should handle quota exceeded errors', async () => {
        const quotaError = new Error('Monthly quota exceeded');
        (quotaError as any).errorCode = 'QUOTA_EXCEEDED';
        elevenLabsService.getVoices.mockRejectedValue(quotaError);

        const result = await voicesTool.func({ includeSettings: true });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.error).toBe('Monthly quota exceeded');
        expect(parsedResult.errorCode).toBe('QUOTA_EXCEEDED');
      });
    });

    describe('Health check tool error handling', () => {
      let healthTool: any;

      beforeEach(() => {
        healthTool = tool.getTool('elevenlabs_health_check');
      });

      it('should handle complete service outage', async () => {
        const outageError = new Error('Service is down');
        elevenLabsService.checkHealth.mockRejectedValue(outageError);

        const result = await healthTool.func({ detailed: true });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(false);
        expect(parsedResult.connected).toBe(false);
        expect(parsedResult.error).toBe('Service is down');
        expect(parsedResult.errorCode).toBe('HEALTH_CHECK_ERROR');
      });

      it('should handle partial service degradation', async () => {
        const degradedHealth: ElevenLabsHealthStatus = {
          connected: false,
          endpoint: 'https://api.elevenlabs.io',
          lastChecked: Date.now(),
          error: 'Partial service outage - TTS unavailable',
        };

        elevenLabsService.checkHealth.mockResolvedValue(degradedHealth);

        const result = await healthTool.func({ detailed: false });
        const parsedResult = JSON.parse(result);

        expect(parsedResult.success).toBe(true);
        expect(parsedResult.connected).toBe(false);
        expect(parsedResult.status).toBe('unhealthy');
        expect(parsedResult.error).toBe('Partial service outage - TTS unavailable');
      });
    });
  });

  describe('input validation through tool execution', () => {
    it('should validate TTS tool inputs through execution', async () => {
      const ttsTool = tool.getTool('elevenlabs_text_to_speech') as any;

      // Test minimum valid input
      elevenLabsService.generateSpeech.mockResolvedValue(mockTtsResponse);
      const minResult = await ttsTool.func({ text: 'a' });
      const minParsed = JSON.parse(minResult);
      expect(minParsed.success).toBe(true);

      // Test input validation at boundaries
      elevenLabsService.generateSpeech.mockResolvedValue(mockTtsResponse);
      const maxResult = await ttsTool.func({
        text: 'a'.repeat(5000),
        stability: 1,
        similarityBoost: 1,
        style: 1,
      });
      const maxParsed = JSON.parse(maxResult);
      expect(maxParsed.success).toBe(true);
    });

    it('should validate STT tool inputs through execution', async () => {
      const sttTool = tool.getTool('elevenlabs_speech_to_text') as any;

      elevenLabsService.transcribeAudio.mockResolvedValue(mockSttResponse);

      // Test minimum valid input
      const minResult = await sttTool.func({ audioBase64: 'YQ==' });
      const minParsed = JSON.parse(minResult);
      expect(minParsed.success).toBe(true);

      // Test with maximum speakers
      const maxSpeakersResult = await sttTool.func({
        audioBase64: 'YQ==',
        numSpeakers: 10,
        diarize: true,
      });
      const maxSpeakersParsed = JSON.parse(maxSpeakersResult);
      expect(maxSpeakersParsed.success).toBe(true);
    });
  });

  describe('type safety validation', () => {
    it('should return properly typed TTS tool results', async () => {
      elevenLabsService.generateSpeech.mockResolvedValue(mockTtsResponse);

      const ttsTool = tool.getTool('elevenlabs_text_to_speech') as any;
      const result = await ttsTool?.func({ text: 'Test typing' });
      const parsedResult: ElevenLabsToolResponse<TtsToolResult> = JSON.parse(result);

      // Type assertions to ensure proper typing
      expect(parsedResult.success).toBe(true);
      expect(typeof (parsedResult as any).audioBase64).toBe('string');
      expect(typeof (parsedResult as any).contentType).toBe('string');
      expect(typeof (parsedResult as any).metadata.characterCount).toBe('number');
      expect(typeof (parsedResult as any).metadata.requestTime).toBe('number');
      expect(typeof (parsedResult as any).metadata.audioSize).toBe('number');
    });

    it('should return properly typed STT tool results', async () => {
      elevenLabsService.transcribeAudio.mockResolvedValue(mockSttResponse);

      const sttTool = tool.getTool('elevenlabs_speech_to_text') as any;
      const result = await sttTool?.func({
        audioBase64: Buffer.from('test').toString('base64'),
      });
      const parsedResult: ElevenLabsToolResponse<SttToolResult> = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(typeof (parsedResult as any).transcript).toBe('string');
      expect(typeof (parsedResult as any).languageProbability).toBe('number');
      expect(Array.isArray((parsedResult as any).speakers)).toBe(true);
      expect(Array.isArray((parsedResult as any).timestamps)).toBe(true);
      expect(typeof (parsedResult as any).metadata.audioLengthMs).toBe('number');
      expect(typeof (parsedResult as any).metadata.requestTime).toBe('number');
    });

    it('should handle service unavailability checks', () => {
      elevenLabsService.isAvailable.mockReturnValue(false);

      const isAvailable = tool.isServiceAvailable();
      expect(typeof isAvailable).toBe('boolean');
      expect(isAvailable).toBe(false);
    });
  });

  describe('MSW HTTP integration tests', () => {
    // Note: These tests demonstrate MSW integration but don't replace unit tests
    // They show how HTTP-level errors would be handled if the service made real HTTP calls

    it('should demonstrate TTS API error handling with MSW', async () => {
      // Override the handler to simulate API call
      server.use(
        http.post('https://api.elevenlabs.io/v1/text-to-speech/test-voice', () => {
          return HttpResponse.json({ error: 'Voice not found' }, { status: 404 });
        }),
      );

      // This test demonstrates MSW setup - actual tool still uses mocked service
      const voiceNotFoundError = new Error('Voice not found');
      (voiceNotFoundError as any).errorCode = 'VOICE_NOT_FOUND';
      elevenLabsService.generateSpeech.mockRejectedValue(voiceNotFoundError);

      const ttsTool = tool.getTool('elevenlabs_text_to_speech') as any;
      const result = await ttsTool?.func({
        text: 'Test with MSW',
        voiceId: 'test-voice',
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.errorCode).toBe('VOICE_NOT_FOUND');
    });

    it('should demonstrate STT API error handling with MSW', async () => {
      // Override the handler to simulate unsupported format error
      server.use(
        http.post('https://api.elevenlabs.io/v1/speech-to-text', () => {
          return HttpResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
        }),
      );

      // Mock the service to simulate the error
      const formatError = new Error('Unsupported audio format');
      (formatError as any).errorCode = 'UNSUPPORTED_FORMAT';
      elevenLabsService.transcribeAudio.mockRejectedValue(formatError);

      const sttTool = tool.getTool('elevenlabs_speech_to_text') as any;
      const result = await sttTool?.func({
        audioBase64: Buffer.from('invalid-audio').toString('base64'),
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.errorCode).toBe('UNSUPPORTED_FORMAT');
    });

    it('should demonstrate rate limiting with MSW', async () => {
      // Override the handler to simulate rate limiting
      server.use(
        http.post('https://api.elevenlabs.io/v1/text-to-speech/:voiceId', () => {
          return HttpResponse.json(
            { error: 'Rate limit exceeded' },
            {
              status: 429,
              headers: { 'Retry-After': '60' },
            },
          );
        }),
      );

      // Mock the service to simulate rate limiting
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).errorCode = 'RATE_LIMIT_EXCEEDED';
      elevenLabsService.generateSpeech.mockRejectedValue(rateLimitError);

      const ttsTool = tool.getTool('elevenlabs_text_to_speech') as any;
      const result = await ttsTool?.func({ text: 'Test rate limiting' });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should demonstrate successful API response with MSW', async () => {
      // Use default MSW handler for successful response
      elevenLabsService.generateSpeech.mockResolvedValue(mockTtsResponse);

      const ttsTool = tool.getTool('elevenlabs_text_to_speech') as any;
      const result = await ttsTool?.func({
        text: 'Successful MSW test',
        voiceId: 'voice-1',
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.audioBase64).toBeDefined();
      expect(parsedResult.contentType).toBe('audio/mpeg');
    });

    it('should demonstrate voices API error handling with MSW', async () => {
      // Override to simulate service unavailable
      server.use(
        http.get('https://api.elevenlabs.io/v1/voices', () => {
          return HttpResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
        }),
      );

      // Mock the service error
      const serviceError = new Error('Service temporarily unavailable');
      (serviceError as any).errorCode = 'SERVICE_UNAVAILABLE';
      elevenLabsService.getVoices.mockRejectedValue(serviceError);

      const voicesTool = tool.getTool('elevenlabs_get_voices') as any;
      const result = await voicesTool?.func({});

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.errorCode).toBe('SERVICE_UNAVAILABLE');
    });

    it('should demonstrate health check API responses with MSW', async () => {
      // Test healthy response
      elevenLabsService.checkHealth.mockResolvedValue(mockHealthStatus);

      const healthTool = tool.getTool('elevenlabs_health_check');
      const result = await (healthTool as any)?.func({ detailed: false });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.connected).toBe(true);
      expect(parsedResult.status).toBe('healthy');

      // Test unhealthy response by overriding handler
      server.use(
        http.get('https://api.elevenlabs.io/v1/user', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      // Mock unhealthy response
      const _unhealthyStatus = {
        ...mockHealthStatus,
        connected: false,
        error: 'Service is down',
      };
      elevenLabsService.checkHealth.mockRejectedValue(new Error('Service is down'));

      const unhealthyResult = await (healthTool as any)?.func({});
      const unhealthyParsed = JSON.parse(unhealthyResult);
      expect(unhealthyParsed.success).toBe(false);
      expect(unhealthyParsed.connected).toBe(false);
    });
  });
});
