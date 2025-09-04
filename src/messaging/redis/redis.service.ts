import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { Observable } from 'rxjs';
import type { IMessagingService } from '../imessaging.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, IMessagingService {
  private readonly logger = new Logger(RedisService.name);
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private isConnected = false;

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

    try {
      this.publisher = createClient(redisConfigs);
      this.subscriber = createClient(redisConfigs);

      this.publisher.on('error', (err) => {
        this.logger.error('Redis Publisher Client Error', err);
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        this.logger.error('Redis Subscriber Client Error', err);
        this.isConnected = false;
      });

      await this.publisher.connect();
      await this.subscriber.connect();
      this.isConnected = true;
      this.logger.log('Redis clients connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      // Don't throw - let InitializationService handle retry logic
    }
  }

  async ping(): Promise<void> {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.publisher.ping();
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
