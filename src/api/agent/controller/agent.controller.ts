import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Sse, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { TraceHTTP } from 'src/observability/decorators/trace.decorator';
import { StructuredLoggerService } from 'src/observability/services/structured-logger.service';
import { BadRequestErrorDto, InternalServerErrorDto, NotFoundErrorDto, ValidationErrorDto } from '../../../common/dto/error.dto';
import { MessageDto, type SseMessageDto } from '../dto/message.dto';
import { MessageResponseDto } from '../dto/message.response.dto';
import { SseMessage } from '../dto/sse.dto';
import { AgentService } from '../service/agent/agent.service';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  private readonly logger = new StructuredLoggerService(AgentController.name);

  constructor(private agentService: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Send a message to the AI agent',
    description: 'Sends a message to the AI agent and receives a response. Supports text and image inputs with multi-modal capabilities.',
  })
  @ApiBody({
    description: 'Message containing thread ID, sender type, and content array',
    type: MessageDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Message processed successfully and AI response generated',
    type: MessageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid message format, validation failed, or missing required fields',
    type: ValidationErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during message processing',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'POST /agent/chat' })
  async chat(@Body() messageDto: MessageDto): Promise<MessageResponseDto> {
    this.logger.logInfo(`Incoming chat request for thread: ${messageDto.threadId}`);

    try {
      const response = await this.agentService.chat(messageDto);

      this.logger.logInfo(`Chat request completed for thread: ${messageDto.threadId}`);

      return response;
    } catch (error) {
      this.logger.error('Chat request failed', {
        threadId: messageDto.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Sse('stream')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Stream agent responses via Server-Sent Events',
    description: 'Establishes an SSE connection to stream AI agent responses in real-time with live token streaming',
  })
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'threadId',
    description: 'Unique identifier for the conversation thread',
    required: true,
    type: 'string',
    format: 'uuid',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'type',
    description: 'Type of message sender',
    required: true,
    enum: ['human'],
    example: 'human',
  })
  @ApiQuery({
    name: 'content',
    description: 'Message content to send to the agent',
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 10000,
    example: 'Hello, how can you help me today?',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE connection established successfully, streaming AI responses',
    type: SseMessage,
    headers: {
      'Content-Type': {
        description: 'Event stream content type',
        schema: { type: 'string', example: 'text/event-stream' },
      },
      'Cache-Control': {
        description: 'Disable caching for streaming',
        schema: { type: 'string', example: 'no-cache' },
      },
      Connection: {
        description: 'Keep connection alive for streaming',
        schema: { type: 'string', example: 'keep-alive' },
      },
      'Access-Control-Allow-Origin': {
        description: 'CORS policy for streaming endpoints',
        schema: { type: 'string', example: '*' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters, validation failed, or missing required fields',
    type: ValidationErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during stream setup',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'SSE /agent/stream' })
  async stream(@Query() messageDto: SseMessageDto): Promise<Observable<SseMessage>> {
    this.logger.logInfo('SSE stream request');
    const _streamContext = {
      threadId: messageDto.threadId,
      contentLength: messageDto.content?.length || 0,
    };

    try {
      return await this.agentService.stream(messageDto);
    } catch (error) {
      this.logger.error('SSE stream request failed', {
        threadId: messageDto.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Get('history/:threadId')
  @ApiOperation({
    summary: 'Retrieve conversation history',
    description: 'Fetches the complete conversation history for a specific thread including all messages and metadata',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Unique identifier for the conversation thread',
    required: true,
    type: 'string',
    format: 'uuid',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation history retrieved successfully',
    type: [MessageResponseDto],
    isArray: true,
    schema: {
      type: 'array',
      items: {
        $ref: '#/components/schemas/MessageResponseDto',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid thread ID format',
    type: BadRequestErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Thread not found or no conversation history available',
    type: NotFoundErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while retrieving conversation history',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'GET /agent/history/:threadId' })
  async getHistory(@Param('threadId', ParseUUIDPipe) threadId: string): Promise<MessageResponseDto[]> {
    this.logger.logInfo(`History request for thread: ${threadId}`);

    try {
      const history = await this.agentService.getHistory(threadId);

      this.logger.logInfo(`History retrieved: ${history.length} messages`);
      const _historyContext = {
        threadId,
        messageCount: history.length,
      };

      return history;
    } catch (error) {
      this.logger.error('History retrieval failed', {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
