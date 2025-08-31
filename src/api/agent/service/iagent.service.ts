import type { Observable } from 'rxjs';
import type { MessageDto, SseMessageDto } from '../dto/message.dto';
import type { MessageResponseDto } from '../dto/message.response.dto';
import type { SseMessage } from '../dto/sse.dto';

export interface IAgentService {
  chat(message: MessageDto): Promise<MessageResponseDto>;
  stream(message: SseMessageDto): Promise<Observable<SseMessage>>;
  getHistory(threadId: string): Promise<MessageResponseDto[]>;
}
