import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemoryModule } from '../agent/memory/memory.module';
import { StructuredLoggerService } from '../observability/services/structured-logger.service';
import { ConversationThread } from './entities/conversation-thread.entity';
import { ThreadCategory } from './entities/thread-category.entity';
import { ThreadMessage } from './entities/thread-message.entity';
import { ConversationStateService } from './services/conversation-state.service';
import { ThreadMemorySharingService } from './services/thread-memory-sharing.service';
import { ThreadSummaryService } from './services/thread-summary.service';
import { ThreadsService } from './services/threads.service';
import { ThreadsController } from './threads.controller';

/**
 * ThreadsModule provides conversation thread management functionality with LangGraph integration
 *
 * This module includes:
 * - Thread CRUD operations
 * - Advanced querying and search
 * - Thread categorization
 * - Message tracking and statistics
 * - LangGraph conversation state management
 * - Conversation flow orchestration
 * - Integration with existing memory systems
 * - Advanced conversation summarization with ConversationSummaryMemory
 * - Multiple summarization strategies for different conversation types
 * - Summary-based retrieval for long conversations
 *
 * The module is designed to be self-contained with its own entities,
 * services, and controllers while integrating seamlessly with the
 * existing application architecture and providing LangGraph-compatible
 * conversation state management.
 */
@Module({
  imports: [
    // Register TypeORM entities for this module
    TypeOrmModule.forFeature([ConversationThread, ThreadMessage, ThreadCategory]),
    // Import MemoryModule for ConversationSummaryMemory
    forwardRef(() => MemoryModule),
  ],
  controllers: [ThreadsController],
  providers: [
    ThreadsService, 
    ConversationStateService, 
    ThreadSummaryService, 
    ThreadMemorySharingService, 
    StructuredLoggerService,
    // Optional memory service provider - will be injected from MemoryModule if available
    {
      provide: 'MEMORY_SERVICE',
      useFactory: () => null, // Default to null if not provided elsewhere
    },
  ],
  exports: [
    // Export services for use in other modules (e.g., agent module)
    ThreadsService,
    ConversationStateService,
    ThreadSummaryService,
    ThreadMemorySharingService,
    // Export TypeORM repositories for direct access if needed
    TypeOrmModule,
  ],
})
export class ThreadsModule {}
