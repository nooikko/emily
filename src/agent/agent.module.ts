import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../infisical/database-config.module';
import { ModelConfigModule } from '../infisical/model-config.module';
import { LangSmithModule } from '../langsmith/langsmith.module';
import { ReactAgent } from './implementations/react.agent';
import { MemoryModule } from './memory/memory.module';

@Module({
  imports: [MemoryModule, DatabaseConfigModule, ModelConfigModule, LangSmithModule],
  controllers: [],
  providers: [ReactAgent],
  exports: [ReactAgent],
})
export class AgentModule {}
