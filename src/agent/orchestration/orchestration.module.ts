import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupervisorGraph } from './supervisor.graph';
import { SupervisorService } from './supervisor.service';

@Module({
  imports: [ConfigModule],
  providers: [
    SupervisorGraph,
    SupervisorService,
  ],
  exports: [
    SupervisorService,
  ],
})
export class OrchestrationModule {}