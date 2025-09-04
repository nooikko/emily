# Research: ElevenLabs NestJS Integration
Date: 2025-09-01
Requested by: User

## Summary
Comprehensive research on ElevenLabs API integration for NestJS applications, covering STT/TTS capabilities, authentication, rate limiting, TypeScript support, and NestJS integration patterns. ElevenLabs provides robust APIs for both speech-to-text and text-to-speech with extensive streaming capabilities and official TypeScript support.

## Prior Research
No existing AI_RESEARCH files found for this topic.

## Current Findings

### 1. ElevenLabs API Overview

#### Text-to-Speech (TTS) Capabilities
- **Models Available**: Eleven v3, Multilingual v2, Eleven Flash v2.5, Eleven Turbo v2.5
- **Character Limits**: 3,000 to 40,000 characters depending on model
- **Language Support**: 29-70+ languages
- **Features**: Streaming and non-streaming endpoints, WebSocket support for real-time generation

#### TTS Endpoints
- **Main Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/:voice_id`
- **Available Endpoints**:
  - Create speech
  - Create speech with timestamps
  - Stream speech
  - Stream speech with timestamps
  - WebSocket endpoints for single and multi-context streaming

#### Speech-to-Text (STT) Capabilities
- **Model**: Scribe v1 with 99 language support
- **Features**: 
  - Precise word-level timestamps
  - Speaker diarization
  - Dynamic audio tagging
  - File size limit: 3.0 GB

#### STT Endpoint
- **Main Endpoint**: `POST https://api.elevenlabs.io/v1/speech-to-text`
- **Parameters**:
  - `model_id` (required): 'scribe_v1'
  - `file` (optional): Audio/video file
  - `language_code` (optional): Auto-detect or specify
  - `num_speakers` (optional): Speaker count prediction
  - `diarize` (optional): Speaker change annotation
- **Response**: Transcribed text, language probability, word-level timestamps, optional speaker identification

#### Supported Audio Formats and Codecs
- Supports major audio/video formats (specific formats not detailed in documentation)
- Default TTS output format: `mp3_44100_128`
- Configurable audio output formats available

#### WebSocket/Streaming Support
- **WebSocket Endpoint**: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
- **Use Cases**: Generating audio from partial text input, precise word-to-audio alignment
- **Features**: Text chunks streaming, audio output with alignment data
- **Limitations**: Higher latency than HTTP requests, more complex implementation
- **HTTP Streaming**: Available for Text to Speech, Voice Changer, and Audio Isolation APIs using chunked transfer encoding

### 2. Authentication Methods

#### API Key Management
- **Header**: `xi-api-key: ELEVENLABS_API_KEY`
- **Security**: Treat as secret credential, do not expose in client-side code
- **Scoping**: API keys can have scope restrictions and custom credit quota controls
- **Environment Variable Pattern**: Store in environment variables for security

#### Best Practices
- Never share API keys or expose in client-side code
- Use environment variables for key storage
- Understand scope and usage limitations of each key

### 3. Rate Limits & Error Handling

#### Rate Limiting Constraints
- **Concurrency Limits**: Depend on subscription tier
- **Character Limits**:
  - Non signed-in: 333 characters
  - Free: 2,500 characters
  - Paid plans: 5,000 characters
- **Different limits for**: Conversational AI and Speech to Text

#### Common Error Codes
- **429 Too Many Requests**:
  - `too_many_concurrent_requests`: Exceeded concurrent request limit
  - `system_busy`: High traffic, retry recommended
- **400/401 Errors**: Usually API key issues or character limit exceeded

#### Retry Strategies and Backoff Patterns
1. **Request Queuing**: Implement FIFO queue system using libraries like Bull for Node.js
2. **Exponential Backoff**: Increasing intervals for retries
3. **Retry-After Header**: Use 429 response header for retry timing
4. **Batch Retry**: Enhanced batch retry functionality added in 2025 updates

#### Error Handling Best Practices
- Cache voice IDs locally using `/v1/voices` endpoint
- Implement real-time alerts for rate limit exceeded events
- Analyze request patterns to reduce concurrent requests

### 4. TypeScript Types

#### Official Package Support
- **Primary Package**: `elevenlabs` (v1.59.0) - includes built-in TypeScript support
- **Alternative**: `@elevenlabs/elevenlabs-js` - official JavaScript/TypeScript SDK
- **Browser SDK**: `@11labs/client`
- **React SDK**: `@11labs/react`

#### Type Safety Recommendations
- No separate `@types/elevenlabs` package needed (built-in types)
- Official packages include comprehensive TypeScript definitions
- Avoid community-maintained `elevenlabs-ts` (outdated, not official)

#### Interface Patterns
```typescript
// Example client initialization
const client = new ElevenLabsClient({ apiKey: "YOUR_API_KEY" });

// TTS example
await client.textToSpeech.convert("voice_id", {
    text: "Text to convert",
    outputFormat: "mp3_44100_128"
});

// Streaming example
const audioStream = await elevenlabs.textToSpeech.stream('voice_id', {
    text: 'Text to stream',
    modelId: 'eleven_multilingual_v2'
});
```

### 5. NestJS Integration Patterns

#### Service/Module Structure Recommendations
1. **Dedicated Service Modules**: Create separate modules for ElevenLabs integration
2. **Use NestJS HttpService**: Built-in HttpService with Axios for HTTP requests
3. **Injectable Services**: Use `@Injectable()` decorator for service classes
4. **Modular Architecture**: Maintain separation of concerns

#### Dependency Injection Patterns
- Use NestJS's built-in dependency injection system
- Integrate `@nestjs/axios` package for HTTP client functionality
- Configure HttpModule in your ElevenLabs module

#### Best Practices for External API Integration
1. **Secure Configuration**: Use environment variables with dotenv package
2. **Error Handling**: Implement RxJS operators (map, catchError) for response handling
3. **Rate Limiting**: Use NestJS ThrottlerModule to prevent API limit breaches
4. **Type Safety**: Leverage TypeScript for better development experience
5. **Auto-generated Clients**: Consider generating TypeScript clients from OpenAPI specs
6. **Dependency Management**: Keep packages updated for security

## Key Takeaways

- **Official TypeScript Support**: Use `elevenlabs` npm package with built-in types
- **Streaming Capabilities**: Both HTTP streaming and WebSocket support available
- **Rate Limit Management**: Implement queuing and exponential backoff strategies
- **Security**: Store API keys in environment variables, never expose client-side
- **NestJS Integration**: Use dedicated modules with HttpService and proper DI patterns
- **Error Handling**: Implement comprehensive error handling for 429, 400, and 401 errors
- **Character Limits**: Vary by subscription tier (333-5,000 characters)
- **Multiple Endpoints**: Separate endpoints for TTS, STT, streaming, and WebSocket operations

## Sources

- https://elevenlabs.io/docs - Official ElevenLabs documentation
- https://elevenlabs.io/docs/api-reference/speech-to-text - STT API reference
- https://elevenlabs.io/docs/api-reference/text-to-speech - TTS API reference
- https://elevenlabs.io/docs/api-reference/streaming - Streaming documentation
- https://elevenlabs.io/docs/api-reference/websockets - WebSocket documentation
- https://elevenlabs.io/docs/api-reference/authentication - Authentication guide
- https://help.elevenlabs.io/hc/en-us/articles/19571824571921-API-Error-Code-429 - Error 429 documentation
- https://help.elevenlabs.io/hc/en-us/articles/19572237925521-API-Error-Code-400-or-401 - Error 400/401 documentation
- https://www.npmjs.com/package/elevenlabs - Official npm package
- https://github.com/elevenlabs/elevenlabs-js - Official JavaScript SDK
- Various NestJS integration guides and best practices articles (2025)