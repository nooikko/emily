import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ReactAgent } from 'src/agent/implementations/react.agent';
import type { ChatConfig } from 'src/agent/memory/types';
import { RedisService } from 'src/messaging/redis/redis.service';
import { TraceAI } from 'src/observability/decorators/trace.decorator';
import { StructuredLoggerService } from 'src/observability/services/structured-logger.service';
import type { MessageDto, SseMessageDto } from '../../dto/message.dto';
import type { ApiMessageContent, MessageResponseDto } from '../../dto/message.response.dto';
import type { SseMessage } from '../../dto/sse.dto';
import { MessageUtil } from '../../utils/message.util';
import type { IAgentService } from '../iagent.service';

// Type guard and error utilities for proper error handling
interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as ErrorWithMessage).message === 'string';
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) {
    return maybeError;
  }

  if (maybeError instanceof Error) {
    return maybeError;
  }

  if (typeof maybeError === 'string') {
    return new Error(maybeError);
  }

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // Fallback if JSON.stringify fails (circular refs, etc.)
    return new Error(String(maybeError));
  }
}

function getErrorMessage(error: unknown): string {
  return toErrorWithMessage(error).message;
}

@Injectable()
export class AgentService implements IAgentService {
  private readonly logger = new StructuredLoggerService(AgentService.name);

  constructor(
    private agent: ReactAgent,
    private redisService: RedisService,
  ) {}

  @TraceAI({ name: 'chat' })
  async chat(messageDto: MessageDto): Promise<MessageResponseDto> {
    const messages = MessageUtil.toHumanMessages(messageDto);
    const config = {
      configurable: { thread_id: messageDto.threadId },
    };

    this.logger.logInfo(`Starting chat conversation for thread: ${messageDto.threadId}`);

    try {
      const message = await this.agent.chat(
        {
          messages,
        },
        config,
      );
      if (!message) {
        throw new BadRequestException('No response from agent');
      }

      this.logger.logInfo(`Chat conversation completed for thread: ${messageDto.threadId}`);

      return {
        id: message.id || 'unknown',
        type: message.getType() as 'human' | 'ai' | 'tool',
        content: message.content as ApiMessageContent,
      };
    } catch (error: unknown) {
      this.logger.error('Error in chat conversation', {
        error: getErrorMessage(error),
        threadId: messageDto.threadId,
      });
      throw new BadRequestException(getErrorMessage(error) || 'An error occurred while processing your request.');
    }
  }

  @TraceAI({ name: 'stream' })
  async stream(message: SseMessageDto): Promise<Observable<SseMessage>> {
    const channel = `agent-stream:${message.threadId}`;

    this.logger.logInfo(`Starting SSE stream on channel: ${channel}`);

    // Start streaming to Redis in the background
    this.streamMessagesToRedis(
      [new HumanMessage(message.content)],
      {
        configurable: { thread_id: message.threadId },
        streamMode: 'messages',
      },
      channel,
    );

    // Return an Observable that subscribes to the Redis channel
    return this.redisService.subscribe(channel).pipe(map((msg) => JSON.parse(msg) as SseMessage));
  }

  private async streamMessagesToRedis(messages: BaseMessage[], config: ChatConfig, channel: string) {
    try {
      const streams = await this.agent.stream({ messages }, config);

      for await (const chunk of streams) {
        if (!chunk) {
          continue;
        }

        const messageChunks = Array.isArray(chunk) ? chunk.filter((item) => item?.constructor?.name === 'AIMessageChunk') : [];

        for (const messageChunk of messageChunks) {
          await this.redisService.publish(
            channel,
            JSON.stringify({
              data: {
                id: messageChunk.id,
                type: messageChunk.getType() as 'human' | 'ai' | 'tool',
                content: messageChunk.content,
              },
              type: 'message',
            }),
          );
        }
      }

      await this.redisService.publish(channel, JSON.stringify({ data: { id: 'done', content: '' }, type: 'done' }));
    } catch (error: unknown) {
      this.logger.error('Error in streamMessagesToRedis:', error);
      await this.redisService.publish(channel, JSON.stringify({ type: 'error', data: { message: getErrorMessage(error) } }));
    }
  }

  async getHistory(threadId: string): Promise<MessageResponseDto[]> {
    try {
      const history = await this.agent.getHistory(threadId);
      return history
        .map((msg: BaseMessage) => ({
          id: msg.id || 'unknown', // Ensure id is always present
          type: msg.getType() as 'human' | 'ai' | 'tool',
          content: msg.content as ApiMessageContent,
        }))
        .filter((msg) => msg.content); // Filter out messages without content
    } catch (error: unknown) {
      this.logger.error('Error fetching history:', error);
      throw new BadRequestException(getErrorMessage(error) || 'An error occurred while fetching history.');
    }
  }
}
