import { Body, Controller, Get, Param, Post, Query, Sse, UsePipes, ValidationPipe } from '@nestjs/common';
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
import { MessageDto, type SseMessageDto } from '../dto/message.dto';
import { MessageResponseDto } from '../dto/message.response.dto';
import { SseMessage } from '../dto/sse.dto';
import { AgentService } from '../service/agent/agent.service';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private agentService: AgentService) {}

  @Post('chat')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({
    summary: 'Send a message to the AI agent',
    description: 'Sends a message to the AI agent and receives a response. Supports text and image inputs.',
  })
  @ApiBody({
    description: 'Message to send to the agent',
    type: MessageDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully processed the message and returned a response',
    type: MessageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid message format or missing required fields',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while processing the message',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Internal server error' },
        error: { type: 'string', example: 'Internal Server Error' },
      },
    },
  })
  async chat(@Body() messageDto: MessageDto): Promise<MessageResponseDto> {
    return await this.agentService.chat(messageDto);
  }

  @Sse('stream')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({
    summary: 'Stream agent responses via Server-Sent Events',
    description: 'Establishes an SSE connection to stream AI agent responses in real-time',
  })
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'threadId',
    description: 'Unique identifier for the conversation thread',
    required: true,
    type: 'string',
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
    example: 'Hello, how can you help me today?',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully established SSE connection and streaming responses',
    type: SseMessage,
    headers: {
      'Content-Type': {
        description: 'Event stream content type',
        example: 'text/event-stream',
      },
      'Cache-Control': {
        description: 'Disable caching for streaming',
        example: 'no-cache',
      },
      Connection: {
        description: 'Keep connection alive',
        example: 'keep-alive',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or missing required fields',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  async stream(@Query() messageDto: SseMessageDto): Promise<Observable<SseMessage>> {
    return await this.agentService.stream(messageDto);
  }

  @Get('history/:threadId')
  @ApiOperation({
    summary: 'Retrieve conversation history',
    description: 'Fetches the complete conversation history for a specific thread',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Unique identifier for the conversation thread',
    required: true,
    type: 'string',
    example: 'thread-123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved conversation history',
    type: [MessageResponseDto],
    schema: {
      type: 'array',
      items: {
        $ref: '#/components/schemas/MessageResponseDto',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Thread not found or no history available',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Thread not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while retrieving history',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Internal server error' },
        error: { type: 'string', example: 'Internal Server Error' },
      },
    },
  })
  async getHistory(@Param('threadId') threadId: string): Promise<MessageResponseDto[]> {
    return await this.agentService.getHistory(threadId);
  }
}
