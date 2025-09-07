import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '../../infisical/database-config.module';
import { ThreadsModule } from '../../threads/threads.module';
import { VectorsModule } from '../../vectors/vectors.module';
import { ConversationSummaryMemory } from './conversation-summary.memory';
import { EntityMemory } from './entity.memory';
import { GraphMemory } from './graph.memory';
import { MemoryService } from './memory.service';
import { MemoryConsolidationService } from './memory-consolidation.service';
import { TimeWeightedVectorStoreRetriever } from './time-weighted-retriever';

@Module({
  imports: [
    VectorsModule,
    DatabaseConfigModule,
    // Import ThreadsModule to enable auto-thread creation integration
    ThreadsModule,
  ],
  providers: [MemoryService, ConversationSummaryMemory, EntityMemory, TimeWeightedVectorStoreRetriever, GraphMemory, MemoryConsolidationService],
  exports: [MemoryService, ConversationSummaryMemory, EntityMemory, TimeWeightedVectorStoreRetriever, GraphMemory, MemoryConsolidationService],
})
export class MemoryModule {}
