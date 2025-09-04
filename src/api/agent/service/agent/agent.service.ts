import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ReactAgent } from 'src/agent/implementations/react.agent';
import type { ChatConfig } from 'src/agent/memory/types';
import { RedisService } from 'src/messaging/redis/redis.service';
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
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string';
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) {
    return maybeError;
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
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private agent: ReactAgent,
    private redisService: RedisService,
  ) {}

  async chat(messageDto: MessageDto): Promise<MessageResponseDto> {
    const messages = MessageUtil.toHumanMessages(messageDto);
    const config = {
      configurable: { thread_id: messageDto.threadId },
    };
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
      return {
        id: message.id || 'unknown',
        type: message.getType() as 'human' | 'ai' | 'tool',
        content: message.content as ApiMessageContent,
      };
    } catch (error: unknown) {
      this.logger.error('Error in chat:', error);
      throw new BadRequestException(getErrorMessage(error) || 'An error occurred while processing your request.');
    }
  }

  async stream(message: SseMessageDto): Promise<Observable<SseMessage>> {
    const channel = `agent-stream:${message.threadId}`;
    // You may want to save the thread ID  or associate it with a user for later retrieval
    this.logger.log(`Streaming messages to channel: ${channel}`);
    // These entities are provide (ThreadEntity, UserEntity) in the src/api/agent/entity directory
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

  private async streamMessagesToRedis(
    messages: BaseMessage[],
    config: ChatConfig,
    channel: string,
  ) {
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
