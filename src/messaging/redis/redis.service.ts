import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { Observable } from 'rxjs';
import type { IMessagingService } from '../imessaging.service';

/**
 * Redis configuration interface with proper typing
 */
interface RedisConnectionConfig {
  readonly username: string;
  readonly password: string;
  readonly socket: {
    readonly host: string;
    readonly port: number;
  };
}

/**
 * Redis connection state interface for monitoring
 */
interface RedisConnectionState {
  publisher: {
    connected: boolean;
    lastError?: Error;
  };
  subscriber: {
    connected: boolean;
    lastError?: Error;
  };
  lastConnectionAttempt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, IMessagingService {
  private readonly logger = new Logger(RedisService.name);
  private publisher!: RedisClientType;
  private subscriber!: RedisClientType;
  private connectionState: RedisConnectionState = {
    publisher: { connected: false },
    subscriber: { connected: false },
    lastConnectionAttempt: 0,
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.connectionState.lastConnectionAttempt = Date.now();

    const redisConfig: RedisConnectionConfig = {
      username: this.configService.get<string>('REDIS_USERNAME') || 'default',
      password: this.configService.get<string>('REDIS_PASSWORD') || '',
      socket: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
      },
    };

    try {
      this.publisher = createClient(redisConfig);
      this.subscriber = createClient(redisConfig);

      this.publisher.on('error', (err: Error) => {
        this.logger.error('Redis Publisher Client Error', err);
        this.connectionState = {
          ...this.connectionState,
          publisher: { connected: false, lastError: err },
        };
      });

      this.subscriber.on('error', (err: Error) => {
        this.logger.error('Redis Subscriber Client Error', err);
        this.connectionState = {
          ...this.connectionState,
          subscriber: { connected: false, lastError: err },
        };
      });

      await this.publisher.connect();
      await this.subscriber.connect();

      this.connectionState = {
        publisher: { connected: true },
        subscriber: { connected: true },
        lastConnectionAttempt: Date.now(),
      };

      this.logger.log('Redis clients connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      // Don't throw - let InitializationService handle retry logic
    }
  }

  async ping(): Promise<void> {
    if (!this.publisher || !this.isConnected()) {
      throw new Error('Redis not connected');
    }
    await this.publisher.ping();
  }

  /**
   * Check if Redis clients are connected
   */
  isConnected(): boolean {
    return this.connectionState.publisher.connected && this.connectionState.subscriber.connected;
  }

  /**
   * Get connection state for monitoring
   */
  getConnectionState(): RedisConnectionState {
    return { ...this.connectionState };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.publisher) {
        await this.publisher.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }

      this.connectionState = {
        publisher: { connected: false },
        subscriber: { connected: false },
        lastConnectionAttempt: this.connectionState.lastConnectionAttempt,
      };

      this.logger.log('Redis clients disconnected successfully');
    } catch (error) {
      this.logger.error('Error during Redis disconnect:', error);
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Redis publisher not connected');
    }
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
