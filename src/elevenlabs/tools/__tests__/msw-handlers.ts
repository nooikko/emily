import { HttpResponse, http } from 'msw';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

export const elevenLabsHandlers = [
  // Text-to-Speech endpoint
  http.post(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/:voiceId`, async ({ request, params }) => {
    const { voiceId } = params;
    const body = (await request.json()) as any;

    // Simulate different error scenarios
    if (body.text === 'TIMEOUT_ERROR') {
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Timeout simulation
    }

    if (body.text === 'RATE_LIMIT_ERROR') {
      return HttpResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: { 'Retry-After': '60' },
        },
      );
    }

    if (body.text === 'AUTH_ERROR') {
      return HttpResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (body.text === 'VOICE_NOT_FOUND') {
      return HttpResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    if (body.text === 'TEXT_TOO_LONG') {
      return HttpResponse.json({ error: 'Text exceeds maximum length' }, { status: 413 });
    }

    if (voiceId === 'nonexistent-voice') {
      return HttpResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    // Simulate successful response
    const mockAudioData = Buffer.from('mock-audio-data');
    return new HttpResponse(mockAudioData, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mockAudioData.length.toString(),
      },
    });
  }),

  // Speech-to-Text endpoint
  http.post(`${ELEVENLABS_BASE_URL}/v1/speech-to-text`, async ({ request }) => {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return HttpResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Simulate different error scenarios based on file characteristics
    if (audioFile.size > 50 * 1024 * 1024) {
      // 50MB
      return HttpResponse.json({ error: 'Audio file too large' }, { status: 413 });
    }

    if (audioFile.name === 'unsupported-format.xyz') {
      return HttpResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
    }

    if (audioFile.name === 'language-detection-failed.wav') {
      return HttpResponse.json({ error: 'Could not detect language' }, { status: 422 });
    }

    if (audioFile.name === 'diarization-failed.wav') {
      return HttpResponse.json({ error: 'Speaker diarization failed' }, { status: 422 });
    }

    // Simulate successful transcription
    return HttpResponse.json({
      transcript: 'Hello, this is a mock transcription from MSW.',
      language_probability: 0.98,
      speakers: [
        {
          id: 0,
          segments: [{ start: 0.0, end: 2.5 }],
        },
      ],
      timestamps: [
        { word: 'Hello', start: 0.0, end: 0.5, speaker: 0 },
        { word: 'this', start: 0.6, end: 0.8, speaker: 0 },
        { word: 'is', start: 0.9, end: 1.0, speaker: 0 },
        { word: 'a', start: 1.1, end: 1.2, speaker: 0 },
        { word: 'mock', start: 1.3, end: 1.6, speaker: 0 },
        { word: 'transcription', start: 1.7, end: 2.2, speaker: 0 },
      ],
      metadata: {
        audio_length_ms: 2500,
        request_time: 1200,
      },
    });
  }),

  // Get Voices endpoint
  http.get(`${ELEVENLABS_BASE_URL}/v1/voices`, ({ request }) => {
    const url = new URL(request.url);
    const includeSettings = url.searchParams.get('include_settings') === 'true';

    // Simulate service unavailable error
    if (url.searchParams.get('simulate') === 'service_unavailable') {
      return HttpResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }

    // Simulate quota exceeded error
    if (url.searchParams.get('simulate') === 'quota_exceeded') {
      return HttpResponse.json({ error: 'Monthly quota exceeded' }, { status: 429 });
    }

    const mockVoices = [
      {
        voice_id: 'voice-1',
        name: 'Alice',
        description: 'A clear female voice',
        category: 'conversational',
        accent: 'american',
        gender: 'female',
        age: 'young_adult',
        use_case: 'narration',
        ...(includeSettings && {
          settings: {
            stability: 0.8,
            similarity_boost: 0.7,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      },
      {
        voice_id: 'voice-2',
        name: 'Bob',
        description: 'A deep male voice',
        category: 'conversational',
        accent: 'british',
        gender: 'male',
        age: 'middle_aged',
        use_case: 'audiobook',
        ...(includeSettings && {
          settings: {
            stability: 0.9,
            similarity_boost: 0.6,
            style: 0.1,
            use_speaker_boost: false,
          },
        }),
      },
    ];

    return HttpResponse.json({ voices: mockVoices });
  }),

  // Health check endpoint (simulated)
  http.get(`${ELEVENLABS_BASE_URL}/v1/user`, ({ request }) => {
    const url = new URL(request.url);

    // Simulate service outage
    if (url.searchParams.get('simulate') === 'outage') {
      return new HttpResponse(null, { status: 500 });
    }

    // Simulate partial degradation
    if (url.searchParams.get('simulate') === 'degraded') {
      return HttpResponse.json({ error: 'Partial service outage - TTS unavailable' }, { status: 503 });
    }

    // Simulate authentication error
    if (url.searchParams.get('simulate') === 'auth_error') {
      return HttpResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Successful health check
    return HttpResponse.json({
      user_id: 'user-123',
      subscription: {
        tier: 'free',
        character_count: 1000,
        character_limit: 10000,
      },
    });
  }),
];

export default elevenLabsHandlers;
