import { Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { LangGraphStreamingService } from './services/langraph-streaming.service';

/**
 * MessagingModule with LangGraph streaming integration
 *
 * This module provides:
 * - Redis pub/sub messaging capabilities
 * - LangGraph-compatible streaming for conversation flows
 * - Real-time event distribution for agent interactions
 * - Scalable message broadcasting across multiple instances
 */
@Module({
  providers: [RedisService, LangGraphStreamingService],
  exports: [RedisService, LangGraphStreamingService],
})
export class MessagingModule {}
