import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { Observable } from 'rxjs';
import type { IMessagingService } from '../imessaging.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, IMessagingService {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfigs = {
      username: this.configService.get<string>('REDIS_USERNAME') || 'default',
      password: this.configService.get<string>('REDIS_PASSWORD') || '',
      socket: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
      },
    };
    this.publisher = createClient(redisConfigs);
    this.subscriber = createClient(redisConfigs);
    await this.publisher.connect();
    await this.subscriber.connect();
  }

  async onModuleDestroy() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }

  async publish(channel: string, message: string) {
    await this.publisher.publish(channel, message);
  }

  subscribe(channel: string): Observable<string> {
    return new Observable<string>((subscriber) => {
      const messageHandler = (msg: string) => subscriber.next(msg);
      this.subscriber.subscribe(channel, messageHandler);

      // Cleanup on unsubscribe
      return () => {
        this.subscriber.unsubscribe(channel, messageHandler);
      };
    });
  }
}
