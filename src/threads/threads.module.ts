import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructuredLoggerService } from '../observability/services/structured-logger.service';
import { ConversationThread } from './entities/conversation-thread.entity';
import { ThreadCategory } from './entities/thread-category.entity';
import { ThreadMessage } from './entities/thread-message.entity';
import { ConversationStateService } from './services/conversation-state.service';
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
  ],
  controllers: [ThreadsController],
  providers: [ThreadsService, ConversationStateService, StructuredLoggerService],
  exports: [
    // Export services for use in other modules (e.g., agent module)
    ThreadsService,
    ConversationStateService,
    // Export TypeORM repositories for direct access if needed
    TypeOrmModule,
  ],
})
export class ThreadsModule {}
