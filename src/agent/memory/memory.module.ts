import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { ThreadsModule } from '../../threads/threads.module';
import { VectorsModule } from '../../vectors/vectors.module';
import { MemoryService } from './memory.service';
import { ConversationSummaryMemory } from './conversation-summary.memory';
import { EntityMemory } from './entity.memory';

@Module({
  imports: [
    VectorsModule,
    DatabaseConfigModule,
    // Import ThreadsModule to enable auto-thread creation integration
    ThreadsModule,
  ],
  providers: [
    MemoryService,
    ConversationSummaryMemory,
    EntityMemory,
  ],
  exports: [
    MemoryService,
    ConversationSummaryMemory,
    EntityMemory,
  ],
})
export class MemoryModule {}
