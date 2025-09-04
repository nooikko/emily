# Research: NestJS OpenAPI/Swagger Implementation
Date: 2025-09-01
Requested by: User

## Summary
Research into NestJS OpenAPI/Swagger implementation for the Emily AI Agent project, including current state assessment, best practices, and complete implementation requirements.

## Prior Research
No prior AI_RESEARCH files found for NestJS Swagger implementation.

## Current Implementation Assessment

### What's Already Configured
1. **Package Already Installed**: `@nestjs/swagger@11.2.0` is already listed in package.json dependencies
2. **Controller Decorators Present**: The `AgentController` already uses some Swagger decorators:
   - `@ApiTags('Agent')` - Groups endpoints under "Agent" tag
   - `@ApiOperation()` - Provides operation summaries
   - `@ApiResponse()` - Documents response types for some endpoints
3. **Import Structure**: Controller properly imports decorators from `@nestjs/swagger`

### What's Currently Missing
1. **SwaggerModule Configuration**: No SwaggerModule setup found in `src/main.ts`
2. **DTO Decorators**: DTOs lack `@ApiProperty` decorators:
   - `MessageDto` - No OpenAPI decorators
   - `MessageContentDto` - No OpenAPI decorators  
   - `SseMessageDto` - No OpenAPI decorators
   - `MessageResponseDto` - No OpenAPI decorators
   - `SseMessage` - No OpenAPI decorators
3. **Swagger UI Endpoints**: No /api-json or /api endpoints configured
4. **Documentation Builder**: No DocumentBuilder configuration for API metadata

## Current Findings

### Required Package Installation
**Already Installed**: `@nestjs/swagger@11.2.0` is present in dependencies
**Missing**: `swagger-ui-express` is not listed but may be bundled with @nestjs/swagger

### SwaggerModule Configuration for main.ts
Based on NestJS official documentation, the following configuration should be added to `src/main.ts`:

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

// Add after app creation and before app.listen()
const config = new DocumentBuilder()
  .setTitle('Emily AI Agent API')
  .setDescription('Personal AI assistant API with chat, streaming, and memory capabilities')
  .setVersion('0.0.1')
  .addTag('Agent', 'AI agent chat and conversation endpoints')
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  }, 'JWT-auth')
  .addServer('http://localhost:3001', 'Development server')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document, {
  jsonDocumentUrl: 'api-json',
  customSiteTitle: 'Emily AI Agent API Documentation',
});
```

### Essential DTO Decorators Required

#### MessageDto
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ 
    description: 'Unique thread identifier for conversation context',
    example: 'thread_abc123' 
  })
  threadId: string;

  @ApiProperty({ 
    enum: ['human'], 
    description: 'Message type indicator',
    example: 'human' 
  })
  type: 'human';

  @ApiProperty({ 
    type: [MessageContentDto], 
    description: 'Array of message content (text, images, etc.)' 
  })
  content: MessageContentDto[];
}
```

#### MessageContentDto
```typescript
export class MessageContentDto {
  @ApiProperty({ 
    enum: ['text', 'image_url'], 
    description: 'Content type indicator' 
  })
  type: 'text' | 'image_url';

  @ApiProperty({ 
    required: false, 
    description: 'Text content (required if type is text)',
    example: 'Hello, how can you help me today?' 
  })
  text?: string;

  @ApiProperty({ 
    required: false, 
    description: 'Image URL (required if type is image_url)',
    example: 'https://example.com/image.jpg' 
  })
  imageUrl?: string;

  @ApiProperty({ 
    enum: ['auto', 'low', 'high'], 
    required: false, 
    description: 'Image quality setting for processing' 
  })
  detail?: 'auto' | 'low' | 'high';
}
```

#### MessageResponseDto
```typescript
export class MessageResponseDto {
  @ApiProperty({ 
    description: 'Unique message identifier',
    example: 'msg_xyz789' 
  })
  id: string;

  @ApiProperty({ 
    enum: ['human', 'ai', 'tool'], 
    description: 'Message type indicator' 
  })
  type: 'human' | 'ai' | 'tool';

  @ApiProperty({ 
    description: 'Message content from LangChain core',
    example: 'Hello! I can help you with various tasks...' 
  })
  content: MessageContent;
}
```

### Controller Enhancements Needed

The `AgentController` needs additional decorators:

```typescript
@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  @Post('chat')
  @ApiOperation({ 
    summary: 'Chat with the agent',
    description: 'Send a message to the AI agent and receive a response' 
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Successful response from agent',
    type: MessageResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - invalid message format' 
  })
  async chat(@Body() messageDto: MessageDto): Promise<MessageResponseDto> {
    return await this.agentService.chat(messageDto);
  }

  @Sse('stream')
  @ApiOperation({ 
    summary: 'Stream agent responses',
    description: 'Get real-time streaming responses from the AI agent' 
  })
  @ApiQuery({ 
    name: 'threadId', 
    required: true, 
    description: 'Thread ID for conversation context' 
  })
  @ApiQuery({ 
    name: 'content', 
    required: true, 
    description: 'Message content to send to agent' 
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a stream of agent responses',
    type: SseMessage,
  })
  async stream(@Query() messageDto: SseMessageDto): Promise<Observable<SseMessage>> {
    return await this.agentService.stream(messageDto);
  }

  @Get('history/:threadId')
  @ApiOperation({ 
    summary: 'Get chat history',
    description: 'Retrieve conversation history for a specific thread' 
  })
  @ApiParam({ 
    name: 'threadId', 
    description: 'Thread ID to get history for',
    example: 'thread_abc123' 
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the chat history',
    type: [MessageResponseDto],
  })
  @ApiResponse({
    status: 404,
    description: 'Thread not found'
  })
  async getHistory(@Param('threadId') threadId: string): Promise<MessageResponseDto[]> {
    return await this.agentService.getHistory(threadId);
  }
}
```

### Configuration Options for External Type Generation

For optimal compatibility with external type generation tools:

```typescript
const config = new DocumentBuilder()
  .setTitle('Emily AI Agent API')
  .setDescription('Personal AI assistant API')
  .setVersion('0.0.1')
  .addTag('Agent')
  .build();

const document = SwaggerModule.createDocument(app, config, {
  operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  deepScanRoutes: true,
});

SwaggerModule.setup('api', app, document, {
  jsonDocumentUrl: 'api-json',
  swaggerOptions: {
    persistAuthorization: true,
  },
});
```

### Security Documentation (Bearer Auth)

For future authentication needs:
```typescript
.addBearerAuth({
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  name: 'JWT',
  description: 'Enter JWT token',
  in: 'header',
}, 'JWT-auth')
```

Then use `@ApiBearerAuth('JWT-auth')` on protected endpoints.

## Key Takeaways

- **@nestjs/swagger@11.2.0 already installed** - No package installation needed
- **SwaggerModule setup completely missing** from main.ts
- **DTO decorators missing** across all data transfer objects  
- **Controller partially documented** - some decorators present, others missing
- **Global prefix already set** to 'api' in main.ts - Swagger UI should be at '/api'
- **CORS already configured** for localhost:3000 and localhost:3001
- **No breaking changes expected** - straightforward enhancement of existing code

## Implementation Steps Required

1. **Configure SwaggerModule in main.ts** - Add DocumentBuilder and SwaggerModule.setup()
2. **Add @ApiProperty decorators** to all DTO classes with descriptions and examples
3. **Enhance controller decorators** - Add @ApiParam, @ApiQuery, @ApiBody where needed
4. **Add comprehensive @ApiResponse** decorators for all status codes
5. **Test endpoints** at http://localhost:3001/api (Swagger UI) and http://localhost:3001/api-json (OpenAPI spec)

## Potential Issues

- **Type compatibility** with LangChain MessageContent type in MessageResponseDto
- **SSE streaming documentation** may need special handling for real-time responses
- **Thread ID validation** not documented in current DTOs

## Sources
- Official NestJS Documentation: https://docs.nestjs.com/openapi/introduction
- @nestjs/swagger npm package: https://www.npmjs.com/package/@nestjs/swagger
- NestJS Swagger GitHub repository: https://github.com/nestjs/swagger
- Current codebase analysis: /home/quinn/agentilator-emily/src/