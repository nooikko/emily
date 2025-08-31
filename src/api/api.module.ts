import { Module } from '@nestjs/common';
import { ReactAgent } from 'src/agent/implementations/react.agent';
import { RedisService } from 'src/messaging/redis/redis.service';
import { AgentController } from './agent/controller/agent.controller';
import { AgentService } from './agent/service/agent/agent.service';

@Module({
  imports: [],
  controllers: [AgentController],
  providers: [AgentService, RedisService, ReactAgent],
})
export class ApiModule {}
