import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { MemoryModule } from '../memory/memory.module';
import { LangSmithModule } from '../../langsmith/langsmith.module';
import { SpecialistAgentsFactory } from './specialist-agents.factory';
import { SpecialistAgentsService } from './specialist-agents.service';
import { SupervisorGraph } from './supervisor.graph';
import { SupervisorService } from './supervisor.service';

/**
 * Module for multi-agent orchestration capabilities
 * Provides specialist agents, supervisor orchestration, and state management
 */
@Module({
  imports: [
    DatabaseConfigModule,
    MemoryModule,
    LangSmithModule,
  ],
  providers: [
    SpecialistAgentsFactory,
    SpecialistAgentsService, 
    SupervisorGraph,
    SupervisorService,
  ],
  exports: [
    SpecialistAgentsService,
    SupervisorService,
    SupervisorGraph,
  ],
})
export class OrchestrationModule {}