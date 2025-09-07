import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { ThreadsModule } from '../../threads/threads.module';
import { VectorsModule } from '../../vectors/vectors.module';
import { ConversationSummaryMemory } from './conversation-summary.memory';
import { EntityMemory } from './entity.memory';
import { MemoryService } from './memory.service';
import { TimeWeightedVectorStoreRetriever } from './time-weighted-retriever';

@Module({
  imports: [
    VectorsModule,
    DatabaseConfigModule,
    // Import ThreadsModule to enable auto-thread creation integration
    ThreadsModule,
  ],
  providers: [MemoryService, ConversationSummaryMemory, EntityMemory, TimeWeightedVectorStoreRetriever],
  exports: [MemoryService, ConversationSummaryMemory, EntityMemory, TimeWeightedVectorStoreRetriever],
})
export class MemoryModule {}
