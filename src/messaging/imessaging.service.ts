import type { Observable } from 'rxjs';

export interface IMessagingService {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string): Observable<string>;
}
