import { Module } from '@nestjs/common';
import { ReactAgent } from './implementations/react.agent';
import { MemoryModule } from './memory/memory.module';

@Module({
  imports: [MemoryModule],
  controllers: [],
  providers: [ReactAgent],
  exports: [ReactAgent],
})
export class AgentModule {}
