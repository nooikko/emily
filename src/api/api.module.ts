import { Module } from '@nestjs/common';
import { AgentModule } from 'src/agent/agent.module';
import { RedisService } from 'src/messaging/redis/redis.service';
import { AgentController } from './agent/controller/agent.controller';
import { AgentService } from './agent/service/agent/agent.service';

@Module({
  imports: [AgentModule],
  controllers: [AgentController],
  providers: [AgentService, RedisService],
})
export class ApiModule {}
