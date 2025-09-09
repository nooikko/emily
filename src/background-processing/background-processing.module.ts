import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQConnectionService } from './services/rabbitmq-connection.service';
import { QueueManagerService } from './services/queue-manager.service';
import { QueueHealthMonitorService } from './services/queue-health-monitor.service';

/**
 * Background Processing Module
 * 
 * Provides comprehensive background task processing using RabbitMQ and LangChain async patterns.
 * Implements enterprise-grade message queuing with priority-based routing, retry mechanisms,
 * dead letter queue handling, and comprehensive health monitoring.
 * 
 * Features:
 * - RabbitMQ integration with connection pooling and reconnection handling
 * - Priority-based task queues (CRITICAL, HIGH, NORMAL, LOW)
 * - Exponential backoff retry mechanisms with jitter
 * - Dead letter queue processing for failed tasks
 * - Real-time health monitoring with alerting
 * - Comprehensive metrics collection and reporting
 * - Event-driven task lifecycle management
 * - Automatic queue topology initialization
 * - Worker process management with graceful shutdown
 * - Production-ready error handling and logging
 * 
 * This module enables:
 * - Enqueueing tasks with priority-based routing
 * - Creating consumers with custom processing logic
 * - Monitoring queue health and performance metrics
 * - Handling task failures with intelligent retry strategies
 * - Scaling workers based on queue depth and throughput
 * - Integration with LangChain async chains and callbacks
 * 
 * Usage Example:
 * ```typescript
 * // Enqueue a task
 * const messageId = await queueManager.enqueueTask('process-document', 
 *   { documentId: '123' }, 
 *   { priority: TaskPriority.HIGH }
 * );
 * 
 * // Create a consumer
 * await queueManager.createConsumer('langchain.tasks.high', async (message) => {
 *   // Process the task
 *   return await processDocument(message.payload);
 * });
 * ```
 * 
 * Architecture:
 * - RabbitMQConnectionService: Connection management and topology setup
 * - QueueManagerService: Task enqueueing, consumer management, and processing
 * - QueueHealthMonitorService: Health monitoring, alerting, and metrics collection
 * - Event-driven architecture with EventEmitter2 for lifecycle events
 * - Scheduled health checks and reporting with @nestjs/schedule
 * - Configuration management with @nestjs/config for environment-based settings
 */
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    RabbitMQConnectionService,
    QueueManagerService,
    QueueHealthMonitorService,
  ],
  exports: [
    RabbitMQConnectionService,
    QueueManagerService,
    QueueHealthMonitorService,
  ],
})
export class BackgroundProcessingModule {
  /**
   * Module initialization
   * 
   * This module can be imported into other modules that need background processing
   * capabilities, such as:
   * - DocumentModule (for document processing pipelines)
   * - AgentModule (for LangChain chain execution)
   * - NotificationModule (for email/webhook delivery)
   * - AnalyticsModule (for data processing and aggregation)
   * 
   * The module provides:
   * 1. Task enqueueing with priority-based routing
   * 2. Consumer creation and management
   * 3. Health monitoring and alerting
   * 4. Retry mechanisms with exponential backoff
   * 5. Dead letter queue handling
   * 6. Performance metrics and reporting
   * 7. Event-driven lifecycle management
   * 8. Production-ready error handling
   */
}